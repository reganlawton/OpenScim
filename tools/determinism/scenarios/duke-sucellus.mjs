// Duke Sucellus (client/encounters/duke-sucellus/). He sits at 28,52 (7 x 7)
// at the north end of the asylum and never moves; the player starts at
// 31,40. A click on him has the player run up to him, which wakes him two ticks
// later. Pillars stand beside him at 25..27,52 and 35..37,52, so 27,51 and 35,51
// are behind them and diagonal to him.
import { attack, item, meleeGear, offensive, protect, rangedGear, setBossHp } from "./common.mjs";

const KIND = "duke_sucellus";
const BOSS = "duke-sucellus";
const hides = [[27, 51], [35, 51]];

// Slash: his defence against it is +45, against stab +255.
const scytheGear = { equipment: { ...meleeGear.equipment, weapon: item.scytheOfVitur, shield: undefined } };

// A tile the gas covers now or will once it has risen.
const gassed = (state, [x, y]) => state.gas.some(({ vent: [vx, vy] }) => Math.abs(x - vx) <= 1 && Math.abs(y - vy) <= 1);

// The wiki's way: fight from in front of him, and while his gaze is up or the
// gas is on the player's tile, stand behind the pillar the gas is not on.
function fightFromThePillars(api) {
  const state = api.engine.getEncounterSnapshot().state;
  const player = api.player();
  if (state.gaze || gassed(state, player.position)) {
    const hide = hides.find((tile) => !gassed(state, tile)) ?? hides[0];
    if (player.position[0] !== hide[0] || player.position[1] !== hide[1]) {
      if (player.attackTarget !== null) attack(api, null);
      api.moveTo(...hide);
    }
    return;
  }
  if (player.attackTarget !== BOSS) attack(api, BOSS);
}

export const scenarios = [
  {
    // Melee under Protect from Melee and Piety, behind a pillar for every gaze
    // and out of the gas: icicles and slams, gazes avoided, one spit and then
    // two, the enrage, and his death.
    name: "duke-sucellus/kill",
    kind: KIND,
    seed: 4,
    ticks: 500,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) protect(api, "ProtectMelee");
      if (tick === 1) offensive(api, "Piety");
      if (tick >= 1) fightFromThePillars(api);
    },
  },
  {
    // The awakened fight below 76% of his hitpoints, the player standing away
    // from him under Protect from Magic: magic halved, every gaze and every
    // one of the four spits of gas on him.
    name: "duke-sucellus/awakened-standing",
    kind: "duke_sucellus_awakened",
    seed: 6,
    ticks: 160,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 1000);
      if (tick === 1) protect(api, "ProtectMagic");
      if (tick === 1) attack(api, BOSS);
      if (tick === 8) attack(api, null);
      if (tick === 8) api.moveTo(31, 47);
    },
  },
  {
    // Clicked on every tick from beside him: nothing lands before the tick after
    // he wakes.
    name: "duke-sucellus/wake-beside",
    kind: KIND,
    seed: 12,
    ticks: 40,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(31, 51);
      if (tick >= 15) attack(api, BOSS);
    },
  },
  {
    // Clicked on every tick with a bow: no arrow until he is awake, and then from
    // where he was woken from.
    name: "duke-sucellus/wake-ranged",
    kind: KIND,
    seed: 14,
    ticks: 30,
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      attack(api, BOSS);
    },
  },
  {
    // Never clicked on: he sleeps through it, the player walking about and
    // standing beside him.
    name: "duke-sucellus/asleep",
    kind: KIND,
    seed: 8,
    ticks: 60,
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(31, 51);
      if (tick === 30) api.moveTo(34, 46);
    },
  },
];
