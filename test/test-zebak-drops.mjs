import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";
import { zebakPresentation } from "../client/toa/zebak/native.js";
import { configure } from "../client/toa/zebak/rules.js";

const arena = new Set();
for (let x = 22; x <= 38; x++)
  for (let y = 23; y <= 41; y++) arena.add([x, y].join(","));
const events = [];
const splats = [];
const effects = zebakPresentation(class {}).audio.rules.inferno_visual;
const phases = new ZebakPhases(() => 0.3, () => arena, (_, event) => events.push(event));
const boss = {alive: true, position: [14, 28], size: 9, vitals: {hp: 100, maxHp: 100}};
const player = {alive: true, position: [33, 32], equipment: {}};
const context = {tick: 10, world: {actors: new Map([["zebak", boss], ["player", player]])},
  spawnNpc() {}, despawnNpc() {}, tickEvents: {emit(event) {splats.push(event);}}};
const settings = {acidWidth: 5, jugWidth: 5, gap: 3};
phases.begin(context, "roar", settings);
const launch = events.at(-1);
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the specials animated on ticks 300 and 544, which start
// on 299 and 543): his head alone plays the spit, a tick after the special starts, and the vomit is heard
// then; the throw leaves 60 cycles after the start, from 250 high on slope 35, and all of it lands at 180:
// rocks 2172, jugs 2173, pools that spread 1555, single pools 2194.
assert.deepEqual(launch.animations, [{actorId: "zebak", clipId: "attack", delayCycles: 30}]);
assert.equal(launch.throwDelayCycles, 0);
assert.ok(launch.projectiles.every(cue => cue.startDelayCycles === 60 && cue.endDelayCycles === 180));
assert.ok(launch.projectiles.every(cue => cue.startHeight === 250 && cue.endHeight === 0 && cue.slope === 35));
const thrown = id => launch.projectiles.filter(cue => cue.spotAnimId === id).length;
assert.deepEqual([thrown(2172), thrown(2173), thrown(1555), thrown(2194)], [2, 7, 6, 7]);
assert.equal(launch.projectiles.length, 22);
assert.equal(effects.resolve(launch).sound.id, 5908);
assert.equal(effects.resolve(launch).sound.delayCycles, 30);
for (context.tick++; context.tick < 16; context.tick++) {
  phases.step(context, settings, boss);
  assert.equal(phases.acid.size + phases.of("rock").length + phases.of("jug").length, 0);
}
// OBS (same recording, ticks 154, 305, 367, 426, 549): acid, rocks and jugs land in the same tick, 6 after
// the special starts. No graphic where a pool lands; a splat is heard a cycle later and the spray of the
// pools that spread flies along the ground on slope 20. Dust 2184 and 5913 where a rock or a jug lands.
phases.step(context, settings, boss);
const [impact, landing] = events.slice(-2);
assert.equal(impact.acidLanded, true);
assert.deepEqual(impact.graphics, []);
assert.ok(impact.projectiles.length > 0);
assert.ok(impact.projectiles.every(cue => cue.spotAnimId === 2194 && cue.startHeight === 0 && cue.endHeight === 0 && cue.slope === 20));
assert.deepEqual(new Set(impact.projectiles.map(cue => cue.endDelayCycles)), new Set([30,60]));
assert.deepEqual(effects.resolve(impact).sound, {id: 5909, delayCycles: 1, channel: "sfx"});
assert.equal(landing.objectsLanded, true);
assert.deepEqual(landing.graphics.map(cue => cue.spotAnimId), Array(9).fill(2184));
assert.deepEqual(new Set(landing.graphics.map(cue => cue.target.position.join(","))),
  new Set([...phases.of("rock"), ...phases.of("jug")].map(object => object.actor.position.join(","))));
assert.equal(effects.resolve(landing).sound.id, 5913);
assert.equal(phases.of("rock").length, 2);
assert.equal(phases.of("jug").length, 7);
const initialAcid = phases.acid.size;
assert.equal(initialAcid, 13);
context.tick++;
phases.step(context, settings, boss);
assert.ok(phases.acid.size > initialAcid);
const innerSpread = phases.acid.size;
context.tick++;
phases.step(context, settings, boss);
assert.ok(phases.acid.size > innerSpread);
{
  // OBS (same recording, the specials that start on ticks 147, 360 and 419 with a blood spell): the vomit,
  // the flight and the landing are each one tick later; the animation is not.
  const events = [];
  const phases = new ZebakPhases(() => 0.3, () => arena, (_, event) => events.push(event));
  const context = {tick: 10, world: {actors: new Map([["zebak", boss], ["player", player]])},
    spawnNpc() {}, despawnNpc() {}, tickEvents: {emit() {}}};
  phases.begin(context, "roar", settings, true);
  const launch = events.at(-1);
  assert.equal(phases.active.throwDelay, 1);
  assert.deepEqual(launch.animations, [{actorId: "zebak", clipId: "attack", delayCycles: 30}]);
  assert.ok(launch.projectiles.every(cue => cue.startDelayCycles === 90 && cue.endDelayCycles === 210));
  assert.equal(effects.resolve(launch).sound.delayCycles, 60);
  for (context.tick++; context.tick < 17; context.tick++) {
    phases.step(context, settings, boss);
    assert.equal(phases.acid.size + phases.of("rock").length + phases.of("jug").length, 0);
  }
  phases.step(context, settings, boss);
  assert.deepEqual([phases.of("rock").length, phases.of("jug").length, phases.acid.size], [2, 7, 13]);
  const spread = phases.acid.size;
  context.tick++;
  phases.step(context, settings, boss);
  assert.ok(phases.acid.size > spread);
}

