// The one behaviour of every sandbox NPC: walk toward a target, attack it
// when one of its attacks reaches, wait its attack speed, again. Which
// target is the encounter's to say (`config.selectTarget`): the player
// alone, or in "ffa" the nearest NPC or player of another team. Attacks on
// an NPC are the engine's own NPC-on-NPC attacks (the Inferno's nibblers hit
// the pillars the same way), rolled with the monster table's stats of both.
//
// What the player sees of an attack is announced twice: as an
// "inferno_visual" event, which the default scene (InfernoScene and the
// scenes built on it) plays, and as a "colosseum_visual" one, which Sol
// Heredit's and Yama's scenes play (the arena's host draws with those). No
// scene plays both.
//
// Random numbers come from `context.random`, the encounter's seeded
// generator; nothing else is random.
import { canNpcActAtTick, isActorAlive } from "../../engine/npcState.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getNpcPursuitMoves, isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { findNpcRouteToMeleeRange } from "../shared/npcRoutes.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange, getDistanceFromNpcCentre } from "../shared/npcAttack.js";
import { scheduleNextActionTick, buildNpcProjectileVisual, getProjectileSourcePosition, buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { emitColosseumVisual } from "../sol-heredit/constants.js";

// What the formulas and the events call each style.
const planOfStyle = {
  melee: { formulaStyle: "melee_crush", damageType: "melee", attackKind: "melee_crush" },
  range: { formulaStyle: "ranged", damageType: "range", attackKind: "range_arrow" },
  magic: { formulaStyle: "magic", damageType: "magic", attackKind: "magic_fire" },
};
// inferred: a ranged or magic attack without a projectile of its own lands two ticks later.
const defaultDistantImpactTicks = 2;
const cyclesPerTick = 30;
// inferred: a graphic on a target tile at a body's height, as JalTok-Jad's ranged
// graphic (inferno/jad.js) and Zuk's (inferno/zukFight.js) are drawn.
const defaultTargetGraphicHeight = 92;

// The tiles a strike lands on, around the target's tile as the attack starts:
// "square" the 3 by 3 around it, "plus" it and its four neighbours.
function strikeTiles(shape, [x, y]) {
  const offsets = shape === "square"
    ? [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy]))
    : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  return offsets.map(([dx, dy]) => [x + dx, y + dy]);
}

/** The reach that brings an NPC close enough for its longest attack. */
export const getApproachRange = (entry) => Math.max(...entry.attacks.map((attack) => attack.range));

// The visual of an attack: its projectiles and the graphics on the target.
// A windup (Jad's three ticks) delays both, as it delays the hit.
function buildPlan(attack, maxHitOverride, attacker, target) {
  const plan = {
    ...planOfStyle[attack.style],
    sourceDeathPolicy: attack.style === "melee" ? "cancel-before-impact" : "persist",
  };
  const maxHit = maxHitOverride ?? attack.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  const windupCycles = (attack.windupTicks ?? 0) * cyclesPerTick;
  if (attack.windupTicks) plan.windupTicks = attack.windupTicks;
  let visual = [];
  const graphics = attack.targetGraphic
    ? [{ spotAnimId: attack.targetGraphic.spotAnimId, target: { kind: "tile", position: [...target.position] }, height: attack.targetGraphic.height ?? defaultTargetGraphicHeight, delayCycles: windupCycles }]
    : [];
  if (attack.parts) {
    // A projectile of several spot animations, each leaving and landing at
    // its own offset (Jad's magic: inferno/jad.js).
    plan.impactDelayTicks = 0;
    plan.projectile = attack.parts.timing;
    const distance = getDistanceFromNpcCentre(attacker, target);
    visual = attack.parts.spotAnims.map(({ spotAnimId, start, end }) => ({
      spotAnimId,
      sourcePosition: getProjectileSourcePosition(attacker),
      target: buildActorVisualTarget(target),
      startDelayCycles: windupCycles + start,
      endDelayCycles: windupCycles + end + distance * attack.parts.timing.stepMultiplier,
      slope: attack.parts.slope,
      startOffset: attack.parts.startOffset,
      startHeight: attack.parts.startHeight,
      endHeight: attack.parts.endHeight,
    }));
  } else if (attack.projectile) {
    plan.impactDelayTicks = 0;
    plan.projectile = attack.projectile.timing;
    const endDelayCycles = getProjectileFlightCycles(attack.projectile.timing, getDistanceFromNpcCentre(attacker, target));
    visual = [buildNpcProjectileVisual(attacker, target, attack.projectile, endDelayCycles)];
  } else if (attack.flight) {
    plan.impactDelayTicks = Math.ceil(attack.flight.endDelayCycles / cyclesPerTick);
    const { spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight } = attack.flight;
    visual = [{ spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight, sourcePosition: getProjectileSourcePosition(attacker), target: buildActorVisualTarget(target) }];
  } else {
    plan.impactDelayTicks = attack.impactDelayTicks ?? (attack.style === "melee" ? 0 : defaultDistantImpactTicks);
  }
  if (windupCycles > 0 && !attack.parts) {
    visual = visual.map((projectile) => ({ ...projectile, startDelayCycles: projectile.startDelayCycles + windupCycles, endDelayCycles: projectile.endDelayCycles + windupCycles }));
  }
  return { plan, visual, graphics };
}

