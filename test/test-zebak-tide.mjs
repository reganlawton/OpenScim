import assert from "node:assert/strict";
import {zebakDefinition} from "../client/toa/zebak/native.js";
import {ZebakPhases} from "../client/toa/zebak/phases.js";

for (const direction of [-1, 1]) {
  const rolls = [0.5, 0.01, 0.5, 0.99];
  const phases = new ZebakPhases(() => rolls.shift(), () => new Set(), () => {});
  for (const x of [22, 23, 24, 28, 39]) phases.depositAcid([x, 32]);
  phases.depositAcid([22, 33]);
  for (let pass = 1; pass <= 3; pass++) {
    const startTick = 7 * pass;
    phases.waveFronts = [{startTick, direction, gap: 28, gapWidth: 3, actors: []}];
    const context = {tick: startTick + 11}; // row 32: 11 rows from shore row 21 or 43
    phases.advanceWaveFronts(context);
    phases.advanceWaveFronts(context);
    const expected = [22, 23, 24].slice(pass).concat(28, 39);
    assert.deepEqual(phases.snapshot().acid, [...expected.map(x => [x, 32]), [22, 33]]);
    if (pass === 1) phases.depositAcid([24, 32]);
  }
  assert.equal(rolls.length, 0);
}

const REC = "20261125-160410-Tombs-of-Amascut.jsonl.gz";
// OBS (REC, the six wave hits of ticks 176, 192, 193, 195, 449 and 450, the miss of tick 455): a wave is
// three rows deep, the crest and the two rows behind it. When the crest's turn comes it hits a player who
// stands in those rows outside its gap, if the tile of his last step was in them too. In the tick of the hit
// he first takes the step he was making and is thrown 3 rows from where it ends, or off the platform; the
// walk he had clicked is dropped.
/** Plays ticks with a crest standing on `row` (gap 28-30), the player starting on `start`. `moves[i]` is his
 *  step in tick i+1: null (he stands) or {click, path}, the tile he clicked and the tiles he steps on. */
