// The Leviathan loads on its route and is drawn from the trimmed cache (the
// Scar's arena and its neighbours, the boss and the pathfinder); the rocks of
// its roars are drawn where they fell and block the way; it dies into the
// victory screen. The mechanics themselves are digested by the determinism
// harness (tools/determinism/scenarios/leviathan.mjs).
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
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'leviathan') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/leviathan/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/leviathan/");
  await page.waitForFunction(() => scene.isNpcTypeLoaded(12214) && scene.isNpcTypeLoaded(12220), null, { timeout: 60000 });

  // The player starts in the first of its setups (loadouts.js, the wiki's strategies page): the crossbow and its
  // ammunition worn, the rune pouch of Shadow Rush, 27 items so that the twisted bow has a slot for the buckler.
  const setup = await page.evaluate(() => {
    const { equipment, inventory, combatSupplies: supplies } = engine.player();
    return { weapon: equipment.weapon, shield: equipment.shield, items: inventory.filter(Boolean).length, ammo: supplies.equippedAmmo.id, runes: supplies.runePouch.slots.map((slot) => slot.id), spellbook: supplies.spellbook };
  });
  assert.deepEqual(setup, { weapon: 26374, shield: 21000, items: 27, ammo: 21944, runes: [560, 562, 566, 556], spellbook: "ancient" });

  // To the first roar's rocks: one on the player's tile, two that tell the
  // first special. Each is drawn as the loc it leaves, and none can be walked on.
  const rocks = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    for (let tick = 0; tick < 60 && engine.getEncounterSnapshot().state.rubble.length < 3; tick++) engine.advanceTick(engine.player().position);
    const encounter = engine.getEncounterSnapshot();
    const drawn = scene.sceneObjectController.update({ state: { encounter }, interpolatedTick: engine.worldState.tick });
    const { rubble } = encounter.state;
    return {
      rubble: rubble.length,
      drawn: drawn.map((object) => object.data.locId),
      tiles: drawn.every((object, n) => object.data.localX === rubble[n][0] && object.data.localY === rubble[n][1]),
      onPlayer: rubble.some(([x, y]) => x === engine.player().position[0] && y === engine.player().position[1]),
    };
  });
  assert.deepEqual(rocks, { rubble: 3, drawn: [47590, 47590, 47590], tiles: true, onPlayer: true });
  // A step east, onto the tile beside the rock that fell on the player, and back is refused.
  const blocked = await page.evaluate(() => {
    const [x, y] = engine.player().position;
    for (let tick = 0; tick < 3; tick++) engine.advanceTick([x + 1, y]);
    for (let tick = 0; tick < 3; tick++) engine.advanceTick([x, y]);
    return engine.player().position.join() !== [x, y].join();
  });
  assert.equal(blocked, true);

  // Enraged: the pathfinder comes 3 ticks later, in the north-west corner (or the next clockwise one clear of rocks).
  const pathfinder = await page.evaluate(() => {
    engine.setBossHp(170);
    for (let tick = 0; tick < 6; tick++) engine.advanceTick(engine.player().position);
    return { enraged: engine.getEncounterSnapshot().state.enraged, there: engine.worldState.getNpc("abyssal-pathfinder") !== undefined };
  });
  assert.deepEqual(pathfinder, { enraged: true, there: true });

  // Killed; the application's own loop plays its death and ends the fight,
  // with the rocks and the pathfinder gone.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("THE LEVIATHAN DEFEATED"), null, { timeout: 120000 });
  const cleared = await page.evaluate(() => ({ rubble: engine.getEncounterSnapshot().state.rubble.length, pathfinder: engine.worldState.getNpc("abyssal-pathfinder") ?? null }));
  assert.deepEqual(cleared, { rubble: 0, pathfinder: null });
  assert.deepEqual(errors, []);
  console.log("The Leviathan loaded on /leviathan/, was drawn with its rocks, enraged with its pathfinder and was won");
} finally {
  await browser.close();
}
