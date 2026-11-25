// The waves of the Fortis Colosseum: which monsters a wave has, where they
// are placed, and who the reinforcements are. Everything random follows from
// the encounter's seed and the wave's number, so that the same seed and the
// same player tile give the same wave whatever happened in the waves before.
//
// Sources as in constants.js: WIKI, SIM, inferred.
import { createSeededRandom, hashInteger } from "../../engine/random.js";
import {
  firstWave,
  lastWave,
  waveSpawnPoints,
  spawnPointExclusionDistance,
  reinforcementRowStartXs,
  reinforcementRowY,
  reinforcementNorthFromPlayerY,
  warbandArcherSpawnSquare,
  warbandSpawnOffsets,
  quartetSpawnOffset,
  southSpawns,
  colosseumMonsters,
} from "./constants.js";

// One entry per wave, the first is wave 1 (WIKI and SIM agree). Every wave
// also has the Fremennik warband: a berserker, an archer and a seer.
const waveCompositions = [
  { shaman: 1, reinforcements: ["jaguar"] },
  { shaman: 1, javelin: 1, reinforcements: ["jaguar"] },
  { shaman: 1, javelin: 2, reinforcements: ["jaguar"] },
  { shaman: 1, manticore: 1, reinforcements: ["shaman", "jaguar"] },
  { shaman: 1, javelin: 1, manticore: 1, reinforcements: ["shaman", "jaguar"] },
  { shaman: 1, javelin: 2, manticore: 1, reinforcements: ["shaman", "jaguar"] },
  { javelin: 1, manticore: 1, shockwave: 1, reinforcements: ["minotaur"] },
  { javelin: 2, manticore: 1, shockwave: 1, reinforcements: ["minotaur"] },
  { javelin: 1, manticore: 2, reinforcements: ["minotaur"] },
  { javelin: 2, manticore: 2, reinforcements: ["minotaur", "shaman"] },
  { javelin: 1, manticore: 2, shockwave: 1, reinforcements: ["minotaur", "shaman"] },
];
// SIM: the order in which a wave's monsters are listed before they are
// shuffled.
const waveMonsterKinds = ["shaman", "javelin", "manticore", "shockwave"];
// SIM `npcOrder`: the order in which monsters that are placed together take
// their turns, whatever spawn point each was given. Of a wave's start the
// warband comes before them all: berserker, archer, seer. (SIM gives
// reinforcements their turns before the monsters placed earlier. Here they
// come after them: the engine gives turns in the order NPCs were added.)
const turnOrder = ["manticore", "shaman", "javelin", "shockwave", "jaguar", "minotaur"];
export const warbandTurnOrder = ["berserker", "archer", "seer"];

export function isColosseumWave(wave) {
  return Number.isInteger(wave) && wave >= firstWave && wave <= lastWave;
}
function getWaveComposition(wave) {
  if (!isColosseumWave(wave)) {
    throw new RangeError(`Colosseum wave out of range: ${wave}`);
  }
  return waveCompositions[wave - 1];
}
/** The monsters a wave starts with, without the warband: "shaman", "javelin", ... one entry each. */
export function getWaveMonsterKinds(wave) {
  const composition = getWaveComposition(wave);
  return waveMonsterKinds.flatMap((kind) => Array.from({ length: composition[kind] ?? 0 }, () => kind));
}
export function getWaveReinforcementKinds(wave) {
  return [...getWaveComposition(wave).reinforcements];
}
/** Whether every monster of a wave, its reinforcements among them, is one the encounter can make. */
export function canSpawnWave(wave, knownKinds) {
  return [...getWaveMonsterKinds(wave), ...getWaveReinforcementKinds(wave)].every((kind) => knownKinds.includes(kind));
}

// The salts keep the streams of one wave apart; their values mean nothing.
const layoutSalt = 0x434f4c4c;
const reinforcementSalt = 0x434f4c52;
const combatSalt = 0x434f4c43;
const offerSalt = 0x434f4c4f;
// The wave's number is spread over the 32 bits by Knuth's multiplier
// (2654435761), as the Inferno's waves do it.
function createWaveRandom(encounterSeed, wave, salt) {
  return createSeededRandom(hashInteger((encounterSeed ^ Math.imul(wave, 2654435761) ^ salt) >>> 0));
}
/** The generator the monsters of a wave roll their attacks with. */
export function createWaveCombatRandom(encounterSeed, wave) {
  return createWaveRandom(encounterSeed, wave, combatSalt);
}
/** A shuffle, for modifiers.js, by the generator of the offer before a wave. */
export function createWaveOfferShuffle(encounterSeed, wave) {
  const random = createWaveRandom(encounterSeed, wave, offerSalt);
  return (items) => shuffle(items, random);
}
function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
const inTurnOrder = (spawns) => [...spawns].sort((spawn, otherSpawn) => turnOrder.indexOf(spawn.kind) - turnOrder.indexOf(otherSpawn.kind));
function isNearSpawnPoint(spawnPoint, tile) {
  return Math.max(Math.abs(spawnPoint[0] - tile[0]), Math.abs(spawnPoint[1] - tile[1])) <= spawnPointExclusionDistance;
}

