// Duke Sucellus, the second boss of Desert Treasure II: the post-quest version
// and the awakened one (versions, below).
// https://oldschool.runescape.wiki/w/Duke_Sucellus/Strategies
//
// He sits at the north end of his asylum and never moves. He sleeps until the
// player has clicked on him and is beside him: a click from further off has them
// run up to him. That stands for the last of the poison that wakes him in the
// game: he wakes two ticks later, can be attacked from the tick after, and then
// acts every five ticks, every four once enraged:
// - with the player beside him, diagonals included, icicles (they hit at
//   once) and, two ticks later, a slam on the player if they are in the row
//   in front of him by then, which cannot reach a diagonal;
// - otherwise a magic cluster that Protect from Magic only halves;
// - after every five of those, the Freezing Gaze: five ticks later the
//   player must stand directly behind a pillar, or be hit a tick after;
// - from three attacks after the first gaze, gas spat at the vent nearest the
//   player, once or more by his hitpoints, every five, four or three attacks.
//
// Sources, beside the usual: OBS 11/24 is three Outside recordings of 24
// November 2026 (an ordinary world, the post-quest Duke, two kills and a
// death: 59 melee attacks, 11 gazes and 18 spits of gas; no magic attack, no
// gaze that found the player, no one hurt by the gas). Plain OBS is rsprox
// recordings 1703 (an ordinary world's quest fight), 1751 and 1827 (Leagues
// worlds, the post-quest Duke) as RSPSApp/tsps reads them (its
// docs/duke-sucellus.md and server/plugins/bosses/data/duke-sucellus.json).
// What RSPSApp calls provisional or chose without a recording is marked
// inferred here, as is what no source says.
// Ids are the cache's; their names are from its gameval index.
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { monsterByNpcTypeId, monsterByNpcTypeIdAndVersion } from "../../data/monsters.js";
import { CollisionFlag } from "../../engine/collision.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { dukeLoadouts } from "./loadouts.js";

export const dukeKind = "duke_sucellus";
export const dukeAwakenedKind = "duke_sucellus_awakened"; // dt2/bosses.js, awakenedKind
// CACHE: the asylum of Ghorrock Prison, region 12132. Its floor is x 26 to 36,
// y 35 to 51; he takes the 7 x 7 north of it.
export const dukeMapSquare = { x: 47, y: 100 };
export const bossStart = [28, 52]; // CACHE: the floor's 7 x 7 north of the asylum; OBS
export const bossSize = 7; // CACHE, WIKI
const mouth = [31, 53]; // inferred (RSPSApp's): where his projectiles start
// In the room, out of his reach (inferred: the game brings the player in at
// the gate, 31,34, to gather and feed him first; the simulator skips that).
const playerStart = [31, 40];
// The engine reads a tile of the map as walkable only where it has an
// underlay; the asylum's ice between the vents has an overlay alone (CACHE).
// The arena is built from a tile that has one, and refineArenaConfig adds
// the rest of the room's floor.
const arenaSeed = [31, 47];
const room = { minX: 26, maxX: 36, minY: 35, maxY: 51 }; // CACHE
// CACHE (loc 47513): the six 3 x 1 pillars along the walls, two beside him.
const pillars = [[25, 52], [25, 44], [25, 40], [35, 52], [35, 44], [35, 40]];
// CACHE (loc 47555, dt2_duke_floor_vent_middle): the middle of each vent's 3 x 3.
const vents = [28, 31, 34].flatMap((x) => [42, 46, 50].map((y) => [x, y]));

