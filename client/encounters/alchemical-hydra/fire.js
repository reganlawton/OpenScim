// The Hydra's fire, its flame special: it walks back to the middle of the
// chamber and turns solid, stuns the player, breathes a wall of fire out of
// either side of the player's diagonal, then a fire down the diagonal that
// follows the player. A fire that catches the player scorches them and
// leaves a burn.
//
// Sources as in encounter.js.
import { spotAnims, bossSize, bossStart, footprintTiles, key, same, chebyshev, gapTo } from "./ids.js";

// Compass steps, and the two sides of each diagonal: clockwise first, then
// counter-clockwise (OBS (tsps): north then west from the north-west, east
// then north from the north-east, 83 of 83). None was recorded from the
// south: the same rule is followed there (tsps, theirs).
const steps = { N: [0, 1], NE: [1, 1], E: [1, 0], SE: [1, -1], S: [0, -1], SW: [-1, -1], W: [-1, 0], NW: [-1, 1] };
const sides = { NW: ["N", "W"], NE: ["E", "N"], SE: ["S", "E"], SW: ["W", "S"] };

const walkTicksMax = 15; // tsps, theirs: a walk that cannot end breathes where it stands; no recording has one
const stunAfter = 1; // OBS (tsps): the stun a tick after it is solid (104 of 104)
const stunTicks = 7; // OBS (tsps): a stunned player first moved 7 or more ticks later. WIKI: the player can still attack
const breathEvery = 3; // OBS (tsps): the breaths 3, 6 and 9 ticks after it is solid
const nextAttackAfter = 12; // OBS (tsps): every run the phase did not cut short. WIKI: "roughly seven ticks"
const blockerTicks = 56; // OBS (tsps): the blockers stand 56 ticks (30 of 70 runs; the rest were cut short)
// OBS (tsps): each wall is 4 wide (the footprint's inner four rows or
// columns) and 8 long out of its side (83 runs; WIKI: "a 5x5 layer of fire"),
// its fire 45 + 5 cycles a tile from the side.
const wall = { width: 4, length: 8, first: 45, perTile: 5 };
// OBS (tsps): the fire flies from footprint tile (+1, +4) onto the wall's
// first row and the tracking fire's first tile, from cycle 30 to 45, 35 high to the floor.
const travel = { from: [1, 4], start: 30, end: 45, startHeight: 35, endHeight: 0 };
const trackTicks = 11; // OBS (tsps): it follows the player for up to 11 ticks
// The tracking fire takes two steps a tick when the player is more than 2
// tiles off, one otherwise (tsps, theirs: OBS shows steps 15 or 30 and more
// cycles apart; WIKI: "faster the further away they are"), its fire 60 + 15
// cycles a step (OBS (tsps)).
const trackFast = 2;
const trackFire = (step) => 60 + 15 * step;
// CACHE: hydraboss_fire's sequence lasts 1300 cycles. inferred: a fire burns
// as long as it shows.
const fireLastsCycles = 1300;
// OBS (tsps): a scorch hits 9 to 17. WIKI: up to 25.
const scorchDamage = [9, 17];
// WIKI: then a burn of 5, five times; OBS (tsps): 5 ticks apart.
const burn = { damage: 5, hits: 5, every: 5 };
const messages = {
  stunned: "The Alchemical Hydra temporarily stuns you.",
  scorched: "The fire scorches you leaving a lingering burn...",
  burning: "You continue to suffer from the burn.",
  cleared: "The burn clears up.",
}; // OBS (tsps)
const sounds = { fire: 4099, tracking: 4133 }; // OBS (tsps): a row's, range 15 for the first and 10 after; the tracking fire's, range 15

