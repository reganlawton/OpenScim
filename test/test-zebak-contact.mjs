import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";

// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the twelve clouds of ticks 150, 363, 525 and 672, Blood
// Thinners on, raid level 370):
// - a cloud appears on a tile of columns 28-30, rows 24-26 or 38-40, and first moves 3 ticks later;
// - from its 4th tick it loses 2 hitpoints every tick, moving or not;
// - it walks onto the player's own tile; the tick after it reaches it, it hits him for 2, 4 or 7 (1-3 times
//   the raid level's scale; ticks 539, 542, 682, 687), heals itself half of that with a heal hitsplat, and
//   loses nothing the tick after; it stays on that tile 2 more ticks, then follows him again (538-544);
// - Zebak's hitpoints never rose with a cloud's hit;
// - at 0 it stops, plays 8103 two ticks later and is gone three ticks after that (ticks 168-173).
function fixture(size, walkable = [], random = () => 0, raid = 370) {
  const tiles = new Set(walkable);
  const phases = new ZebakPhases(random, () => tiles, () => {});
  phases.raid = raid;
  const boss = {alive: true, vitals: {hp: 90, maxHp: 100}};
  const player = {alive: true, position: [30, 32]};
  const events = [];
  const context = {
    tick: 1, spawnNpc() {}, despawnNpc() {},
    tickEvents: {emit: event => events.push(event)},
    world: {actors: new Map([["player", player], ["zebak", boss]])},
  };
  const clot = phases.spawn(context, "cloud", size === 1 ? 11743 : 11742, [30, 32], 20);
  clot.aggro = true;
  return {phases, boss, player, clot, context, events};
}
const row = (y, from = 22, to = 38) => Array.from({length: to - from + 1}, (_, i) => [from + i, y].join(","));

// Contact is the cloud's footprint over the player's tile, not the tiles beside it; the hit is the tick after.
for (const size of [1, 2]) {
  for (const spray of [false, true]) {
    for (const [roll, damage, heal] of [[0, 2, 1], [0.5, 4, 2], [0.99, 7, 3]]) {
      for (let dx = -2; dx <= size + 1; dx++) {
        for (let dy = -2; dy <= size + 1; dy++) {
          const {phases, boss, player, clot, context, events} = fixture(size, [], () => roll);
          clot.actor.vitals.hp = 15;
          context.tick = 4; // its third tick: the first on which it can reach him
          player.position = [30 + dx, 32 + dy];
          const covered = dx >= 0 && dx < size && dy >= 0 && dy < size;
          assert.deepEqual(phases.resolveCloudContact(context), []);
          assert.equal(clot.contactDue, covered ? 5 : undefined);
          assert.equal(clot.restsUntil, covered ? 6 : undefined);
          assert.deepEqual(events, []);
          // The next tick, wherever he has gone meanwhile.
          player.position = [36, 40];
          context.tick = 5;
          const hits = [];
          phases.clouds(context, player, hits, {spray}, boss);
          assert.deepEqual(hits.map(hit => [hit.source, hit.baseDamage, hit.attackType]),
            covered ? [["Blood cloud", damage, "typeless"]] : []);
          // inferred: only Arterial Spray heals Zebak by a cloud's hit.
          assert.equal(boss.vitals.hp, 90 + (covered && spray ? 4 : 0));
          // The heal hitsplat, then the 2 it loses on every tick from its fourth.
          assert.deepEqual(events.map(event => [event.targetId, event.amount, event.hitsplatType]), covered
            ? [[clot.actor.id, heal, "heal"], [clot.actor.id, 2, "damage"]]
            : [[clot.actor.id, 2, "damage"]]);
          assert.equal(clot.actor.vitals.hp, 15 - 2 + (covered ? heal : 0));
          // The tick after the hit it loses nothing; then 2 a tick again.
          context.tick = 6;
          phases.clouds(context, player, [], {spray}, boss);
          assert.equal(clot.actor.vitals.hp, 15 - (covered ? 2 - heal : 4));
          context.tick = 7;
          phases.clouds(context, player, [], {spray}, boss);
          assert.equal(clot.actor.vitals.hp, 15 - (covered ? 4 - heal : 6));
        }
      }
    }
  }
}
{
  // Before the raid level a hit is 1-3; a 1 heals nothing and shows no heal hitsplat.
  const {phases, boss, player, clot, context, events} = fixture(1, [], () => 0, 0);
  context.tick = 4;
  phases.resolveCloudContact(context);
  context.tick = 5;
  const hits = [];
  phases.clouds(context, player, hits, {}, boss);
  assert.deepEqual(hits.map(hit => hit.baseDamage), [1]);
  assert.deepEqual(events.map(event => event.hitsplatType), ["damage"]);
  assert.equal(clot.actor.vitals.hp, 18);
}
{
  // On his tile before its third tick it does not hit yet.
  const {phases, player, clot, context} = fixture(1, ["31,32"]);
  context.tick = clot.actor.spawnTick + 1;
  phases.clouds(context, player, [], {}, null);
  assert.deepEqual(phases.movementFor(clot.actor), []);
  assert.deepEqual(phases.resolveCloudContact(context), []);
  assert.equal(clot.contactDue, undefined);
}

