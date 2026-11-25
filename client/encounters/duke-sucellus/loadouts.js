// Duke Sucellus' default loadouts (the descriptor's `loadouts`, encounters/registry.js), from the wiki's strategy
// guide (Duke Sucellus/Strategies): its best set of each slot with the claws it gives for oathplate, and an Emberlight
// set for "cost-conscious players" (its Bandos godsword goes with armour that is not oathplate, its Ultor ring with
// Emberlight). The inventory is the guide's; its stamina potion, Ring of shadows, pickaxe and house tablet, for the
// preparation or the way back, are more of its food here. The Book of the Dead and the rune pouch cast the Arceuus
// thralls and Death Charge.
const supplies = {
  equippedAmmo: { id: 22947 }, // Rada's blessing 4
  quiverAmmo: null,
  runePouch: { kind: "divine", slots: [{ id: 560 }, { id: 554 }, { id: 565 }, { id: 30843 }] }, // Death, fire, blood, aether
  blowpipe: null,
  selectedSpell: null,
  spellbook: "arceuus",
};
export const dukeLoadouts = {
  max: {
    name: "Max (Scythe)",
    equipment: {
      head: 30750, // Oathplate helm
      cape: 21295, // Infernal cape
      amulet: 29801, // Amulet of rancour
      weapon: 22325, // Scythe of vitur
      body: 30753, // Oathplate chest
      legs: 30756, // Oathplate legs
      hands: 22981, // Ferocious gloves
      boots: 31097, // Avernic treads (max)
      ring: 28316, // Bellator ring
    },
    inventory: [
      13652, 23685, 23685, 3024, // Dragon claws, two divine super combat potions, a super restore
      3024, 3024, 30125, 6685, // Two super restores, a prayer regeneration potion, a Saradomin brew
      25818, 27281, 13441, 29143, // The Book of the Dead, the divine rune pouch, an anglerfish, cooked moonlight antelope
      29143, 29143, 29143, 29143, // Cooked moonlight antelope
      29143, 29143, 29143, 29143,
      29143, 29143, 29143, 29143,
      29143, 29143, 29143, 29143,
    ],
    supplies,
  },
  emberlight: {
    name: "Emberlight",
    equipment: {
      head: 24271, // Neitiznot faceguard
      cape: 6570, // Fire cape
      amulet: 19553, // Amulet of torture
      weapon: 29589, // Emberlight
      body: 11832, // Bandos chestplate
      shield: 22322, // Avernic defender
      legs: 11834, // Bandos tassets
      hands: 7462, // Barrows gloves
      boots: 13239, // Primordial boots
      ring: 28307, // Ultor ring
    },
    inventory: [
      11804, 23685, 23685, 3024, // Bandos godsword; the rest as above
      3024, 3024, 30125, 6685,
      25818, 27281, 13441, 29143,
      29143, 29143, 29143, 29143,
      29143, 29143, 29143, 29143,
      29143, 29143, 29143, 29143,
      29143, 29143, 29143, 29143,
    ],
    supplies,
  },
};
