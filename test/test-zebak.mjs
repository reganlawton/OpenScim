import assert from "node:assert/strict";
import { configure, scaleToaDamage } from "../client/toa/zebak/rules.js";
import { ZebakPhases } from "../client/toa/zebak/phases.js";
import { zebakDefinition } from "../client/toa/zebak/native.js";
for (const level of [0, 1, 2, 3, 4, 5, 6]) {
  const tier = Math.min(2, level >> 1);
  const rules = configure({
    path: level,
    blood: true,
    upset: true,
    spray: true,
    clouds: true,
    other: 255,
  });
  assert.equal(rules.raid, 300);
  assert.equal(rules.period, 7 - tier);
  assert.equal(rules.enragePeriod, 4 - tier);
  assert.equal(rules.cloudCount, 3);
  assert.equal(rules.gap, 3 - tier);
}
assert.equal(configure({ clouds: true, spray: true }).raid, 0);
console.log("Zebak invocation rules passed for path levels 0-6");

// The Tombs scale damage by 0.4% a raid level, to raid level 375.
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, raid level 370): the Tidal Waves' 6-10 hit 17, 14, 17, 19
// and 19 (ticks 176-193, 449, 450), within 14-24; a blood cloud's 1-3 hit 2, 4 or 7 (ticks 539-687).
assert.deepEqual([6, 10].map(damage => scaleToaDamage(damage, 370)), [14, 24]);
assert.deepEqual([1, 2, 3].map(damage => scaleToaDamage(damage, 370)), [2, 4, 7]);
assert.deepEqual([6, 9].map(damage => scaleToaDamage(damage, 370)), [14, 22]);
assert.equal(scaleToaDamage(10), 10);
assert.equal(scaleToaDamage(10, 0), 10);
assert.equal(scaleToaDamage(10, 375), 25);
assert.equal(scaleToaDamage(10, 600), 25);

// OBS (same recording, ticks 167, 168 and 178): a tick on an acid pool hit 19, the next tick 22 and a later
// single tick 14, each as a poison hitsplat, with no climb from 2. inferred: 6-9 times the raid level's scale.
for (const [raid, range] of [[0, [6, 9]], [370, [14, 22]]]) {
  const phases = new ZebakPhases(() => 0, () => new Set(["30,32", "31,32"]), () => {});
  const player = {alive: true, position: [30, 32]};
  const boss = {alive: true, vitals: {hp: 100, maxHp: 100}};
  const context = {tick: 1, world: {actors: new Map([["player", player]])}, tickEvents: {emit() {}}};
  phases.depositAcid([30, 32]);
  for (; context.tick <= 3; context.tick++) {
    const acid = phases.step(context, {raid}, boss).filter(hit => hit.source === "Zebak acid");
    assert.deepEqual(acid, [{source: "Zebak acid", baseDamage: range, attackType: "typeless", applyPoison: 2, hitsplatType: "poison"}]);
  }
  player.position = [31, 32];
  assert.deepEqual(phases.step(context, {raid}, boss), []);
}

// OBS (same recording, six wave hits and three acid hits, ticks 167-195 and 449-450): each also took
// prayer points, 2 for a 14, 3 for a 17 or a 19, 4 for a 22. inferred: a fifth of the damage, rounded down.
{
  const encounter = zebakDefinition({seedRandom: () => () => 0.5, walkable: () => new Set()}).factory();
  encounter.configureRunStart({});
  const taken = hit => encounter.getEngineRules().onPlayerDamageTaken(hit);
  for (const source of ["Tidal Wave", "Zebak acid"]) {
    for (const [damage, points] of [[14, 2], [17, 3], [19, 3], [22, 4], [12, 2], [5, 1]])
      assert.deepEqual(taken({source, effectiveDamage: damage, attackType: "typeless"}), {prayerPointsDelta: -points});
    assert.equal(taken({source, effectiveDamage: 4, attackType: "typeless"}), undefined);
  }
  for (const source of ["Blood cloud", "Great Roar", "Crocodile bite", "Zebak"])
    assert.equal(taken({source, effectiveDamage: 22, attackType: "typeless"}), undefined);
}
console.log("Raid-level damage scale, acid as poison and the prayer points a wave or acid takes passed.");
