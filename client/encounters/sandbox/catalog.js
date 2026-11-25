// The NPCs a sandbox scenario can place: monsters whose models and
// sequences the trimmed game cache already holds, because another encounter
// draws them. Hitpoints and combat stats come from the monster table
// (TABLE, client/data/monsters.js) by NPC type id; what an entry says here
// is how the sandbox's one NPC behaviour (brawler.js) fights with it.
//
// Every entry:
//   id            the name a scenario file uses ("inferno.meleer"); never
//                 change one, scenarios that were shared name it
//   name, group   what the editor lists
//   npcTypeId     CACHE, and the key into TABLE
//   size          CACHE, TABLE
//   attackSpeed   ticks between attacks
//   attacks       one or more { style, range, clip, maxHit?, windupTicks?,
//                 hits?, volley?, ...: `hits` hits at once (the jaguar's
//                 claws), `volley` [{ style, maxHit?, flight? ... }] one a tick
//                 (the manticore's orbs), each rolled with a hitsplat of its own;
//                 projectile?, flight?, parts?, targetGraphic? }: `style` is
//                 "melee", "range" or "magic"; of the attacks that reach, one
//                 is drawn at random. `projectile` is a timed projectile
//                 ({ spotAnimId, timing, slope, startHeight, endHeight }: the
//                 hit lands when it arrives), `flight` one of fixed cycles
//                 (the hit lands on the tick it ends), `parts` a projectile
//                 of several spot animations on one timing (Jad's magic),
//                 `targetGraphic` a spot animation on the target's tile;
//                 `windupTicks` delays all of it and the hit (Jad's three);
//                 `chargedVolley` a charge that shows the orbs it will throw,
//                 then one a tick (the manticore's: colosseum/sandbox.js);
//                 `special` an attack of the encounter's own that lands on
//                 tiles and can be walked out of ({ id, spotAnimIds, start,
//                 land }: Sol Heredit's spear and shield, in
//                 sol-heredit/sandbox.js; brawler.js starts it and
//                 encounter.js lands it)
//                 `everyNth` makes an attack come on that attack of the count
//                 and only then (the javelin colossus's high throw)
//   heal          { belowFraction, range, clip, graphic }: out of reach of
//                 its target it heals one of its side (the minotaur)
//   immobile      true: never moves (TzKal-Zuk)
//   idleSeqId, walkSeqId?, deathSeqId, clips   the sequences the scene loads
//
// Each encounter keeps the entries of its own monsters, next to the ids,
// sequences and projectiles they copy (<encounter>/sandbox.js); this module
// only gathers them. The sources of each number are named there. Where an
// encounter's own monster does something the sandbox does not (Jad's prayer
// switch, the manticore's charge, the healers), the entry is the plain
// version, and its speed or reach is "inferred" from the original.
import { infernoSandboxEntries } from "../inferno/sandbox.js";
import { colosseumSandboxEntries } from "../colosseum/sandbox.js";
import { solHereditSandboxEntries } from "../sol-heredit/sandbox.js";
import { vardorvisSandboxEntries } from "../vardorvis/sandbox.js";
import { doomSandboxEntries } from "../doom-of-mokhaiotl/sandbox.js";
import { yamaSandboxEntries } from "../yama/sandbox.js";
import { araxxorSandboxEntries } from "../araxxor/sandbox.js";

export const curatedNpcCatalog = [
  ...infernoSandboxEntries,
  ...colosseumSandboxEntries,
  ...solHereditSandboxEntries,
  ...vardorvisSandboxEntries,
  ...doomSandboxEntries,
  ...yamaSandboxEntries,
  ...araxxorSandboxEntries,
];

