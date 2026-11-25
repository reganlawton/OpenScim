// Vardorvis, the first boss of Desert Treasure II: the post-quest version and
// the awakened one (versions, below).
// https://oldschool.runescape.wiki/w/Vardorvis/Strategies
//
// He waits until he is attacked, then runs at the player and slashes every
// five ticks, harder and with less defence the lower his hitpoints. Tendrils
// on the arena's edge throw axes that sweep it and make the player bleed.
// Below 570 hitpoints a head rises beside him and gazes at the player (a
// ranged projectile that, unprayed, drains prayer and turns the overheads
// off), and he darts at the player, cracking the ground into spikes. He heals
// half of what his slashes and spikes deal.
//
// Sources, beside the usual: OBS here is rsprox recordings 3285 and 3344 as
// RSPSApp/tsps reads them (its docs/vardorvis.md, data/vardorvis.json). Its
// choice of special ("fitted", not recorded) is not taken over.
// Ids are the cache's; their names are from its gameval index.
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { CollisionFlag, createCollisionMap } from "../../engine/collision.js";
import { getArenaCollisionMap } from "../../engine/arena.js";
import { clearPlayerAttackTarget } from "../../engine/playerAttack/launch.js";
import { rollNpcAttack, isNpcInAttackRange } from "../shared/npcAttack.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { buildNpcProjectileVisual, healNpc } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";

export const vardorvisKind = "vardorvis";
export const vardorvisAwakenedKind = "vardorvis_awakened";
// CACHE: the Ritual Site of the Stranglewood, region 4405. The arena is the
// 13 x 13 inside the tendril barrier (OBS: 1123 to 1135, 3412 to 3424): the
// barrier takes its edge, eight pillars stand inside.
export const vardorvisMapSquare = { x: 17, y: 53 };
const ring = { minX: 36, maxX: 46, minY: 21, maxY: 31 };
const barrier = { minX: 35, maxX: 47, minY: 20, maxY: 32 }; // OBS: its 48 edge tiles
const pillars = new Set(["36,28", "39,21", "43,21", "43,31", "46,28", "46,24", "36,24", "39,31"]); // CACHE
const centre = [41, 26]; // OBS 1129,3418
// Beside him, inside the arena. (OBS: the game puts the player over the rocks
// at 29,36, outside the barrier, to walk in; the simulator skips the walk.)
const playerStart = [40, 24];
export const bossStart = [40, 25]; // OBS

export const ids = {
  boss: 12223, // CACHE vardorvis
  tendril: 12225, // CACHE vardorvis_big_tentacle
  axe: 12227, // CACHE vardorvis_axe
  head: 12226, // CACHE vardorvis_head_tentacle
};
export const seqs = {
  idle: 10337, // CACHE npc_vardorvis_01_idle_01
  walk: 10338, // CACHE npc_vardorvis_01_walk_forward_01
  melee: 10340, // CACHE npc_vardorvis_01_melee_01
  dash: 10341, // CACHE npc_vardorvis_01_dash_01
  death: 10346, // CACHE npc_vardorvis_01_death_01
  tendrilIdle: 10363, // CACHE npc_vardorvis_axe_01_idle_01
  tendrilRise: 10364, // CACHE npc_vardorvis_axe_01_spawn_01
  tendrilWindup: 10365, // CACHE npc_vardorvis_axe_01_attack_start
  strangleStart: 10342, // CACHE npc_vardorvis_01_entangle_start
  strangleHold: 10343, // CACHE npc_vardorvis_01_entangle_loop
  strangleEnd: 10344, // CACHE npc_vardorvis_01_entangle_end
  axeSpin: 10366, // CACHE proj_vardorvis_axe_01
  headScream: 10348, // CACHE npc_vardorvis_01_head_01_scream_01
};
export const spots = {
  crackWarning: 2510, // CACHE vfx_vardorvis_spike_warning_01
  spike: 2512, // CACHE vfx_vardorvis_spike_combined
  headScream: 2550, // CACHE vfx_vardorvis_01_head_01_scream_ranged_01
  headProjectile: 2521, // CACHE vfx_vardorvis_head_projectile_ranged_01
  headImpact: 2552, // CACHE vfx_vardorvis_head_projectile_impact_ranged_01
  headScreamMagic: 2549, // CACHE vfx_vardorvis_01_head_01_scream_magic_01
  headProjectileMagic: 2520, // CACHE vfx_vardorvis_head_projectile_magic_01
  headImpactMagic: 2551, // CACHE vfx_vardorvis_head_projectile_impact_magic_01
  sporesSpawn: 2523, // CACHE vfx_player_vardorvis_spores_spawn
  sporesIdle: 2524, // CACHE vfx_player_vardorvis_spores_idle
  sporesDespawn: 2525, // CACHE vfx_player_vardorvis_spores_despawn
};

