// Every example scenario of the sandbox can be played as it is placed: each
// of its monsters stands on walkable tiles of the arena's collision (built
// from the cache, as the application builds it), no two footprints overlap,
// none covers a host boss's NPC or the player's start, and the run starts.
// Plain Node with the harness's module hooks and the trimmed cache.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

const { prepareArena, rendering, engineModule, objTypeLoader } = await loadEnvironment();
const { sandboxExamples } = await import("../client/encounters/sandbox/examples.js");
const { sandboxVariantKind } = await import("../client/encounters/sandbox/arenas.js");
const { getSandboxNpcEntry } = await import("../client/encounters/sandbox/catalog.js");

assert.equal(sandboxExamples.length, 20);
for (const { key, scenario } of sandboxExamples) {
  const kind = sandboxVariantKind(scenario.arena);
  await prepareArena(kind);
  const walkable = rendering.getRegisteredArenaConfig("sandbox").walkableTiles;
  // The engine as the application builds it: the run's start sets the host up.
  const engine = engineModule.createSimulationEngine({
    encounterConfig: { kind, mechanics: {}, options: { scenario } },
    objTypeLoader, combatSeed: 1,
    inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  const start = engine.runStartPosition;
  const actors = engine.worldState.getNpcs();
  const own = new Set(scenario.npcs.map((npc) => npc.id));
  assert.equal(actors.filter((actor) => own.has(actor.id)).length, scenario.npcs.length, `${key}: every monster is placed`);
  if (scenario.options.bossMechanics) assert.ok(actors.length > scenario.npcs.length, `${key}: the host boss is there`);
  assert.ok(scenario.gear, `${key}: has gear`);

  const taken = new Map([[start.join(","), "the player's start"]]);
  // The host's NPCs first: they stand where their fight puts them (Zebak in his water).
  for (const actor of [...actors.filter((a) => !own.has(a.id)), ...actors.filter((a) => own.has(a.id))]) {
    const size = own.has(actor.id) ? getSandboxNpcEntry(scenario.npcs.find((npc) => npc.id === actor.id).npc).size : actor.size;
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++) {
        const tile = `${actor.position[0] + dx},${actor.position[1] + dy}`;
        if (own.has(actor.id)) assert.ok(walkable.has(tile), `${key}: ${actor.id} stands on ${tile}, which is not walkable`);
        assert.ok(!taken.has(tile) || !own.has(actor.id), `${key}: ${actor.id} overlaps ${taken.get(tile)} on ${tile}`);
        taken.set(tile, actor.id);
      }
  }
}
// A scenario monster whose id is a host NPC's is renamed, not left out.
{
  const hosted = sandboxExamples.find(({ scenario }) => scenario.options.bossMechanics && scenario.npcs.length > 0).scenario;
  const kind = sandboxVariantKind(hosted.arena);
  await prepareArena(kind);
  const build = (scenario) =>
    engineModule.createSimulationEngine({
      encounterConfig: { kind, mechanics: {}, options: { scenario } },
      objTypeLoader, combatSeed: 1,
      inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
    });
  const hostIds = build({ ...hosted, npcs: [] }).worldState.getNpcs().map((actor) => actor.id);
  assert.ok(hostIds.length > 0);
  const clash = { ...hosted, npcs: [{ ...hosted.npcs[0], id: hostIds[0] }] };
  const ids = build(clash).worldState.getNpcs().map((actor) => actor.id);
  assert.equal(ids.length, hostIds.length + 1, "the clashing monster is placed");
  assert.ok(ids.includes(`${hostIds[0]}-2`), "under a new id");
}
console.log("sandbox examples: 20 placed");
process.exit(0);
