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
// What a monster does besides (catalog.js names each, its own fight's
// module the numbers): a healer heals one of its side until something hits
// it (`supports`); the meleer digs (`digs`); the mager brings back the dead
// (`revives`); the blob reads the prayer (`readsPrayer`). Summons, splits and
// heals from damage are the encounter's, as they make or hurt others
// (encounter.js).
//
// Random numbers come from `context.random`, the encounter's seeded
// generator; nothing else is random.
import { canNpcActAtTick, isActorAlive, isNpcAlive } from "../../engine/npcState.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getNpcPursuitMoves, isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { findNpcRouteToMeleeRange } from "../shared/npcRoutes.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange, getDistanceFromNpcCentre } from "../shared/npcAttack.js";
import { scheduleNextActionTick, buildNpcProjectileVisual, getProjectileSourcePosition, buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { emitColosseumVisual } from "../sol-heredit/constants.js";
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { hasLineOfSight } from "../../engine/attackRange.js";
import { healNpc } from "../shared/npcHelpers.js";

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

/** The reach that brings an NPC close enough for its longest attack. */
export const getApproachRange = (entry) => Math.max(...entry.attacks.map((attack) => attack.range));

// The animation of an NPC in both schemas, with graphics `on` an actor or
// on a tile ({ position }): the default scene's target, the hosts' scenes'
// `actorId` or `position`.
function animate(actor, clipId, context, graphics = [], projectiles = []) {
  const animations = clipId ? [{ actorId: actor.id, clipId, delayCycles: 0 }] : [];
  emitInfernoVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, on, height, delayCycles }) => ({
      spotAnimId, height, delayCycles: delayCycles ?? 0,
      target: on.kind ? buildActorVisualTarget(on) : { kind: "tile", position: [...on.position] },
    })),
  });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, on, height, delayCycles }) => ({
      spotAnimId, height, delayCycles: delayCycles ?? 0,
      ...(on.kind ? { actorId: on.id } : { position: [...on.position] }),
    })),
  });
}

/**
 * Open tiles for an NPC of `size` around a footprint (`around`: { position,
 * size }), `distance.min` to `distance.max` tiles from it, walkable and on no
 * one, nearest first and in a fixed order; `taken` footprints are left out.
 */
export function findOpenSpots(context, around, size, distance = { min: 1, max: 8 }, taken = []) {
  const occupancy = context.world.occupancy;
  const [ax, ay] = around.position;
  const spots = [];
  const overlaps = ([x, y], [ox, oy], otherSize) => x < ox + otherSize && ox < x + size && y < oy + otherSize && oy < y + size;
  for (let d = distance.min; d <= distance.max; d++) {
    for (let x = ax - d - size + 1; x <= ax + around.size - 1 + d; x++) {
      for (let y = ay - d - size + 1; y <= ay + around.size - 1 + d; y++) {
        const gap = Math.max(Math.max(0, ax - (x + size - 1), x - (ax + around.size - 1)), Math.max(0, ay - (y + size - 1), y - (ay + around.size - 1)));
        if (gap !== d || !isArenaFootprintWalkable([x, y], size)) continue;
        let clear = true;
        for (let dx = 0; dx < size && clear; dx++) for (let dy = 0; dy < size && clear; dy++) if (occupancy.isBlocked(x + dx, y + dy)) clear = false;
        if (!clear || taken.some((other) => overlaps([x, y], other.position, other.size))) continue;
        spots.push([x, y]);
      }
    }
    if (spots.length > 0 && distance.nearest) break;
  }
  return spots;
}

// --- a healer (`supports`) -------------------------------------------------
// It heals until something that is not of its side hits it; from then on it
// fights that, as long as that lives. Whom it heals: the one that summoned it
// (Jad, Zuk); one placed by the scenario, the nearest of its side that heals
// no one. One whose summoner died fights like any other.
export function supportTargetOf(actor, entry, context, config) {
  const state = actor.state;
  state.healingId = null;
  if (!entry.supports) return null;
  const attacker = state.lastAttackerId ? context.world.actors.get(state.lastAttackerId) : null;
  if (attacker && isActorAlive(attacker) && !config.isAlly(actor, attacker)) return null;
  let support = state.supportId ? context.world.getNpc(state.supportId) : null;
  if (!support || !isNpcAlive(support)) {
    if (state.summonerId) return null;
    support = null;
    let best = Infinity;
    for (const npc of context.world.getNpcs()) {
      if (npc === actor || !isNpcAlive(npc) || !config.isAlly(actor, npc) || config.entryOf(npc)?.supports) continue;
      const gap = Math.max(Math.abs(npc.position[0] - actor.position[0]), Math.abs(npc.position[1] - actor.position[1]));
      if (gap < best) {
        best = gap;
        support = npc;
      }
    }
    if (!support) return null;
    state.supportId = support.id;
  }
  state.healingId = support.id;
  return support;
}

