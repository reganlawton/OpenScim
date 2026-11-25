// What the modifiers of the waves place in the arena and do each tick: the
// bee swarms (Bees!), the orb (Solarflare), the healing totem (Totemic), the
// explosion of a dead monster (Volatility) and the molten sand (Reentry, and
// Volatility at level III). The actors and their NPC definitions are Sol
// Heredit's, imported; what is different in the waves is said where it
// stands.
//
// Sources as in constants.js and modifiers.js. "Sol's module" is
// ../sol-heredit/: its numbers are those of his fight, taken over where no
// source speaks of the waves.
import { isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { emitInfernoVisual } from "../inferno/events.js";
import { colosseumSpotAnimIds } from "../sol-heredit/constants.js";
import { beeSwarmNpcDefinition, advanceBeeSwarmRespawn } from "../sol-heredit/minions.js";
import {
  healingTotemNpcDefinition,
  createBeeSwarmActors,
  createHealingTotemActor,
  updateHealingTotem,
  findTotemSpawnTile,
  getVolatilityExplosionTiles,
  getVolatilityGraphicDelayCycles,
} from "../sol-heredit/modifierEffects.js";
import { solarflareNpcDefinition, createSolarflareOrb } from "../sol-heredit/solarflare.js";
import { registerWithInfernoVisuals, withInfernoVisuals } from "./visuals.js";

// Solarflare: an orb circles each of the four pillars, on the ring of tiles
// that touch it (as reported from the game by players, not recorded; WIKI:
// "Pillars are orbited by an orb", moving every 2 ticks and stopping for 7
// at a corner).
// The pillars are 3 by 3; their south-west tiles are the map's (24,26 is the
// south-west pillar's, losLinks.js). A ring is 5 by 5, its corners one tile
// diagonally out from the pillar's. inferred: the orbs go clockwise, as Sol's
// do, and each starts on its ring's south-west corner.
const pillarSouthWestTiles = [
  [24, 26],
  [24, 41],
  [39, 41],
  [39, 26],
];
const pillarSize = 3;
const solarflareRings = pillarSouthWestTiles.map(([x, y]) => [
  [x - 1, y - 1],
  [x - 1, y + pillarSize],
  [x + pillarSize, y + pillarSize],
  [x + pillarSize, y - 1],
]);
// WIKI (Solarflare): the orb "damages the player on contact"; level II
// "deals more damage", level III "even more damage" and disables prayers.
// WIKI (strategy page, tips, "Solarflare skip"): at levels I and II "the
// flare damages only on its second tick", and at III the way past it is to
// click its true tile as it moves. Sol's module hits when the orb steps off
// the tile the player stood on, for 10 to 20 at every level, the hit
// landing one tick later.
// Here, at levels I and II, an orb hits a player who stands on its tile on
// the second tick it is on that tile (the tick it arrived is the first): a
// player who steps off before then, or steps on after, is not hit. At level
// III it hits on contact: the orb and the player on one tile at any point of
// its turn, once a contact. inferred: that the second tick is the only one
// at a corner where the orb rests longer; that the contact of level III
// counts its arrival on the player and his stepping onto it alike; the
// damage of levels II and III, 15 to 25 and 20 to 30. The hit lands a tick
// later, as in Sol's module.
const solarflareDamageByLevel = { 1: [10, 20], 2: [15, 25], 3: [20, 30] };
const isSameTile = (tile, otherTile) => tile[0] === otherTile[0] && tile[1] === otherTile[1];
// The orb's hits of the waves; Sol's fight keeps his module's rule.
class WaveSolarflareDamage {
  pending = [];
  // Level III: the ids of the orbs that touched the player on the last tick.
  touching = new Set();
  // The tick each orb arrived on the tile it stands on, by id.
  arrivals = new Map();
  reset() {
    this.pending = [];
    this.touching = new Set();
    this.arrivals = new Map();
  }
  // `orbs` are the orbs after their turns; `movements` the engine's record
  // of the steps they took this tick.
  resolveTick(context, orbs, movements, level) {
    const due = this.pending.filter((hit) => hit.tick <= context.tick);
    this.pending = this.pending.filter((hit) => hit.tick > context.tick);
    const damages = due.map((hit) => ({ baseDamage: hit.baseDamage, attackType: "typeless", source: "Solarflare", playerPosition: [...context.playerPos] }));
    const movementOf = (orb) => movements.find((candidate) => candidate.npcId === orb.id);
    for (const orb of orbs) {
      if (movementOf(orb)?.moved === true) {
        this.arrivals.set(orb.id, context.tick);
      } else if (!this.arrivals.has(orb.id)) {
        this.arrivals.set(orb.id, orb.spawnTick ?? context.tick);
      }
    }
    let hits;
    if (level >= 3) {
      const touching = new Set(
        orbs
          .filter((orb) => isSameTile(orb.position, context.playerPos) || (movementOf(orb)?.moved === true && isSameTile(movementOf(orb).from, context.playerPos)))
          .map((orb) => orb.id),
      );
      hits = [...touching].some((orbId) => !this.touching.has(orbId));
      this.touching = touching;
    } else {
      hits = orbs.some((orb) => context.tick - this.arrivals.get(orb.id) === 1 && isSameTile(orb.position, context.playerPos));
    }
    if (hits) {
      this.pending.push({ tick: context.tick + 1, baseDamage: solarflareDamageByLevel[level] ?? solarflareDamageByLevel[1] });
      if (level >= 3 && context.world.getPlayer()?.activePrayer != null) {
        context.setProtectionPrayer?.(null);
      }
    }
    return damages;
  }
}
// WIKI: an enemy at half its hitpoints or less gets a healing totem near it,
// which heals it by 30 % of its hitpoints "every few ticks"; a totem has 1
// hitpoint and comes again two minutes after it was destroyed or its enemy
// died. Sol's module: it sends a heal every 6 ticks, the first 7 ticks after
// it appeared, each landing 6 ticks after it was sent, and stands on a tile
// beside the enemy, the south-west one first.
// inferred: there is one totem at a time, for the first monster in turn order
// that is wounded so, and a wave starts without a totem and without a wait.
const totemBelowHealthFraction = 0.5;
const totemHealFraction = 0.3;
const totemRespawnTicks = 200;
// OBS, Volatility I, 14 dead monsters: on the first tick a dead monster is
// gone there is an explosion on its centre tile and fire on every tile of its
// footprint and of one tile around it that can be walked on, 2 client cycles
// later per tile from the centre; a player on one of those tiles is hit on
// that tick, for 16 and for 25 in the two samples. Sol's module has 16 to 24,
// and two tiles around at levels II and III (WIKI: two at II).
// inferred: the damage is 16 to 25.
const volatilityDamage = [16, 25];
// OBS: the warband, the shaman and the jaguar; the manticore; the javelin
// colossus. CACHE names them vfx_colosseum_human_explosion_01,
// ..._manticore_explosion_01 and ..._colossi_explosion_01; the minotaur's is
// by its name there alone, ..._minotaur_explosion_01.
export const explosionSpotAnimIds = { human: 2713, manticore: 2721, colossus: 2722, minotaur: 2723 };
const explosionOfKind = { manticore: "manticore", javelin: "colossus", shockwave: "colossus", minotaur: "minotaur" };
// OBS: the centre tile of a monster two tiles wide is its south-west tile.
const getCentreTile = (position, size) => [position[0] + Math.floor((size - 1) / 2), position[1] + Math.floor((size - 1) / 2)];
// Molten sand. WIKI: a javelin thrown high leaves a pool where it lands with
// Reentry, and the centre tile of an explosion one with Volatility III;
// both are gone when the wave ends, unless Reentry is at level II or III,
// which makes them permanent. Reentry II covers a second tile, south-west of
// the first, and Reentry III a third, west of the second, each "permitted
// that there is space"; "if not, it will pick a random unaffected tile".
// inferred: a tile that cannot be walked on or is covered already is left
// out instead. Sol's module: a player on molten sand takes 6 to 8 a tick,
// which no prayer answers; taken over, as no source has the waves' number.
// WIKI, its list of changes (17 April 2024): "Molten sand no longer deals
// damage between waves."
const sandDamage = [6, 8];
const reentryExtraTiles = [
  [-1, -1],
  [-2, -1],
];
const tileKey = ([x, y]) => `${x},${y}`;

export class WaveModifierEffects {
  // `getModifiers()` gives { id: level } of the modifiers of the run as they
  // are now: a choice before a wave adds to them.
  constructor(getModifiers) {
    this.getModifiers = getModifiers;
    this.beeRules = registerWithInfernoVisuals(beeSwarmNpcDefinition.register(undefined));
    this.solarflareDamage = new WaveSolarflareDamage();
    this.reset();
  }
  // A new run.
  reset() {
    // How many swarms are in the arena, and the level the orb was made for.
    this.swarms = 0;
    this.orbLevel = 0;
    // The explosions to come: { tick, position, size, kind }.
    this.explosions = [];
    // The first tick on which a totem may appear, and how many there were.
    this.totemDue = 0;
    this.totemCount = 0;
    // The tiles under molten sand: "x,y" to whether the sand is permanent.
    this.sand = new Map();
    this.solarflareDamage.reset();
  }
  /** The entries for the encounter's NpcDefinitionRegistry of the actors this class places. */
  registrations() {
    return [this.beeRules, healingTotemNpcDefinition.register(undefined), solarflareNpcDefinition.register(undefined)];
  }
  /** The name of what an actor of this class is, for the damage log; undefined for any other actor id. */
  getLabel(npcId) {
    return { bees: "Bee swarm", totem: "Healing totem", solarflare: "Solarflare" }[npcId.split("_")[1]];
  }
  /** The tiles the orbs of Solarflare stand on in `world`, for the overlays. */
  getOrbTiles(world) {
    return world
      .getNpcs()
      .filter((npc) => solarflareNpcDefinition.isActor(npc) && npc.alive)
      .map((orb) => [...orb.position]);
  }
  /** The tiles under molten sand, for the scene. */
  getSandTiles() {
    return [...this.sand.keys()].map((key) => key.split(",").map(Number));
  }

  // Called when the monsters of a wave are placed. Sol's module has the
  // swarms appear 8 ticks into his fight and the orbs 3 ticks into it.
  // inferred for the waves: a swarm or the orbs that a modifier asks for
  // appear with the monsters of the next wave and stay through the waves
  // after it; a higher level of Solarflare replaces the orbs.
  placeForWave(context, random) {
    const { bees = 0, solarflare = 0 } = this.getModifiers();
    if (bees > this.swarms) {
      // Sol's module: each swarm on a tile of its own drawn from the nine of
      // his fight, all of which are floor in the waves too.
      const swarms = createBeeSwarmActors({ tier: bees, tick: context.tick, idPrefix: "colosseum_bees", random }).slice(this.swarms);
      for (const swarm of swarms) {
        context.spawnNpc(swarm);
        emitInfernoVisual(context.tickEvents, { animations: [{ actorId: swarm.id, clipId: "spawn", delayCycles: 0 }], projectiles: [], graphics: [] });
      }
      this.swarms = bees;
    }
    if (solarflare !== this.orbLevel) {
      for (const orb of context.world.getNpcs().filter(solarflareNpcDefinition.isActor)) {
        context.despawnNpc(orb.id);
      }
      for (const [index, corners] of solarflareRings.entries()) {
        context.spawnNpc(createSolarflareOrb({ id: `colosseum_solarflare_${solarflare}_${index}`, corners, tier: solarflare, spawnTick: context.tick, firstStepTick: context.tick + 1 }));
      }
      this.orbLevel = solarflare;
    }
  }
  // A wave is completed: its totem leaves with it, and the sand that is not
  // permanent.
  endWave(context) {
    for (const totem of context.world.getNpcs().filter(healingTotemNpcDefinition.isActor)) {
      context.despawnNpc(totem.id);
    }
    this.totemDue = 0;
    for (const [key, permanent] of this.sand) {
      if (!permanent) {
        this.sand.delete(key);
      }
    }
    // What the orb had yet to deal is not dealt between waves.
    this.solarflareDamage.reset();
  }
  // A dead monster was removed at the end of this tick: with Volatility it
  // explodes on the next, the first on which it is gone.
  onMonsterRemoved(npc, kind, tick) {
    if (this.getModifiers().volatility) {
      this.explosions.push({ tick: tick + 1, position: [...npc.position], size: npc.size, kind: explosionOfKind[kind] ?? "human" });
    }
  }
  // A javelin thrown high has come down on `tile`: with Reentry it leaves
  // molten sand there.
  onHighJavelinLanded(tile) {
    const reentry = this.getModifiers().reentry ?? 0;
    if (reentry === 0) {
      return;
    }
    this.coverWithSand(tile);
    for (const [dx, dy] of reentryExtraTiles.slice(0, reentry - 1)) {
      this.coverWithSand([tile[0] + dx, tile[1] + dy]);
    }
  }
  coverWithSand(tile) {
    const permanent = (this.getModifiers().reentry ?? 0) >= 2;
    if (isArenaFootprintWalkable(tile, 1) && (permanent || !this.sand.has(tileKey(tile)))) {
      this.sand.set(tileKey(tile), permanent || this.sand.get(tileKey(tile)) === true);
    }
  }
  // A totem that the player destroyed comes again two minutes later.
  onNpcDefeated(defeat, world) {
    const npc = world.getNpc(defeat.npcId);
    if (npc && healingTotemNpcDefinition.isActor(npc)) {
      this.totemDue = defeat.tick + totemRespawnTicks;
    }
  }

  // For the encounter's resolveHazards: the explosions of this tick and the
  // sand under the player, which burns only while a wave is fought
  // (`isWaveOn`).
  resolveHazards(context, isWaveOn = true) {
    const [playerX, playerY] = context.playerPos;
    const due = this.explosions.filter((explosion) => explosion.tick <= context.tick);
    this.explosions = this.explosions.filter((explosion) => explosion.tick > context.tick);
    const volatility = this.getModifiers().volatility ?? 0;
    const damages = due.flatMap((explosion) => {
      const centre = getCentreTile(explosion.position, explosion.size);
      const blastTiles = getVolatilityExplosionTiles(explosion.position, explosion.size, volatility).filter((tile) => isArenaFootprintWalkable(tile, 1));
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        projectiles: [],
        graphics: [
          { spotAnimId: explosionSpotAnimIds[explosion.kind], target: { kind: "tile", position: centre }, height: 0, delayCycles: 0 },
          ...blastTiles.map((tile) => ({
            spotAnimId: colosseumSpotAnimIds.fireblastImpact,
            target: { kind: "tile", position: tile },
            height: 0,
            delayCycles: getVolatilityGraphicDelayCycles(tile, centre),
          })),
        ],
      });
      if (volatility >= 3) {
        this.coverWithSand(centre);
      }
      return blastTiles.some(([x, y]) => x === playerX && y === playerY) ? [{ baseDamage: volatilityDamage, attackType: "typeless", source: "Volatility", playerPosition: [playerX, playerY] }] : [];
    });
    if (isWaveOn && this.sand.has(tileKey([playerX, playerY]))) {
      damages.push({ baseDamage: sandDamage, attackType: "typeless", source: "Molten sand", playerPosition: [playerX, playerY] });
    }
    return damages;
  }
  // For the encounter's completeNpcBand, when every NPC has moved and taken
  // its turn: the swarms sting, the orb burns, the totem heals. `monsters` is
  // the wave's monsters in the order of their turns; `context.random` the
  // wave's generator. Returns the damage to the player.
  completeNpcBand(context, monsters) {
    const { solarflare = 0, totemic = 0 } = this.getModifiers();
    const npcs = context.world.getNpcs();
    const damages = [];
    for (const swarm of npcs.filter(beeSwarmNpcDefinition.isActor)) {
      advanceBeeSwarmRespawn(swarm, context.tick);
      damages.push(...this.beeRules.resolveLocalEffects(swarm, context));
    }
    if (solarflare) {
      const orbs = npcs.filter(solarflareNpcDefinition.isActor);
      damages.push(...this.solarflareDamage.resolveTick(context, orbs, [...(context.npcMovements?.values() ?? [])], solarflare));
    }
    if (totemic) {
      this.tendTotem(context, monsters);
    }
    return damages;
  }
  tendTotem(context, monsters) {
    const totems = context.world.getNpcs().filter(healingTotemNpcDefinition.isActor);
    // A totem destroyed earlier in this tick is in the world still, and the
    // encounter is told of its defeat only when the tick ends.
    for (const destroyed of totems.filter((npc) => npc.death !== undefined)) {
      this.totemDue = Math.max(this.totemDue, destroyed.death.killTick + totemRespawnTicks);
    }
    const totem = totems.find((npc) => npc.alive);
    if (totem) {
      if (context.world.getNpc(totem.state.targetId)?.alive) {
        // Its effects are "colosseum_visual" events of Sol's module.
        updateHealingTotem(totem, withInfernoVisuals(context));
      } else {
        context.despawnNpc(totem.id);
        this.totemDue = context.tick + totemRespawnTicks;
      }
      return;
    }
    const wounded = context.tick >= this.totemDue ? monsters.find((npc) => npc.alive && npc.vitals.hp <= npc.vitals.maxHp * totemBelowHealthFraction) : undefined;
    const tile = wounded ? findTotemSpawnTile(wounded, (candidate) => isArenaFootprintWalkable(candidate, 1)) : null;
    if (tile) {
      context.spawnNpc(
        createHealingTotemActor({
          id: `colosseum_totem_${this.totemCount++}`,
          position: tile,
          target: wounded,
          healAmount: Math.floor(wounded.vitals.maxHp * totemHealFraction),
          tick: context.tick,
        }),
      );
    }
  }
}