const bossActorId = "vardorvis";
const attackTicks = 5; // WIKI, OBS
const firstAttackTicks = 1; // OBS: his first slot, after the first hit on him
const slashDelayTicks = 1; // OBS: a slash lands a tick later
const runSteps = 2; // OBS: he runs
const meleePrayerReduction = { type: "reduce", value: 0.25 }; // WIKI: a quarter through Protect from Melee
const throwTicks = 3; // OBS: tendrils rise, wind up a tick later, throw 3 ticks after rising
const axeSteps = [2, 2, 2, 1]; // OBS: tiles a tick
const axePrayerReduction = { type: "reduce", value: 0.5 }; // WIKI
// OBS (four bleeds in two logs, every hit accounted for): 3 a hit, 6, 11 and
// 16 ticks after the cut; and every tick the player runs while bleeding (the
// cut's own tick included; walking does not count) brings one more hit 2
// ticks later, one hit a tick at most. A new cut starts it over. The WIKI's
// "3 every 3 ticks over 14, every tick if running" does not fit the logs.
const bleed = { hits: [6, 11, 16], afterRun: 2 }; // the damage of a hit is the version's
// OBS: the eight edge quadrants of the arena (3 x 3, south-west tiles).
const tendrilAnchors = [[35, 25], [35, 30], [40, 30], [45, 30], [45, 25], [45, 20], [40, 20], [35, 20]];
// The head rides on the first slot at least 5 ticks after an axe set on which
// the player is in his reach, once he is below 570 (OBS). It came with 32 of
// the 49 axe sets in four logged fights (OBS); the chance is that share.
const headRideTicks = 5; // RSPSApp, OBS
const headChance = 32 / 49; // OBS, four fights
const headFlightTicks = 3; // OBS
const headPrayerDrain = 10; // WIKI, OBS
const headDisableTicks = 3; // WIKI, OBS
// OBS: the first darts at F+31 and F+41, then 32, 32, 36 and 42 ticks apart.
// The chance is RSPSApp's, fitted to its recordings: inferred.
const dartRules = { firstTicks: 30, cooldownTicks: 30, chance: 0.6 };
// OBS: where a dart lands him, as offsets from the player of his 2 x 2's
// south-west tile: west, east, north, south; each dart takes the side
// opposite the last (RSPSApp's table; the three darts logged agree).
const dartSides = [[[-2, -1], [-2, 0]], [[1, -1], [1, 0]], [[-1, 1], [0, 1]], [[-1, -2], [0, -2]]];
const oppositeSide = [1, 0, 3, 2];
// OBS: the cracks of a dart, as offsets from the player, with their delays in
// cycles. The first dart of a set cracks one half of a 3 x 5 zigzag round the
// player, his own tile in it; the second the other half (three sets logged).
// A third cracks 3 tiles of the 5 x 5 (one logged: which ones is inferred).
// With the player on the edge of the floor, a dart cracks one tile, the one
// next to him towards the middle (two logged).
const dartCracks = [
  [[1, -2, 3], [-1, -1, 3], [0, 0, 6], [1, 1, 9], [-1, 2, 12]],
  [[1, 2, 3], [-1, 1, 3], [1, -1, 9], [-1, -2, 12]],
];
const thirdDartCracks = 3;
// OBS: the barrier rises from the south-east corner both ways round, 2
// cycles a tile from 30; its tendrils go short, tall, short, medium, ...
const barrierSpots = { 0: 2516, 1: 2518, 2: 2516, 3: 2517, 4: 2516, 5: 2518, 6: 2516, 7: 2518, 8: 2516, 9: 2517, 10: 2516, 11: 2518 };
const eruptTicks = 3; // OBS
const catchUpStuckTicks = 2; // inferred
const crackLift = 4; // model units above the floor: inferred, against flicker (the game draws it at the floor)
const deathTicks = 4; // OBS
// The strangle. Below 570 an axe set that falls due may be replaced by it
// (OBS: 10 of 57 in four fights; RSPSApp: never twice running); it comes on his next
// slot, whose slash still lands (OBS). Two ticks later he holds the player
// (OBS), who cannot move or attack and must destroy every spore of the
// overlay within the version's window. The first strangle has 4 spores, each later
// one more, up to 6 (WIKI, OBS). The next axes come 3 ticks after the player
// is let go (OBS: three escapes).
export const strangle = {
  chance: 10 / 57,
  holdTicks: 2,
  spores: [4, 6],
  axesAfterTicks: 3,
};
export const strangleKind = "vardorvis";
export const destroySporeCommandType = "destroy-spore";
// OBS: interface 833's 240 x 144 box holds the spores (48 x 48 each) on a 4 x
// 3 grid of cells 55 across and 41 down, each a few pixels off its corner.
const sporeCells = { x: [10, 65, 120, 175], y: [5, 46, 87], jitter: [7, 6] };
const headProjectile = {
  spotAnimId: spots.headProjectile,
  timing: { delay: 15, lengthAdjustment: 0, stepMultiplier: 0, progress: 0 }, // OBS: start 15, end 90
  slope: 8, // OBS
  startHeight: 124, // OBS
  endHeight: 96, // OBS
};

const key = ([x, y]) => x + "," + y;
// The copies of the arena's collision that refineArenaConfig made: the only
// ones the barrier is put on or taken off (another fight's are not touched).
const barrierMaps = new WeakSet();
const closeOrOpen = (map, closed) => {
  for (const { tile: [x, y] } of barrierTiles) closed ? map.flag(x, y, CollisionFlag.OBJECT) : map.unflag(x, y, CollisionFlag.OBJECT);
};
// The tick's event buffer, for the heal's hitsplat: the engine's rules hook
// (getEngineRules) is not handed one. Kept off the encounter, out of its state.
const tickEventsOf = new WeakMap();
const onFootprint = ([px, py], [x, y], size) => px >= x && px < x + size && py >= y && py < y + size;
const onFloor = ([x, y]) => x >= ring.minX && x <= ring.maxX && y >= ring.minY && y <= ring.maxY && !pillars.has(x + "," + y);

// The barrier's tiles in the order it rises: from the south-east corner, `d`
// tiles round it either way.
const barrierTiles = (() => {
  const { minX, maxX, minY, maxY } = barrier;
  const loop = [];
  for (let y = minY; y <= maxY; y++) loop.push([maxX, y]);
  for (let x = maxX - 1; x >= minX; x--) loop.push([x, maxY]);
  for (let y = maxY - 1; y >= minY; y--) loop.push([minX, y]);
  for (let x = minX + 1; x < maxX; x++) loop.push([x, minY]);
  return loop.map((tile, i) => ({ tile, d: Math.min(i, loop.length - i) }));
})();

