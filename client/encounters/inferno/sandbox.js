// The Inferno's monsters in the sandbox (client/encounters/sandbox/): their
// catalog entries, in the format sandbox/catalog.js describes. Each says how
// the sandbox's one NPC behaviour fights with the monster; the Inferno's own
// fight never reads this file.
import { infernoNpcTypeIds, zukHealerNpcTypeId } from "./constants.js";

// The Inferno's sequences: the table of its render config in
// client/assets/rendering.js (CACHE), as docs/ADDING-AN-ENCOUNTER.md,
// section 7, copies four of them.
const infernoSeqs = {
  nibbler: { idle: 7573, walk: 7572, attack: 7574, death: 7576 },
  bat: { idle: 7577, walk: 7577, attack: 7578, death: 7580 },
  blob: { idle: 7586, walk: 7587, magic: 7581, melee: 7582, range: 7583, death: 7584 },
  meleer: { idle: 7595, walk: 7596, attack: 7597, death: 7599, digDown: 7600, digUp: 7601 },
  ranger: { idle: 7602, walk: 7603, melee: 7604, range: 7605, death: 7606 },
  mager: { idle: 7609, walk: 7608, magic: 7610, melee: 7612, death: 7613, resurrect: 7611 },
  jad: { idle: 7589, walk: 7588, magic: 7592, range: 7593, melee: 7590, death: 7594 },
  jadHealer: { idle: 2636, walk: 2634, attack: 2637, heal: 2639, death: 2638 },
  zukHealer: { idle: 2867, attack: 2868, death: 2866 },
  zuk: { idle: 7564, attack: 7566, death: 7562 },
};
// jad.js: the magic projectile in three parts, on the timing of Jad's magic
// profile, and the range attack's graphic on the target's tile.
const jadMagicParts = {
  timing: { delay: 2, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 },
  spotAnims: [{ spotAnimId: 448, start: 2, end: 2 }, { spotAnimId: 449, start: 6, end: 6 }, { spotAnimId: 450, start: 10, end: 12 }],
  slope: 16, startOffset: 32, startHeight: 512, endHeight: 124,
};
// blob.js: the blob's two projectiles, and its children's (lower).
const blobProjectile = (spotAnimId, timing) => ({ spotAnimId, timing, slope: 16, startHeight: 160, endHeight: 124 });
// zuk.js: 16 cycles and 10 a tile.
const zukProjectile = { spotAnimId: 1375, timing: { delay: 16, lengthAdjustment: 0, stepMultiplier: 10, progress: 128 }, slope: 0, startHeight: 390, endHeight: 124 };
// bat.js, mager.js (the mager's and the ranger's timings).
const batProjectile = { spotAnimId: 1382, timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 128 }, slope: 16, startHeight: 200, endHeight: 124 };
const magerProjectile = { spotAnimId: 1376, timing: { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }, slope: 0, startHeight: 400, endHeight: 124 };
const rangerProjectile = { spotAnimId: 1377, timing: { delay: 60, lengthAdjustment: -14, stepMultiplier: 8, progress: 0 }, slope: 16, startHeight: 256, endHeight: 124 };

// zukHealers.js: the heal it throws at Zuk (applied 4 ticks later, 15 to 24),
// and the sparks it throws at whoever attacked it: 5 to 10 each, which no
// prayer stops, landing 90 cycles later. In its fight they fall in a spread
// south of it, on the player's tile at most once a volley; in the sandbox one
// lands on its attacker (inferred).
const zukHealerHeal = {
  reach: 30, everyTicks: 3, heal: [15, 24], applyDelayTicks: 4, clip: "heal",
  projectile: { spotAnimId: 660, startDelayCycles: 0, endDelayCycles: 90, slope: 16, startOffset: 64, startHeight: 70, endHeight: 128 },
  graphic: { spotAnimId: 444, height: 256, delayCycles: 120 },
};
const zukHealerSparks = {
  id: "inferno.zuk_healer.sparks",
  spotAnimIds: [659],
  start({ random }) {
    return {
      clipId: "attack", landsInTicks: 3, holdTicks: 0, nextActionTicks: 3,
      data: { amount: 5 + Math.floor(random() * 6) },
      projectiles: [{ spotAnimId: 659, startDelayCycles: 0, endDelayCycles: 90, slope: 40 + Math.floor(random() * 11), startOffset: 0, startHeight: 70, endHeight: 0 }],
    };
  },
  land({ data, target, targetAlive }) {
    return { stomps: [], damage: target && targetAlive ? data.amount : null };
  },
};

