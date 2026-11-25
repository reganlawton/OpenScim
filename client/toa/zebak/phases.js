import {specialDrops} from "./special-layouts.js";
import { thresholds, scaleToaDamage } from "./rules.js";
import { cyclesPerTick, specialThrow, specialThrowArc, roarWindupTick, roarTicks } from "./timing.js";

const key = ([x, y]) => x + "," + y;
const distance = (a, b) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const offsetFromFootprint = (origin, size, target) =>
  target.map((value, axis) => value - Math.max(origin[axis], Math.min(value, origin[axis] + size - 1)));
const tile = (position) => ({ kind: "tile", position });
const REC = "20261125-160410-Tombs-of-Amascut.jsonl.gz";
// OBS (REC, ticks 155, 307, 427): seven boulders fall on the shore row, every third column from 19 to 37.
const shoreRockColumns = [19, 22, 25, 28, 31, 34, 37];
// OBS (REC, 9 crests, e.g. ticks 162, 314, 434): a crest is 21 columns wide, 19 to 39, less its gap.
const crestColumns = [19, 39];
// OBS (REC, 9 crests): the gap began on columns 23, 24, 25, 28 (3), 30 (3). inferred: up to 33, as before.
const gapStart = { first: 23, count: 11 };
// OBS (REC, spit animations at ticks 148, 300, 420): the spit is animated one tick after the special starts
// (see begin), the boulders fall 8 ticks after it starts and the crests rise 15, 22 and 29 ticks after.
const cloudDeath = { animation: 2, gone: 5, sequence: 8103 };
// Bloody Waves (NPC 11739). WIKI (Bloody Wave): a wave that washes over a blood splatter by the edge of the
// room in the first waves of the fight, or over the trail a bleeding player leaves, becomes a Bloody Wave.
// OBS (REC ticks 166, 171, 172; 20261125-195433-zebak-wave.jsonl.gz ticks 131-133): in the first waves, from
// the south, the wave of column 28 changes on row 23, that of column 30 on row 24 and that of column 31 on
// row 25, and stays changed to the far shore. Each splatter changes one wave: where the first crest's gap
// was over columns 28-30, the second crest's waves changed there instead, and no third. The waves from the
// north, later in both fights, changed nowhere.
// No recording has a Bloody Wave hit anyone, and the wiki gives it no effect of its own: it hits as a wave.
const shoreBlood = [[28, 23], [30, 24], [31, 25]];
// The water. OBS (20261125-195433-zebak-wave.jsonl.gz ticks 158-167 and 347-351;
// 20261125-200016-zebak-wave3.jsonl.gz tick 125): a throw off the platform ends 3 rows from its last row,
// on row 45 past the north edge (from row 42) and on row 20 past the south edge (from row 23), where he swims.
// inferred: from any other row a throw off the platform ends on that same row.
// There he swims a tile a tick along the row to the tile he clicks (ticks 349-351). The Rock steps (object
// 45509) stand on columns 29-30 of row 43 and on columns 30-31 of row 21. He clicked "Climb-up" on them at
// tick 165 from their column, did not change tile at 166 and stood on the platform's last row, 42, in his own
// column at 167. inferred: from another column he first swims to the nearer column of the steps.
const swim = direction => direction > 0
  ? { lane: 45, columns: [29, 30], edge: 42 }
  : { lane: 20, columns: [30, 31], edge: 22 };
const waveTicks = { boulders: 8, crests: [15, 22, 29], over: 54 };
// OBS (rev 243 recording, 2026-11-25): the boulders, splashes and every crest
// of a Tidal Waves start on local row 21 when they run north and on row 43
// when they run south, one row off the platform (y 22-42). A crest then moves
// a row a tick for 24 ticks, to row 45 or 19, and is gone on the 25th.
const crestShore = direction => direction > 0 ? 21 : 43;
const hazard = (source, baseDamage, extras = {}) => ({
  source,
  baseDamage,
  attackType: "typeless",
  ...extras,
});
const matrix = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

