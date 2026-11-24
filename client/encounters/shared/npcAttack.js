import { isFootprintInAttackRange, areFootprintsOverlapping } from "../../engine/attackRange.js";
import { createRandomDecisions } from "../../engine/decisions.js";
import {
  getNpcAttackAccuracy,
  getPrayerMultipliers,
  getFormulaMaxHit,
  getDrainedNpcFormulaStats,
  getPlayerFormulaStats,
} from "../../engine/combatFormulas.js";
import { getProjectileFlightCycles, getTicksFromCycles } from "../../engine/projectiles.js";
function rollNpcAccuracyAndDamage(rollOptions) {
  let targetEquipmentStats;
  let targetPrayerMultipliers;
  if ("targetEquipmentStats" in rollOptions) {
    targetEquipmentStats = rollOptions.targetEquipmentStats;
    targetPrayerMultipliers = rollOptions.targetPrayerMultipliers;
  } else {
    targetEquipmentStats = {
      attackStab: 0,
      attackSlash: 0,
      attackCrush: 0,
      attackMagic: 0,
      attackRanged: 0,
      defenceStab: 0,
      defenceSlash: 0,
      defenceCrush: 0,
      defenceMagic: 0,
      defenceRanged: 0,
      meleeStrength: 0,
      rangedStrength: 0,
      magicDamage: 0,
      prayer: 0,
      attackSpeed: 4,
      attackRange: 1,
    };
  }
  const accuracy = getNpcAttackAccuracy(rollOptions.attacker, rollOptions.target, rollOptions.style, targetEquipmentStats, targetPrayerMultipliers);
  const maxHit = rollOptions.maxHitOverride ?? getFormulaMaxHit(rollOptions.attacker, rollOptions.style, targetEquipmentStats);
  const decisions = rollOptions.labelled?.decisions ?? createRandomDecisions(rollOptions.random);
  const decisionKey = rollOptions.labelled?.key ?? {
    tick: -1,
  };
  return {
    accuracy: accuracy,
    accuracySucceeded: decisions.chance(
      {
        ...decisionKey,
        site: "npc.attack.accuracy",
      },
      accuracy,
    ),
    maxHit: maxHit,
    rolledDamage: decisions.int(
      {
        ...decisionKey,
        site: "npc.attack.damage",
      },
      Math.min(Math.max(0, Math.trunc(rollOptions.minHitOverride ?? 0)), Math.max(0, Math.trunc(maxHit))),
      Math.max(0, Math.trunc(maxHit)),
    ),
  };
}
function getDistanceFromNpcCentre(attacker, target) {
  const centreX = attacker.position[0] + Math.floor(attacker.size / 2);
  const centreY = attacker.position[1] + Math.floor(attacker.size / 2);
  return Math.max(Math.abs(centreX - target.position[0]), Math.abs(centreY - target.position[1]));
}
function getNpcProjectileFlightTicks(attacker, target, timing) {
  return getTicksFromCycles(getProjectileFlightCycles(timing, getDistanceFromNpcCentre(attacker, target)));
}
function rollNpcAttackAgainstNpc(rollOptions) {
  const targetFormulaStats = getDrainedNpcFormulaStats(rollOptions.target);
  if (targetFormulaStats) {
    return rollNpcAccuracyAndDamage({
      attacker: rollOptions.attacker,
      target: targetFormulaStats,
      style: rollOptions.style,
      random: rollOptions.random,
      ...(rollOptions.labelled
        ? {
            labelled: rollOptions.labelled,
          }
        : {}),
      ...(rollOptions.maxHitOverride === undefined
        ? {}
        : {
            maxHitOverride: rollOptions.maxHitOverride,
          }),
      minHitOverride: rollOptions.minHitOverride,
    });
  } else {
    return null;
  }
}
function rollNpcAttack(attackOptions) {
  const { attacker: attacker, target: target, plan: plan, random: random } = attackOptions;
  const attackerFormulaStats = getDrainedNpcFormulaStats(attacker);
  if (!attackerFormulaStats) {
    return null;
  }
  const labelledOptions = attackOptions.labelled
    ? {
        labelled: {
          decisions: attackOptions.labelled.decisions,
          key: {
            tick: attackOptions.labelled.tick,
            actorId: attacker.id,
            targetId: target.id,
          },
        },
      }
    : {};
  const rolledAttack =
    target.kind === "player"
      ? rollNpcAccuracyAndDamage({
          attacker: attackerFormulaStats,
          target: getPlayerFormulaStats(target),
          targetEquipmentStats: target.equipmentStats,
          targetPrayerMultipliers: getPrayerMultipliers(
            target.activePrayer,
            target.offensivePrayer,
          ),
          style: plan.formulaStyle,
          minHitOverride: plan.minHit,
          random: random,
          ...labelledOptions,
          ...(plan.maxHit === undefined
            ? {}
            : {
                maxHitOverride: plan.maxHit,
              }),
        })
      : rollNpcAttackAgainstNpc({
          attacker: attackerFormulaStats,
          target: target,
          style: plan.formulaStyle,
          minHitOverride: plan.minHit,
          random: random,
          ...labelledOptions,
          ...(plan.maxHit === undefined
            ? {}
            : {
                maxHitOverride: plan.maxHit,
              }),
        });
  if (rolledAttack) {
    return {
      attackerId: attacker.id,
      targetId: target.id,
      style: plan.damageType,
      attackKind: plan.attackKind,
      rolledDamage: rolledAttack.rolledDamage,
      accuracySucceeded: plan.alwaysHits === true || rolledAttack.accuracySucceeded,
      impactDelayTicks:
        (plan.windupTicks ?? 0) +
        (plan.projectile
          ? getNpcProjectileFlightTicks(attacker, target, plan.projectile)
          : plan.impactDelayTicks),
      ...(plan.prayerCheckAt === undefined
        ? {}
        : {
            prayerCheckAt: plan.prayerCheckAt,
          }),
      sourceDeathPolicy: plan.sourceDeathPolicy,
    };
  } else {
    return null;
  }
}
function isNpcInAttackRange(attacker, target, attackRange) {
  return (
    !(attackRange <= 0) &&
    !areFootprintsOverlapping(attacker, target) &&
    isFootprintInAttackRange(
      {
        southWest: target.position,
        width: target.size,
        height: target.size,
      },
      {
        southWest: attacker.position,
        width: attacker.size,
        height: attacker.size,
      },
      {
        attackRange: attackRange,
        checkCollision: true,
        meleeReach: attacker.combat.meleeReach,
      },
    )
  );
}
export { getDistanceFromNpcCentre, rollNpcAttack, isNpcInAttackRange };
