// The Leviathan, the fourth boss of Desert Treasure II: the post-quest fight.
// The awakened one is not written yet (the definition offers it as coming).
// https://oldschool.runescape.wiki/w/The_Leviathan/Strategies
//
// It lies in the pool in the middle of its arena and never leaves it. From
// 4 ticks after it surfaces it fires volleys of orbs at the player, each orb
// a style of its own (magic, ranged, or from the third volley melee), which
// the right protection prayer blocks if it is up as the orb lands. Seven
// volleys, each faster than the last; the seventh repeats. After each volley
// it roars: a little damage, and a rock falls on the player's tile 7 ticks
// later and stays there. The first roar drops two more, on the east and west
// of the arena if its first special attack will be the lightning, on the north
// and south if the smoke. A player beside the pool is bitten.
//
// A shadow spell stuns it for 15 ticks: it turns no more, and from the front
// only 10 gets through a hit. A hit on its back (or 25% of its hitpoints dealt
// since the stun) wakes it with a special attack, lightning and smoke in
// turn, and its volleys start again from the second. During a special it
// takes a third less damage.
//
// At 180 hitpoints it is enraged: one roar, orbs every 2 ticks for good, a
// rock on the player every 8 ticks, and the abyssal pathfinder, which walks
// the arena clockwise. In its aura ranged hits cannot miss and do at least a
// fifth of their max, magic does double; outside it the orbs go through
// prayers.
//
// Sources, beside the usual: plain OBS is rsprox recordings 1703 (an ordinary
// world's quest fight), 1751, 3285 and six more of Leagues V and Grid Master
// worlds (the 900-hitpoint Leviathan), as RSPSApp/tsps reads them
// (docs/leviathan-normal-evidence.md and docs/leviathan.md,
// server/plugins/bosses/data/leviathan.json). OBS (video) is RSPSApp's frame
// reading of videos of ordinary kills (the wiki's clips, a 2024 guide, a 2026
// kill): about a tick either way. What RSPSApp chose without a source, or
// calls provisional, is marked inferred here, as is what no source says.
// Ids are the cache's; their names are from its gameval tables, as RSPSApp
// exports them.
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { monsterByNpcTypeIdAndVersion } from "../../data/monsters.js";
import { CollisionFlag, createCollisionMap } from "../../engine/collision.js";
import { setArenaConfig, getArenaDefaultWalkable } from "../../engine/arena.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { leviathanLoadouts } from "./loadouts.js";

export const leviathanKind = "leviathan";
export const leviathanAwakenedKind = "leviathan_awakened"; // dt2/bosses.js, awakenedKind
// CACHE: the Scar's arena, region 8291 (2048,6336). Its floor is a bridge:
// the tiles of level 1 over it (render flag 2) that are not blocked (flag 1),
// 320 of them, here as runs of x by y. The cache loader builds an arena from
// level 0, where rocks stand under the bridge, so this one is the
// encounter's own (collision "custom"). In the middle of the floor the pool,
// blocked, x 29 to 37 and y 32 to 40 but for its four corners (77 tiles, as
// RSPSApp counts them too); the Leviathan takes the 7 x 7 inside it.
export const leviathanMapSquare = { x: 32, y: 99 };
const floorRows = {
  26: [[28, 32]], 27: [[25, 34], [39, 41]], 28: [[24, 42]], 29: [[24, 42]], 30: [[24, 42]], 31: [[23, 42]],
  32: [[23, 29], [37, 42]], 33: [[23, 28], [38, 43]], 34: [[22, 28], [38, 44]], 35: [[22, 28], [38, 44]], 36: [[22, 28], [38, 44]],
  37: [[23, 28], [38, 44]], 38: [[23, 28], [38, 43]], 39: [[23, 28], [38, 43]], 40: [[23, 29], [37, 43]],
  41: [[23, 42]], 42: [[24, 42]], 43: [[24, 42]], 44: [[24, 42]], 45: [[24, 41]], 46: [[27, 29], [35, 40]], 47: [[36, 38]],
};
export const bossStart = [30, 33]; // OBS: 2078,6369
const bossSize = 7; // CACHE, WIKI
const centre = [33, 36]; // the middle of its 7 x 7
// Beside the handholds the player climbs in by (CACHE: 22,32); the tile is
// RSPSApp's (inferred).
const playerStart = [24, 34];
const pool = { minX: 29, maxX: 37, minY: 32, maxY: 40 }; // CACHE
// OBS: the pathfinder's corners, the middle of its 3 x 3, clockwise from the
// north-west: north-west, north-east and south-east recorded, south-west the
// rectangle's fourth (inferred).
const pathfinderCorners = [[27, 42], [39, 42], [39, 30], [27, 30]];
// OBS: the first roar's two extra rocks, one in each of a pair of 3 x 3s.
// WIKI: east and west for the lightning first, north and south for the smoke.
// Each a tile of its 3 x 3 at random (inferred: 306 first roars fill all of
// them, which does not say how they are drawn).
const tells = {
  lightning: [{ minX: 24, maxX: 26, minY: 35, maxY: 37 }, { minX: 40, maxX: 42, minY: 35, maxY: 37 }],
  smoke: [{ minX: 33, maxX: 35, minY: 28, maxY: 30 }, { minX: 32, maxX: 34, minY: 42, maxY: 44 }],
};

