// Araxxor, in his lair in the Morytania Spider Cave.
// https://oldschool.runescape.wiki/w/Araxxor/Strategies
//
// He comes up in the middle of his lair with nine eggs around it, three of
// each colour in one of three fixed orders. Every 6 ticks he attacks: with
// his legs when the player is beside him (diagonals too), otherwise with
// magic or ranged, whichever the player defends worse. Protection prayers
// only reduce his hits, and his ranged and magic drain Defence and Prayer.
// Every seventh attack is a special, which the colour of the first egg
// chooses: a red egg the acid drip (the player drips acid where he walks), a
// white one the acid spray, a green one the rolling acid ball. All three leave
// acid pools that stay for the rest of the fight and hurt a player standing
// in them.
//
// Eggs hatch one at a time, the south-easternmost first and then clockwise:
// a white Mirrorback, which takes a fifth of the damage dealt to Araxxor and
// throws half of that back at the player; a green Acidic, which spits from
// range and bursts into acid when it dies; a red Ruptura, which walks to the
// player and explodes, hurting whatever stands near it, Araxxor included.
//
// At 25% of his hitpoints he is enraged: tougher, no more specials, an attack
// every 4 ticks, and his melee becomes a cleave across a line of three tiles
// that the player dodges by stepping off it, and that leaves acid there. A
// player under him when he cleaves makes him cut himself.
//
// Sources, beside the usual: plain OBS is 20 fights BigSneezi recorded with
// the Outside plugin (https://outside.wiki/bigsneezi), 19 of them kills. Two
// are of 24 November 2026: k1, red eggs first
// (bigsneezi-araxxor-2026-11-24.jsonl.gz; he comes up at t 164), and k2, green
// eggs first (the same name with "(1)"; he came up at t -7, before its first
// tick). The others are of 25 November: n0 is
// bigsneezi-araxxor-2026-11-25.jsonl.gz and n1 to n17 the same name with "(1)"
// to "(17)". "OBS n14 142" is tick 142 of n14; "20 of 20" counts all of them.
// They were fought with melee beside him (behind Protect from Melee, in the
// enrage mostly behind Protect from Missiles), so his ranged attack, the
// Ruptura's blast on the player, the cleave through Protect from Melee, a
// cleave from beside his corner, an Acidic that is killed and the corpse's
// Destroy are in none of them. OBS (tsps) is RSPSApp's reading of rsprox
// recordings 1077-1095, 1442, 1445 and 1508 of ordinary worlds (RSPSApp/tsps
// docs/araxxor.md and server/plugins/bosses/araxxor). Ids are the cache's,
// their names its gameval names as RSPSApp exports them.
//
// Timing: the recorder sees a hit on the player a tick after the engine
// applies it (an NPC's melee is in the engine's tick of the swing and on the
// recorder's next), so a hit on him recorded n ticks after its attack is n - 1
// here. A hit on an NPC is recorded on the tick it lands (the player's own on
// Araxxor are on the tick they land here). Animations, effects, spawns and the
// acid on the floor are timed as recorded.
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { CollisionFlag } from "../../engine/collision.js";
import { setArenaConfig, getArenaDefaultWalkable } from "../../engine/arena.js";
import { getPlayerDefenceRoll, getPlayerFormulaStats, getPrayerMultipliers } from "../../engine/combatFormulas.js";
import { rollNpcAttack, isNpcInAttackRange } from "../shared/npcAttack.js";
import { canFootprintStepInArena, getNpcPursuitMoves } from "../shared/npcMovement.js";
import { buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { createOccupancyStepCheck } from "../../engine/occupancy.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { getCanonicalEquipmentId } from "../../data/equipment.js";
import { araxxorLoadouts } from "./loadouts.js";

export const araxxorKind = "araxxor";
// CACHE: the lair is map square 56,153 (region 14489) and the west edge of
// 57,153 (region 14745), where the tunnel comes in. Tiles are counted from the
// south-west corner of the first, so the second's are x 64 to 127.
export const araxxorMapSquare = { x: 56, y: 153 };
export const araxxorMapSquareOffsets = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }];
const worldOrigin = [56 * 64, 153 * 64];
const fromWorld = ([x, y]) => [x - worldOrigin[0], y - worldOrigin[1]];
// OBS, OBS (tsps): he comes up here in every recorded fight (3631,9814).
export const bossStart = fromWorld([3631, 9814]);
// OBS (tsps): the tunnel puts the player here (3647,9815).
export const playerStart = fromWorld([3647, 9815]);
const bossSize = 7; // CACHE
// OBS, OBS (tsps): the eggs' south-west tiles in the order they hatch, the
// south-easternmost first and then clockwise (WIKI), the same in every fight.
export const eggTiles = [
  [3643, 9805], [3637, 9802], [3630, 9803], [3625, 9806], [3620, 9813],
  [3621, 9822], [3629, 9827], [3637, 9827], [3644, 9823],
].map(fromWorld);
const eggSize = 2; // CACHE
const araxyteSize = 2; // CACHE
const ballSize = 3; // CACHE
const corpseSize = 3; // CACHE

export const ids = {
  boss: 13668, // CACHE araxxor
  // CACHE: the eggs by the araxyte they hatch.
  eggs: { mirrorback: 13670, ruptura: 13672, acidic: 13674 },
  araxytes: { mirrorback: 13671, ruptura: 13673, acidic: 13675 },
  ball: 13676, // CACHE: the acid ball, 3 x 3
  corpse: 13669, // CACHE, OBS: what he is 5 ticks into his death (19 of 19), 3 x 3
  pool: 54148, // CACHE araxxor_acidpool, "Acid pool"
};
// His body once he is enraged, the acid on his front legs: OBS (tsps) has
// model 54288 in the place of 54289 (CACHE: his models are 54289 and 54290)
// from the second of the enrage's two animations on. The recorder does not see
// an NPC's models: nothing else of him changes there (no npc_changed, effect or
// animation set at any of the 20 enrages). CACHE: his corpse is 54288 too.
export const enragedModels = [54288, 54290];
export const seqs = {
  // CACHE: his stand (13668, opcode 13) and his walk (opcode 14); OBS: the
  // recorder names them so (k1 164, "moves"), and he is in 11473 on 2,361 of the
  // 2,362 ticks he neither steps nor turns.
  idle: 11473,
  walk: 11474,
  spawn: 11482, // CACHE npc_araxxor_01_spawn_01; OBS
  melee: 11480, // OBS
  magic: 11479, // OBS
  ranged: 11493, // OBS (tsps) acid_cannon_01
  ball: 11476, // OBS attack_ranged_01: the acid ball's throw
  spray: 11478, // OBS (tsps): the acid spray
  drip: 11477, // OBS: the acid drip
  cleave: 11487, // OBS: with "Skree!"
  enrage: 11488, // OBS
  enraged: 11489, // OBS: 2 ticks after 11488
  death: 11481, // OBS
  corpseIdle: 11485, // CACHE: his corpse's stand; OBS
  eggSpawn: 11506, // OBS egg_araxyte_spawn_01
  eggIdle: 11507, // CACHE: the egg's stand
  eggCrumble: 11508, // OBS: the eggs left when he dies
  hatch: 11503, // OBS npc_araxyte02_hatch
  araxyteIdle: 9137, // CACHE
  araxyteWalk: 9138, // CACHE
  acidicAttack: 11498, // OBS
  mirrorbackAttack: 11500, // OBS (tsps)
  mirrorbackDeath: 11510, // OBS npc_araxyte_mirror_back_death
  explode: 11504, // OBS npc_araxyte_explode: the Ruptura's blast and the Acidic's death
  ballRoll: 11491, // OBS
  ballBurst: 11492, // OBS
};
export const spots = {
  hatch: { mirrorback: 2929, ruptura: 2928, acidic: 2927 }, // OBS
  rupturaExplosion: 2925, // OBS araxyte_explosive_spider_explosion
  acidicDeath: 2926, // OBS (tsps)
  drip: 1626, // OBS araxxor_venom_drip, on the player each tick he drips
  splat: 2923, // OBS: where a blob of acid lands
  blob: 2924, // OBS: the blobs of acid
  magic: 1622, // OBS
  magicImpact: 1625, // OBS: on the player as the magic lands
  ranged: 2360, // OBS (tsps)
  acidic: 1560, // OBS
};

const bossActorId = "araxxor";
const eggActorId = (index) => `araxxor-egg-${index}`;
const araxyteActorId = (index) => `araxyte-${index}`;
const ballActorId = (count) => `acid-ball-${count}`;
export const corpseActorId = "araxxor-corpse";

// WIKI: the three orders; OBS: the colours in that order in every fight.
// Which one a fight gets is inferred: any, evenly (OBS: green first in 11 of
// the 20, red in 6, white in 3, which even odds give as uneven one time in 11;
// no source has odds).
export const patterns = {
  green: ["acidic", "mirrorback", "ruptura"],
  white: ["mirrorback", "ruptura", "acidic"],
  red: ["ruptura", "acidic", "mirrorback"],
};
// WIKI, OBS: the first egg's colour chooses the special.
const specialOf = { acidic: "ball", mirrorback: "spray", ruptura: "drip" };

