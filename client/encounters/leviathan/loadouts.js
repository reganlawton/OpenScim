// The Leviathan's default loadouts (the descriptor's `loadouts`, encounters/registry.js), from the wiki's strategy
// guide (The Leviathan/Strategies): its Range and Mage tables' best of each slot that the client has (no ascension
// crossbows, no Zorya's tome) and its inventory. Its webweaver bow's special does not exist here: the other weapon of
// the two ranged sets takes its place. Its Ring of shadows and house tablet, for the way back, are food; its cheap
// prayer is a super restore and its cheap food an anglerfish (one of the five it chooses from, the one that can be
// eaten here). Its rune pouch casts Shadow Rush.
const runePouch = { kind: "divine", slots: [{ id: 560 }, { id: 562 }, { id: 566 }, { id: 556 }] }; // Death, chaos, soul, air
export const leviathanLoadouts = {
  zaryte_crossbow: {
    name: "Max (Zaryte crossbow)",
    equipment: {
      head: 27235, // Masori mask (f)
      cape: 28951, // Dizana's quiver
      amulet: 33639, // Necklace of rupture
      weapon: 26374, // Zaryte crossbow
      body: 27238, // Masori body (f)
      shield: 21000, // Twisted buckler
      legs: 27241, // Masori chaps (f)
      hands: 26235, // Zaryte vambraces
      boots: 31097, // Avernic treads (max)
      ring: 25975, // Lightbearer
    },
    // 27 items: the twisted bow needs a free slot for the buckler.
    inventory: [
      20997, 12926, 13441, 3024, // Twisted bow (the guide's for its back), toxic blowpipe, an anglerfish, a super restore
      3024, 3024, 3024, 23733, // Three super restores, a divine ranging potion
      23733, 13441, 13441, 13441, // A divine ranging potion, anglerfish
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 27281, // Anglerfish, the divine rune pouch
    ],
    supplies: {
      equippedAmmo: { id: 21944 }, // Ruby dragon bolts (e)
      quiverAmmo: { id: 33595 }, // Seeking dragon arrow, for the twisted bow
      runePouch,
      blowpipe: { id: 11230 }, // Dragon dart
      selectedSpell: null,
      spellbook: "ancient",
    },
  },
  twisted_bow: {
    name: "Twisted bow",
    equipment: {
      head: 27235, // As above
      cape: 28951,
      amulet: 33639,
      weapon: 20997, // Twisted bow
      body: 27238,
      legs: 27241,
      hands: 26235,
      boots: 31097,
      ring: 25975,
    },
    inventory: [
      26374, 12926, 13441, 13441, // Zaryte crossbow (the guide's first special), toxic blowpipe, two anglerfish
      3024, 3024, 3024, 3024, // Super restores
      23733, 23733, 13441, 13441, // Two divine ranging potions, anglerfish
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 27281, // Anglerfish, the divine rune pouch
    ],
    supplies: {
      equippedAmmo: { id: 33595 }, // Seeking dragon arrow
      quiverAmmo: { id: 21944 }, // Ruby dragon bolts (e), for the Zaryte crossbow
      runePouch,
      blowpipe: { id: 11230 }, // Dragon dart
      selectedSpell: null,
      spellbook: "ancient",
    },
  },
  // The guide has one inventory, the ranged one: the sceptre (its third special, the one the client has) and the
  // heart it asks of a mage are in place of the ranged weapons, food in place of the ranging potions.
  tumekens_shadow: {
    name: "Max (Tumeken's shadow)",
    equipment: {
      head: 21018, // Ancestral hat
      cape: 21791, // Imbued Saradomin cape
      amulet: 12002, // Occult necklace
      weapon: 27275, // Tumeken's shadow
      body: 21021, // Ancestral robe top
      legs: 21024, // Ancestral robe bottom
      hands: 31106, // Confliction gauntlets
      boots: 31097, // Avernic treads (max)
      ring: 28313, // Magus ring
    },
    inventory: [
      27665, 27641, 13441, 13441, // Accursed sceptre, saturated heart, two anglerfish
      3024, 3024, 3024, 3024, // Super restores
      13441, 13441, 13441, 13441, // Anglerfish
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 13441,
      13441, 13441, 13441, 27281, // Anglerfish, the divine rune pouch
    ],
    supplies: {
      equippedAmmo: { id: 22947 }, // Rada's blessing 4
      quiverAmmo: null,
      runePouch,
      blowpipe: null,
      selectedSpell: null,
      spellbook: "ancient",
    },
  },
};
