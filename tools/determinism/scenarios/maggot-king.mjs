// The Maggot King (client/encounters/maggot-king/). The player's floor is x 24
// to 38, y 33 to 36; he stands north of it, far (y 39) or near (y 37). The
// snapshot tells what a player watches for: the style of the rotation, the
// screech (`screechAt`), what will land where and when (`incoming`: bile, a
// slam, piles and fragments of carrion), the bile and carrion on the floor.
// Each script decides from it and the tick alone.
import { attack, castOn, equip, item, magicGear, meleeGear, protect, rangedGear, setBossHp } from "./common.mjs";

const KIND = "maggot_king";
const BOSS = "maggot-king";
const floor = { minX: 24, maxX: 38, minY: 33, maxY: 36 };

const state = (api) => api.engine.getEncounterSnapshot().state;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const has = (tiles, tile) => (tiles ?? []).some((other) => same(other, tile));
const onFloor = ([x, y]) => x >= floor.minX && x <= floor.maxX && y >= floor.minY && y <= floor.maxY;

// The protection prayer the tick wants: none from 3 to 8 ticks into a
// screech, else the rotation's (Protect from Melee near).
function pray(api, tick) {
  const { screechAt, phase, style } = state(api);
  const screeching = screechAt !== null && tick >= screechAt + 3 && tick <= screechAt + 8;
  const wanted = screeching ? null : phase === "melee" ? "ProtectMelee" : style === "range" ? "ProtectRange" : "ProtectMagic";
  const current = api.player().activePrayer ?? null;
  if (current === wanted) return;
  if (wanted) protect(api, wanted);
  else if (current) protect(api, current);
}

// Off a tile something will land on (bile, a slam, a pile, a fragment), onto
// the nearest that is clear of all of them and of bile. True when it steps.
function dodge(api, tick) {
  const s = state(api);
  const position = api.player().position;
  // A landed larva leeches whoever stands under it: off it too.
  const larvae = api.npcs().filter((npc) => npc.npcTypeId === 15743 && !(npc.state?.landsAt > tick)).map((npc) => npc.position);
  const danger = [...s.incoming.filter((entry) => entry.landsAt >= tick).flatMap((entry) => entry.tiles), ...larvae];
  if (!has(danger, position)) return false;
  const bad = (tile) => !onFloor(tile) || has(danger, tile) || has(s.poisonBile, tile) || has(s.stickyBile, tile);
  for (let reach = 1; reach <= 4; reach++) {
    for (const dx of [-reach, reach, 0]) {
      for (const dy of [0, -1, 1]) {
        const tile = [position[0] + dx, position[1] + dy];
        if (bad(tile)) continue;
        if (api.player().attackTarget !== null) attack(api, null);
        api.moveTo(...tile);
        return true;
      }
    }
  }
  return false;
}

// A larva still in the air: a ranged weapon kills it at no cost to its timer.
const flyingLarva = (api, tick) => api.npcs().find((npc) => npc.npcTypeId === 15743 && npc.state?.landsAt > tick && !npc.state?.dying);

export const scenarios = [
  {
    // A Zaryte crossbow (heavy ranged) from the floor's middle row, praying
    // against each spit as it lands and not through a screech, stepping off
    // whatever will land on the player. A larva in the air is shot with the
    // bow of Faerdhinen (standard ranged: it dies at once). Infinite health:
    // the fight to its end, near rotations and the final one included.
    name: "maggot-king/crossbow-and-bow",
    kind: KIND,
    seed: 3,
    ticks: 720,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    equipment: { ...rangedGear.equipment, weapon: item.zaryteCrossbow },
    supplies: { equippedAmmo: { id: item.rubyDragonBoltsE } },
    inventory: [item.bowOfFaerdhinen],
    script(tick, api) {
      pray(api, tick);
      if (dodge(api, tick)) return;
      const larva = flyingLarva(api, tick);
      const weapon = larva ? item.bowOfFaerdhinen : item.zaryteCrossbow;
      if (api.player().equipment.weapon !== weapon) {
        const slot = api.player().inventory.findIndex((entry) => entry?.id === weapon);
        if (slot >= 0) equip(api, slot, "weapon");
      }
      const target = larva?.id ?? BOSS;
      if (api.player().attackTarget !== target) attack(api, target);
    },
  },
  {
    // Near at once (the boss at 990 hitpoints): the player stands two columns
    // off his middle, beside him and clear of the slams, and hits him with the
    // fang; a hit as a slam lands is a punish. Protect from Melee all the way.
    name: "maggot-king/near-punish",
    kind: KIND,
    seed: 5,
    ticks: 80,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...meleeGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 990);
      pray(api, tick);
      if (dodge(api, tick)) return;
      const boss = api.npcs().find((npc) => npc.id === BOSS);
      if (!boss || boss.position[1] !== 37) return;
      const spot = [boss.position[0], 36];
      if (!same(api.player().position, spot) && !state(api).slam) {
        if (api.player().attackTarget !== null) attack(api, null);
        api.moveTo(...spot);
        return;
      }
      if (api.player().attackTarget !== BOSS) attack(api, BOSS);
    },
  },
  {
    // Below a fifth (300): the first screech fills the room with four larvae.
    // The player shoots two down in the air and lets the others land; one of
    // them crawls under him and leeches him until he steps off.
    name: "maggot-king/larvae",
    kind: KIND,
    seed: 9,
    ticks: 90,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 300);
      pray(api, tick);
      const larvae = api.npcs().filter((npc) => npc.npcTypeId === 15743);
      const flying = flyingLarva(api, tick);
      if (flying && larvae.indexOf(flying) < 2) {
        if (api.player().attackTarget !== flying.id) attack(api, flying.id);
        return;
      }
      if (api.player().attackTarget !== null) attack(api, null);
      if (dodge(api, tick)) return;
    },
  },
  {
    // Fire Surge from the Harmonised Nightmare staff in ancestral: each
    // landing surge burns him and takes 20 off his Magic defence a stack. The
    // player keeps Protect from Missiles up through the first screech and is
    // hurt for it every tick of it.
    name: "maggot-king/fire-surge",
    kind: KIND,
    seed: 11,
    ticks: 60,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    equipment: { ...magicGear.equipment, weapon: 24423, shield: 20714 }, // Harmonised Nightmare staff, Tome of fire
    supplies: { runePouch: { kind: "divine", slots: [{ id: 554 }, { id: 556 }, { id: 21880 }] }, selectedSpell: "Fire Surge", spellbook: "standard" },
    script(tick, api) {
      if (tick === 1) protect(api, "ProtectRange");
      if (api.player().attackTarget !== BOSS) castOn(api, BOSS, "Fire Surge");
    },
  },
];