const jug = phases.of("jug")[0];
jug.actor.position = [30,23];
jug.remaining = 1;
jug.step = [0,-1];
phases.stepJugs(context, settings, player);
const splash = events.at(-1);
assert.equal(splash.graphics[0].spotAnimId, 2449);
assert.deepEqual(splash.graphics[0].target.position, [30,22]);
assert.equal(effects.resolve(splash).sound.id, 5880);
assert.equal(phases.actors.has(jug.actor.id), false);

const other = phases.of("jug")[0];
other.actor.position = [...player.position];
player.attackTarget = other.actor.id;
phases.pendingJug = {action: "Hit", id: other.actor.id};
context.attackObject = () => 2;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), true);
assert.equal(player.attackTarget, null);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), true);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(other.kind, "broken-jug");
assert.equal(splats.at(-1).amount, 5);
assert.deepEqual(other.actor.vitals, {hp: 0, maxHp: 5});
context.tick++;
phases.stepJugs(context, settings, player);
assert.ok(events.at(-1).graphics.some(cue => cue.spotAnimId === 2192));
assert.equal(events.at(-1).jugBreakCause, "weapon");
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 377, 399, 433, 564, 577): 2496 as a jug goes, whatever broke it.
assert.deepEqual(effects.resolve(events.at(-1)), {kind: "play", sound: {id: 2496, channel: "sfx"}});
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), false);
const shelter = phases.of("rock")[0];
const moving = phases.spawn(context, "jug", 11736, [shelter.actor.position[0]-1, shelter.actor.position[1]]);
moving.step = [1,0];
moving.remaining = 4;
phases.stepJugs(context, settings, player);
assert.deepEqual(splats.at(-1), {type: "hitsplat_spawned", targetId: moving.actor.id, amount: 5, hitsplatType: "damage"});
assert.equal(moving.actor.vitals.hp, 0);
assert.equal(moving.actor.healthBarWhenUntargetable, true);
assert.equal(shelter.actor.vitals.hp, 150);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(events.at(-1).jugBreakCause, "collision");
assert.deepEqual(effects.resolve(events.at(-1)), {kind: "play", sound: {id: 2496, channel: "sfx"}});

phases.clearSpecial(context);
phases.begin(context, "waves", settings);
const start = context.tick;
let fallTick = null;
for (; context.tick <= start + 15; context.tick++) {
  const before = events.length;
  phases.step(context, settings, boss);
  if (fallTick === null && events.slice(before).some(event => event.graphics.some(cue => cue.spotAnimId === 2195))) fallTick = context.tick;
}
const fall = events.find(event => event.graphics.some(cue => cue.spotAnimId === 2195));
const shoreBursts = fall.graphics.filter(cue => cue.spotAnimId === 68);
// OBS (same recording, ticks 155, 307, 427): seven boulders on the shore row, every third column from 19
// to 37, 8 ticks after the waves start, with 1678 and the sweep 5882 and, 200 cycles on, 5843.
assert.equal(shoreBursts.length, 7);
assert.deepEqual(shoreBursts.map(cue => cue.target.position), [19, 22, 25, 28, 31, 34, 37].map(x => [x, 21]));
assert.equal(fallTick, start + 8);
assert.ok(shoreBursts.every(cue => cue.delayCycles === 200));
assert.ok(fall.graphics.filter(cue => cue.spotAnimId === 2195).every(cue => cue.delayCycles === 6));
assert.deepEqual(shoreBursts.map(cue => cue.target.position),
  fall.graphics.filter(cue => cue.spotAnimId === 2195).map(cue => cue.target.position));
assert.deepEqual(effects.resolve(fall).sound.map(s => [s.id, s.delayCycles]), [[1678,0],[5882,0],[5843,200]]);
assert.equal(effects.resolve(events.find(event => event.tidalSurgeSound)).sound.id, 5852);
for (const upset of [false, true]) {
  const settings = configure({upset});
  const jug = phases.spawn(context, "jug", 11735, [30, 32]);
  const wet = new Set();
  const dry = new Set();
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const position = [30 + dx, 32 + dy];
      const tile = position.join(",");
      phases.depositAcid(position);
      (Math.max(Math.abs(dx), Math.abs(dy)) <= (upset ? 1 : 2) ? wet : dry).add(tile);
    }
  }
  phases.breakJug(context, jug, "roar");
  context.tick++;
  phases.stepJugs(context, settings, player);
  assert.equal(wet.size, upset ? 9 : 25);
  assert.deepEqual(new Set(phases.splashes.at(-1).tiles.map(p => p.join(","))), wet);
  const groundWater = events.at(-1).graphics.filter(g => g.spotAnimId === 95);
  assert.equal(events.at(-1).jugBreakCause, "roar");
  assert.deepEqual(effects.resolve(events.at(-1)), {kind: "play", sound: {id: 2496, channel: "sfx"}});
  assert.deepEqual(new Set(groundWater.map(g => g.target.position.join(","))), wet);
  for (const tile of wet) assert.ok(!phases.acid.has(tile));
  for (const tile of dry) assert.ok(phases.acid.has(tile));
}
console.log("Verified special spit, primary landing, acid spread, jug impact and water entry, shore fall and crest.");
