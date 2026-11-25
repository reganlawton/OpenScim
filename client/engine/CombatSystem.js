import { logger } from "../util/logger.js";
import { resolveRolledDamage, applyPrayerReduction, isCorrectProtectionPrayer } from "./damage.js";
import { scheduleNpcRetaliation } from "./npcRetaliation.js";
import {
  isNpcAlive,
  isActorAlive,
  expediteQueuedNpcDeath,
  isActorInWorld,
  canNpcActAtTick,
  isActorAliveOrDeathPending,
  getActorLifeGeneration,
  recordNpcDeath,
  clearNpcPoison,
  clearNpcBurn,
  isNpcDeathAnimationTick,
} from "./npcState.js";
import {
  canApplyBurn,
  applyBurnStack,
  getPoisonDamage,
  ECLIPSE_BURN_SEVERITY,
  getPowerOfDeathDamageMultiplier,
  clearPowerOfDeathIfWeaponRemoved,
  applyOnHitSpecialEffects,
  isDamageIndependentSpecialEffect,
} from "./specialAttacks.js";
var NO_LAUNCH_DAMAGE_MULTIPLIERS = {
  incomingDamageMultiplier: undefined,
  outgoingDamageMultiplier: undefined,
  specDamageMultiplier: undefined,
};
function takeBurnPulse(actor, tick) {
  const burnStacks = actor.burnStacks;
  if (burnStacks === undefined || 0 === burnStacks.length) {
    return null;
  }
  if (!actor.alive) {
    clearNpcBurn(actor);
    return null;
  }
  if (actor.burnNextPulseTick === undefined || actor.burnNextPulseTick > tick) {
    return null;
  }
  const pulse = {
    sourceId: burnStacks[0].sourceId,
    stackCount: burnStacks.length,
  };
  const remainingStacks = burnStacks.flatMap((burnStack) =>
    burnStack.pulsesRemaining <= 1
      ? []
      : [
          {
            ...burnStack,
            pulsesRemaining: burnStack.pulsesRemaining - 1,
          },
        ],
  );
  actor.burnStacks = remainingStacks;
  actor.burnNextPulseTick = remainingStacks.length === 0 ? undefined : tick + 4;
  return pulse;
}
function takePoisonPulse(actor, tick) {
  const poison = actor.poison;
  if (undefined === poison) {
    return null;
  }
  if (!actor.alive) {
    clearNpcPoison(actor);
    return null;
  }
  if (poison.nextPulseTick > tick) {
    return null;
  }
  const pulse = {
    sourceId: poison.sourceId,
    damage: getPoisonDamage(poison.severity),
  };
  const nextSeverity = poison.severity - 1;
  if (nextSeverity <= 0) {
    clearNpcPoison(actor);
  } else {
    actor.poison = {
      ...poison,
      severity: nextSeverity,
      nextPulseTick: tick + 30,
    };
  }
  return pulse;
}
var CombatSystem = class {
  nextAttackTickByActor = new Map();
  scheduledAttackCycleByActor = new Map();
  appliedAttackSpeedupByActor = new Map();
  pendingHitRuntime = new WeakMap();
  enablePendingHits;
  defaultAttackSpeedTicks;
  random;
  constructor(options = {}) {
    this.enablePendingHits = options.enablePendingHits ?? false;
    this.defaultAttackSpeedTicks = Math.max(
      1,
      Math.floor(options.defaultAttackSpeedTicks ?? 1),
    );
    this.random = options.random ?? (() => Math.random());
  }
  reset() {
    this.nextAttackTickByActor.clear();
    this.scheduledAttackCycleByActor.clear();
    this.appliedAttackSpeedupByActor.clear();
    this.pendingHitRuntime = new WeakMap();
  }
  getNextAttackTick(actorId) {
    return this.nextAttackTickByActor.get(actorId);
  }
  reduceAttackDelay(actorId, reduceAttackDelayTicks, tick) {
    const nextAttackTick = this.nextAttackTickByActor.get(actorId);
    if (undefined === nextAttackTick || reduceAttackDelayTicks <= 0) {
      return;
    }
    const earliestAttackTick = tick + 1;
    this.nextAttackTickByActor.set(actorId, Math.min(nextAttackTick, Math.max(earliestAttackTick, nextAttackTick - reduceAttackDelayTicks)));
  }
  addAttackDelay(actorId, tick, attackDelayTicks) {
    if (attackDelayTicks <= 0) {
      return;
    }
    const nextAttackTick = this.nextAttackTickByActor.get(actorId);
    if (nextAttackTick !== undefined && tick < nextAttackTick) {
      this.nextAttackTickByActor.set(actorId, nextAttackTick + attackDelayTicks);
    }
  }
  getScheduledAttackCycle(actorId) {
    return this.scheduledAttackCycleByActor.get(actorId);
  }
  grantNextAttackSpeedup(actorId, speedupTicks, tick) {
    if (speedupTicks <= 0) {
      return;
    }
    const nextAttackTick = this.nextAttackTickByActor.get(actorId);
    if (nextAttackTick === undefined || nextAttackTick <= tick) {
      logger.info(
        "PerfectDodge",
        "(" +
          actorId +
          ") no active attack cooldown at tick " +
          tick +
          " — speedup not applicable",
      );
      return;
    }
    const alreadyAppliedSpeedup = this.appliedAttackSpeedupByActor.get(actorId) ?? 0;
    const attackCycleTicks =
      this.scheduledAttackCycleByActor.get(actorId) ?? this.defaultAttackSpeedTicks;
    const grantedSpeedupTicks = Math.min(speedupTicks - alreadyAppliedSpeedup, Math.max(0, attackCycleTicks - 1), nextAttackTick - tick);
    if (grantedSpeedupTicks <= 0) {
      logger.info(
        "PerfectDodge",
        "(" +
          actorId +
          ") speedup already applied this cooldown (no stacking) — next attack stays at tick " +
          nextAttackTick,
      );
      return;
    }
    const spedUpAttackTick = nextAttackTick - grantedSpeedupTicks;
    this.nextAttackTickByActor.set(actorId, spedUpAttackTick);
    this.scheduledAttackCycleByActor.set(actorId, attackCycleTicks - grantedSpeedupTicks);
    this.appliedAttackSpeedupByActor.set(actorId, alreadyAppliedSpeedup + grantedSpeedupTicks);
    logger.info(
      "PerfectDodge",
      "⚡ " +
        actorId +
        " next attack sped up by " +
        grantedSpeedupTicks +
        " tick(s): cooldown now ends at tick " +
        spedUpAttackTick +
        " instead of " +
        nextAttackTick +
        " (cycle " +
        attackCycleTicks +
        " -> " +
        (attackCycleTicks - grantedSpeedupTicks) +
        ").",
    );
  }
  // For an encounter (the tick context's delayNextAttack): the actor's next
  // attack comes that many ticks later than its cooldown ends, or than this
  // tick when it has none.
  delayNextAttack(actorId, delayTicks, tick) {
    if (delayTicks <= 0) {
      return;
    }
    const nextAttackTick = this.nextAttackTickByActor.get(actorId) ?? tick;
    this.nextAttackTickByActor.set(actorId, Math.max(nextAttackTick, tick) + delayTicks);
  }
  getAppliedAttackSpeedup(actorId) {
    return this.appliedAttackSpeedupByActor.get(actorId) ?? 0;
  }
  tryAttack(worldState, attacker, target, combatContext, attackOptions = {}) {
    const isAttackableTarget = attackOptions.acceptKillTickTarget === true ? isActorAliveOrDeathPending : isActorAlive;
    if (!this.canAttackerAct(worldState, attacker) || !isAttackableTarget(target)) {
      return false;
    }
    const tick = worldState.tick;
    if (!this.tryStartAttackCooldown(tick, attacker, combatContext)) {
      return false;
    }
    return this.launchAttack(
      worldState,
      {
        attacker: attacker,
        target: target,
        attack: this.resolveAttack(worldState, attacker, target, combatContext),
      },
      combatContext,
    );
  }
  tryLaunchAttack(worldState, attackRequest, combatContext) {
    if (!this.canAttackerAct(worldState, attackRequest.attacker) || !isActorAlive(attackRequest.target)) {
      return false;
    }
    return this.launchAttack(worldState, attackRequest, combatContext);
  }
  tryLaunchContinuationAttack(worldState, attackRequest, combatContext) {
    if (!this.canAttackerAct(worldState, attackRequest.attacker) || !this.canTargetBeHit(attackRequest.target)) {
      return false;
    }
    return this.launchAttack(worldState, attackRequest, combatContext, {
      emitAttackStarted: false,
    });
  }
  tryLaunchDeathAnimationAttack(worldState, attackRequest, combatContext) {
    const { attacker: attacker } = attackRequest;
    if (
      !this.isNpc(attacker) ||
      !isNpcDeathAnimationTick(attacker, worldState.tick) ||
      !isActorAlive(attackRequest.target)
    ) {
      return false;
    }
    return this.launchAttack(worldState, attackRequest, combatContext);
  }
  queueNpcHit(worldState, attackRequest, combatContext) {
    if (!this.canAttackerAct(worldState, attackRequest.attacker) || !isActorAlive(attackRequest.target)) {
      return false;
    }
    return this.launchAttack(
      worldState,
      attackRequest,
      {
        ...combatContext,
        enablePendingHits: true,
      },
      {
        emitAttackStarted: false,
        queueImmediateHit: true,
      },
    );
  }
  launchAttack(
    worldState,
    attackRequest,
    combatContext,
    launchOptions = {
      emitAttackStarted: true,
    },
  ) {
    const { attacker: attacker, target: target } = attackRequest;
    const isNpcAttackingPlayer = "npc" === attacker.kind && "player" === target.kind;
    const damageCapAtCalculation =
      isNpcAttackingPlayer && "none" !== attackRequest.attack.damageCap ? target.vitals.hp : undefined;
    let attack = attackRequest.attack;
    if (isNpcAttackingPlayer) {
      const rolledDamage = this.toNonNegativeInteger(resolveRolledDamage(attack.rolledDamage, this.random));
      const landedDamage = attack.accuracySucceeded ? rolledDamage : 0;
      const boostedDamage = landedDamage + Math.floor((landedDamage * (attack.damageBonusPercent ?? 0)) / 100);
      const scaledDamage = Math.max(
        0,
        Math.floor(boostedDamage * (combatContext.incomingDamageMultiplier ?? 1)),
      );
      attack = {
        ...attack,
        rolledDamage: scaledDamage,
        damageBonusPercent: undefined,
      };
    }
    const hitContext = isNpcAttackingPlayer
      ? {
          ...combatContext,
          incomingDamageMultiplier: undefined,
        }
      : combatContext;
    const tick = worldState.tick;
    combatContext.events.setCurrentTick(tick);
    if (launchOptions.emitAttackStarted) {
      const attackStartedEvent = {
        type: "attack_started",
        sourceId: attacker.id,
        targetId: target.id,
        style: attack.style,
        attackKind: attack.attackKind,
        spellId: attack.spellId,
        ...(undefined !== attack.spellId ||
        (attacker.kind === "player" && attack.style !== "melee")
          ? {
              spellCast: {
                sourcePosition: [attacker.position[0], attacker.position[1]],
                targetPosition: [target.position[0], target.position[1]],
                targetSize: target.size,
                accurate: attack.accuracySucceeded,
              },
            }
          : {}),
        usingSpecialAttack: attack.usingSpecialAttack,
        impactDelayTicks: attack.impactDelayTicks,
        weaponId: attack.weaponId,
        ammoId: attack.ammoId,
        ammoSource: attack.ammoSource,
        ...(attack.ricochets === undefined
          ? {}
          : {
              ricochets: attack.ricochets,
            }),
      };
      combatContext.events.emit(attackStartedEvent);
      combatContext.onAttackStarted?.();
    } else if ("player" === attacker.kind && undefined !== attack.spellId) {
      const spellTargetedEvent = {
        type: "spell_targeted",
        sourceId: attacker.id,
        targetId: target.id,
        spellId: attack.spellId,
        spellCast: {
          sourcePosition: [attacker.position[0], attacker.position[1]],
          targetPosition: [target.position[0], target.position[1]],
          targetSize: target.size,
          accurate: attack.accuracySucceeded,
        },
        impactDelayTicks: attack.impactDelayTicks,
        weaponId: attack.weaponId,
      };
      combatContext.events.emit(spellTargetedEvent);
    }
    attack = this.applyFreezeOnLaunch(attacker, target, attack, tick);
    const shouldQueueHit =
      this.isPendingHitsEnabled(combatContext) && (attack.impactDelayTicks > 0 || true === launchOptions.queueImmediateHit);
    const targetNpc = "player" === attacker.kind ? worldState.getNpc(target.id) : null;
    if (targetNpc) {
      scheduleNpcRetaliation(targetNpc, {
        sourceId: attacker.id,
        launchTick: tick,
        impactTick: tick + (shouldQueueHit ? attack.impactDelayTicks : 0),
        style: attack.style,
        accuracySucceeded: attack.accuracySucceeded,
      });
    }
    if (shouldQueueHit) {
      const rolledDamage = resolveRolledDamage(attack.rolledDamage, this.random);
      const hit = {
        sourceId: attacker.id,
        targetId: target.id,
        style: attack.style,
        attackKind: attack.attackKind,
        launchTick: tick,
        impactTick: tick + attack.impactDelayTicks,
        rolledDamage: attack.accuracySucceeded ? rolledDamage : 0,
        damageCapAtCalculation: damageCapAtCalculation,
        accuracySucceeded: attack.accuracySucceeded,
        damageBonusPercent: attack.damageBonusPercent,
        prayerCheckAt: attack.prayerCheckAt ?? "launch",
        // What the encounter's playerDamageOnNpc reads at impact; kept only when it has one.
        ...(combatContext.playerDamageOnNpc ? { weaponId: attack.weaponId, spellId: attack.spellId,
          ...(attack.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: attack.protectedByNpcPrayer }) } : {}),
        judgedProtectionPrayer: this.getActivePrayer(target),
        applyPoison: attack.applyPoison,
        usingSpecialAttack: attack.usingSpecialAttack,
        onKillEffect: attack.onKillEffect,
        postHitEffects: attack.postHitEffects,
        expectedHit: attack.expectedHit,
        sourceSelfDamageRatio: attack.sourceSelfDamageRatio,
        ...(attack.procSpotAnimId === undefined ? {} : { procSpotAnimId: attack.procSpotAnimId }),
        launchDamageMultipliers: {
          incomingDamageMultiplier: hitContext.incomingDamageMultiplier,
          outgoingDamageMultiplier: combatContext.outgoingDamageMultiplier,
          specDamageMultiplier: combatContext.specDamageMultiplier,
        },
        equipmentHitEffects: attack.equipmentHitEffects,
        sourceDeathPolicy:
          attack.sourceDeathPolicy ??
          ("player" === attacker.kind ? "persist" : "cancel-before-impact"),
      };
      this.queuePendingHit(worldState, hit, {
        source: attacker,
        target: target,
        prayerReduction: attack.prayerReduction,
        canHitPosition: attack.canHitPosition,
      });
      return true;
    }
    if (
      !this.isNpc(attacker) ||
      !!attacker.alive ||
      "player" !== target.kind ||
      (attack.sourceDeathPolicy ?? "cancel-before-impact") !==
        "cancel-before-impact"
    ) {
      this.applyHit(worldState, attacker, target, attack, hitContext, undefined, damageCapAtCalculation);
    }
    return true;
  }
  applyFreezeOnLaunch(attacker, target, attack, tick) {
    const postHitEffects = attack.postHitEffects;
    if (!postHitEffects?.some((postHitEffect) => postHitEffect.effect === "freeze")) {
      return attack;
    }
    if (attack.accuracySucceeded && this.isPlayer(attacker) && this.isNpc(target) && isNpcAlive(target)) {
      applyOnHitSpecialEffects(
        attacker,
        target,
        0,
        postHitEffects.filter((postHitEffect) => postHitEffect.effect === "freeze"),
        tick,
      );
    }
    const remainingEffects = postHitEffects.filter((postHitEffect) => postHitEffect.effect !== "freeze");
    return {
      ...attack,
      postHitEffects: remainingEffects.length > 0 ? remainingEffects : undefined,
    };
  }
  queuePendingHit(worldState, hit, runtime) {
    if (runtime.source.id !== hit.sourceId || runtime.target.id !== hit.targetId) {
      throw new Error(
        "queuePendingHit: runtime " +
          runtime.source.id +
          "->" +
          runtime.target.id +
          " does not match hit " +
          hit.sourceId +
          "->" +
          hit.targetId,
      );
    }
    const pendingHit = {
      ...hit,
      enqueueSequence: worldState.nextHitSequence,
    };
    worldState.nextHitSequence += 1;
    this.pendingHitRuntime.set(pendingHit, {
      ...runtime,
      sourceLife: getActorLifeGeneration(runtime.source),
      targetLife: getActorLifeGeneration(runtime.target),
    });
    worldState.pendingHits.push(pendingHit);
    return pendingHit;
  }
  resolvePendingHits(worldState, combatContext, targetKind) {
    if (worldState.pendingHits.length === 0) {
      return;
    }
    worldState.pendingHits = worldState.pendingHits.filter((pendingHit) => this.isPendingHitValid(worldState, pendingHit));
    const processedTargets = new Set();
    while (true) {
      const target = this.findNextPendingHitTarget(worldState, targetKind, processedTargets);
      if (target === null) {
        return;
      }
      processedTargets.add(target);
      this.resolvePendingHitsOnTarget(worldState, combatContext, target);
    }
  }
  resolvePendingHitsOnTarget(worldState, combatContext, target) {
    const targetNpc = this.isNpc(target) ? target : null;
    const deathBeforeHits = targetNpc?.death;
    let diedFromHit = false;
    let hitLandedAfterDeath = false;
    let lastEnqueueSequence = Number.NEGATIVE_INFINITY;
    while (isActorInWorld(worldState, target)) {
      const pendingHit = this.findNextPendingHit(worldState, target.id, lastEnqueueSequence);
      if (null === pendingHit) {
        break;
      }
      lastEnqueueSequence = pendingHit.enqueueSequence;
      const runtime = this.getPendingHitRuntime(pendingHit);
      if (runtime.target === target && this.isPendingHitValid(worldState, pendingHit)) {
        if (this.getPrayerCheckTick(pendingHit) === worldState.tick) {
          pendingHit.judgedProtectionPrayer = this.getActivePrayer(target);
        }
        if (!(pendingHit.impactTick > worldState.tick)) {
          this.removePendingHit(worldState, pendingHit);
          if (
            this.canTargetBeHit(target) &&
            runtime.canHitPosition?.(target.position) !== false &&
            ("cancel-before-impact" !== pendingHit.sourceDeathPolicy || runtime.source.alive)
          ) {
            this.applyHit(
              worldState,
              runtime.source,
              target,
              {
                style: pendingHit.style,
                attackKind: pendingHit.attackKind,
                rolledDamage: pendingHit.rolledDamage,
                accuracySucceeded: pendingHit.accuracySucceeded,
                impactDelayTicks: Math.max(0, pendingHit.impactTick - pendingHit.launchTick),
                damageBonusPercent: pendingHit.damageBonusPercent,
                applyPoison: pendingHit.applyPoison,
                prayerReduction: runtime.prayerReduction,
                usingSpecialAttack: pendingHit.usingSpecialAttack,
                onKillEffect: pendingHit.onKillEffect,
                postHitEffects: pendingHit.postHitEffects,
                expectedHit: pendingHit.expectedHit,
                sourceSelfDamageRatio: pendingHit.sourceSelfDamageRatio,
                procSpotAnimId: pendingHit.procSpotAnimId,
                equipmentHitEffects: pendingHit.equipmentHitEffects,
                prayerCheckAt: pendingHit.prayerCheckAt,
                weaponId: pendingHit.weaponId,
                spellId: pendingHit.spellId,
                ...(pendingHit.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: pendingHit.protectedByNpcPrayer }),
              },
              {
                ...combatContext,
                ...(pendingHit.launchDamageMultipliers ?? NO_LAUNCH_DAMAGE_MULTIPLIERS),
              },
              pendingHit.judgedProtectionPrayer,
              pendingHit.damageCapAtCalculation,
            );
            if (targetNpc !== null) {
              if (diedFromHit) {
                hitLandedAfterDeath = true;
              } else if (undefined !== targetNpc.death && targetNpc.death !== deathBeforeHits) {
                diedFromHit = true;
              }
            }
          }
        }
      } else {
        this.removePendingHit(worldState, pendingHit);
      }
    }
    if (targetNpc !== null && diedFromHit && (hitLandedAfterDeath || this.hasPendingHitOnTarget(worldState, targetNpc))) {
      expediteQueuedNpcDeath(targetNpc, worldState.tick);
    }
  }
  hasPendingHitOnTarget(worldState, targetNpc) {
    return worldState.pendingHits.some((pendingHit) => {
      if (pendingHit.targetId !== targetNpc.id || !this.isPendingHitValid(worldState, pendingHit)) {
        return false;
      }
      const runtime = this.getPendingHitRuntime(pendingHit);
      return "persist" === pendingHit.sourceDeathPolicy || runtime.source.alive;
    });
  }
  getPendingHitRuntime(pendingHit) {
    const runtime = this.pendingHitRuntime.get(pendingHit);
    if (runtime === undefined) {
      throw new Error(
        "pending hit #" +
          pendingHit.enqueueSequence +
          " (" +
          pendingHit.sourceId +
          "->" +
          pendingHit.targetId +
          ") was not queued through this CombatSystem.queuePendingHit",
      );
    }
    return runtime;
  }
  isPendingHitValid(worldState, pendingHit) {
    const runtime = this.getPendingHitRuntime(pendingHit);
    return (
      runtime.target === worldState.actors.get(pendingHit.targetId) &&
      getActorLifeGeneration(runtime.target) === runtime.targetLife &&
      ("persist" === pendingHit.sourceDeathPolicy ||
        (runtime.source === worldState.actors.get(pendingHit.sourceId) &&
          getActorLifeGeneration(runtime.source) === runtime.sourceLife))
    );
  }
  canTargetBeHit(target) {
    return (
      target.alive || (this.isNpc(target) && target.death !== undefined && 0 === target.vitals.hp)
    );
  }
  canAttackerAct(worldState, attacker) {
    if (this.isNpc(attacker)) {
      return canNpcActAtTick(attacker, worldState.tick);
    } else {
      return attacker.alive;
    }
  }
  findNextPendingHitTarget(worldState, targetKind, processedTargets) {
    for (const pendingHit of worldState.pendingHits) {
      const target = worldState.actors.get(pendingHit.targetId);
      if (
        undefined !== target &&
        !processedTargets.has(target) &&
        (undefined === targetKind || target.kind === targetKind)
      ) {
        return target;
      }
    }
    return null;
  }
  findNextPendingHit(worldState, targetId, lastEnqueueSequence) {
    let nextPendingHit = null;
    for (const pendingHit of worldState.pendingHits) {
      if (!(pendingHit.targetId !== targetId) && !(pendingHit.enqueueSequence <= lastEnqueueSequence)) {
        if (nextPendingHit === null || pendingHit.enqueueSequence < nextPendingHit.enqueueSequence) {
          nextPendingHit = pendingHit;
        }
      }
    }
    return nextPendingHit;
  }
  removePendingHit(worldState, pendingHit) {
    const index = worldState.pendingHits.indexOf(pendingHit);
    if (index !== -1) {
      worldState.pendingHits.splice(index, 1);
    }
  }
  applyBurnPulse(worldState, combatContext, target) {
    combatContext.events.setCurrentTick(worldState.tick);
    const burnPulse = takeBurnPulse(target, worldState.tick);
    if (burnPulse === null) {
      return;
    }
    const attacker = worldState.actors.get(burnPulse.sourceId);
    if (undefined !== attacker) {
      this.applyHit(
        worldState,
        attacker,
        target,
        {
          style: "typeless",
          attackKind: "typeless",
          rolledDamage: burnPulse.stackCount,
          accuracySucceeded: true,
          impactDelayTicks: 0,
          hitsplatType: "burn",
        },
        combatContext,
        undefined,
        undefined,
        "fixed",
      );
      if (!target.alive) {
        clearNpcBurn(target);
      }
    }
  }
  applyPoisonPulse(worldState, combatContext, target) {
    combatContext.events.setCurrentTick(worldState.tick);
    const poisonPulse = takePoisonPulse(target, worldState.tick);
    if (poisonPulse === null) {
      return;
    }
    const attacker = worldState.actors.get(poisonPulse.sourceId);
    if (undefined !== attacker) {
      this.applyHit(
        worldState,
        attacker,
        target,
        {
          style: "typeless",
          attackKind: "typeless",
          rolledDamage: poisonPulse.damage,
          accuracySucceeded: true,
          impactDelayTicks: 0,
          hitsplatType: "poison",
        },
        combatContext,
        undefined,
        undefined,
        "fixed",
      );
      if (!target.alive) {
        clearNpcPoison(target);
      }
    }
  }
  getPrayerCheckTick(pendingHit) {
    const prayerCheckAt = pendingHit.prayerCheckAt ?? "launch";
    if ("launch" === prayerCheckAt) {
      return pendingHit.launchTick;
    } else if ("impact" === prayerCheckAt) {
      return pendingHit.impactTick;
    } else {
      return Math.min(pendingHit.impactTick, pendingHit.launchTick + prayerCheckAt.afterLaunchTicks);
    }
  }
  tryStartAttackCooldown(tick, attacker, combatContext) {
    if (
      tick < (this.nextAttackTickByActor.get(attacker.id) ?? Number.NEGATIVE_INFINITY)
    ) {
      // Allowed on cooldown by the encounter (performPlayerAutoAttack): the
      // timer stays as it was, or starts again from this attack.
      const attackOnCooldown = combatContext.attackOnCooldown;
      if (!attackOnCooldown) {
        return false;
      }
      if (attackOnCooldown.keepCooldown) {
        return true;
      }
    } else if (combatContext.keepsReady) {
      return true; // a ready weapon the encounter keeps ready (playerAttackKeepsReady)
    }
    const attackSpeed = this.getAttackSpeed(attacker, combatContext);
    const attackCycleTicks = Math.max(1, attackSpeed);
    this.nextAttackTickByActor.set(attacker.id, tick + attackCycleTicks);
    this.scheduledAttackCycleByActor.set(attacker.id, attackCycleTicks);
    this.appliedAttackSpeedupByActor.delete(attacker.id);
    return true;
  }
  resolveAttack(worldState, attacker, target, combatContext) {
    const attackStyle = this.getDefaultAttackStyle(attacker);
    const defaultAttack = {
      style: attackStyle,
      attackKind: this.getDefaultAttackKind(attackStyle),
      rolledDamage: 0,
      accuracySucceeded: true,
      impactDelayTicks: 0,
    };
    const resolvedAttack = combatContext.resolveAttack?.(worldState, attacker, target);
    if (resolvedAttack) {
      return {
        style: resolvedAttack.style ?? defaultAttack.style,
        attackKind: resolvedAttack.attackKind ?? defaultAttack.attackKind,
        rolledDamage: resolvedAttack.rolledDamage ?? defaultAttack.rolledDamage,
        accuracySucceeded: resolvedAttack.accuracySucceeded ?? defaultAttack.accuracySucceeded,
        impactDelayTicks: this.toNonNegativeInteger(resolvedAttack.impactDelayTicks ?? defaultAttack.impactDelayTicks),
        applyPoison: resolvedAttack.applyPoison,
        prayerReduction: resolvedAttack.prayerReduction ?? defaultAttack.prayerReduction,
        spellId: resolvedAttack.spellId ?? defaultAttack.spellId,
        usingSpecialAttack: resolvedAttack.usingSpecialAttack ?? defaultAttack.usingSpecialAttack,
        onKillEffect: resolvedAttack.onKillEffect,
        postHitEffects: resolvedAttack.postHitEffects,
        weaponId: resolvedAttack.weaponId,
        ...(resolvedAttack.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: resolvedAttack.protectedByNpcPrayer }),
        ammoId: resolvedAttack.ammoId,
        ammoSource: resolvedAttack.ammoSource,
        expectedHit: resolvedAttack.expectedHit,
        sourceSelfDamageRatio: resolvedAttack.sourceSelfDamageRatio,
        procSpotAnimId: resolvedAttack.procSpotAnimId,
        equipmentHitEffects: resolvedAttack.equipmentHitEffects,
        prayerCheckAt: resolvedAttack.prayerCheckAt ?? defaultAttack.prayerCheckAt,
        damageBonusPercent: resolvedAttack.damageBonusPercent,
        damageCap: resolvedAttack.damageCap,
        ricochets: resolvedAttack.ricochets,
        sourceDeathPolicy: resolvedAttack.sourceDeathPolicy,
      };
    } else {
      return defaultAttack;
    }
  }
  applyHit(worldState, attacker, target, attack, combatContext, judgedProtectionPrayer, damageCapAtCalculation, damageMode = "standard") {
    if (!target.alive) {
      this.applyBlockedHit(worldState, attacker, target, attack, combatContext);
      return;
    }
    const rolledDamage = this.toNonNegativeInteger(resolveRolledDamage(attack.rolledDamage, this.random));
    const minimumDamage = "player" === attacker.kind ? 1 : 0;
    let baseDamage = attack.accuracySucceeded ? Math.max(minimumDamage, rolledDamage) : 0;
    if (attack.damageBonusPercent) {
      baseDamage += Math.floor((baseDamage * attack.damageBonusPercent) / 100);
    }
    if (
      "standard" === damageMode &&
      undefined !== combatContext.outgoingDamageMultiplier &&
      "player" === attacker.kind
    ) {
      baseDamage = Math.max(0, Math.floor(baseDamage * combatContext.outgoingDamageMultiplier));
    }
    if (
      "standard" === damageMode &&
      undefined !== combatContext.specDamageMultiplier &&
      attack.usingSpecialAttack &&
      "player" === attacker.kind
    ) {
      baseDamage = Math.max(0, Math.floor(baseDamage * combatContext.specDamageMultiplier));
    }
    // The encounter's say over a player's hit on one of its NPCs, at impact.
    if (combatContext.playerDamageOnNpc && "player" === attacker.kind && this.isNpc(target)) {
      baseDamage = Math.max(0, Math.floor(combatContext.playerDamageOnNpc(baseDamage, { attacker, target, attack })));
    }
    const appliedDamage = this.applyDamage(
      attacker,
      target,
      baseDamage,
      attack.style,
      worldState.tick,
      combatContext,
      attack.prayerReduction,
      attack.accuracySucceeded ? attack.applyPoison : undefined,
      attack.onKillEffect,
      attack.expectedHit,
      judgedProtectionPrayer,
      damageCapAtCalculation,
      // The cause stage of an NPC's death record (recordNpcDeath): "timer" for
      // a burn or poison pulse, "hit-queue" for every other hit, whether it
      // waited in the queue or was applied at once.
      "burn" === attack.hitsplatType || "poison" === attack.hitsplatType
        ? "timer"
        : "hit-queue",
    );
    combatContext.events.setCurrentTick(worldState.tick);
    const hitAppliedEvent = {
      type: "hit_applied",
      targetId: target.id,
      targetPosition: [...target.position],
      damage: appliedDamage.effectiveDamage,
      blocked: appliedDamage.effectiveDamage === 0,
      attackKind: attack.attackKind,
      prayedCorrectly: appliedDamage.prayedCorrectly,
      accurate: attack.accuracySucceeded,
    };
    combatContext.events.emit(hitAppliedEvent);
    const hitsplatEvent = {
      type: "hitsplat_spawned",
      targetId: target.id,
      amount: appliedDamage.effectiveDamage,
      hitsplatType:
        attack.hitsplatType ?? (appliedDamage.effectiveDamage > 0 ? "damage" : "block"),
    };
    combatContext.events.emit(hitsplatEvent);
    // An enchanted bolt's effect shows on the target as the bolt lands.
    if (attack.procSpotAnimId !== undefined && attack.accuracySucceeded && this.isNpc(target)) {
      combatContext.events.emit({
        type: "npc_graphic_applied",
        targetId: target.id,
        spotAnimId: attack.procSpotAnimId,
        height: 0,
      });
    }
    combatContext.onDamageApplied?.(appliedDamage);
    if (attack.postHitEffects && this.isPlayer(attacker) && this.isNpc(target)) {
      const applicableEffects =
        appliedDamage.effectiveDamage > 0
          ? attack.postHitEffects
          : attack.accuracySucceeded
            ? attack.postHitEffects.filter(isDamageIndependentSpecialEffect)
            : [];
      if (applicableEffects.length > 0) {
        applyOnHitSpecialEffects(attacker, target, appliedDamage.effectiveDamage, applicableEffects, worldState.tick, baseDamage);
      }
    }
    if (attack.equipmentHitEffects && this.isPlayer(attacker) && this.isNpc(target)) {
      const equipmentHitParams = {
        snapshot: attack.equipmentHitEffects,
        accurate: attack.accuracySucceeded,
        target: target,
        sourceId: attacker.id,
        impactTick: worldState.tick,
        roll: this.random,
      };
      if (
        equipmentHitParams.snapshot.eclipseBurn &&
        equipmentHitParams.accurate &&
        canApplyBurn(equipmentHitParams.target, ECLIPSE_BURN_SEVERITY)
      ) {
        if (!(equipmentHitParams.roll() >= 0.2)) {
          applyBurnStack({
            target: equipmentHitParams.target,
            sourceId: equipmentHitParams.sourceId,
            origin: "eclipse",
            severity: ECLIPSE_BURN_SEVERITY,
            pulses: 10,
            tick: equipmentHitParams.impactTick,
          });
        }
      }
    }
    if (
      attack.accuracySucceeded &&
      undefined !== attack.sourceSelfDamageRatio &&
      this.isPlayer(attacker)
    ) {
      const sourceSelfDamageRatio = attack.sourceSelfDamageRatio;
      const selfDamage = Math.min(
        attacker.vitals.hp - 1,
        Math.floor(
          (attacker.vitals.hp * sourceSelfDamageRatio.numerator) /
            sourceSelfDamageRatio.denominator,
        ),
      );
      if (selfDamage > 0) {
        clearPowerOfDeathIfWeaponRemoved(attacker, selfDamage);
        attacker.vitals.hp -= selfDamage;
        attacker.stats.hitpoints.current = attacker.vitals.hp;
        combatContext.events.emit({
          type: "hitsplat_spawned",
          targetId: attacker.id,
          amount: selfDamage,
          hitsplatType: "damage",
        });
        combatContext.onSourceSelfDamageApplied?.();
      }
    }
    if (!target.alive) {
      const actorDiedEvent = {
        type: "actor_died",
        actorId: target.id,
      };
      combatContext.events.emit(actorDiedEvent);
    }
  }
  // The hit of applyHit on a target that is already dead. Nothing was
  // blocked: no damage is applied, and a hit_applied event with
  // `blocked: true`, a block hitsplat and a damage record of 0 go out.
  applyBlockedHit(worldState, attacker, target, attack, combatContext) {
    const activePrayer = this.getActivePrayer(target);
    const prayedCorrectly = attack.style === "typeless" ? null : this.isCorrectProtectionPrayer(attack.style, activePrayer);
    combatContext.events.setCurrentTick(worldState.tick);
    combatContext.events.emit({
      type: "hit_applied",
      targetId: target.id,
      targetPosition: [...target.position],
      damage: 0,
      blocked: true,
      attackKind: attack.attackKind,
      prayedCorrectly: prayedCorrectly,
      accurate: attack.accuracySucceeded,
    });
    combatContext.events.emit({
      type: "hitsplat_spawned",
      targetId: target.id,
      amount: 0,
      hitsplatType: "block",
    });
    combatContext.onDamageApplied?.({
      tick: worldState.tick,
      sourceId: attacker.id,
      targetId: target.id,
      attackType: attack.style,
      baseDamage: 0,
      effectiveDamage: 0,
      activePrayer: activePrayer,
      prayedCorrectly: prayedCorrectly,
      hpBefore: target.vitals.hp,
      hpAfter: target.vitals.hp,
      expectedHit: attack.expectedHit,
      ...(this.isNpc(attacker)
        ? {
            sourceNpcTypeId: attacker.npcTypeId,
          }
        : {}),
    });
  }
  getAttackSpeed(attacker, combatContext) {
    const contextAttackSpeed = combatContext.getAttackSpeed?.(attacker);
    if ("number" == typeof contextAttackSpeed && contextAttackSpeed > 0) {
      return Math.floor(contextAttackSpeed);
    }
    if (this.isNpc(attacker)) {
      return Math.max(1, Math.floor(attacker.combat.attackSpeed));
    }
    const combatTimers = attacker.combatTimers;
    if (
      combatTimers &&
      "number" == typeof combatTimers.attackSpeed &&
      combatTimers.attackSpeed > 0
    ) {
      return Math.floor(combatTimers.attackSpeed);
    } else {
      return this.defaultAttackSpeedTicks;
    }
  }
  isPendingHitsEnabled(combatContext) {
    if ("boolean" == typeof combatContext.enablePendingHits) {
      return combatContext.enablePendingHits;
    } else {
      return this.enablePendingHits;
    }
  }
  getDefaultAttackStyle(attacker) {
    if (this.isNpc(attacker)) {
      return attacker.combat.attackStyle;
    } else {
      return "melee";
    }
  }
  getDefaultAttackKind(attackStyle) {
    if ("magic" === attackStyle) {
      return "magic_fire";
    } else if ("range" === attackStyle) {
      return "range_arrow";
    } else if (attackStyle === "melee") {
      return "melee_crush";
    } else {
      return "magic_shadow";
    }
  }
  getActivePrayer(target) {
    if (this.hasActivePrayer(target)) {
      return target.activePrayer;
    } else {
      return null;
    }
  }
  toNonNegativeInteger(amount) {
    if (Number.isFinite(amount)) {
      return Math.max(0, Math.floor(amount));
    } else {
      return 0;
    }
  }
  applyPrayerReduction(baseDamage, attackType, activePrayer, prayerReduction) {
    return applyPrayerReduction(baseDamage, attackType, activePrayer, prayerReduction);
  }
  applyDamage(attacker, target, baseDamage, attackType, tick, combatContext, prayerReduction, applyPoison, onKillEffect, expectedHit, judgedProtectionPrayer, damageCapAtCalculation, deathCauseStage = "hit-queue") {
    const hpBefore = target.vitals.hp;
    const activePrayer = undefined !== judgedProtectionPrayer ? judgedProtectionPrayer : this.getActivePrayer(target);
    if (this.isPlayer(target) && "melee" === attackType) {
      baseDamage = Math.floor(baseDamage * getPowerOfDeathDamageMultiplier(target, tick));
    }
    if (combatContext.incomingDamageMultiplier !== undefined && "player" === target.kind) {
      baseDamage = Math.max(0, Math.floor(baseDamage * combatContext.incomingDamageMultiplier));
    }
    const prayerReducedDamage = this.applyPrayerReduction(baseDamage, attackType, activePrayer, prayerReduction);
    const cappedDamage = undefined === damageCapAtCalculation ? prayerReducedDamage : Math.min(prayerReducedDamage, damageCapAtCalculation);
    const shieldReducedDamage =
      cappedDamage > 0 && this.isNpc(attacker) && this.isPlayer(target) && target.equipment.shield === 12817 // Elysian spirit shield
        ? this.random() < 0.7
          ? Math.floor(cappedDamage * 0.75)
          : cappedDamage
        : cappedDamage;
    const effectiveDamage = this.isNpc(target) ? Math.min(shieldReducedDamage, Math.max(0, hpBefore)) : shieldReducedDamage;
    const targetHasInfiniteHealth = combatContext.infiniteHealth && "player" === target.kind;
    if (!targetHasInfiniteHealth && this.isPlayer(target)) {
      clearPowerOfDeathIfWeaponRemoved(target, effectiveDamage);
    }
    if (!targetHasInfiniteHealth) {
      target.vitals.hp -= effectiveDamage;
      if (target.vitals.hp < 0) {
        target.vitals.hp = 0;
      }
    }
    const prayedCorrectly = "typeless" === attackType ? null : this.isCorrectProtectionPrayer(attackType, activePrayer);
    if (!targetHasInfiniteHealth && target.vitals.hp <= 0) {
      if (this.isNpc(target)) {
        recordNpcDeath(target, tick, deathCauseStage);
      } else {
        target.alive = false;
      }
    }
    return {
      tick: tick,
      sourceId: attacker.id,
      targetId: target.id,
      attackType: attackType,
      baseDamage: baseDamage,
      effectiveDamage: effectiveDamage,
      activePrayer: activePrayer,
      prayedCorrectly: prayedCorrectly,
      hpBefore: hpBefore,
      hpAfter: target.vitals.hp,
      applyPoison: applyPoison,
      onKillEffect: hpBefore > 0 && !target.alive ? onKillEffect : undefined,
      expectedHit: expectedHit,
      ...(this.isNpc(attacker)
        ? {
            sourceNpcTypeId: attacker.npcTypeId,
          }
        : {}),
    };
  }
  isCorrectProtectionPrayer(attackType, activePrayer) {
    return isCorrectProtectionPrayer(attackType, activePrayer);
  }
  isNpc(actor) {
    return actor.kind === "npc";
  }
  isPlayer(actor) {
    return "player" === actor.kind;
  }
  // True for an actor that has the field `activePrayer` at all, which only
  // the player record has; it does not say that a prayer is on.
  hasActivePrayer(actor) {
    return "activePrayer" in actor;
  }
};
export { CombatSystem };