const attackTicks = 6; // WIKI, OBS (k1 170 to 314, k2 5 to 143)
const enragedAttackTicks = 4; // WIKI, OBS (k1 320 to 352, k2 149 to 181)
// OBS: every seventh attack (k1 206, 248, 290; k2 35, 77, 119; WIKI: "every six
// standard attacks"); at a player under him it is a bite, and the special the
// next attack (n2 38 and 44, then 86 and 128).
const specialEvery = 7;
const firstAttackTicks = 6; // OBS: 6 ticks after he comes up (k1 164 and 170)
// OBS (20 of 20): the first egg hatches 21 ticks after he comes up and the next
// every 42, the first after the enrage too (k1 353, k2 182). WIKI: 3 ticks after
// the third standard attack and after every sixth, which is the same until the
// enrage. The egg after one that hatched while he was enraged came 38 ticks
// later (OBS n14 142 and 180, the one log with two of them).
const firstHatchTicks = 21;
const hatchTicks = 42;
const enragedHatchTicks = 38;
// OBS: he does not step on the two ticks after he comes up, at a player 2 tiles
// away or more (n10 6, n12 6, n16 6 and 7).
const stillTicks = 3;
// OBS: it turns to the player 3 ticks after it hatched (k1 188, 230, 272, 314,
// 356; k2 17, 59, 101, 143) and walks from 5 (k1 190, 232, 274, 316; k2 19,
// 61, 103, 145; OBS (tsps)).
const araxyteTurnTicks = 3;
const araxyteWakeTicks = 5;
// OBS: its first spit no sooner than 6 ticks after it hatched (n1 154 and 160, within its reach from 159).
const acidicFirstTicks = 6;
// WIKI: "falls below 255 health"; OBS: not at 255 (n0 141, the next hit at 145 enrages him).
const enrageThreshold = 0.25;
// OBS: the first cleave 5 ticks after 11488, 6 to 11 after his last attack (20 of 20).
const enrageFirstAttackTicks = 5;
const enrageBodyTicks = 2; // OBS: 11489 2 ticks after 11488 (20 of 20)
const cleaveReach = 2; // WIKI: "a cleave with range 2"
// OBS: its hit (k2 161 and 163, n4 195 and 197, n14 180 and 182, n17 135 and
// 137) and its acid 2 ticks after the swing.
const cleaveHitTicks = 1;
const cleavePoolTicks = 2;
// OBS: what it deals: 36, 25, 27 and 38 on the player behind Protect from
// Missiles (k2 163, n4 197, n14 182, n17 137: each time he ended the tick after
// the swing in its line), 30 and 37 on an araxyte (n14 190, n2 160). Never a
// miss. WIKI: up to 38. From 25 on is inferred.
const cleaveDamage = [25, 38];
// OBS: the cut he gives himself lands 2 ticks after the swing when a hit of the
// player's (a miss too) lands on him on that tick (23 of 23: k2 173, 177, 181,
// n4 183, n5 169, 173, n6 all 7, n9 all 6, n14 172, 188, 196, 200), else 3 ticks
// after it (70 of 70).
const cleaveCutTicks = 2;
// OBS: he drops his target with a cleave and has it back 2 ticks later when a
// hit of the player's lands on him on that tick, else 3 (32 and 104 of 136
// cleaves), with the acid ball's throw 4 (35 of 35). Until then he neither
// turns nor steps (k1 333 and 334, k2 155, 158, 159).
const cleaveTargetTicks = 3;
const ballTargetTicks = 4;
// inferred (RSPSApp's): his ranged and magic reach 10 tiles; no source says.
const distantReach = 10;
const distantHitTicks = 3; // OBS (k1 218 and 222), OBS (tsps): 4 ticks after the cast, whatever the distance
const ballLandTicks = 2; // OBS: k2 35 and 37, 77 and 79, 119 and 121
// OBS: its middle is on the edge of his body in one of eight directions, the
// nearest to the player's (35 of 35: north-east, k2 37, for a player at 53,29
// to 54,27; north, k2 121, for one at 51,29; east, n0 80 and n7 80, for one at
// 54,26). tsps: on the player's tile.
const ballLandDistance = 3;
const dripLandTicks = 4; // OBS: k1 206 and 210, 248 and 252, 290 and 294
const dripTicks = 7; // OBS (k1 210 to 216, 252 to 258, 294 to 300), OBS (tsps): 1626 on the player for 7 ticks
const dripPools = 6; // OBS: a pool on each of the next 6 ticks (k1 211 to 216, 253 to 258, 295 to 300)
// OBS: the Ruptura blows up 2 ticks after it reaches the player, its blast
// lands on Araxxor 2 ticks later (k1 205 and 207, 333 and 335; k2 120 and 122)
// and, inferred, is recorded then on the player too (n0 123 and n8 85: not on
// one who ends that tick 2 tiles away, having been 4 away the tick before); it
// goes 2 after that, his death or not (n10 169 and 173, he dies at 171). One
// that has not reached the player plays it as he dies, with no effect and no
// blast, and goes as many ticks later (n7 236 and 240).
const rupturaFuseTicks = 2;
const rupturaNpcBlastTicks = 2;
const rupturaPlayerBlastTicks = 1;
const rupturaGoneTicks = 4;
// OBS: it walks until it is 8 tiles away and spits from no farther (471 spits;
// the first of each on the tick it gets there: k1 242, k2 25 and 150).
const acidicHoldRange = 8;
// OBS: 11498 is 60 cycles long, and an Acidic that is still in it shows no
// death with him (spat with his 11481: n4; 1 tick before: k1, n7, n9, n12; 2
// ticks before: k2, n12). One whose two ticks took 61 cycles does (n14), and so
// do the 25 others.
const acidicSpitAnimationTicks = 2;
const mirrorbackGoneTicks = 2; // OBS: gone 2 ticks after its death animation (k1 291 and 293, k2 84 and 86, n2 161 and 163)
// OBS, from his death animation 11481: the araxytes die with it, the eggs
// crumble a tick later, the araxytes go 2 ticks after it and the eggs 3, and 5
// after it he is his corpse (19 of 19; OBS (tsps)). Killed the tick after a
// cleave, his araxytes die and go a tick later (n4 206 and 208, the one case).
const deathTicks = 5;
const eggCrumbleTicks = 1;
const araxytesGoneTicks = 2;
const eggsGoneTicks = 3;
const cyclesPerTick = 30;

// Max hits (WIKI) and what a protection prayer leaves of them.
// The Acidic's: OBS, 1 to 7 and each as often (28, 24, 29, 24, 31, 28 and 29 of
// 317 spits at a player without Protect from Missiles, the other 124 were 0);
// WIKI and TABLE have 15.
export const maxHits = { melee: 38, range: 34, magic: 21, acidic: 7 };
export const prayerLeaves = {
  // OBS: through Protect from Melee his legs hit 0 to 3 (388 swings that landed
  // alone: 153 were 0, 89 were 1, 76 were 2 and 70 were 3): a tenth of a hit,
  // rounded down (inferred). WIKI says at most 5.
  melee: 0.1,
  range: 0.55, // WIKI: "reduces it by about 45%, to a max of 18"
  magic: 0.5, // WIKI: "reduces it by about 50%"
  cleave: 0.34, // WIKI: "reducing the damage by ~66%"
};
const maxDefenceDrain = 45; // WIKI: "His Defence level can be only drained by up to 45 levels"
// Aranea boots, WIKI and OBS (tsps, recordings 4060, 4067): they negate his
// ranged at most once every 8 ticks and his cleave once every 20, each an
// attack that would have hurt (tsps: inferred there). Magic and his bite never.
const araneaBoots = 29806;
const araneaTicks = { range: 8, cleave: 20 };
const araneaMessage = "Your Aranea boots let you avoid the spider-based attack.";
const drainShare = 0.09; // WIKI, OBS (tsps), OBS (k1 222: 3 of 37 Prayer): 9% of the level as it is, rounded down
// OBS (tsps): flat, however long the player stands in it; OBS: 4 (k1 217, k2
// 182, n11 169, n14 174, n17 138) and 5 (n4 195, n10 95, n11 43).
const poolDamage = [4, 5];
const ballDamage = [14, 18]; // OBS (tsps); OBS: 17 (n7 39)
const venom = 1_000_000; // WIKI: the acid envenoms (the engine's poisonVarp for venom)
// WIKI: the Ruptura's blast by distance from it (under it, beside it, 1 and 2
// tiles between), in proportion to its hitpoints left. On the player (not yet
// recorded: inferred); on Araxxor, an egg or another araxyte (OBS: 80 on him
// with him over it, 25 of 25; 48 on an Acidic 2 tiles away, n10 171; nothing on
// one 4 away, k1 335, or on an egg 4 away, n8 85).
const rupturaOnPlayer = [70, 49, 28, 7];
const rupturaOnNpc = [80, 64, 48, 33];
const selfCut = [8, 12]; // WIKI; OBS: 8 to 12, each as often (17, 20, 19, 16 and 15 of 87)
const mirrorShare = 5; // OBS: it takes a fifth, rounded down (8 of 42, 1 of 5, 5 of 27, 6 of 34, 10 of 50 ...)
const mirrorRecoil = 2; // OBS: half of that, rounded down, back at the player (4, 2, 3, 5 ...; a 0 is shown, k2 64 and 76)
// OBS: one hatched 3 ticks before takes its share (k2 59), one hatched the
// tick before does not (k2 183). Between the two, inferred: from when it turns
// to the player.
const mirrorShareTicks = araxyteTurnTicks;
const mirrorMeleeRecoil = 2; // OBS: half of a melee hit on it (18 of 37)
const bossSpawnFacing = 1280; // OBS k1 164: he comes up facing north-east
// OBS: the eggs face this tile (their recorded facings point at its middle,
// both kills), and what hatches from one faces as it did until it turns.
const eggsFace = { position: fromWorld([3634, 9815]), size: 1 };
const eggHitpoints = 65; // CACHE
const araxyteHitpoints = 58; // TABLE