export const ids = {
  // CACHE duke_sucellus_asleep: only drawn (presentation.js). Its one action is
  // "Feed", so a click on it would not reach the fight as an attack.
  asleep: 12167,
  boss: 12191, // CACHE duke_sucellus_awake
};
export const models = {
  // CACHE: his NPC types name one model, 49194, which has none of the faces
  // the gaze brings in (labels 94 to 108 of its alpha transforms; every other
  // animation of his keeps them out of sight). 49193 has those labels, hangs
  // on his skeleton's bone 61 and sits in his mouth: the eye. That the game
  // adds it to him is inferred.
  gazeEye: 49193,
};
export const seqs = {
  sleep: 10174, // CACHE npc_duke_sucellus01_idle_sleep_01
  idle: 10175, // CACHE npc_duke_sucellus01_rig_idle_awake_01
  wake: 10179, // CACHE npc_duke_sucellus01_wake_up_01
  melee: 10176, // CACHE npc_duke_sucellus01_attack_melee_01
  magic: 10177, // CACHE npc_duke_sucellus01_magic_attack_01
  gas: 10178, // CACHE npc_duke_sucellus01_magic_attack_faster01; his gas spit: inferred (RSPSApp's)
  gaze: 10180, // CACHE npc_duke_sucellus01_sight_attack_01
  death: 10181, // CACHE npc_duke_sucellus01_death_01
};
export const spots = {
  gasSpawn: 2431, // CACHE spotanim_duke_vent_01_spawn_01
  gasIdle: 2432, // CACHE spotanim_duke_vent_01_idle_01
  gasEnd: 2433, // CACHE spotanim_duke_vent_01_despawn_01
  magicProjectile: 2434, // CACHE vfx_duke_sucellus_attack_magic_projectile_01
  magicImpact: 2435, // CACHE vfx_duke_sucellus_attack_magic_projectile_impact_01
  gasProjectile: 2436, // CACHE projanim_duke_spit_01
  meleeBody: 2439, // CACHE vfx_duke_sucellus_attack_melee_spotanim_npc_01
  // CACHE vfx_duke_sucellus_attack_melee_spotanim_tile_01 to _04. OBS: all
  // seven along the row in front of him, in this order, with every melee.
  meleeRow: [2440, 2441, 2442, 2443, 2442, 2441, 2440],
};

