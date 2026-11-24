// WIKI: Red-X prevents pathfinding while underneath with an object interaction.
// Exit ordering is inferred from the engine's NPC-before-player turn order;
// there is no additional stall timer and the existing attack cooldown survives.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

const { engineModule, objTypeLoader, prepareArena } = await loadEnvironment();
await prepareArena("general_graardor");
const { buildSimulationEngine } = await import("../client/engine/createSimulationEngine.js");

const altar = [54, 59];
const bossId = "general_graardor";
function createEngine() {
  return buildSimulationEngine({
    encounterConfig: {
      kind: bossId,
      mechanics: { graardorStartMode: "altar_door", graardorSpawnMinions: false, infiniteHealth: true },
    },
    objTypeLoader,
    equipment: {},
    inventory: [],
    combatSupplies: engineModule.createEmptyCombatSupplies(),
    enableIntro: false,
    combatSeed: 13,
    startPosition: [54, 50], // Fixture: underneath the south side of the 4x4 boss.
  }, { encounterSeed: 13 });
}
const bossOf = (engine) => engine.worldState.getNpc(bossId);
function bossAttacks(engine) {
  return engine.getLastTickEvents().filter((event) => event.type === "zuk_attack" && event.sourceId === bossId);
}
function stepOut(engine) {
  const boss = bossOf(engine);
  const position = [...boss.position];
  engine.advanceTick(altar);
  assert.deepEqual(engine.player().position, [54, 52]);
  assert.deepEqual(boss.position, position, "Red-X holds the boss while underneath");
  assert.equal(bossAttacks(engine).length, 0);
  engine.advanceTick(altar);
  assert.deepEqual(engine.player().position, [54, 54]);
  assert.deepEqual(boss.position, position, "Boss still saw the player underneath on the exit tick");
  assert.equal(bossAttacks(engine).length, 0);
}

// Ready cooldown: leaving is visible on the next NPC turn, with no exit grace.
const ready = createEngine();
stepOut(ready);
assert.equal(bossOf(ready).combat.nextActionTick, 0, "Stalling never reschedules the cooldown");
ready.injectAction({ type: "attackTarget", targetId: bossId });
ready.advanceTick([54, 54]);
assert.equal(ready.getEncounterSnapshot().state.redXInteractionActive, false, "Attacking cancels Red-X");
assert.equal(bossAttacks(ready).length, 1, "Ready boss attacks on the first turn after exit, including an exit shot");
assert.equal(bossOf(ready).combat.lastAttackTick, 3);

// Unfinished cooldown: leaving neither resets it nor makes the boss attack early.
const cooling = createEngine();
bossOf(cooling).combat.nextActionTick = 8; // Fixture: attack still cooling down.
stepOut(cooling);
for (let tick = 3; tick <= 7; tick++) {
  cooling.advanceTick([54, 54]);
  assert.equal(bossOf(cooling).combat.nextActionTick, 8);
  assert.equal(bossAttacks(cooling).length, 0);
}
cooling.advanceTick([54, 54]);
assert.equal(bossAttacks(cooling).length, 1);
assert.equal(bossOf(cooling).combat.lastAttackTick, 8);

// The cooldown may finish underneath. Holding Red-X does not extend it.
const expiresUnderneath = createEngine();
expiresUnderneath.player().isRunEnabled = false;
bossOf(expiresUnderneath).combat.nextActionTick = 2;
for (let tick = 1; tick <= 4; tick++) {
  expiresUnderneath.advanceTick(altar);
  assert.deepEqual(bossOf(expiresUnderneath).position, [52, 50]);
  assert.equal(bossOf(expiresUnderneath).combat.nextActionTick, 2);
  assert.equal(bossAttacks(expiresUnderneath).length, 0);
}
expiresUnderneath.advanceTick([54, 54]);
assert.equal(bossAttacks(expiresUnderneath).length, 1);
assert.equal(bossOf(expiresUnderneath).combat.lastAttackTick, 5);

// A regular movement destination cancels the interaction even while underneath.
const cancelled = createEngine();
cancelled.advanceTick(altar);
const heldPosition = [...bossOf(cancelled).position];
cancelled.advanceTick([54, 52]);
assert.equal(cancelled.getEncounterSnapshot().state.redXInteractionActive, false);
assert.notDeepEqual(bossOf(cancelled).position, heldPosition, "Ordinary movement lets the overlapping boss pathfind again");

// An interaction without overlap cannot stall an adjacent boss.
const outside = createEngine();
outside.teleportPlayer([54, 54], 0);
outside.advanceTick(altar);
assert.equal(bossAttacks(outside).length, 1, "Clicking the altar outside the footprint gives no immunity");

// Reset drops interaction state; walking under without Red-X allows pursuit.
cancelled.reset([54, 50], { encounter: { kind: bossId, seeds: { encounterSeed: 13 } } });
assert.equal(cancelled.getEncounterSnapshot().state.redXInteractionActive, false);
cancelled.advanceTick([54, 50]);
assert.notDeepEqual(bossOf(cancelled).position, [52, 50]);
console.log("Graardor Red-X: overlap-only stall, immediate next-turn exit response, cooldown preserved, cancellation and reset");