// When the straight walk is blocked (a pillar, a wall between them and no
// line of sight), one step along the route search toward the target, as the
// Colosseum's minotaur does with its modifier Red Flag (colosseum/minotaur.js).
function routeAround(actor, target, context) {
  const occupancy = context.world.occupancy;
  const [ownX, ownY] = actor.position;
  const isOwnTile = (x, y) => x >= ownX && x < ownX + actor.size && y >= ownY && y < ownY + actor.size;
  const isClearOfOthers = ([x, y], size) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (occupancy.isBlocked(x + dx, y + dy) && !isOwnTile(x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  const route = findNpcRouteToMeleeRange({
    source: actor.position,
    destination: [...target.position],
    size: actor.size,
    canOccupy: (tile, size) => isArenaFootprintWalkable(tile, size) && isClearOfOthers(tile, size),
    moveNear: true,
  });
  const step = route.kind === "failed" ? undefined : route.steps[0];
  return step ? [{ npcId: actor.id, path: [step] }] : [];
}

export const brawlerNpcDefinition = defineNpc({
  id: "sandbox-brawler",
  // The scene plays the death; the encounter takes the body away (encounter.js).
  onDamageResolved: ({ actor, damage }) => {
    if (damage?.sourceId) actor.state.lastAttackerId = damage.sourceId;
  },
  move: ({ actor, context, config }) => {
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return [];
    // An NPC that never moves in its own fight (TzKal-Zuk) stays where it was placed.
    if (config.entryOf(actor).immobile) {
      actor.combat.targetId = config.selectTarget(actor, context)?.id ?? null;
      return [];
    }
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return [];
    // Sol Heredit stands still while a spear or a shield is on its way (solGround).
    if (context.tick < (actor.state.immobileUntilTick ?? 0)) return [];
    const moves = getNpcPursuitMoves(actor, context, target);
    if (moves.length > 0 || isNpcInAttackRange(actor, target, actor.combat.attackRange)) return moves;
    return routeAround(actor, target, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor) || context.tick < actor.combat.nextActionTick) return idle;
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return idle;
    const entry = config.entryOf(actor);
    const inReach = entry.attacks.filter((attack) => isNpcInAttackRange(actor, target, attack.range));
    if (inReach.length === 0) return idle;
    const attack = inReach.length === 1 ? inReach[0] : inReach[Math.floor(context.random() * inReach.length)];
    if (attack.solGround) return solGround(actor, target, attack, context, config);
    if (attack.strike) return strike(actor, target, attack, context, config);
    // One attack may be several hits, each rolled on its own and with a
    // hitsplat of its own: `hits` at once (the jaguar's three claws), or a
    // `volley` a tick apart (the manticore's three orbs). The engine
    // announces the first; the others continue it.
    const parts = attack.volley
      ? attack.volley.map((part, index) => ({ ...attack, ...part, windupTicks: (attack.windupTicks ?? 0) + index * (attack.volleySpacingTicks ?? 1) }))
      : Array.from({ length: attack.hits ?? 1 }, () => attack);
    const npcAttacks = [];
    const visual = [];
    const graphics = [];
    for (const part of parts) {
      const built = buildPlan(part, actor.state.maxHit, actor, target);
      const rolled = rollNpcAttack({ attacker: actor, target, plan: built.plan, random: context.random });
      // Null when an NPC has no stats: the catalog holds only NPCs of the monster table.
      if (!rolled) return idle;
      npcAttacks.push(npcAttacks.length === 0 ? rolled : { ...rolled, isContinuation: true });
      visual.push(...built.visual);
      graphics.push(...built.graphics);
    }
    const npcAttack = npcAttacks[0];
    emitInfernoNpcAttack(context, {
      actor,
      target,
      clipId: attack.clip,
      kind: `sandbox_${attack.style}`,
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: visual,
    });
    if (graphics.length > 0) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
    emitColosseumVisual(context.tickEvents, {
      animations: [{ actorId: actor.id, clipId: attack.clip, delayCycles: 0 }],
      projectiles: visual,
      // Its graphics name a tile as `position` (the schema of rendering.js).
      graphics: graphics.map(({ spotAnimId, target: on, height, delayCycles }) => ({ spotAnimId, position: [...on.position], delayCycles, height })),
    });
    actor.combat.attackStyle = attack.style;
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
    return { environmentalDamages: [], npcAttacks };
  },
});

// Sol Heredit's regular attack, as his own fight makes it
// (sol-heredit/bossAttacks.js, scheduleSolAttack; boss.js, tryLaunchSolAttack):
// a spear or a shield at even odds, the first always a spear, the variant
// alternating when he repeats one; the telegraph now, the ground attack three
// ticks later on the tiles his position and the target's then give
// (encounter.js lands it with buildGroundAttackArea); still for 6 ticks after
// a spear and 4 after a shield; the next attack 7 or 6 ticks later.
function solGround(actor, target, attack, context, config) {
  const memory = actor.state.solMemory ?? { lastAction: null, lastVariant: 1, attacked: false };
  const style = !memory.attacked || context.random() < 0.5 ? "spear" : "shield";
  const variant = memory.lastAction !== style ? 1 : memory.lastVariant === 1 ? 2 : 1;
  actor.state.solMemory = { lastAction: style, lastVariant: variant, attacked: true };
  config.queueStrike({ landsAt: context.tick + 3, solGround: { style, variant }, attackerId: actor.id, targetId: target.id });
  actor.state.immobileUntilTick = context.tick + (style === "spear" ? 6 : 4);
  faceActorToward(actor, target);
  const animations = [{ actorId: actor.id, clipId: style, delayCycles: 0 }];
  emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
  emitColosseumVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
  actor.combat.attackStyle = "melee";
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, style === "spear" ? 7 : 6);
  return { environmentalDamages: [] };
}