function supportTick(actor, support, heals, context, config) {
  const idle = { environmentalDamages: [] };
  const state = actor.state;
  faceActorToward(actor, support);
  if (context.tick < (state.nextHealTick ?? 0) || !isNpcInAttackRange(actor, support, heals.reach)) return idle;
  state.nextHealTick = context.tick + heals.everyTicks;
  const [least, most] = heals.heal;
  const amount = least === most ? least : least + Math.floor(context.random() * (most - least + 1));
  const projectiles = heals.projectile
    ? [{ ...heals.projectile, sourcePosition: getProjectileSourcePosition(actor), target: buildActorVisualTarget(support) }]
    : [];
  animate(actor, heals.clip, context, heals.graphic ? [{ ...heals.graphic, on: support }] : [], projectiles);
  if (heals.applyDelayTicks) config.queueHeal({ at: context.tick + heals.applyDelayTicks, healerId: actor.id, targetId: support.id, amount });
  else healNpc(support, amount, context.tickEvents);
  return idle;
}

// --- the meleer's dig (`digs`, inferno/meleer.js) -------------------------
// Every 40 to 60 ticks (50 after it comes) it looks whether it has attacked
// in the last 20; if not, it goes down, where nothing can attack it, and 3
// ticks later comes up beside where its target stood, waits 3 ticks to walk
// and 9 to attack.
const digDownTicks = 3;
function digTick(actor, digs, context, config) {
  const state = actor.state;
  const { tick } = context;
  if (state.dig) {
    if (tick < state.dig.downTick + digDownTicks) return true;
    const spot = findOpenSpots(context, { position: state.dig.target, size: 1 }, actor.size, { min: 1, max: 8, nearest: true }, [])[0] ?? actor.position;
    actor.position = [...spot];
    actor.previousPosition = [...spot];
    actor.movementPath = [];
    state.dig = null;
    delete actor.targetableFromTick;
    state.walkFromTick = tick + 3;
    actor.combat.nextActionTick = Math.max(actor.combat.nextActionTick, tick + 9);
    animate(actor, digs.clipUp, context);
    return true;
  }
  if (tick < (state.nextDigCheckTick ?? Infinity)) return false;
  const interval = 40 + Math.floor(context.random() * 21);
  const lastAttackTick = actor.combat.lastAttackTick;
  const target = config.selectTarget(actor, context);
  if ((lastAttackTick !== null && tick - lastAttackTick <= 19) || !target) {
    state.nextDigCheckTick = tick + interval;
    return false;
  }
  state.nextDigCheckTick = tick + 6 + interval;
  state.dig = { downTick: tick, target: [...target.position] };
  actor.targetableFromTick = tick + digDownTicks;
  actor.combat.targetId = null;
  animate(actor, digs.clipDown, context);
  return true;
}

