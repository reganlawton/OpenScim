import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvironment } from "../tools/determinism/harness.mjs";
await loadEnvironment(); // the client uses web-root imports resolved by the harness loader
const [{ setArenaConfig }, { CorruptedHunllefEncounter, corruptedHunllefDefinition, startPhaseKey,
  prayerTileMarkersKey, prayerTileMarkerColorKeys, tornadoTileMarkerColorKey }, { floorPatterns },
  { corruptedHunllefPresentation, finalPhaseSafeTiles, withFinalPhaseSafeMarkers }] = await Promise.all([
  import("../client/engine/arena.js"),
  import("../client/encounters/corrupted-hunllef/encounter.js"),
  import("../client/encounters/corrupted-hunllef/floorPatterns.js"),
  import("../client/encounters/corrupted-hunllef/presentation.js"),
]);

function fixture(hp = 1000) {
  const encounter = new CorruptedHunllefEncounter();
  encounter.reset({ encounterSeed: 71 });
  const boss = encounter.createNpcs()[0];
  boss.vitals.hp = hp;
  const player = { id: "player", alive: true, size: 1, position: [50, 50] };
  const context = (tick) => ({ tick, world: { getNpc: () => boss, getPlayer: () => player,
    occupancy: { isBlocked: (x, y) => x === player.position[0] && y === player.position[1] } },
    playerPos: [...player.position] });
  return { encounter, boss, player, context };
}

test("floor warns, damages each tick, then clears on the source clock", () => {
  const { encounter, player, context } = fixture();
  for (let tick = 1; tick <= 8; tick++) assert.deepEqual(encounter.resolveHazards(context(tick)), []);
  const first = encounter.lastPattern;
  assert.equal(first.phase, 0);
  assert.equal(first.startTick, 8);
  const pattern = floorPatterns[0].find((entry) => entry.patternId === first.patternId);
  assert.ok(pattern);
  player.position = pattern.tiles[0].map((coordinate) => coordinate + 50);
  for (let tick = 9; tick <= 12; tick++) {
    assert.deepEqual(encounter.resolveHazards(context(tick)), []);
    assert.equal(encounter.floor.get(pattern.tiles[0].join(",")).state, "warning");
  }
  for (let tick = 13; tick <= 18; tick++) {
    const hits = encounter.resolveHazards(context(tick));
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].baseDamage, [10, 20]);
    assert.equal(encounter.floor.get(pattern.tiles[0].join(",")).state, "damage");
  }
  assert.deepEqual(encounter.resolveHazards(context(19)), []);
  assert.equal(encounter.floor.size, 0);
});

test("HP phase chooses the appropriate pool and existing tiles keep their timing", () => {
  const { encounter, boss, context } = fixture(200);
  for (let tick = 1; tick <= 8; tick++) encounter.resolveHazards(context(tick));
  assert.equal(encounter.lastPattern.phase, 2);
  assert.equal(encounter.floor.values().next().value.damageAt, 11);
  const tile = encounter.floor.values().next().value;
  const oldDamageAt = tile.damageAt;
  encounter.nextPatternTick = 9;
  encounter.resolveHazards(context(9));
  assert.equal(encounter.floor.get(`${tile.x},${tile.y}`).damageAt, oldDamageAt);
  boss.alive = false;
  encounter.resolveHazards(context(10));
  assert.equal(encounter.floor.size, 0);
});

test("Hunllef approaches only outside its five tile footprint range", () => {
  const { encounter, boss, player, context } = fixture();
  setArenaConfig(encounter.getArenaConfig());
  assert.deepEqual(encounter.moveNpc(boss, context(1)), [], "boss waits through the ready period");
  assert.deepEqual(encounter.moveNpc(boss, context(4)), [{ npcId: boss.id, path: [[55, 56]] }]);
  assert.deepEqual(encounter.moveNpc(boss, context(5)), [], "one tick separates visible steps");
  player.position = [52, 52];
  assert.deepEqual(encounter.moveNpc(boss, context(6)), []);
});

test("scene uses the cache warning and damage floor objects", () => {
  const { renderConfig } = corruptedHunllefPresentation(class {});
  const scene = renderConfig.createSceneObjectController();
  const objects = scene.update({ state: { encounter: { state: { floor: [
    { x: 50, y: 51, state: "warning" }, { x: 51, y: 51, state: "damage" },
  ] } } } });
  assert.deepEqual(objects.map(({ data }) => data.locId), [36047, 36048]);
  assert.deepEqual(objects.map(({ data }) => [data.localX, data.localY]), [[50, 51], [51, 51]]);
});

test("starting health choices load the matching floor phase", () => {
  const controls = corruptedHunllefDefinition.controls;
  assert.deepEqual(controls.bossHpPresets.map(({ hp }) => hp), [1000, 666, 333]);
  for (const [choice, hp, phase] of [["full", 1000, 0], ["middle", 666, 1], ["low", 333, 2]]) {
    const encounter = new CorruptedHunllefEncounter();
    encounter.configureRunStart({ [startPhaseKey]: choice });
    const boss = encounter.createNpcs()[0];
    assert.equal(boss.vitals.hp, hp);
    assert.equal(encounter.getSnapshot({ world: { getNpc: () => boss } }).state.phase, phase);
  }
});

