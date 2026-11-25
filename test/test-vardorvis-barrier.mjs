// Vardorvis' barrier keeps the player in the arena once it has risen, in
// every direction, even when the arena is applied anew during the fight: the
// application does so when the arena's collision has loaded, on a Take Over,
// when the cache is reloaded, and when it makes another engine of the fight.
// Each time a fresh, open copy of the collision becomes the one the player
// moves on. Plain Node with the harness's module hooks and the trimmed cache.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

const { prepareArena, engineModule, objTypeLoader } = await loadEnvironment();
await prepareArena("vardorvis");

const newEngine = (seed) =>
  engineModule.createSimulationEngine({
    encounterConfig: { kind: "vardorvis", mechanics: {} },
    objTypeLoader,
    combatSeed: seed,
    inventory: new Array(28).fill(null),
    equipment: {},
    combatSupplies: engineModule.createEmptyCombatSupplies(),
    attackStylePerCategory: {},
    startPosition: [40, 24],
  });
// The floor inside the barrier (encounter.js: `ring`).
const inside = ([x, y]) => x >= 36 && x <= 46 && y >= 21 && y <= 31;
// Out of the arena towards each side and each corner.
const goals = [[28, 24], [55, 26], [41, 40], [41, 12], [28, 12], [55, 40], [28, 40], [55, 12]];

function startFight(engine) {
  engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
  engine.injectAction({ type: "attackTarget", targetId: "vardorvis" });
  for (let tick = 0; tick < 6; tick++) engine.advanceTick(engine.player().position);
  assert.ok(engine.encounter.barrierTick !== null && engine.currentTick > engine.encounter.barrierTick, "the barrier has risen");
  engine.injectAction({ type: "attackTarget", targetId: null });
}
function escapes(engine) {
  const out = [];
  for (const goal of goals) {
    for (let tick = 0; tick < 15; tick++) engine.advanceTick([41, 26]);
    for (let tick = 0; tick < 20; tick++) {
      engine.advanceTick(goal);
      if (!inside(engine.player().position)) {
        out.push(`${goal} at ${engine.player().position}`);
        break;
      }
    }
  }
  return out;
}

// Before the first hit the site is open: the player walks out west.
{
  const engine = newEngine(1);
  for (let tick = 0; tick < 12; tick++) engine.advanceTick([28, 24]);
  assert.ok(!inside(engine.player().position), "open until the fight starts");
}
// Once it has risen, he cannot leave.
{
  const engine = newEngine(2);
  startFight(engine);
  assert.deepEqual(escapes(engine), []);
}
// Nor after another engine of the fight has applied its own copy of the arena.
{
  const engine = newEngine(3);
  startFight(engine);
  newEngine(4);
  assert.deepEqual(escapes(engine), []);
}
// Nor after his own engine has applied the arena anew (a Take Over).
{
  const engine = newEngine(5);
  startFight(engine);
  engine.reapplyArenaConfig();
  assert.deepEqual(escapes(engine), []);
}
console.log("Vardorvis' barrier holds once it has risen, however often the arena is applied");
process.exit(0);
