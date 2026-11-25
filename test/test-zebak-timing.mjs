import assert from "node:assert/strict";
import {zebakDefinition, zebakPresentation} from "../client/toa/zebak/native.js";
import {spitClips, spitSoundCycles, roarSpecialRecovery} from "../client/toa/zebak/timing.js";

// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, path level 0, all 77 spits, e.g. ticks 112-120, 229-237
// and, enraged, 618-626): the pot leaves the tile 7 east and 4 north of his south-west tile 60 cycles after
// the animation starts, 200 high, rises on slope 30 to 700 above the tile 15 east, bursts there at 120
// cycles (the graphic at 750) and one piece, 2181 of the magic pot or 2187 of the ranged, comes down on slope
// 127 to 90 on the player at 210 cycles; the hitsplat is 8 ticks after the animation starts. Enraged he
// spits with the same animation (9624, tail 9625) and the same pots (2176, 2178). The burst is heard at 120
// cycles and the impact at 210. Path levels 4-6 keep their estimates from footage.
const clips = spitClips(9624, 9626);
assert.deepEqual(clips.standardSpit, {seqId: 9624, releaseFrame: 66, releaseCycle: 60});
assert.deepEqual(clips.standardEnragedSpit, {seqId: 9624, releaseFrame: 66, releaseCycle: 60});
assert.deepEqual(clips.fastSpit, {seqId: 9624, releaseFrame: 66, releaseCycle: 56});
assert.deepEqual(clips.fastEnragedSpit, {seqId: 9626, releaseFrame: 32, releaseCycle: 32});
assert.deepEqual(spitSoundCycles(8), {redirect: 120, impact: 210});
assert.deepEqual(spitSoundCycles(5), {redirect: 90, impact: 150});

const audio = zebakPresentation(class {}).audio.rules;
for (const path of [0,1,2,3,4,5,6]) {
  for (const enraged of [false,true]) {
    for (const magic of [false,true]) {
      let attack, damage, visuals;
      const encounter = zebakDefinition({
        stats: () => ({}),
        seedRandom: () => () => magic ? 0.2 : 0.8,
        rollAttack: ({plan}) => { damage = plan; },
        projectile: (_boss,target,config,end) => ({
          target: {kind:"actor", position:[...target.position]},
          slope:config.slope, startHeight:config.startHeight, endHeight:config.endHeight, spotAnimId:config.spotAnimId, startDelayCycles:config.timing.delay, endDelayCycles:end,
        }),
        showAttack: (_context,event) => { attack = event; },
        animate: (_events,event) => { visuals = event; },
      }).factory();
      encounter.configureRunStart({path});
      const [boss] = encounter.createNpcs();
      encounter.phases.enraged = enraged;
      if (enraged) boss.npcTypeId = 11732;
      const player = {alive:true,position:[[24,24], [29,32], [37,40]][path % 3]};
      const tick = 10;
      encounter.processNpcTick(boss, {tick,world:{actors:new Map([["player",player]])}});
      const fast = path >= 4;
      assert.equal(attack.projectiles.length, 2); // the pot and the one piece: no debris
      const [launch,secondary] = attack.projectiles;
      const jaw = !fast ? [21.5,32.5] : enraged ? [22.49,32.54] : [22.58,32.54];
      assert.equal(attack.clipId, (fast ? "fast" : "standard") + (enraged ? "EnragedSpit" : "Spit"));
      assert.deepEqual(visuals.animations, [{actorId: "zebak-tail", clipId: attack.clipId, delayCycles: 0}]);
      assert.equal(launch.spotAnimId, magic ? (enraged && fast ? 2177 : 2176) : enraged && fast ? 2179 : 2178);
      assert.equal(secondary.spotAnimId, magic ? 2181 : 2187);
      assert.deepEqual([launch.startHeight, launch.endHeight], fast ? [enraged ? 315 : 309, 560] : [200, 700]);
      if (!fast) assert.equal(launch.slope, 30);
      assert.deepEqual([secondary.startHeight, secondary.endHeight, secondary.slope], fast ? [560, 64, 0] : [700, 90, 127]);
      assert.equal(visuals.graphics.length, 1);
      assert.equal(visuals.graphics[0].spotAnimId, magic ? 2186 : 2185);
      assert.ok(Math.hypot(launch.sourcePosition[0]-jaw[0], launch.sourcePosition[1]-jaw[1]) < 0.01);
      const burst = launch.target.position.map(v => v + 0.5);
      assert.deepEqual(burst, [29.5,32.5]);
      const center = boss.position.map(v => v + boss.size / 2);
      assert.equal(Math.hypot(burst[0]-center[0], burst[1]-center[1]), 11);
      assert.ok(launch.slope > 0);
      assert.ok(launch.endHeight > launch.startHeight);
      assert.deepEqual(launch.target.position.map(v => v + 0.5), secondary.sourcePosition);
      assert.deepEqual(secondary.target, {kind:"actor", position:player.position});
      assert.ok(attack.projectiles.slice(1).every(p => p.startHeight === launch.endHeight));
      assert.equal(visuals.graphics[0].height,fast ? launch.endHeight : 750);
      assert.equal(launch.startDelayCycles,path >= 4 ? (enraged ? 32 : 56) : 60);
      assert.ok(launch.endDelayCycles > launch.startDelayCycles);
      assert.equal(launch.endDelayCycles,secondary.startDelayCycles);
      assert.equal(visuals.graphics[0].delayCycles,secondary.startDelayCycles);
      assert.equal(secondary.endDelayCycles,path >= 4 ? 142 : 210);
      assert.equal(attack.impactDelayTicks,damage.impactDelayTicks);
      assert.equal(damage.prayerCheckAt, "impact");
      assert.equal(secondary.startDelayCycles,path >= 4 ? 85 : 120);
      assert.equal(attack.impactDelayTicks,path >= 4 ? 5 : 8);
      const cues = audio.zuk_attack.resolve({attack:attack.kind, launchTick:tick, impactTick:tick+attack.impactDelayTicks});
      assert.deepEqual(cues.sound.map(s => [s.id, s.delayCycles ?? 0]), [
        [magic ? 5823 : 5819, 0], [magic ? 5878 : 5896, path >= 4 ? 90 : 120],
        [5884, path >= 4 ? 150 : 210],
      ]);
      assert.equal(encounter.attackTick-tick,(enraged?4:7)-Math.min(2,Math.floor(path/2)));
    }
  }
}
console.log("28 ranged and magic timelines passed across normal, enrage and path levels 0-6");

