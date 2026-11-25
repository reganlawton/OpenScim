// The Alchemical Hydra (client/encounters/alchemical-hydra/). Its chamber's
// floor is x 12 to 33, y 17 to 38 (the corners cut); it starts with its
// south-west tile on 20,25 and the player at the door, on 12,19. The vents
// are red 27,23, green 27,32 and blue 18,32. The snapshot tells what a player
// watches for: its phase, its shield, the style of its last attack and how
// many of that style, the vents, the blobs in the air and the pools, the
// currents, the fires and the walls of its flame special. Each script decides
// from it and the tick alone.
import { attack, boss, meleeGear, protect, rangedGear, setBossHp, special } from "./common.mjs";
import { vents, gapTo, footprintTiles, chebyshev } from "../../../client/encounters/alchemical-hydra/ids.js";

const KIND = "alchemical_hydra";
const BOSS = "alchemical-hydra";
const health = { infiniteHealth: true, infinitePrayer: true };

const state = (api) => api.engine.getEncounterSnapshot().state;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const has = (tiles, tile) => tiles.some((other) => same(other, tile));
// The chamber's floor (the arena the map builds).
const room = ([x, y]) => (y >= 19 && y <= 36 && x >= 12 && x <= 33) || ((y === 17 || y === 18) && x >= 12 && x <= 31) || ((y === 37 || y === 38) && x >= 14 && x <= 31);
const other = (style) => (style === "range" ? "magic" : "range");
const hydra = (api) => boss(api);

// The protection prayer against the hit in the air, else against its next attack.
function pray(api, tick) {
  const s = state(api);
  const inAir = (api.engine.worldState.pendingHits ?? [])
    .filter((hit) => hit.sourceId === BOSS && hit.targetId === "player" && hit.impactTick >= tick)
    .sort((a, b) => a.impactTick - b.impactTick)[0];
  const style = inAir?.style ?? (s.phase === "enraged" || s.basics >= 3 ? other(s.style) : s.style);
  const wanted = style === "magic" ? "ProtectMagic" : "ProtectRange";
  if (api.player().activePrayer !== wanted) protect(api, wanted);
}
function shoot(api) {
  const target = hydra(api);
  if (target && !state(api).changing && api.player().attackTarget !== BOSS) attack(api, BOSS);
}
function walk(api, tile) {
  if (api.player().attackTarget !== null) attack(api, null);
  api.moveTo(...tile);
}

// Where it stops walking towards a player on `tile` (encounter.js, moveBoss):
// a step a tick, diagonal first, until the player is within 4 of it.
function walkEnd(from, tile) {
  let at = [...from];
  for (let n = 0; n < 40 && gapTo(tile, at) > 4; n++) {
    const dx = tile[0] < at[0] ? -1 : tile[0] > at[0] + 5 ? 1 : 0;
    const dy = tile[1] < at[1] ? -1 : tile[1] > at[1] + 5 ? 1 : 0;
    const step = [[at[0] + dx, at[1] + dy], [at[0] + dx, at[1]], [at[0], at[1] + dy]].find((to) => !same(to, at) && footprintTiles(to).every(room));
    if (!step) break;
    at = step;
  }
  return at;
}
// The nearest tile that draws it over a vent, off every danger.
function lureTile(api, vent, danger) {
  const from = hydra(api).position;
  const me = api.player().position;
  let best = null;
  for (let x = 12; x <= 33; x++) {
    for (let y = 17; y <= 38; y++) {
      const tile = [x, y];
      if (!room(tile) || has(danger, tile) || gapTo(tile, from) <= 4) continue;
      const end = walkEnd(from, tile);
      if (gapTo(vent, end) !== 0 || gapTo(tile, end) === 0) continue;
      if (!best || chebyshev(me, tile) < chebyshev(me, best)) best = tile;
    }
  }
  return best;
}

// What will hurt on a tile soon: the 3 x 3 of a blob landing in 2 ticks or
// fewer, the pools, the tiles around a current, the fires and the tiles
// around a tracking fire.
function dangerTiles(api, tick) {
  const s = state(api);
  const tiles = [];
  const around = ([x, y], reach) => {
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) tiles.push([x + dx, y + dy]);
  };
  for (const blob of s.poisonIncoming) if (blob.landsAt - tick <= 2) around(blob.tile, 1);
  for (const pool of s.pools) tiles.push(pool.tile);
  for (const current of s.currents) around(current, 2);
  for (const flame of s.flames) if (flame.activeAt - tick <= 2) tiles.push(flame.tile);
  for (const tracker of s.trackers) around(tracker, 1);
  return tiles;
}
// Off a dangerous tile, onto the nearest safe one, not under it. True when it steps.
function dodge(api, tick) {
  if (state(api).bound) return false;
  const danger = dangerTiles(api, tick);
  const me = api.player().position;
  if (!has(danger, me)) return false;
  const under = hydra(api)?.position;
  for (let reach = 1; reach <= 5; reach++) {
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const tile = [me[0] + dx, me[1] + dy];
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach || !room(tile) || has(danger, tile) || (under && gapTo(tile, under) === 0)) continue;
        walk(api, tile);
        return true;
      }
    }
  }
  return false;
}

// A player who prays against every attack, steps off what will hurt, and
// while it is shielded draws it over the vent that weakens it.
function fight(tick, api) {
  pray(api, tick);
  if (dodge(api, tick)) return;
  const s = state(api);
  const target = hydra(api);
  if (target && s.shielded && !s.changing && !s.fireSpecial && gapTo(vents[s.weakeningVent], target.position) !== 0) {
    const tile = lureTile(api, vents[s.weakeningVent], dangerTiles(api, tick));
    if (tile && !same(tile, api.player().position)) {
      walk(api, tile);
      return;
    }
  }
  shoot(api);
}

