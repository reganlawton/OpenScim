// The waves of the Fortis Colosseum: its tiles, tick counts and ids.
//
// Every number names where it comes from:
//   WIKI      oldschool.runescape.wiki/w/Fortis_Colosseum (its main page;
//             where the strategy page is meant, the comment says so)
//   SIM       beta.colosim.com/waves.html, its script main.js. A tile of the
//             simulator is converted as ours = (simX + 6, 60 - simY): its y
//             grows south, and both anchor an NPC at its south-west tile.
//   CACHE     the game cache: a name from its table of names, a definition
//             as `node tools/cache-objects.mjs npc <id>` or `spot <id>`
//             prints it
//   TABLE     the monster table, client/data/monsters.js
//   OBS       the game itself, as recorded from the client on 2026-11-23
//             (waves 1 to 4). Where it and SIM differ, it wins.
//   inferred  no source says it
// docs/COLOSSEUM.md lists the sources, the places where they differ and
// everything inferred.
import { solMapSquare } from "../sol-heredit/constants.js";

export const colosseumKind = "colosseum";
// The arena is the map square of Sol Heredit's fight, which fences a part of
// it off; the waves have all of it. The four pillars and the walls are
// objects of the map.
export const colosseumMapSquare = solMapSquare;
// SIM (17, 24): the tile its player starts on.
export const colosseumPlayerStart = [23, 36];
export const firstWave = 1;
// WIKI: wave 12 is Sol Heredit, an encounter of its own here.
export const lastWave = 11;
// SIM: 5 ticks from the start of a wave until its monsters are placed.
export const waveStartDelayTicks = 5;
// SIM COLOSSEUM_SPAWN_POINTS: where the monsters of a wave can be placed (the
// south-west tile of the monster).
export const waveSpawnPoints = [
  [19, 32],
  [25, 34],
  [19, 37],
  [29, 37],
  [35, 37],
  [33, 42],
  [29, 31],
  [35, 31],
  [32, 27],
  [40, 35],
  [44, 37],
  [44, 32],
];
// The two south spawn points. WIKI (strategy page): a "double south" is a
// wave with monsters on both, which a player at the north-west pillar is to
// deal with. Which points they are is from the RuneLite ground markers that
// the application's preset "Colosseum Tiles" imports: its south A (30,32)
// and B (33,28) stand inside the footprints of these two, the near and the
// far south spawn.
// A is the near one (from the north-west pillar), B the far one, as the
// strategy page and the preset name them.
export const southSpawns = { a: [29, 31], b: [32, 27] };
export const southSpawnPoints = Object.values(southSpawns);
// SIM: a spawn point this near the player's tile (in steps; a diagonal step
// counts as one) is not used. The player's tile is the one he stands on one
// tick before the monsters are placed.
export const spawnPointExclusionDistance = 4;
// SIM `cooldown: 3`: a monster of a wave cannot attack before the third tick
// after the one it was placed on.
export const firstAttackDelayTicks = 3;
// OBS: the reinforcements arrive 66 ticks after the monsters were placed,
// in each of three waves (SIM: 67; WIKI: after 40 seconds, 66.7 ticks).
export const reinforcementDelayTicks = 66;
// SIM: the reinforcements stand in a row on its y 12 (ours 48) when the
// player stands at its y 27 or north of it (ours 33 or more), else on its
// y 41 (ours 19). WIKI: at the north or south gate, whichever is nearer the
// player. OBS, four waves, each time the north row: a jaguar alone appeared
// at 32,48 twice and at 33,48 once; a jaguar with a shaman at 32,48, the
// shaman at 31,48. (SIM starts the row at ours 31, shuffles its order and
// puts each further one east of the one before.) Inferred from those four:
// the largest of the reinforcements stands at x 32 or 33 by chance, and a
// smaller one beside it on its west. Nothing was seen of the south row or
// of a minotaur.
export const reinforcementRowStartXs = [32, 33];
export const reinforcementRowY = { north: 48, south: 19 };
export const reinforcementNorthFromPlayerY = 33;
// SIM: the archer of the Fremennik warband is placed on a random tile of a
// 7 x 7 square (its x 22..28, y 21..27), the seer two tiles east of the
// archer, the berserker one east and one north of it.
export const warbandArcherSpawnSquare = { minX: 28, minY: 33, size: 7 };
export const warbandSpawnOffsets = { archer: [0, 0], seer: [2, 0], berserker: [1, 1] };
// inferred: where the fourth warbander of the modifier Quartet is placed
// (waves.js says why there).
export const quartetSpawnOffset = [1, -1];
// OBS: a warbander is gone 3 ticks after its death animation starts.
export const warbandDeathTicks = 3;
// OBS: the line "Wave N completed!" comes on the first tick on which none of
// the wave's monsters is left (4 ticks after the kill of a shaman or a
// jaguar), and the interface on which a modifier is chosen opens 3 ticks
// after the line; the next wave's monsters appear 5 ticks after it closes.
// Minimus comes on the tick the interface opens (ColosseumEncounter.js).
// Inferred: with his offers switched off the next wave starts on that tick,
// and after the last wave the victory comes on it.
export const intermissionDelayTicks = 3;
// OBS: the duration in that line is the ticks since "Wave: N" in seconds,
// rounded to the nearest: 110 ticks 1:06, 175 1:45, 254 2:32, 186 1:52.
export const secondsPerTick = 0.6;

