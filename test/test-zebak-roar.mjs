import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";

import { roarWindupTick, roarTicks, roarSpecialRecovery } from "../client/toa/zebak/timing.js";

// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the roars animated on ticks 394 and 572): dust on the
// roar's 3rd, 5th and 7th tick (397/399/401, 575/577/579), 50 on the boulders and the jugs broken on its
// 4th, 6th and 8th (398/400/402, 576/578/580), his next spit on its 11th (405, 583), and his first spit
// after the roar's special 11 ticks after it starts (371, 554).
assert.deepEqual(roarTicks, {dust: [3, 5, 7], damage: [4, 6, 8], over: 11, dustOrigin: [22, 32]});
assert.equal(roarSpecialRecovery, 11);

for (const [period, first, second] of [[7,34,29],[6,31,26],[5,29,24]]) {
  assert.equal(roarWindupTick(period), first);
  assert.equal(roarWindupTick(period, true), second);
}

const tiles = new Set();
for (let x = 22; x <= 38; x++)
  for (let y = 24; y <= 40; y++) tiles.add([x, y].join(","));

for (const [playerX, expectedHits] of [[27, 0], [29, 0], [30, 3]]) {
  const events = [];
  const phases = new ZebakPhases(() => 0, () => tiles, (_, event) => events.push(event));
  const player = {alive: true, position: [playerX, 29]};
  const boss = {alive: true, vitals: {hp: 100, maxHp: 100}};
  const splats = [];
  const context = {tick: 0, world: {actors: new Map([["player", player]])}, spawnNpc() {}, despawnNpc() {},
    tickEvents: {emit: event => splats.push(event)}};
  const jug = phases.spawn(context, "jug", 11735, [34, 31], 5);
  phases.depositAcid([34,31]);
  const rock = phases.spawn(context, "rock", 11737, [26, 29], 150);
  phases.active = {kind: "roar", start: 0};
  let hits = 0;
  const hitTicks = [];
  // The roar is animated 34 ticks after its special starts: dust on 37, 39, 41, damage on 38, 40, 42.
  for (context.tick = 0; context.tick <= 45; context.tick++) {
    const taken = phases.step(context, {period: 7, jugWidth: 5}, boss).filter(hit => hit.source === "Great Roar");
    if (taken.length) hitTicks.push(context.tick);
    hits += taken.length;
    if (context.tick === 37) {
      // The dust of the first pulse: nothing is hurt yet.
      assert.equal(jug.actor.vitals.hp, 5);
      assert.equal(rock.actor.vitals.hp, 150);
    }
    if (context.tick === 38) {
      assert.equal(jug.actor.vitals.hp, 0);
      assert.equal(jug.shatterTick, 39);
      assert.equal(rock.actor.vitals.hp, 100);
      assert.ok(phases.acid.has("34,31"));
    }
    if (context.tick === 39) {
      assert.ok(!phases.actors.has(jug.actor.id));
      assert.ok(!phases.acid.has("34,31"));
      assert.equal(phases.splashes.length, 1);
    }
    // The rock stands, at 0, until the roar is over on its 11th tick.
    if (context.tick === 44) assert.equal(phases.active?.kind, "roar");
    if (context.tick === 44) assert.ok(phases.actors.has(rock.actor.id));
  }
  assert.equal(phases.active, null);
  assert.ok(!phases.actors.has(rock.actor.id));
  assert.equal(hits, expectedHits);
  assert.deepEqual(hitTicks, expectedHits ? [38, 40, 42] : []);
  assert.deepEqual(splats.filter(splat => splat.targetId === rock.actor.id).map(splat => splat.amount), [50,50,50]);
  assert.deepEqual(splats.filter(splat => splat.targetId === jug.actor.id).map(splat => splat.amount), [5]);
  // Each pulse is one event: its dust and the number of its sound. The rock's debris is its own, later.
  const pulses = events.filter(event => event.roarPulse !== undefined);
  assert.deepEqual(pulses.map(event => event.roarPulse), [0, 1, 2]);
  assert.ok(pulses.every(event => event.graphics.every(cue => cue.spotAnimId === 2184)));
  assert.deepEqual(events.filter(event => event.graphics.some(cue => cue.spotAnimId === 2191))
    .map(event => [event.roarPulse, event.graphics.length]), [[undefined, 1]]);
  for (const pulse of pulses) {
    const byTile = new Map(pulse.graphics.map(cue => [cue.target.position.join(","), cue.delayCycles]));
    assert.equal(byTile.size, tiles.size - 4);
    for (let x = 26; x <= 29; x++) assert.ok(!byTile.has([x,29].join(",")));
    // OBS (same roars, 279 tiles a pulse): a tile's dust starts 1 cycle after the pulse and 1 more for each
    // tile, east-west plus north-south, from the tile before his jaw (22,32): 2 at (23,32), 9 at (23,25).
    for (const [tile, delay] of byTile) {
      const [x, y] = tile.split(",").map(Number);
      assert.equal(delay, 1 + Math.abs(x - 22) + Math.abs(y - 32));
    }
    assert.equal(byTile.get("23,32"), 2);
    assert.equal(byTile.get("23,25"), 9);
    assert.equal(byTile.get("38,37"), 22);
  }
}
console.log("All three roar fronts cover exposed tiles and leave the three shelter tiles clear.");