export const bossActorId = "duke-sucellus";
const attackTicks = 5; // WIKI, TABLE
const enragedAttackTicks = 4; // WIKI
// OBS 11/24 (2 of 2): the poison is fed from the row before him; the last of it
// shows on him a tick after ("Duke is waking up."), he wakes a tick after that,
// and the player's first attack went off a tick later still, at the first click
// on him awake.
const poisonTicks = 1;
const wakeDelayTicks = 2;
const attackableTicks = 1;
const wakeTicks = 5; // OBS, OBS 11/24: his first attack 5 ticks after he wakes
export const wakeAnimationTicks = 3; // CACHE: the wake sequence is 90 cycles
const slamTicks = 2; // OBS, OBS 11/24: the slam lands 2 ticks after the icicles
const magicTicks = 4; // OBS
// Protect from Melee lets half of the icicles through, three quarters of the
// slam (WIKI: 11 to 5, 56 to 42; awakened 81 to 60).
const iciclePrayerReduction = { type: "reduce", value: 0.5 };
const slamPrayerReduction = { type: "reduce", value: 0.75 };
// WIKI: "slightly less" through Protect from Magic; the awakened 71 to 36 is a
// half (WIKI), and the post-quest 48 to 24 is RSPSApp's (inferred).
const magicPrayerReduction = { type: "reduce", value: 0.5 };
// OBS: from cycle 50 to 120, from height 350 to 100 (87 and 25 as the game
// sends them, a quarter); the slope is RSPSApp's (inferred).
const magicProjectile = { startDelayCycles: 50, endDelayCycles: 120, slope: 5, startHeight: 350, endHeight: 100 };
// inferred: RSPSApp's, no recording cited for it.
const gasProjectile = { startDelayCycles: 20, endDelayCycles: 90, slope: 5, startHeight: 350, endHeight: 0 };
// The gaze. WIKI: every fifth standard attack ("every five auto-attacks"), the
// whole of it 6 ticks. OBS 11/24: it is told whether it was avoided 4 ticks
// after it starts (11 of 11; the WIKI's check is at 5), with the player where
// they were before they move that tick, as for the slam. OBS: a gaze that
// finds the player hits a tick after the check.
const autosPerGaze = 5;
const gazeCheckTicks = 4;
const gazeHitTicks = gazeCheckTicks + 1;
const gazeTicks = 6;
// The gaze's overlay (sight.js). OBS 11/24: it opens with the gaze and closes
// 6 ticks later, with his next attack (11 of 11), also for a player behind a
// pillar all the while. CACHE: its model fades in over 120 cycles (seq 10216),
// which are the 4 ticks to the check, and out over 64 (10215), the 2 that are
// left; that it plays one and then the other is inferred from that. OBS: so it
// looks in the wiki's clip (sight.js).
export const sightAppearCycles = 120;
const sightDisappearCycles = 64;
const sightTicks = 6;
const cyclesPerTick = 30;
// The tint under the eye. OBS (the wiki's clip, sight.js): it comes evenly with
// the eye, up to the check, and is gone a tick later, before the eye is. It is
// there for a player behind a pillar (the one in the clip is).
const tintDisappearCycles = 30;
export function sightTint(startTick, cycle) {
  const strength = sightStrength(startTick, cycle);
  const past = cycle - (startTick ?? Infinity) * cyclesPerTick - sightAppearCycles;
  return past <= 0 ? strength / sightAppearCycles : Math.max(0, 1 - past / tintDisappearCycles);
}
// How far in the overlay is at `cycle`, of sightAppearCycles; `startTick` is
// the gaze's, null when there is none.
export function sightStrength(startTick, cycle) {
  const elapsed = cycle - (startTick ?? Infinity) * cyclesPerTick;
  if (!(elapsed >= 0) || elapsed >= sightTicks * cyclesPerTick) return 0;
  if (elapsed <= sightAppearCycles) return elapsed;
  return Math.max(0, sightAppearCycles * (1 - (elapsed - sightAppearCycles) / sightDisappearCycles));
}
// The gas. WIKI: the first spit three standard attacks after the first gaze,
// never straight after a gaze (one more standard attack first).
const firstGasAutos = 3;
const spitTicks = 3; // OBS, OBS 11/24: two spits three ticks apart
// OBS 11/24: his next attack is an attack's time after the spit, and 2 ticks
// more after two spits (4 of 4 after one, 6 of 6 after two, enraged or not).
// More for each further one (the awakened four) is inferred.
const furtherSpitTicks = 2;
const gasHolderTicks = 2; // OBS, OBS 11/24: the gas rises at the vent 2 ticks after the spit,
const gasWarnTicks = 1; // OBS: shows for a tick before it hurts,
// and OBS 11/24 goes 16 ticks after it rises, 14 once he is enraged; that of a
// second spit a tick after that of the first (14 of 14). A tick more for each
// further one (the awakened four) is inferred.
const gasLifeTicks = 16;
const enragedGasLifeTicks = 14;
const gasIdleEvery = 2; // OBS 11/24: its cloud is drawn again every 2 ticks
// WIKI: the vents' gas drains 4 Prayer as it hurts. Said of the vents that go
// off before the fight; that his spat gas does the same is RSPSApp's (inferred).
const gasPrayerDrain = 4;
const deathTicks = 4; // OBS 11/24: the kill is told 4 and 5 ticks after the last hit
const demonbaneVulnerability = 0.7; // WIKI: demonbane does 70% of its usual effect

const key = ([x, y]) => x + "," + y;
const pillarTiles = new Set(pillars.flatMap(([x, y]) => [0, 1, 2].map((dx) => key([x + dx, y]))));
const inFootprint = ([x, y]) => x >= bossStart[0] && x < bossStart[0] + bossSize && y >= bossStart[1] && y < bossStart[1] + bossSize;
// Beside him, diagonals included (WIKI).
const isBeside = ([x, y]) =>
  !inFootprint([x, y]) && x >= bossStart[0] - 1 && x <= bossStart[0] + bossSize && y >= bossStart[1] - 1 && y <= bossStart[1] + bossSize;
