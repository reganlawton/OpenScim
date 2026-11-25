import { getPoweredStaffBaseMaxHit } from "../weapons.js";
import { getSpecialAttackDefinition } from "../../data/specialAttackDefinitions.js";
import { getWeaponCategoryDefinition } from "../../data/weaponCategories.js";
import { isSoulreaperAxe, getSoulreaperStackCount } from "../specialAttacks.js";
import { projectPlayerAttack } from "./projection.js";
import { applyGuaranteedHitOverrides, lowerDamageSpecMaximum, mapAttackPlanHits, rollAttackPlan } from "./roll.js";
import { buildPlayerAttackPlan } from "./plan.js";
import { selectPlayerAttackProfile } from "./profiles.js";
function scaleAttackPlanMaximumHit(attackPlan, maximumHitScale) {
  return mapAttackPlanHits(attackPlan, (plannedHit) => ({
    ...plannedHit,
    damage: lowerDamageSpecMaximum(plannedHit.damage, maximumHitScale),
  }));
}
function planPlayerAttack(attackInput, consumeGuaranteedMaximum, forceGuaranteedMaximum, maximumHitScale) {
  const profile = selectPlayerAttackProfile({
    weaponId: attackInput.player.equipment.weapon,
    headId: attackInput.player.equipment.head,
    bodyId: attackInput.player.equipment.body,
    legsId: attackInput.player.equipment.legs,
    formulaStyle: attackInput.formulaStyle,
    targetSize: attackInput.target.size,
    isSpecialAttack: attackInput.isSpecialAttack,
    resources: attackInput.resources,
    targetAttributes: attackInput.target.formulaStats?.attributes,
    targetMagicLevel: attackInput.target.formulaStats?.levels.magic,
    targetMagicAttackBonus: attackInput.target.formulaStats?.offensive.magic,
    targetCurrentHp: attackInput.target.vitals?.hp,
    targetMaxHp: attackInput.target.vitals?.maxHp,
    isTombsOfAmascut: attackInput.encounterRules?.isTombsOfAmascut === true,
    playerCurrentHp: attackInput.player.vitals?.hp ?? attackInput.player.stats.hitpoints.current,
    playerRangedLevel: attackInput.player.stats.ranged?.current,
    targetRangedLevel: attackInput.target.formulaStats?.levels.ranged,
    playerMissingPrayerPoints:
      attackInput.player.stats.prayer.max - attackInput.player.stats.prayer.current,
    markOfDarknessActive: attackInput.player.combatTimers.markOfDarknessActiveTicks > 0,
    demonbaneVulnerability: attackInput.target.formulaStats?.demonbaneVulnerability,
    soulreaperStacks: getSoulreaperStackCount(attackInput.player.soulreaper),
    combatStyle: getSelectedCombatStyle(attackInput.player),
    targetDistance: attackInput.targetDistance,
  });
  if (null === profile) {
    return null;
  }
  const weaponId = attackInput.player.equipment.weapon;
  const soulreaper = attackInput.player.soulreaper;
  const meleeStrengthBonusPercent = attackInput.isSpecialAttack || !isSoulreaperAxe(weaponId) ? 0 : 6 * getSoulreaperStackCount(soulreaper);
  const attackPlan = buildPlayerAttackPlan({
    player: attackInput.player,
    isTombsOfAmascut: attackInput.encounterRules?.isTombsOfAmascut === true,
    ...(0 === meleeStrengthBonusPercent
      ? {}
      : {
          meleeStrengthBonusPercent: meleeStrengthBonusPercent,
        }),
    target: attackInput.target,
    formulaStyle: attackInput.formulaStyle,
    resources: attackInput.resources,
    attackSpeedTicks: attackInput.attackSpeedTicks,
    delivery: attackInput.delivery,
    application: attackInput.application,
    profile: profile,
    manualCast: attackInput.manualCast,
    standardAccuracyMode: attackInput.standardAccuracyMode,
    ...getSpecialDefenceStyleOverride(attackInput),
    ...(attackInput.isSpecialAttack &&
    undefined !== attackInput.player.equipment.weapon &&
    getSpecialAttackDefinition(attackInput.player.equipment.weapon)?.poweredSpellWeaponId !== undefined
      ? {
          magicBaseMaxHitOverride: getPoweredStaffBaseMaxHit(
            getSpecialAttackDefinition(attackInput.player.equipment.weapon).poweredSpellWeaponId,
            attackInput.player.stats.magic.current,
          ),
        }
      : {}),
    ...(attackInput.lookupItemStats === undefined
      ? {}
      : {
          lookupItemStats: attackInput.lookupItemStats,
        }),
  });
  if (null === attackPlan || "unsupported" === attackPlan.kind) {
    return attackPlan;
  }
  const scaledAttackPlan =
    undefined === maximumHitScale
      ? attackPlan
      : scaleAttackPlanMaximumHit(attackPlan, maximumHitScale);
  const encounterContext = attackInput.encounterContext;
  const playerMinimumHit = attackInput.encounterRules?.playerMinimumHit;
  const formulaStats = attackInput.target.formulaStats;
  const style = attackInput.delivery.style;
  const guaranteedMaximum =
    (formulaStats?.alwaysMaximumPlayerHit === true &&
      ("magic" === style || "range_arrow" === attackInput.delivery.attackKind)) ||
    ("typeless" !== style &&
      formulaStats?.alwaysMaximumPlayerHitStyles?.includes(style) === true) ||
    forceGuaranteedMaximum ||
    (consumeGuaranteedMaximum &&
      undefined !== encounterContext &&
      (attackInput.encounterRules?.consumePlayerGuaranteedMaxHit?.(encounterContext) ??
        false));
  // The encounter's two rules are told the attack's style ("melee", "range",
  // "magic") and its target: the Leviathan's depend on both.
  const attack = { style, target: attackInput.target };
  return applyGuaranteedHitOverrides(scaledAttackPlan, {
    guaranteedAccuracy:
      true === attackInput.target.formulaStats?.alwaysAccuratePlayerHit ||
      (undefined !== encounterContext &&
        true === attackInput.encounterRules?.playerAlwaysAccurate?.(encounterContext, attack)),
    guaranteedMaximum: guaranteedMaximum,
    ...(playerMinimumHit === undefined || encounterContext === undefined
      ? {}
      : {
          minimumDamage: (maximumRolledDamage) => playerMinimumHit(maximumRolledDamage, encounterContext, attack),
        }),
  });
}
function summarizePrimaryHitAccuracy(attackPlan, attackOutcome) {
  const [primaryHit] = attackOutcome.hits;
  return {
    accurate: primaryHit?.accurate ?? false,
    chance: attackPlan === null ? 0 : (projectPlayerAttack(attackPlan).hits[0]?.accuracyProbability ?? 0),
  };
}
function rollAttackPlanOutcome(attackPlan, random, primaryHitAccuracy) {
  if (undefined !== primaryHitAccuracy) {
    return (function (attackPlan, random, primaryHitAccuracy) {
      const guaranteedAccuracyPlan = applyGuaranteedHitOverrides(attackPlan, {
        guaranteedAccuracy: true,
        guaranteedMaximum: false,
      });
      const guaranteedProjection = projectPlayerAttack(guaranteedAccuracyPlan);
      const accurateOutcome = primaryHitAccuracy.accurate ? rollAttackPlanOutcome(guaranteedAccuracyPlan, random) : null;
      return {
        hits:
          accurateOutcome?.hits ??
          guaranteedAccuracyPlan.hits.map((plannedHit) => ({
            damage: 0,
            accurate: false,
            style: plannedHit.style,
            attackKind: plannedHit.attackKind,
            impactDelayTicks: plannedHit.impactDelayTicks,
          })),
        maximumRolledDamages: guaranteedProjection.hits.map((projectedHit) => projectedHit.maximumRolledDamage),
        expectedHit: primaryHitAccuracy.chance * guaranteedProjection.expectedAppliedDamagePerAttack,
        selectedBranchIndex: accurateOutcome?.selectedBranchIndex ?? null,
      };
    })(attackPlan, random, primaryHitAccuracy);
  }
  const planRoll = rollAttackPlan(attackPlan, random);
  const projection = projectPlayerAttack(attackPlan);
  return {
    hits: planRoll.hits.map((rolledHit) => ({
      damage: rolledHit.rolledDamage,
      accurate: rolledHit.gatePassed && rolledHit.accuracySucceeded,
      style: rolledHit.style,
      attackKind: rolledHit.attackKind,
      impactDelayTicks: rolledHit.impactDelayTicks,
      ...(rolledHit.procActivated === true
        ? {
            procActivated: true,
            ...(rolledHit.procSpotAnimId === undefined ? {} : { procSpotAnimId: rolledHit.procSpotAnimId }),
            ...(rolledHit.procEffects === undefined ? {} : { procEffects: rolledHit.procEffects }),
          }
        : {}),
      ...(rolledHit.procSelfDamageRatio === undefined
        ? {}
        : {
            procSelfDamageRatio: rolledHit.procSelfDamageRatio,
          }),
    })),
    maximumRolledDamages: projection.hits.map((projectedHit) => projectedHit.maximumRolledDamage),
    // expectedHit is the expected damage of the whole attack: the sum over
    // all its hits (projectPlayerAttack), not the expectation of one hit.
    expectedHit: projection.expectedAppliedDamagePerAttack,
    selectedBranchIndex:
      "landed" === planRoll.selectedBranch?.kind ? planRoll.selectedBranch.index : null,
  };
}
function getSelectedCombatStyle(player) {
  const styles = getWeaponCategoryDefinition(player.equipment.weapon).styles;
  return (styles[player.selectedAttackStyleIndex] ?? styles[0])?.combatStyle;
}
function getSpecialDefenceStyleOverride(attackInput) {
  const weapon = attackInput.player.equipment.weapon;
  if (!attackInput.isSpecialAttack || undefined === weapon) {
    return {};
  }
  const defenceStyle = getSpecialAttackDefinition(weapon)?.defenceStyle;
  if (undefined === defenceStyle) {
    return {};
  } else {
    return {
      defenceStyle: defenceStyle,
    };
  }
}
export { planPlayerAttack, summarizePrimaryHitAccuracy, rollAttackPlanOutcome };
