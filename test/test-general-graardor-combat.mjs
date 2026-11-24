// Exercise the real encounter plans through accuracy, damage rolling and impact.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

const { engineModule, objTypeLoader, prepareArena } = await loadEnvironment();
await prepareArena("general_graardor");
const { Prayer } = await import("../client/engine/prayerTables.js");
const { buildSimulationEngine } = await import("../client/engine/createSimulationEngine.js");

function createEngine(spawnMinions) {
  return buildSimulationEngine({
    encounterConfig: {
      kind: "general_graardor",
      mechanics: { graardorStartMode: "altar_door", graardorSpawnMinions: spawnMinions, infiniteHealth: true },
    },
    objTypeLoader,
    equipment: {},
    inventory: [],
    combatSupplies: engineModule.createEmptyCombatSupplies(),
    enableIntro: false,
    combatSeed: 13,
    startPosition: [54, 54], // Adjacent to the north side of Graardor's 4x4 spawn.
  }, { encounterSeed: 13 });
}

const engine = createEngine(false);
const attacks = [];
const launchAttack = engine.launchNpcAttack.bind(engine);
engine.launchNpcAttack = (npc, attack, tick) => {
  attacks.push({ ...attack });
  launchAttack(npc, attack, tick);
};
const rangedHits = [];
for (let tick = 0; tick < 1800; tick++) {
  engine.advanceTick([...engine.player().position]);
  rangedHits.push(...engine.getLastTickEvents().filter((event) =>
    event.type === "hit_applied" && event.targetId === "player" && event.attackKind === "range_arrow"));
}
const ranged = attacks.filter((attack) => attack.style === "range");
assert.ok(ranged.length > 50, "Encounter exercised ranged attacks");
assert.ok(ranged.some((attack) => !attack.accuracySucceeded), "Accuracy can fail independently of the damage roll");
assert.ok(ranged.every((attack) => attack.rolledDamage >= 15 && attack.rolledDamage <= 35));
assert.ok(ranged.some((attack) => attack.rolledDamage === 15), "Inclusive minimum");
assert.ok(ranged.some((attack) => attack.rolledDamage === 35), "Inclusive maximum");
assert.ok(rangedHits.some((hit) => !hit.accurate && hit.damage === 0), "Misses apply zero damage");
assert.ok(rangedHits.some((hit) => hit.accurate && hit.damage >= 15), "Successful hits apply the ranged minimum");
assert.ok(rangedHits.every((hit) => hit.accurate ? hit.damage >= 15 && hit.damage <= 35 : hit.damage === 0));

engine.player().activePrayer = Prayer.ProtectRange;
const protectedHits = [];
for (let tick = 0; tick < 300; tick++) {
  engine.player().prayerState.points = 99;
  engine.advanceTick([...engine.player().position]);
  protectedHits.push(...engine.getLastTickEvents().filter((event) =>
    event.type === "hit_applied" && event.targetId === "player" && event.attackKind === "range_arrow"));
}
assert.ok(protectedHits.some((hit) => hit.accurate), "Protected phase includes successful accuracy rolls");
assert.ok(protectedHits.every((hit) => hit.damage === 0), "Protect from Missiles still blocks ranged damage");

const bodyguards = createEngine(true);
const steelwillRolls = [];
const launchBodyguardAttack = bodyguards.launchNpcAttack.bind(bodyguards);
bodyguards.launchNpcAttack = (npc, attack, tick) => {
  if (attack.attackerId === "sergeant_steelwill") steelwillRolls.push(attack.rolledDamage);
  launchBodyguardAttack(npc, attack, tick);
};
for (let tick = 0; tick < 600; tick++) bodyguards.advanceTick([...bodyguards.player().position]);
assert.ok(steelwillRolls.length > 50);
assert.ok(steelwillRolls.every((damage) => damage >= 0 && damage <= 15), "Steelwill never rolls above 15");
assert.ok(steelwillRolls.includes(15), "Steelwill can roll his max hit");
console.log("Graardor ranged hits roll 15–35, misses/prayer block, Steelwill max hit is 15");