// The chase of ticks 538-544: onto his tile, the hit a tick later though he has left, two ticks of rest.
{
  const {phases, boss, player, clot, context, events} = fixture(1, row(32), () => 0.5);
  player.position = [33, 32];
  function tick() {
    context.tick++;
    const hits = [];
    phases.clouds(context, player, hits, {}, boss);
    const move = phases.movementFor(clot.actor)[0];
    if (move) clot.actor.position = move.path[0];
    phases.resolveCloudContact(context);
    return {hits: hits.map(hit => hit.baseDamage), at: clot.actor.position[0], hp: clot.actor.vitals.hp};
  }
  const log = [];
  for (let n = 0; n < 5; n++) log.push(tick()); // ticks 2-6
  // Still for 3 ticks, a tile a tick from its 3rd, 2 hitpoints a tick from its 4th.
  assert.deepEqual(log.map(entry => entry.at), [30, 30, 31, 32, 33]);
  assert.deepEqual(log.map(entry => entry.hp), [20, 20, 20, 18, 16]);
  assert.deepEqual(log.flatMap(entry => entry.hits), []);
  player.position = [36, 32]; // he runs off as it arrives: hit all the same
  assert.deepEqual(tick(), {hits: [4], at: 33, hp: 16}); // tick 7: +2 healed, -2 lost
  assert.deepEqual(tick(), {hits: [], at: 33, hp: 16}); // tick 8: resting, and nothing lost
  assert.deepEqual(tick(), {hits: [], at: 34, hp: 14}); // tick 9: follows him again
  assert.deepEqual(events.map(event => [event.amount, event.hitsplatType]),
    [[2, "damage"], [2, "damage"], [2, "heal"], [2, "damage"], [2, "damage"]]);
  assert.equal(boss.vitals.hp, 90);
  // A rock on the next tile holds it up; it goes on losing 2 a tick where it stands.
  phases.spawn(context, "rock", 11737, [35, 32], 150);
  assert.deepEqual(tick(), {hits: [], at: 34, hp: 12});
  assert.deepEqual(tick(), {hits: [], at: 34, hp: 10});
}

// Its death: at 0 it stands, plays 8103 two ticks later and is gone three ticks after that.
{
  const {phases, boss, player, clot, context, events} = fixture(1, []); // no tile to walk on: it never moves
  player.position = [36, 40];
  clot.actor.vitals.hp = 3;
  const idle = clot.actor.combat.animations.idle;
  assert.equal(idle, 8102);
  const seen = [];
  for (context.tick = 2; context.tick <= 12; context.tick++) {
    phases.clouds(context, player, [], {}, boss);
    assert.deepEqual(phases.movementFor(clot.actor), []);
    phases.resolveCloudContact(context);
    seen.push([context.tick, clot.actor.vitals.hp, clot.actor.combat.animations.idle, phases.actors.has(clot.actor.id)]);
  }
  assert.deepEqual(seen, [
    [2, 3, 8102, true], [3, 3, 8102, true], [4, 3, 8102, true],
    [5, 1, 8102, true], // its 4th tick
    [6, 0, 8102, true], // dies of the last 1
    [7, 0, 8102, true],
    [8, 0, 8103, true],
    [9, 0, 8103, true], [10, 0, 8103, true],
    [11, 0, 8103, false],
    [12, 0, 8103, false],
  ]);
  assert.deepEqual(events.map(event => event.amount), [2, 1]);
  assert.equal(phases.of("cloud").length, 0);
}
console.log("Both cloud footprints passed the contact tile, the delayed hit and its heal for 2, 4 and 7, Arterial Spray, the chase and rest, a blocked step and the death.");