// Beside him, and not on a diagonal: where he is woken from and where the slam
// lands. WIKI: the slam cannot reach a diagonal. OBS 11/24: it lands on a player
// anywhere else beside him (the row of seven before him, the rest being
// walled off), wherever they were when he struck: 59 of 59 fit, the 4 that
// hit were struck at a player on a diagonal who had stepped into the row, and
// 13 struck at one in it, who had stepped out, missed.
const isSquarelyBeside = ([x, y]) => {
  const [bx, by] = bossStart;
  const alongX = x >= bx && x < bx + bossSize, alongY = y >= by && y < by + bossSize;
  return (alongX && (y === by - 1 || y === by + bossSize)) || (alongY && (x === bx - 1 || x === bx + bossSize));
};
// WIKI: safe from the gaze "directly behind a pillar". Read as: the tile north
// of the player, towards him, is a pillar's (inferred).
export const isBehindPillar = ([x, y]) => pillarTiles.has(key([x, y + 1]));
const inGas = ([x, y], [vx, vy]) => Math.abs(x - vx) <= 1 && Math.abs(y - vy) <= 1; // WIKI: a 3 x 3
const distance = ([x, y], [vx, vy]) => Math.hypot(x - vx, y - vy);
const tileTarget = (position) => ({ kind: "tile", position: [...position] });

// What differs between the two versions.
// https://oldschool.runescape.wiki/w/Duke_Sucellus/Strategies (Awakened mode)
// Nothing of the awakened fight has been read from a recording: its numbers
// are the WIKI's, and where the WIKI gives none, the post-quest one scaled to
// his max hits (inferred). Not yet in either: the awakened orb of darkness and
// bile, face protection against the gas, his immunity to stat drains.
export const versions = {
  postQuest: {
    tableVersion: undefined, // TABLE: the first entry of 12191, 485 hitpoints
    maxHp: 485, // WIKI, TABLE
    // OBS 11/24: enraged at 126, not yet at 130. Not the WIKI's 121: 25% counted
    // in whole percents goes on to 126, as the awakened 440 of the WIKI's does.
    enrageHp: 126,
    iciclesMaxHit: 11, // WIKI
    slamMaxHit: 56, // WIKI
    magicMaxHit: 48, // WIKI
    // inferred: no source gives the least. WIKI: "almost assured to kill", and
    // a player's lowest was in the high 80s or low 90s, rounded down here.
    gazeMinHit: 85,
    gazeMaxHit: 101, // WIKI
    gasMaxHit: 12, // WIKI
    // WIKI: one spit above half his hitpoints (242), two below.
    spits: (hp) => (hp > 242 ? 1 : 2),
  },
  awakened: {
    tableVersion: "Awake", // TABLE: the second "Awake" entry of 12191, 1,697 hitpoints
    maxHp: 1697, // WIKI, TABLE
    enrageHp: 440, // WIKI
    iciclesMaxHit: 16, // inferred: the post-quest 11 of 56, of his 81
    slamMaxHit: 81, // WIKI
    magicMaxHit: 71, // WIKI
    gazeMinHit: 102, // inferred: the post-quest 85 of 101, of his 121
    gazeMaxHit: 121, // WIKI
    gasMaxHit: 27, // WIKI: "about 26-27"
    // WIKI: one spit above 76% of his hitpoints, four in a row below.
    spits: (hp) => (hp >= 1697 * 0.76 ? 1 : 4),
  },
};

// WIKI: gas every five standard attacks above three quarters of his
// hitpoints, every four above the enrage, every three below it. The awakened
// bands as the post-quest ones (inferred).
function gasInterval(hp, version) {
  return hp > version.maxHp * 0.75 ? 5 : hp > version.enrageHp ? 4 : 3;
}

// The monster table has two entries for each of his NPC types, the post-quest
// and the awakened stats under one version name; each version names the one
// it takes, and this checks that it got it.
function tableFormulaStats(version) {
  const entry = version.tableVersion === undefined ? monsterByNpcTypeId.get(ids.boss) : monsterByNpcTypeIdAndVersion.get(ids.boss + ":" + version.tableVersion);
  if (entry?.levels.hitpoints !== version.maxHp) throw new Error(`Duke Sucellus: the monster table's ${ids.boss} has no entry with ${version.maxHp} hitpoints`);
  return structuredClone(getMonsterFormulaStats(ids.boss, version.tableVersion));
}

