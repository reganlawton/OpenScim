// The waves of the Fortis Colosseum load on their route and are drawn by the
// default scene: the monsters of wave 1 and the Fremennik warband, whose
// definition is Sol Heredit's and shows its attacks as events that only his
// scene plays. The encounter turns those into the default scene's.
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
  // Two probes: the engine of the fight, and the scene as the default scene builder made it.
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'colosseum') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/colosseum/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/colosseum/");
  await page.waitForFunction(() => document.title === "Fortis Colosseum | OpenScim.dev");
  assert.equal(await page.evaluate(() => engine.getEncounterKind()), "colosseum");

  // The scene has loaded the model of every NPC type a wave can place so far.
  await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcLoaded(), null, { timeout: 60000 });
  const npcTypes = await page.evaluate(() => scene.encounterRenderConfig.preloadNpcTypes.map((type) => [type.npcTypeId, scene.isNpcTypeLoaded(type.npcTypeId)]));
  // The six monsters, the warband, Minimus, the actors of the modifiers (bee swarm, healing totem, solarflare orb), and
  // the player's greater thralls: ghost, skeleton, zombie (client/engine/thralls.js).
  assert.deepEqual(npcTypes, [
    [12811, true], [12810, true], [12817, true], [12818, true], [12819, true], [12812, true], [12816, true], [12814, true], [12815, true],
    [12808, true], [12823, true], [12825, true], [12826, true], [10880, true], [10883, true], [10886, true],
  ]);

  // Ticked from here: Minimus stands in the lobby; a click on him opens his offer; the first of the three is chosen;
  // five ticks after the choice the warband and the shaman of wave 1 are placed. What is checked of the fight, 17
  // ticks on: something was drawn as an "inferno_visual" event, nothing as a "colosseum_visual" one, a hit landed.
  const fight = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    const events = {};
    const ids = () => engine.worldState.getNpcs().map((npc) => npc.id);
    const tick = () => {
      engine.advanceTick(engine.player().position);
      for (const event of engine.getLastTickEvents()) events[event.type] = (events[event.type] ?? 0) + 1;
    };
    while (!ids().includes("colosseum_minimus")) tick();
    const lobby = { phase: engine.getEncounterSnapshot().state.phase, npcs: ids() };
    engine.queueEncounterCommand({ encounter: "colosseum", type: "talk-to-minimus" });
    tick();
    const offered = engine.getEncounterSnapshot().state.offer.options.map((option) => option.label);
    engine.queueEncounterCommand({ encounter: "colosseum", type: "choose-modifier", choice: 0 });
    tick();
    const chosenOn = engine.currentTick;
    const afterChoice = ids();
    let placedAfter = null;
    while (engine.currentTick < chosenOn + 22) {
      tick();
      if (placedAfter === null && ids().length > 0) placedAfter = engine.currentTick - chosenOn;
    }
    // Without what the overlays read, which has its own check below.
    const { placeTick, reinforcementTick, splits, deaths, losLinks, ...snapshot } = engine.getEncounterSnapshot().state;
    return {
      lobby,
      offered,
      afterChoice,
      placedAfter,
      placeTick: placeTick - chosenOn,
      reinforcementTick: reinforcementTick - chosenOn,
      monsters: ids(),
      drawn: events.inferno_visual > 0,
      notDrawable: events.colosseum_visual ?? 0,
      hitsLanded: events.hit_applied > 0,
      snapshot,
      overlays: { splits, deaths, losLinks: Object.keys(losLinks).filter((name) => losLinks[name] !== null) },
    };
  });
  assert.deepEqual(fight, {
    lobby: { phase: "lobby", npcs: ["colosseum_minimus"] },
    offered: ["Blasphemy", "Relentless", "Frailty"],
    // Minimus is gone on the tick of the choice.
    afterChoice: [],
    placedAfter: 5,
    placeTick: 5,
    reinforcementTick: 71,
    monsters: ["colosseum_berserker_0", "colosseum_archer_1", "colosseum_seer_2", "colosseum_shaman_3"],
    drawn: true,
    notDrawable: 0,
    hitsLanded: true,
    snapshot: { wave: 1, phase: "active", modifiers: { blasphemy: 1 }, doomStacks: 0, offer: null, sand: [], orbTiles: [] },
    // No wave is completed and nothing has died; the LoS tool has the wave's spawns and the positions now.
    overlays: { splits: [], deaths: [], losLinks: ["spawns", "current"] },
  });
  // The application's loop draws the overlays: the panel of the waves is on the page.
  await page.waitForFunction(() => document.querySelector(".colosseum-hud.left")?.innerText.includes("Wave 1"), null, { timeout: 60000 });
  // The application's own loop publishes the state: each monster gets a render instance.
  await page.waitForFunction((ids) => ids.every((id) => scene.npcInstanceManager.instanceRegistry.has(id)), fight.monsters, { timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log("The Colosseum's waves loaded on /colosseum/; wave 1 was placed, drawn by the default scene and fought");
} finally {
  await browser.close();
}