// actors.js, waveMonsters.js and each monster's module.
export const infernoSandboxEntries = [
  {
    id: "inferno.nibbler", name: "Jal-Nib (nibbler)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.nibbler, size: 1, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 4 }], // nibbler.js: 0 to 4
    idleSeqId: infernoSeqs.nibbler.idle, walkSeqId: infernoSeqs.nibbler.walk, deathSeqId: infernoSeqs.nibbler.death, clips: { attack: infernoSeqs.nibbler.attack },
  },
  {
    id: "inferno.bat", name: "Jal-MejRah (bat)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.bat, size: 2, attackSpeed: 3,
    attacks: [{ style: "range", range: 4, clip: "attack", maxHit: 19, projectile: batProjectile }], // bat.js; range inferred
    idleSeqId: infernoSeqs.bat.idle, walkSeqId: infernoSeqs.bat.walk, deathSeqId: infernoSeqs.bat.death, clips: { attack: infernoSeqs.bat.attack },
  },
  {
    id: "inferno.blob", name: "Jal-Ak (blob)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.blob, size: 3, attackSpeed: 6,
    // blob.js: up to 29 each. It reads the player's protection prayer and
    // attacks with a style it does not cover, and splits in three as it dies.
    attacks: [
      { style: "melee", range: 1, clip: "melee", maxHit: 29 },
      { style: "range", range: 15, clip: "range", maxHit: 29, projectile: blobProjectile(1378, { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 32 }) },
      { style: "magic", range: 15, clip: "magic", maxHit: 29, projectile: blobProjectile(1380, { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }) },
    ],
    readsPrayer: true,
    splitsInto: [{ npc: "inferno.blob_range", offset: [1, 1] }, { npc: "inferno.blob_melee", offset: [0, 0] }, { npc: "inferno.blob_mage", offset: [2, 2] }], // blob.js, blobSplitSpawns
    idleSeqId: infernoSeqs.blob.idle, walkSeqId: infernoSeqs.blob.walk, deathSeqId: infernoSeqs.blob.death,
    clips: { melee: infernoSeqs.blob.melee, range: infernoSeqs.blob.range, magic: infernoSeqs.blob.magic },
  },
  // blob.js: the blob's three children, one style each, up to 18, every 4
  // ticks; rendering.js draws them with the blob's sequences.
  ...[
    ["blob_mage", "Jal-AkRek-Mej (small blob, magic)", { style: "magic", range: 15, clip: "magic", maxHit: 18, projectile: { ...blobProjectile(1381, { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }), startHeight: 80 } }],
    ["blob_range", "Jal-AkRek-Xil (small blob, ranged)", { style: "range", range: 15, clip: "range", maxHit: 18, projectile: { ...blobProjectile(1379, { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 32 }), startHeight: 80 } }],
    ["blob_melee", "Jal-AkRek-Ket (small blob, melee)", { style: "melee", range: 1, clip: "melee", maxHit: 18 }],
  ].map(([key, name, attack]) => ({
    id: `inferno.${key}`, name, group: "The Inferno", npcTypeId: infernoNpcTypeIds[key], size: 1, attackSpeed: 4,
    attacks: [attack],
    idleSeqId: infernoSeqs.blob.idle, walkSeqId: infernoSeqs.blob.walk, deathSeqId: infernoSeqs.blob.death,
    clips: { [attack.clip]: infernoSeqs.blob[attack.clip] },
  })),
  {
    id: "inferno.meleer", name: "Jal-ImKot (meleer)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.meleer, size: 4, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack" }],
    // meleer.js: without an attack for 20 ticks it digs, and comes up beside its target.
    digs: { clipDown: "dig_down", clipUp: "dig_up" },
    idleSeqId: infernoSeqs.meleer.idle, walkSeqId: infernoSeqs.meleer.walk, deathSeqId: infernoSeqs.meleer.death,
    clips: { attack: infernoSeqs.meleer.attack, dig_down: infernoSeqs.meleer.digDown, dig_up: infernoSeqs.meleer.digUp },
  },
  {
    id: "inferno.ranger", name: "Jal-Xil (ranger)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.ranger, size: 3, attackSpeed: 4,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "range", range: 15, clip: "range", projectile: rangerProjectile }, // actors.js: range 15
    ],
    idleSeqId: infernoSeqs.ranger.idle, walkSeqId: infernoSeqs.ranger.walk, deathSeqId: infernoSeqs.ranger.death,
    clips: { melee: infernoSeqs.ranger.melee, range: infernoSeqs.ranger.range },
  },
  {
    id: "inferno.mager", name: "Jal-Zek (mager)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.mager, size: 4, attackSpeed: 4,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "magic", range: 15, clip: "magic", projectile: magerProjectile },
    ],
    // mager.js: one attack in ten it brings back a dead monster of its side
    // (InfernoEncounter.js: a bat, blob, meleer, ranger or mager, not one
    // brought back already) with half its hitpoints and one, and stands 7 ticks.
    revives: { chance: 0.1, of: ["inferno.bat", "inferno.blob", "inferno.meleer", "inferno.ranger", "inferno.mager"], clip: "resurrect", stillTicks: 7, firstActionTicks: 4 },
    idleSeqId: infernoSeqs.mager.idle, walkSeqId: infernoSeqs.mager.walk, deathSeqId: infernoSeqs.mager.death,
    clips: { melee: infernoSeqs.mager.melee, magic: infernoSeqs.mager.magic, resurrect: infernoSeqs.mager.resurrect },
  },
  {
    id: "inferno.jad", name: "JalTok-Jad", group: "Bosses", npcTypeId: infernoNpcTypeIds.jad, size: 5, attackSpeed: 8, // WIKI
    // jad.js: three ticks from the animation to the release; max hit 113;
    // the melee every 4 ticks. Below half his hitpoints his healers come
    // (InfernoEncounter.js: 5 on wave 67, waves.js; 4 to 8 tiles away, constants.js).
    summons: [{ belowFraction: 0.5, npc: "inferno.jad_healer", count: 5, distance: { min: 4, max: 8 } }],
    attacks: [
      { style: "melee", range: 1, clip: "melee", maxHit: 113, attackSpeed: 4 },
      { style: "range", range: 50, clip: "range", maxHit: 113, windupTicks: 3, impactDelayTicks: 2, targetGraphic: { spotAnimId: 451, height: 92 } },
      { style: "magic", range: 50, clip: "magic", maxHit: 113, windupTicks: 3, parts: jadMagicParts },
    ],
    idleSeqId: infernoSeqs.jad.idle, walkSeqId: infernoSeqs.jad.walk, deathSeqId: infernoSeqs.jad.death,
    clips: { melee: infernoSeqs.jad.melee, range: infernoSeqs.jad.range, magic: infernoSeqs.jad.magic },
  },
  {
    id: "inferno.jad_healer", name: "Yt-HurKot (healer)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.jad_healer, size: 1, attackSpeed: 4,
    // jad.js: it walks to its Jad and heals him 10 every 4 ticks beside him
    // (InfernoEncounter.js), until something hits it; then it fights that, up
    // to 18. One placed on its own heals the nearest monster of its side.
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 18 }],
    supports: { reach: 1, everyTicks: 4, heal: [10, 10], clip: "heal", graphic: { spotAnimId: 444, height: 128, delayCycles: 0 } },
    idleSeqId: infernoSeqs.jadHealer.idle, walkSeqId: infernoSeqs.jadHealer.walk, deathSeqId: infernoSeqs.jadHealer.death,
    clips: { attack: infernoSeqs.jadHealer.attack, heal: infernoSeqs.jadHealer.heal },
  },
  // zuk.js. He does not move in his fight, nor in the sandbox.
  {
    id: "inferno.zuk", name: "TzKal-Zuk", group: "Bosses", npcTypeId: 7706, size: 7, attackSpeed: 10, immobile: true, // inferred from zukSetClock.js
    attacks: [{ style: "magic", range: 64, clip: "attack", projectile: zukProjectile }],
    // zuk.js: under 480 of his 1,200 hitpoints he calls Jad (zukFight.js:
    // with 3 healers of his own), under 240 his four healers, and attacks
    // every 7 ticks from then on.
    summons: [
      { belowFraction: 0.4, npc: "inferno.jad", count: 1, distance: { min: 1, max: 6 }, theirSummons: { "inferno.jad_healer": 3 } },
      { belowFraction: 0.2, npc: "inferno.zuk_healer", count: 4, distance: { min: 3, max: 8 }, attackSpeed: 7 },
    ],
    idleSeqId: infernoSeqs.zuk.idle, deathSeqId: infernoSeqs.zuk.death, clips: { attack: infernoSeqs.zuk.attack },
  },
  // zukHealers.js: it never moves; it heals Zuk until something hits it, then
  // throws sparks at that every 3 ticks. One placed on its own heals the
  // nearest monster of its side.
  {
    id: "inferno.zuk_healer", name: "Jal-MejJak (Zuk's healer)", group: "The Inferno", npcTypeId: zukHealerNpcTypeId, size: 1, attackSpeed: 3, immobile: true,
    attacks: [{ style: "magic", range: 15, clip: "attack", special: zukHealerSparks }],
    supports: zukHealerHeal,
    idleSeqId: infernoSeqs.zukHealer.idle, deathSeqId: infernoSeqs.zukHealer.death,
    clips: { attack: infernoSeqs.zukHealer.attack, heal: infernoSeqs.zukHealer.attack },
  },
];