export const ids = {
  boss: 12214, // CACHE leviathan
  pathfinder: 12220, // CACHE leviathan_buff_npc, "Abyssal pathfinder"
  rubble: 47590, // CACHE leviathan_rubble, the loc a fallen rock leaves
};
export const seqs = {
  idle: 10276, // CACHE npc_leviathan_01_idle_01
  spawn: 10291, // CACHE npc_leviathan_01_spawn; OBS (video): as it surfaces
  orbStart: 10278, // CACHE npc_leviathan_01_projectile_start_01; OBS: the first orb of a volley, and every orb of a slower one
  orbLoop: 10279, // CACHE npc_leviathan_01_projectile_loop_01; OBS: the others of a one-tick volley
  orbSingle: 10281, // CACHE npc_leviathan_01_projectile_single_01; OBS: a tick after an orbStart of a slower volley
  roar: 10282, // CACHE npc_leviathan_01_stun_01: its stun; its roars and the start of the smoke too (inferred: RSPSApp's)
  bite: 10283, // CACHE npc_leviathan_01_melee_01
  stunned: 10294, // CACHE npc_leviathan_01_stun_idle; OBS (video): held after the stun's 10282
  lightning: 10285, // CACHE npc_leviathan_01_360_start
  lightningLoop: 10286, // CACHE npc_leviathan_01_360_loop
  lightningEnd: 10287, // CACHE npc_leviathan_01_360_end
  spit: 10288, // CACHE npc_leviathan_01_spit_start
  spitLoop: 10289, // CACHE npc_leviathan_01_spit_loop
  blast: 10290, // CACHE npc_leviathan_01_explosion_start
  death: 10293, // CACHE npc_leviathan_01_death; OBS
  pathfinderIdle: 10295, // CACHE npc_buff01_idle01
  pathfinderSpawn: 10296, // CACHE npc_buff01_spawn01; OBS
};
export const spots = {
  // CACHE vfx_leviathan_01_projectile_..., by style. OBS: the launch on the
  // boss, _02 with an orbStart and _01 with an orbLoop; the projectile; its
  // impact on the player (inferred: RSPSApp's).
  launchStart: { magic: 2486, range: 2484, melee: 2485 },
  launch: { magic: 2483, range: 2481, melee: 2482 },
  orb: { magic: 2489, range: 2487, melee: 2488 },
  impact: { magic: 2492, range: 2490, melee: 2491 },
  // CACHE spotanim_brain_01_falling_stay_01 to _04: a rock falling and
  // staying. OBS: on the tile of a roar's rock 50 cycles after the roar, its
  // number the rotation of the loc it leaves.
  falling: [2477, 2478, 2479, 2480],
  boulder: 2472, // CACHE projanim_brain_01: the smoke's thrown rocks (OBS (video), CACHE: grey rock, not the orb)
  boulderLands: 2473, // CACHE projanim_brain_01_impact_01: it settles and stays
  smoke: 2494, // CACHE spotanim_leviathan_explode: the blast (inferred: RSPSApp's)
  lightningWarning: 2503, // CACHE vfx_leviathan_360_ground
  lightningStrike: 2504, // CACHE vfx_leviathan_360_lightning; OBS (video): also where a side orb lands
  sideOrb: 2506, // CACHE dt2_leviathan_bomb01; OBS (video): the cyan orbs of the lightning
};

const bossActorId = "leviathan";
const pathfinderActorId = "abyssal-pathfinder";

// The volleys, from the WIKI's seven: the ticks between orbs and the styles.
// OBS: the orbs of each (1751's first three; the fourth to the seventh from a
// 2026 kill, OBS (video)), and the ticks an orb flies (5, 5, 4, 3 and 3
// recorded; the WIKI's "2 ticks to react" and "1 tick to react" for the last
// two). The seventh repeats.
const volleys = [
  { interval: 3, orbs: 6, styles: ["magic", "range"], flight: 5 },
  { interval: 2, orbs: 8, styles: ["magic", "range"], flight: 5 },
  { interval: 2, orbs: 8, styles: ["magic", "range", "melee"], flight: 4 },
  { interval: 1, orbs: 12, styles: ["magic", "range"], flight: 3 },
  { interval: 1, orbs: 10, styles: ["magic", "range", "melee"], flight: 3 },
  { interval: 1, orbs: 10, styles: ["magic", "range", "melee"], flight: 2 },
  { interval: 1, orbs: 10, styles: ["magic", "range", "melee"], flight: 1 },
];
// OBS: the roar comes a volley's interval after its last orb, and the next
// volley's first orb 5 ticks after the roar (the first three), 6 after it
// (the one-tick volleys: 7 from last orb to first, OBS (video)).
const pauseAfterRoar = (volley) => (volley.interval > 1 ? 5 : 6);
const firstAttackTicks = 4; // OBS: the first orb 4 ticks after it surfaces
// WIKI: the stun resets it to the second volley, and each later one a volley
// further down.
const volleyAfterStun = (stuns) => Math.min(volleys.length - 1, Math.max(1, stuns));
// Enraged (WIKI): every 2 ticks, magic and ranged only. OBS: the first orb 5
// ticks after the enrage, flying 5 ticks; a rock on the player every 8 ticks.
const enraged = { interval: 2, styles: ["magic", "range"], flight: 5 };
const enrageFirstAttackTicks = 5;
const enrageRockTicks = 8;
const pathfinderTicks = 3; // OBS: it appears 3 ticks after the enrage,
const pathfinderWalkTicks = 3; // OBS: and takes its first step 3 ticks after that, then one a tick.
const auraRadius = 2; // WIKI: a 5 x 5
const rockTicks = 7; // OBS: a roar's rock lands 7 ticks after it (1,151 of 1,151)
const fallingDelayCycles = 50; // OBS
const chipTicks = 1; // inferred (RSPSApp's): the roar's chip a tick after it
const stunTicks = 15; // WIKI
const stunCap = 10; // WIKI: what gets through a hit from the front while it is stunned
const stunBreakShare = 0.25; // WIKI: "25% of The Leviathan's health in damage"; counted from the stun (inferred)
const rearRangedMinimum = 0.65; // WIKI: "at least a minimum of ~65% of your maximum hit"
const auraRangedMinimum = 0.2; // WIKI
const specialReduction = 0.33; // WIKI: "reduced by 33%"; rounded down (inferred)
// WIKI: a bite only for a player beside the pool, diagonals included. OBS
// (video): one bite early in the fight, then none until after the third roar.
const earlyBites = 1;
const bitesFreeAfterRoars = 3;
// The lightning, from the hit that set it off (OBS (video), RSPSApp's
// reading: its loop 3 ticks in, 35 strikes from 5 ticks in, its end at 42
// and the volleys back at 44). Each strike is warned on the player's tile
// and lands 2 ticks later, 1 for a player on 25 hitpoints or less (WIKI,
// update of 7 February 2024). Five cyan orbs at once every 6 ticks, landing 8
// ticks later on tiles not beside the pool (WIKI: "never on the tiles
// surrounding the pool"; OBS (video)).
const lightning = { loop: 3, first: 5, strikes: 35, end: 42, over: 44, warning: 2, lowHpWarning: 1, lowHp: 25, sideEvery: 6, sideOrbs: 5, sideFlight: 8 };
// The smoke, from the hit that set it off (OBS (video), RSPSApp's reading):
// a roar, the spit 3 ticks in, ten rocks at the player one a tick from 4 ticks
// in (WIKI: ten, each 2 ticks in the air), the blast's charge at 14, the
// blast at 16, the volleys back at 19. WIKI: only the rocks of this smoke
// shelter from the blast. Rocks still in the air at the enrage land, and the
// blast still comes (WIKI).
const smoke = { spit: 3, firstRock: 4, rocks: 10, rockFlight: 2, charge: 14, blast: 16, over: 19 };
const deathTicks = 6; // OBS: from the kill to its removal (24 deaths)

