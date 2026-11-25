// Ur-maggot larvae (https://oldschool.runescape.wiki/w/Ur-maggot_larvae).
//
// From his screeches below 85% of his hitpoints he throws one in, west and
// east in turn, the first in the west; below a fifth, the first screech fills
// the room up to four, two a side (encounter.js says when). OBS, the 26
// larvae of the recordings: one comes up at x 27 (west) or 37 (east), y 43,
// 3 ticks into the screech, a second of a side beside it (26 or 28, 36). It
// flies south over the bones a tile a tick and lands 8 ticks after it came;
// it goes on south to a row of the floor (33 to 36, any), and from there
// along it, eating the carrion it comes to: a tick on the tile, and the King
// heals 1 (WIKI). At the floor's end it turns back.
//
// Over the player it stays and leeches him, more each tick he stays under it,
// and the King heals as much (WIKI); stepping off starts the count again.
// OBS: 1 for a first tick (twice), then 2 and 3 for a player who stayed (the
// wiki says it starts at 3).
//
// In the air a standard ranged hit kills it, and costs the weapon no time
// (WIKI; encounter.js's rules). The King's death kills them all.
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { healNpc } from "../shared/npcHelpers.js";
import { emitInfernoVisual } from "../inferno/events.js";
import { npcTypeIds, spotAnims, floor, onFloor } from "./ids.js";

const spawnY = 43; // OBS (two of 26 at 44)
const flightTicks = 8; // OBS: from its spawn to its landing, 22 of 26 (four at 9)
const leechStart = 1; // OBS; WIKI 3
const middleX = (floor.minX + floor.maxX) >> 1;

export const larvaDefinition = defineNpc({
  id: "maggot-king-larva",
  move: ({ actor, context, config }) => config.larvae.move(actor, context),
  tick: () => ({ environmentalDamages: [] }),
});

