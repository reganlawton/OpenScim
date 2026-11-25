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
function createEngine(overrides = {}) {
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
    ...overrides,
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

// Real Bowfa launch and impact: the opening miss still produces a hitsplat
// and must flinch an otherwise ready boss before his NPC turn at impact.
function openingShot() {
  const engine = createEngine({ equipment: { weapon: 25865 }, startPosition: [54, 42] });
  engine.injectAction({ type: "attackTarget", targetId: bossId });
  engine.advanceTick([54, 42]);
  const shot = engine.getLastTickEvents().find((event) => event.type === "attack_started" && event.sourceId === "player");
  assert.ok(shot, "Bowfa actually fired");
  assert.equal(shot.impactDelayTicks, 3);
  assert.equal(bossOf(engine).combat.nextActionTick, 0, "Launch alone does not flinch");
  engine.injectAction({ type: "attackTarget", targetId: null });
  engine.advanceTick([54, 42]);
  engine.advanceTick([54, 42]);
  // Stand adjacent just before impact, so range cannot hide a missing delay.
  engine.teleportPlayer([54, 46], 0);
  engine.advanceTick([54, 46]);
  assert.ok(engine.getLastTickEvents().some((event) => event.type === "hit_applied" && event.targetId === bossId));
  assert.equal(bossOf(engine).combat.retaliation.lastIncomingAttackTick, 4);
  assert.equal(bossOf(engine).combat.nextActionTick, 7, "Impact starts the 3-tick retaliation delay");
  assert.equal(bossAttacks(engine).length, 0, "Eligible hit prevents a ready adjacent boss from attacking");
  return engine;
}

const flinched = openingShot();
for (let tick = 5; tick <= 6; tick++) {
  flinched.advanceTick([54, 46]);
  assert.equal(bossAttacks(flinched).length, 0);
}
flinched.advanceTick([54, 46]);
assert.equal(bossAttacks(flinched).length, 1, "Standing still allows retaliation when the delay ends");

const escaping = openingShot();
for (let tick = 5; tick <= 7; tick++) {
  escaping.advanceTick(altar);
  assert.equal(bossAttacks(escaping).length, 0, "Flinch allows the following Red-X run underneath");
}

// WIKI: Flinching — intervening hits do not extend the retaliation delay or
// its 8-tick in-combat window; a boss attack restarts it from its cooldown.
const { scheduleNpcRetaliation } = await import("../client/engine/npcRetaliation.js");
function hitAt(engine, tick, style = "range", accuracySucceeded = true) {
  scheduleNpcRetaliation(bossOf(engine), {
    sourceId: "player", launchTick: tick, impactTick: tick, style, accuracySucceeded,
  });
}
const repeated = openingShot();
hitAt(repeated, 5);
assert.equal(bossOf(repeated).combat.nextActionTick, 7, "Repeated hits cannot indefinitely flinch");
hitAt(repeated, 15);
assert.equal(bossOf(repeated).combat.nextActionTick, 7, "Boundary tick remains in combat");
hitAt(repeated, 16);
assert.equal(bossOf(repeated).combat.nextActionTick, 19, "Flinch becomes eligible after the combat window");
hitAt(flinched, 21);
assert.equal(bossOf(flinched).combat.nextActionTick, 13, "Boss attack cooldown plus 8 ticks blocks flinching");
hitAt(flinched, 22);
assert.equal(bossOf(flinched).combat.nextActionTick, 25);

const legacy = createEngine();
delete bossOf(legacy).combat.retaliation.startsOutOfCombat;
hitAt(legacy, 1);
assert.equal(bossOf(legacy).combat.nextActionTick, 0, "Opening behavior stays unchanged without opting in");

// A magic splash retaliates one tick after launch, rather than at its later impact.
const splash = createEngine();
scheduleNpcRetaliation(bossOf(splash), {
  sourceId: "player", launchTick: 0, impactTick: 3, style: "magic", accuracySucceeded: false,
});
splash.advanceTick(altar);
assert.equal(bossOf(splash).combat.nextActionTick, 4);
assert.equal(bossOf(splash).combat.retaliation.lastIncomingAttackTick, 1);

escaping.reset([54, 50]);
assert.deepEqual(bossOf(escaping).combat.retaliation.pending, []);
assert.equal(bossOf(escaping).combat.retaliation.lastIncomingAttackTick, null);
assert.equal(bossOf(escaping).combat.lastAttackTick, null, "Restart restores opening flinch eligibility");
console.log("Graardor flinching: real Bowfa impact delays retaliation, Red-X escape, repeat-hit immunity, cooldown window and reset");
