// The Hydra's lightning, its electric special: a ball of electricity onto
// the middle of the chamber, which splits into four currents, one from each
// quadrant, that close in on the player a tile a tick. One that reaches the
// player hurts and binds them, and is gone.
//
// Sources as in encounter.js.
import { spotAnims, lightningCentre, currentBlocks, same, chebyshev } from "./ids.js";

// OBS (tsps): the caster flies from cycle 30 to 40 + 5 a tile, 40 high to 63,
// and shows on its tile 255 high.
const caster = { start: 30, base: 40, perTile: 5, startHeight: 40, endHeight: 63, height: 255 };
const spreadTicks = 3; // OBS (tsps): the currents leave the ball 3 ticks after the cast ...
// ... the n-th flying from cycle 15 + 30n to 30 + 30n, 63 high to the floor,
// and showing on its tile from the tick after its flight (OBS (tsps)).
const currentFlight = (n) => ({ start: 15 + 30 * n, end: 30 + 30 * n });
// OBS (tsps): a current shows on its tile for 12 ticks (231 currents). WIKI:
// "the lightning doesn't despawn".
const lifetime = 12;
// OBS (tsps): its hits are 8 to 17. WIKI: up to 22.
const damage = [8, 17];
// OBS (tsps): a player hit on a tick first moved 3 ticks later (24 of 24).
// WIKI: it binds.
const bindTicks = 3;
// OBS (tsps): the message, in red.
const paralysed = { text: "The electricity temporarily paralyzes you!", color: "#ff0000" };
const shockSound = 3887; // OBS (tsps): on the current's tile each tick, range 3

export class Lightning {
  constructor(encounter) {
    this.encounter = encounter;
    this.reset();
  }
  reset() {
    this.currents = []; // { tile, from, shown }
    this.spreadAt = null;
  }
  active() {
    return this.currents.length > 0 || this.spreadAt !== null;
  }
  // The special: the caster from the head that faces the middle.
  cast(boss, context) {
    const encounter = this.encounter;
    const from = encounter.launchTiles(boss, "magic", lightningCentre, 1)[0];
    const end = caster.base + caster.perTile * chebyshev(from, lightningCentre);
    encounter.visual(context, {
      projectiles: [{
        spotAnimId: spotAnims.lightningCaster, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target: { kind: "tile", position: [...lightningCentre] },
        startDelayCycles: caster.start, endDelayCycles: end, slope: 0, startOffset: 0, startHeight: caster.startHeight, endHeight: caster.endHeight,
      }],
      graphics: [{ spotAnimId: spotAnims.lightningCaster, target: { kind: "tile", position: [...lightningCentre] }, height: caster.height, delayCycles: end }],
    });
    this.spreadAt = context.tick + spreadTicks;
    const epoch = encounter.epoch;
    encounter.later(spreadTicks, (ctx) => {
      if (encounter.epoch === epoch) this.spread(ctx);
    });
  }
  // One current to a random tile of each quadrant's block, in a random order.
  spread(context) {
    const encounter = this.encounter;
    this.spreadAt = null;
    const blocks = [...currentBlocks];
    const projectiles = [];
    for (let n = 0; blocks.length; n++) {
      const [[x0, x1], [y0, y1]] = blocks.splice(Math.floor(encounter.random() * blocks.length), 1)[0];
      const tile = [encounter.randomInt(x0, x1), encounter.randomInt(y0, y1)];
      const { start, end } = currentFlight(n);
      projectiles.push({
        spotAnimId: spotAnims.lightning, sourcePosition: [lightningCentre[0] + 0.5, lightningCentre[1] + 0.5], target: { kind: "tile", position: [...tile] },
        startDelayCycles: start, endDelayCycles: end, slope: 0, startOffset: 0, startHeight: caster.endHeight, endHeight: 0,
      });
      this.currents.push({ tile, from: context.tick + 1 + n, shown: 0 });
    }
    encounter.visual(context, { projectiles });
  }
  // After the player has moved: each current that is out steps a tile
  // towards him (not on the tick it first shows), shows, and hits him if it
  // is on his tile.
  step(player, context) {
    const encounter = this.encounter;
    const hits = [];
    const graphics = [];
    const sounds = [];
    const left = [];
    for (const current of this.currents) {
      if (context.tick < current.from) {
        left.push(current);
        continue;
      }
      if (current.shown > 0) {
        current.tile = [current.tile[0] + Math.sign(player.position[0] - current.tile[0]), current.tile[1] + Math.sign(player.position[1] - current.tile[1])];
      }
      current.shown++;
      graphics.push({ spotAnimId: spotAnims.shock, target: { kind: "tile", position: [...current.tile] }, height: 0, delayCycles: 0 });
      sounds.push({ id: shockSound, range: 3, position: [...current.tile] });
      if (player.alive && same(current.tile, player.position)) {
        hits.push({ baseDamage: damage, source: "Lightning" });
        encounter.message(context, paralysed);
        encounter.bind(context.tick, bindTicks);
        continue;
      }
      if (current.shown < lifetime) left.push(current);
    }
    this.currents = left;
    if (graphics.length) encounter.visual(context, { graphics, sounds });
    return hits;
  }
  snapshot(tick) {
    return {
      currents: this.currents.filter((current) => tick >= current.from).map((current) => [...current.tile]),
      lightningIncoming: this.spreadAt !== null || this.currents.some((current) => tick < current.from),
    };
  }
}
