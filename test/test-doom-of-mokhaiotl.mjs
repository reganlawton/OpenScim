// The Doom of Mokhaiotl loads on its route: his room, the boss and his
// sequences from the trimmed cache, an attack of his drawn, and the win.
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
  // A group missing from the trimmed cache is logged, not thrown, by the loader.
  page.on("console", (message) => /Empty container/.test(message.text()) && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind.startsWith('doom_of_mokhaiotl')) window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/doom-of-mokhaiotl/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  await page.waitForFunction(() => document.title === "Doom of Mokhaiotl | OpenScim.dev");
  await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcLoaded() && scene.isNpcTypeLoaded(14707), null, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => engine.worldState.actors.get("doom").vitals), { hp: 525, maxHp: 525 });

  // Ten ticks: his first attack (tick 6) is drawn as an "inferno_visual".
  // Then nearly dead, so that the application's own loop ends the fight.
  const visuals = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    let seen = 0;
    for (let tick = 0; tick < 10; tick++) {
      engine.advanceTick(engine.player().position);
      seen += engine.getLastTickEvents().filter((event) => event.type === "inferno_visual").length;
    }
    const boss = engine.worldState.actors.get("doom");
    boss.vitals = { ...boss.vitals, hp: 1 };
    engine.injectAction({ type: "attackTarget", targetId: "doom" });
    return seen;
  });
  assert.ok(visuals > 0, "the boss attacked");
  // A rock can push the player aside and off the boss: he is clicked again, as
  // keepAttacking in tools/determinism/scenarios/doom-of-mokhaiotl.mjs does.
  await page.waitForFunction(() => {
    if (engine.getEncounterOutcome().phase === "active" && engine.player().attackTarget !== "doom") engine.injectAction({ type: "attackTarget", targetId: "doom" });
    return engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("DOOM OF MOKHAIOTL DEFEATED");
  }, null, { timeout: 120000, polling: 600 });

  // Delves 2 to 8: their own room (map square 53,100) and its collision.
  await page.goto(origin + "/doom-of-mokhaiotl/delves-2-8/");
  await page.waitForFunction(() => window.engine?.encounter.kind === "doom_of_mokhaiotl_deep" && window.scene?.isTerrainLoaded(), null, { timeout: 60000 });
  assert.deepEqual(
    await page.evaluate(async () => {
      const { isArenaTileWalkable } = await import("/engine/arena.js");
      return [engine.mechanicsConfig.doomDelve, scene.encounterRenderConfig.terrainMapSquare, isArenaTileWalkable(31, 23), isArenaTileWalkable(19, 28)];
    }),
    ["2", { x: 53, y: 100 }, false, true],
  );
  assert.deepEqual(errors, []);
  console.log("The Doom of Mokhaiotl loaded on /doom-of-mokhaiotl/, attacked, and was won; delves 2-8 load their own room");
} finally {
  await browser.close();
}