// --- the mager's revive (`revives`, inferno/mager.js) ---------------------
// As it attacks, by `chance`, it brings back one of the dead of its side the
// encounter keeps (encounter.js, corpses), on an open tile near it, and
// stands still; that attack does not go off.
function tryRevive(actor, revives, context, config) {
  const corpses = config.corpsesFor(actor, revives.of);
  if (corpses.length === 0 || context.random() >= revives.chance) return false;
  const corpse = corpses[Math.floor(context.random() * corpses.length)];
  const spots = findOpenSpots(context, { position: actor.position, size: actor.size }, corpse.size, { min: 1, max: 6 });
  if (spots.length === 0) return false;
  const spot = spots[Math.floor(context.random() * spots.length)];
  faceActorToward(actor, { position: spot, size: 1 });
  config.revive(corpse, spot, context, revives.firstActionTicks);
  // mager.js: the graphic 150 high near the middle of the one brought back.
  const graphicTile = [spot[0] + Math.max(0, corpse.size - 2), spot[1] + Math.max(0, corpse.size - 2)];
  animate(actor, revives.clip, context, [{ spotAnimId: 444, on: { position: graphicTile }, height: 150 }]);
  actor.state.immobileUntilTick = context.tick + revives.stillTicks;
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
  return true;
}

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
  if (attack.windupTicks) {
    plan.windupTicks = attack.windupTicks;
    // The hit is queued as the animation starts, but the prayer is judged on
    // the release, when the windup ends, as JalTok-Jad's own fight does it
    // (inferno/jad.js; WIKI: after the release is too late): the player has
    // the windup to switch. Without this it was judged at the animation's
    // first tick, before anyone could react (issue #17).
    plan.prayerCheckAt = { afterLaunchTicks: attack.windupTicks };
  }
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
  onDamageResolved: ({ actor, damage, context, config }) => {
    if (damage?.sourceId) actor.state.lastAttackerId = damage.sourceId;
    config.onHurt?.(actor, damage, context);
  },
  move: ({ actor, context, config }) => {
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return [];
    // Under the floor, or just come up from it (the meleer's dig).
    if (actor.state.dig || context.tick < (actor.state.walkFromTick ?? 0)) return [];
    const entry = config.entryOf(actor);
    // A healer goes to the one it heals, and stops in reach of it.
    const support = supportTargetOf(actor, entry, context, config);
    if (support) {
      actor.combat.targetId = null;
      if (entry.immobile || isNpcInAttackRange(actor, support, entry.supports.reach)) return [];
      const moves = getNpcPursuitMoves(actor, context, support);
      return moves.length > 0 ? moves : routeAround(actor, support, context);
    }
    // An NPC that never moves in its own fight (TzKal-Zuk) stays where it was placed.
    if (entry.immobile) {
      actor.combat.targetId = config.selectTarget(actor, context)?.id ?? null;
      return [];
    }
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return [];
    // Still while an attack of tiles is on its way (special: Sol Heredit's spear and shield).
    if (context.tick < (actor.state.immobileUntilTick ?? 0)) return [];
    const moves = getNpcPursuitMoves(actor, context, target);
    if (moves.length > 0 || isNpcInAttackRange(actor, target, actor.combat.attackRange)) return moves;
    return routeAround(actor, target, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return idle;
    const own = config.entryOf(actor);
    if (own.digs && digTick(actor, own.digs, context, config)) return idle;
    const support = supportTargetOf(actor, own, context, config);
    if (support) return supportTick(actor, support, own.supports, context, config);
    // A charged volley (the manticore's) runs on every tick: it draws its charge.
    const charged = own.attacks.find((attack) => attack.chargedVolley);
    if (charged) return chargedVolley(actor, charged, context, config);
    if (context.tick < actor.combat.nextActionTick) return idle;
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return idle;
    const entry = config.entryOf(actor);
    // An attack of `everyNth` comes on that attack of the count, and only then
    // (the javelin colossus's fifth); the others are drawn among the rest.
    const count = (actor.state.attackCount ?? 0) + 1;
    const inReach = entry.attacks.filter((attack) => isNpcInAttackRange(actor, target, attack.range) && (attack.everyNth ? count % attack.everyNth === 0 : true));
    const due = inReach.find((attack) => attack.everyNth);
    let plain = inReach.filter((attack) => !attack.everyNth);
    // The blob's: of what reaches, a style the player's protection prayer
    // does not cover (inferno/blob.js), if there is one.
    if (entry.readsPrayer && target.kind === "player" && target.activePrayer) {
      const uncovered = plain.filter((attack) => !isCorrectProtectionPrayer(planOfStyle[attack.style].damageType, target.activePrayer));
      if (uncovered.length > 0) plain = uncovered;
    }
    if (!due && plain.length === 0) {
      // Out of reach: a healer heals one of its side instead (the minotaur).
      return entry.heal ? heal(actor, target, entry.heal, context, config) : idle;
    }
    actor.state.attackCount = count;
    const attack = due ?? (plain.length === 1 ? plain[0] : plain[Math.floor(context.random() * plain.length)]);
    if (entry.revives && tryRevive(actor, entry.revives, context, config)) return idle;
    if (attack.special) return special(actor, target, attack, context, config);
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
    // An attack of its own speed (Jad's melee, every 4 ticks).
    scheduleNextActionTick(actor.combat, context.tick, attack.attackSpeed ?? actor.combat.attackSpeed);
    return { environmentalDamages: [], npcAttacks };
  },
});

