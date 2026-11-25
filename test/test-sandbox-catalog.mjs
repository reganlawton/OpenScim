// The sandbox's catalog keeps up with the encounters, and every monster in it
// can be placed and fights:
//   1. client/encounters/sandbox/discovered.js is what tools/sandbox-catalog.mjs
//      makes of today's encounters (run it with --write after adding one);
//   2. the discovery itself, on an encounter made up here: a new monster
//      becomes an entry, an excluded one and one without stats do not;
//   3. every entry, curated or discovered, has stats in the monster table,
//      a unique id, attacks whose clips it has, and is loaded by the scene;
//   4. every entry, placed alone in the Colosseum, starts an attack on the
//      player within 40 ticks of the engine (an animation of it in the
//      tick's events).
// Plain Node with the harness's module hooks and the trimmed cache.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadEnvironment } from "../tools/determinism/harness.mjs";
import { discoverSandboxNpcs } from "../tools/sandbox/discover.mjs";

// 1.
const check = spawnSync(process.execPath, ["tools/sandbox-catalog.mjs", "--check"], { encoding: "utf8" });
assert.equal(check.status, 0, "discovered.js is out of date: run node tools/sandbox-catalog.mjs --write\n" + check.stdout + check.stderr);

const { engineModule, objTypeLoader, prepareArena } = await loadEnvironment();
const { sandboxNpcCatalog, curatedNpcCatalog, sandboxPreloadNpcTypes } = await import("../client/encounters/sandbox/catalog.js");
const { monsterByNpcTypeId } = await import("../client/data/monsters.js");
const { getMonsterFormulaStats, getMonsterHitpoints } = await import("../client/engine/monsterStats.js");
const { sandboxVariantKind } = await import("../client/encounters/sandbox/arenas.js");

// 2. A made-up encounter that draws an Inferno mager (stats, a clip), a
// monster it excludes, and a type the table does not know.
const { entries, report } = discoverSandboxNpcs({
  presentations: [{ kind: "made_up", renderConfig: { preloadNpcTypes: [
    { npcTypeId: 7699, idleSeqId: 7609, attackClips: { magic: 7610 }, deathSeqId: 7613 },
    { npcTypeId: 7697, attackClips: { attack: 7597 } },
    { npcTypeId: 99999, attackClips: { attack: 1 } },
  ] } }],
  curatedIds: new Set(),
  exclusions: { 7697: "made-up reason" },
  monsterOf: (id) => monsterByNpcTypeId.get(id),
  nameOf: () => "Made up",
  groupOf: () => "Made Up",
});
assert.equal(entries.length, 1);
assert.deepEqual(
  { id: entries[0].id, npcTypeId: entries[0].npcTypeId, size: entries[0].size, clip: entries[0].attacks[0].clip, idle: entries[0].idleSeqId, source: entries[0].source },
  { id: "auto.made_up.7699", npcTypeId: 7699, size: 4, clip: "magic", idle: 7609, source: "made_up" },
);
assert.ok(["melee", "range", "magic"].includes(entries[0].attacks[0].style));
assert.ok(report.some((line) => line.includes("excluded: made-up reason")));
assert.ok(report.some((line) => line.includes("no stats")));

// 3.
assert.equal(new Set(sandboxNpcCatalog.map((entry) => entry.id)).size, sandboxNpcCatalog.length, "catalog ids are unique");
assert.ok(curatedNpcCatalog.length > 0);
for (const entry of sandboxNpcCatalog) {
  assert.ok(getMonsterHitpoints(entry.npcTypeId) > 0 && getMonsterFormulaStats(entry.npcTypeId), `${entry.id}: stats in the monster table`);
  assert.ok(Number.isInteger(entry.size) && entry.size > 0, `${entry.id}: size`);
  assert.ok(entry.attacks.length > 0, `${entry.id}: attacks`);
  for (const attack of entry.attacks) {
    assert.ok(["melee", "range", "magic"].includes(attack.style), `${entry.id}: style`);
    assert.ok(entry.clips[attack.clip] !== undefined, `${entry.id}: clip ${attack.clip}`);
  }
  assert.ok(sandboxPreloadNpcTypes.some((npcType) => npcType.npcTypeId === entry.npcTypeId), `${entry.id}: loaded by the scene`);
}

// 4.
const kind = sandboxVariantKind("colosseum");
await prepareArena(kind);
for (const entry of sandboxNpcCatalog) {
  const scenario = { arena: "colosseum", mode: "versus", meta: { name: "catalog" }, npcs: [{ id: "probe", npc: entry.id, position: [27, 35] }] };
  const engine = engineModule.createSimulationEngine({
    encounterConfig: { kind, mechanics: { infiniteHealth: true }, options: { scenario } },
    objTypeLoader, combatSeed: 3,
    inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  let attacked = false;
  for (let tick = 0; tick < 40 && !attacked; tick++) {
    engine.advanceTick(engine.player().position);
    attacked = engine.getLastTickEvents().some((event) => event.type === "inferno_visual" && event.animations.some((animation) => animation.actorId === "probe"));
  }
  assert.ok(attacked, `${entry.id}: attacks within 40 ticks`);
}
console.log(`sandbox catalog: ${sandboxNpcCatalog.length} entries (${sandboxNpcCatalog.length - curatedNpcCatalog.length} discovered), each fought`);
process.exit(0);