function playTide(direction, start, row, moves, raid = 0) {
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 22; y <= 42; y++) tiles.add([x,y].join(","));
  const shore = direction > 0 ? 21 : 43;
  const heard = [];
  const phases = new ZebakPhases(() => 0, () => tiles, (_, event) => heard.push(event));
  phases.raid = raid;
  const offset = (row - shore) * direction;
  phases.waveFronts = [{startTick: -offset, direction, gap: 28, gapWidth: 3, actors: [], y: row, tick: 0}];
  const player = {alive: true, position: [...start], previousPosition: [...start], movementPath: [], facing: 0, attackTarget: null};
  const log = [];
  moves.forEach((move, index) => {
    const context = {tick: index + 1, tickEvents: {}};
    phases.tick = context.tick; // as step() sets it
    heard.length = 0;
    const struck = phases.advanceWaveFronts(context, player, []).filter(hit => hit.source === "Tidal Wave");
    const path = move?.path ?? [];
    const origin = [...player.position];
    // What the engine hands over: the step toward the clicked tile, whether or not the click was dropped.
    const step = {position: path.length ? [...path.at(-1)] : origin, stepTiles: path};
    const pushed = phases.moveWithTide(player, move?.click ?? null, to => {
      player.previousPosition = origin;
      player.position = [...to];
      player.movementPath = [[...to]];
    }, step);
    if (pushed === undefined) {
      player.previousPosition = origin;
      player.position = [...step.position];
      player.movementPath = path.map(tile => [...tile]);
    }
    log.push({hits: struck.length, damage: struck[0]?.baseDamage, heard: heard.filter(event => event.waveHit).length,
      at: [...player.position], crest: phases.waveFronts[0]?.y,
      water: phases.water && {...phases.water}, shove: phases.waveShove && {...phases.waveShove}});
    if (phases.waveShove?.tick !== context.tick) phases.waveShove = null;
  });
  return log;
}
for (const direction of [-1, 1]) {
  const d = direction;
  const play = (start, row, moves, raid) => playTide(d, start, row, moves, raid);
  const hits = log => log.map(entry => entry.hits);
  const stand = count => Array(count).fill(null);
  // On the crest's tile when its turn comes (tick 175, hit on 176): hit once, heard, thrown 3 rows.
  let log = play([33, 32], 32, [null]);
  assert.equal(log[0].hits, 1);
  assert.equal(log[0].heard, 1);
  assert.deepEqual(log[0].at, [33, 32 + 3 * d]);
  assert.deepEqual(log[0].shove, {tick: 1, from: [33, 32], to: [33, 32 + 3 * d], facing: 0});
  assert.equal(log[0].crest, 32 + d);
  assert.equal(log[0].water, null);
  // WIKI: 6-10, times the raid level's scale: 14-24 at raid level 370 (OBS, REC: 17, 14, 17, 19, 19).
  assert.deepEqual(log[0].damage, [6, 10]);
  assert.deepEqual(play([33, 32], 32, [null], 370)[0].damage, [14, 24]);
  // The depth: one and two rows behind the crest are hit, three behind and a row ahead are not.
  assert.deepEqual(hits(play([33, 32 - d], 32, [null])), [1]);
  assert.deepEqual(hits(play([33, 32 - 2 * d], 32, [null])), [1]);
  assert.deepEqual(hits(play([33, 32 - 3 * d], 32, [null])), [0]);
  assert.deepEqual(hits(play([33, 32 + d], 32, [null])), [0]);
  // The throw follows his own step (tick 176: two tiles west, into the gap's column, then 3 rows on).
  log = play([31, 32], 32, [{click: [20, 32], path: [[30, 32], [29, 32]]}]);
  assert.equal(log[0].hits, 1);
  assert.deepEqual(log[0].at, [29, 32 + 3 * d]);
  assert.deepEqual(log[0].shove, {tick: 1, from: [31, 32], to: [29, 32 + 3 * d], facing: 0});
  // The click stays dropped while the engine keeps passing the same tile; a new click walks again.
  const click = [20, 32];
  log = play([33, 32], 32, [{click, path: [[32, 32], [31, 32]]}, {click, path: [[30, 32 + 3 * d], [29, 32 + 3 * d]]},
    {click: [30, 32 + 3 * d], path: [[30, 32 + 3 * d]]}]);
  assert.deepEqual(log.map(entry => entry.at), [[31, 32 + 3 * d], [31, 32 + 3 * d], [30, 32 + 3 * d]]);
  assert.deepEqual(hits(log), [1, 0, 0]);
  // Ticks 190-195, where no run through the crest was a skip: the first from two rows ahead, the second in
  // the tick after a throw. Two rows ahead of a crest he runs two tiles back through it
  // and ends a row behind it, his last step on its tile: hit on its next turn (192), his run on and the
  // throw leaving him a row on, behind the crest still (the last step of a throw is the row before it):
  // hit again (193) and thrown a row ahead of it, where its next turn spares him (194). He runs two tiles
  // back through it once more as it steps onto his row, ends two rows behind it and is hit a third time
  // (195), thrown from the end of a new step east.
  const back = {click: [33, 32 - 9 * d], path: [[33, 32 + d], [33, 32]]};
  log = play([33, 32 + 2 * d], 32, [
    back,
    {click: back.click, path: [[33, 32 - d], [33, 32 - 2 * d]]},
    null,
    {click: [33, 32 - 8 * d], path: [[33, 32 + 3 * d], [33, 32 + 2 * d]]},
    {click: [38, 32 + 2 * d], path: [[34, 32 + 2 * d], [35, 32 + 2 * d]]},
  ]);
  assert.deepEqual(hits(log), [0, 1, 1, 0, 1]);
  assert.deepEqual(log.map(entry => entry.at),
    [[33, 32], [33, 32 + d], [33, 32 + 4 * d], [33, 32 + 2 * d], [35, 32 + 5 * d]]);
  assert.deepEqual(log.map(entry => entry.crest), [1, 2, 3, 4, 5].map(rows => 32 + rows * d));
  // Ticks 447-450: a row behind the crest in its gap, he runs two tiles out of the gap and ends two rows
  // behind it, both tiles of the run in the wave: hit (449), thrown from the end of his next two tiles onto
  // the crest's own row, and hit again on its next turn (450).
  log = play([30, 32 - d], 32, [
    {click: [36, 32 - d], path: [[31, 32 - d], [32, 32 - d]]},
    {click: [36, 32 - d], path: [[33, 32 - d], [34, 32 - d]]},
    null,
  ]);
  assert.deepEqual(hits(log), [0, 1, 1]);
  assert.deepEqual(log.map(entry => entry.at), [[32, 32 - d], [34, 32 + 2 * d], [34, 32 + 5 * d]]);
  assert.equal(log[1].crest, 32 + 2 * d); // thrown onto its row
  // Tick 455: the same run a column further west, its first tile still in the gap: nothing.
  log = play([29, 32 - d], 32, [{click: [36, 32 - d], path: [[30, 32 - d], [31, 32 - d]]}, null, null]);
  assert.deepEqual(hits(log), [0, 0, 0]);
  // The wave skip (pull request 42's recording): a row ahead of the crest, he runs two tiles back through
  // it in the tick it steps onto his row, and takes nothing; nor on the turn after, three rows behind it.
  // As the guides have it: the true tile next to him, a tile on with the wave, then two tiles back.
  const on = {click: [33, 32 + 2 * d], path: [[33, 32 + 2 * d]]};
  log = play([33, 32 + d], 32, [on, {click: [33, 32], path: [[33, 32 + d], [33, 32]]}, null, null]);
  assert.deepEqual(hits(log), [0, 0, 0, 0]);
  assert.deepEqual(log[3].at, [33, 32]);
  // inferred: without the tile on first, the same run back is hit.
  log = play([33, 32 + d], 32, [{click: [33, 32 - d], path: [[33, 32], [33, 32 - d]]}, null]);
  assert.deepEqual(hits(log), [0, 1]);
  // Walking one tile back through it is no skip (20261125-195433-zebak-wave.jsonl.gz, ticks 154-156): hit.
  log = play([33, 32 + d], 32, [{click: [33, 32], path: [[33, 32]]}, null]);
  assert.deepEqual(hits(log), [0, 1]);
  // In its gap's column there is nothing to skip, and running sideways along its row is no skip.
  log = play([33, 32 + d], 32, [{click: [35, 32 + d], path: [[34, 32 + d], [35, 32 + d]]}, null]);
  assert.deepEqual(hits(log), [0, 1]);
  // Standing still a row ahead: the crest steps onto him and strikes on its next turn.
  log = play([33, 32 + d], 32, stand(2));
  assert.deepEqual(hits(log), [0, 1]);
  assert.deepEqual(log[1].at, [33, 32 + 4 * d]);
  // inferred: standing still afterwards, the same crest catches him again three ticks later.
  log = play([33, 32], 32, stand(4));
  assert.deepEqual(hits(log), [1, 0, 0, 1]);
  assert.deepEqual(log[3].at, [33, 32 + 6 * d]);
  // In the gap of the crest: nothing, on its row or behind it.
  assert.deepEqual(hits(play([29, 32], 32, stand(3))), [0, 0, 0]);
  assert.deepEqual(hits(play([28, 32 - 2 * d], 32, stand(1))), [0]);
  // Fewer than 3 tiles of platform ahead: off the edge, into the water beyond it.
  const edge = d > 0 ? 42 : 22;
  log = play([33, edge - d], edge - d, stand(2));
  assert.equal(log[0].hits, 1);
  // 20261125-195433-zebak-wave.jsonl.gz, ticks 158 and 347: he lands on the row he swims on, 45 or 20.
  const lane = d > 0 ? 45 : 20;
  assert.deepEqual(log[0].at, [33, lane]);
  assert.deepEqual(log[0].water, {direction: d, entered: 1});
  // In the water a crest no longer finds him.
  assert.equal(log[1].hits, 0);
  // He swims a tile a tick along that row to a new click (ticks 349-351); the old click stays dropped.
  const steps = d > 0 ? [29, 30] : [30, 31];
  log = play([33, edge - d], edge - d, [null, {click: [36, lane], path: []}, {click: [36, lane], path: []}]);
  assert.deepEqual(log.map(entry => entry.at), [[33, lane], [34, lane], [35, lane]]);
  // Climb-up on the Rock steps (ticks 165-167): he swims to their nearer column, waits a tick there and
  // stands on the platform's last row in that column the tick after.
  const up = {click: [steps[1], edge - d], path: []};
  log = play([32, edge - d], edge - d, [null, up, up, up, up]);
  assert.deepEqual(log.map(entry => entry.at),
    [[32, lane], [31, lane], d > 0 ? [30, lane] : [31, lane], d > 0 ? [30, lane] : [31, edge], d > 0 ? [30, edge] : [31, edge]]);
  assert.equal(log[4].water, null);
}
console.log("Both tide directions: the wave's three rows and its gap, the last step, the throw after his own step and off the platform, the dropped walk, the recorded hits of ticks 176-195 and 449-450 and the miss of 455.");
for (const direction of [-1, 1]) {
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 23; y <= 41; y++) tiles.add([x,y].join(","));
  const cues = [];
  const boss = {alive: true, position: [14,28], size: 9, vitals: {hp:100,maxHp:100}};
  const player = {alive:true, position:[22,32], equipment:{}};
  const context = {tick:0, world:{actors:new Map([["zebak",boss],["player",player]])},
    tickEvents:{emit() {}}, spawnNpc() {}, despawnNpc() {}};
  const phases = new ZebakPhases(() => 0.5, () => tiles, (_, event) => cues.push({tick:context.tick,event}));
  phases.count.waves = direction < 0 ? 1 : 0;
  const settings = {gap:3,acidWidth:3,jugWidth:5};
  phases.begin(context, "waves", settings);
  const shore = direction > 0 ? 41 : 23;
  const jug = phases.spawn(context, "jug", 11735, [22,shore]);
  let damage = 0;
  for (; context.tick <= 58; context.tick++) {
    // Put the player on row 32 behind every crest that has just stepped onto it: its next turn
    // strikes him there and throws him 3 tiles on.
    if (phases.waveFronts.some(front => front.y === 32)) player.position = [22,32];
    damage += phases.step(context, settings, boss).filter(hit => hit.source === "Tidal Wave").length;
    if (phases.wavePush) {
      assert.equal(phases.moveWithTide(player, null, next => {
        assert.deepEqual(next,[22,32+3*direction]);
        player.position = next;
      }), true);
      player.position = [30,32]; // waits in the gap (28-30 for every crest here) for the next one

    }
    for (const object of phases.actors.values()) {
      if (object.destination) object.actor.position = phases.movementFor(object.actor)[0].path[0];
    }
    // OBS (REC, crests at ticks 162/169/176, 314/321/328 and 434/441/448, their waves starting on 147, 299
    // and 419): the crests rise 15, 22 and 29 ticks after the waves start, 18 NPCs on columns 19-39.
    if (context.tick === 14 || context.tick === 15) assert.equal(phases.waveFronts.length, context.tick - 14);
    if (context.tick === 22 || context.tick === 29) {
      assert.equal(phases.waveFronts.length, context.tick === 22 ? 2 : 3);
      const [older, younger] = phases.waveFronts;
      assert.equal(older.y - younger.y, direction * 7);
      assert.ok(older.actors.every(o => o.actor.position[1] === older.y));
      assert.ok(younger.actors.every(o => o.actor.position[1] === younger.y));
      assert.equal(phases.of("wave").length, phases.waveFronts.length * 18);
      assert.deepEqual([older.actors[0].actor.position[0], older.actors.at(-1).actor.position[0]], [19,39]);
      assert.deepEqual([older.gap, older.gapWidth], [28, 3]);
    }
    // A crest crosses in 24 ticks: the last is gone on tick 54, and the waves are over then.
    if (context.tick === 53) assert.deepEqual([phases.waveFronts.length, phases.active?.kind], [1, "waves"]);
    if (context.tick === 54) assert.deepEqual([phases.waveFronts.length, phases.active], [0, null]);
  }
  assert.equal(damage, 3);
  assert.deepEqual(cues.filter(c => c.event.tidalSurgeSound).map(c => c.tick),[14,25,38]);
  // OBS (REC, ticks 155, 307, 427): the boulders fall 8 ticks after the waves start.
  assert.deepEqual(cues.filter(c => c.event.graphics.some(g => g.spotAnimId === 2195)).map(c => c.tick), [8]);
  assert.equal(cues.filter(c => c.event.graphics.length === 1 && c.event.graphics[0].spotAnimId === 2449
    && c.event.graphics[0].target.position[0] === 22).length, 1);
  assert.equal(phases.actors.has(jug.actor.id), false);
  assert.equal(phases.of("wave").length, 0);
  assert.equal(phases.waveFronts.length, 0);
  assert.equal(phases.active,null);
}
console.log("Three overlapping crests preserved independent NPC rows, gap, a strike and push from each, shoreline splashes and cleanup in both directions.");
for (const path of [0, 3, 4]) {
  const cues = [];
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 22; y <= 42; y++) tiles.add([x,y].join(","));
  const encounter = zebakDefinition({seedRandom: () => () => 0.5, walkable: () => tiles,
    animate: (_, event) => cues.push({tick:context.tick,event})}).factory();
  encounter.configureRunStart({path});
  const phases = encounter.phases;
  const boss = {id:"zebak", alive:true, size:9, position:[14,28], vitals:{hp:100,maxHp:100}};
  const player = {alive:true, position:[29,32], equipment:{}};
  const context = {tick:0, world:{actors:new Map([["zebak",boss],["player",player]])},
    tickEvents:{emit() {}}, spawnNpc() {}, despawnNpc() {}};
  phases.begin(context,"waves",encounter.settings);
  phases.queue.push("roar");
  const jug = phases.spawn(context,"jug",11735,[29,32]);
  for (context.tick = 1; context.tick <= 39; context.tick++) phases.step(context,encounter.settings,boss);
  context.tick = 39;
  encounter.processNpcTick(boss,context);
  assert.deepEqual(phases.queue, []);
  assert.equal(phases.active.kind,"roar");
  assert.equal(phases.active.start,39);
  assert.ok(phases.actors.has(jug.actor.id));
  assert.ok(phases.waveFronts.length > 0);
  const lastFront = phases.waveFronts.at(-1);
  const row = lastFront.y;
  context.tick++;
  phases.step(context,encounter.settings,boss);
  assert.equal(lastFront.y,row + 1);
  for (context.tick++; context.tick <= 54; context.tick++) phases.step(context,encounter.settings,boss);
  assert.equal(phases.waveFronts.length,0);
  assert.equal(phases.active.kind,"roar");
  assert.equal(phases.of("rock").length,3);
  assert.deepEqual(cues.filter(c => c.event.tidalSurgeSound).map(c => c.tick),path ? [13,24,37] : [14,25,38]);
}
console.log("A queued roar starts with water still moving and preserves existing jugs on paths 0, 3 and 4.");
// OBS (REC, ticks 192-193 and 449-450): the second hit comes a tick after the first, while the engine still
// hands over the step toward the click the first throw dropped. He was thrown from where he stood, (24,36)
// to (24,39) and (30,28) to (30,25), without that step.
for (const d of [-1, 1]) {
  const back = [33, 32 - 9 * d];
  const log = playTide(d, [33, 32 + 2 * d], 32, [
    {click: back, path: [[33, 32 + d], [33, 32]]},
    {click: back, path: [[33, 32 - d], [33, 32 - 2 * d]]},
    {click: back, path: [[33, 32], [33, 32 - d]]},
  ]);
  assert.deepEqual(log.map(entry => entry.hits), [0, 1, 1]);
  assert.deepEqual(log.map(entry => entry.at), [[33, 32], [33, 32 + d], [33, 32 + 4 * d]]);
}
console.log("A second throw a tick after the first ignores the step of the dropped walk.");