// With its target out of reach, a healer (`heal`, the minotaur's:
// colosseum/sandbox.js) heals to full, on its attack timer, the first NPC of
// its own side below `belowFraction` of its hitpoints whose centre is in
// sight and within `range` of its own.
const centreTile = (npc) => [npc.position[0] + Math.floor(npc.size / 2), npc.position[1] + Math.floor(npc.size / 2)];
function heal(actor, target, config_, context, config) {
  const idle = { environmentalDamages: [] };
  const [x, y] = centreTile(actor);
  const wounded = context.world.getNpcs().find((npc) => {
    if (npc === actor || !isActorAlive(npc) || npc.death !== undefined || !config.isAlly(actor, npc)) return false;
    if (npc.vitals.hp >= npc.vitals.maxHp * config_.belowFraction) return false;
    const [otherX, otherY] = centreTile(npc);
    return Math.max(Math.abs(otherX - x), Math.abs(otherY - y)) <= config_.range && hasLineOfSight(x, y, otherX, otherY);
  });
  if (!wounded) return idle;
  faceActorToward(actor, wounded);
  const animations = [{ actorId: actor.id, clipId: config_.clip, delayCycles: 0 }];
  emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics: [{ ...config_.graphic, target: buildActorVisualTarget(wounded), delayCycles: 0 }] });
  emitColosseumVisual(context.tickEvents, { animations, projectiles: [], graphics: [{ ...config_.graphic, actorId: wounded.id, delayCycles: 0 }] });
  healNpc(wounded, wounded.vitals.maxHp - wounded.vitals.hp, context.tickEvents);
  scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
  return idle;
}

// A charged volley (`chargedVolley`, the manticore's: colosseum/sandbox.js,
// after colosseum/manticore.js). With a target in reach for the first time
// it chooses the order of its orbs, once, and charges for its attack speed;
// the charge animation and the orbs it holds over itself show as the charge
// runs out; then it throws one orb a tick at the target of the first, each
// rolled and with a hitsplat of its own, and charges again. It walks on as
// it charges, and holds its volley until a target is in reach.
function chargedVolley(actor, attack, context, config) {
  const idle = { environmentalDamages: [] };
  const charge = attack.chargedVolley;
  const state = actor.state;
  // The second and third orb leave one and two ticks after the first, at its target.
  if (state.volleyTick !== undefined && state.volleyTick !== null) {
    const orbIndex = context.tick - state.volleyTick;
    if (orbIndex >= 2) state.volleyTick = null;
    if (orbIndex === 1 || orbIndex === 2) {
      const volleyTarget = context.world.actors.get(state.volleyTargetId);
      return volleyTarget && isActorAlive(volleyTarget) ? throwOrb(actor, volleyTarget, orbIndex, attack, context) : idle;
    }
  }
  const target = config.selectTarget(actor, context);
  actor.combat.targetId = target?.id ?? null;
  const inReach = target !== null && target !== undefined && isNpcInAttackRange(actor, target, attack.range);
  if (!state.orbOrder) {
    if (inReach && context.tick >= actor.combat.nextActionTick) {
      state.orbOrder = [...charge.orders[Math.floor(context.random() * charge.orders.length)]];
      state.orbShownTicks = [];
      actor.combat.nextActionTick = context.tick + actor.combat.attackSpeed;
    }
    return idle;
  }
  const ticksLeft = actor.combat.nextActionTick - context.tick;
  if (ticksLeft === charge.chargeClipTicksLeft) {
    const animations = [{ actorId: actor.id, clipId: charge.chargeClip, delayCycles: 0 }];
    emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
    emitColosseumVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
  }
  if (ticksLeft > 0 || !inReach) {
    drawHeldOrbs(actor, charge, ticksLeft, context);
    return idle;
  }
  actor.combat.nextActionTick = context.tick + actor.combat.attackSpeed;
  state.volleyTick = context.tick;
  state.volleyTargetId = target.id;
  state.orbShownTicks = [];
  faceActorToward(actor, target);
  // The third orb leaves two ticks from now: its last drawing over the manticore.
  return throwOrb(actor, target, 0, attack, context, [heldOrbGraphic(actor, charge, 2)]);
}

const heldOrbGraphic = (actor, charge, orbIndex) => ({
  spotAnimId: charge.orbs[actor.state.orbOrder[orbIndex]].spotAnimId,
  actorId: actor.id,
  height: charge.heights[orbIndex],
});

// The orbs held over it as the charge runs out, one more at each of the
// last ticks; a held orb is drawn every `heldOrbGraphicTicks`, and once more
// before it leaves (colosseum/manticore.js, drawHeldOrbs).
function drawHeldOrbs(actor, charge, ticksLeft, context) {
  const state = actor.state;
  state.orbShownTicks ??= [];
  while (state.orbShownTicks.length < state.orbOrder.length && ticksLeft <= charge.firstOrbShownTicksLeft - state.orbShownTicks.length) {
    state.orbShownTicks.push(context.tick);
  }
  const held = state.orbShownTicks.flatMap((shownTick, orbIndex) => {
    const ticksUntilItLeaves = ticksLeft > 0 ? ticksLeft + orbIndex : Infinity;
    const isDrawn = (context.tick - shownTick) % charge.heldOrbGraphicTicks === 0
      ? ticksUntilItLeaves >= charge.heldOrbGraphicTicks
      : ticksUntilItLeaves === charge.heldOrbGraphicTicks;
    return isDrawn ? [heldOrbGraphic(actor, charge, orbIndex)] : [];
  });
  if (held.length > 0) emitHeldGraphics(context, held);
}