// What the encounters draw that is not a monster to place, each with its
// reason. test/test-sandbox-catalog.mjs fails for any other NPC an encounter
// draws (with stats in the monster table and an attack clip) that the
// catalog does not hold: a new encounter gives its monsters entries in its
// own sandbox.js, or reasons here.
export const sandboxCatalogExclusions = {
  9035: "the Corrupted Hunllef, the form that turns melee away: its three types are its protection prayers, and its style switch, tornadoes and floor are its room's: it is fought in its own room",
  9036: "the Corrupted Hunllef, the form that turns ranged away: as above",
  9037: "the Corrupted Hunllef, the form that turns magic away: as above",
  11730: "Zebak is a head and a tail of nine tiles with mechanics of his own: he is fought as the host of his room",
  11732: "Zebak, enraged: as above",
  8615: "the Alchemical Hydra, serpentine: its shield comes off only over its chamber's vents, and its forms follow its hitpoints: it is fought in its own chamber",
  8616: "the Alchemical Hydra losing its first head: only drawn for the 2 ticks of its change",
  8617: "the Alchemical Hydra losing its second head: as above, for 1 tick",
  8618: "the Alchemical Hydra losing its third head: as above, for 2 ticks",
  8619: "the Alchemical Hydra, electric: as the serpentine form",
  8620: "the Alchemical Hydra, flame: as the serpentine form",
  8621: "the Alchemical Hydra, enraged: as the serpentine form",
  8622: "what is left of the Alchemical Hydra: only drawn for the 7 ticks of its death",
  12167: "Duke Sucellus asleep: only drawn until he wakes, and has no attack",
  12191: "Duke Sucellus never leaves his seat and has no walk: he is fought in his own asylum",
  12214: "the Leviathan never leaves its pool and has no walk: it is fought in its own arena",
  12825: "the healing totem of a Colosseum modifier: it heals and never moves",
  13668: "Araxxor is 7 x 7 and cannot reach the player in the sandbox's arenas; his eggs, specials and enrage are his lair's",
  13671: "the Mirrorback Araxyte takes a share of what Araxxor is dealt and throws it back: alone it has nothing to share",
  13673: "the Ruptura Araxyte never attacks: it walks up to the player and explodes",
  14709: "the Doom of Mokhaiotl burrowed: the Doom himself under the floor, between his shield and his surfacing",
  15742: "the Maggot King fights from behind a row of bones, and most of his attacks are his floor's (bile, carrion, slams): he is fought in his own lair",
  15743: "the Ur-maggot larvae have no attack of their own: they fly in from the King's screeches and leech a player under them",
};

export const sandboxNpcCatalog = curatedNpcCatalog;

const catalogById = new Map(sandboxNpcCatalog.map((entry) => [entry.id, entry]));
export const getSandboxNpcEntry = (id) => catalogById.get(id);

// The special attacks of the catalog by id: a strike waiting to land names
// its special by id (encounter.js), so that the encounter's state stays data.
const specialById = new Map(sandboxNpcCatalog.flatMap((entry) => entry.attacks.filter((attack) => attack.special).map((attack) => [attack.special.id, attack.special])));
export const getSandboxSpecialAttack = (id) => specialById.get(id);

// What the scene loads for every entry (a render config's preloadNpcTypes).
export const sandboxPreloadNpcTypes = sandboxNpcCatalog.map((entry) => ({
  npcTypeId: entry.npcTypeId,
  ...(entry.idleSeqId === undefined ? {} : { idleSeqId: entry.idleSeqId }),
  ...(entry.walkSeqId === undefined ? {} : { walkSeqId: entry.walkSeqId }),
  attackClips: entry.clips,
  deathSeqId: entry.deathSeqId,
}));
// An attack's parts too: a volley's orbs fly as its own, and a charged
// volley holds, throws and lands its orbs (the manticore's).
const attackAndParts = (attack) => [
  attack,
  ...(attack.volley ?? []),
  ...Object.values(attack.chargedVolley?.orbs ?? {}).map((orb) => ({ flight: { spotAnimId: orb.spotAnimId }, targetGraphic: { spotAnimId: orb.impactSpotAnimId } })),
];
export const sandboxSpotAnimIds = [
  ...new Set(
    sandboxNpcCatalog.flatMap((entry) =>
      entry.attacks
        .flatMap(attackAndParts)
        .flatMap((attack) => [
          attack.projectile?.spotAnimId,
          attack.flight?.spotAnimId,
          attack.targetGraphic?.spotAnimId,
          ...(attack.parts?.spotAnims.map((part) => part.spotAnimId) ?? []),
          ...(attack.special?.spotAnimIds ?? []),
        ])
        .filter((id) => id !== undefined),
    ),
  ),
];