// The monsters of the waves, by the name the waves know them by.
//   npcTypeId, size   CACHE (the comment is the NPC's name there), TABLE
//   attackSpeed       TABLE, WIKI and SIM
//   attackRange       WIKI and SIM
//   deathTicks        the ticks from the kill until a monster is gone. OBS:
//                     the shaman, the jaguar and the javelin colossus were
//                     last there 3 ticks after the kill, the manticore 4.
//                     SIM `deathAnimationLength` for the shockwave colossus
//                     and the minotaur
//   idleSeqId         CACHE: the NPC's own
//   deathSeqId, clips CACHE: the comment is the sequence's name there.
//                     OBS: the shaman, the jaguar, the javelin colossus and
//                     the manticore played these; the clip "spawn" is what
//                     a monster plays as it appears
// Hitpoints and combat stats are read from TABLE when the actor is made
// (waveMonster.js).
export const colosseumMonsters = {
  shaman: {
    name: "Serpent shaman",
    npcTypeId: 12811, // colosseum_standard_mager
    size: 1,
    attackSpeed: 5,
    attackRange: 10,
    attackStyle: "magic",
    deathTicks: 3,
    idleSeqId: 813,
    deathSeqId: 10860, // npc_serpent_mager_death
    // npc_serpent_mager_casting and npc_human_staffready_spawn
    clips: { attack: 10859, spawn: 10861 },
  },
  jaguar: {
    name: "Jaguar warrior",
    npcTypeId: 12810, // colosseum_jaguar_warrior
    size: 2,
    attackSpeed: 5,
    attackRange: 1,
    attackStyle: "melee",
    deathTicks: 3,
    idleSeqId: 808,
    deathSeqId: 10849, // npc_jaguar_human_death
    // npc_jaguar_ranger_claws_attack and npc_human_ready_spawn
    clips: { attack: 10847, spawn: 10862 },
  },
  javelin: {
    name: "Javelin Colossus",
    npcTypeId: 12817, // colosseum_javelin_colossus
    size: 3,
    attackSpeed: 5,
    attackRange: 15,
    attackStyle: "range",
    deathTicks: 3,
    idleSeqId: 10889, // npc_colossi_javelin_01_idle
    deathSeqId: 10894, // npc_colossi_javelin_01_death
    // npc_colossi_javelin_01_range_attack and ..._artillery_attack
    clips: { attack: 10892, throwHigh: 10893 },
  },
  manticore: {
    name: "Manticore",
    npcTypeId: 12818, // colosseum_manticore
    size: 3,
    attackSpeed: 10, // the ticks of its charge
    attackRange: 15,
    attackStyle: "range",
    deathTicks: 4,
    idleSeqId: 10863, // npc_manticore_01_idle
    deathSeqId: 10866, // npc_manticore_01_death
    // npc_manticore_01_triple_charge, ..._triple_throw and ..._spawn_02
    clips: { charge: 10868, throw: 10869, spawn: 10871 },
  },
  shockwave: {
    name: "Shockwave Colossus",
    npcTypeId: 12819, // colosseum_shockwave_colossus
    size: 3,
    attackSpeed: 5,
    attackRange: 15,
    attackStyle: "magic",
    deathTicks: 3,
    idleSeqId: 10902, // npc_colossi_shockwave_01_idle
    deathSeqId: 10895, // npc_colossi_shockwave_01_death
    clips: { attack: 10903 }, // npc_colossi_shockwave_01_clapattack
  },
  minotaur: {
    name: "Minotaur",
    npcTypeId: 12812, // colosseum_minotaur
    size: 3,
    attackSpeed: 5,
    attackRange: 1,
    attackStyle: "melee",
    deathTicks: 4,
    idleSeqId: 10840, // npc_minotaur_boss_idle
    deathSeqId: 10846, // npc_minotaur_boss_death
    // npc_minotaur_boss_attack_melee, ..._attack_magic and ..._spawn
    clips: { attack: 10843, heal: 10844, spawn: 10845 },
  },
};
// Minimus, who offers the modifiers. OBS: NPC 12808; before the first wave
// he stands at 32,34 and says the greeting; he plays 10862 as he appears
// (CACHE: npc_human_ready_spawn). CACHE: his stand sequence.
export const minimus = {
  actorId: "colosseum_minimus",
  name: "Minimus",
  npcTypeId: 12808,
  idleSeqId: 11092,
  spawnSeqId: 10862,
  startTile: [32, 34],
  greeting: "Let me know when you want to begin.",
};
// Sol Heredit's module (actors.js): the NPC types of the bee swarm and of the
// orb of Solarflare. (The healing totem's is in his constants.)
export const modifierNpcTypeIds = { bees: 12823, solarflare: 12826 };
// The engine's poison scale (SimulationEngine.js, VENOM_VARP_THRESHOLD): a
// player's poisonVarp of this or more is venom, and this much applied to him
// is venom at its start, 6 a hit. For Mantimayhem II and III.
export const venomFromPoisonVarp = 1000000;
// CACHE: the object "Molten Sand".
export const moltenSandLocId = 50746;
// OBS, the shaman's spell: on the shaman as it casts, the projectile, and on
// the player as it arrives. CACHE names them watersurge_casting,
// watersurge_travel and watersurge_impact.
export const shamanSpotAnimIds = { cast: 1458, projectile: 1459, impact: 1460 };
// OBS; CACHE names it npc_colossi_javelin_01_spearhead.
export const javelinProjectileSpotAnimId = 2673;
// OBS, a javelin thrown high: on the colossus as it throws
// (npc_colossi_javelin_01_artillery_fire), then on the tile it comes down on
// a shadow and the falling javelin (gargboss_debris_shadow_90,
// npc_colossi_javelin_01_artillery_slow), then its blast
// (wild_falloff_meteor_blast_red).
export const highJavelinSpotAnimIds = { launch: 2676, shadow: 1446, falling: 2674, blast: 2265 };
// OBS and SIM; CACHE names them vfx_manticore_01_projectile_ranged_01,
// ..._magic_01 and ..._melee_01.
export const manticoreOrbSpotAnimIds = { range: 2683, magic: 2681, melee: 2685 };
// What an orb that hurts draws on the player. OBS: the melee one; the other
// two by their names in CACHE, vfx_manticore_01_projectile_impact_ranged_01
// and ..._impact_magic_01 (the melee one is ..._impact_melee_01).
export const manticoreOrbImpactSpotAnimIds = { range: 2684, magic: 2682, melee: 2686 };
// OBS: the shockwave colossus's projectile and its effect on the player.
// CACHE names them vfx_vardorvis_head_projectile_magic_01 and
// akkha_magic_impact. (SIM drew 1341, olm_weak_mage_proj.)
export const shockwaveProjectileSpotAnimId = 2520;
export const shockwaveImpactSpotAnimId = 2254;
/** Every spot animation the waves draw, for the scene to load. */
export const colosseumWaveSpotAnimIds = [
  ...Object.values(shamanSpotAnimIds),
  javelinProjectileSpotAnimId,
  ...Object.values(highJavelinSpotAnimIds),
  ...Object.values(manticoreOrbSpotAnimIds),
  ...Object.values(manticoreOrbImpactSpotAnimIds),
  shockwaveProjectileSpotAnimId,
  shockwaveImpactSpotAnimId,
  // OBS: what a monster the minotaur heals draws (minotaur.js); CACHE names it tzhaar_heal.
  444,
];