export const phaseModels = [
  { npcTypeId: 11735, idleSeqId: -1 },
  { npcTypeId: 11736, idleSeqId: -1, walkSeqId: 6 },
  { npcTypeId: 11737, idleSeqId: -1 },
  { npcTypeId: 11738, idleSeqId: 7877, walkSeqId: 7877, spawnSeqId: 7878 },
  { npcTypeId: 11739, idleSeqId: 7877, walkSeqId: 7877 },
  { npcTypeId: 11742, idleSeqId: 8102, walkSeqId: 8101, deathSeqId: 8103 },
  { npcTypeId: 11743, idleSeqId: 8102, walkSeqId: 8101, deathSeqId: 8103 },
];
// All seven variants are cache locs. Keep the same mesh until the pool is cleared.
const acidVariants = [45570, 45571, 45574, 45575, 45570, 45574, 45572, 45573, 45576, 45571, 45575, 45570];
function acidLoc(x, y) {
  const hash = Math.imul(x + 17, 73856093) ^ Math.imul(y + 31, 19349663);
  return acidVariants[(hash >>> 0) % acidVariants.length];
}
export const acidScene = () => ({
  consumeEvents() {},
  update({ state, interpolatedTick }) {
    const decals = (state.encounter.state.acid ?? []).map(([x, y]) => {
      const id = "acid-" + x + "-" + y;
      return {
        id,
        meshId: id,
        materialId: "osrs-npc",
        modelMatrix: matrix,
        lifecycle: { kind: "sync" },
        classification: "groundDecal",
        data: {
          kind: "loc",
          locId: acidLoc(x, y),
          modelType: 10,
          rotation: (x + y) % 4,
          localX: x,
          localY: y,
          level: 1,
          seqId: -1,
        },
      };
    });
    for (const [x, y] of state.encounter.state.bloodTrail ?? []) {
      const id = `zebak-blood-${x}-${y}`;
      // These are the three blood ground decorations already on the arena edges.
      decals.push({
        id, meshId: id, materialId: "osrs-npc", modelMatrix: matrix,
        lifecycle: {kind: "sync"}, classification: "groundDecal",
        data: {kind: "loc", locId: 652 + (x + y) % 3, modelType: 22,
          rotation: (x + y) % 4, localX: x, localY: y, level: 1, seqId: -1},
      });
    }
    for (const splash of state.encounter.state.splashes ?? []) {
      for (const position of splash.tiles) {
        const age = interpolatedTick - splash.tick - (4 + 5 * distance(splash.origin, position)) / cyclesPerTick;
        if (age < 0 || age >= 2) continue;
        const [x, y] = position;
        const id = `jug-water-${splash.id}-${x}-${y}`;
        decals.push({
          id, meshId: id, materialId: "osrs-npc", modelMatrix: matrix,
          lifecycle: {kind: "sync"}, classification: "groundDecal",
          style: {opacity: age < 1 ? 0.9 : age < 1.5 ? 0.6 : 0.3, zOffset: 0.08, cullFace: "none"},
          data: {kind: "loc", locId: 745, modelType: 22, rotation: (x + y) % 4,
            localX: x, localY: y, level: 1, seqId: -1},
        });
      }
    }
    return decals;
  },
});