// Projectiles. OBS: from 30 cycles to the impact tick, from height 550 to 100,
// slope 30, 124 out from the mouth (an orb of one tick leaves at once:
// inferred, RSPSApp's). The
// mouth is 2 tiles out from its middle towards the player, on each side of
// its 7 x 7 the player is beyond (OBS). The thrown rocks and side orbs as the
// orbs (inferred: RSPSApp's).
const orbProjectile = { startHeight: 550, endHeight: 100, slope: 30, startOffset: 124 };
const cyclesPerTick = 30;

// Max hits (WIKI, its infobox), but for those it gives none.
export const versions = {
  postQuest: {
    tableVersion: "Post-quest", // TABLE: the "Post-quest" entry of 12214, 900 hitpoints
    maxHp: 900,
    enrageHp: 180, // WIKI: "Upon reaching 180 hitpoints (20% of its health)"
    orbMaxHit: { magic: 32, range: 24, melee: 50 },
    biteMaxHit: 50,
    roarMaxHit: 7, // WIKI: "up to 7 chip damage"; that it can be 0 is inferred
    rockMaxHit: 25, // WIKI: the falling rocks
    // inferred: RSPSApp's provisional 30; no source gives one.
    lightningMaxHit: 30,
    // inferred: the side orbs as the rocks (RSPSApp's).
    sideOrbMaxHit: 25,
    // WIKI: 60 in its infobox; its Strategies says up to 59, which fits under it.
    smokeMaxHit: 60,
  },
};

const key = ([x, y]) => x + "," + y;
const chebyshev = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const inPool = ([x, y]) =>
  x >= pool.minX && x <= pool.maxX && y >= pool.minY && y <= pool.maxY && !((x === pool.minX || x === pool.maxX) && (y === pool.minY || y === pool.maxY));
// The 40 tiles beside the pool, diagonals included (WIKI; RSPSApp counts the
// same 40).
const besidePool = new Set();
for (let x = pool.minX - 1; x <= pool.maxX + 1; x++)
  for (let y = pool.minY - 1; y <= pool.maxY + 1; y++)
    if (!inPool([x, y]) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => inPool([x + dx, y + dy])))) besidePool.add(key([x, y]));
export const isBesidePool = (tile) => besidePool.has(key(tile));
const tileTarget = (position) => ({ kind: "tile", position: [...position] });

// The mouth its projectiles leave from (OBS, above).
function mouthFor([px, py]) {
  const [cx, cy] = centre;
  return [cx + (Math.abs(px - cx) > 3 ? Math.sign(px - cx) * 2 : 0), cy + (Math.abs(py - cy) > 3 ? Math.sign(py - cy) * 2 : 0)];
}
// Which way it faces, of the four, as it is stunned: towards the player
// (inferred: RSPSApp's). Its back is the side of the pool away from that, as
// wide as the pool, beyond its edge (inferred: RSPSApp's; how wide the weak
// spot is no source says).
function stunFacing([px, py]) {
  const dx = px - centre[0], dy = py - centre[1];
  return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
}
function isBehind(face, [px, py]) {
  const dx = px - centre[0], dy = py - centre[1];
  return dx * face[0] + dy * face[1] <= -4 && Math.abs(dx * face[1] - dy * face[0]) <= 4;
}
// The tiles a line from the middle of the pool to the player crosses, but for
// its ends (inferred: RSPSApp's; what shelters from the blast no source draws).
function lineBetween(from, to) {
  let [x, y] = from;
  const [tx, ty] = to, dx = Math.abs(tx - x), dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let error = dx - dy;
  const tiles = [];
  while (x !== tx || y !== ty) {
    const e = error * 2;
    if (e > -dy) { error -= dy; x += sx; }
    if (e < dx) { error += dx; y += sy; }
    if (x !== tx || y !== ty) tiles.push([x, y]);
  }
  return tiles;
}

