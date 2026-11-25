// The Leviathan (client/encounters/leviathan/). It lies at 30,33 (7 x 7) in
// the pool, which is blocked from 29,32 to 37,40 but for its corners; the
// player starts at 24,34, west of it. The snapshot tells the orbs on their way
// (`orbs`, each with its style and the tick it lands) and the rocks on theirs
// (`falling`), which is what a player watches for.
import { attack, castOn, protect, rangedGear, setBossHp } from "./common.mjs";

const KIND = "leviathan";
const BOSS = "leviathan";
const prayerFor = { magic: "ProtectMagic", range: "ProtectRange", melee: "ProtectMelee" };
const rune = { air: 556, death: 560, blood: 565, soul: 566 };
const shadowRunes = { spellbook: "ancient", runePouch: { kind: "divine", slots: [{ id: rune.blood }, { id: rune.death }, { id: rune.soul }] } };

const state = (api) => api.engine.getEncounterSnapshot().state;
const at = (tile, [x, y]) => tile[0] === x && tile[1] === y;

// The protection prayer for the orb that lands this tick (the prayer counts as
// it lands), set before the tick; if none lands, the one for the next orb.
function prayAgainstOrbs(api, tick) {
  const orbs = [...state(api).orbs].sort((a, b) => a.lands - b.lands);
  const orb = orbs.find((o) => o.lands >= tick);
  const wanted = orb && prayerFor[orb.style];
  if (wanted && api.player().activePrayer !== wanted) protect(api, wanted);
}

// Off a tile a rock will land on, to the first open tile beside it among
// these (west of the pool, clear of its edge).
function dodgeRocks(api, spots) {
  const { falling, rubble } = state(api);
  const position = api.player().position;
  if (!falling.some(({ tile }) => at(tile, position))) return false;
  const taken = (tile) => falling.some((rock) => at(rock.tile, tile)) || rubble.some((rock) => at(rock, tile));
  const spot = spots.find((tile) => !taken(tile) && Math.max(Math.abs(tile[0] - position[0]), Math.abs(tile[1] - position[1])) <= 2);
  if (!spot) return false;
  if (api.player().attackTarget !== null) attack(api, null);
  api.moveTo(...spot);
  return true;
}
const westSpots = [24, 25, 26].flatMap((x) => [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41].map((y) => [x, y]));

export const scenarios = [
  {
    // Twisted bow from the west of the pool, praying against every orb as it
    // lands and stepping off every rock: the first five volleys, their roars and
    // rocks, and the first roar's two that tell the special.
    name: "leviathan/volleys",
    kind: KIND,
    seed: 3,
    ticks: 130,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      prayAgainstOrbs(api, tick);
      if (dodgeRocks(api, westSpots)) return;
      if (api.player().attackTarget !== BOSS) attack(api, BOSS);
    },
  },
  {
    // A shadow barrage stuns it; the player walks round to its back and shoots
    // it there, which wakes it with its first special, the smoke. Back to the
    // west, a second stun and a second shot in the back: the lightning, which
    // the player outruns by walking up and down beside the arena's wall.
    // Infinite health: what still hits lands where it may.
    name: "leviathan/stun-and-back",
    kind: KIND,
    seed: 5,
    ticks: 160,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    supplies: { ...rangedGear.supplies, ...shadowRunes },
    inventory: [rune.air],
    script(tick, api) {
      const { stunnedUntil, special, rubble } = state(api);
      const [x, y] = api.player().position;
      if (tick === 6 || tick === 76) castOn(api, BOSS, "Shadow Barrage");
      if (tick === 50) {
        attack(api, null);
        api.moveTo(24, 34);
      }
      // Stunned facing the player, who is west of it: its back is east of the
      // pool, as wide as the pool (x 37 on, y 32 to 40).
      if (stunnedUntil !== null && !(x >= 37 && y >= 32 && y <= 40)) {
        if (api.player().attackTarget !== null) attack(api, null);
        const free = [36, 35, 37, 34, 38].map((ty) => [39, ty]).find((tile) => !rubble.some((rock) => at(rock, tile)));
        api.moveTo(...free);
        return;
      }
      if (stunnedUntil !== null && api.player().attackTarget !== BOSS) attack(api, BOSS);
      if (special?.kind === "lightning") {
        if (api.player().attackTarget !== null) attack(api, null);
        api.moveTo(43, tick % 8 < 4 ? 34 : 38);
      }
      if (special) prayAgainstOrbs(api, tick);
    },
  },
  {
    // Into the enrage at once: the roar, orbs every 2 ticks, rocks every 8, the
    // pathfinder from the north-west going clockwise. The player keeps to its
    // middle and shoots until the Leviathan dies.
    name: "leviathan/enrage-and-kill",
    kind: KIND,
    seed: 7,
    ticks: 150,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 260);
      prayAgainstOrbs(api, tick);
      const pathfinder = api.npcs().find((npc) => npc.id === "abyssal-pathfinder");
      if (pathfinder) {
        const middle = [pathfinder.position[0] + 1, pathfinder.position[1] + 1];
        const [px, py] = api.player().position;
        if (Math.max(Math.abs(px - middle[0]), Math.abs(py - middle[1])) > 1) {
          if (api.player().attackTarget !== null) attack(api, null);
          api.moveTo(...middle);
          return;
        }
      }
      if (api.player().attackTarget !== BOSS) attack(api, BOSS);
    },
  },
  {
    // Beside the pool: one bite early, then orbs until the third roar, then a
    // bite on some of its turns, the volleys and roars going on.
    name: "leviathan/bites",
    kind: KIND,
    seed: 9,
    ticks: 130, // past the fourth volley's roar
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(28, 36);
      if (tick === 1) protect(api, "ProtectMelee");
    },
  },
];