export class ZebakPhases {
  constructor(random, walkable, emit) {
    this.random = random;
    this.walkable = walkable;
    this.emit = emit;
    this.next = random() < 0.5 ? "roar" : "waves";
    this.crossed = 0;
    this.queue = [];
    this.count = { roar: 0, waves: 0 };
    this.actors = new Map();
    this.acid = new Map();
    this.splashes = [];
    this.waveFronts = [];
    this.shoreBlood = new Set(shoreBlood.map(key));
    this.bloodTrail = () => [];
    this.water = null;
    this.wavePush = null;
    this.thrown = null;
    this.raid = 0;
    this.droppedWalk = null;
    this.serial = 0;
    this.acidTicks = 0;
    this.active = null;
    this.enraged = false;
  }
  snapshot() {
    return {
      special: this.active?.kind ?? null,
      // OBS (20261125-195433-zebak-wave.jsonl.gz, ticks 158-166 and 347-352): in the water he stands as 773
      // and moves as 772.
      playerStance: this.water ? "swim" : null,
      enraged: this.enraged,
      // OBS (20261125-195433-zebak-wave.jsonl.gz, ticks 149, 150, 156, 158): in the client cycle of the
      // hitsplat he already stands where the throw ends (drawn at row 34.47 at tick 148, at 33.50 at 149): he
      // is put there, not slid. The scene slides him from `from` to `to` through the tick, so both are the end.
      waveShove: this.waveShove ? {...this.waveShove, from: [...this.waveShove.to]} : null,
      acid: Array.from(this.acid.values(), pool => pool.position),
      splashes: [...this.splashes],
      queued: [...this.queue],
    };
  }
  observe(boss) {
    if (this.enraged) return false;
    if (boss.vitals.hp * 4 < boss.vitals.maxHp) {
      this.enraged = true;
      this.queue = [];
      return true;
    }
    while (
      this.crossed < thresholds.length &&
      boss.vitals.hp * 100 <= boss.vitals.maxHp * thresholds[this.crossed]
    ) {
      this.queue.push(this.next);
      this.next = this.next === "roar" ? "waves" : "roar";
      this.crossed++;
    }
    return false;
  }
  land(p) {
    return this.walkable()?.has(key(p)) ?? false;
  }
  spawn(context, kind, model, position, hp = kind === "jug" ? 5 : 1) {
    const id = "zebak-" + kind + "-" + ++this.serial;
    const actor = {
      id,
      kind: "npc",
      role: "npc",
      npcTypeId: model,
      archetypeId: "zebak-" + kind,
      position: [...position],
      previousPosition: [...position],
      facing: 0,
      ...(kind === "cloud" ? {lockedFacing: 0} : {}),
      size: model === 11742 ? 2 : 1,
      alive: true,
      spawnTick: context.tick,
      blocksNpcMovement: false,
      history: new Map(),
      vitals: { hp, maxHp: hp },
      combat: {
        attackSpeed: 1,
        attackRange: 0,
        attackStyle: "typeless",
        nextActionTick: 0,
        targetId: null,
        lastAttackTick: null,
        animations: {
          idle:
            phaseModels.find((x) => x.npcTypeId === model)?.idleSeqId ?? null,
          walk: phaseModels.find(type => type.npcTypeId === model)?.walkSeqId ?? null,
          run: null,
          attack: null,
          death: null,
        },
      },
    };
    context.spawnNpc(actor);
    if (kind === "rock") this.setRockCollision?.(position, true);
    this.actors.set(id, { actor, kind });
    return this.actors.get(id);
  }
  remove(context, object) {
    if (object.kind === "rock")
      this.setRockCollision?.(object.actor.position, false);
    context.despawnNpc(object.actor.id);
    this.actors.delete(object.actor.id);
  }
  move(object, position) {
    object.destination = position;
  }
  movementFor(actor) {
    const object = this.actors.get(actor.id);
    if (!object?.destination) return [];
    const path = [object.destination];
    object.destination = null;
    return [{ npcId: actor.id, path }];
  }
  of(kind) {
    return [...this.actors.values()].filter((o) => o.kind === kind);
  }
  graphics(context, graphics, clipId, projectiles = [], extras = {}) {
    this.emit(context.tickEvents, {
      // OBS (REC, ticks 148, 300, 361, 420, 544): only his head plays the special's spit, the tail stays idle.
      animations: clipId
        ? (extras.headOnly ? ["zebak"] : ["zebak", "zebak-tail"]).map((actorId) => ({
            actorId,
            clipId,
            delayCycles: extras.animationDelayCycles ?? 0,
          }))
        : [],
      graphics,
      projectiles,
      ...(extras.throwDelayCycles === undefined ? {} : {throwDelayCycles: extras.throwDelayCycles}),
      ...(clipId === "roar" && this.active?.kind === "roar" ? {greatRoarStart: true} : {}),
    });
  }
  effect(id, position) {
    return {
      spotAnimId: id,
      target: tile([...position]),
      height: 0,
      delayCycles: 0,
    };
  }
  breakJug(context, jug, cause, origin = jug.actor.position) {
    const actor = jug.actor;
    jug.kind = "broken-jug";
    jug.breakCause = cause;
    jug.shatterTick = context.tick + 1;
    jug.destination = null;
    actor.position = [...origin];
    actor.previousPosition = [...origin];
    actor.movementPath = [];
    actor.isMoving = false;
    const damage = actor.vitals.hp;
    actor.vitals.hp = 0;
    actor.npcTypeId = 11735;
    actor.combat.animations.walk = null;
    actor.untargetable = true;
    actor.healthBarWhenUntargetable = true;
    context.tickEvents.emit({type: "hitsplat_spawned", targetId: actor.id, amount: damage, hitsplatType: "damage"});
  }
  splash(context, jug, settings) {
    const origin = jug.actor.position;
    const r = (settings.jugWidth - 1) / 2;
    const graphics = [this.effect(2192, origin), {...this.effect(2449, origin), delayCycles: 4}];
    const droplets = [];
    const tiles = [];
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        const target = [origin[0] + dx, origin[1] + dy];
        this.acid.delete(key(target));
        if (this.land(target)) {
          tiles.push(target);
          graphics.push({...this.effect(95, target), delayCycles: 4 + 5 * distance(origin, target)});
        }
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        droplets.push({
          spotAnimId: 2193, sourcePosition: origin.map(v => v + 0.5),
          target: tile([origin[0] + dx, origin[1] + dy]),
          startDelayCycles: 4, endDelayCycles: 16, startOffset: 0,
          startHeight: 20, endHeight: 0, slope: 18,
        });
      }
    this.splashes.push({id: jug.actor.id, tick: context.tick, origin: [...origin], tiles});
    this.emit(context.tickEvents, {animations: [], graphics, projectiles: droplets, jugBreakCause: jug.breakCause});
    this.remove(context, jug);
  }
  splashIntoWater(context, jug, waterTile) {
    this.graphics(context, [this.effect(2449, waterTile)]);
    this.remove(context, jug);
  }
  scatter(p, width, targets) {
    const r = (width - 1) / 2;
    for (let x = -r; x <= r; x++)
      for (let y = -r; y <= r; y++) {
        const dest = [p[0] + x, p[1] + y];
        if ((x || y) && this.land(dest) && this.random() < 0.6)
          targets.set(key(dest), {from: p, to: dest});
      }
  }
  canBegin(tick) {
    return !this.enraged && (!this.active || (
      this.active.kind === "waves" && tick - this.active.start >= 39
    ));
  }
  begin(context, kind, settings, afterBloodSpell = false) {
    if (!this.canBegin(context.tick)) return;
    const throwDelay = afterBloodSpell ? specialThrow.delayedByBlood : 0;
    const iteration = this.count[kind]++;
    this.active = {
      kind,
      start: context.tick,
      direction: iteration % 2 ? -1 : 1,
      secondRoar: kind === "roar" && iteration > 0,
      throwDelay,
    };
    const throws = specialDrops(kind, iteration, this.random, this.walkable());
    this.active.throws = throws;
    const boss = context.world.actors.get("zebak");
    const mouth = [boss.position[0] + boss.size - 0.5, boss.position[1] + boss.size / 2];
    this.graphics(
      context,
      [],
      "attack",
      throws.map(({ kind, position, spotAnimId }) => ({
        spotAnimId,
        sourcePosition: mouth,
        target: tile(position),
        startDelayCycles: specialThrow.release + throwDelay * cyclesPerTick,
        endDelayCycles: ((kind === "acid" ? specialThrow.acidLandingTick : specialThrow.solidLandingTick) + throwDelay) * cyclesPerTick,
        startOffset: 0,
        ...specialThrowArc,
      })),
      {headOnly: true, animationDelayCycles: specialThrow.animation, throwDelayCycles: throwDelay * cyclesPerTick},
    );
  }
  landThrows(context, settings, age) {
    if (age === specialThrow.acidLandingTick) {
      const spread = new Map();
      const graphics = [];
      for (const {kind, position, spread: splatters} of this.active.throws) {
        if (kind !== "acid") continue;
        this.depositAcid(position);
        if (splatters) this.scatter(position, settings.acidWidth, spread);
      }
      this.active.acidSpread = [...spread.values()].map(({from, to}) => ({
        from, to, travelTicks: distance(from, to),
      }));
      // OBS (REC, ticks 154, 305, 367, 426, 549): no graphic where a pool lands, a splat is heard for the
      // pools that spread, and their spray flies along the ground on slope 20.
      this.emit(context.tickEvents, {animations: [], graphics, acidLanded: true,
        projectiles: this.active.acidSpread.map(({from, to, travelTicks}) => ({
          spotAnimId: 2194, sourcePosition: from.map(v => v + 0.5), target: tile(to),
          startDelayCycles: 0, endDelayCycles: travelTicks * cyclesPerTick, startOffset: 0,
          startHeight: 0, endHeight: 0, slope: 20,
        }))});
    }
    if (age === specialThrow.solidLandingTick) {
      const graphics = [];
      for (const {kind, position} of this.active.throws) {
        // OBS (REC, same ticks): dust 2184 where a rock or a jug lands.
        if (kind === "rock") this.spawn(context, "rock", 11737, position, 150);
        else if (kind === "jug") this.spawn(context, "jug", 11735, position);
        else continue;
        graphics.push(this.effect(2184, position));
      }
      this.emit(context.tickEvents, {animations: [], projectiles: [], graphics, objectsLanded: true});
      this.active.throws = null;
    }
  }
  command(command, context) {
    const jug = this.actors.get(command.id);
    if (
      jug?.kind !== "jug" ||
      !["Push", "Pull", "Hit"].includes(command.action)
    )
      return null;
    const player = context.world.actors.get("player");
    if (!player?.alive || this.water) return null;
    if (command.action === "Hit" && jug.breakTick !== undefined) return {};
    player.attackTarget = command.id;
    // Keep the target for pathfinding. The jug action owns the gesture or weapon
    // launch once it comes into range, including the weapon's attack cooldown.
    player.attackInteractionActive = false;
    player.manualCastSpell = null;
    this.pendingJug = { id: command.id, action: command.action };
    return {};
  }
  stepJugs(context, settings, player) {
    for (const jug of this.of("broken-jug"))
      if (context.tick >= jug.shatterTick) this.splash(context, jug, settings);
    const action = this.pendingJug;
    if (action) {
      const jug = this.actors.get(action.id);
      if (!jug || player.attackTarget !== action.id) this.pendingJug = null;
      else if (
        !(action.action === "Hit" && context.getPlayerWeaponState?.().cooldown > 0) &&
        distance(player.position, jug.actor.position) <=
        (action.action === "Hit"
          ? (context.getPlayerWeaponState?.().range ?? 1)
          : 1)
      ) {
        this.pendingJug = null;
        if (player.attackTarget === action.id) {
          player.attackTarget = null;
          player.attackInteractionActive = false;
          player.manualCastSpell = null;
        }
        const [dx, dy] = jug.actor.position.map((v, i) => v - player.position[i]);
        if (dx || dy) player.facing = (Math.round(Math.atan2(-dx, -dy) * 1024 / Math.PI) + 2048) % 2048;
        if (action.action === "Hit") {
          const delay = context.attackObject(jug.actor);
          if (delay !== undefined) jug.breakTick = Math.min(jug.breakTick ?? Infinity, context.tick + delay);
        } else {
          context.tickEvents.emit({type: "player_jug_action", action: action.action, weaponId: player.equipment.weapon});
          const sign = action.action === "Push" ? 1 : -1;
          jug.step = jug.actor.position.map(
            (v, i) => sign * Math.sign(v - player.position[i]),
          );
          if (!jug.step.some(Boolean)) jug.step = null;
          else {
            jug.remaining = 6;
            jug.actor.npcTypeId = 11736;
            jug.actor.combat.animations.walk = 6;
          }
        }
      }
    }
    for (const jug of this.of("jug")) {
      if (context.tick >= jug.breakTick) {
        this.breakJug(context, jug, "weapon");
        continue;
      }
      if (!jug.step) continue;
      if (jug.remaining === 0) {
        jug.step = null;
        jug.actor.npcTypeId = 11735;
        jug.actor.combat.animations.walk = null;
        continue;
      }
      const dest = jug.actor.position.map((v, i) => v + jug.step[i]);
      if (this.of("rock").some(o => !distance(dest, o.actor.position)))
        this.breakJug(context, jug, "collision", dest);
      else if (!this.land(dest))
        this.splashIntoWater(context, jug, dest);
      else {
        this.move(jug, dest);
        jug.remaining--;
      }
    }
  }
  // OBS (REC, the twelve clouds of ticks 150, 363, 525 and 672, Blood Thinners on):
  // - a cloud appears on a tile of columns 28-30, rows 24-26 or 38-40, two may share one, and first moves
  //   3 ticks later, a tile a tick, onto the player's own tile;
  // - from its 4th tick it loses 2 hitpoints every tick, moving or not, so 30 last 15 ticks;
  // - the tick after it reaches his tile it hits him (2, 4 or 7 at raid level 370: 1-3 before the raid
  //   level, 9 hits), heals itself half of that with a heal hitsplat, and loses nothing the tick after;
  //   it stays on that tile for 2 more ticks and then follows him again (ticks 538-544);
  // - Zebak's hitpoints never rose with a cloud's hit. inferred: only Arterial Spray heals him by it;
  // - at 0 it stops, plays 8103 two ticks later and is gone three ticks after that (ticks 168-173).
  clouds(context, player, hits = [], settings = {}, boss = null) {
    for (const c of this.of("cloud")) {
      const {actor} = c;
      if (c.diedTick !== undefined) {
        if (context.tick === c.diedTick + cloudDeath.animation) actor.combat.animations.idle = cloudDeath.sequence;
        if (context.tick >= c.diedTick + cloudDeath.gone) this.remove(context, c);
        continue;
      }
      const age = context.tick - actor.spawnTick;
      const {vitals, size} = actor;
      if (c.contactDue === context.tick) {
        const damage = scaleToaDamage(1 + Math.floor(this.random() * 3), this.raid);
        hits.push(hazard("Blood cloud", damage));
        const heal = Math.floor(damage / 2);
        if (heal > 0) {
          vitals.hp = Math.min(vitals.maxHp, vitals.hp + heal);
          context.tickEvents.emit({type: "hitsplat_spawned", targetId: actor.id, amount: heal, hitsplatType: "heal"});
        }
        if (settings.spray && boss) boss.vitals.hp = Math.min(boss.vitals.maxHp, boss.vitals.hp + 4);
        c.decayResumes = context.tick + 2;
      }
      if (age >= 4 && !(context.tick < c.decayResumes && c.contactDue !== context.tick)) {
        const loss = Math.min(vitals.hp, 2);
        vitals.hp -= loss;
        context.tickEvents.emit({type: "hitsplat_spawned", targetId: actor.id, amount: loss, hitsplatType: "damage"});
        if (vitals.hp === 0) {
          c.diedTick = context.tick;
          c.destination = null;
          continue;
        }
      }
      if (age < 3 || context.tick <= c.restsUntil) continue;
      const [x, y] = actor.position;
      const offset = offsetFromFootprint([x, y], size, player.position);
      const dx = c.aggro ? Math.sign(offset[0]) : Math.floor(this.random() * 3) - 1;
      const dy = c.aggro ? Math.sign(offset[1]) : Math.floor(this.random() * 3) - 1;
      const step = [[x + dx, y + dy], [x + dx, y], [x, y + dy]]
        .find(position => distance(position, [x, y]) && this.land(position));
      if (step && !this.of("rock").some(r =>
        offsetFromFootprint(step, size, r.actor.position).every(v => v === 0)))
        this.move(c, step);
    }
  }
  // After everything has moved: a cloud that now covers the player's tile hits him next tick and rests.
  resolveCloudContact(context) {
    const player = context.world.actors.get("player");
    const boss = context.world.actors.get("zebak");
    if (!player?.alive || !boss?.alive) return [];
    for (const c of this.of("cloud")) {
      if (c.diedTick !== undefined || !c.aggro || context.tick <= c.restsUntil) continue;
      if (context.tick - c.actor.spawnTick < 3) continue;
      if (!offsetFromFootprint(c.actor.position, c.actor.size, player.position).every(v => v === 0)) continue;
      c.contactDue = context.tick + 1;
      c.restsUntil = context.tick + 2;
    }
    return [];
  }
  summonClouds(context, settings, player) {
    const south = this.random() < 0.5;
    // Uninterrupted in the game recording: the normal cloud takes twelve 2s and a final 1.
    // Thinned clouds take fifteen 2s each.
    const maxHp = settings.clouds ? 30 : 25;
    for (let i = 0; i < settings.cloudCount; i++) {
      const p = [28 + Math.floor(this.random() * 3), (south ? 24 : 38) + Math.floor(this.random() * 3)],
        cloud = this.spawn(context, "cloud", settings.clouds ? 11743 : 11742, p, maxHp);
      cloud.aggro = distance(p, player.position) <= 15;
    }
  }
  depositAcid(position) {
    const id = key(position);
    if (!this.acid.has(id)) this.acid.set(id, {position, crestsRemaining: null});
  }
  washAcidRow(front) {
    for (let x = 22; x <= 38; x++) {
      if (x >= front.gap && x < front.gap + front.gapWidth) continue;
      const id = key([x, front.y]);
      const pool = this.acid.get(id);
      if (!pool) continue;
      // The recorded first crest clears some pools of either shape. The
      // one-to-three contact distribution is an estimate (see the wave audit).
      pool.crestsRemaining ??= 1 + Math.floor(this.random() * 3);
      if (--pool.crestsRemaining === 0) this.acid.delete(id);
    }
  }
  advanceWaveFronts(context, player = null, hits = []) {
    for (const front of this.waveFronts) {
      const offset = context.tick - front.startTick;
      if (offset > 24) {
        for (const wave of front.actors) this.remove(context, wave);
        continue;
      }
      // A crest strikes before it steps, so the tick after it spawned is its first.
      if (front.tick < context.tick) this.strikeWithCrest(context, front, player, hits);
      front.y = crestShore(front.direction) + front.direction * offset;
      if (front.tick !== context.tick) this.washAcidRow(front);
      front.tick = context.tick;
      for (const wave of front.actors) this.move(wave, [wave.actor.position[0], front.y]);
      this.bloodyWaves(front);
      for (const jug of this.of("jug")) {
        const [x, y] = jug.actor.position;
        if (y !== front.y || (x >= front.gap && x < front.gap + front.gapWidth)) continue;
        const dest = [x, y + front.direction];
        if (this.land(dest)) {
          this.move(jug, dest);
          this.acid.delete(key(dest));
        } else this.splashIntoWater(context, jug, dest);
      }
    }
    this.waveFronts = this.waveFronts.filter(front => front.tick === context.tick);
    return hits;
  }
  // inferred: the trail of a bleeding player changes a wave as a splatter does, and is not used up by it.
  bloodyWaves(front) {
    const trail = new Set(Array.from(this.bloodTrail(), key));
    for (const wave of front.actors) {
      if (wave.actor.npcTypeId === 11739) continue;
      const id = key([wave.actor.position[0], front.y]);
      if (this.shoreBlood.delete(id) || trail.has(id)) wave.actor.npcTypeId = 11739;
    }
  }
  // OBS (REC, the six hits at ticks 176, 192, 193, 195, 449 and 450): a wave is three rows deep, the crest
  // and the two rows behind it. When a crest's turn comes it hits a player who stands in those rows outside
  // its gap, if the tile of his last step was in them too: on the crest's tile (ticks 175, 449), one row
  // behind it (191, 192) or two (194, 448). At tick 455 he ran out of the gap two rows behind a crest, his
  // last step still in the gap, and took nothing. A player a row ahead of the crest is not hit (tick 193).
  // The wave skip of pull request 42 is kept beside this: see skipCrests.
  // WIKI: it deals 6-10, before the raid level (OBS, REC: 17, 14, 17, 19, 19 at raid level 370, and a 12
  // that killed him at 12 hitpoints). OBS (18 hits, RSPSApp/tsps's Zebak notes): it throws him 3 tiles.
  inWave(front, [x, y]) {
    const behind = (front.y - y) * front.direction;
    return behind >= 0 && behind <= 2 && x >= crestColumns[0] && x <= crestColumns[1] &&
      !(x >= front.gap && x < front.gap + front.gapWidth);
  }
  lastStepOf(player, tick) {
    if (this.thrown?.tick === tick - 1) return this.thrown.lastStep;
    const path = player.movementPath ?? [];
    return path.length > 1 ? path.at(-2) : path.length ? player.previousPosition : player.position;
  }
  strikeWithCrest(context, front, player, hits) {
    if (!player?.alive || this.water || this.wavePush) return;
    if (!this.inWave(front, player.position) || !this.inWave(front, this.lastStepOf(player, context.tick))) return;
    if (context.tick <= front.skippedUntil) return;
    hits.push(hazard("Tidal Wave", [6, 10].map(damage => scaleToaDamage(damage, this.raid))));
    this.wavePush = {tick: context.tick, direction: front.direction};
    this.emit(context.tickEvents, {animations: [], graphics: [], projectiles: [], waveHit: true});
  }
  // The wave skip. OBS (pull request 42's recording, three times; players' guides: with the true tile next
  // to him he steps a tile on and then runs two tiles back): a player a row ahead of a crest who runs two
  // tiles back through it in the tick it steps onto his row takes nothing from it; it spares him on its
  // next turn, two rows behind it, and on the turn after he is three behind.
  // None of the recordings at hand has a skip. What they have beside it:
  // OBS (REC ticks 190-192; 20261125-195433-zebak-wave.jsonl.gz ticks 147-149 and 344-346;
  // 20261125-200016-zebak-wave3.jsonl.gz ticks 105-107 and 121-123): from two rows ahead the same run ends a
  // row behind the crest and is hit.
  // OBS (20261125-195433-zebak-wave.jsonl.gz, ticks 154-156): walking one tile back through it is hit.
  // OBS (REC, ticks 193-195): thrown at 193 to a row ahead of the crest, he ran two tiles back through it at
  // 194 as it stepped onto his row, and was hit at 195. inferred, to hold this beside the skip: the tick
  // after a throw there is no skip. inferred, from the guides: the skip needs the tile stepped on, with the
  // wave, in the tick before the run; a run back through the crest without it is hit.
  skipCrests(player, step) {
    const to = step?.position;
    const stepped = this.lastStep?.tick === this.tick - 1 ? this.lastStep.rows : null;
    this.lastStep = to ? {tick: this.tick, rows: to[1] - player.position[1]} : null;
    if (!to || this.thrown?.tick === this.tick - 1) return;
    for (const front of this.waveFronts) {
      const [x, y] = player.position;
      if (y !== front.y || x < crestColumns[0] || x > crestColumns[1]) continue;
      if (x >= front.gap && x < front.gap + front.gapWidth) continue;
      if (stepped === front.direction && (front.y - to[1]) * front.direction >= 2) front.skippedUntil = this.tick + 1;
    }
  }
  // The engine moves the player after the NPCs. OBS (REC, ticks 176, 192, 195, 449): in the tick of the
  // hit he first takes the step he was making (two tiles west at 176, two east at 449) and is thrown 3
  // rows from where it ends, or off the platform's edge into the water (see `swim`).
  moveWithTide(player, destination, place, step) {
    const push = this.wavePush;
    this.wavePush = null;
    if (push && player.alive) {
      // A walk the last throw dropped is not taken up again (ticks 193 and 450: thrown from where he stood).
      const walkDropped = this.droppedWalk && destination === this.droppedWalk && !player.attackTarget;
      const from = !walkDropped && step?.position && this.land(step.position) ? [...step.position] : [...player.position];
      let to = from, intoWater = false;
      for (let rows = 1; rows <= 3 && !intoWater; rows++) {
        to = [from[0], from[1] + push.direction * rows];
        intoWater = !this.land(to);
      }
      if (intoWater) {
        to = [from[0], swim(push.direction).lane];
        this.water = {direction: push.direction, entered: push.tick};
      }
      // OBS (REC, ticks 193 and 450): the walk he had clicked is dropped with the throw; he stood until he
      // clicked again. The engine keeps the clicked tile until he clicks again (a new tile object) or takes
      // a target; until then he stands.
      this.droppedWalk = destination ?? null;
      this.waveShove = {tick: push.tick, from: [...player.position], to: [...to], facing: player.facing};
      this.thrown = {tick: push.tick, lastStep: [to[0], to[1] - push.direction]};
      place(to, player.facing);
      return true;
    }
    if (this.droppedWalk && destination === this.droppedWalk && !player.attackTarget) {
      player.previousPosition = [...player.position];
      player.movementPath = [];
      player.isMoving = false;
      player.isRunning = false;
      return false;
    }
    this.droppedWalk = null;
    if (!this.water) {
      this.skipCrests(player, step);
      return undefined;
    }
    // The normal movement step is skipped in water. Reset last tick's carried
    // path so an idle player at the shore doesn't replay the shove each frame.
    player.previousPosition = [...player.position];
    player.movementPath = [];
    player.isMoving = false;
    player.isRunning = false;
    const {lane, columns, edge} = swim(this.water.direction);
    const [x] = player.position;
    if (this.water.climbTick !== undefined) {
      if (this.tick < this.water.climbTick) return false;
      this.water = null;
      place([x, edge], player.facing);
      return true;
    }
    if (!destination) return false;
    // A click on the Rock steps, or past them onto the platform in their columns, is to climb them.
    const climbing = columns.includes(destination[0]) && destination[1] !== lane;
    if (climbing && columns.includes(x)) {
      this.water.climbTick = this.tick + 1;
      return false;
    }
    const targetX = climbing
      ? columns.reduce((best, column) => Math.abs(column - x) < Math.abs(best - x) ? column : best)
      : Math.max(crestColumns[0], Math.min(crestColumns[1], destination[0]));
    if (targetX === x) return false;
    place([x + Math.sign(targetX - x), lane], player.facing);
    return true;
  }
  clearSpecial(context) {
    this.waveFronts = [];
    this.pendingJug = null;
    for (const obj of [...this.of("rock"), ...this.of("wave"), ...this.of("jug"), ...this.of("broken-jug")])
      this.remove(context, obj);
    this.active = null;
  }
  finish(context) {
    this.clearSpecial(context);
    for (const cloud of this.of("cloud")) this.remove(context, cloud);
    this.acid.clear();
    this.splashes.length = 0;
    this.water = null;
    this.waveShove = null;
    this.wavePush = null;
    this.droppedWalk = null;
    this.queue.length = 0;
  }
  step(context, settings, boss) {
    this.waveShove = null;
    this.raid = settings.raid ?? 0;
    this.tick = context.tick;
    if (this.splashes.length) this.splashes = this.splashes.filter(s => context.tick - s.tick < 3);
    const hits = [],
      player = context.world.actors.get("player");
    if (!player?.alive || !boss?.alive) return hits;
    if (this.observe(boss)) {
      this.clearSpecial(context);
      // The first enraged spit already plays its own growl. The Great Roar
      // sequence would override the opening of its jaw.
    }
    if (this.active?.throws) this.landThrows(context, settings, context.tick - this.active.start - (this.active.throwDelay ?? 0));
    if (this.active?.acidSpread?.length) {
      const elapsed = context.tick - this.active.start - (this.active.throwDelay ?? 0) - specialThrow.acidLandingTick;
      this.active.acidSpread = this.active.acidSpread.filter(({to, travelTicks}) => {
        if (travelTicks > elapsed) return true;
        this.depositAcid(to);
        return false;
      });
    }
    this.stepJugs(context, settings, player);
    this.clouds(context, player, hits, settings, boss);
    // OBS (REC, ticks 167, 168 and 178, raid level 370): a tick on a pool hit 19, the next tick 22, and a
    // later single tick 14, each as a poison hitsplat: no climb from 2. inferred from those three: 6-9
    // before the raid level, which gives 14-22 there.
    if (this.acid.has(key(player.position))) {
      this.acidTicks++;
      hits.push(
        hazard("Zebak acid", [6, 9].map(damage => scaleToaDamage(damage, this.raid)), {
          applyPoison: 2,
          hitsplatType: "poison",
        }),
      );
    } else this.acidTicks = 0;
    if (this.water && (context.tick - this.water.entered) % 4 === 0)
      hits.push(
        hazard("Crocodile bite", [8, 20], {
          attackType: "melee",
          prayerReduction: { type: "reduce", value: 0.6 },
        }),
      );
    this.advanceWaveFronts(context, player, hits);
    if (!this.active) return hits;
    const { kind, start, direction } = this.active,
      age = context.tick - start;
    if (kind === "roar") {
      const roarAge = age - roarWindupTick(settings.period, this.active.secondRoar);
      if (roarAge === 0) this.graphics(context, [], "roar");
      const rocks = this.of("rock");
      const sheltered = ([x, y]) => rocks.some(({actor}) => {
        const [rockX, rockY] = actor.position;
        return y === rockY && x > rockX && x <= rockX + 3;
      });
      if (roarTicks.dust.includes(roarAge)) {
        const dust = [];
        for (const key of this.walkable() ?? []) {
          const position = key.split(",").map(Number);
          if (sheltered(position) || rocks.some(({actor}) => !distance(position, actor.position))) continue;
          const tiles = Math.abs(position[0] - roarTicks.dustOrigin[0]) + Math.abs(position[1] - roarTicks.dustOrigin[1]);
          dust.push({...this.effect(2184, position), delayCycles: 1 + tiles});
        }
        this.emit(context.tickEvents, {
          animations: [], projectiles: [], graphics: dust, roarPulse: roarTicks.dust.indexOf(roarAge),
        });
      }
      if (roarTicks.damage.includes(roarAge)) {
        if (!sheltered(player.position)) hits.push(hazard("Great Roar", 50));
        for (const jug of this.of("jug")) this.breakJug(context, jug, "roar");
        const debris = [];
        for (const {actor} of rocks) {
          const damage = Math.min(50, actor.vitals.hp);
          if (!damage) continue;
          actor.vitals.hp -= damage;
          context.tickEvents.emit({type: "hitsplat_spawned", targetId: actor.id, amount: damage, hitsplatType: "damage"});
          if (actor.vitals.hp === 0) debris.push(this.effect(2191, actor.position));
        }
        if (debris.length) this.graphics(context, debris);
      }
      if (roarAge >= roarTicks.over) this.clearSpecial(context);
    } else {
      // OSRS footage shows a new row every 4.2s. The longer surge sound
      // repeats after 6.6s and 7.8s, independently of the visible crests.
      const soundAge = age + (settings.path >= 2 ? 1 : 0);
      const shore = crestShore(direction);
      if (soundAge === 6) this.graphics(context, [], "tail");
      if (age === waveTicks.boulders) {
        // Each boulder raises a fan of droplets when the first crest appears,
        // including boulders underneath the safe opening.
        const untilCrest = 7 * cyclesPerTick;
        const rocks = shoreRockColumns.map(x => ({
          ...this.effect(2195, [x, shore]),
          // In sequence 8450 the boulder's lowest vertex crosses the surface at cycle 204.
          delayCycles: untilCrest - 204,
        }));
        const splashes = rocks.map(rock => ({
          ...this.effect(68, rock.target.position),
          // Sequence 465 opens with ten cycles of flat water before the first droplets rise.
          delayCycles: untilCrest - 10,
        }));
        this.emit(context.tickEvents, {
          animations: [], projectiles: [], graphics: [...rocks, ...splashes],
          // OBS (REC, ticks 155, 307, 427): the sweep is heard in the tick the boulders fall.
          shoreSoundDelayCycles: 0,
        });
      }
      if ([14, 25, 38].includes(soundAge))
        this.emit(context.tickEvents, {animations: [], graphics: [], projectiles: [], tidalSurgeSound: true});
      if (waveTicks.crests.includes(age)) {
        const gap = gapStart.first + Math.floor(this.random() * gapStart.count);
        const front = {startTick: context.tick, direction, gap, gapWidth: settings.gap, actors: []};
        front.y = shore;
        front.tick = context.tick;
        for (let x = crestColumns[0]; x <= crestColumns[1]; x++) {
          if (x >= gap && x < gap + settings.gap) continue;
          const wave = this.spawn(context, "wave", 11738, [x, shore]);
          wave.actor.facing = direction > 0 ? 1024 : 0;
          front.actors.push(wave);
        }
        this.waveFronts.push(front);
      }
      if (age >= waveTicks.over) this.clearSpecial(context);
    }
    return hits;
  }
}
