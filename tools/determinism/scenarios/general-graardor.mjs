// General Graardor (client/encounters/general-graardor/). Supports three starting
// modes via graardorStartMode:
// - "altar_door": player at 54,57 ("Shoot->door" in front of the
//   Bandos altar), General Graardor at 52,50 (4x4, 255 hitpoints) on the Altar-Door
//   lane, Sergeant Strongstack (50,46), Sergeant Steelwill (56,40) and Sergeant
//   Grimspike (50,50).
// - "standard_door" (default): player at 48,42 (inside the west Big door), General
//   Graardor at his default spawn 56,47, and Sergeant Grimspike at 52,50.
// - "six_zero": player at the supplied 6:0 start marker 57,40, normal NPC spawns.
import { attack, command, equip, item, offensive, protect, special } from "./common.mjs";

const KIND = "general_graardor";
const BOSS = "general_graardor";

const crystalBowfaGear = {
  equipment: {
    head: 23971, // Crystal helm
    cape: item.avasAssembler,
    amulet: item.necklaceOfAnguish,
    weapon: item.bowOfFaerdhinen,
    body: 23975, // Crystal body
    legs: 23979, // Crystal legs
    hands: 7462, // Barrows gloves
    boots: item.pegasianBoots,
    ring: 19710, // Ring of suffering (i)
  },
  supplies: {
    equippedAmmo: { id: 22947 }, // Rada's blessing 4
    blowpipe: { id: item.dragonDart },
  },
};

const bigDoorTile = [47, 42];
const bandosAltarCenterTile = [54, 59];

// One 24-tick Altar-Door lap on x = 54:
// This is the existing scripted route, not proof of a damage-free game method:
// Red-X stalls only during overlap, so an exit shot can now allow retaliation.
//   cycleTick  0: at (54, 57) "Shoot->door", shoot Graardor
//   cycleTick  1: red-X click Big door (47, 42) to walk south under Graardor
//   cycleTick  4: at (54, 51) "D", shoot Graardor
//   cycleTick  5: move south to (54, 45) "D"
//   cycleTick  8: at (54, 45) "D", shoot Graardor
//   cycleTick  9: move south to (54, 42) "Shoot->altar"
//   cycleTick 12: at (54, 42) "Shoot->altar", shoot Graardor
//   cycleTick 13: red-X click Bandos altar (54, 59) to walk north under Graardor
//   cycleTick 16: at (54, 48) "A", shoot Graardor
//   cycleTick 17: move north to (54, 54) "A"
//   cycleTick 20: at (54, 54) "A", shoot Graardor
//   cycleTick 21: move north to (54, 57) "Shoot->door"
function stepAltarDoorCycle(tick, api) {
  const graardor = api.npcs().find((npc) => npc.id === BOSS);
  if (!graardor?.alive || graardor.death) {
    return;
  }
  const cycleTick = (tick - 1) % 24;
  switch (cycleTick) {
    case 0:
    case 4:
    case 8:
    case 12:
    case 16:
    case 20:
      attack(api, BOSS);
      break;
    case 1:
      attack(api, null);
      api.moveTo(...bigDoorTile);
      break;
    case 5:
      attack(api, null);
      api.moveTo(54, 45);
      break;
    case 9:
      attack(api, null);
      api.moveTo(54, 42);
      break;
    case 13:
      attack(api, null);
      api.moveTo(...bandosAltarCenterTile);
      break;
    case 17:
      attack(api, null);
      api.moveTo(54, 54);
      break;
    case 21:
      attack(api, null);
      api.moveTo(54, 57);
      break;
  }
}

export const scenarios = [
  {
    // OBS: user's region 11347 6:0 start marker; inferred: normal NPC spawns.
    // Exercises the new setup and replay without inventing a timed 6:0 cycle.
    name: "general-graardor/six-zero-start",
    kind: KIND,
    seed: 17,
    ticks: 30,
    mechanics: { graardorStartMode: "six_zero", infiniteHealth: true },
    ...crystalBowfaGear,
    script(tick, api) {
      if (tick === 1) attack(api, BOSS);
    },
  },
  {
    // Altar-Door kiting in the Crystal (Bow of faerdhinen) setup with Ring
    // of suffering (i) and Toxic blowpipe in inventory. Red-X clicking the Big
    // door at (54, 57) and the Bandos altar at (54, 42) stalls General Graardor
    // as the player passes under him; defeating Graardor completes the fight
    // while the three bodyguard minions are still alive.
    name: "general-graardor/altar-door-kill",
    kind: KIND,
    seed: 7,
    ticks: 260,
    mechanics: { graardorStartMode: "altar_door", infiniteHealth: true },
    ...crystalBowfaGear,
    inventory: [item.toxicBlowpipe, item.superRestore, item.superRestore],
    script(tick, api) {
      if (tick === 1) {
        protect(api, "ProtectMagic");
        offensive(api, "Rigour");
      }
      stepAltarDoorCycle(tick, api);
    },
  },
  {
    // Standard room entry (graardorStartMode: "standard_door"): player spawns at
    // the west Big door (48, 42) with General Graardor at his default spawn
    // (56, 47), runs onto the Altar-Door lane at (54, 42) -> (54, 57) while shooting
    // Graardor, and enters the Altar-Door cycle.
    name: "general-graardor/standard-door-entry",
    kind: KIND,
    seed: 11,
    ticks: 80,
    mechanics: { graardorStartMode: "standard_door", infiniteHealth: true },
    ...crystalBowfaGear,
    inventory: [item.toxicBlowpipe, item.superRestore],
    script(tick, api) {
      if (tick === 1) {
        protect(api, "ProtectMagic");
        offensive(api, "Rigour");
        api.moveTo(54, 42);
      }
      if (tick === 4) {
        attack(api, BOSS);
      }
      if (tick === 5) {
        attack(api, null);
        api.moveTo(...bandosAltarCenterTile);
      }
      if (tick === 8 || tick === 12) {
        attack(api, BOSS);
      }
      if (tick === 9) {
        attack(api, null);
        api.moveTo(54, 54);
      }
      if (tick === 13) {
        attack(api, null);
        api.moveTo(54, 57);
      }
      if (tick >= 17) {
        stepAltarDoorCycle(tick - 16, api);
      }
    },
  },
  {
    // Standing in melee range of General Graardor so he uses both his melee
    // crush and ranged shockwave attacks while the three minions attack,
    // testing the debug heal command, Ring of suffering (i) recoil, and
    // switching to the Toxic blowpipe for Toxic Siphon special attacks.
    name: "general-graardor/melee-and-blowpipe-tank",
    kind: KIND,
    seed: 13,
    ticks: 100,
    mechanics: { graardorStartMode: "altar_door", infiniteHealth: true },
    ...crystalBowfaGear,
    inventory: [item.toxicBlowpipe],
    script(tick, api) {
      if (tick === 1) {
        protect(api, "ProtectMelee");
        offensive(api, "Rigour");
        attack(api, BOSS);
      }
      if (tick === 20) {
        command(api, { encounter: KIND, type: "heal-graardor" });
        equip(api, 0, "weapon");
      }
      if (tick === 21 || tick === 35) {
        special(api);
        attack(api, BOSS);
      }
    },
  },
];
