// The Alchemical Hydra's ids and its chamber's tiles. The ids are the game
// cache's (revision 242), each with its gameval name; the tiles are local to
// map square 21,160 (region 5536), the Karuulm Slayer Dungeon's chamber that
// the instance copies, counted from its south-west corner (world 1344,10240).
// OBS (tsps) is RSPSApp's reading of the rsprox recordings 1000143, 1000471,
// 1000473, 1000480 and 1000497 (revision 227, 150+ kills; RSPSApp/tsps
// docs/alchemical-hydra.md and server/plugins/bosses/data/alchemical-hydra.json).
const worldOrigin = [21 * 64, 160 * 64];
export const fromWorld = ([x, y]) => [x - worldOrigin[0], y - worldOrigin[1]];

// CACHE: one NPC type a form. The gameval numbers do not follow the phases:
// hydraboss_4 is the electric form and hydraboss_2 the enraged one (the
// monster table's versions say the same).
export const npcTypeIds = {
  serpentine: 8615, // hydraboss
  toElectric: 8616, // hydraboss_p1_transition: the serpentine form losing a head
  toFlame: 8617, // hydraboss_p2_transition
  toEnraged: 8618, // hydraboss_p3_transition
  electric: 8619, // hydraboss_4
  flame: 8620, // hydraboss_3
  enraged: 8621, // hydraboss_2
  dead: 8622, // hydraboss_finaldeath: what is left of it, 3 ticks into its death
};
export const bossSize = 6; // CACHE, TABLE

// CACHE: the sequences of each form, by phase (0 serpentine, 1 electric, 2
// flame, 3 enraged). The enraged form has no special of its own: its poison
// is thrown with its ranged attack (OBS (tsps): 96 of 96).
export const seqIds = {
  idle: [8233, 8240, 8247, 8254], // hydra_stage_N_ready
  walk: [8232, 8239, 8246, 8253], // hydra_stage_N_walk
  ranged: [8235, 8242, 8249, 8256], // hydra_stage_N_attack_ranged
  magic: [8236, 8243, 8250, 8255], // hydra_stage_N_attack_magic
  special: [8234, 8241, 8248, 8256], // hydra_stage_N_attack_special
  switch: [9111, 9112, 9113], // hydra_stage_N_switch_attack: the heads sway back
  phaseOut: [8237, 8244, 8251], // hydra_stage_N_death: a head falls off
  phaseIn: [8238, 8245, 8252], // hydra_stage_N+1_spawn
  death: 8257, // hydra_stage_4_death: 90 cycles, 3 ticks
  finalDeath: 8258, // hydra_death: 208 cycles of its last form's 7 ticks
};

export const spotAnims = {
  magic: 1662, // hydraboss_magic_proj
  ranged: 1663, // hydraboss_ranged_proj
  poison: 1644, // hydraboss_pools_proj: a blob in the air
  poisonSplash: 1645, // hydraboss_pools_splash
  // hydraboss_pools_landing_<angle> and _landed_<angle>, by angle 0, 45 ... 315.
  poisonLanding: [1646, 1647, 1648, 1649, 1650, 1651, 1652, 1653],
  poisonLanded: [1654, 1655, 1656, 1657, 1658, 1659, 1660, 1661], // CACHE: its sequence 8287 lasts 480 cycles, 16 ticks
  lightningCaster: 1664, // hydraboss_lightning_caster
  lightning: 1665, // hydraboss_lightning_travel
  shock: 1666, // hydraboss_shockwave: a current on its tile
  fireTravel: 1667, // hydraboss_fire_travel
  fire: 1668, // hydraboss_fire: CACHE, its sequence 8187 lasts 1300 cycles, 43 ticks
};

// CACHE: the chamber's three vents (karuulm_hydra_room_floor_vent_geyser_*),
// and the sequences of an eruption: hydra_geyser (160 cycles) and
// hydra_geyser_off, which the map's vents stand in.
export const ventLocIds = { red: 34568, green: 34569, blue: 34570 };
export const geyserSeqIds = { erupt: 8279, off: 8280 };
// CACHE, OBS (tsps): the vents' tiles, red south-east, green north-east, blue north-west.
export const vents = {
  red: fromWorld([1371, 10263]),
  green: fromWorld([1371, 10272]),
  blue: fromWorld([1362, 10272]),
};

// OBS (tsps): where the Hydra stands when the player comes in, and where its
// flame special walks it back to (its south-west tile).
export const bossStart = fromWorld([1364, 10265]);
// OBS (tsps): the tile the Alchemical door puts the player on, beside it.
export const playerStart = fromWorld([1356, 10259]);
// OBS (tsps): every lightning caster lands here (152 of 152).
export const lightningCentre = fromWorld([1367, 10267]);
// OBS (tsps): the four currents start on a random tile of each of these 3 x 3
// blocks, one a quadrant (152 spreads): [[x from, x to], [y from, y to]].
export const currentBlocks = [
  [[1360, 1362], [10261, 10263]], [[1360, 1362], [10272, 10274]],
  [[1371, 1373], [10261, 10263]], [[1371, 1373], [10272, 10274]],
].map(([[x0, x1], [y0, y1]]) => [[x0 - worldOrigin[0], x1 - worldOrigin[0]], [y0 - worldOrigin[1], y1 - worldOrigin[1]]]);

// OBS (tsps): where each head launches from, from the Hydra's south-west
// tile, by the way it faces its target (one of eight). Magic comes from the
// head 45 degrees to its left, ranged from the one 45 degrees to its right.
export const heads = {
  N: { magic: [1, 4], ranged: [4, 4] },
  NE: { magic: [3, 5], ranged: [5, 3] },
  E: { magic: [4, 4], ranged: [4, 1] },
  SE: { magic: [5, 2], ranged: [3, 0] },
  S: { magic: [4, 1], ranged: [1, 1] },
  SW: { magic: [2, 0], ranged: [0, 2] },
  W: { magic: [1, 1], ranged: [1, 4] },
  NW: { magic: [0, 3], ranged: [2, 5] },
};

export const key = ([x, y]) => x + "," + y;
export const same = (a, b) => a[0] === b[0] && a[1] === b[1];
export const chebyshev = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
// Tiles between a tile and a footprint: 0 under it, 1 beside it.
export const gapTo = ([px, py], [x, y], size = bossSize) => Math.max(x - px, 0, px - (x + size - 1), y - py, py - (y + size - 1));
export function footprintTiles([x, y], size = bossSize) {
  const tiles = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) tiles.push([x + dx, y + dy]);
  return tiles;
}
