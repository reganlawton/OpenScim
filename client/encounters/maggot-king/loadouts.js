// The Maggot King's default loadouts (the descriptor's `loadouts`, encounters/registry.js), from the wiki's strategy
// guide (Maggot King/Strategies). The fight wants a melee switch for his near rotations, so each loadout is one of the
// guide's distant setups worn, with the melee table's best the client has in the inventory.
// - Ranged: the guide's best are the ascension crossbows with diamond ascension bolts, which the client lacks; the
//   Zaryte crossbow (its special attack weapon, the next on the table) and ruby dragon bolts (e) take their place.
// - Magic: the harmonised Nightmare staff with Fire Surge, the guide's strongest; the client has no searing page or
//   fragment of burning fire, so a Tome of fire is the off-hand.
// - Melee switch: Inquisitor's mace with the Inquisitor's set is the guide's best only with a 4-tick punish cycle, so the
//   switch is the Scythe of Vitur, then its Torva, amulet of rancour, infernal cape, ferocious gloves and Ultor ring
//   (the treads stay on). Supplies: divine super combat, the guide's Sanfew serum against the poisonous bile, super
//   restores, and anglerfish as food (the guide names none).
const scythe = 22325; // Scythe of Vitur
const meleeSwitch = [
  scythe, 26382, 26384, 26386, // Scythe of Vitur, Torva full helm, platebody, platelegs
  29801, 21295, 22981, 28307, // Amulet of rancour, infernal cape, ferocious gloves, Ultor ring
];
const potions = [23685, 10925, 3024, 3024]; // Divine super combat (4), Sanfew serum (4), two super restores (4)
const anglerfish = 13441;
const food = (n) => Array.from({ length: n }, () => anglerfish);

export const maggotKingLoadouts = {
  zaryte_crossbow: {
    name: "Ranged and melee (Zaryte crossbow)",
    equipment: {
      head: 27235, // Masori mask (f)
      cape: 28951, // Dizana's quiver
      amulet: 19547, // Necklace of anguish
      weapon: 26374, // Zaryte crossbow
      body: 27238, // Masori body (f)
      shield: 21000, // Twisted buckler
      legs: 27241, // Masori chaps (f)
      hands: 26235, // Zaryte vambraces
      boots: 31097, // Avernic treads (max)
      ring: 28310, // Venator ring
    },
    inventory: [
      ...meleeSwitch,
      23733, ...potions, 3024, // A divine ranging potion (4), the potions, a third super restore
      ...food(14),
    ],
    supplies: {
      equippedAmmo: { id: 21944 }, // Ruby dragon bolts (e)
      selectedSpell: null,
      spellbook: "standard",
    },
  },
  nightmare_staff: {
    name: "Magic and melee (Fire Surge)",
    equipment: {
      head: 21018, // Ancestral hat
      cape: 21791, // Imbued Saradomin cape
      amulet: 12002, // Occult necklace
      weapon: 24423, // Harmonised Nightmare staff
      body: 21021, // Ancestral robe top
      shield: 20714, // Tome of fire
      legs: 21024, // Ancestral robe bottom
      hands: 31106, // Confliction gauntlets
      boots: 31097, // Avernic treads (max)
      ring: 28313, // Magus ring
    },
    inventory: [
      ...meleeSwitch,
      23745, ...potions, 3024, // A divine magic potion (4), the potions, a third super restore
      27281, ...food(13), // The divine rune pouch, anglerfish
    ],
    supplies: {
      runePouch: { kind: "divine", slots: [{ id: 554 }, { id: 556 }, { id: 21880 }] }, // Fire, air, wrath
      selectedSpell: "Fire Surge",
      spellbook: "standard",
    },
  },
};