// A fallen rock blocks the way and the line of sight (WIKI) as an object does.
const rubbleFlags = CollisionFlag.OBJECT | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
// The arena's collision with the rubble on it, the base's left as it is.
function collisionWithRubble(map, rubble) {
  const getFlag = (x, y) => (rubble.has(key([x, y])) && map.getFlag(x, y) !== -1 ? map.getFlag(x, y) | rubbleFlags : map.getFlag(x, y));
  return {
    sizeX: map.sizeX,
    sizeY: map.sizeY,
    getFlag,
    hasFlag: (x, y, mask) => {
      const flag = getFlag(x, y);
      return flag !== -1 && (flag & mask) !== 0;
    },
  };
}

// The monster table has two entries for 12214, the awakened first; each
// version names its own, and this checks that it got it.
function tableFormulaStats(version) {
  const entry = monsterByNpcTypeIdAndVersion.get(ids.boss + ":" + version.tableVersion);
  if (entry?.levels.hitpoints !== version.maxHp) throw new Error(`The Leviathan: the monster table's ${ids.boss} has no entry with ${version.maxHp} hitpoints`);
  return structuredClone(getMonsterFormulaStats(ids.boss, version.tableVersion));
}

const shadowSpells = new Set(["Shadow Rush", "Shadow Burst", "Shadow Blitz", "Shadow Barrage"]);

