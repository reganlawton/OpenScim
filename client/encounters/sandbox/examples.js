// The example scenarios the editor offers, each with the gear it is meant to
// be played with. Each is a scenario of the format of scenario.js, checked
// when the module loads (normalizeScenario throws on a mistake). Every
// footprint stands on walkable tiles of its arena, clear of the others and
// of the host boss's NPCs: test/test-sandbox-examples.mjs checks it.
//
// Bosses only: the first eleven fight the arena's real boss with all its
// mechanics (the host) and other bosses beside it; the rest put the bosses
// of the catalog together, against the player, against each other, or in
// teams.
import { normalizeScenario } from "./scenario.js";

// Item ids (the game's object ids, as tools/determinism/scenarios/common.mjs has them).
const item = {
  twistedBow: 20997, dragonArrow: 11212, masoriMask: 27235, masoriBody: 27238, masoriChaps: 27241, zaryteVambraces: 26235,
  pegasianBoots: 13237, necklaceOfAnguish: 19547, avasAssembler: 22109, venatorRing: 28310, toxicBlowpipe: 12926,
  osmumtensFang: 26219, avernicDefender: 22322, torvaHelm: 26382, torvaBody: 26384, torvaLegs: 26386,
  infernalCape: 21295, amuletOfRancour: 29801, ferociousGloves: 22981, primordialBoots: 13239, ultorRing: 28307, dragonClaws: 13652,
  tumekensShadow: 27275, ancestralHat: 21018, ancestralTop: 21021, ancestralBottom: 21024, occultNecklace: 12002,
  tormentedBracelet: 19544, eternalBoots: 13235, imbuedSaradominCape: 21791, lightbearer: 25975, kodaiWand: 21006,
  saradominBrew: 6685, superRestore: 3024, anglerfish: 13441, divineSuperCombat: 23685, rangingPotion: 2444,
};
const slots = (...ids) => ids.map((id) => ({ id }));
const repeat = (id, count) => Array.from({ length: count }, () => id);

