// The Maggot King's ids and his lair's tiles. The ids are the game cache's
// (revision 243, as RSPSApp/tsps docs/maggot-king.md lists them); OBS is the
// four kills of one player's Outside recordings (format 6, revision 243),
// which also give the tiles: local to map square 45,125 (region 11645), the
// square the instance copies whole.
export const npcTypeIds = {
  king: 15742, // CACHE "Maggot King", 5x5
  larva: 15743, // CACHE "Ur-maggot larvae"
};

export const seqIds = {
  idle: 13926, // CACHE, OBS: his stand
  walk: 13927, // CACHE, OBS: his walk
  ranged: 13933, // CACHE, OBS: the ranged spit
  magic: 13934, // CACHE, OBS: the magic spit
  screech: 13922, // CACHE, OBS
  slam: 13925, // CACHE, OBS: the head slam
  death: 13936, // OBS: a tick after his death
  larvaFlight: 13914, // CACHE, OBS: a larva in the air, from its spawn until it lands
  larvaIdle: 1270, // OBS: its stand
  larvaWalk: 1269, // OBS: its crawl
  larvaDeath: 1272, // OBS
};

export const spotAnims = {
  rangedSpit: 1792, // CACHE, OBS: the ranged spit, and its drops falling to the floor
  magicSpit: 3445, // CACHE, OBS: the magic one
  splat: 3999, // OBS: on the three tiles a spit splashes, as it lands
  screech: 3793, // CACHE, OBS: on him as he screeches
  roar: 3794, // CACHE, OBS: on him 3 ticks into a screech
  death: 3795, // CACHE, OBS: on him as he dies
  carrion: 3796, // CACHE, OBS: a pile of carrion thrown in from the north (4 ticks)
  fragment: 3797, // CACHE, OBS: a fragment of a pile (2 ticks)
  eat: 3799, // CACHE, OBS: a larva eating carrion
  shadow: 1447, // OBS: on a tile a pile will land on, as it is thrown
  debris: 3998, // OBS: on a tile something will land on 2 ticks later (a fragment, the slam)
  slamImpact: 2953, // OBS: on the slam's twelve tiles as it lands
};

// CACHE, OBS: what lies on the floor.
export const locIds = {
  poisonBile: 33423, // "Poisonous bile"
  stickyBile: 33424, // "Sticky bile"
  carrion: 33425, // "Carrion"
};

// CACHE (tsps), OBS: the player's floor, 15 x 4, south of the row of bones at
// y 37 that blocks the way north and lets projectiles through.
export const floor = { minX: 24, maxX: 38, minY: 33, maxY: 36 };
export const bossSize = 5; // CACHE
// OBS: his south-west tile. Far, he stands with y 39 and x from 26 to 32
// (centre 28 to 34); near, on the bones, with y 37 and x from 24 to 34.
export const farY = 39;
export const nearY = 37;
export const farX = { min: 26, max: 32 };
export const nearX = { min: 24, max: 34 };
// OBS: where his first tick of the four recordings had him (28 to 31), in the middle.
export const bossStart = [29, farY];
// OBS: the player's tile as the first of the four recordings starts (beside
// the lair's entrance, the trees at 30,28).
export const playerStart = [31, 33];

export const onFloor = ([x, y]) => x >= floor.minX && x <= floor.maxX && y >= floor.minY && y <= floor.maxY;
export const key = ([x, y]) => x + "," + y;
export const unkey = (text) => text.split(",").map(Number);
export const centreX = (boss) => boss.position[0] + (bossSize >> 1);