// What differs between the two versions.
// https://oldschool.runescape.wiki/w/Vardorvis/Strategies (Awakened mode)
// Nothing of the awakened fight is logged yet: its numbers are the WIKI's, and
// where the WIKI gives none, the post-quest one scaled to his hitpoints
// (inferred).
export const versions = {
  postQuest: {
    tableVersion: "Post-quest", // TABLE
    maxHp: 700, // WIKI, TABLE
    enrageHp: 231, // WIKI, OBS: a third
    specialsHp: 570, // WIKI: head, darts and strangle below this
    // WIKI: Strength 270 to 360 and Defence 215 to 145 in step with his lost
    // hitpoints. With his +10 strength bonus that is the max hit of 32 to 43
    // (WIKI), so the engine's formula gives it.
    strength: [270, 360],
    defence: [215, 145],
    axeClock: { first: 14, every: 13, enraged: 8 }, // OBS, ticks from the first hit on him
    // WIKI: one axe above 690 hitpoints, two from 231 (OBS: a third 60% of the time), three below.
    axeCount: (hp, random) => (hp > 690 ? 1 : hp >= 231 ? (random() < 0.6 ? 3 : 2) : 3),
    // OBS: a cut never rolls low. Under Protect from Melee (which halves it, WIKI)
    // eleven cuts in four logs did 12 to 16; unprayed, one did 24. The top is the
    // WIKI's 35.
    axeDamage: [24, 35],
    risingTendrilHits: false, // OBS
    bleedDamage: 3, // OBS
    // The WIKI's top is 25; the two spikes logged did 24 and 25 (OBS). 20 as the
    // floor is the user's choice, until more are logged.
    spikeDamage: [20, 25],
    strangleWindowTicks: 5, // WIKI
    strangleDamage: [15, 25], // WIKI "~25"; RSPSApp rolls 60% of it to all of it: inferred
    // WIKI: one dart above 500 hitpoints, two above 130, three below.
    dartCount: (hp) => (hp > 500 ? 1 : hp > 130 ? 2 : 3),
    magicHeadChance: 0, // WIKI, OBS: the head's gaze is ranged
    headPairsBelowHp: 0,
  },
  awakened: {
    tableVersion: "Awakened", // TABLE: 1400 hitpoints, Attack 420
    maxHp: 1400, // WIKI, TABLE
    enrageHp: 462, // WIKI: four axes below 462, a third
    specialsHp: 1140, // inferred: the post-quest 570 of 700
    // WIKI: Strength 391 to 522 and Defence 268 to 181. With his +10 strength
    // bonus the formula gives the WIKI's max hit of 46 to 61.
    strength: [391, 522],
    defence: [268, 181],
    // WIKI: "Swinging Axes spawn on par with normal mode enrage speed for the
    // entire fight". The first set as in the post-quest fight: inferred.
    axeClock: { first: 14, every: 8, enraged: 8 },
    // WIKI: two if he has lost less than 20 hitpoints, three from 462 to 1380
    // "with a possibility of a fourth" (60%, as the post-quest third: inferred),
    // four below 462.
    axeCount: (hp, random) => (hp > 1380 ? 2 : hp >= 462 ? (random() < 0.6 ? 4 : 3) : 4),
    // WIKI: up to 96. The floor is the post-quest 24 of 35, scaled: inferred.
    axeDamage: [66, 96],
    // WIKI: "Swinging Axes will deal damage upon appearing. This will not cause
    // a bleed", and the player stands by the pillars, not the edges. Read as:
    // a tendril cuts whoever stands in its 3 x 3 as it rises (inferred).
    risingTendrilHits: true,
    bleedDamage: 5, // WIKI
    spikeDamage: [32, 40], // WIKI: up to 40; the floor is the post-quest 20 of 25, scaled: inferred
    strangleWindowTicks: 3, // WIKI
    strangleDamage: [24, 40], // WIKI "~40"; the floor as the post-quest one: inferred
    // inferred: the post-quest 500 and 130 of 700.
    dartCount: (hp) => (hp > 1000 ? 1 : hp > 260 ? 2 : 3),
    // WIKI: the head "may use a magic attack" (as often as the ranged one:
    // inferred); below half his hitpoints it launches a magic and a ranged
    // projectile 1 tick apart, in a random order.
    magicHeadChance: 0.5,
    headPairsBelowHp: 700,
  },
};

function plainActor(id, npcTypeId, size, position, idle) {
  return {
    id, kind: "npc", role: "npc", npcTypeId, archetypeId: id.replace(/-\d+$/, ""), size, alive: true,
    position: [...position], previousPosition: [...position], facing: 0, lockedFacing: 0,
    untargetable: true, blocksNpcMovement: false, passThruNpcs: true, history: new Map(),
    vitals: { hp: 1, maxHp: 1 },
    combat: { attackSpeed: 1, attackRange: 0, attackStyle: "typeless", nextActionTick: 0, targetId: null, lastAttackTick: null,
      animations: { idle, walk: idle, run: idle, attack: null, death: null } },
  };
}

