// The Hydra's poison, its serpentine and its enraged special: blobs thrown
// at the player and around them, which splash a 3 x 3 as they land and leave
// a pool on their own tile.
//
// Sources as in encounter.js.
import { spotAnims, key, same, chebyshev } from "./ids.js";

const blobs = 5; // OBS (tsps): five blobs, the first on the player's tile
// OBS (tsps): one enraged while the flame phase's fires stand (94 of 98), five
// once they are gone (53 of 55). WIKI: "nearly guaranteed if fires from the
// previous phase remain".
const blobsWhileFire = 1;
// The other blobs land on random tiles within this many of the player's
// (tsps, theirs: the recorded offsets run 1 to 7, mostly 3, with no pattern found).
const spread = 4;
// OBS (tsps): flights from cycle 30 to 60 + 10 a tile, from 40 high to 31.
const flight = { start: 30, base: 60, perTile: 10, startHeight: 40, endHeight: 31 };
const landTicks = 3; // OBS (tsps): the blob lands 3 ticks after the throw ...
const poolShowsAfter = 1; // ... and the pool shows a tick after that
// OBS (tsps): a pool hurts on each of the 13 ticks from the one it shows on
// (all 56 recorded ticks stood in hurt), never from the 14th.
const poolTicks = 13;
// OBS (tsps): a pool's ticks hit 2 to 7 (56 recorded). WIKI: "up to 12".
const poolDamage = [2, 7];
const splashMaxHit = 7; // WIKI: the blob's 3 x 3 splash
// WIKI: poison of 6 from the blob aimed at the player, 4 from another. The
// engine's poison hits ceil(severity / 5).
const poisonTargeted = 30;
const poisonNear = 20;
const sounds = { poison: 4135, landing: 3944 }; // OBS (tsps): at each blob's landing; the aimed blob's splash

export class Poison {
  constructor(encounter) {
    this.encounter = encounter;
    this.reset();
  }
  reset() {
    this.pools = []; // { tile, from, until, landed }
    this.incoming = []; // { tile, landsAt, aimed }
  }
  // The special: thrown from the head that faces the player's tile.
  throw(boss, player, context) {
    const encounter = this.encounter;
    const count = encounter.phase === 3 && encounter.fire.firesStand() ? blobsWhileFire : blobs;
    const centre = [...player.position];
    const tiles = [centre];
    const around = [];
    for (let dx = -spread; dx <= spread; dx++) {
      for (let dy = -spread; dy <= spread; dy++) {
        const tile = [centre[0] + dx, centre[1] + dy];
        if ((dx || dy) && encounter.isFloor(tile)) around.push(tile);
      }
    }
    while (tiles.length < count && around.length) tiles.push(around.splice(Math.floor(encounter.random() * around.length), 1)[0]);
    const from = encounter.launchTiles(boss, "ranged", centre, 1)[0];
    const projectiles = [];
    const graphics = [];
    const audio = [];
    tiles.forEach((tile, index) => {
      const end = flight.base + flight.perTile * chebyshev(from, tile);
      projectiles.push({
        spotAnimId: spotAnims.poison, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target: { kind: "tile", position: [...tile] },
        startDelayCycles: flight.start, endDelayCycles: end, slope: 0, startOffset: 0, startHeight: flight.startHeight, endHeight: flight.endHeight,
      });
      // OBS (tsps): the splash graphic and the sound, delayed to the landing.
      graphics.push({ spotAnimId: spotAnims.poisonSplash, target: { kind: "tile", position: [...tile] }, height: 0, delayCycles: end });
      audio.push({ id: sounds.poison, delayCycles: end, range: 5, position: [...tile] });
      const landsAt = context.tick + landTicks;
      this.incoming.push({ tile: [...tile], landsAt, aimed: index === 0 });
      encounter.later(landTicks, (ctx) => this.land(ctx, tile, index === 0), { outlivesIt: true });
    });
    encounter.visual(context, { projectiles, graphics, sounds: audio });
  }
  // As it lands: the 3 x 3 splash, and the pool on its own tile a tick later
  // (OBS (tsps): stood beside a fresh pool, players took nothing on 363 of 376 ticks).
  land(context, tile, aimed) {
    const encounter = this.encounter;
    this.incoming = this.incoming.filter((blob) => !(blob.landsAt <= context.tick && same(blob.tile, tile)));
    const angle = Math.floor(encounter.random() * 8); // inferred: which of the eight landing graphics
    encounter.visual(context, {
      graphics: [{ spotAnimId: spotAnims.poisonLanding[angle], target: { kind: "tile", position: [...tile] }, height: 0, delayCycles: 0, onGround: true }],
      sounds: aimed ? [{ id: sounds.landing, range: 2, position: [...tile] }] : [],
    });
    const player = context.world.getPlayer();
    if (player.alive && chebyshev(player.position, tile) <= 1) {
      encounter.hurt({ baseDamage: [0, splashMaxHit], source: "Poison", hitsplatType: "poison", applyPoison: aimed ? poisonTargeted : poisonNear });
    }
    const from = context.tick + poolShowsAfter;
    this.pools = this.pools.filter((pool) => !same(pool.tile, tile));
    this.pools.push({ tile: [...tile], from, until: from + poolTicks - 1 });
    encounter.later(poolShowsAfter, (ctx) => {
      if (!this.pools.some((pool) => same(pool.tile, tile) && pool.from === from)) return;
      encounter.visual(ctx, { graphics: [{ spotAnimId: spotAnims.poisonLanded[angle], target: { kind: "tile", position: [...tile] }, height: 0, delayCycles: 0, onGround: true }] });
    }, { outlivesIt: true });
  }
  // After the player has moved: a pool under him hurts.
  step(player, tick) {
    this.pools = this.pools.filter((pool) => tick <= pool.until);
    if (!player.alive || !this.pools.some((pool) => tick >= pool.from && same(pool.tile, player.position))) return [];
    return [{ baseDamage: poolDamage, source: "Poison pool", hitsplatType: "poison" }];
  }
  snapshot(tick) {
    return {
      pools: this.pools.filter((pool) => tick >= pool.from).map((pool) => ({ tile: [...pool.tile], until: pool.until })),
      poisonIncoming: this.incoming.map((blob) => ({ tile: [...blob.tile], landsAt: blob.landsAt })),
    };
  }
  poolTiles() {
    return new Set(this.pools.map((pool) => key(pool.tile)));
  }
}