// What he does on his turns, at path level 0. `spits` are the ticks he spat on, `shown` every visual.
function turns(mechanics, setup, lastTick) {
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 22; y <= 42; y++) tiles.add([x,y].join(","));
  const spits = [], shown = [];
  let tick = 0;
  const encounter = zebakDefinition({
    stats: () => ({}), seedRandom: () => () => 0.8, walkable: () => tiles, rollAttack: () => undefined,
    projectile: () => ({}), showAttack: () => spits.push(tick), animate: (_events, event) => shown.push({tick, event}),
  }).factory();
  encounter.configureRunStart({path: 0, ...mechanics});
  const [boss] = encounter.createNpcs();
  const player = {alive: true, position: [29,32]};
  const context = {tick, tickEvents: {}, world: {actors: new Map([["player",player],["zebak",boss]])}};
  setup?.(encounter);
  for (tick = 1; tick <= lastTick; tick++) {
    context.tick = tick;
    encounter.processNpcTick(boss, context);
  }
  return {encounter, spits, shown};
}
const casts = shown => shown.filter(({event}) => event.graphics.some(cue => cue.spotAnimId === 377));
// OBS (same recording, all ten casts, e.g. ticks 147, 264, 360): a blood spell comes with every sixth spit,
// and both hands show 377 for the clouds as for the barrage, on the tiles (21,34) and (20,30).
{
  const {encounter, spits, shown} = turns({blood: true}, null, 81);
  assert.deepEqual(spits, [4, 11, 18, 25, 32, 39, 46, 53, 60, 67, 74, 81]);
  assert.deepEqual(casts(shown).map(cast => cast.tick), [39, 81]);
  for (const {event} of casts(shown))
    assert.deepEqual(event.graphics.map(cue => [cue.spotAnimId, cue.target.position, cue.height]),
      [[377, [21,34], 16], [377, [20,30], 16]]);
  assert.deepEqual([...encounter.pendingBloodClouds], [42]); // the clouds, 3 ticks after their cast
  assert.deepEqual([...encounter.pendingBarrages], [84]); // then a barrage
}
// OBS (same recording, ticks 147, 360, 419): a blood spell that is due as a special starts is cast with it,
// and the special's throw is then a tick later; the special's spit is still animated a tick after its start.
for (const due of [false, true]) {
  const {encounter, spits, shown} = turns({blood: true}, encounter => {
    encounter.autoCount = due ? 5 : 0;
    encounter.phases.queue.push("waves");
  }, 4);
  assert.deepEqual(spits, []);
  assert.equal(encounter.phases.active.kind, "waves");
  assert.equal(encounter.phases.active.start, 4);
  assert.equal(encounter.phases.active.throwDelay, due ? 1 : 0);
  assert.deepEqual(casts(shown).map(cast => cast.tick), due ? [4] : []);
  assert.deepEqual([...encounter.pendingBloodClouds], due ? [7] : []);
  assert.equal(encounter.autoCount, due ? 0 : 1);
  const launch = shown.at(-1).event;
  assert.deepEqual(launch.animations, [{actorId: "zebak", clipId: "attack", delayCycles: 30}]);
  assert.equal(launch.throwDelayCycles, due ? 30 : 0);
  assert.ok(launch.projectiles.length > 0);
  assert.ok(launch.projectiles.every(cue => cue.startDelayCycles === (due ? 90 : 60) && cue.endDelayCycles === (due ? 210 : 180)));
  assert.equal(encounter.attackTick, 11);
}
// OBS (same recording, spits at ticks 163/170/180, 315/322/332 and 435/442/452, the waves starting on 147,
// 299 and 419): during the waves he spits 16 and 23 ticks after they start and then not before the 33rd.
{
  const {spits} = turns({}, encounter => encounter.phases.queue.push("waves"), 50);
  assert.deepEqual(spits, [20, 27, 37, 44]);
}
// OBS (same recording, spits at ticks 371 and 554, the roars' specials starting on 360 and 543): his first
// spit after a roar's special is 11 ticks after it starts; from the roar's own start (34 ticks after) he
// spits no more until it is over.
{
  assert.equal(roarSpecialRecovery, 11);
  const {encounter, spits} = turns({}, encounter => encounter.phases.queue.push("roar"), 50);
  assert.equal(encounter.phases.active.kind, "roar");
  assert.deepEqual(spits, [15, 22, 29, 36]);
}
console.log("Blood spells with a spit and as a special starts, the delayed throw, and his spits through the waves and the roar passed.");