class DukeSucellusEncounter {
  constructor(kind = dukeKind, version = versions.postQuest) {
    this.kind = kind;
    Object.defineProperty(this, "version", { value: version }); // fixed for the fight: not state
    this.reset();
  }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.wakeTick = null;
    // The order of his attacks: standard attacks since the last gaze, and
    // since the first gaze or the last gas; how many more before the gas.
    this.autos = 0;
    this.gasAutos = 0;
    this.gasEvery = firstGasAutos;
    this.seenGaze = false;
    this.justGazed = false;
    this.slams = []; // the ticks they land
    this.gaze = null; // { checkTick, hitTick, hit }
    this.sight = null; // the tick the gaze's overlay opened
    this.spits = []; // { tick, endTick }: the spits still to come, and when their gas goes
    this.clouds = []; // { vent, riseTick, hurtFrom, endTick }
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
  // Every tile of the room that the map's collision leaves open (arenaSeed).
  refineArenaConfig(arena) {
    if (!arena.collisionMap || !arena.walkableTiles) return arena;
    const walkableTiles = new Set(arena.walkableTiles);
    for (let x = room.minX; x <= room.maxX; x++)
      for (let y = room.minY; y <= room.maxY; y++)
        if (!arena.collisionMap.hasFlag(x, y, CollisionFlag.FLOOR_BLOCKED | CollisionFlag.OBJECT)) walkableTiles.add(key([x, y]));
    const { minX, maxX, minY, maxY } = arena.bounds ?? room;
    const bounds = { minX: Math.min(minX, room.minX), maxX: Math.max(maxX, room.maxX), minY: Math.min(minY, room.minY), maxY: Math.max(maxY, room.maxY) };
    return { ...arena, walkableTiles, bounds: { ...bounds, width: bounds.maxX - bounds.minX + 1, height: bounds.maxY - bounds.minY + 1 } };
  }
  createNpcs() {
    const formulaStats = tableFormulaStats(this.version);
    formulaStats.demonbaneVulnerability = demonbaneVulnerability;
    const { maxHp } = this.version;
    return [{
      id: bossActorId, kind: "npc", role: "boss", npcTypeId: ids.boss, archetypeId: "duke-sucellus", size: bossSize, alive: true,
      position: [...bossStart], previousPosition: [...bossStart], facing: 0, lockedFacing: 0, history: new Map(),
      vitals: { hp: maxHp, maxHp }, formulaStats,
      combat: { attackSpeed: attackTicks, attackRange: 1, attackStyle: "melee", nextActionTick: Infinity, targetId: "player", lastAttackTick: null,
        animations: { idle: seqs.idle, walk: seqs.idle, run: seqs.idle, attack: seqs.melee, death: seqs.death } },
    }];
  }
  moveNpc() {
    return []; // he never moves
  }