export class Fire {
  constructor(encounter) {
    this.encounter = encounter;
    this.reset();
  }
  reset() {
    this.special = null; // { stage: "walk" | "breath", since, diagonal, releaseAt }
    this.flames = []; // { tile, activeAt, until }
    this.trackers = []; // { tile, until }
    this.blocked = null; // { tiles, until }
    this.burn = null; // { since, hits }
    this.pushOut = false;
    this.lastPlayerTile = null;
  }
  busy(tick) {
    return this.special !== null && !(this.special.releaseAt !== undefined && tick >= this.special.releaseAt);
  }
  walking() {
    return this.special?.stage === "walk";
  }
  firesStand(tick = this.encounter.now) {
    return this.blocked !== null && tick < this.blocked.until;
  }
  start(context) {
    this.special = { stage: "walk", since: context.tick };
  }
  // A step back to its spawn tile, diagonal first; a player in the way does not stop it (OBS (tsps), WIKI).
  walkStep(boss) {
    const [x, y] = boss.position;
    const dx = Math.sign(bossStart[0] - x);
    const dy = Math.sign(bossStart[1] - y);
    if (!dx && !dy) return [];
    const step = [[x + dx, y + dy], [x + dx, y], [x, y + dy]].find((to) => !same(to, boss.position) && this.encounter.canStand(to));
    return step ? [{ npcId: boss.id, path: [step] }] : [];
  }
  // Its turn while the special runs.
  turn(boss, context) {
    const special = this.special;
    const tick = context.tick;
    const player = context.world.getPlayer();
    if (special.stage === "walk") {
      if (tick === special.since || (!same(boss.position, bossStart) && tick - special.since < walkTicksMax)) return;
      // OBS (tsps): the walls go to the sides of the player's diagonal as it arrives.
      this.special = { stage: "breath", since: tick, diagonal: this.diagonalTo(boss, player.position) };
      this.block(boss, context, player);
      return;
    }
    const k = tick - special.since;
    const [first, second] = sides[special.diagonal];
    if (k === stunAfter && player.alive) {
      this.encounter.message(context, messages.stunned);
      this.encounter.bind(tick, stunTicks);
    } else if (k === breathEvery) this.breath(boss, context, first);
    else if (k === breathEvery * 2) this.breath(boss, context, second);
    else if (k === breathEvery * 3) {
      this.tracking(boss, context, special.diagonal);
      special.releaseAt = tick + nextAttackAfter;
      this.encounter.nextAttackAt = special.releaseAt;
    }
    if (special.releaseAt !== undefined && tick + 1 >= special.releaseAt) {
      this.special = null;
      boss.combat.targetId = "player";
    }
  }
  // The player's diagonal from its footprint's middle.
  diagonalTo(boss, [px, py]) {
    const half = (bossSize - 1) / 2;
    return (py >= boss.position[1] + half ? "N" : "S") + (px >= boss.position[0] + half ? "E" : "W");
  }
  // Solid while its fires stand: its footprint blocked where it stands now
  // (OBS (tsps): the blockers stay on those tiles, wherever it goes), and a
  // player under it pushed out (WIKI: "in a random direction").
  block(boss, context, player) {
    this.blocked = { tiles: footprintTiles(boss.position), until: context.tick + blockerTicks };
    this.encounter.updateArena();
    this.pushOut = player.alive && gapTo(player.position, boss.position) === 0;
    boss.combat.targetId = null; // it faces its breaths, not the player
  }
  // Where a player under it goes: straight out of a side at random, the
  // nearest tile past its edge (tsps, theirs).
  pushOutTile(player) {
    if (!this.pushOut || !this.blocked) return null;
    this.pushOut = false;
    const [x, y] = this.blocked.tiles[0];
    const [px, py] = player.position;
    if (gapTo(player.position, [x, y]) !== 0) return null;
    const out = [[px, y + bossSize], [px, y - 1], [x + bossSize, py], [x - 1, py]].filter((tile) => this.encounter.isFloor(tile));
    return out.length ? out[Math.floor(this.encounter.random() * out.length)] : null;
  }
  face(boss, direction) {
    const [dx, dy] = steps[direction];
    const middle = [boss.position[0] + bossSize / 2, boss.position[1] + bossSize / 2];
    // Facing as the engine counts it (faceActorToward): 15 tiles out (OBS (tsps)).
    boss.facing = (Math.round(Math.atan2(-dx * 15, -dy * 15) * (2048 / (Math.PI * 2))) + 2048) % 2048;
    return middle;
  }
  // A wall 4 wide and 8 long out of one side of its footprint.
  breath(boss, context, direction) {
    const [dx, dy] = steps[direction];
    const [x, y] = boss.position;
    this.face(boss, direction);
    const from = [x + travel.from[0], y + travel.from[1]];
    const projectiles = [];
    const graphics = [];
    const audio = [];
    for (let k = 0; k < wall.length; k++) {
      const row = [];
      for (let w = 1; w <= wall.width; w++) {
        // Out of the north or south side x runs across it; out of the east or west, y.
        const tx = dx === 0 ? x + w : dx > 0 ? x + bossSize + k : x - 1 - k;
        const ty = dy === 0 ? y + w : dy > 0 ? y + bossSize + k : y - 1 - k;
        if (this.encounter.isFloor([tx, ty])) row.push([tx, ty]);
      }
      const delay = wall.first + wall.perTile * k;
      for (const tile of row) {
        if (k === 0) projectiles.push(this.travelTo(from, tile));
        graphics.push(this.flame(context, tile, delay));
      }
      if (row[0]) audio.push({ id: sounds.fire, delayCycles: delay, range: k === 0 ? 15 : 10, position: [...row[0]] });
    }
    this.encounter.visual(context, { animations: ["special"], projectiles, graphics, sounds: audio });
  }
  // The last breath: a fire down the diagonal, from the tile off its corner, that follows the player.
  tracking(boss, context, direction) {
    const [dx, dy] = steps[direction];
    const [x, y] = boss.position;
    this.face(boss, direction);
    const start = [dx > 0 ? x + bossSize : x - 1, dy > 0 ? y + bossSize : y - 1];
    const from = [x + travel.from[0], y + travel.from[1]];
    this.trackers.push({ tile: [...start], until: context.tick + trackTicks });
    this.encounter.visual(context, {
      animations: ["special"],
      projectiles: [this.travelTo(from, start)],
      graphics: [this.flame(context, start, wall.first)],
      sounds: [{ id: sounds.tracking, delayCycles: wall.first, range: 15, position: [...start] }],
    });
  }
  travelTo(from, tile) {
    return {
      spotAnimId: spotAnims.fireTravel, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target: { kind: "tile", position: [...tile] },
      startDelayCycles: travel.start, endDelayCycles: travel.end, slope: 0, startOffset: 0, startHeight: travel.startHeight, endHeight: travel.endHeight,
    };
  }
  // A fire on a tile: it catches as its graphic arrives (OBS (tsps)).
  flame(context, tile, delayCycles) {
    const activeAt = context.tick + Math.max(1, Math.ceil(delayCycles / 30));
    this.flames.push({ tile: [...tile], activeAt, until: context.tick + Math.floor((delayCycles + fireLastsCycles) / 30) });
    return { spotAnimId: spotAnims.fire, target: { kind: "tile", position: [...tile] }, height: 0, delayCycles, onGround: true };
  }
  // After the player has moved: the tracking fires step after him, and a fire
  // that catches as he stands on it, or that he steps onto (tsps, theirs: no
  // recording isolates it), scorches him.
  step(player, context) {
    const tick = context.tick;
    const graphics = [];
    const audio = [];
    this.trackers = this.trackers.filter((tracker) => tick <= tracker.until);
    for (const tracker of this.trackers) {
      const count = chebyshev(tracker.tile, player.position) > trackFast ? 2 : 1;
      for (let s = 0; s < count && !same(tracker.tile, player.position); s++) {
        tracker.tile = [tracker.tile[0] + Math.sign(player.position[0] - tracker.tile[0]), tracker.tile[1] + Math.sign(player.position[1] - tracker.tile[1])];
        graphics.push(this.flame(context, tracker.tile, trackFire(s)));
        audio.push({ id: sounds.tracking, delayCycles: trackFire(s), range: 15, position: [...tracker.tile] });
      }
    }
    if (graphics.length) this.encounter.visual(context, { graphics, sounds: audio });
    this.flames = this.flames.filter((flame) => tick <= flame.until);
    const before = this.lastPlayerTile;
    this.lastPlayerTile = [...player.position];
    if (!player.alive) return [];
    const here = this.flames.filter((flame) => same(flame.tile, player.position) && tick >= flame.activeAt);
    const caught = here.some((flame) => flame.activeAt === tick) || (here.length > 0 && !(before && same(before, player.position)));
    return caught ? [this.scorch(context)] : [];
  }
  scorch(context) {
    this.encounter.message(context, messages.scorched);
    this.burn = { since: context.tick, hits: 0 };
    return { baseDamage: scorchDamage, source: "Fire" };
  }
  // Before the NPCs: the burn, every 5 ticks from the scorch; and the blockers' end.
  tick(context) {
    const tick = context.tick;
    const hits = [];
    if (this.burn && tick > this.burn.since && (tick - this.burn.since) % burn.every === 0) {
      this.burn.hits++;
      const done = this.burn.hits >= burn.hits;
      this.encounter.message(context, done ? messages.cleared : messages.burning);
      hits.push({ baseDamage: burn.damage, source: "Burn", hitsplatType: "burn" });
      if (done) this.burn = null;
    }
    if (this.blocked && tick >= this.blocked.until) {
      this.blocked = null;
      this.encounter.updateArena();
    }
    return hits;
  }
  // A phase change ends the special at once; the fires already breathed stay (WIKI).
  endSpecial(boss) {
    if (!this.special) return;
    this.special = null;
    this.trackers = [];
    if (boss) boss.combat.targetId = "player";
  }
  blockedTiles() {
    return this.firesStand() ? new Set(this.blocked.tiles.map(key)) : new Set();
  }
  snapshot(tick) {
    return {
      fireSpecial: this.special && { stage: this.special.stage, diagonal: this.special.diagonal ?? null, since: this.special.since },
      flames: this.flames.filter((flame) => tick <= flame.until).map((flame) => ({ tile: [...flame.tile], activeAt: flame.activeAt, until: flame.until })),
      trackers: this.trackers.map((tracker) => [...tracker.tile]),
      blocked: this.firesStand(tick) ? this.blocked.tiles.map((tile) => [...tile]) : [],
      burning: this.burn !== null,
    };
  }
}