// Graphics on an actor, in both schemas: the default scene's (a target) and
// the hosts' scenes' (an actor id).
function emitHeldGraphics(context, graphics, projectiles = [], animations = []) {
  emitInfernoVisual(context.tickEvents, {
    animations: [],
    projectiles,
    graphics: graphics.map(({ spotAnimId, actorId, height, delayCycles }) => ({ spotAnimId, target: buildActorVisualTarget(context.world.actors.get(actorId)), height, delayCycles: delayCycles ?? 0 })),
  });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, actorId, height, delayCycles }) => ({ spotAnimId, actorId, height, delayCycles: delayCycles ?? 0 })),
  });
}

// One orb leaves: an attack of its own, its projectile, and its impact on a
// target that does not pray against it.
function throwOrb(actor, target, orbIndex, attack, context, graphics = []) {
  const charge = attack.chargedVolley;
  const orb = charge.orbs[actor.state.orbOrder[orbIndex]];
  const plan = { ...planOfStyle[orb.style], impactDelayTicks: charge.impactDelayTicks, sourceDeathPolicy: "persist" };
  const maxHit = actor.state.maxHit ?? orb.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  const rolled = rollNpcAttack({ attacker: actor, target, plan, random: context.random });
  if (!rolled) return { environmentalDamages: [] };
  const projectile = {
    ...charge.flight,
    spotAnimId: orb.spotAnimId,
    startOffset: charge.startOffsets[orbIndex],
    startHeight: charge.heights[orbIndex],
    sourcePosition: getProjectileSourcePosition(actor),
    target: buildActorVisualTarget(target),
  };
  const prayedAgainst = target.kind === "player" && isCorrectProtectionPrayer(planOfStyle[orb.style].damageType, target.activePrayer);
  if (!prayedAgainst) graphics.push({ spotAnimId: orb.impactSpotAnimId, actorId: target.id, height: charge.impactHeight, delayCycles: charge.flight.endDelayCycles });
  if (orbIndex === 0) {
    emitInfernoNpcAttack(context, { actor, target, clipId: attack.clip, kind: "sandbox_volley", impactDelayTicks: plan.impactDelayTicks, projectiles: [projectile] });
    emitHeldGraphics(context, graphics, [], []);
    emitColosseumVisual(context.tickEvents, { animations: [{ actorId: actor.id, clipId: attack.clip, delayCycles: 0 }], projectiles: [projectile], graphics: [] });
  } else {
    emitHeldGraphics(context, graphics, [projectile]);
  }
  actor.combat.attackStyle = orb.style;
  actor.combat.lastAttackTick = context.tick;
  return { environmentalDamages: [], npcAttacks: [rolled] };
}

// An attack of the encounter's own that lands on tiles (`special`: Sol
// Heredit's spear and shield, sol-heredit/sandbox.js). It decides now; the
// encounter lands it when it is due (encounter.js, landStrikes) and draws
// it. The NPC stands still `holdTicks` and acts again `nextActionTicks` later.
function special(actor, target, attack, context, config) {
  const started = attack.special.start({ actor, target, random: context.random });
  config.queueStrike({ landsAt: context.tick + started.landsInTicks, special: attack.special.id, data: started.data, attackerId: actor.id, targetId: target.id });
  actor.state.immobileUntilTick = context.tick + started.holdTicks;
  faceActorToward(actor, target);
  const animations = [{ actorId: actor.id, clipId: started.clipId, delayCycles: 0 }];
  // What it draws as it starts: on itself (`on: "self"`) or on a tile; and
  // what it throws at its target (the sparks of Zuk's healers).
  const graphics = started.graphics ?? [];
  const projectiles = (started.projectiles ?? []).map((projectile) => ({ ...projectile, sourcePosition: getProjectileSourcePosition(actor), target: buildActorVisualTarget(target) }));
  emitInfernoVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, on, tile, height, delayCycles }) => ({ spotAnimId, target: on === "self" ? buildActorVisualTarget(actor) : { kind: "tile", position: [...tile] }, height, delayCycles })),
  });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, on, tile, height, delayCycles }) => (on === "self" ? { spotAnimId, actorId: actor.id, height, delayCycles } : { spotAnimId, position: [...tile], height, delayCycles })),
  });
  actor.combat.attackStyle = attack.style;
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, started.nextActionTicks);
  return { environmentalDamages: [] };
}