  // --- each tick, before the NPCs ---------------------------------------
  resolveHazards(context) {
    const hits = [];
    const player = context.world.getPlayer();
    const boss = context.world.getNpc(bossActorId);
    const at = [...context.playerPos];
    const alive = player?.alive;
    if (this.slams.includes(context.tick) && alive && isSquarelyBeside(at))
      hits.push({ source: "Duke Sucellus' slam", attackType: "melee", baseDamage: [0, this.version.slamMaxHit], prayerReduction: slamPrayerReduction, playerPosition: at });
    this.slams = this.slams.filter((tick) => tick > context.tick);
    if (this.sight !== null && context.tick >= this.sight + sightTicks) this.sight = null;
    if (this.gaze && context.tick === this.gaze.checkTick) {
      this.gaze.hit = alive && !isBehindPillar(at);
      // For its sound (audio.js).
      if (alive && !this.gaze.hit) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [], gazeAvoided: true });
    }
    if (this.gaze && context.tick === this.gaze.hitTick) {
      if (this.gaze.hit && alive) hits.push({ source: "Duke Sucellus' gaze", attackType: "typeless", baseDamage: [this.version.gazeMinHit, this.version.gazeMaxHit], playerPosition: at });
      this.gaze = null;
    }
    this.stepClouds(context, hits, at, alive);
    return hits;
  }
  // --- each tick, after the player -------------------------------------
  processPostTick(context) {
    const boss = context.world.getNpc(bossActorId);
    const player = context.world.getPlayer();
    if (this.wakeTick === null && boss?.alive && player?.alive && player.attackTarget === boss.id && isSquarelyBeside(player.position)) {
      // The engine takes the player off him again, and refuses further clicks,
      // while he cannot be attacked.
      this.wakeTick = context.tick + wakeDelayTicks;
      boss.attackBlockedUntilTick = this.wakeTick + attackableTicks;
      boss.combat.nextActionTick = this.wakeTick + wakeTicks;
    }
    for (const { endTick } of this.spits.filter(({ tick }) => tick === context.tick)) if (boss?.alive && player?.alive) this.spit(boss, player, context, endTick);
    this.spits = this.spits.filter(({ tick }) => tick > context.tick);
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    return [];
  }
  processNpcTick(npc, context) {
    const idle = { environmentalDamages: [] };
    if (npc.id !== bossActorId) return idle;
    if (this.wakeTick === null) {
      // Asleep. The player who has clicked on him keeps him as a target, to run
      // up to him whatever their weapon's range, and does not attack him (as with
      // Zebak's jugs); nor does their thrall.
      const player = context.world.getPlayer();
      if (player?.attackTarget === npc.id) player.attackInteractionActive = false;
      if (player?.thrall) player.thrall.nextAttackTick = Math.max(player.thrall.nextAttackTick, context.tick + 1);
      return idle;
    }
    // For its sound (audio.js): the last of the poison shows on him.
    if (context.tick === this.wakeTick - wakeDelayTicks + poisonTicks) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [], poisonFelt: true });
    if (context.tick === this.wakeTick) {
      emitInfernoVisual(context.tickEvents, { animations: [{ actorId: npc.id, clipId: "wake", delayCycles: 0 }], projectiles: [], graphics: [] });
      return idle;
    }
    const player = context.world.getPlayer();
    if (!player?.alive || context.tick < npc.combat.nextActionTick) return idle;
    const speed = npc.vitals.hp <= this.version.enrageHp ? enragedAttackTicks : attackTicks;
    const action = this.nextAction(npc.vitals.hp);
    npc.combat.lastAttackTick = context.tick;
    if (action === "gaze") {
      npc.combat.nextActionTick = context.tick + gazeTicks;
      this.gaze = { checkTick: context.tick + gazeCheckTicks, hitTick: context.tick + gazeHitTicks, hit: false };
      this.sight = context.tick;
      emitInfernoVisual(context.tickEvents, { animations: [{ actorId: npc.id, clipId: "gaze", delayCycles: 0 }], projectiles: [], graphics: [] });
      return idle;
    }
    if (action === "gas") {
      const count = this.version.spits(npc.vitals.hp);
      npc.combat.nextActionTick = context.tick + speed + (count - 1) * furtherSpitTicks;
      const life = npc.vitals.hp <= this.version.enrageHp ? enragedGasLifeTicks : gasLifeTicks;
      for (let n = 0; n < count; n++) this.spits.push({ tick: context.tick + n * spitTicks, endTick: context.tick + gasHolderTicks + life + n });
      return idle;
    }
    npc.combat.nextActionTick = context.tick + speed;
    if (isBeside(player.position)) return this.melee(npc, player, context);
    return this.magic(npc, player, context);
  }

  // --- his attacks ------------------------------------------------------
  // The rotation: five standard attacks, then a gaze; once he has gazed, a gas
  // after every few standard attacks (gasInterval), never straight after a gaze.
  nextAction(hp) {
    if (this.autos === autosPerGaze) {
      this.autos = 0;
      this.seenGaze = true;
      this.justGazed = true;
      return "gaze";
    }
    if (this.seenGaze && !this.justGazed && this.gasAutos >= this.gasEvery) {
      this.gasAutos = 0;
      this.gasEvery = gasInterval(hp, this.version);
      return "gas";
    }
    this.justGazed = false;
    this.autos++;
    if (this.seenGaze) this.gasAutos++;
    return "auto";
  }
  // The icicles hit the 3 x 3 round the player as they rise (WIKI; OBS: on the
  // tick of the attack), so they always hit; the slam comes down 2 ticks later.
  melee(boss, player, context) {
    const tile = [...player.position];
    this.slams.push(context.tick + slamTicks);
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: "melee", kind: "duke_sucellus_melee", impactDelayTicks: 0 });
    boss.facing = boss.lockedFacing;
    emitInfernoVisual(context.tickEvents, {
      animations: [], projectiles: [],
      graphics: [
        { spotAnimId: spots.meleeBody, target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 },
        ...spots.meleeRow.map((spotAnimId, n) => ({ spotAnimId, target: tileTarget([bossStart[0] + n, bossStart[1] - 1]), height: 0, delayCycles: 0 })),
      ],
    });
    return {
      environmentalDamages: [{ source: "Duke Sucellus' icicles", attackType: "melee", baseDamage: [0, this.version.iciclesMaxHit], prayerReduction: iciclePrayerReduction, playerPosition: tile }],
    };
  }
  magic(boss, player, context) {
    const attack = rollNpcAttack({
      attacker: boss, target: player, random: this.random,
      plan: { formulaStyle: "magic", damageType: "magic", attackKind: "magic_fire", maxHit: this.version.magicMaxHit, impactDelayTicks: magicTicks,
        prayerCheckAt: "impact", sourceDeathPolicy: "persist" }, // inferred: RSPSApp checks the prayer as it lands
    });
    const projectile = magicProjectileVisual(player);
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: "magic", kind: "duke_sucellus_magic", impactDelayTicks: magicTicks, projectiles: [projectile] });
    boss.facing = boss.lockedFacing;
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
      graphics: [{ spotAnimId: spots.magicImpact, target: buildActorVisualTarget(player), height: 0, delayCycles: magicProjectile.endDelayCycles }] }); // OBS: as it lands
    return { environmentalDamages: [], npcAttacks: [{ ...attack, prayerReduction: magicPrayerReduction }] };
  }
  // A spit at the vent nearest the player (WIKI; OBS: each spit aims anew). OBS
  // 11/24: nearest the tile they moved to that tick, 18 of 18 (the one they
  // moved from was nearer another for all 9 second spits). The gas rises there
  // 2 ticks later.
  spit(boss, player, context, endTick) {
    const vent = [...vents].sort((a, b) => distance(player.position, a) - distance(player.position, b) || a[0] - b[0] || a[1] - b[1])[0];
    const riseTick = context.tick + gasHolderTicks;
    // A vent already in gas stays in gas the longer of the two; a tile is in
    // gas or not, and is hurt once a tick (inferred: neither source says).
    const cloud = this.clouds.find((c) => key(c.vent) === key(vent));
    if (cloud) cloud.endTick = Math.max(cloud.endTick, endTick);
    else this.clouds.push({ vent, riseTick, hurtFrom: riseTick + gasWarnTicks + 1, endTick });
    emitInfernoVisual(context.tickEvents, {
      animations: [{ actorId: boss.id, clipId: "gas", delayCycles: 0 }],
      projectiles: [{ spotAnimId: spots.gasProjectile, sourcePosition: [mouth[0] + 0.5, mouth[1] + 0.5], target: tileTarget(vent), startOffset: 0, ...gasProjectile }],
      graphics: [],
    });
  }
  // OBS: the gas hurts whoever stands in its 3 x 3 every tick from 2 ticks
  // after it rises to the tick before it goes.
  stepClouds(context, hits, at, alive) {
    const graphics = [];
    for (const cloud of this.clouds) {
      const age = context.tick - cloud.riseTick;
      if (age === 0) graphics.push({ spotAnimId: spots.gasSpawn, target: tileTarget(cloud.vent), height: 0, delayCycles: 30 * gasWarnTicks });
      else if (age > 0 && age % gasIdleEvery === 0 && context.tick < cloud.endTick) graphics.push({ spotAnimId: spots.gasIdle, target: tileTarget(cloud.vent), height: 0, delayCycles: 0 });
      if (context.tick === cloud.endTick) graphics.push({ spotAnimId: spots.gasEnd, target: tileTarget(cloud.vent), height: 0, delayCycles: 0 });
      if (alive && context.tick >= cloud.hurtFrom && context.tick < cloud.endTick && inGas(at, cloud.vent))
        hits.push({ source: "Duke Sucellus' gas", attackType: "typeless", baseDamage: [0, this.version.gasMaxHit], playerPosition: at });
    }
    if (graphics.length) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
    this.clouds = this.clouds.filter((cloud) => cloud.endTick > context.tick);
  }

  // --- the rest --------------------------------------------------------
  getEngineRules() {
    return {
      onPlayerDamageTaken: (hit) => {
        if (hit.source === "Duke Sucellus' gas") return { prayerPointsDelta: -gasPrayerDrain };
      },
    };
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== bossActorId) return;
    this.slams = [];
    this.gaze = null;
    this.sight = null;
    this.spits = [];
    // OBS 11/24: the gas that is out goes as he dies.
    if (this.clouds.length)
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
        graphics: this.clouds.filter((cloud) => cloud.riseTick <= context.tick).map((cloud) => ({ spotAnimId: spots.gasEnd, target: tileTarget(cloud.vent), height: 0, delayCycles: 0 })) });
    this.clouds = [];
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
        wakeTick: this.wakeTick, // null until the player has roused him; then the tick he wakes
        gaze: this.gaze && { checkTick: this.gaze.checkTick, hitTick: this.gaze.hitTick },
        sight: this.sight,
        gas: this.clouds.map((cloud) => ({ vent: [...cloud.vent], riseTick: cloud.riseTick, hurtFrom: cloud.hurtFrom, endTick: cloud.endTick })),
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel() {
    return "Duke Sucellus";
  }
}