class VardorvisEncounter {
  constructor(kind = vardorvisKind, version = versions.postQuest) {
    this.kind = kind;
    Object.defineProperty(this, "version", { value: version }); // fixed for the fight: not state
    this.reset();
  }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.serial = 0;
    this.fightStart = null; // the tick he was first attacked
    this.nextAxesTick = null;
    this.tendrils = []; // { actor, dir, throwTick }
    this.axes = new Map(); // id -> { actor, dir, step }
    this.headDueTick = null; // a head rides on the first slash from this tick
    this.heads = []; // { actor, impactTick, style, last }: a pair is two entries of one head
    this.cracks = []; // { tick, tiles }
    this.lastDartTick = -Infinity;
    this.darts = null; // { left, side }: the darts still to come, one a tick
    this.stuckTicks = 0; // ticks he could not step towards a player out of his reach
    this.catchUpTick = null;
    this.bleed = null; // { until, next }
    this.boss = null;
    this.barrierTick = null;
    this.strangleDue = false; // the next slot is a strangle
    this.held = null; // { start, holdTick, failTick, spores, endTick }
    this.strangles = 0;
    this.lastSetWasStrangle = false;
    this.setBarrier(false);
  }
  getSeeds() {
    return { encounterSeed: this.seed };
  }
  getDefaultMechanicsConfig() {
    return {};
  }
  getDefaultPlayerStart() {
    return [...playerStart];
  }
  getIntroConfig() {
    return null;
  }
  getArenaConfig() {
    return { bounds: null, collisionMap: null, walkableTiles: null };
  }
  // The ritual site is open until the fight starts; then the barrier blocks
  // its edge (OBS: the tendril locs stand there from the tick after the
  // first hit). The arena's collision is copied so that it can be closed.
  refineArenaConfig(arena) {
    if (!arena.collisionMap) return arena;
    const map = createCollisionMap(arena.collisionMap.sizeX, arena.collisionMap.sizeY);
    map.flags.set(arena.collisionMap.flags);
    barrierMaps.add(map);
    if (this.barrierStands(this.tick)) closeOrOpen(map, true);
    return { ...arena, collisionMap: map };
  }
  // The barrier on the collision the engine moves the player on (engine/
  // arena.js), when that is one of the copies above. The application applies
  // the arena anew during a fight: when its collision has loaded, on a Take
  // Over, when the cache is reloaded, and when it makes another engine of the
  // fight. Each time it is a fresh copy, open: so the barrier is closed on
  // every tick it stands, not on the one it rises (where, before the arena
  // had loaded, there was nothing yet to close).
  setBarrier(closed) {
    const map = getArenaCollisionMap();
    if (barrierMaps.has(map)) closeOrOpen(map, closed);
  }
  barrierStands(tick) {
    return this.barrierTick !== null && tick !== undefined && tick >= this.barrierTick;
  }
  // OBS: the barrier rises on the first hit, and blocks a tick later.
  raiseBarrier(context) {
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
      graphics: barrierTiles.map(({ tile, d }) => ({ spotAnimId: barrierSpots[d % 12], target: { kind: "tile", position: tile }, height: 0, delayCycles: 30 + 2 * d })) });
    this.barrierTick = context.tick + 1;
  }
  createNpcs() {
    const { tableVersion, maxHp, strength, defence } = this.version;
    const formulaStats = structuredClone(getMonsterFormulaStats(ids.boss, tableVersion));
    formulaStats.levels.strength = strength[0];
    formulaStats.levels.defence = defence[0];
    return [{
      id: bossActorId, kind: "npc", role: "boss", npcTypeId: ids.boss, archetypeId: "vardorvis", size: 2, alive: true,
      position: [...bossStart], previousPosition: [...bossStart], facing: 0, history: new Map(),
      vitals: { hp: maxHp, maxHp }, formulaStats,
      combat: { attackSpeed: attackTicks, attackRange: 1, attackStyle: "melee", nextActionTick: Infinity, targetId: "player", lastAttackTick: null,
        animations: { idle: seqs.idle, walk: seqs.walk, run: seqs.walk, attack: seqs.melee, death: seqs.death } },
    }];
  }
  // WIKI: he is not aggressive. OBS: his clock and the barrier start on the
  // tick the first hit on him lands.
  onPlayerAttackResolved(hit, context) {
    if (this.fightStart !== null || hit.targetId !== bossActorId) return;
    this.fightStart = hit.tick;
    this.nextAxesTick = hit.tick + this.version.axeClock.first;
    const boss = context.world.getNpc(bossActorId);
    if (boss) boss.combat.nextActionTick = hit.tick + firstAttackTicks;
    this.raiseBarrier({ ...context, tick: hit.tick });
  }

  // --- each tick, before the NPCs ---------------------------------------
  resolveHazards(context) {
    const hits = [];
    const boss = context.world.getNpc(bossActorId);
    const player = context.world.getPlayer();
    const at = [...context.playerPos];
    tickEventsOf.set(this, context.tickEvents);
    if (boss?.alive) this.scaleStats(boss);
    if (this.barrierStands(context.tick)) this.setBarrier(true);
    // OBS: an axe cuts whoever is under it, then moves; once per axe.
    for (const axe of this.axes.values()) if (!axe.cut && player?.alive && onFootprint(at, axe.actor.position, 3)) this.cut(axe, context, hits, at);
    for (const crack of this.cracks.filter((c) => c.tick === context.tick)) {
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
        graphics: crack.tiles.map((position) => ({ spotAnimId: spots.spike, target: { kind: "tile", position }, height: 0, delayCycles: 0 })) });
      if (player?.alive && crack.tiles.some((t) => key(t) === key(at)))
        hits.push({ source: "Vardorvis' spikes", attackType: "typeless", baseDamage: this.version.spikeDamage, playerPosition: at });
    }
    this.cracks = this.cracks.filter((c) => c.tick > context.tick);
    for (const head of this.heads.filter((h) => h.impactTick === context.tick)) {
      const prayed = isCorrectProtectionPrayer(head.style, player?.activePrayer);
      hits.push({ source: "Vardorvis' head", attackType: head.style, baseDamage: 0, playerPosition: at,
        ...(prayed ? {} : { disablesProtectionPrayersForTicks: headDisableTicks }) });
      if (head.last) context.despawnNpc(head.actor.id);
    }
    this.heads = this.heads.filter((h) => h.impactTick > context.tick);
    if (boss?.alive && this.nextAxesTick !== null && context.tick >= this.nextAxesTick) {
      if (boss.vitals.hp < this.version.specialsHp && !this.lastSetWasStrangle && this.random() < strangle.chance) {
        this.strangleDue = true;
        this.nextAxesTick = null;
        this.lastSetWasStrangle = true;
      } else {
        this.lastSetWasStrangle = false;
        this.raiseTendrils(boss, context, hits, at, player);
      }
    }
    if (this.held && boss?.alive) this.stepStrangle(boss, player, context, hits);
    this.tick = context.tick;
    for (const tendril of this.tendrils.filter((t) => t.throwTick === context.tick)) this.throwAxe(tendril, context, hits, at, player);
    this.tendrils = this.tendrils.filter((t) => t.throwTick > context.tick);
    return hits;
  }
  // --- each tick, after the player -------------------------------------
  processPostTick(context) {
    const hits = [];
    const player = context.world.getPlayer();
    for (const [id, axe] of this.axes) if (axe.step > axeSteps.length) { context.despawnNpc(id); this.axes.delete(id); }
    if (this.bleed && player?.alive) {
      const ran = (player.movementPath?.length ?? 0) > 1;
      if (ran && context.tick + bleed.afterRun <= this.bleed.end) this.bleed.due.add(context.tick + bleed.afterRun);
      if (this.bleed.due.delete(context.tick)) hits.push({ source: "Vardorvis' bleed", attackType: "typeless", baseDamage: this.version.bleedDamage, hitsplatType: "bleed" }); // OBS: hitsplat 67
      if (context.tick >= this.bleed.end) this.bleed = null;
    }
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    return hits;
  }
  moveNpc(npc, context) {
    if (npc.id === bossActorId) {
      if (this.fightStart === null) return [];
      // A dart glides him beside the player (OBS); it is decided here, before his turn, so that he lands first.
      if (!this.darts && context.tick >= npc.combat.nextActionTick && this.wantsDart(npc, context.tick)) {
        this.darts = { left: this.version.dartCount(npc.vitals.hp), index: 0, side: Math.floor(this.random() * 4), tick: context.tick };
        this.lastDartTick = context.tick;
      }
      if (this.darts?.tick === context.tick) {
        const landing = this.dartLandingFor(this.darts.side, context.world.getPlayer().position, npc.position);
        if (landing) this.darts.side = landing.side;
        return landing ? [{ npcId: npc.id, path: [landing.tile] }] : [];
      }
      // WIKI: "If Vardorvis is somehow unable to reach his target, he may
      // either dart to them to catch up (without creating cracks in the
      // ground) or may instead launch a crack under the player". OBS: out of
      // reach with a free way to the player, he cracks (two of two). So he
      // darts when he is stuck: out of reach on a slot after two ticks in
      // which he could not step towards the player (behind a pillar).
      // Inferred: no catch-up dart has been logged yet.
      const player = context.world.getPlayer();
      const inReach = player && isNpcInAttackRange(npc, player, 1);
      if (!this.darts && player?.alive && !inReach && context.tick >= npc.combat.nextActionTick && this.stuckTicks >= catchUpStuckTicks) {
        const landing = this.dartLandingFor(Math.floor(this.random() * 4), player.position);
        if (landing) {
          this.catchUpTick = context.tick;
          this.stuckTicks = 0;
          return [{ npcId: npc.id, path: [landing.tile] }];
        }
      }
      // He runs: two pursuit steps a tick.
      const path = [];
      let at = npc;
      for (let n = 0; n < runSteps; n++) {
        const step = getNpcPursuitMoves(at, { ...context, random: this.random })[0]?.path[0];
        if (!step) break;
        path.push(step);
        at = { ...npc, position: step };
      }
      this.stuckTicks = !inReach && path.length === 0 ? this.stuckTicks + 1 : 0;
      return path.length ? [{ npcId: npc.id, path }] : [];
    }
    const axe = this.axes.get(npc.id);
    if (!axe) return [];
    const length = axeSteps[axe.step++];
    if (!length) return [];
    const [x, y] = npc.position;
    const path = Array.from({ length }, (_, n) => [x + axe.dir[0] * (n + 1), y + axe.dir[1] * (n + 1)]);
    return [{ npcId: npc.id, path }];
  }
  processNpcTick(npc, context) {
    const idle = { environmentalDamages: [] };
    if (npc.id !== bossActorId) return idle;
    this.boss = npc;
    const player = context.world.getPlayer();
    if (!player?.alive) return idle;
    // A catch-up dart (moveNpc): no cracks; he slashes the tick after, as after any dart.
    if (this.catchUpTick === context.tick) {
      emitInfernoVisual(context.tickEvents, { animations: [{ actorId: npc.id, clipId: "dash", delayCycles: 0 }], projectiles: [], graphics: [] });
      npc.combat.nextActionTick = context.tick + 1;
      return idle;
    }
    if (this.darts?.tick === context.tick) {
      this.dart(npc, context);
      // OBS: one dart a tick, each to the opposite side; he slashes the tick after the last.
      this.darts = --this.darts.left > 0 ? { ...this.darts, index: this.darts.index + 1, side: oppositeSide[this.darts.side], tick: context.tick + 1 } : null;
      npc.combat.nextActionTick = context.tick + 1;
      return idle;
    }
    if (context.tick < npc.combat.nextActionTick) return idle;
    npc.combat.nextActionTick = context.tick + attackTicks;
    // OBS: a slot he cannot reach the player on puts a crack under him instead.
    if (!isNpcInAttackRange(npc, player, 1)) {
      emitInfernoNpcAttack(context, { actor: npc, target: player, clipId: "attack", kind: "vardorvis_crack", impactDelayTicks: eruptTicks });
      this.crack(context, [[...player.position, 0]]);
      return idle;
    }
    if (this.isHeadDue(npc, context.tick)) {
      this.headDueTick = null;
      this.raiseHead(npc, context);
    }
    const attack = rollNpcAttack({
      attacker: npc, target: player, random: this.random,
      plan: { formulaStyle: "melee_slash", damageType: "melee", attackKind: "melee_slash", impactDelayTicks: slashDelayTicks, sourceDeathPolicy: "cancel-before-impact" },
    });
    // OBS: the strangle comes on a slot; its slash lands as any other.
    const strangling = this.strangleDue;
    if (strangling) this.startStrangle(context);
    emitInfernoNpcAttack(context, { actor: npc, target: player, clipId: strangling ? "strangleStart" : "attack", kind: strangling ? "vardorvis_strangle" : "vardorvis_melee", impactDelayTicks: slashDelayTicks });
    npc.combat.lastAttackTick = context.tick;
    return { environmentalDamages: [], npcAttacks: [{ ...attack, prayerReduction: meleePrayerReduction }] };
  }

  // --- the specials ----------------------------------------------------
  scaleStats(boss) {
    const lost = 1 - boss.vitals.hp / boss.vitals.maxHp;
    const { strength, defence } = this.version;
    boss.formulaStats.levels.strength = Math.round(strength[0] + (strength[1] - strength[0]) * lost);
    boss.formulaStats.levels.defence = Math.round(defence[0] + (defence[1] - defence[0]) * lost);
  }
  raiseTendrils(boss, context, hits, at, player) {
    const { axeClock, enrageHp } = this.version;
    this.nextAxesTick = context.tick + (boss.vitals.hp <= enrageHp ? axeClock.enraged : axeClock.every);
    const anchors = [...tendrilAnchors];
    for (let n = this.version.axeCount(boss.vitals.hp, this.random); n > 0; n--) {
      const anchor = anchors.splice(Math.floor(this.random() * anchors.length), 1)[0];
      // OBS: each faces the centre; the four in the middle of a side throw straight, the corners diagonally.
      const dir = [Math.sign(centre[0] - (anchor[0] + 1)), Math.sign(centre[1] - (anchor[1] + 1))];
      const actor = plainActor("vardorvis-tendril-" + ++this.serial, ids.tendril, 3, anchor, seqs.tendrilIdle);
      context.spawnNpc(actor);
      this.tendrils.push({ actor, dir, throwTick: context.tick + throwTicks });
      // The awakened version's hit as the tendril rises: no bleed (versions).
      if (this.version.risingTendrilHits && player?.alive && onFootprint(at, anchor, 3))
        hits.push({ source: "Vardorvis' tendril", attackType: "melee", baseDamage: this.version.axeDamage, prayerReduction: axePrayerReduction, playerPosition: at });
      emitInfernoVisual(context.tickEvents, { projectiles: [], graphics: [], animations: [
        { actorId: actor.id, clipId: "rise", delayCycles: 0 },
        { actorId: actor.id, clipId: "windup", delayCycles: 30 }, // OBS: a tick later
      ] });
    }
    if (this.headDueTick === null && this.random() < headChance) this.headDueTick = context.tick + headRideTicks;
  }
  isHeadDue(boss, tick) {
    return this.headDueTick !== null && tick >= this.headDueTick && boss.vitals.hp < this.version.specialsHp;
  }
  // RSPSApp, fitted to recordings: below 570, from 30 ticks into the fight, at
  // most every 15, not while a head is due, 60% of the time. Inferred.
  wantsDart(boss, tick) {
    return boss.vitals.hp < this.version.specialsHp && tick - this.fightStart >= dartRules.firstTicks && tick - this.lastDartTick >= dartRules.cooldownTicks
      && !this.isHeadDue(boss, tick) && this.random() < dartRules.chance;
  }
  // His 2 x 2 beside the player on `side`, or the side opposite, or the other two; it must stand on the floor.
  dartLandingFor(side, [px, py]) {
    for (const s of [side, oppositeSide[side], (side + 2) % 4, oppositeSide[(side + 2) % 4]]) {
      const fits = dartSides[s].map(([dx, dy]) => [px + dx, py + dy])
        .filter(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].every(onFloor));
      if (fits.length) return { tile: fits[Math.floor(this.random() * fits.length)], side: s };
    }
    return null;
  }
  // OBS: the axe appears two tiles in from its tendril, which goes. On that
  // tick it cuts from the 3 x 3 one tile in (OBS: 8 of 8 throws with the
  // player there at the start of the tick cut on it, 1415 to 4679 in five
  // logs; the four tiles the WIKI calls safe are in it); from the next tick it
  // cuts where it is seen.
  throwAxe(tendril, context, hits, at, player) {
    context.despawnNpc(tendril.actor.id);
    const [x, y] = tendril.actor.position;
    const actor = plainActor("vardorvis-axe-" + ++this.serial, ids.axe, 3, [x + tendril.dir[0] * 2, y + tendril.dir[1] * 2], seqs.axeSpin);
    context.spawnNpc(actor);
    const axe = { actor, dir: tendril.dir, step: 0, cut: false };
    this.axes.set(actor.id, axe);
    if (player?.alive && onFootprint(at, [x + tendril.dir[0], y + tendril.dir[1]], 3)) this.cut(axe, context, hits, at);
  }
  cut(axe, context, hits, at) {
    axe.cut = true;
    hits.push({ source: "Vardorvis' axe", attackType: "melee", baseDamage: this.version.axeDamage, prayerReduction: axePrayerReduction, playerPosition: at });
    this.bleed = { end: context.tick + bleed.hits.at(-1), due: new Set(bleed.hits.map((n) => context.tick + n)) };
  }
  // A head rises on the floor, clear of him and the player. OBS: once 2 tiles
  // from him, once 6; where exactly is inferred.
  raiseHead(boss, context) {
    const player = context.world.getPlayer();
    const tiles = [];
    for (let x = ring.minX; x <= ring.maxX; x++)
      for (let y = ring.minY; y <= ring.maxY; y++) {
        const tile = [x, y];
        if (onFloor(tile) && !onFootprint(tile, boss.position, 2) && key(tile) !== key(player.position)) tiles.push(tile);
      }
    const position = tiles[Math.floor(this.random() * tiles.length)];
    const actor = plainActor("vardorvis-head-" + ++this.serial, ids.head, 1, position, seqs.headScream);
    context.spawnNpc(actor);
    // The post-quest head is always ranged; it draws nothing from the generator for it.
    const { magicHeadChance, headPairsBelowHp } = this.version;
    const styles = boss.vitals.hp < headPairsBelowHp
      ? (this.random() < 0.5 ? ["magic", "range"] : ["range", "magic"])
      : [magicHeadChance > 0 && this.random() < magicHeadChance ? "magic" : "range"];
    // One projectile a tick (WIKI), each with its own flight.
    styles.forEach((style, n) => this.heads.push({ actor, style, impactTick: context.tick + n + headFlightTicks, last: n === styles.length - 1 }));
    const magic = (style) => style === "magic";
    emitInfernoVisual(context.tickEvents, {
      animations: [{ actorId: actor.id, clipId: "scream", delayCycles: 0 }],
      projectiles: styles.map((style, n) => {
        const visual = buildNpcProjectileVisual(actor, player, { ...headProjectile, spotAnimId: magic(style) ? spots.headProjectileMagic : spots.headProjectile }, headFlightTicks * 30);
        return { ...visual, startDelayCycles: visual.startDelayCycles + 30 * n, endDelayCycles: visual.endDelayCycles + 30 * n };
      }),
      graphics: styles.map((style, n) => ({ spotAnimId: magic(style) ? spots.headScreamMagic : spots.headScream, target: { kind: "tile", position }, height: 0, delayCycles: 30 * n })),
    });
  }
  // A dart (he has already glided, in moveNpc): its cracks (dartCracks).
  dart(boss, context) {
    const [px, py] = context.world.getPlayer().position;
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId: boss.id, clipId: "dash", delayCycles: 0 }], projectiles: [], graphics: [] });
    if (px === ring.minX || px === ring.maxX || py === ring.minY || py === ring.maxY) {
      const inward = [px + Math.sign(centre[0] - px) * (px === ring.minX || px === ring.maxX), py + Math.sign(centre[1] - py) * !(px === ring.minX || px === ring.maxX)];
      this.crack(context, [[inward[0], inward[1], 0]]);
      return;
    }
    let cracks = dartCracks[this.darts.index];
    if (!cracks) {
      const around = [];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) around.push([dx, dy, 3]);
      cracks = Array.from({ length: thirdDartCracks }, () => around.splice(Math.floor(this.random() * around.length), 1)[0]);
    }
    this.crack(context, cracks.map(([dx, dy, delay]) => [px + dx, py + dy, delay]).filter(([x, y]) => onFloor([x, y])));
  }
  // Cracks, [x, y, delay in cycles], that erupt into spikes 3 ticks later (OBS).
  // The crack is a flat decal: drawn at the floor's own height it fights the
  // floor for depth and flickers, so it is lifted a thirty-second of a tile.
  crack(context, cracks) {
    this.cracks.push({ tick: context.tick + eruptTicks, tiles: cracks.map(([x, y]) => [x, y]) });
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
      graphics: cracks.map(([x, y, delay]) => ({ spotAnimId: spots.crackWarning, target: { kind: "tile", position: [x, y] }, height: crackLift, delayCycles: delay })) });
  }

  // --- the rest --------------------------------------------------------
  getEngineRules() {
    return {
      onPlayerDamageTaken: (hit) => {
        const boss = this.boss;
        // WIKI: he heals half, rounded down, of what his slashes and specials
        // deal. OBS: not of an axe's cut (12 cuts in five logs, no heal), nor
        // of the bleed (73 ticks, none).
        const heals = hit.sourceNpcTypeId === ids.boss || hit.source === "Vardorvis' spikes";
        if (heals && boss?.alive && tickEventsOf.has(this)) healNpc(boss, Math.floor(hit.effectiveDamage / 2), tickEventsOf.get(this)); // OBS: heal hitsplat on him
        if (hit.source === "Vardorvis' head" && hit.prayedCorrectly === false) return { prayerPointsDelta: -headPrayerDrain };
      },
    };
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== bossActorId) return;
    for (const id of this.axes.keys()) context.despawnNpc(id);
    for (const actor of new Set([...this.heads, ...this.tendrils].map((h) => h.actor))) context.despawnNpc(actor.id); // a pair's head once
    this.axes.clear();
    this.heads = [];
    this.tendrils = [];
    this.cracks = [];
    this.darts = null;
    this.held = null;
    this.strangleDue = false;
    this.nextAxesTick = null;
    this.headDueTick = null;
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + deathTicks, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }
  getOutcome() {
    return this.outcome;
  }
  // --- the strangle ----------------------------------------------------
  startStrangle(context) {
    this.strangleDue = false;
    const count = Math.min(strangle.spores[0] + this.strangles++, strangle.spores[1]);
    const cells = [];
    for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 3; cy++) cells.push([cx, cy]);
    const spores = Array.from({ length: count }, () => {
      const [cx, cy] = cells.splice(Math.floor(this.random() * cells.length), 1)[0];
      return {
        x: sporeCells.x[cx] + Math.floor(this.random() * sporeCells.jitter[0]),
        y: sporeCells.y[cy] + Math.floor(this.random() * sporeCells.jitter[1]),
        destroyedTick: null,
      };
    });
    const holdTick = context.tick + strangle.holdTicks;
    this.held = { start: context.tick, holdTick, failTick: holdTick + this.version.strangleWindowTicks, spores, endTick: null };
  }
  // Each tick of a strangle, before the NPCs: the hold begins, the player is
  // kept still and from attacking, and it ends when the window runs out.
  stepStrangle(boss, player, context, hits) {
    const held = this.held;
    if (held.endTick !== null) {
      if (context.tick > held.endTick) this.held = null; // OBS: the overlay closes a tick after
      return;
    }
    if (context.tick === held.holdTick) {
      emitInfernoVisual(context.tickEvents, {
        animations: [{ actorId: boss.id, clipId: "strangleHold", delayCycles: 0 }], projectiles: [],
        graphics: [{ spotAnimId: spots.sporesSpawn, target: { kind: "actor", actorId: "player", size: 1, position: [...context.playerPos] }, height: 0, delayCycles: 0 }],
      });
    }
    if (context.tick < held.holdTick) return;
    if (player?.alive) clearPlayerAttackTarget(player);
    if (held.spores.every((spore) => spore.destroyedTick !== null)) {
      this.letGo(boss, context);
    } else if (context.tick >= held.failTick) {
      hits.push({ source: "Vardorvis' tendrils", attackType: "typeless", baseDamage: this.version.strangleDamage, playerPosition: [...context.playerPos] });
      this.letGo(boss, context);
    }
  }
  letGo(boss, context) {
    this.held.endTick = context.tick;
    this.nextAxesTick = context.tick + strangle.axesAfterTicks;
    emitInfernoVisual(context.tickEvents, {
      animations: [{ actorId: boss.id, clipId: "strangleEnd", delayCycles: 0 }], projectiles: [],
      graphics: [{ spotAnimId: spots.sporesDespawn, target: { kind: "actor", actorId: "player", size: 1, position: [...context.playerPos] }, height: 0, delayCycles: 0 }],
    });
  }
  isHeld(tick) {
    return this.held !== null && this.held.endTick === null && tick >= this.held.holdTick;
  }
  // Held, the player does not move.
  moveDisplacedPlayer() {
    return this.isHeld(this.tick) ? false : undefined;
  }
  // A click on a spore of the overlay.
  executeCommand(command, context) {
    if (command.encounter !== vardorvisKind || command.type !== destroySporeCommandType || !this.isHeld(context.tick)) return null;
    const spore = this.held.spores[command.spore];
    if (!spore || spore.destroyedTick !== null) return null;
    spore.destroyedTick = context.tick; // the hold ends in stepStrangle, on this same tick
    return { gameEvents: [] };
  }
  getSnapshot() {
    const held = this.held;
    return {
      kind: this.kind,
      state: {
        bleeding: this.bleed !== null,
        // For the strangle's overlay (presentation.js): open from holdTick to a tick after endTick.
        strangle: held && { holdTick: held.holdTick, failTick: held.failTick, endTick: held.endTick, spores: held.spores.map((spore) => ({ ...spore })) },
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel() {
    return "Vardorvis";
  }
}

export const vardorvisDefinition = {
  kind: vardorvisKind,
  factory: () => new VardorvisEncounter(),
  descriptor: {
    kind: vardorvisKind,
    displayName: "Vardorvis",
    description: "Desert Treasure II. The Stranglewood's ritual site: swinging axes, the head's gaze and darting spikes.",
    mapSquare: vardorvisMapSquare,
    playerStart,
    loadsMapLocs: true,
    isWorkInProgress: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { eyebrow: "Triumphant", title: "VICTORY", narrative: "VARDORVIS DEFEATED", accent: "blood" },
    // The awakened fight is a variant kind (client/dt2/bosses.js, awakenedKind); both use the post-quest presets.
    variants: [
      { id: "post_quest", encounterKind: vardorvisKind, name: "Post-quest", subtitle: "700 hitpoints.", available: true, presetsKey: vardorvisKind },
      { id: "awakened", encounterKind: vardorvisAwakenedKind, name: "Awakened", subtitle: "1,400 hitpoints; harder axes, bleed, spikes and strangle; a magic head. From the wiki, not yet logged.", available: true, presetsKey: vardorvisKind },
    ],
    variantLabel: "Version",
  },
  controls: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] },
  variantFactories: { [vardorvisAwakenedKind]: () => new VardorvisEncounter(vardorvisAwakenedKind, versions.awakened) },
  variantControls: { [vardorvisAwakenedKind]: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] } },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { vardorvisDefinition as definition };
export const order = 70;