// Where they appear: a random tile of a 3x3 by either shore, each cloud its own.
for (const [south, rows] of [[true, [24, 25, 26]], [false, [38, 39, 40]]]) {
  // The first roll is the constructor's (which special comes first); then the shore, then a column and a row each.
  const rolls = [0.5, south ? 0.2 : 0.8, 0, 0, 0.5, 0.5, 0.99, 0.99];
  const {phases, player, context, clot} = fixture(1, [], () => rolls.shift());
  phases.remove(context, clot);
  phases.summonClouds(context, {clouds: true, cloudCount: 3}, player);
  assert.deepEqual(phases.of("cloud").map(cloud => cloud.actor.position), [[28, rows[0]], [29, rows[1]], [30, rows[2]]]);
  assert.deepEqual(phases.of("cloud").map(cloud => cloud.actor.npcTypeId), [11743, 11743, 11743]);
  assert.equal(rolls.length, 0);
}
{
  // Two may share a tile (tick 150: two on (28,26)).
  const {phases, player, context, clot} = fixture(1, [], () => 0.7);
  phases.remove(context, clot);
  phases.summonClouds(context, {clouds: true, cloudCount: 3}, player);
  assert.deepEqual(phases.of("cloud").map(cloud => cloud.actor.position), [[30, 40], [30, 40], [30, 40]]);
}

for (const [thinned, maxHp] of [[false,25],[true,30]]) {
  const land = Array.from({length:24},(_,i) => Array.from({length:24},(_,j) => [28+i,23+j].join(","))).flat();
  const {phases, boss, player, context, events, clot} = fixture(1, land);
  phases.remove(context, clot);
  context.tick = 4;
  phases.summonClouds(context, {clouds:thinned, cloudCount:thinned ? 3 : 1}, player);
  const clouds = phases.of("cloud");
  assert.equal(clouds.length,thinned ? 3 : 1);
  player.position = [51,24]; // too far to reach in its lifetime
  for (const cloud of clouds) assert.deepEqual(cloud.actor.vitals,{hp:maxHp,maxHp});
  const start = context.tick;
  const lifetime = Math.ceil(maxHp/2)+3; // dies on this tick after it appeared
  for (let i=1; i<=lifetime+5; i++) {
    context.tick++;
    const hits = [];
    phases.clouds(context,player,hits,{},boss);
    assert.deepEqual(hits, []);
    for (const cloud of clouds) {
      const moves=phases.movementFor(cloud.actor);
      if (i<3) assert.deepEqual(moves,[]);
      if (i>=3 && i<lifetime) assert.equal(moves.length,1);
      if (i>=lifetime) assert.deepEqual(moves,[]);
      if (moves.length) cloud.actor.position=moves[0].path[0];
    }
    phases.resolveCloudContact(context);
    if (context.tick-start<4) assert.equal(events.filter(e=>e.type==="hitsplat_spawned").length,0);
    if (context.tick-start===4) assert.equal(events.filter(e=>e.type==="hitsplat_spawned").length,clouds.length);
    assert.equal(phases.of("cloud").length, i < lifetime + 5 ? clouds.length : 0);
  }
  assert.deepEqual(phases.of("cloud"),[]);
  for (const cloud of clouds) {
    const pulses = events.filter(e=>e.targetId===cloud.actor.id).map(e=>e.amount);
    assert.deepEqual(pulses,thinned ? Array(15).fill(2) : [...Array(12).fill(2),1]);
  }
}
console.log("Recorded spawn tiles and lifetimes passed for normal and thinned clouds.");
