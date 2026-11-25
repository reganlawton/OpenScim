// The Alchemical Hydra loads on its route and is drawn from the trimmed cache
// (its chamber's map square, each of its forms); the vents are drawn erupting
// while they do; a new form is drawn as its own NPC type; it dies into the
// victory screen. The mechanics themselves are digested by the determinism
// harness (tools/determinism/scenarios/alchemical-hydra.mjs) and asserted by
// test/test-alchemical-hydra-rules.mjs.
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
  // A model, an animation or a map square missing from the trimmed cache is logged, not thrown.
  page.on("console", (message) => message.text().includes("Empty container") && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'alchemical_hydra') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/alchemical-hydra/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/alchemical-hydra/");

  // The player starts in the first of its setups (loadouts.js, the wiki's strategies page): the twisted bow and
  // seeking dragon arrows, the Zaryte crossbow and the supplies in a full inventory.
  const setup = await page.evaluate(() => {
    const { equipment, inventory, combatSupplies: supplies } = engine.player();
    return { weapon: equipment.weapon, items: inventory.filter(Boolean).length, ammo: supplies.equippedAmmo.id, crossbow: inventory[0]?.id };
  });
  assert.deepEqual(setup, { weapon: 20997, items: 28, ammo: 33595, crossbow: 26374 });

  // Every form it takes is loaded, its first drawn where it stands.
  const forms = [8615, 8616, 8617, 8618, 8619, 8620, 8621, 8622];
  await page.waitForFunction((forms) => forms.every((id) => scene.isNpcTypeLoaded(id)), forms, { timeout: 60000 });

  // The vents erupt: each drawn as its map object with the eruption's sequence, on its own tile.
  await page.evaluate(() => engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true }));
  const geysers = await page.evaluate(() => {
    for (let tick = 0; tick < 12 && !engine.getEncounterSnapshot().state.erupting; tick++) engine.advanceTick(engine.player().position);
    const encounter = engine.getEncounterSnapshot();
    const drawn = scene.sceneObjectController.update({ state: { encounter }, interpolatedTick: engine.worldState.tick });
    return drawn.map(({ data }) => [data.locId, data.seqId, data.localX, data.localY]).sort((a, b) => a[0] - b[0]);
  });
  assert.deepEqual(geysers, [[34568, 8279, 27, 23], [34569, 8279, 27, 32], [34570, 8279, 18, 32]]);

  // The electric form (the boss hitpoints preset): drawn as its own type once the scene has caught up.
  await page.evaluate(() => {
    engine.applyBossHpPreset(825);
    engine.advanceTick(engine.player().position);
  });
  assert.equal(await page.evaluate(() => engine.worldState.getNpc("alchemical-hydra").npcTypeId), 8619);
  await page.waitForFunction(
    () => [...scene.npcInstanceManager.instanceRegistry.values()].some((instance) => instance.npcTypeId === 8619),
    null,
    { timeout: 30000 },
  );

  // Killed; the application's own loop plays its death, draws its last form, and ends the fight.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => {
    const { instanceRegistry, dyingInstances } = scene.npcInstanceManager;
    return engine.worldState.getNpc("alchemical-hydra").npcTypeId === 8622 && engine.getEncounterOutcome().phase === "resolving" && dyingInstances.size === 0 && [...instanceRegistry.values()].some((instance) => instance.npcTypeId === 8622);
  }, null, { timeout: 60000, polling: 50 });
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("THE ALCHEMICAL HYDRA DEFEATED"), null, { timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log("The Alchemical Hydra loaded on /alchemical-hydra/, was drawn with its vents and its forms, and was won");
} finally {
  await browser.close();
}