// What a wave starts with, as { kind, position } in the order the monsters
// are to be added to the world, which is the order of their turns. SIM, in
// its order: the monsters are shuffled; the spawn points that are not near
// `playerTile` are shuffled; monster i takes point i; the warband's archer is
// placed on a random tile of its square, and the other two beside it.
//
// `modifiers` is { id: level } of the run. WIKI, Quartet: "An extra random
// Fremennik Warbander spawns every wave. This extra warbander will spawn to
// fill the south end of the formation when possible and will always attack
// on the same tick as its fellow". Its spawn carries `slot: "quartet"`: the
// slot south of the player, as in Sol Heredit's module. inferred: it is
// placed one tile south-east of the archer's tile, which closes the diamond
// the other three leave open, and its role is drawn last, so that the rest
// of the wave is the same with and without it.
//
// `practice.south` (set-up switches, not the game's) is { a, b }: what is to
// stand on the south spawn A (the near one) and B (the far one), each
// "random" (what the game would place there), "any" (one of the wave's
// monsters, the first in its shuffled order) or a kind ("manticore", ...).
// A kind the wave has no monster of left, or a point near the player, falls
// back to random. Kinds are placed before "any", A before B; the other
// monsters take the remaining points in their shuffled order. The draws are
// the same as without it, and without it the wave is the game's.
const practiceSouthSlots = ["a", "b"];
export function buildWaveSpawns(encounterSeed, wave, playerTile, modifiers = {}, practice = {}) {
  const random = createWaveRandom(encounterSeed, wave, layoutSalt);
  const monsterKinds = shuffle(getWaveMonsterKinds(wave), random);
  const shuffledPoints = shuffle(
    waveSpawnPoints.filter((spawnPoint) => !isNearSpawnPoint(spawnPoint, playerTile)),
    random,
  );
  if (shuffledPoints.length < monsterKinds.length) {
    throw new RangeError(`Wave ${wave} has more monsters than spawn points away from the player`);
  }
  const isSamePoint = (point, otherPoint) => point[0] === otherPoint[0] && point[1] === otherPoint[1];
  const positions = monsterKinds.map(() => null);
  for (const wantsAny of [false, true]) {
    for (const slot of practiceSouthSlots) {
      const wanted = practice.south?.[slot] ?? "random";
      const point = southSpawns[slot];
      if (wanted === "random" || (wanted === "any") !== wantsAny || !shuffledPoints.some((candidate) => isSamePoint(candidate, point))) {
        continue;
      }
      const index = monsterKinds.findIndex((kind, monsterIndex) => positions[monsterIndex] === null && (wanted === "any" || kind === wanted));
      if (index >= 0) {
        positions[index] = point;
      }
    }
  }
  const forced = positions.filter(Boolean);
  const freePoints = shuffledPoints.filter((point) => !forced.some((taken) => isSamePoint(taken, point)));
  const spawnPoints = positions.map((position) => position ?? freePoints.shift());
  const { minX, minY, size } = warbandArcherSpawnSquare;
  const archerTile = [minX + Math.floor(random() * size), minY + Math.floor(random() * size)];
  const warband = warbandTurnOrder.map((role) => ({
    kind: role,
    position: [archerTile[0] + warbandSpawnOffsets[role][0], archerTile[1] + warbandSpawnOffsets[role][1]],
  }));
  if (modifiers.quartet) {
    const role = warbandTurnOrder[Math.floor(random() * warbandTurnOrder.length)];
    const fourth = { kind: role, slot: "quartet", position: [archerTile[0] + quartetSpawnOffset[0], archerTile[1] + quartetSpawnOffset[1]] };
    // In the order of the turns it stands with its fellow of the same role.
    warband.splice(warbandTurnOrder.indexOf(role) + 1, 0, fourth);
  }
  return [
    ...warband,
    ...inTurnOrder(monsterKinds.map((kind, index) => ({ kind, position: [...spawnPoints[index]] }))),
  ];
}

// The reinforcements of a wave, as { kind, position } in the order of their
// turns. SIM: the row is the north one when the player stands at y 33 or
// more (its y 27 or less), else the south one. Where each stands in the row
// is inferred from four waves of OBS (constants.js has them): the largest at
// one of the row's start tiles, by chance, and each further one west of the
// one before, beside it.
export function buildReinforcementSpawns(encounterSeed, wave, playerTile) {
  const random = createWaveRandom(encounterSeed, wave, reinforcementSalt);
  const y = playerTile[1] >= reinforcementNorthFromPlayerY ? reinforcementRowY.north : reinforcementRowY.south;
  let x = reinforcementRowStartXs[Math.floor(random() * reinforcementRowStartXs.length)];
  const largestFirst = getWaveReinforcementKinds(wave).sort((kind, otherKind) => colosseumMonsters[otherKind].size - colosseumMonsters[kind].size);
  return inTurnOrder(
    largestFirst.map((kind, index) => {
      if (index > 0) {
        x -= colosseumMonsters[kind].size;
      }
      return { kind, position: [x, y] };
    }),
  );
}
