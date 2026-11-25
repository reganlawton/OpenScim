// The Alchemical Hydra's default loadouts (the descriptor's `loadouts`, encounters/registry.js), from the wiki's
// strategy guide (Alchemical Hydra/Strategies): the best of each slot of its Ranged and Melee tables that the client
// has, and its inventories. Its Magic is "not recommended", and the guide gives no table for it.
// - Ranged: the twisted bow with seeking dragon arrows and the Zaryte crossbow switch for its special (ruby dragon
//   bolts (e) in the quiver), with the Lightbearer the guide pairs with that switch. The guide's inventory: three divine
//   ranging potions, ten prayer restores (super restores here), cooked moonlight antelope (which cures poison), the
//   divine rune pouch. The toxic blowpipe it names for its healing special is in the place of its ruby bolts, and one
//   more antelope in that of the heavy bonesack.
// - Melee: the dragon hunter lance on stab, its first weapon after the Scythe of Vitur, which takes the Torva set
//   (the guide's first body and legs with the scythe only): the lance is worn with the guide's next, Bandos. The
//   Bandos godsword and burning claws are its inventory's specials (burning claws not on the red phase, which is
//   immune to burns), with one divine super combat potion, ten prayer restores (prayer potions here) and antelope; two
//   more antelope are in the place of its bracelet of slaughter and desert amulet.
// The guide's slayer helmet (i) is worn: the fight is a slayer task.
const runePouches = {
  ranged: { kind: "divine", slots: [{ id: 561 }, { id: 4699 }, { id: 563 }, { id: 4696 }] }, // Nature, lava, law, dust
  melee: { kind: "divine", slots: [{ id: 561 }, { id: 554 }, null, null] }, // Nature, fire
}; // the guide's, a table each
const antelope = 29143; // Cooked moonlight antelope
const food = (n) => Array.from({ length: n }, () => antelope);

export const alchemicalHydraLoadouts = {
  twisted_bow: {
    name: "Ranged (Twisted bow)",
    equipment: {
      head: 11865, // Slayer helmet (i)
      cape: 28951, // Dizana's quiver
      amulet: 33639, // Necklace of rupture
      weapon: 20997, // Twisted bow
      body: 27238, // Masori body (f)
      legs: 27241, // Masori chaps (f)
      hands: 26235, // Zaryte vambraces
      boots: 31097, // Avernic treads (max)
      ring: 25975, // Lightbearer
    },
    inventory: [
      26374, 12926, 23733, 23733, 23733, // Zaryte crossbow, toxic blowpipe, divine ranging potions (4)
      3024, 3024, 3024, 3024, 3024, // Super restores (4)
      3024, 3024, 3024, 3024, 3024,
      ...food(12),
      27281, // The divine rune pouch
    ],
    supplies: {
      equippedAmmo: { id: 33595 }, // Seeking dragon arrow
      quiverAmmo: { id: 21944 }, // Ruby dragon bolts (e), for the Zaryte crossbow
      runePouch: runePouches.ranged,
      blowpipe: { id: 11230 }, // Dragon darts
      selectedSpell: null,
      spellbook: "standard",
    },
  },
  dragon_hunter_lance: {
    name: "Melee (Dragon hunter lance)",
    equipment: {
      head: 11865, // Slayer helmet (i)
      cape: 21295, // Infernal cape
      amulet: 29801, // Amulet of rancour
      weapon: 22978, // Dragon hunter lance (stab)
      body: 11832, // Bandos chestplate
      shield: 22322, // Avernic defender
      legs: 11834, // Bandos tassets
      hands: 22981, // Ferocious gloves
      boots: 31097, // Avernic treads (max)
      ring: 28307, // Ultor ring
    },
    inventory: [
      11804, 29577, 23685, // Bandos godsword, burning claws, divine super combat potion (4)
      2434, 2434, 2434, 2434, 2434, // Prayer potions (4)
      2434, 2434, 2434, 2434, 2434,
      ...food(14),
      27281, // The divine rune pouch
    ],
    supplies: {
      equippedAmmo: { id: 22947 }, // Rada's blessing 4
      quiverAmmo: null,
      runePouch: runePouches.melee,
      blowpipe: null,
      selectedSpell: null,
      spellbook: "standard",
    },
  },
};