const rangedGear = {
  name: "Max ranged",
  equipment: {
    weapon: item.twistedBow, head: item.masoriMask, body: item.masoriBody, legs: item.masoriChaps, hands: item.zaryteVambraces,
    boots: item.pegasianBoots, amulet: item.necklaceOfAnguish, cape: item.avasAssembler, ring: item.venatorRing,
  },
  inventory: slots(item.toxicBlowpipe, item.rangingPotion, ...repeat(item.saradominBrew, 10), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: { equippedAmmo: { id: item.dragonArrow } },
};
const meleeGear = {
  name: "Max melee",
  equipment: {
    weapon: item.osmumtensFang, shield: item.avernicDefender, head: item.torvaHelm, body: item.torvaBody, legs: item.torvaLegs,
    hands: item.ferociousGloves, boots: item.primordialBoots, amulet: item.amuletOfRancour, cape: item.infernalCape, ring: item.ultorRing,
  },
  inventory: slots(item.dragonClaws, item.divineSuperCombat, ...repeat(item.saradominBrew, 10), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: {},
};
const mageGear = {
  name: "Max magic",
  equipment: {
    weapon: item.tumekensShadow, head: item.ancestralHat, body: item.ancestralTop, legs: item.ancestralBottom, hands: item.tormentedBracelet,
    boots: item.eternalBoots, amulet: item.occultNecklace, cape: item.imbuedSaradominCape, ring: item.lightbearer,
  },
  inventory: slots(item.kodaiWand, ...repeat(item.saradominBrew, 11), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: {},
};

const npc = (id, type, x, y, extra = {}) => ({ id, npc: type, position: [x, y], ...extra });
const example = (key, meta, arena, mode, gear, npcs, options = {}) => ({
  key,
  scenario: normalizeScenario({ format: "openscim-sandbox", version: 1, meta: { author: "OpenScim", ...meta }, arena, mode, options, gear, npcs }),
});

export const sandboxExamples = [
  // --- the arena's real boss, with all its mechanics, and company -------------
  example("two-suns", { name: "Two Suns", description: "Sol Heredit with all his mechanics, and a second Sol beside him." }, "sol_heredit", "versus", meleeGear, [
    npc("sol-twin", "sol_heredit", 26, 29),
  ], { bossMechanics: true }),
  example("sun-and-flame", { name: "Sun and Flame", description: "Sol Heredit with all his mechanics while JalTok-Jad switches styles from the corner." }, "sol_heredit", "versus", rangedGear, [
    npc("jad", "inferno.jad", 26, 29),
  ], { bossMechanics: true }),
  example("sun-and-shadow", { name: "Sun and Shadow", description: "Sol Heredit with all his mechanics, and Yama walking in from the other side." }, "sol_heredit", "versus", meleeGear, [
    npc("yama", "yama", 34, 29),
  ], { bossMechanics: true, playerStart: [30, 33] }),
  example("yamas-court", { name: "Yama's Court", description: "Yama with his fireballs, waves and void flares, JalTok-Jad on his left and Vardorvis on his right." }, "yama", "versus", rangedGear, [
    npc("jad", "inferno.jad", 19, 30),
    npc("vardorvis", "vardorvis", 39, 33),
  ], { bossMechanics: true, playerStart: [31, 37] }),
  example("yama-and-zuk", { name: "Two Lords of Fire", description: "Yama with all his mechanics, and TzKal-Zuk casting from the far side of the room." }, "yama", "versus", rangedGear, [
    npc("zuk", "inferno.zuk", 19, 22),
  ], { bossMechanics: true, playerStart: [31, 37] }),
  example("vardorvis-pack", { name: "The Stranglewood Hunt", description: "Vardorvis with his axes, spikes and strangle, while Sol Heredit and the Doom close in." }, "vardorvis", "versus", meleeGear, [
    npc("sol", "sol_heredit", 32, 29),
    npc("doom", "doom", 45, 29),
  ], { bossMechanics: true }),
  example("three-heads", { name: "Three Heads", description: "Vardorvis with all his mechanics, and two more of him." }, "vardorvis", "versus", meleeGear, [
    npc("vardorvis-2", "vardorvis", 34, 30),
    npc("vardorvis-3", "vardorvis", 46, 30),
  ], { bossMechanics: true }),
  example("dooms-jads", { name: "The Doom and Two Jads", description: "The Doom of Mokhaiotl's first delve, with a JalTok-Jad at each side of the room." }, "doom", "versus", rangedGear, [
    npc("jad-west", "inferno.jad", 21, 40),
    npc("jad-east", "inferno.jad", 37, 40),
  ], { bossMechanics: true }),
  example("abyss-below", { name: "The Abyss Below", description: "The Doom's deeper delves, with Yama and Vardorvis on the ledges." }, "doom_deep", "versus", mageGear, [
    npc("yama", "yama", 20, 40),
    npc("vardorvis", "vardorvis", 39, 41),
  ], { bossMechanics: true }),
  example("depths-of-fire", { name: "Depths of Fire", description: "The Doom's deeper delves, TzKal-Zuk at the back of the room and JalTok-Jad at your side." }, "doom_deep", "versus", rangedGear, [
    npc("zuk", "inferno.zuk", 28, 42),
    npc("jad", "inferno.jad", 21, 33),
  ], { bossMechanics: true }),
  example("zebak-and-sol", { name: "Jaws and Spear", description: "Zebak with his roars, waves and blood clouds, while Sol Heredit hunts you on the bank." }, "zebak", "versus", meleeGear, [
    npc("sol", "sol_heredit", 32, 35),
  ], { bossMechanics: true }),

  // --- bosses together -----------------------------------------------------------
  example("zuks-set", { name: "Zuk's Set", description: "TzKal-Zuk with two JalTok-Jads, an Inferno mager and ranger, and no pillars to hide behind." }, "inferno", "versus", rangedGear, [
    npc("zuk", "inferno.zuk", 27, 39),
    npc("jad-west", "inferno.jad", 18, 33),
    npc("jad-east", "inferno.jad", 39, 33),
    npc("mager", "inferno.mager", 20, 40),
    npc("ranger", "inferno.ranger", 36, 41),
  ]),
  example("triple-jad", { name: "Triple Jad", description: "Three JalTok-Jads at once, each on his own timer." }, "inferno", "versus", rangedGear, [
    npc("jad-1", "inferno.jad", 18, 38),
    npc("jad-2", "inferno.jad", 28, 40),
    npc("jad-3", "inferno.jad", 38, 38),
  ]),
  example("boss-rush", { name: "Boss Rush", description: "Sol Heredit, Yama, the Doom and Vardorvis in the Colosseum, all after you." }, "colosseum", "versus", meleeGear, [
    npc("sol", "sol_heredit", 27, 44),
    npc("yama", "yama", 40, 44),
    npc("doom", "doom", 21, 21),
    npc("vardorvis", "vardorvis", 42, 22),
  ]),
  example("royal-rumble", { name: "Royal Rumble", description: "Six bosses in the Colosseum, every one for itself, and you in the middle." }, "colosseum", "ffa", meleeGear, [
    npc("sol", "sol_heredit", 21, 44),
    npc("yama", "yama", 40, 44),
    npc("doom", "doom", 21, 21),
    npc("jad", "inferno.jad", 39, 21),
    npc("vardorvis", "vardorvis", 30, 46),
    npc("zuk", "inferno.zuk", 29, 19),
  ]),
  example("champions-stand", { name: "The Champions' Stand", description: "Sol Heredit and Vardorvis fight for you against Yama, JalTok-Jad and the Doom." }, "colosseum", "ffa", rangedGear, [
    npc("sol", "sol_heredit", 26, 34, { team: "player" }),
    npc("vardorvis", "vardorvis", 27, 39, { team: "player" }),
    npc("yama", "yama", 40, 44, { team: "enemies" }),
    npc("jad", "inferno.jad", 40, 32, { team: "enemies" }),
    npc("doom", "doom", 36, 20, { team: "enemies" }),
  ]),
  example("clash-of-titans", { name: "Clash of Titans", description: "Sol Heredit and Vardorvis against Yama and the Doom. You only watch." }, "colosseum", "ffa", mageGear, [
    npc("red-sol", "sol_heredit", 18, 30, { team: "red" }),
    npc("red-vardorvis", "vardorvis", 20, 40, { team: "red" }),
    npc("blue-yama", "yama", 40, 29, { team: "blue" }),
    npc("blue-doom", "doom", 42, 35, { team: "blue" }),
  ], { ffaIncludesPlayer: false }),
  example("boss-royale", { name: "Boss Royale", description: "Sol Heredit, the Doom, JalTok-Jad and Vardorvis in the Tombs' nexus. Every one for itself; you watch." }, "toa_nexus", "ffa", mageGear, [
    npc("sol", "sol_heredit", 24, 28),
    npc("doom", "doom", 34, 28),
    npc("jad", "inferno.jad", 28, 17),
    npc("vardorvis", "vardorvis", 34, 20),
  ], { ffaIncludesPlayer: false }),
  example("tomb-raiders", { name: "Tomb Raiders", description: "JalTok-Jad, the Doom and Vardorvis come for you in the nexus of the Tombs of Amascut." }, "toa_nexus", "versus", mageGear, [
    npc("jad", "inferno.jad", 24, 28),
    npc("doom", "doom", 34, 28),
    npc("vardorvis", "vardorvis", 30, 19),
  ]),
  example("twin-flames", { name: "Twin Flames", description: "Two TzKal-Zuks at the far end of the Inferno and two JalTok-Jads walking up to you." }, "inferno", "versus", rangedGear, [
    npc("zuk-west", "inferno.zuk", 18, 38),
    npc("zuk-east", "inferno.zuk", 36, 38),
    npc("jad-west", "inferno.jad", 18, 26),
    npc("jad-east", "inferno.jad", 38, 26),
  ]),
];

export const getSandboxExample = (key) => sandboxExamples.find((entry) => entry.key === key);
