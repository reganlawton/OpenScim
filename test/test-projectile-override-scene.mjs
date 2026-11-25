// The plugin Projectile Override in the application: every projectile it can
// draw loads from the trimmed cache, and with Vardorvis drawn as Zulrah his
// head's gaze flies as Zulrah's ranged projectile (1044), not his own (2521).
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
  page.on("console", (message) => message.text().includes("Empty container") && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'vardorvis') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "(window.scenes ??= []).push(scene);"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }
  // Vardorvis drawn as Zulrah, in the settings the Plugins panel keeps
  // (Grid.js: "osrs-yama-settings"; what is not there takes its default).
  await page.addInitScript(() => {
    if (!localStorage.getItem("osrs-yama-settings")) localStorage.setItem("osrs-yama-settings", JSON.stringify({ projectileOverride: { vardorvis: "zulrah" } }));
  });
  await page.goto(origin + "/vardorvis/");
  await page.waitForFunction(() => window.engine && window.scenes, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  // More than one scene of the fight may be built; the one drawn is the one that loads.
  await page.waitForFunction(() => (window.scene = window.scenes.find((each) => each.isTerrainLoaded() && each.spotAnimRenderer?.boundLoader)), null, { timeout: 120000 });

  // Every projectile the plugin can draw, loaded as a flight that is overridden loads it.
  const missing = await page.evaluate(async () => {
    const { projectileOverrideTargets } = await import("/plugins/projectileOverride.js");
    const renderer = scene.spotAnimRenderer;
    for (const id of projectileOverrideTargets) renderer.xv(renderer.boundLoader, id);
    return projectileOverrideTargets.filter((id) => !renderer.isLoaded(id));
  });
  assert.deepEqual(missing, []);

  // The head's gaze, drawn as Zulrah's ranged projectile.
  const drawn = await page.evaluate(() => {
    const renderer = scene.spotAnimRenderer;
    const seen = new Set();
    const upsert = renderer.upsert.bind(renderer);
    renderer.upsert = (instance) => {
      if (instance.projectile) seen.add(instance.spotAnimId);
      return upsert(instance);
    };
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    engine.setBossHp(200); // a head with every axe cycle
    engine.injectAction({ type: "attackTarget", targetId: "vardorvis" });
    for (let tick = 0; tick < 200 && ![...engine.worldState.actors.keys()].some((id) => id.startsWith("vardorvis-head")); tick++) engine.advanceTick(engine.player().position);
    window.__seen = seen;
    return [...engine.worldState.actors.keys()].some((id) => id.startsWith("vardorvis-head"));
  });
  assert.ok(drawn, "a head rose");
  // The application's own loop draws the flight.
  await page.waitForFunction(() => window.__seen.has(1044), null, { timeout: 60000 });
  assert.ok(!(await page.evaluate(() => window.__seen.has(2521))), "the head's own projectile is not drawn");
  assert.deepEqual(errors, []);
  console.log("Projectile Override loads every projectile it can draw and flies Vardorvis' gaze as Zulrah's");
} finally {
  await browser.close();
}