// Projectiles, OBS (tsps): [start, end] cycles from the attack; heights,
// slope and how far from the source they start. The magic (k1 218), the drip
// (k1 206, 248, 290), the ball's burst (k2 41, 83, 125) and the Acidic's spit
// (52 times) are so in plain OBS too.
const projectiles = {
  ranged: { spotAnimId: spots.ranged, start: 30, end: 120, startHeight: 296, endHeight: 50, slope: 35, startOffset: 0 },
  magic: { spotAnimId: spots.magic, start: 30, end: 120, startHeight: 69, endHeight: 50, slope: 35, startOffset: 62 },
  drip: { spotAnimId: spots.blob, start: 30, end: 120, startHeight: 170, endHeight: 30, slope: 35, startOffset: 200 },
  // These end 90 cycles plus 10 a tile from where they are thrown (the spray
  // too: OBS n9 35 and 77, n8 36 and 78, n2 44, 86 and 128), and the acid is
  // there on the tick after they land (the spray's blobs of 130 and 140 cycles
  // 5 ticks after the throw, of 150 and 160 6).
  spray: { spotAnimId: spots.blob, start: 30, base: 90, startHeight: 170, endHeight: 0, slope: 35, startOffset: 200 },
  burst: { spotAnimId: spots.blob, start: 30, base: 90, startHeight: 254, endHeight: 0, slope: 35, startOffset: 0 },
  acidicDeath: { spotAnimId: spots.blob, start: 30, base: 90, startHeight: 140, endHeight: 0, slope: 35, startOffset: 20 },
  acidic: { spotAnimId: spots.acidic, start: 39, base: 39, startHeight: 32, endHeight: 64, slope: 16, startOffset: 40 },
};
const magicImpactHeight = 50; // OBS k1 218
const sprayBlobs = 9; // OBS (7 of 7), OBS (tsps)
const spraySpread = 2; // OBS: the 5 x 5 about the tile one step on from the player (7 of 7)
const burstBlobs = 6; // OBS, OBS (tsps): up to 6 within 2 tiles of the ball
const burstSpread = 2;
// How many tiles it tries for them (inferred, from how many it throws: OBS all
// 6 where 9 tiles or more are open, 4 to 6 of the 7 open at the north-east
// wall, about half of what is left there the next time).
const burstTries = 25;
const acidicDeathBlobs = 13; // OBS (tsps): within 4 tiles
const acidicDeathSpread = 4;

const key = ([x, y]) => x + "," + y;
const footprintTiles = ([x, y], size) => {
  const tiles = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) tiles.push([x + dx, y + dy]);
  return tiles;
};
// Tiles between a tile and a footprint: 0 under it, 1 beside it.
const gapTo = ([px, py], [x, y], size) => Math.max(x - px, 0, px - (x + size - 1), y - py, py - (y + size - 1));
const middleOf = (actor) => [actor.position[0] + Math.floor(actor.size / 2), actor.position[1] + Math.floor(actor.size / 2)];
const chebyshev = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const tileTarget = (position) => ({ kind: "tile", position: [...position] });
const landingTicks = (endCycles) => Math.floor(endCycles / cyclesPerTick) + 1;

// The egg's stats: CACHE (Defence 75, 65 hitpoints); its defence bonuses are
// not known (inferred: none).
const eggFormulaStats = () => ({
  burnImmunity: null, freezeResistance: 0, poisonResistance: 100, attributes: [],
  levels: { attack: 1, strength: 1, defence: 75, ranged: 1, magic: 1 },
  offensive: { atk: 0, ranged: 0, magic: 0, str: 0, rangedStr: 0, magicStr: 0 },
  defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
});
const tableStats = (npcTypeId, version) => {
  const stats = getMonsterFormulaStats(npcTypeId, version);
  if (!stats) throw new Error(`Araxxor: the monster table has no ${npcTypeId}${version ? " " + version : ""}`);
  return structuredClone(stats);
};

