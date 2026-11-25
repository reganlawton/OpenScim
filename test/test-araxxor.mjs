// Araxxor loads on his route and is drawn from the trimmed cache (his lair,
// him, his eggs and their araxytes, the acid ball); his eggs block the way;
// the acid of a special is drawn where it lies; he enrages, with the models of
// his enraged body, and dies into the victory screen, taking the acid with him
// and leaving his corpse. The mechanics themselves are
// digested by the determinism harness (tools/determinism/scenarios/araxxor.mjs).
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
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'araxxor') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/araxxor/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/araxxor/");
  const enragedType = 1_013_668; // the scene's own (presentation.js)
  const types = [13668, enragedType, 13669, 13670, 13671, 13672, 13673, 13674, 13675, 13676];
  await page.waitForFunction((ids) => ids.every((id) => scene.isNpcTypeLoaded(id)), types, { timeout: 60000 });

  // They walk as the cache has it and stand in another sequence (his two were once the wrong way round: he walked on the spot).
  const steps = await page.evaluate((ids) => ids.map((id) => {
    const { animationSet, modelData } = scene.npcInstanceManager.typeRegistry.get(id);
    return { id, idle: animationSet.idle.seqId, walk: animationSet.walk.seqId, cacheWalk: modelData.walkSeqId };
  }), [13668, enragedType, 13671, 13673, 13675]);
  for (const { id, idle, walk, cacheWalk } of steps) assert.ok(walk === cacheWalk && idle !== walk, `${id}: stands in ${idle}, walks in ${walk}, the cache's walk is ${cacheWalk}`);
  // Standing still beside the player, in the application's own loop, he stands.
  await page.waitForFunction(() => engine.currentTick >= 14, null, { timeout: 60000 });
  const standing = await page.evaluate(() => new Promise((done) => {
    const seen = new Set(), until = performance.now() + 2000;
    const look = () => {
      const boss = engine.worldState.getNpc("araxxor");
      const { baseTrack } = scene.npcInstanceManager.instanceRegistry.get(scene.getNpcRenderInstanceId("araxxor")).animController;
      if (boss.previousPosition.join() === boss.position.join()) seen.add(baseTrack.clip.seqId);
      if (performance.now() < until) requestAnimationFrame(look);
      else done([...seen]);
    };
    look();
  }));
  assert.deepEqual(standing, [11473]);

  // The player starts in the first of the setups (loadouts.js, the wiki's strategies page): the scythe.
  const setup = await page.evaluate(() => {
    const { equipment, inventory, combatSupplies: supplies } = engine.player();
    return { weapon: equipment.weapon, body: equipment.body, items: inventory.filter(Boolean).length, spellbook: supplies.spellbook };
  });
  assert.deepEqual(setup, { weapon: 22325, body: 24420, items: 28, spellbook: "arceuus" });

  // Nine eggs; the player cannot walk onto one (here the north-east egg, 60,31).
  const eggs = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    const count = engine.worldState.getNpcs().filter((npc) => npc.id.startsWith("araxxor-egg")).length;
    for (let tick = 0; tick < 20; tick++) engine.advanceTick([60, 30]);
    for (let tick = 0; tick < 4; tick++) engine.advanceTick([60, 31]);
    return { count, onEgg: engine.player().position.join() === "60,31" };
  });
  assert.deepEqual(eggs, { count: 9, onEgg: false });

  // The first special (the seventh attack), its acid drawn as the game's object where it lies.
  const acid = await page.evaluate(() => {
    for (let tick = 0; tick < 80 && engine.getEncounterSnapshot().state.pools.length === 0; tick++) engine.advanceTick(engine.player().position);
    const encounter = engine.getEncounterSnapshot();
    const drawn = scene.sceneObjectController.update({ state: { encounter }, interpolatedTick: engine.worldState.tick });
    const { pools } = encounter.state;
    return {
      some: pools.length > 0,
      drawn: [...new Set(drawn.map((object) => object.data.locId))],
      tiles: drawn.every((object, n) => object.data.localX === pools[n][0] && object.data.localY === pools[n][1]),
    };
  });
  assert.deepEqual(acid, { some: true, drawn: [54148], tiles: true });

  // Enraged at a quarter of his hitpoints.
  const enraged = await page.evaluate(() => {
    engine.setBossHp(250);
    for (let tick = 0; tick < 3; tick++) engine.advanceTick(engine.player().position);
    return engine.getEncounterSnapshot().state.enraged;
  });
  assert.equal(enraged, true);
  // He is drawn with his enraged body (a model the game has put in the place of one of his own).
  await page.waitForFunction((type) => scene.npcInstanceManager.instanceRegistry.get(scene.getNpcRenderInstanceId("araxxor"))?.npcTypeId === type, enragedType, { timeout: 60000 });
  const models = await page.evaluate((ids) => ids.map((id) => scene.npcInstanceManager.typeRegistry.get(id).modelData.modelIds), [13668, enragedType]);
  assert.deepEqual(models, [[54289, 54290], [54288, 54290]]);

  // Killed; the application's own loop plays his death and ends the fight, with the acid gone.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("ARAXXOR DEFEATED"), null, { timeout: 120000 });
  const cleared = await page.evaluate(() => engine.getEncounterSnapshot().state.pools.length);
  assert.equal(cleared, 0);
  // The victory screen can come a frame before the scene has put his dead body
  // in the place of the enraged one: wait for the scene, then look.
  const bodies = (types) => [...scene.npcInstanceManager.instanceRegistry, ...[...scene.npcInstanceManager.dyingInstances].map(([id, { instance }]) => [id, instance])].map(([, { npcTypeId }]) => npcTypeId).filter((type) => types.includes(type));
  const bodyTypes = [13668, enragedType, 13669];
  await page.waitForFunction(`(${bodies})(${JSON.stringify(bodyTypes)}).join() === "13669"`, null, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(`(${bodies})(${JSON.stringify(bodyTypes)})`), [13669]);
  assert.deepEqual(errors, []);
  console.log("Araxxor loaded on /araxxor/, was drawn with his eggs and acid, enraged and was won");
} finally {
  await browser.close();
}
