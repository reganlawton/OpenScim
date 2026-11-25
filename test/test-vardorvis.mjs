// Vardorvis loads on his route, is drawn from the trimmed cache (his arena,
// his model, the tendrils, the axes and the head), fights, and dies into the victory
// screen. The mechanics themselves are digested by the determinism harness
// (tools/determinism/scenarios/vardorvis.mjs).
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:8791";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  // A model or an animation missing from the trimmed cache is logged, not thrown.
  page.on("console", (message) => message.text().includes("Empty container") && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'vardorvis') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/vardorvis/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/vardorvis/");
  await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcLoaded() && scene.npcInstanceManager.instanceRegistry.size > 0, null, { timeout: 60000 });

  // Ticked to his first tendrils, axes and head: every one is drawn. A head comes
  // with an axe cycle only two times in three, so he is kept at his hitpoints
  // while the test waits for one: the player's hits could kill him first.
  const specials = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    engine.injectAction({ type: "attackTarget", targetId: "vardorvis" });
    const seen = new Set();
    for (let tick = 0; tick < 400 && !(seen.has("axe") && seen.has("head") && seen.has("tendril")); tick++) {
      engine.setBossHp(200); // enraged
      engine.advanceTick(engine.player().position);
      for (const id of engine.worldState.actors.keys()) if (id.startsWith("vardorvis-")) seen.add(id.split("-")[1]);
    }
    return [...seen].sort();
  });
  assert.deepEqual(specials, ["axe", "head", "tendril"]);
  for (const npcTypeId of [12223, 12225, 12226, 12227])
    await page.waitForFunction((id) => scene.isNpcTypeLoaded(id), npcTypeId, { timeout: 60000 });

  // Killed; the application's own loop plays his death and ends the fight.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("VARDORVIS DEFEATED"), null, { timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log("Vardorvis loaded on /vardorvis/, was drawn, fought and was won");
} finally {
  await browser.close();
}