export const scenarios = [
  {
    // The whole fight with a twisted bow: the right prayer for every attack,
    // off every blob, pool, current and fire it sees coming, and each shield
    // taken by the vent of its phase. Infinite health: to its end.
    name: "alchemical-hydra/kill",
    kind: KIND,
    seed: 2,
    ticks: 900,
    mechanics: health,
    ...rangedGear,
    script: fight,
  },
  {
    // The player stands where he came in and shoots; it walks up to 4 tiles
    // of him and stays, over no vent: shielded all the way. No prayer.
    name: "alchemical-hydra/standing",
    kind: KIND,
    seed: 4,
    ticks: 130,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      shoot(api);
    },
  },
  {
    // The serpentine form drawn over the green vent first (empowered at each
    // eruption it stands over it), then over the red one (weakened).
    name: "alchemical-hydra/vents",
    kind: KIND,
    seed: 6,
    ticks: 90,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      pray(api, tick);
      const target = hydra(api);
      const vent = tick < 40 ? vents.green : vents.red;
      if (state(api).shielded && gapTo(vent, target.position) !== 0) {
        const tile = lureTile(api, vent, []);
        if (tile && !same(tile, api.player().position)) return walk(api, tile);
      }
      shoot(api);
    },
  },
  {
    // Killed (its hitpoints set to 1, the player shooting) with its first poison in the air: the blobs land all the same,
    // and the player stands in the pool to the end.
    name: "alchemical-hydra/poison-after-death",
    kind: KIND,
    seed: 20,
    ticks: 60,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.act({ type: "applyBossHpPreset", hp: 275 });
      if (state(api).poisonIncoming.length && hydra(api)?.vitals.hp > 1) setBossHp(api, 1);
      shoot(api);
    },
  },
  {
    // Two Bandos godsword specials on its shield.
    name: "alchemical-hydra/drain",
    kind: KIND,
    seed: 18,
    ticks: 25,
    mechanics: health,
    equipment: { ...meleeGear.equipment, weapon: 11804, shield: undefined },
    script(tick, api) {
      pray(api, tick);
      if (tick === 1 || tick === 14) special(api);
      shoot(api);
    },
  },
  {
    // The electric form (the preset), the player standing still: a current
    // reaches him and binds him. He clicks to walk away as it does, and moves
    // when the bind is over.
    name: "alchemical-hydra/lightning",
    kind: KIND,
    seed: 8,
    ticks: 50,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.act({ type: "applyBossHpPreset", hp: 825 });
      pray(api, tick);
      const s = state(api);
      if (s.bound) return walk(api, [12, 30]);
      if (!same(api.player().position, [12, 19])) return walk(api, [12, 19]);
      shoot(api);
    },
  },
  {
    // The flame form (the preset). The player keeps north-west of its middle
    // and shoots; it walks back to the middle, turns solid, stuns him (he
    // clicks away, and stays), breathes its walls north and west of him and
    // then the tracking fire, which catches him: scorched and burnt.
    name: "alchemical-hydra/fire",
    kind: KIND,
    seed: 10,
    ticks: 70,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.act({ type: "applyBossHpPreset", hp: 550 });
      pray(api, tick);
      const s = state(api);
      if (s.bound) return walk(api, [12, 38 - 2]);
      if (tick < 6 && !same(api.player().position, [15, 33])) return walk(api, [15, 33]);
      shoot(api);
    },
  },
  {
    // The flame form, the player under its middle: it steps out from under
    // him, and its flame special walks it back over him, which pushes him out.
    // He then clicks a tile on the other side of it, and walks round its blockers.
    name: "alchemical-hydra/push-out",
    kind: KIND,
    seed: 12,
    ticks: 60,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.act({ type: "applyBossHpPreset", hp: 550 });
      pray(api, tick);
      const s = state(api);
      if (s.blocked.length && !s.bound) return walk(api, [30, 22]);
      if (!s.fireSpecial && !s.blocked.length && !same(api.player().position, [23, 28])) return walk(api, [23, 28]);
      shoot(api);
    },
  },
  {
    // Its forms one after the other, by hitpoints set just above each
    // threshold: the player's hits take it past them. Into the enraged form
    // while the flame phase's fires stand: its first poison is one blob. He
    // keeps clicking it as it changes form, and is refused.
    name: "alchemical-hydra/phases",
    kind: KIND,
    seed: 14,
    ticks: 110,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      const s = state(api);
      if (tick === 1) setBossHp(api, 826);
      if (s.phase === "electric" && !s.changing && hydra(api).vitals.hp > 551) setBossHp(api, 551);
      if (s.phase === "flame" && s.blocked.length && s.fireSpecial === null && hydra(api).vitals.hp > 276) setBossHp(api, 276);
      pray(api, tick);
      if (s.changing) attack(api, BOSS);
      shoot(api);
    },
  },
  {
    // The enraged form (the preset) shot down with the right prayer for each
    // attack, from where the player came in.
    name: "alchemical-hydra/enraged",
    kind: KIND,
    seed: 16,
    ticks: 120,
    mechanics: health,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.act({ type: "applyBossHpPreset", hp: 275 });
      pray(api, tick);
      if (dodge(api, tick)) return;
      shoot(api);
    },
  },
];