// From his mouth, not the middle of his 7 x 7.
function magicProjectileVisual(player) {
  const { startDelayCycles, endDelayCycles, slope, startHeight, endHeight } = magicProjectile;
  return { spotAnimId: spots.magicProjectile, sourcePosition: [mouth[0] + 0.5, mouth[1] + 0.5], target: buildActorVisualTarget(player),
    startDelayCycles, endDelayCycles, slope, startOffset: 0, startHeight, endHeight };
}

export const dukeDefinition = {
  kind: dukeKind,
  factory: () => new DukeSucellusEncounter(),
  descriptor: {
    kind: dukeKind,
    displayName: "Duke Sucellus",
    description: "Desert Treasure II. Ghorrock Prison's asylum: icicles and slams, the Freezing Gaze and gas from the vents.",
    mapSquare: dukeMapSquare,
    playerStart,
    loadsMapLocs: true,
    isWorkInProgress: true,
    collision: { mode: "auto", seed: arenaSeed },
    victory: { eyebrow: "Triumphant", title: "VICTORY", narrative: "DUKE SUCELLUS DEFEATED", accent: "gold" },
    // The awakened fight is a variant kind (client/dt2/bosses.js, awakenedKind).
    variants: [
      { id: "post_quest", encounterKind: dukeKind, name: "Post-quest", subtitle: "485 hitpoints.", available: true, presetsKey: dukeKind },
      { id: "awakened", encounterKind: dukeAwakenedKind, name: "Awakened", subtitle: "1,697 hitpoints; harder hits, four spits of gas. From the wiki, without the orb or the bile.", available: true, presetsKey: dukeKind },
    ],
    variantLabel: "Version",
    loadouts: dukeLoadouts,
  },
  controls: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] },
  variantFactories: { [dukeAwakenedKind]: () => new DukeSucellusEncounter(dukeAwakenedKind, versions.awakened) },
  variantControls: { [dukeAwakenedKind]: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] } },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { dukeDefinition as definition };
export const order = 80;