test("practice starts the player on the requested safe tile", () => {
  const encounter = new CorruptedHunllefEncounter();
  assert.deepEqual(encounter.getDefaultPlayerStart(), [55, 52]);
  assert.deepEqual(corruptedHunllefDefinition.descriptor.playerStart, [55, 52]);
  assert.ok(finalPhaseSafeTiles.some(([x, y]) => x === 55 && y === 52));
});

test("all three corrupted loadouts keep the agreed weapon and food layout", () => {
  const loadouts = corruptedHunllefDefinition.descriptor.loadouts;
  assert.deepEqual(Object.keys(loadouts), ["tier_1", "tier_2", "tier_3"]);
  for (let tier = 1; tier <= 3; tier++) {
    const { equipment, inventory } = loadouts[`tier_${tier}`];
    const offset = tier - 1;
    assert.deepEqual(equipment, { head: 23840 + offset, body: 23843 + offset,
      legs: 23846 + offset, weapon: 23852 + offset });
    assert.deepEqual(inventory.slice(0, 5), [23855 + offset, 23884, 23884, 23884, 23849 + offset]);
    assert.deepEqual([inventory[6], inventory[7], inventory[10], inventory[11]], Array(4).fill(25958));
    assert.equal(inventory.filter(id => id === 23874).length, 19);
    assert.equal(inventory.length, 28);
  }
});

test("final phase marks the eight centered tiles safe in every current hard pattern", () => {
  assert.deepEqual(finalPhaseSafeTiles, [
    [55, 52], [56, 52], [55, 59], [56, 59],
    [52, 55], [52, 56], [59, 55], [59, 56],
  ]);
  const dangerous = new Set(floorPatterns[2].flatMap(({ tiles }) => tiles.map(([x, y]) => `${x + 50},${y + 50}`)));
  for (const [x, y] of finalPhaseSafeTiles) assert.equal(dangerous.has(`${x},${y}`), false);
  const input = { simulationState: { encounter: { state: { phase: 2 } } }, options: { showTileMarkers: false },
    tileMarkers: [{ x: 50, y: 50, label: "private" }] };
  const marked = withFinalPhaseSafeMarkers(input);
  assert.equal(marked.options.showTileMarkers, true);
  assert.deepEqual(marked.tileMarkers.map(({ x, y }) => [x, y]), finalPhaseSafeTiles);
  const earlierPhase = { ...input, simulationState: { encounter: { state: { phase: 1 } } } };
  assert.equal(withFinalPhaseSafeMarkers(earlierPhase), earlierPhase);
});

test("tornado tile markers use the spawned tile and configurable white default", () => {
  const state = { phase: 1, tornadoes: [{ id: "tornado-1", position: [53, 55] }] };
  const input = { simulationState: { encounter: { state }, mechanicsConfig: {} }, options: { showTileMarkers: false } };
  const marked = withFinalPhaseSafeMarkers(input);
  assert.equal(marked.options.showTileMarkers, true);
  assert.deepEqual(marked.tileMarkers.map(({ x, y, color }) => [x, y, color]), [[53, 55, "#ffffff"]]);

  const recolored = withFinalPhaseSafeMarkers({ ...input,
    simulationState: { ...input.simulationState, mechanicsConfig: { [tornadoTileMarkerColorKey]: "#fedcba" } },
  });
  assert.deepEqual(recolored.tileMarkers.map(({ x, y, color }) => [x, y, color]), [[53, 55, "#fedcba"]]);
});

test("protection prayer markers outline the boss footprint and expose colors under Protect from", () => {
  const state = { phase: 1, protection: "magic", tornadoes: [] };
  const input = { simulationState: { encounter: { state }, npcs: [{ id: "corrupted-hunllef", position: [51, 52] }], mechanicsConfig: {
    [prayerTileMarkersKey]: true, [prayerTileMarkerColorKeys.magic]: "#123456",
  } }, options: { showLineMarkers: false } };
  const marked = withFinalPhaseSafeMarkers(input);
  assert.equal(marked.options.showLineMarkers, true);
  assert.equal(marked.lineMarkers.length, 20);
  assert.equal(marked.lineMarkers.every(({ color, opacity }) => color === "#123456" && opacity === 1), true);
  assert.equal(marked.lineMarkers.some(({ x, y }) => x > 51 && x < 56 && y > 52 && y < 57), false,
    "the outline does not fill the boss footprint");
  assert.equal(marked.tileMarkers.length, 0);

  const controls = corruptedHunllefDefinition.controls;
  const outlineToggle = controls.mechanicsToggles.find(({ key }) => key === prayerTileMarkersKey);
  assert.equal(outlineToggle.label, "Outline tile by protection prayer");
  const protectFrom = controls.mechanicsToggles.filter(({ type, dependsOn }) => type === "color" && dependsOn === prayerTileMarkersKey);
  assert.deepEqual(protectFrom.map(({ label }) => label), ["Mage", "Melee", "Range"]);
  assert.equal(protectFrom[0].groupLabel, "Protect from");
  assert.equal(controls.mechanicsToggles.find(({ key }) => key === startPhaseKey).section, undefined);
  assert.deepEqual(controls.mechanicsToggles.filter(({ section }) => section === "Tile indicators")
    .map(({ label }) => label), ["Outline tile by protection prayer", "Mage", "Melee", "Range", "Tornado tile color"]);
});