// The egg blocks its tiles until it hatches (OBS (tsps): an invisible
// blocking object under it, swapped for one that does not block).
const eggFlags = CollisionFlag.OBJECT;
const closedFlags = CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED;
function collisionWithEggs(map, blocked) {
  const getFlag = (x, y) => (blocked.has(key([x, y])) && map.getFlag(x, y) !== -1 ? map.getFlag(x, y) | eggFlags : map.getFlag(x, y));
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

export const patternKey = "araxxorEggs";
const patternChoices = [
  { value: "random", label: "Any" },
  { value: "green", label: "Green first (acid ball)" },
  { value: "white", label: "White first (acid spray)" },
  { value: "red", label: "Red first (acid drip)" },
];

class AraxxorEncounter {
  constructor() {
    this.kind = araxxorKind;
    // Not state: the arena as the engine handed it, the tick's context (for
    // the rules that are handed none).
    for (const name of ["arenaBase", "context"]) Object.defineProperty(this, name, { value: null, writable: true });
    this.patternChoice = "random";
    // The eggs' order stays as the run started with it (registry.js).
    this.runStartMechanicsKeys = [patternKey];
    this.reset();
  }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.tick = 0;
    this.choosePattern();
    this.spawned = false;
    this.attacks = 0;
    this.sinceSpecial = 0; // his attacks since the last special
    this.nextAttackTick = firstAttackTicks;
    this.enraged = false;
    this.enragedBody = false; // the acid on his front legs
    this.nextHatchTick = firstHatchTicks;
    // The eggs, in the order they hatch: "egg", "hatched", "destroyed" or "spoiled".
    this.eggs = this.pattern.map((type, index) => ({ index, type, state: "egg" }));
    this.araxytes = new Map(); // actor id -> { type, hatchTick, wakeTick, fuse }
    this.pools = new Map(); // tile key -> [x, y]
    this.placed = { tick: null, tiles: [] }; // the pools of the last tick that placed one
    this.queue = []; // { tick, run(context, hits) }
    this.turn = { attack: null, middle: null }; // what he does this tick, and where his middle was as it began
    this.targetTick = 0; // until then he has no target
    this.araneaReady = { range: 0, cleave: 0 }; // when the Aranea boots can negate the next of each
    this.acidHitTick = null; // the last tick a landing blob's acid hurt the player
    this.playerTrail = []; // the player's tiles at the end of the last two ticks
    this.drip = null; // { from, until, gfxUntil, stood }
    this.dripOwed = null; // the tile the next drip starts with
    this.ball = null; // { id, middle, direction, hit, burstTick }
    this.balls = 0;
    this.pendingPlayerHits = []; // the Mirrorback's recoil, until the NPCs have had their turns
    this.cleaves = []; // { tiles, lands }: for the scene
    this.cleaveTick = null; // his last swing
    this.cleaveHit = null; // { tick, line, damage }: at the end of that tick, whoever is in its line
    this.slain = new Set(); // what the player's own hit has killed
    this.selfHits = new Map(); // actor id -> the tick a hit it deals itself lands (his cut, a Mirrorback's share)
    this.updateArena();
  }
  choosePattern() {
    const colours = Object.keys(patterns);
    const colour = patterns[this.patternChoice] ? this.patternChoice : colours[Math.floor(this.random() * colours.length)];
    this.colour = colour;
    // The first three repeat (WIKI).
    this.pattern = [...patterns[colour], ...patterns[colour], ...patterns[colour]];
    this.special = specialOf[this.pattern[0]];
  }
  getSeeds() {
    return { encounterSeed: this.seed };
  }
  getDefaultMechanicsConfig() {
    return { [patternKey]: "random" };
  }
  configureRunStart(mechanics) {
    const choice = mechanics?.[patternKey] ?? "random";
    if (choice === this.patternChoice) return;
    this.patternChoice = choice;
    this.choosePattern();
    this.eggs = this.pattern.map((type, index) => ({ index, type, state: "egg" }));
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
  refineArenaConfig(arena) {
    this.arenaBase = arena;
    this.blocked = this.eggTilesBlocked();
    return this.arenaWithEggs();
  }
  eggTilesBlocked() {
    const blocked = new Set();
    for (const egg of this.eggs) if (egg.state === "egg") for (const tile of footprintTiles(eggTiles[egg.index], eggSize)) blocked.add(key(tile));
    return blocked;
  }
  arenaWithEggs() {
    const base = this.arenaBase;
    if (!base?.collisionMap) return base;
    const blocked = this.blocked;
    const walkableTiles = base.walkableTiles ? new Set([...base.walkableTiles].filter((tile) => !blocked.has(tile))) : null;
    return { bounds: base.bounds, walkableTiles, collisionMap: collisionWithEggs(base.collisionMap, blocked) };
  }
  updateArena() {
    this.blocked = this.eggTilesBlocked();
    if (this.arenaBase) setArenaConfig(this.arenaWithEggs(), getArenaDefaultWalkable());
  }
  // Whether nothing stands there: no object or wall of the map's, no egg.
  isOpen(tile) {
    if (this.blocked.has(key(tile))) return false;
    const flag = this.arenaBase?.collisionMap?.getFlag(tile[0], tile[1]) ?? 0;
    return flag !== -1 && (flag & closedFlags) === 0;
  }
  // Where the acid can lie. OBS: 192 blobs, every one on an open tile, some of
  // them beyond the walls (58,36 ten times, 63,27 twice); none past the edge of
  // the lair's own map square (n0 86, n7 86: the ball's middle at 64,25).
  isAcidTile(tile) {
    return tile[0] < 64 && this.isOpen(tile);
  }

  createNpcs() {
    const formulaStats = tableStats(ids.boss, "In combat");
    const maxHp = 1020; // TABLE, WIKI
    const boss = {
      id: bossActorId, kind: "npc", role: "boss", npcTypeId: ids.boss, archetypeId: "araxxor", size: bossSize, alive: true,
      position: [...bossStart], previousPosition: [...bossStart], facing: bossSpawnFacing, history: new Map(),
      deathPolicy: "queued", // OBS k1 356 and 357: his death animation the tick after the killing hit
      vitals: { hp: maxHp, maxHp }, formulaStats, defenceDrainFloor: formulaStats.levels.defence - maxDefenceDrain,
      combat: { attackSpeed: attackTicks, attackRange: 1, meleeReach: "diagonal", attackStyle: "melee", nextActionTick: firstAttackTicks, targetId: "player", lastAttackTick: null,
        animations: { idle: seqs.idle, walk: seqs.walk, run: seqs.walk, attack: seqs.melee, death: seqs.death } },
    };
    const eggs = this.eggs.map(({ index, type }) => ({
      id: eggActorId(index), kind: "npc", role: "minion", npcTypeId: ids.eggs[type], archetypeId: "araxxor-egg", size: eggSize, alive: true,
      position: [...eggTiles[index]], previousPosition: [...eggTiles[index]], facing: 0, history: new Map(),
      vitals: { hp: eggHitpoints, maxHp: eggHitpoints }, formulaStats: eggFormulaStats(),
      combat: { attackSpeed: attackTicks, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
        animations: { idle: seqs.eggIdle, walk: seqs.eggIdle, run: seqs.eggIdle, attack: null, death: seqs.eggCrumble } },
    }));
    for (const egg of eggs) faceActorToward(egg, eggsFace);
    return [boss, ...eggs];
  }
  moveNpc(npc, context) {
    if (!npc.alive || this.outcome.phase !== "active" || this.isBossDying(context)) return [];
    if (npc.id === bossActorId) return this.moveBoss(npc, context);
    if (npc.id === this.ball?.id) return this.ball.step ? [{ npcId: npc.id, path: this.ball.step }] : [];
    const araxyte = this.araxytes.get(npc.id);
    if (!araxyte) return [];
    if (npc.combat.targetId === null && context.tick >= araxyte.hatchTick + araxyteTurnTicks) npc.combat.targetId = "player";
    if (context.tick < araxyte.wakeTick || araxyte.fuse !== null) return [];
    return this.pursuit(npc, context);
  }
  // The default pursuit, with the fight's own random draws (it steps out from under the player at random).
  pursuit(npc, context) {
    return getNpcPursuitMoves(npc, { ...context, random: this.random });
  }
  // OBS: an attack is decided, and leaves him, where he stands as the tick
  // begins, and he steps in the same tick (k1 218: magic at a player 2 tiles
  // away, from 50,25, and a step up to him); not with a cleave or the ball,
  // which drop his target. He steps only along the axis he is short on (k1
  // 218, 263 and 305 north, 335 west, where the default pursuit goes
  // diagonally), and enraged too until he is beside the player (k1 335); from
  // off his corner, beside it, so that the player is beside one of his sides
  // (n2 84).
  moveBoss(boss, context) {
    const player = context.world.getPlayer();
    this.turn = { attack: this.bossAttack(boss, player, context.tick), middle: middleOf(boss) };
    if (!this.spawned || !player?.alive || context.tick < this.spawnTick + stillTicks) return [];
    if (boss.combat.targetId === null) {
      if (context.tick < this.targetTick) return [];
      boss.combat.targetId = "player";
    }
    if (this.turn.attack === "cleave" || (this.turn.attack === "special" && this.special === "ball")) return [];
    const [px, py] = player.position, [x, y] = boss.position;
    if (gapTo(player.position, boss.position, bossSize) === 0) return this.pursuit(boss, context);
    const dx = px < x ? -1 : px > x + bossSize - 1 ? 1 : 0, dy = py < y ? -1 : py > y + bossSize - 1 ? 1 : 0;
    if ((dx === 0 || dy === 0) && isNpcInAttackRange(boss, player, 1)) return [];
    const isFree = createOccupancyStepCheck(context.world.occupancy);
    const step = [[x + dx, y + dy], [x + dx, y], [x, y + dy]].find((to) => gapTo(player.position, to, bossSize) > 0 &&
      canFootprintStepInArena(boss.position, to, { width: bossSize, height: bossSize }) && isFree(boss.position, to, bossSize));
    return step ? [{ npcId: boss.id, path: [step] }] : [];
  }
  bossAttack(boss, player, tick) {
    if (!this.spawned || tick < this.nextAttackTick || !player?.alive || (!this.enraged && this.shouldEnrage(boss))) return null;
    const gap = gapTo(player.position, boss.position, bossSize);
    if (this.enraged) return gap <= cleaveReach ? "cleave" : gap <= distantReach ? "distant" : null;
    if (gap > 0 && gap <= distantReach && this.sinceSpecial >= specialEvery - 1) return "special";
    if (gap === 0 || isNpcInAttackRange(boss, player, 1)) return "melee"; // OBS: at a player under him too (n2 38, n8 42)
    if (gap > 1 && gap <= distantReach) return "distant";
    return null; // out of his reach: he waits (inferred)
  }
  shouldEnrage(boss) {
    return boss.vitals.hp < boss.vitals.maxHp * enrageThreshold;
  }
  // Whether a hit of the player's lands on him this tick (before his turn).
  isHitNow(context) {
    return context.world.pendingHits.some((hit) => hit.sourceId === "player" && hit.targetId === bossActorId && hit.impactTick <= context.tick);
  }
  dropTarget(boss, context, ticks) {
    boss.combat.targetId = null;
    this.targetTick = context.tick + ticks;
  }

  // --- each tick, before the NPCs ---------------------------------------
  resolveHazards(context) {
    this.tick = context.tick;
    this.context = context;
    const hits = [];
    const due = this.queue.filter((entry) => entry.tick <= context.tick);
    this.queue = this.queue.filter((entry) => entry.tick > context.tick);
    for (const entry of due) entry.run(context, hits);
    if (this.outcome.phase !== "active") return hits;
    this.cleaves = this.cleaves.filter((cleave) => cleave.lands >= context.tick);
    this.stepDrip(context);
    this.stepBall(context);
    return hits;
  }
  // --- each tick, after the NPCs ----------------------------------------
  completeNpcBand(context) {
    const hits = this.pendingPlayerHits;
    this.pendingPlayerHits = [];
    if (hits.length) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [], mirrorbackRecoil: true });
    return hits;
  }
  // --- each tick, after the player -------------------------------------
  processPostTick(context) {
    const hits = [];
    const player = context.world.getPlayer();
    this.landCleave(context, player, hits);
    if (this.ball) this.ballHit(context, hits);
    // OBS: the acid hurts the player who ends a tick in it (k1 216, recorded on
    // 217; k2 181, n4 194, n10 94, n11 42 and 168, n14 173, n17 137).
    if (this.pools.has(key(context.playerPos)) && this.acidHitTick !== context.tick && player?.alive) hits.push(this.poolHit(context.playerPos));
    this.endDrip(context);
    this.playerTrail = [this.playerTrail[1] ?? [...context.playerPos], [...context.playerPos]];
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) {
      this.outcome = { ...this.outcome, phase: "victory" };
      this.leaveCorpse(context);
    }
    return hits;
  }
  processNpcTick(npc, context) {
    const idle = { environmentalDamages: [] };
    if (this.outcome.phase !== "active" || this.isBossDying(context)) return idle;
    const araxyte = this.araxytes.get(npc.id);
    if (!npc.alive) {
      // OBS: a Mirrorback still bites on the tick of the hit that kills it, and the bite does nothing (k1 290, k2 83).
      if (araxyte?.type === "mirrorback") this.mirrorbackBite(npc, context);
      return idle;
    }
    if (npc.id === bossActorId) return this.bossTurn(npc, context);
    if (araxyte) return this.araxyteTurn(npc, araxyte, context);
    return idle;
  }

  // --- Araxxor ---------------------------------------------------------
  bossTurn(boss, context) {
    const idle = { environmentalDamages: [] };
    const tick = context.tick;
    if (!this.spawned) {
      this.spawned = true;
      this.spawnTick = tick;
      this.nextAttackTick = tick + firstAttackTicks;
      this.nextHatchTick = tick + firstHatchTicks;
      this.animate(context, "spawn");
      for (const egg of this.eggs) this.animate(context, "spawn", eggActorId(egg.index));
      boss.combat.nextActionTick = this.nextAttackTick;
      return idle;
    }
    // OBS: none on the tick he dies (n2 185, n12 194).
    if (tick >= this.nextHatchTick) {
      this.nextHatchTick += this.enraged ? enragedHatchTicks : hatchTicks;
      this.hatch(context);
    }
    if (!this.enraged && this.shouldEnrage(boss)) this.enrage(boss, context);
    const player = context.world.getPlayer();
    const { attack } = this.turn;
    if (!attack) return idle;
    if (!this.enraged) {
      this.attacks++;
      this.sinceSpecial = attack === "special" ? 0 : this.sinceSpecial + 1;
    }
    let turn;
    if (attack === "cleave") turn = this.cleave(boss, player, context);
    else if (attack === "special") turn = this.specialAttack(boss, player, context);
    else if (attack === "melee") turn = this.melee(boss, player, context);
    else turn = this.distantAttack(boss, player, context);
    boss.combat.lastAttackTick = tick;
    this.nextAttackTick = tick + (this.enraged ? enragedAttackTicks : attackTicks);
    boss.combat.nextActionTick = this.nextAttackTick; // for the interface's attack timer
    return turn;
  }
  melee(boss, player, context) {
    const attack = rollNpcAttack({
      attacker: boss, target: player, random: this.random,
      // A stab (inferred); its accuracy rolled.
      plan: { formulaStyle: "melee_stab", damageType: "melee", attackKind: "melee_stab", maxHit: maxHits.melee, impactDelayTicks: 0, sourceDeathPolicy: "cancel-before-impact" },
    });
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: "attack", kind: "araxxor_melee", impactDelayTicks: 0 });
    return { environmentalDamages: [], npcAttacks: attack ? [{ ...attack, prayerReduction: { type: "reduce", value: prayerLeaves.melee } }] : [] };
  }
  // WIKI: magic or ranged, whichever of the player's defence rolls is lower
  // (inferred: ranged when they are equal).
  distantStyle(player) {
    const stats = getPlayerFormulaStats(player);
    const prayers = getPrayerMultipliers(player.activePrayer, player.offensivePrayer);
    const ranged = getPlayerDefenceRoll(stats, "ranged", player.equipmentStats, prayers);
    const magic = getPlayerDefenceRoll(stats, "magic", player.equipmentStats, prayers);
    return magic < ranged ? "magic" : "range";
  }
  distantAttack(boss, player, context) {
    const style = this.distantStyle(player);
    const shape = style === "magic" ? projectiles.magic : projectiles.ranged;
    let attack = rollNpcAttack({
      attacker: boss, target: player, random: this.random,
      plan: { formulaStyle: style === "magic" ? "magic" : "ranged", damageType: style, attackKind: style === "magic" ? "magic" : "range_arrow",
        maxHit: maxHits[style], impactDelayTicks: distantHitTicks, sourceDeathPolicy: "cancel-before-impact" },
    });
    // OBS (tsps): the message with the shot, which then hits a 0 and drains nothing.
    if (style === "range" && attack?.accuracySucceeded && this.araneaNegates("range", attack.rolledDamage, player, context)) {
      attack = { ...attack, accuracySucceeded: false, rolledDamage: 0 };
      this.araneaMessage(context);
    }
    emitInfernoNpcAttack(context, {
      actor: boss, target: player, clipId: style === "magic" ? "magic" : "ranged", kind: "araxxor_" + style, impactDelayTicks: distantHitTicks,
      projectiles: [this.projectile(shape, this.turn.middle, buildActorVisualTarget(player), shape.end)],
    });
    if (style === "magic") {
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
        graphics: [{ spotAnimId: spots.magicImpact, target: buildActorVisualTarget(player), height: magicImpactHeight, delayCycles: shape.end }] });
    }
    return { environmentalDamages: [], npcAttacks: attack ? [{ ...attack, prayerReduction: { type: "reduce", value: prayerLeaves[style] } }] : [] };
  }
  araneaNegates(kind, damage, player, context) {
    if (!(damage > 0) || context.tick < this.araneaReady[kind] || getCanonicalEquipmentId(player.equipment.boots) !== araneaBoots) return false;
    this.araneaReady[kind] = context.tick + araneaTicks[kind];
    return true;
  }
  araneaMessage(context) {
    context.tickEvents.emit({ type: "game_message", kind: "game", segments: [{ text: araneaMessage }] });
  }
  projectile(shape, from, target, endCycles) {
    return {
      spotAnimId: shape.spotAnimId, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target,
      startDelayCycles: Math.min(shape.start, endCycles), endDelayCycles: endCycles,
      slope: shape.slope, startOffset: shape.startOffset, startHeight: shape.startHeight, endHeight: shape.endHeight,
    };
  }

  // --- the specials ----------------------------------------------------
  specialAttack(boss, player, context) {
    const idle = { environmentalDamages: [] };
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: this.special, kind: "araxxor_" + this.special, impactDelayTicks: 0 });
    if (this.special === "drip") this.dripAt(boss, player, context);
    else if (this.special === "spray") this.spray(boss, player, context);
    else this.throwBall(boss, player, context);
    return idle;
  }
  // The drip: a blob on the player, 4 ticks later he drips for 7 ticks, and
  // the tile he stood on (and ran through) the tick before gets a pool on each
  // of the 6 ticks after it lands (OBS, 18 of 18). A tick that gave no pool,
  // the player having stood still, is made up for as the next drip starts, on
  // the tile he ended the last of those ticks on (n11 37 and 84, n10 89 and 136).
  dripAt(boss, player, context) {
    emitInfernoVisual(context.tickEvents, { animations: [], graphics: [],
      projectiles: [this.projectile(projectiles.drip, this.turn.middle, buildActorVisualTarget(player), projectiles.drip.end)] });
    this.later(dripLandTicks, (ctx) => {
      const target = ctx.world.getPlayer();
      if (!target?.alive) return;
      // OBS: "Araxxor covers you in venom. It slowly drips off you and covers the floor."
      ctx.tickEvents.emit({ type: "game_message", kind: "game",
        segments: [{ text: "Araxxor covers you in venom. It slowly drips off you and covers the floor.", color: "#ff3045" }] });
      this.drip = { from: ctx.tick + 1, until: ctx.tick + dripPools, gfxUntil: ctx.tick + dripTicks - 1, stood: false };
      this.dripGraphic(ctx, { dripStarts: true });
    });
  }
  dripGraphic(context, cue = {}) {
    const player = context.world.getPlayer();
    if (player) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spots.drip, target: buildActorVisualTarget(player), height: 0, delayCycles: 0 }], ...cue });
  }
  stepDrip(context) {
    const drip = this.drip;
    if (!drip) return;
    if (context.tick <= drip.gfxUntil && context.tick > drip.from - 1) this.dripGraphic(context);
    if (context.tick >= drip.from && context.tick <= drip.until) {
      if (context.tick === drip.from && this.dripOwed) {
        this.placePool(this.dripOwed);
        this.dripOwed = null;
      }
      const [before, last] = this.playerTrail;
      const tiles = [last ?? context.playerPos];
      // A run of two tiles: the one between too.
      if (before && last && chebyshev(before, last) === 2) tiles.unshift([before[0] + Math.sign(last[0] - before[0]), before[1] + Math.sign(last[1] - before[1])]);
      if (tiles.filter((tile) => this.placePool(tile)).length === 0) drip.stood = true;
    }
  }
  endDrip(context) {
    const drip = this.drip;
    if (!drip || context.tick < Math.max(drip.until, drip.gfxUntil)) return;
    if (drip.stood) this.dripOwed = [...context.playerPos];
    this.drip = null;
  }
  // The spray. OBS (7 of 7, the player off a corner of his middle each time):
  // nine blobs on as many different tiles of the 5 x 5 about the tile one step
  // on from the player, away from him, none of them under him (n2 44 and 128,
  // n8 36 and 78, n9 35 and 77 north-east of him, n2 86 north-west); those that
  // have acid already get none (n2 128: five thrown, 9 of the 23 tiles had). A
  // player straight beside his middle has the 5 x 5 one step on that way (inferred).
  spray(boss, player, context) {
    const { middle } = this.turn;
    const [px, py] = player.position;
    const [cx, cy] = [px + Math.sign(px - middle[0]), py + Math.sign(py - middle[1])];
    const open = [];
    for (let x = cx - spraySpread; x <= cx + spraySpread; x++)
      for (let y = cy - spraySpread; y <= cy + spraySpread; y++)
        if (chebyshev(middle, [x, y]) > Math.floor(bossSize / 2) && this.isAcidTile([x, y])) open.push([x, y]);
    const tiles = [];
    while (tiles.length < sprayBlobs && open.length > 0) tiles.push(...open.splice(Math.floor(this.random() * open.length), 1));
    this.throwBlobs(context, middle, tiles.filter((tile) => !this.pools.has(key(tile))), projectiles.spray);
  }
  // Blobs from a tile, each landing by its own distance: its splash (OBS: on
  // the cycle it lands, 100 to 110 after the throw in k2 41, 83 and 125), then
  // the pool, which hurts a player on that tile as it lands (WIKI: "the
  // splatters will damage before the pool forms").
  throwBlobs(context, from, tiles, shape, cue = {}) {
    const flights = [], splats = [];
    for (const tile of tiles) {
      const end = shape.base + 10 * chebyshev(from, tile);
      flights.push(this.projectile(shape, from, tileTarget(tile), end));
      splats.push({ spotAnimId: spots.splat, target: tileTarget(tile), height: 0, delayCycles: end });
      this.later(landingTicks(end), (ctx, hits) => {
        if (ctx.world.getPlayer()?.alive && key(ctx.playerPos) === key(tile)) {
          hits.push(this.poolHit(ctx.playerPos));
          this.acidHitTick = ctx.tick;
        }
        this.placePool(tile);
      });
    }
    if (flights.length || Object.keys(cue).length) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: flights, graphics: splats, ...cue });
  }
  // The acid ball: he turns to the nearest of eight directions (OBS: facing
  // 1280 at k2 36 and 78, 1024 at 120), and 2 ticks after the throw it is at
  // his edge there and hurts a player who ends that tick under it (OBS n7 38,
  // recorded on 39; not one who is under it as the tick begins and has left by
  // its end, 10 of 10: k2 121, n0 38, n3 79 and 121, n7 164, n12 49 and 91, n13
  // 81, n14 123, n16 91). Then it rolls on 2 tiles a tick, leaving acid on its
  // middle and the tile behind, until the tile two on is not open; it goes one
  // tile on, throws its blobs, bursts and goes (OBS: 7 tiles to the north-east
  // and the north walls, 11 to the east one, n0 80 to 87 and n7 80 to 87).
  throwBall(boss, player, context) {
    const bossMiddle = this.turn.middle;
    const ox = player.position[0] - bossMiddle[0], oy = player.position[1] - bossMiddle[1];
    const eighth = (Math.round(Math.atan2(oy, ox) / (Math.PI / 4)) * Math.PI) / 4;
    // North for a player on his middle (inferred).
    const direction = ox === 0 && oy === 0 ? [0, 1] : [Math.round(Math.cos(eighth)) + 0, Math.round(Math.sin(eighth)) + 0];
    const landing = [bossMiddle[0] + direction[0] * ballLandDistance, bossMiddle[1] + direction[1] * ballLandDistance];
    faceActorToward(boss, { position: [boss.position[0] + direction[0], boss.position[1] + direction[1]], size: bossSize });
    this.dropTarget(boss, context, ballTargetTicks);
    this.later(ballLandTicks, (ctx) => {
      if (this.ball) return; // one at a time (inferred)
      const id = ballActorId(++this.balls);
      const position = [landing[0] - 1, landing[1] - 1];
      ctx.spawnNpc({
        id, kind: "npc", role: "npc", npcTypeId: ids.ball, archetypeId: "acid-ball", size: ballSize, alive: true,
        position, previousPosition: [...position], facing: boss.facing, history: new Map(),
        untargetable: true, blocksNpcMovement: false, passThruNpcs: true,
        vitals: { hp: 1, maxHp: 1 },
        combat: { attackSpeed: 1, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
          animations: { idle: seqs.ballRoll, walk: seqs.ballRoll, run: seqs.ballRoll, attack: null, death: null } },
      });
      this.ball = { id, middle: [...landing], direction, hit: false, step: null, burstTick: null, landedTick: ctx.tick };
      this.animate(ctx, "roll", id);
    });
  }
  // WIKI: the ball's 3 x 3 hurts as it rolls too (inferred: once a ball).
  ballHit(context, hits) {
    const ball = this.ball;
    if (ball.hit || (ball.burstTick !== null && context.tick >= ball.burstTick)) return;
    if (this.outcome.phase !== "active" || !context.world.getPlayer()?.alive || chebyshev(ball.middle, context.playerPos) > 1) return;
    ball.hit = true;
    hits.push({ source: "Araxxor's acid ball", attackType: "typeless", baseDamage: [...ballDamage], playerPosition: [...context.playerPos], hitsplatType: "venom", applyPoison: venom });
  }
  stepBall(context) {
    const ball = this.ball;
    if (!ball) return;
    ball.step = null;
    if (ball.burstTick !== null) {
      if (context.tick === ball.burstTick) this.animate(context, "burst", ball.id);
      else if (context.tick > ball.burstTick) {
        context.despawnNpc(ball.id);
        this.ball = null;
      }
      return;
    }
    if (context.tick === ball.landedTick) return;
    const [mx, my] = ball.middle;
    const [dx, dy] = ball.direction;
    this.placePool([mx, my]);
    this.placePool([mx - dx, my - dy]);
    const steps = this.isOpen([mx + 2 * dx, my + 2 * dy]) ? 2 : 1;
    ball.step = Array.from({ length: steps }, (_, n) => [mx + dx * (n + 1) - 1, my + dy * (n + 1) - 1]);
    ball.middle = [mx + dx * steps, my + dy * steps];
    this.animate(context, "roll", ball.id);
    if (steps < 2) {
      // OBS: blobs from where it set off this tick, onto tiles without acid.
      const tiles = new Map();
      for (let n = 0; n < burstTries && tiles.size < burstBlobs; n++) {
        const tile = [mx + Math.floor(this.random() * (2 * burstSpread + 1)) - burstSpread, my + Math.floor(this.random() * (2 * burstSpread + 1)) - burstSpread];
        if (this.isAcidTile(tile) && !this.pools.has(key(tile))) tiles.set(key(tile), tile);
      }
      this.throwBlobs(context, [mx, my], [...tiles.values()], projectiles.burst, { ballBurst: true });
      ball.burstTick = context.tick + 1;
    }
  }

  // --- the enrage and the cleave ---------------------------------------
  enrage(boss, context) {
    this.enraged = true;
    // TABLE "Enraged" (WIKI: Defence +35, Magic +28, Ranged +31); what has
    // been drained stays drained (WIKI): the drains are kept apart.
    boss.formulaStats = { ...boss.formulaStats, levels: { ...tableStats(ids.boss, "Enraged").levels } };
    boss.defenceDrainFloor = boss.formulaStats.levels.defence - maxDefenceDrain;
    boss.combat.attackSpeed = enragedAttackTicks;
    boss.combat.attackRange = cleaveReach; // WIKI: he still closes the gap
    this.nextAttackTick = context.tick + enrageFirstAttackTicks;
    boss.combat.nextActionTick = this.nextAttackTick;
    this.animate(context, "enrage");
    this.later(enrageBodyTicks, (ctx) => {
      if (this.outcome.phase !== "active") return;
      this.enragedBody = true;
      this.animate(ctx, "enraged");
    });
  }
  // A line of three tiles through the player's, across the blow (OBS: a
  // player north or south of his middle gets an east-west line, k1 320 to 328,
  // 348, 352, k2 149 to 157, east or west a north-south one, k1 336 to 344, k2
  // 169; equal, east-west, k2 161).
  cleaveLine(boss, tile) {
    const middle = middleOf(boss);
    const dx = tile[0] - middle[0], dy = tile[1] - middle[1];
    return Math.abs(dx) > Math.abs(dy)
      ? [[tile[0], tile[1] - 1], [...tile], [tile[0], tile[1] + 1]]
      : [[tile[0] - 1, tile[1]], [...tile], [tile[0] + 1, tile[1]]];
  }
  cleave(boss, player, context) {
    const tile = [...player.position];
    const gap = gapTo(tile, boss.position, bossSize);
    const under = gap === 0;
    const [x, y] = boss.position;
    // Off his corner, and not beside it (OBS k1 332: the player at 45,32, he at 47,25 to 53,31).
    const offCorner = gap > 1 && (tile[0] < x || tile[0] > x + bossSize - 1) && (tile[1] < y || tile[1] > y + bossSize - 1);
    const line = this.cleaveLine(boss, tile);
    this.cleaveTick = context.tick;
    this.dropTarget(boss, context, cleaveTargetTicks);
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: "cleave", kind: "araxxor_cleave", impactDelayTicks: cleaveHitTicks });
    context.tickEvents.emit({ type: "overhead_text", anchor: { kind: "actor", actorId: bossActorId }, overheadText: "Skree!", overheadCycle: 3 });
    this.cleaves.push({ tiles: line.map((t) => [...t]), lands: context.tick + cleavePoolTicks });
    // OBS: the 1 x 3 hurts too when he cleaves a player under him.
    this.cleaveHit = { tick: context.tick + cleaveHitTicks, line, damage: this.roll(cleaveDamage) };
    // WIKI, OBS: a player under him makes him cut himself.
    const cut = under ? this.roll(selfCut) : null;
    this.later(cleaveCutTicks, (ctx) => {
      if (this.outcome.phase !== "active") return;
      const hitNow = this.isHitNow(ctx);
      if (hitNow) this.targetTick = ctx.tick;
      if (cut !== null) this.hitNpc(ctx, bossActorId, bossActorId, cut, hitNow ? 0 : 1);
      // OBS: an araxyte on the tile he struck at takes the blow (n14 190, an
      // Acidic, and n2 160, a Mirrorback, both of a cleave at a player under
      // him; not one that is only in the line, n14 194).
      for (const id of this.araxytes.keys()) {
        const araxyte = ctx.world.getNpc(id);
        if (araxyte?.alive && gapTo(tile, araxyte.position, araxyteSize) === 0) this.hitNpc(ctx, bossActorId, id, this.roll(cleaveDamage));
      }
    });
    // OBS: the acid 2 ticks after the swing; one pool only, on the player's
    // tile, from under him (94 of 94) and off his corner (k1 332). WIKI has two
    // more beside a corner, "north and east of the player" to the south-west:
    // no log has a cleave from there.
    this.later(cleavePoolTicks, () => {
      if (this.outcome.phase !== "active") return;
      for (const t of under || offCorner ? [tile] : line) this.placePool(t);
    });
    return { environmentalDamages: [] };
  }
  // OBS: the cleave hurts the player who ends the tick after the swing in its
  // line, wherever he was as it began (n4 196, n14 181, n17 136, k2 162; not one
  // who has left by then, 28 of 28, or who is back a tick later, n14 178).
  landCleave(context, player, hits) {
    const hit = this.cleaveHit;
    if (hit?.tick !== context.tick) return;
    this.cleaveHit = null;
    if (this.outcome.phase !== "active" || !player?.alive || !context.world.getNpc(bossActorId)?.alive || !hit.line.some((t) => key(t) === key(context.playerPos))) return;
    // OBS (tsps): the message 2 ticks after the swing and no hit; the acid lands all the same.
    if (this.araneaNegates("cleave", hit.damage, player, context)) this.later(1, (next) => this.araneaMessage(next));
    else hits.push({ source: "Araxxor's cleave", attackType: "melee", baseDamage: hit.damage, playerPosition: [...context.playerPos], prayerReduction: { type: "reduce", value: prayerLeaves.cleave } });
  }

  // --- the eggs and the araxytes ---------------------------------------
  hatch(context) {
    const next = this.eggs.find((egg) => egg.state === "egg");
    if (!next) return;
    const egg = context.world.getNpc(eggActorId(next.index));
    if (!egg?.alive) {
      next.state = "destroyed";
      return this.hatch(context); // WIKI: the next in turn hatches instead
    }
    context.despawnNpc(egg.id);
    const left = araxyteHitpoints - (egg.vitals.maxHp - egg.vitals.hp); // WIKI: the egg's damage carries over
    if (left <= 0) {
      // WIKI: an egg dealt more than the araxyte's hitpoints does not hatch, and its turn is lost.
      next.state = "spoiled";
      this.updateArena();
      this.animate(context, "crumble", egg.id);
      return;
    }
    next.state = "hatched";
    this.updateArena();
    const id = araxyteActorId(next.index);
    const type = next.type;
    const position = [...eggTiles[next.index]];
    context.spawnNpc({
      id, kind: "npc", role: "minion", npcTypeId: ids.araxytes[type], archetypeId: "araxyte-" + type, size: araxyteSize, alive: true,
      // OBS: they are not in his way (n14 171: he steps onto an Acidic; n2 41: onto a Mirrorback being killed).
      position, previousPosition: [...position], facing: egg.facing, history: new Map(), passThruNpcs: true, blocksNpcMovement: false,
      ...(type === "mirrorback" ? { deathPolicy: "queued" } : {}), // OBS: its death animation the tick after the killing hit (k1 291, k2 84)
      vitals: { hp: left, maxHp: araxyteHitpoints }, formulaStats: tableStats(ids.araxytes[type]),
      combat: { attackSpeed: attackTicks, attackRange: type === "acidic" ? acidicHoldRange : 1, attackStyle: type === "acidic" ? "range" : "melee",
        nextActionTick: context.tick + (type === "acidic" ? acidicFirstTicks : araxyteWakeTicks), targetId: null, lastAttackTick: null,
        animations: { idle: seqs.araxyteIdle, walk: seqs.araxyteWalk, run: seqs.araxyteWalk, attack: null, death: type === "mirrorback" ? seqs.mirrorbackDeath : seqs.explode } },
    });
    this.araxytes.set(id, { type, hatchTick: context.tick, wakeTick: context.tick + araxyteWakeTicks, fuse: null });
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId: id, clipId: "hatch", delayCycles: 0 }], projectiles: [],
      graphics: [{ spotAnimId: spots.hatch[type], target: { kind: "actor", actorId: id, size: araxyteSize, position }, height: 0, delayCycles: 0 }] });
  }
  araxyteTurn(npc, araxyte, context) {
    const idle = { environmentalDamages: [] };
    const tick = context.tick;
    const player = context.world.getPlayer();
    if (tick < araxyte.wakeTick || !player?.alive || araxyte.fuse !== null) return idle;
    if (araxyte.type === "ruptura") {
      // OBS: it reaches the player, and blows up 2 ticks later wherever he is.
      if (isNpcInAttackRange(npc, player, 1)) this.lightFuse(npc, araxyte, context);
      return idle;
    }
    if (tick < npc.combat.nextActionTick) return idle;
    if (araxyte.type === "acidic") {
      // OBS: not on the tick it steps out from under the player (n14 190: off him, 191: it spits).
      if (npc.combat.startedTurnOverlappingTarget || !isNpcInAttackRange(npc, player, acidicHoldRange)) return idle;
      const gap = gapTo(player.position, npc.position, araxyteSize);
      const end = projectiles.acidic.base + 10 * gap;
      // OBS: recorded on the tick its spit arrives, so many whole ticks after
      // it: 1 from 1 and 2 tiles (10 spits), 2 from 3 to 5 (51), 3 from 6 to 8 (410).
      const impactDelayTicks = Math.floor(end / cyclesPerTick) - 1;
      const attack = rollNpcAttack({
        attacker: npc, target: player, random: this.random,
        plan: { formulaStyle: "ranged", damageType: "range", attackKind: "range_arrow", maxHit: maxHits.acidic, impactDelayTicks, sourceDeathPolicy: "cancel-before-impact" },
      });
      emitInfernoNpcAttack(context, { actor: npc, target: player, clipId: "attack", kind: "araxyte_acidic", impactDelayTicks,
        projectiles: [this.projectile(projectiles.acidic, middleOf(npc), buildActorVisualTarget(player), end)] });
      npc.combat.lastAttackTick = tick;
      npc.combat.nextActionTick = tick + attackTicks;
      return { environmentalDamages: [], npcAttacks: attack ? [attack] : [] };
    }
    // The Mirrorback: its bite (a stab, inferred; TABLE max).
    if (!this.mirrorbackBite(npc, context)) return idle;
    const attack = rollNpcAttack({
      attacker: npc, target: player, random: this.random,
      plan: { formulaStyle: "melee_stab", damageType: "melee", attackKind: "melee_stab", impactDelayTicks: 0, sourceDeathPolicy: "cancel-before-impact" },
    });
    return { environmentalDamages: [], npcAttacks: attack ? [attack] : [] };
  }
  // Whether the Mirrorback bites, every 6 ticks (OBS k2 77 and 83; OBS (tsps)).
  mirrorbackBite(npc, context) {
    const player = context.world.getPlayer();
    if (context.tick < npc.combat.nextActionTick || !player?.alive || !isNpcInAttackRange(npc, player, 1)) return false;
    emitInfernoNpcAttack(context, { actor: npc, target: player, clipId: "attack", kind: "araxyte_mirrorback", impactDelayTicks: 0 });
    npc.combat.lastAttackTick = context.tick;
    npc.combat.nextActionTick = context.tick + attackTicks;
    return true;
  }
  lightFuse(npc, araxyte, context) {
    araxyte.fuse = context.tick;
    this.later(rupturaFuseTicks, (ctx) => {
      const ruptura = ctx.world.getNpc(npc.id);
      if (!ruptura?.alive) return;
      ruptura.untargetable = true;
      const share = ruptura.vitals.hp / ruptura.vitals.maxHp; // WIKI: "proportional to its health"
      emitInfernoVisual(ctx.tickEvents, { animations: [{ actorId: npc.id, clipId: "explode", delayCycles: 0 }], projectiles: [],
        graphics: [{ spotAnimId: spots.rupturaExplosion, target: buildActorVisualTarget(ruptura), height: 0, delayCycles: 0 }] });
      this.later(rupturaPlayerBlastTicks, (later, hits) => {
        if (this.outcome.phase !== "active") return;
        const playerGap = gapTo(later.playerPos, ruptura.position, araxyteSize);
        if (later.world.getPlayer()?.alive && playerGap < rupturaOnPlayer.length)
          hits.push({ source: "Ruptura Araxyte's explosion", attackType: "typeless", baseDamage: Math.floor(rupturaOnPlayer[playerGap] * share), playerPosition: [...later.playerPos] });
      });
      this.later(rupturaNpcBlastTicks, (later) => {
        if (this.outcome.phase !== "active") return;
        for (const other of later.world.getNpcs()) {
          if (other.id === npc.id || !other.alive || other.id === this.ball?.id) continue;
          // Between footprints: 0 when they overlap.
          const gap = Math.max(
            ruptura.position[0] - (other.position[0] + other.size - 1), other.position[0] - (ruptura.position[0] + araxyteSize - 1),
            ruptura.position[1] - (other.position[1] + other.size - 1), other.position[1] - (ruptura.position[1] + araxyteSize - 1), 0);
          if (gap < rupturaOnNpc.length) this.hitNpc(later, npc.id, other.id, Math.floor(rupturaOnNpc[gap] * share));
        }
      });
      this.later(rupturaGoneTicks, (later) => {
        if (later.world.getNpc(npc.id)) later.despawnNpc(npc.id);
        this.araxytes.delete(npc.id);
      }, true);
    }, true);
  }
  // The Acidic's death: it bursts into 13 blobs within 4 tiles (OBS (tsps)).
  acidicBurst(npc, context) {
    const middle = middleOf(npc);
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
      graphics: [{ spotAnimId: spots.acidicDeath, target: buildActorVisualTarget(npc), height: 0, delayCycles: 0 }] });
    const tiles = new Map();
    for (let n = 0; n < acidicDeathBlobs; n++) {
      const tile = [middle[0] + Math.floor(this.random() * (2 * acidicDeathSpread + 1)) - acidicDeathSpread,
        middle[1] + Math.floor(this.random() * (2 * acidicDeathSpread + 1)) - acidicDeathSpread];
      if (this.isAcidTile(tile)) tiles.set(key(tile), tile);
    }
    this.throwBlobs(context, middle, [...tiles.values()], projectiles.acidicDeath);
  }
  sharingMirrorback(world) {
    for (const [id, araxyte] of this.araxytes) {
      if (araxyte.type !== "mirrorback" || world.tick < araxyte.hatchTick + mirrorShareTicks) continue;
      const npc = world.getNpc(id);
      if (npc?.alive) return npc;
    }
    return null;
  }

  // --- the acid --------------------------------------------------------
  placePool(tile) {
    if (!this.isAcidTile(tile) || this.pools.has(key(tile))) return false;
    this.pools.set(key(tile), [...tile]);
    if (this.placed.tick !== this.tick) this.placed = { tick: this.tick, tiles: [] };
    this.placed.tiles.push(key(tile));
    return true;
  }
  poolHit(tile) {
    return { source: "Acid pool", attackType: "typeless", baseDamage: [...poolDamage], playerPosition: [...tile], hitsplatType: "venom", applyPoison: venom };
  }

  // --- the rest --------------------------------------------------------
  // `outlives`: whether it is done when he has died before it.
  later(ticks, run, outlives = false) {
    this.queue.push({ tick: this.tick + ticks, run, outlives });
  }
  roll([least, most]) {
    return least + Math.floor(this.random() * (most - least + 1));
  }
  animate(context, clipId, actorId = bossActorId) {
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId, clipId, delayCycles: 0 }], projectiles: [], graphics: [] });
  }
  hitNpc(context, attackerId, targetId, damage, impactDelayTicks = 0) {
    if (!context.world.getNpc(attackerId) || !context.world.getNpc(targetId)?.alive) return;
    if (attackerId === targetId) this.selfHits.set(targetId, context.tick + impactDelayTicks);
    context.queueNpcHit({ attackerId, targetId, style: "typeless", attackKind: "typeless", rolledDamage: damage, accuracySucceeded: true, impactDelayTicks, sourceDeathPolicy: "persist" });
  }
  // A hit of the player's as it lands on one of the fight's NPCs. What the
  // Mirrorback takes of it lands with it (OBS: 8 of 8, k1 276 to k2 75), on its
  // turn after his; what it throws back is on the player that tick (OBS:
  // recorded on the next, k1 277 to k2 84).
  playerHit(damage, attack, target, player, world) {
    if (!target?.alive || damage <= 0) return damage;
    const recoils = (dealt) => this.pendingPlayerHits.push({ source: "Mirrorback Araxyte's reflection", attackType: "typeless", baseDamage: dealt, playerPosition: [...player.position] });
    if (target.id === bossActorId) {
      const mirrorback = this.sharingMirrorback(world);
      const share = Math.floor(damage / mirrorShare);
      if (!mirrorback || share <= 0) return damage;
      this.hitNpc(this.context, mirrorback.id, mirrorback.id, share);
      recoils(Math.floor(share / mirrorRecoil));
      return damage - share;
    }
    // WIKI, OBS: a melee hit on a Mirrorback from beside it throws half back
    // (a halberd from a tile away does not).
    if (this.araxytes.get(target.id)?.type === "mirrorback" && attack?.style === "melee" && gapTo(player.position, target.position, araxyteSize) <= 1)
      recoils(Math.floor(Math.min(damage, target.vitals.hp) / mirrorMeleeRecoil));
    return damage;
  }
  getEngineRules() {
    return {
      playerDamageOnNpc: (damage, { attacker, target, attack }) => this.playerHit(damage, attack, target, attacker, this.context.world),
      // His ranged drains Defence and his magic Prayer, 9% of what is left,
      // rounded down, when the hit does damage (WIKI, OBS (tsps)).
      onPlayerDamageTaken: (hit, rules) => {
        if (hit.sourceNpcTypeId !== ids.boss || !(hit.effectiveDamage > 0)) return undefined;
        const player = rules.player;
        if (hit.attackType === "range") return { playerStatDrains: { defence: Math.floor(player.stats.defence.current * drainShare) } };
        if (hit.attackType === "magic") return { prayerPointsDelta: -Math.floor(player.prayerState.points * drainShare) };
        return undefined;
      },
    };
  }
  onPlayerAttackResolved(hit) {
    if (hit.hpBefore > 0 && hit.hpAfter === 0) this.slain.add(hit.targetId);
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    const araxyte = this.araxytes.get(defeat.npcId);
    if (araxyte) {
      const npc = context.world.getNpc(defeat.npcId);
      if (araxyte.type === "acidic" && this.outcome.phase === "active") this.acidicBurst(npc, context);
      if (araxyte.type === "mirrorback") {
        this.later(this.deathAnimationTick(npc, defeat) - defeat.tick + mirrorbackGoneTicks, (ctx) => {
          if (ctx.world.getNpc(defeat.npcId)) ctx.despawnNpc(defeat.npcId);
        });
      }
      this.araxytes.delete(defeat.npcId);
      return;
    }
    const egg = this.eggs.find((e) => eggActorId(e.index) === defeat.npcId);
    if (egg) {
      if (egg.state === "egg") egg.state = "destroyed";
      this.updateArena();
      return;
    }
    if (defeat.npcId !== bossActorId) return;
    this.queue = this.queue.filter((entry) => entry.outlives);
    this.drip = null;
    this.cleaves = [];
    this.cleaveHit = null;
    this.pendingPlayerHits = [];
    // OBS: the acid goes with the killing hit (19 of 19), what came on that very
    // tick a tick later (8 of 8; k2 183, n14 202).
    const last = this.placed.tick === defeat.tick ? this.placed.tiles : [];
    for (const tile of this.pools.keys()) if (!last.includes(tile)) this.pools.delete(tile);
    if (last.length > 0) this.later(1, () => this.pools.clear());
    if (this.ball) {
      context.despawnNpc(this.ball.id);
      this.ball = null;
    }
    // Ticks from now to his death animation.
    const wait = this.deathAnimationTick(context.world.getNpc(bossActorId), defeat) - defeat.tick;
    // A Ruptura that has reached the player blows up as it would have (inferred: to no effect).
    const left = [...this.araxytes].filter(([, { fuse }]) => fuse === null);
    const rupturas = [...this.araxytes].filter(([, { type }]) => type === "ruptura").map(([id]) => id);
    const unlit = left.map(([id]) => id).filter((id) => rupturas.includes(id));
    const araxytes = context.world.getNpcs().map((npc) => npc.id).filter((id) => id.startsWith("araxyte-") && !rupturas.includes(id));
    const eggs = this.eggs.filter((e) => e.state === "egg").map((e) => eggActorId(e.index));
    for (const id of this.araxytes.keys()) {
      const npc = context.world.getNpc(id);
      if (!npc) continue;
      npc.untargetable = true;
      context.world.removePendingHitsFromSource?.(id);
    }
    const isSpitting = (npc, tick) => npc.combat.lastAttackTick !== null && npc.combat.lastAttackTick >= tick - acidicSpitAnimationTicks;
    const die = (ctx) => {
      for (const [id, { type }] of left) {
        const npc = ctx.world.getNpc(id);
        if (npc && !(type === "acidic" && isSpitting(npc, ctx.tick))) this.animate(ctx, type === "mirrorback" ? "death" : "explode", id);
      }
    };
    const afterCleave = this.cleaveTick !== null && defeat.tick === this.cleaveTick + 1 ? 1 : 0;
    if (wait + afterCleave > 0) this.later(wait + afterCleave, die);
    else die(context);
    this.later(wait + eggCrumbleTicks, (ctx) => {
      for (const id of eggs) if (ctx.world.getNpc(id)) this.animate(ctx, "crumble", id);
    });
    const despawn = (ids) => (ctx) => {
      for (const id of ids) if (ctx.world.getNpc(id)) ctx.despawnNpc(id);
    };
    this.later(wait + afterCleave + araxytesGoneTicks, despawn(araxytes));
    this.later(wait + afterCleave + rupturaGoneTicks, despawn(unlit));
    this.later(wait + eggsGoneTicks, despawn(eggs));
    this.araxytes.clear();
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + wait + deathTicks, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }
  // OBS: the tick after the killing hit, for one that stepped the tick before
  // it too (the Mirrorback of k1, 289 to 291; the engine waits 3 ticks from a
  // step). On its tick when he cut himself to death (9 of 9: k2 183, n2 185, n6
  // 171, n8 148, n9 149, n12 194, n13 164, n14 202, n15 190), when a Mirrorback
  // died of its share (n2 161), or when the player's killing hit on him lands 2
  // ticks after a cleave (4 of 4: n1 163, n5 179, n11 193, n16 181; the 6 others
  // of the player's a tick later: k1 356, n0 173, n3 168, n4 204, n7 235, n10 171).
  diesAtOnce(npcId, tick) {
    if (npcId === bossActorId && this.cleaveTick !== null && tick === this.cleaveTick + cleaveCutTicks) return true;
    return !this.slain.has(npcId) && this.selfHits.get(npcId) === tick;
  }
  deathAnimationTick(npc, defeat) {
    if (!npc?.death) return defeat.tick;
    delete npc.lastStepTick;
    if (this.diesAtOnce(npc.id, defeat.tick)) npc.death.processTick = defeat.tick;
    npc.deathAnimationTick = npc.death.processTick;
    return npc.deathAnimationTick;
  }
  // Whether he has died this tick, before the others' turns, of what plays his
  // death at once: they do nothing more (OBS n9 149, n11 193, n14 202: no step).
  isBossDying(context) {
    const boss = context.world.getNpc(bossActorId);
    return boss?.alive === false && boss.death?.killTick === context.tick && this.diesAtOnce(bossActorId, context.tick);
  }
  // OBS (19 of 19): 5 ticks into his death he is his corpse, 3 x 3 in his
  // middle. What the game has from there on (Harvest: 2282 on the player, the
  // loot 2 ticks later, 11486 on the corpse 3 and gone 5; 17 logs) is not here:
  // the run is won.
  leaveCorpse(context) {
    const boss = context.world.getNpc(bossActorId);
    if (!boss) return;
    const position = boss.position.map((tile) => tile + 2);
    context.spawnNpc({
      id: corpseActorId, kind: "npc", role: "npc", npcTypeId: ids.corpse, archetypeId: "araxxor-corpse", size: corpseSize, alive: true,
      position, previousPosition: [...position], facing: boss.facing, history: new Map(),
      untargetable: true, blocksNpcMovement: false, passThruNpcs: true,
      vitals: { hp: 1, maxHp: 1 },
      combat: { attackSpeed: 1, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
        animations: { idle: seqs.corpseIdle, walk: seqs.corpseIdle, run: seqs.corpseIdle, attack: null, death: null } },
    });
  }
  getOutcome() {
    return this.outcome;
  }
  getSnapshot() {
    return {
      kind: this.kind,
      state: {
        eggs: this.colour, // the colour of the first egg
        special: this.special,
        attacks: this.attacks,
        enraged: this.enraged,
        enragedBody: this.enragedBody,
        nextHatchTick: this.spawned ? this.nextHatchTick : null,
        pools: [...this.pools.values()].map((tile) => [...tile]),
        dripping: this.drip !== null,
        ball: this.ball && { middle: [...this.ball.middle] },
        cleaves: this.cleaves.map(({ tiles, lands }) => ({ tiles: tiles.map((t) => [...t]), lands })),
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel(npcId) {
    const araxyte = this.araxytes.get(npcId);
    if (araxyte) return { mirrorback: "Mirrorback Araxyte", acidic: "Acidic Araxyte", ruptura: "Ruptura Araxyte" }[araxyte.type];
    return "Araxxor";
  }
}

export const araxxorDefinition = {
  kind: araxxorKind,
  factory: () => new AraxxorEncounter(),
  descriptor: {
    kind: araxxorKind,
    displayName: "Araxxor",
    description: "The Morytania Spider Cave: his three attack styles, the acid of his specials, nine eggs and their araxytes, and the cleave of his enrage.",
    mapSquare: araxxorMapSquare,
    mapSquareOffsets: araxxorMapSquareOffsets,
    playerStart,
    loadsMapLocs: true,
    isWorkInProgress: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { eyebrow: "Triumphant", title: "VICTORY", narrative: "ARAXXOR DEFEATED", accent: "gold" },
    loadouts: araxxorLoadouts,
    // Each number on its egg's south-west tile.
    tileMarkerPresets: [{
      id: "araxxor_eggs", name: "Egg order", description: "The nine eggs in the order they hatch: the south-easternmost first, then clockwise",
      link: "https://oldschool.runescape.wiki/w/Araxxor/Strategies", markers: eggTiles.map(([x, y], index) => [x, y, "#CCFFAB00", String(index + 1)]),
    }],
  },
  controls: {
    defaultMechanicsConfig: { [patternKey]: "random" },
    mechanicsToggles: [{ key: patternKey, label: "Eggs", setup: true, choices: patternChoices }],
    debugActions: [],
  },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { araxxorDefinition as definition };
export const order = 75;