export class Larvae {
  constructor(encounter) {
    this.encounter = encounter;
  }
  reset() {
    this.count = 0;
    this.nextSide = "west";
    this.leeches = []; // damage due next tick: { larvaId, amount }
  }
  isLarva(npc) {
    return larvaDefinition.isActor(npc);
  }
  living(world) {
    return world.getNpcs().filter((npc) => this.isLarva(npc) && npc.alive && !npc.state.dying);
  }
  flying(larva, tick) {
    return tick < larva.state.landsAt;
  }
  // One larva, on the side whose turn it is.
  launchOne(context) {
    const side = this.nextSide;
    this.nextSide = side === "west" ? "east" : "west";
    this.launch(context, side === "west" ? 27 : 37, side);
  }
  // The screech below a fifth: up to four in the room, two a side, each
  // larva already there counted on the side it came from (OBS: four into an
  // empty room; three beside one, twice, the missing one on the side the
  // other had come from, wherever it had crawled since).
  fill(context) {
    const living = this.living(context.world);
    for (const [side, columns] of [["west", [27, this.encounter.random() < 0.5 ? 26 : 28]], ["east", [37, 36]]]) {
      const there = living.filter((larva) => larva.state.side === side).length;
      for (const x of columns.slice(0, Math.max(0, 2 - there))) this.launch(context, x, side);
    }
  }
  launch(context, x, side) {
    const id = "maggot-larva-" + this.count++;
    const hp = getMonsterHitpoints(npcTypeIds.larva); // TABLE: 30
    const position = [x, spawnY];
    const row = floor.minY + Math.floor(this.encounter.random() * (floor.maxY - floor.minY + 1));
    context.spawnNpc(larvaDefinition.createActor(
      {
        id, kind: "npc", role: "minion", npcTypeId: npcTypeIds.larva, archetypeId: "maggot-king-larva", size: 1, alive: true,
        position: [...position], previousPosition: [...position], facing: 0, history: new Map(),
        vitals: { hp, maxHp: hp }, formulaStats: structuredClone(getMonsterFormulaStats(npcTypeIds.larva)), spawnTick: context.tick,
        blocksNpcMovement: false,
        combat: { attackSpeed: 4, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
          animations: { idle: null, walk: null, run: null, attack: null, death: null } },
      },
      { side, landsAt: context.tick + flightTicks, row, direction: 0, tally: 0, leechedAt: null },
    ));
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId: id, clipId: "flight", delayCycles: 0 }], projectiles: [], graphics: [] });
  }
  // Its turn: south a tile a tick to its row, then along the row. It stays
  // on carrion to eat it, and over the player.
  move(larva, context) {
    if (!larva.alive || larva.state.dying) return [];
    const [x, y] = larva.position;
    if (y > larva.state.row) return [{ npcId: larva.id, path: [[x, y - 1]] }];
    if (this.flying(larva, context.tick)) return [];
    const player = context.world.getPlayer();
    if (player.alive && player.position[0] === x && player.position[1] === y) return [];
    const encounter = this.encounter;
    if (encounter.floor.eat(larva.position)) {
      const boss = encounter.boss(context.world);
      if (boss?.alive) healNpc(boss, 1, context.tickEvents);
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spotAnims.eat, target: { kind: "tile", position: [x, y] }, height: 0, delayCycles: 0 }] });
      return [];
    }
    if (larva.state.direction === 0) larva.state.direction = this.firstDirection(x, y);
    let next = x + larva.state.direction;
    if (!onFloor([next, y])) {
      larva.state.direction = -larva.state.direction;
      next = x + larva.state.direction;
    }
    return [{ npcId: larva.id, path: [[next, y]] }];
  }
  // inferred: towards the nearest carrion of its row, or the middle (OBS:
  // 9 of 10 turned towards the middle as they landed, the tenth towards the
  // carrion beside it).
  firstDirection(x, y) {
    const carrion = this.encounter.floor.carrionInRow(y).filter((cx) => cx !== x);
    if (carrion.length) {
      const nearest = carrion.reduce((best, cx) => (Math.abs(cx - x) < Math.abs(best - x) ? cx : best));
      return Math.sign(nearest - x);
    }
    return x <= middleX ? 1 : -1;
  }
  // After the player has moved: who is under a landed larva. The leech lands next tick.
  watch(context) {
    const player = context.world.getPlayer();
    for (const larva of this.living(context.world)) {
      const under = player.alive && !this.flying(larva, context.tick) && player.position[0] === larva.position[0] && player.position[1] === larva.position[1];
      if (!under) {
        larva.state.tally = 0;
        continue;
      }
      larva.state.tally = larva.state.leechedAt === context.tick - 1 ? larva.state.tally + 1 : leechStart;
      larva.state.leechedAt = context.tick;
      this.leeches.push({ larvaId: larva.id, amount: larva.state.tally });
    }
  }
  // At the start of the next tick: the leech's damage, and the King's heal.
  leech(context) {
    const due = this.leeches;
    this.leeches = [];
    const boss = this.encounter.boss(context.world);
    const player = context.world.getPlayer();
    return due.filter(({ larvaId }) => context.world.getNpc(larvaId)?.alive).map(({ amount }) => {
      if (boss?.alive) healNpc(boss, amount, context.tickEvents);
      return { baseDamage: amount, attackType: "typeless", source: "Ur-maggot larvae", playerPosition: [...player.position] };
    });
  }
  // The King is dead: every larva dies with him (OBS: their death sequence a tick or two after his).
  dieWithHim(context) {
    for (const larva of this.living(context.world)) {
      larva.state.dying = true;
      larva.untargetable = true;
      emitInfernoVisual(context.tickEvents, { animations: [{ actorId: larva.id, clipId: "death", delayCycles: 0 }], projectiles: [], graphics: [] });
      this.encounter.later(2, (ctx) => ctx.world.getNpc(larva.id) && ctx.despawnNpc(larva.id));
    }
  }
}