// A strike on tiles: the attack is rolled
// now and lands `delayTicks` later on the tiles it was aimed at, on whoever
// still stands there (the encounter lands it: encounter.js, strikes). The
// telegraph is the attack's clip; the stomp is a spot animation on every
// tile as it lands.
function strike(actor, target, attack, context, config) {
  const idle = { environmentalDamages: [] };
  const plan = { ...planOfStyle[attack.style], impactDelayTicks: 0, sourceDeathPolicy: "cancel-before-impact" };
  const maxHit = actor.state.maxHit ?? attack.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  const rolled = rollNpcAttack({ attacker: actor, target, plan, random: context.random });
  if (!rolled) return idle;
  const { delayTicks, shape, spotAnimIds } = attack.strike;
  const tiles = strikeTiles(shape, target.position);
  config.queueStrike({ landsAt: context.tick + delayTicks, tiles, attack: rolled });
  faceActorToward(actor, target);
  const delayCycles = delayTicks * cyclesPerTick;
  const graphics = tiles.map((tile, index) => ({ spotAnimId: spotAnimIds[index % spotAnimIds.length], target: { kind: "tile", position: tile }, height: 0, delayCycles }));
  const animations = [{ actorId: actor.id, clipId: attack.clip, delayCycles: 0 }];
  emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles: [],
    graphics: graphics.map(({ spotAnimId, target: on, height, delayCycles: delay }) => ({ spotAnimId, position: [...on.position], delayCycles: delay, height })),
  });
  actor.combat.attackStyle = attack.style;
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
  return idle;
}