class LeviathanEncounter {
  constructor(kind = leviathanKind, version = versions.postQuest) {
    this.kind = kind;
    Object.defineProperty(this, "version", { value: version }); // fixed for the fight: not state
    // Not state: the arena as the engine handed it, its open tiles, and the
    // world, for the hooks that are handed none.
    for (const name of ["arenaBase", "floor", "world"]) Object.defineProperty(this, name, { value: null, writable: true });
    this.floor = [];
    this.reset();
  }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.tick = 0;
    this.surfaced = false;
    // The volleys: which, how many orbs of it so far; the roars and bites so far.
    this.volley = 0;
    this.orbs = 0;
    this.roars = 0;
    this.bites = 0;
    this.stuns = 0;
    this.nextAttackTick = firstAttackTicks;
    // A count that moves on with every roar, stun, special and the enrage:
    // what was queued before one of them checks it before it goes off.
    this.epoch = 0;
    this.stun = null; // { until, face, dealt }
    this.special = null; // { kind, start, id }
    this.specialDue = false;
    this.nextSpecial = this.random() < 0.5 ? "lightning" : "smoke"; // inferred: either, evenly
    this.firstRoar = true;
    this.enraged = false;
    this.nextEnrageRockTick = null;
    this.pathfinder = null; // { spawnTick, destination }
    this.queue = []; // { tick, run(context, hits) }, in the order queued
    this.pendingVisuals = [];
    this.rubble = new Map(); // tile key -> [x, y, rotation]
    this.cover = new Set(); // the tiles of this smoke's rocks
    this.warnings = []; // { tile, from, until }: the lightning's marks, for the scene
    this.inFlight = []; // { style, lands }: the orbs on their way, for the scene
    this.falling = []; // { tile, lands }: the rocks on their way down
    if (this.arenaBase) setArenaConfig(this.arenaWithRubble(), getArenaDefaultWalkable());
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
    const walkableTiles = new Set();
    for (const [y, runs] of Object.entries(floorRows)) for (const [from, to] of runs) for (let x = from; x <= to; x++) walkableTiles.add(key([x, Number(y)]));
    const tiles = [...walkableTiles].map((tile) => tile.split(",").map(Number));
    const [minX, maxX] = [Math.min(...tiles.map(([x]) => x)), Math.max(...tiles.map(([x]) => x))];
    const [minY, maxY] = [Math.min(...tiles.map(([, y]) => y)), Math.max(...tiles.map(([, y]) => y))];
    const bounds = { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    return { bounds, walkableTiles, collisionMap: createCollisionMap(64, 64) };
  }
  refineArenaConfig(arena) {
    this.arenaBase = arena;
    // The arena's open tiles, in a fixed order, for the side orbs to fall on.
    this.floor = arena.walkableTiles ? [...arena.walkableTiles].map((tile) => tile.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]) : [];
    return this.arenaWithRubble();
  }
  arenaWithRubble() {
    const base = this.arenaBase;
    if (!base || this.rubble.size === 0) return base;
    const walkableTiles = base.walkableTiles ? new Set(base.walkableTiles) : null;
    for (const tile of this.rubble.keys()) walkableTiles?.delete(tile);
    return { bounds: base.bounds, walkableTiles, collisionMap: collisionWithRubble(base.collisionMap, this.rubble) };
  }
  createNpcs() {
    const formulaStats = tableFormulaStats(this.version);
    const { maxHp } = this.version;
    return [{
      id: bossActorId, kind: "npc", role: "boss", npcTypeId: ids.boss, archetypeId: "leviathan", size: bossSize, alive: true,
      position: [...bossStart], previousPosition: [...bossStart], facing: 0, history: new Map(),
      vitals: { hp: maxHp, maxHp }, formulaStats,
      combat: { attackSpeed: volleys[0].interval, attackRange: 30, attackStyle: "magic", nextActionTick: firstAttackTicks, targetId: "player", lastAttackTick: null,
        animations: { idle: seqs.idle, walk: seqs.idle, run: seqs.idle, attack: seqs.orbStart, death: seqs.death } },
    }];
  }
  moveNpc(npc, context) {
    if (npc.id !== pathfinderActorId || !this.pathfinder || context.tick < this.pathfinder.walkTick) return [];
    // OBS: one step a tick, straight along the side, through the rubble.
    const at = [npc.position[0] + 1, npc.position[1] + 1];
    if (key(at) === key(pathfinderCorners[this.pathfinder.destination])) this.pathfinder.destination = (this.pathfinder.destination + 1) % pathfinderCorners.length;
    const to = pathfinderCorners[this.pathfinder.destination];
    const next = [at[0] + Math.sign(to[0] - at[0]), at[1] + Math.sign(to[1] - at[1])];
    return [{ npcId: npc.id, path: [[next[0] - 1, next[1] - 1]] }];
  }

  // --- each tick, before the NPCs ---------------------------------------
  resolveHazards(context) {
    this.tick = context.tick;
    this.world = context.world;
    const hits = [];
    const due = this.queue.filter((entry) => entry.tick <= context.tick);
    this.queue = this.queue.filter((entry) => entry.tick > context.tick);
    for (const entry of due) entry.run(context, hits);
    this.warnings = this.warnings.filter((warning) => warning.until > context.tick);
    this.inFlight = this.inFlight.filter((orb) => orb.lands > context.tick);
    this.falling = this.falling.filter((rock) => rock.lands > context.tick);
    this.flushVisuals(context);
    return hits;
  }
  // --- each tick, after the player -------------------------------------
  processPostTick(context) {
    this.flushVisuals(context);
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    return [];
  }
  processNpcTick(npc, context) {
    const idle = { environmentalDamages: [] };
    if (npc.id !== bossActorId) return idle;
    this.flushVisuals(context);
    const tick = context.tick;
    if (!this.surfaced) {
      this.surfaced = true;
      this.animate(context, "spawn");
    }
    if (!this.enraged && npc.vitals.hp <= this.version.enrageHp) this.enrage(npc, context);
    if (this.enraged && tick >= this.nextEnrageRockTick) {
      this.dropRock(context, context.playerPos);
      this.nextEnrageRockTick = tick + enrageRockTicks;
    }
    if (this.specialDue) {
      this.specialDue = false;
      this.beginSpecial(npc, context);
    }
    if (this.stun) {
      if (tick < this.stun.until) return idle;
      this.endStun(npc);
      this.nextAttackTick = tick + this.currentVolley().interval;
    }
    const player = context.world.getPlayer();
    if (this.special || tick < this.nextAttackTick || !player?.alive) return idle;
    npc.combat.lastAttackTick = tick;
    const canBite = this.enraged || this.bites < earlyBites || this.roars >= bitesFreeAfterRoars;
    const turn = canBite && isBesidePool(player.position) ? this.bite(npc, player, context) : this.fireOrb(npc, player, context);
    npc.combat.nextActionTick = this.nextAttackTick; // for the interface's attack timer
    return turn;
  }

  // --- its attacks -----------------------------------------------------
  currentVolley() {
    return this.enraged ? enraged : volleys[this.volley];
  }
  fireOrb(boss, player, context) {
    const tick = context.tick;
    const volley = this.currentVolley();
    const style = volley.styles[Math.floor(this.random() * volley.styles.length)]; // inferred: evenly
    // OBS: the startup sequence and its launch for the first orb of a volley
    // and every orb of a slower one, and the single a tick later.
    const startup = volley.interval > 1 || this.orbs === 0;
    const attack = rollNpcAttack({
      attacker: boss, target: player, random: this.random,
      // Accuracy is rolled (inferred: its attack bonuses in the monster table
      // are for that; a melee orb as a crush, inferred). The prayer is the one
      // up as the orb lands (WIKI).
      plan: { formulaStyle: style === "melee" ? "melee_crush" : style === "range" ? "ranged" : "magic", damageType: style, attackKind: style,
        maxHit: this.version.orbMaxHit[style], impactDelayTicks: volley.flight, sourceDeathPolicy: "cancel-before-impact" },
    });
    const damage = attack?.accuracySucceeded ? attack.rolledDamage : 0;
    const mouth = mouthFor(player.position);
    const flightCycles = volley.flight * cyclesPerTick;
    emitInfernoNpcAttack(context, {
      actor: boss, target: player, clipId: startup ? "orbStart" : "orbLoop", kind: "leviathan_" + style, impactDelayTicks: volley.flight,
      projectiles: [{ spotAnimId: spots.orb[style], sourcePosition: [mouth[0] + 0.5, mouth[1] + 0.5], target: buildActorVisualTarget(player),
        startDelayCycles: volley.flight > 1 ? cyclesPerTick : 0, endDelayCycles: flightCycles, ...orbProjectile }],
    });
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
      graphics: [{ spotAnimId: (startup ? spots.launchStart : spots.launch)[style], target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 }] });
    const epoch = this.epoch;
    this.inFlight.push({ style, lands: tick + volley.flight });
    if (volley.interval > 1) this.later(1, (ctx) => {
      if (this.epoch === epoch && !this.stun && !this.special) this.animate(ctx, "orbSingle");
    });
    this.later(volley.flight, (ctx, hits) => {
      const target = ctx.world.getPlayer();
      if (!target?.alive) return;
      emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.impact[style], target: buildActorVisualTarget(target), height: 0, delayCycles: 0 }] });
      // WIKI: enraged, its attacks go through the prayer of a player out of the
      // pathfinder's aura (not before the pathfinder is there: the update of 16
      // August 2023).
      const pierces = this.enraged && this.pathfinderCentre(ctx.world) !== null && !this.inAura(ctx.world, ctx.playerPos);
      hits.push({ source: "The Leviathan's orb", attackType: style, baseDamage: damage, playerPosition: [...ctx.playerPos], ...(pierces ? { prayerReduction: { type: "bypass" } } : {}) });
    });
    this.nextAttackTick = tick + volley.interval;
    if (!this.enraged && ++this.orbs >= volley.orbs) {
      this.orbs = 0;
      this.nextAttackTick += pauseAfterRoar(volley);
      this.later(volley.interval, (ctx) => {
        if (this.epoch !== epoch || this.enraged || this.stun || this.special) return;
        this.roar(ctx);
        this.volley = Math.min(volleys.length - 1, this.volley + 1);
      });
    }
    return { environmentalDamages: [] };
  }
  // The bite, for a player beside the pool (WIKI: Protect from Melee blocks it;
  // a stab, its accuracy rolled: inferred).
  bite(boss, player, context) {
    if (!this.enraged) this.bites++;
    this.nextAttackTick = context.tick + this.currentVolley().interval; // inferred (RSPSApp's): the volley goes on after
    const attack = rollNpcAttack({
      attacker: boss, target: player, random: this.random,
      plan: { formulaStyle: "melee_stab", damageType: "melee", attackKind: "melee_stab", maxHit: this.version.biteMaxHit, impactDelayTicks: 0, sourceDeathPolicy: "cancel-before-impact" },
    });
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: "bite", kind: "leviathan_bite", impactDelayTicks: 0 });
    return { environmentalDamages: [], npcAttacks: attack ? [attack] : [] };
  }
  // A roar: its chip a tick later, a rock on the player's tile, and the first
  // time the two rocks that tell its first special.
  roar(context) {
    if (!this.enraged) this.roars++;
    this.epoch++;
    this.animate(context, "roar");
    this.later(chipTicks, (ctx, hits) => {
      if (ctx.world.getPlayer()?.alive) hits.push({ source: "The Leviathan's roar", attackType: "typeless", baseDamage: [0, this.version.roarMaxHit], playerPosition: [...ctx.playerPos] });
    });
    this.dropRock(context, context.playerPos);
    if (!this.firstRoar) return;
    this.firstRoar = false;
    for (const area of tells[this.nextSpecial]) {
      const x = area.minX + Math.floor(this.random() * (area.maxX - area.minX + 1));
      const y = area.minY + Math.floor(this.random() * (area.maxY - area.minY + 1));
      this.dropRock(context, [x, y]);
    }
  }
  // A rock that falls for 7 ticks, hurts a player still on its tile and stays.
  dropRock(context, at) {
    const tile = [...at];
    const rotation = Math.floor(this.random() * 4);
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.falling[rotation], target: tileTarget(tile), height: 0, delayCycles: fallingDelayCycles }] });
    this.falling.push({ tile, lands: this.tick + rockTicks });
    this.later(rockTicks, (ctx, hits) => {
      if (ctx.world.getPlayer()?.alive && key(ctx.playerPos) === key(tile))
        hits.push({ source: "A falling rock", attackType: "typeless", baseDamage: [0, this.version.rockMaxHit], playerPosition: [...ctx.playerPos] });
      this.placeRubble(tile, rotation);
    });
  }
  placeRubble(tile, rotation) {
    if (this.rubble.has(key(tile))) return false;
    if (this.arenaBase?.walkableTiles && !this.arenaBase.walkableTiles.has(key(tile))) return false;
    this.rubble.set(key(tile), [tile[0], tile[1], rotation]);
    if (this.arenaBase) setArenaConfig(this.arenaWithRubble(), getArenaDefaultWalkable());
    return true;
  }

  // --- the stun and the specials -----------------------------------------
  // What it does to a hit of the player's on it, as the hit lands.
  playerHit(damage, attack, target, player) {
    if (target.id !== bossActorId || !target.alive) return damage;
    const at = player.position;
    const stunned = this.stun !== null;
    const rear = stunned && isBehind(this.stun.face, at);
    const aura = this.enraged && this.inAura(this.world, at);
    let dealt = damage;
    if (attack.style === "magic" && (rear || aura)) dealt *= 2; // WIKI
    if (stunned && !rear) dealt = Math.min(stunCap, dealt);
    if (this.special) dealt = Math.floor((dealt * Math.round((1 - specialReduction) * 100)) / 100);
    dealt = Math.min(dealt, target.vitals.hp);
    if (stunned && dealt > 0) {
      this.stun.dealt += dealt;
      if (rear || this.stun.dealt >= this.version.maxHp * stunBreakShare) this.breakStun(target);
    } else if (!stunned && !this.enraged && !this.special && attack.style === "magic" && shadowSpells.has(attack.spellId)) {
      // WIKI: a shadow spell always stuns it. That a splash does too is inferred.
      this.beginStun(target, at);
    }
    return dealt;
  }
  beginStun(boss, at) {
    this.stuns++;
    this.epoch++;
    this.stun = { until: this.tick + stunTicks, face: stunFacing(at), dealt: 0 };
    boss.lockedFacing = boss.facing;
    this.pendingVisuals.push({ clipId: "roar" });
    const epoch = this.epoch;
    // OBS (video), CACHE: the stun's 10282 lasts 90 cycles, then it holds still.
    this.later(3, (ctx) => {
      if (this.epoch === epoch && this.stun) this.animate(ctx, "stunned");
    });
  }
  endStun(boss) {
    this.stun = null;
    delete boss.lockedFacing;
  }
  breakStun(boss) {
    this.endStun(boss);
    this.epoch++;
    this.volley = volleyAfterStun(this.stuns);
    this.orbs = 0;
    this.specialDue = true;
  }
  beginSpecial(boss, context) {
    if (this.enraged) return;
    const kind = this.nextSpecial;
    this.nextSpecial = kind === "lightning" ? "smoke" : "lightning";
    this.epoch++;
    const special = { kind, start: context.tick, id: this.epoch };
    this.special = special;
    const on = () => this.special === special;
    if (kind === "lightning") this.lightning(context, on);
    else this.smoke(context, on);
  }
  endSpecial() {
    this.special = null;
    this.nextAttackTick = this.tick + this.currentVolley().interval;
  }
  lightning(context, on) {
    this.animate(context, "lightning");
    this.later(lightning.loop, (ctx) => on() && this.animate(ctx, "lightningLoop"));
    for (let n = 0; n < lightning.strikes; n++)
      this.later(lightning.first + n, (ctx) => {
        if (!on()) return;
        const player = ctx.world.getPlayer();
        if (!player?.alive) return;
        const tile = [...ctx.playerPos];
        const warning = player.vitals.hp <= lightning.lowHp ? lightning.lowHpWarning : lightning.warning;
        this.warnings.push({ tile, from: ctx.tick, until: ctx.tick + warning });
        emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.lightningWarning, target: tileTarget(tile), height: 0, delayCycles: 0 }] });
        this.later(warning, (later, hits) => {
          emitInfernoVisual(later.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.lightningStrike, target: tileTarget(tile), height: 0, delayCycles: 0 }] });
          if (later.world.getPlayer()?.alive && key(later.playerPos) === key(tile))
            hits.push({ source: "The Leviathan's lightning", attackType: "typeless", baseDamage: [0, this.version.lightningMaxHit], playerPosition: [...later.playerPos] });
        });
      });
    for (let at = lightning.first; at < lightning.first + lightning.strikes; at += lightning.sideEvery)
      this.later(at, (ctx) => {
        if (!on()) return;
        const tiles = this.floor.filter((tile) => !isBesidePool(tile));
        const projectiles = [];
        const landing = [];
        for (let n = 0; n < lightning.sideOrbs && tiles.length; n++) {
          const tile = tiles[Math.floor(this.random() * tiles.length)]; // inferred: any, evenly, again and again
          const mouth = mouthFor(tile);
          landing.push(tile);
          projectiles.push({ spotAnimId: spots.sideOrb, sourcePosition: [mouth[0] + 0.5, mouth[1] + 0.5], target: tileTarget(tile),
            startDelayCycles: 0, endDelayCycles: lightning.sideFlight * cyclesPerTick, ...orbProjectile, endHeight: 0 });
        }
        emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles, graphics: [] });
        this.later(lightning.sideFlight, (later, hits) => {
          emitInfernoVisual(later.tickEvents, { animations: [], projectiles: [], graphics: landing.map((tile) => ({ spotAnimId: spots.lightningStrike, target: tileTarget(tile), height: 0, delayCycles: 0 })) });
          const player = later.world.getPlayer();
          for (const tile of landing)
            if (player?.alive && key(later.playerPos) === key(tile))
              hits.push({ source: "The Leviathan's lightning orb", attackType: "typeless", baseDamage: [0, this.version.sideOrbMaxHit], playerPosition: [...later.playerPos] });
        });
      });
    this.later(lightning.end, (ctx) => on() && this.animate(ctx, "lightningEnd"));
    this.later(lightning.over, () => on() && this.endSpecial());
  }
  smoke(context, on) {
    this.cover = new Set();
    this.animate(context, "roar");
    this.later(smoke.spit, (ctx) => on() && this.animate(ctx, "spit"));
    for (let n = 0; n < smoke.rocks; n++)
      this.later(smoke.firstRock + n, (ctx) => {
        if (!on() || !ctx.world.getPlayer()?.alive) return;
        this.animate(ctx, "spitLoop");
        const tile = [...ctx.playerPos];
        const mouth = mouthFor(tile);
        emitInfernoVisual(ctx.tickEvents, { animations: [], graphics: [],
          projectiles: [{ spotAnimId: spots.boulder, sourcePosition: [mouth[0] + 0.5, mouth[1] + 0.5], target: tileTarget(tile),
            startDelayCycles: 0, endDelayCycles: smoke.rockFlight * cyclesPerTick, ...orbProjectile, endHeight: 0 }] });
        this.falling.push({ tile, lands: ctx.tick + smoke.rockFlight });
        this.later(smoke.rockFlight, (later, hits) => {
          if (this.outcome.phase !== "active") return;
          emitInfernoVisual(later.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.boulderLands, target: tileTarget(tile), height: 0, delayCycles: 0 }] });
          // inferred (RSPSApp's): a rock that lands on the player hurts as a falling one does.
          if (later.world.getPlayer()?.alive && key(later.playerPos) === key(tile))
            hits.push({ source: "A thrown rock", attackType: "typeless", baseDamage: [0, this.version.rockMaxHit], playerPosition: [...later.playerPos] });
          if (this.placeRubble(tile, Math.floor(this.random() * 4))) this.cover.add(key(tile));
        });
      });
    this.later(smoke.charge, (ctx) => on() && this.animate(ctx, "blast"));
    this.later(smoke.blast, (ctx, hits) => {
      if (!on()) return;
      emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.smoke, target: tileTarget(centre), height: 0, delayCycles: 0 }] });
      const sheltered = lineBetween(centre, ctx.playerPos).some((tile) => this.cover.has(key(tile)));
      if (ctx.world.getPlayer()?.alive && !sheltered)
        hits.push({ source: "The Leviathan's smoke blast", attackType: "typeless", baseDamage: [0, this.version.smokeMaxHit], playerPosition: [...ctx.playerPos] });
    });
    this.later(smoke.over, () => on() && this.endSpecial());
  }

  // --- the enrage and the pathfinder --------------------------------------
  enrage(boss, context) {
    this.enraged = true;
    if (this.stun) this.endStun(boss);
    this.orbs = 0;
    // WIKI: a smoke under way still blasts; a lightning stops (inferred: RSPSApp's).
    if (this.special?.kind !== "smoke") this.special = null;
    this.roar(context);
    this.nextEnrageRockTick = context.tick + enrageRockTicks;
    this.nextAttackTick = context.tick + enrageFirstAttackTicks;
    this.later(pathfinderTicks, (ctx) => this.spawnPathfinder(ctx));
  }
  // OBS, WIKI: in the first corner clockwise from the north-west whose middle
  // is clear of rubble (a rock beside it does not count: OBS, and a test on the
  // wiki's talk page), the north-west if none is.
  spawnPathfinder(context) {
    if (this.outcome.phase !== "active") return;
    const index = Math.max(0, pathfinderCorners.findIndex((corner) => !this.rubble.has(key(corner))));
    const [cx, cy] = pathfinderCorners[index];
    this.pathfinder = { walkTick: context.tick + pathfinderWalkTicks, destination: (index + 1) % pathfinderCorners.length };
    context.spawnNpc({
      id: pathfinderActorId, kind: "npc", role: "npc", npcTypeId: ids.pathfinder, archetypeId: pathfinderActorId, size: 3, alive: true,
      position: [cx - 1, cy - 1], previousPosition: [cx - 1, cy - 1], facing: 0,
      untargetable: true, blocksNpcMovement: false, passThruNpcs: true, history: new Map(),
      vitals: { hp: 1, maxHp: 1 },
      combat: { attackSpeed: 1, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
        animations: { idle: seqs.pathfinderIdle, walk: seqs.pathfinderIdle, run: seqs.pathfinderIdle, attack: null, death: null } },
    });
    this.animate(context, "spawn", pathfinderActorId);
  }
  pathfinderCentre(world) {
    const npc = world?.getNpc(pathfinderActorId);
    return npc?.alive ? [npc.position[0] + 1, npc.position[1] + 1] : null;
  }
  inAura(world, at) {
    const middle = this.pathfinderCentre(world);
    return middle !== null && chebyshev(middle, at) <= auraRadius;
  }

  // --- the rest --------------------------------------------------------
  later(ticks, run) {
    this.queue.push({ tick: this.tick + ticks, run });
  }
  animate(context, clipId, actorId = bossActorId) {
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId, clipId, delayCycles: 0 }], projectiles: [], graphics: [] });
  }
  flushVisuals(context) {
    for (const { clipId } of this.pendingVisuals) this.animate(context, clipId);
    this.pendingVisuals = [];
  }
  getEngineRules() {
    return {
      // WIKI: "Your melee attacks can't reach the lure!"
      validateAttack: (attackKind, targetId) => (targetId === bossActorId && attackKind.startsWith("melee") ? false : null),
      playerDamageOnNpc: (damage, { attacker, target, attack }) => this.playerHit(damage, attack, target, attacker),
      // Its weak spot while it is stunned, the pathfinder's aura once enraged:
      // ranged cannot miss (inferred: RSPSApp's for the weak spot; WIKI for the
      // aura) and does at least a share of its max (WIKI).
      playerAlwaysAccurate: (rules, { style, target }) => this.rangedBoost(rules, style, target) !== null,
      playerMinimumHit: (maximum, rules, { style, target }) => {
        const share = this.rangedBoost(rules, style, target);
        return share === null ? 0 : Math.floor(maximum * share);
      },
    };
  }
  rangedBoost(rules, style, target) {
    if (style !== "range" || target?.id !== bossActorId) return null;
    const at = rules.player.position;
    if (this.stun && isBehind(this.stun.face, at)) return rearRangedMinimum;
    if (this.enraged && this.inAura(rules.world, at)) return auraRangedMinimum;
    return null;
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== bossActorId) return;
    this.queue = [];
    this.warnings = [];
    this.inFlight = [];
    this.falling = [];
    this.stun = null;
    this.special = null;
    // WIKI: "Once the Leviathan is slain, all debris on the field will be removed."
    this.rubble.clear();
    this.cover.clear();
    if (this.arenaBase) setArenaConfig(this.arenaWithRubble(), getArenaDefaultWalkable());
    if (context.world.getNpc(pathfinderActorId)) context.despawnNpc(pathfinderActorId);
    this.pathfinder = null;
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + deathTicks, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }
  getOutcome() {
    return this.outcome;
  }
  getSnapshot() {
    return {
      kind: this.kind,
      state: {
        volley: this.volley + 1, // 1 to 7, as the wiki counts them
        enraged: this.enraged,
        stunnedUntil: this.stun?.until ?? null,
        special: this.special && { kind: this.special.kind, start: this.special.start },
        nextSpecial: this.nextSpecial,
        rubble: [...this.rubble.values()].map((tile) => [...tile]), // [x, y, rotation]
        lightning: this.warnings.map(({ tile, from, until }) => ({ tile: [...tile], from, until })),
        orbs: this.inFlight.map(({ style, lands }) => ({ style, lands })),
        falling: this.falling.map(({ tile, lands }) => ({ tile: [...tile], lands })),
        pathfinder: this.pathfinder && { destination: [...pathfinderCorners[this.pathfinder.destination]] },
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel() {
    return "The Leviathan";
  }
}

export const leviathanDefinition = {
  kind: leviathanKind,
  factory: () => new LeviathanEncounter(),
  descriptor: {
    kind: leviathanKind,
    displayName: "The Leviathan",
    description: "Desert Treasure II. The Scar: volleys of orbs to pray against, rocks from its roars, a shadow stun, lightning and smoke, and the abyssal pathfinder.",
    mapSquare: leviathanMapSquare,
    playerStart,
    loadsMapLocs: true,
    isWorkInProgress: true,
    collision: { mode: "custom" }, // getArenaConfig, above
    victory: { eyebrow: "Triumphant", title: "VICTORY", narrative: "THE LEVIATHAN DEFEATED", accent: "gold" },
    // The awakened fight is a variant kind (client/dt2/bosses.js, awakenedKind), not written yet.
    variants: [
      { id: "post_quest", encounterKind: leviathanKind, name: "Post-quest", subtitle: "900 hitpoints.", available: true, presetsKey: leviathanKind },
      { id: "awakened", encounterKind: leviathanAwakenedKind, name: "Awakened", subtitle: "2,700 hitpoints, a tornado and five rocks to a roar. Not yet written.", available: false, presetsKey: leviathanKind },
    ],
    variantLabel: "Version",
    loadouts: leviathanLoadouts,
  },
  controls: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { leviathanDefinition as definition };
export const order = 80;
