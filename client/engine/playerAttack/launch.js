import {
  getHitDelayWeaponKind,
  formulaStyleToAttackKind,
  getWeaponProjectileTiming,
  formulaStyleToAttackStyle,
  computePlayerCombatParams,
  getWeaponFormulaStyle,
} from "../weapons.js";
import { getCanonicalEquipmentId } from "../../data/equipment.js";
import { getSpellDefinition } from "../../data/combatSpells.js";
import { getBaseItemId } from "../../data/itemVariants.js";
import { getSpecialAttackDefinition } from "../../data/specialAttackDefinitions.js";
import { getActiveSpell, getWeaponCategoryDefinition } from "../../data/weaponCategories.js";
import { scheduleNpcRetaliation } from "../npcRetaliation.js";
import { isTileInsideFootprint, getDistanceToFootprint, hasLineOfSight, isTileInAttackRange } from "../attackRange.js";
import { isActorAlive, isNpcAttackableAtTick, isActorAliveOrDeathPending } from "../npcState.js";
import { getHitDelayTicksFromCycles, getProjectileFlightCycles, getHitDelayTicks, projectileTimings } from "../projectiles.js";
import {
  isSoulreaperAxe,
  getSoulreaperStackCount,
  spendSpecialAttackEnergy,
  normalizeOptionalItemId,
  applySpecialAttackEffects,
} from "../specialAttacks.js";
import { NO_ATTACK_RESOURCES, resolveAttackResources } from "../attackResources.js";
import { isConflictionGauntletsAttack, isSameConflictionAttack } from "./projection.js";
import { getChinchompaAreaConfig } from "./formula.js";
import { planPlayerAttack, summarizePrimaryHitAccuracy, rollAttackPlanOutcome } from "./planPlayerAttack.js";
function resolveValueOrCallback(valueOrCallback, encounterContext) {
  if (typeof valueOrCallback == "function") {
    return valueOrCallback(encounterContext);
  } else {
    return valueOrCallback;
  }
}
function canPlayerTargetActor(player, actor) {
  if (player.manualCastSpell) {
    return isActorAliveOrDeathPending(actor);
  } else {
    return isActorAlive(actor);
  }
}
function clearPlayerAttackTarget(player) {
  player.attackTarget = null;
  player.attackInteractionActive = false;
  player.manualCastSpell = null;
}
function setPlayerAttackTarget(player, worldState, inputOp) {
  const targetNpc = null === inputOp.targetId ? null : worldState.getNpc(inputOp.targetId);
  if (!targetNpc || isNpcAttackableAtTick(targetNpc, worldState.tick)) {
    player.attackTarget = inputOp.targetId;
    if (targetNpc) {
      player.lastAttackTarget = targetNpc.id;
    }
    player.attackInteractionActive = inputOp.targetId !== null;
    player.manualCastSpell = inputOp.targetId === null ? null : inputOp.manualCastSpell;
  } else {
    clearPlayerAttackTarget(player);
  }
}
function clearInvalidPlayerAttackTarget(player, worldState) {
  const targetNpc = null === player.attackTarget ? null : worldState.getNpc(player.attackTarget);
  if (!targetNpc || isNpcAttackableAtTick(targetNpc, worldState.tick)) {
    return false;
  }
  clearPlayerAttackTarget(player);
  return true;
}
var SHARED_XP_PER_DAMAGE = 4 / 3;
var BLOOD_FURY_HEAL_GRAPHIC = {
  spotAnimId: 1542,
  height: 92,
};
function rollBloodFuryHeal(landedHit) {
  if (
    landedHit.amuletId !== 24780 || // Amulet of blood fury
    landedHit.attackType !== "melee" ||
    landedHit.damage <= 0 ||
    landedHit.roll() >= 0.2
  ) {
    return null;
  } else {
    return Math.floor(0.3 * landedHit.damage);
  }
}
var ancientSceptreIdSet = new Set([27624, 28260, 28264, 28262, 28266]);
function applyAncientSceptreBonus(effectMagnitude) {
  return (effectMagnitude * 11) / 10;
}
function isAncientSceptreEquipped(equipment) {
  const weapon = equipment.weapon;
  return weapon !== undefined && ancientSceptreIdSet.has(getCanonicalEquipmentId(weapon));
}
function rollSpellSecondaryEffects(spellId, random, equipment) {
  const secondaryEffect = getSpellSecondaryEffect(spellId);
  if (undefined === secondaryEffect) {
    return;
  }
  const hasAncientSceptre = isAncientSceptreEquipped(equipment);
  switch (secondaryEffect.kind) {
    case "poison":
      if (random() >= 0.125) {
        return;
      }
      return [
        {
          effect: "poison",
          severity: hasAncientSceptre ? Math.floor(applyAncientSceptreBonus(secondaryEffect.severity)) : secondaryEffect.severity,
        },
      ];
    case "drain_attack":
      return [
        {
          effect: "drain_attack",
          percent: hasAncientSceptre ? applyAncientSceptreBonus(secondaryEffect.percent) : secondaryEffect.percent,
        },
      ];
    case "freeze":
      return [
        {
          effect: "freeze",
          durationTicks: hasAncientSceptre
            ? Math.floor(applyAncientSceptreBonus(secondaryEffect.durationTicks))
            : secondaryEffect.durationTicks,
        },
      ];
    case "leech_hp":
      return;
  }
}
function getSpellSecondaryEffect(spellId) {
  if (spellId === undefined) {
    return undefined;
  } else {
    return getSpellDefinition(spellId)?.secondaryEffect;
  }
}
// An enchanted bolt's landing effects (Life Leech's heal, Magical Poison,
// Clear Mind) join the hit's other effects.
function withBoltProcEffects(postHitEffects, procEffects) {
  if (procEffects === undefined) {
    return postHitEffects;
  }
  return [...(postHitEffects ?? []), ...procEffects];
}
function filterPostHitEffectsByChance(postHitEffects, selectedBranchIndex, random) {
  if (undefined !== postHitEffects) {
    return postHitEffects.filter((postHitEffect) => {
      if ("poison" === postHitEffect.effect && postHitEffect.chancePercent !== undefined) {
        return 100 * random() < postHitEffect.chancePercent;
      }
      if ("burn" !== postHitEffect.effect || postHitEffect.chancePercentByBranch === undefined) {
        return true;
      }
      if (null === selectedBranchIndex) {
        return false;
      }
      const branchChancePercent = postHitEffect.chancePercentByBranch[selectedBranchIndex];
      return branchChancePercent !== undefined && 100 * random() < branchChancePercent;
    });
  }
}
function getSpellLaunchHeal(spellId) {
  const secondaryEffect = getSpellSecondaryEffect(spellId);
  if (secondaryEffect?.kind === "leech_hp") {
    return {
      percentOfDamage: secondaryEffect.percentOfDamage,
      minimumHeal: 0,
    };
  } else {
    return undefined;
  }
}
function applyBloodFuryHeal(attack, launchedHits) {
  const random = attack.deps.random ?? Math.random;
  let bloodFuryTriggered = false;
  let bloodFuryHealTotal = 0;
  for (const { hit: hit, landed: landed } of launchedHits) {
    if (!landed) {
      continue;
    }
    const bloodFuryHeal = rollBloodFuryHeal({
      amuletId: attack.player.equipment.amulet,
      attackType: hit.style,
      damage: applyOutgoingDamageMultipliers(attack, hit.damage),
      roll: random,
    });
    if (null !== bloodFuryHeal) {
      bloodFuryTriggered = true;
      bloodFuryHealTotal += bloodFuryHeal;
    }
  }
  if (!bloodFuryTriggered) {
    return;
  }
  attack.player.vitals.hp = Math.min(
    attack.player.vitals.maxHp,
    attack.player.vitals.hp + bloodFuryHealTotal,
  );
  attack.player.stats.hitpoints.current = attack.player.vitals.hp;
  attack.deps.tickEvents.emit({
    type: "npc_graphic_applied",
    targetId: attack.target.id,
    ...BLOOD_FURY_HEAL_GRAPHIC,
  });
}
function resolvePendingConflictionAttack(pendingConflictionAttack, conflictionAttack, primaryLanded) {
  if (null === conflictionAttack || (pendingConflictionAttack !== null && !isSameConflictionAttack(pendingConflictionAttack, conflictionAttack))) {
    return pendingConflictionAttack;
  } else if (primaryLanded) {
    return null;
  } else {
    return conflictionAttack;
  }
}
function applyXpGains(xpCounters, xpGains) {
  const skillDrops = [];
  for (const xpGain of xpGains) {
    const previousXp = xpCounters[xpGain.skill] ?? 0;
    const updatedXp = previousXp + xpGain.xp;
    xpCounters[xpGain.skill] = updatedXp;
    const amount = Math.floor(updatedXp) - Math.floor(previousXp);
    if (amount > 0) {
      skillDrops.push({
        skill: xpGain.skill,
        amount: amount,
      });
    }
  }
  return skillDrops;
}
function computeXpGains(finalStyle, combatStyle, predictedHit) {
  if (predictedHit <= 0) {
    return [];
  }
  const xpGains = [];
  switch (finalStyle) {
    case "melee":
      if ("Controlled" === combatStyle) {
        xpGains.push(
          {
            skill: "attack",
            xp: predictedHit * SHARED_XP_PER_DAMAGE,
          },
          {
            skill: "strength",
            xp: predictedHit * SHARED_XP_PER_DAMAGE,
          },
          {
            skill: "defence",
            xp: predictedHit * SHARED_XP_PER_DAMAGE,
          },
        );
      } else if ("Defensive" === combatStyle) {
        xpGains.push({
          skill: "defence",
          xp: 4 * predictedHit,
        });
      } else if ("Aggressive" === combatStyle) {
        xpGains.push({
          skill: "strength",
          xp: 4 * predictedHit,
        });
      } else {
        xpGains.push({
          skill: "attack",
          xp: predictedHit * 4,
        });
      }
      break;
    case "range":
      if (combatStyle === "Longrange") {
        xpGains.push(
          {
            skill: "ranged",
            xp: predictedHit * 2,
          },
          {
            skill: "defence",
            xp: predictedHit * 2,
          },
        );
      } else {
        xpGains.push({
          skill: "ranged",
          xp: predictedHit * 4,
        });
      }
      break;
    case "magic":
      if ("Defensive Casting" === combatStyle || "Longrange" === combatStyle) {
        xpGains.push(
          {
            skill: "magic",
            xp: predictedHit * SHARED_XP_PER_DAMAGE,
          },
          {
            skill: "defence",
            xp: predictedHit,
          },
        );
      } else {
        xpGains.push({
          skill: "magic",
          xp: predictedHit * 2,
        });
      }
      break;
    default:
      return [];
  }
  xpGains.push({
    skill: "hitpoints",
    xp: predictedHit * SHARED_XP_PER_DAMAGE,
  });
  return xpGains;
}
// predictedHit is the damage the attack will deal as far as it is known at
// launch: for each target the accurate hits, at least 1 each, after the
// encounter's two multipliers, and together no more than the target's
// hitpoints at launch. A target counts for nothing when its hits are a
// forced miss: the first target when the encounter rejected the attack
// (isAttackRejectedByEncounter), another target only when every one of its
// hits was forced to miss. launchPlayerAttack gives the experience from
// this number, and the xp_drop event carries it.
function awardAttackXp(attack, hitGroups) {
  const predictedHit = hitGroups.reduce((total, hitGroup) => {
    let damageToTarget = 0;
    return (
      total +
      hitGroup.hits.reduce((groupTotal, hit) => {
        if (hitGroup.forcedMiss || !hit.accurate) {
          return groupTotal;
        }
        const rolledDamage = Math.max(1, Math.max(0, Math.floor(hit.damage)));
        const scaledDamage = Math.max(
          0,
          Math.floor(rolledDamage * attack.outgoingDamageMultiplier),
        );
        const finalDamage = Math.max(
          0,
          Math.floor(scaledDamage * attack.specialAttackDamageMultiplier),
        );
        const remainingHp = Math.max(0, hitGroup.hpAtLaunch - damageToTarget);
        const appliedDamage = Math.min(finalDamage, remainingHp);
        damageToTarget += appliedDamage;
        return groupTotal + appliedDamage;
      }, 0)
    );
  }, 0);
  if (predictedHit === 0) {
    return;
  }
  const styles = getWeaponCategoryDefinition(attack.player.equipment.weapon).styles;
  const combatStyle = (styles[attack.styleIndex] ?? styles[0]).combatStyle;
  const xpDrops = applyXpGains(
    attack.player.xpCounters,
    computeXpGains(attack.finalStyle, combatStyle, predictedHit),
  );
  if (xpDrops.length > 0) {
    attack.deps.tickEvents.emit({
      type: "xp_drop",
      skills: xpDrops,
      predictedHit: predictedHit,
    });
  }
}
function launchPlayerAttack(attack) {
  const [primaryHit, ...followUpHits] = attack.hits;
  const random = attack.deps.random ?? Math.random;
  const specialPostHitEffects = attack.isSpecialAttack
    ? attack.specialAttackDef?.postHitEffects
    : undefined;
  const rollPostHitEffects = () =>
    attack.isSpecialAttack
      ? filterPostHitEffectsByChance(specialPostHitEffects, attack.selectedBranchIndex, random)
      : rollSpellSecondaryEffects(attack.spellId, random, attack.player.equipment);
  const forcedMiss = isAttackRejectedByEncounter(attack, attack.target, primaryHit);
  const supplementalTargets = (attack.supplementalTargets ?? []).map((supplementalTarget) => ({
    ...supplementalTarget,
    hpAtLaunch: supplementalTarget.target.vitals.hp,
    forcedMisses: supplementalTarget.hits.map((hit) => isAttackRejectedByEncounter(attack, supplementalTarget.target, hit)),
  }));
  const sunKerisMelee = attack.player.equipment.weapon === 27291 && attack.formulaStyle.startsWith("melee_") && !attack.isSpecialAttack; // Keris partisan of the sun
  const onKillEffect = attack.isSpecialAttack ? attack.specialAttackDef?.onKillEffect :
    sunKerisMelee && attack.deps.encounterRules?.isTombsOfAmascut ? {sunKerisHeal:true} : undefined;
  const hpAtLaunch = attack.target.vitals.hp;
  const equipment = attack.player.equipment;
  const equipmentHitEffects = {
    eclipseBurn:
      "ranged" === attack.formulaStyle &&
      29000 === normalizeOptionalItemId(equipment.weapon) && // Eclipse atlatl
      29010 === normalizeOptionalItemId(equipment.head) && // Eclipse Moon helm
      normalizeOptionalItemId(equipment.body) === 29004 && // Eclipse Moon chestplate
      29007 === normalizeOptionalItemId(equipment.legs), // Eclipse Moon tassets
  };
  const primaryLanded = !forcedMiss && primaryHit.accurate;
  const attackOptions = {
    events: attack.deps.tickEvents,
    infiniteHealth: attack.deps.infiniteHealth,
    enablePendingHits: primaryHit.impactDelayTicks > 0,
    // The encounter's say over the hit at impact (the Doom of Mokhaiotl's demonbane rules): with it, the queued hit keeps the weapon and spell.
    playerDamageOnNpc: attack.deps.encounterRules?.playerDamageOnNpc,
    outgoingDamageMultiplier: attack.outgoingDamageMultiplier,
    specDamageMultiplier: attack.specialAttackDamageMultiplier,
    getAttackSpeed: () => attack.finalSpeed,
    ...(attack.attackOnCooldown ? { attackOnCooldown: attack.attackOnCooldown } : {}),
    ...(attack.keepsReady ? { keepsReady: true } : {}),
    resolveAttack: () => ({
      style: primaryHit.style,
      attackKind: primaryHit.attackKind,
      rolledDamage: primaryHit.damage,
      accuracySucceeded: primaryLanded,
      impactDelayTicks: primaryHit.impactDelayTicks,
      spellId: attack.spellId,
      usingSpecialAttack: attack.isSpecialAttack,
      onKillEffect: onKillEffect,
      postHitEffects: withBoltProcEffects(rollPostHitEffects(), primaryLanded ? primaryHit.procEffects : undefined),
      procSpotAnimId: primaryLanded ? primaryHit.procSpotAnimId : undefined,
      equipmentHitEffects: equipmentHitEffects,
      weaponId: attack.player.equipment.weapon,
      ...(primaryHit.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: primaryHit.protectedByNpcPrayer }),
      ammoId: attack.resources.kind === "ammo" ? attack.resources.ammoId : undefined,
      ammoSource: attack.resources.source,
      expectedHit: attack.expectedHit,
      sourceSelfDamageRatio: primaryLanded ? primaryHit.procSelfDamageRatio : undefined,
      ...(attack.ricochets === undefined
        ? {}
        : {
            ricochets: attack.ricochets,
          }),
    }),
    onDamageApplied: (damageApplication) => attack.deps.onDamageApplied(damageApplication),
    onAttackStarted: () => {
      if (sunKerisMelee && primaryLanded && primaryHit.procActivated) {
        attack.deps.tickEvents.emit({
          type: "game_message",
          kind: "game",
          segments: [{text: "You slip your weapon through a gap in the creature's chitin, landing a vicious blow."}],
        });
      }
      const launchHeal = attack.isSpecialAttack
        ? attack.specialAttackDef?.launchHeal
        : getSpellLaunchHeal(attack.spellId);
      if (undefined !== launchHeal) {
        if (primaryLanded && primaryHit.damage > 0) {
          healPlayerFromDamageDealt(attack, launchHeal, primaryHit.damage);
        }
        for (const supplementalTarget of supplementalTargets) {
          for (const [hitIndex, hit] of supplementalTarget.hits.entries()) {
            if (supplementalTarget.forcedMisses[hitIndex] !== true && hit.accurate && hit.damage > 0) {
              healPlayerFromDamageDealt(attack, launchHeal, hit.damage);
            }
          }
        }
      }
      applyBloodFuryHeal(attack, [
        {
          hit: primaryHit,
          landed: primaryLanded,
        },
        ...followUpHits.map((followUpHit) => ({
          hit: followUpHit,
          landed: !forcedMiss && followUpHit.accurate,
        })),
      ]);
      if (attack.onLaunchEffects && attack.onLaunchEffects.length > 0) {
        const player = attack.player;
        const target = attack.target;
        const launchEffects = filterPostHitEffectsByChance(attack.onLaunchEffects, attack.selectedBranchIndex, random) ?? [];
        const tick = attack.deps.world.tick;
        applySpecialAttackEffects(player, target, 0, launchEffects, tick, "on-fire");
      }
      attack.deps.onPlayerAttackStarted?.({
        tick: attack.deps.world.tick,
        sourceId: attack.player.id,
        targetId: attack.target.id,
        attackType: primaryHit.style,
        attackKind: primaryHit.attackKind,
      });
    },
  };
  if (
    attack.deps.combatSystem.tryAttack(attack.deps.world, attack.player, attack.target, attackOptions, {
      acceptKillTickTarget: attack.manualCast,
    })
  ) {
    for (const supplementalTarget of supplementalTargets) {
      for (const [hitIndex, hit] of supplementalTarget.hits.entries()) {
        attack.deps.combatSystem.tryLaunchContinuationAttack(
          attack.deps.world,
          {
            attacker: attack.player,
            target: supplementalTarget.target,
            attack: {
              style: hit.style,
              attackKind: hit.attackKind,
              rolledDamage: hit.damage,
              accuracySucceeded: supplementalTarget.forcedMisses[hitIndex] !== true && hit.accurate,
              impactDelayTicks: hit.impactDelayTicks,
              spellId: attack.spellId,
              usingSpecialAttack: attack.isSpecialAttack,
              onKillEffect: onKillEffect,
              postHitEffects: attack.isSpecialAttack
                ? attack.specialAttackDef?.postHitEffects
                : rollSpellSecondaryEffects(attack.spellId, random, attack.player.equipment),
              equipmentHitEffects: equipmentHitEffects,
              weaponId: attack.player.equipment.weapon,
              ...(hit.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: hit.protectedByNpcPrayer }),
              ammoId:
                "ammo" === attack.resources.kind ? attack.resources.ammoId : undefined,
              ammoSource: attack.resources.source,
              expectedHit: supplementalTarget.expectedHit,
            },
          },
          {
            events: attack.deps.tickEvents,
            infiniteHealth: attack.deps.infiniteHealth,
            enablePendingHits: hit.impactDelayTicks > 0,
            playerDamageOnNpc: attack.deps.encounterRules?.playerDamageOnNpc,
            outgoingDamageMultiplier: attack.outgoingDamageMultiplier,
            specDamageMultiplier: attack.specialAttackDamageMultiplier,
            onDamageApplied: (damageApplication) => attack.deps.onDamageApplied(damageApplication),
          },
        );
      }
    }
    attack.player.pendingConflictionAttack = resolvePendingConflictionAttack(attack.player.pendingConflictionAttack, attack.conflictionAttack, primaryLanded);
    if (attack.manualCast) {
      clearPlayerAttackTarget(attack.player);
    }
    for (const followUpHit of followUpHits) {
      const pendingHit = attack.deps.combatSystem.queuePendingHit(
        attack.deps.world,
        {
          sourceId: attack.player.id,
          targetId: attack.target.id,
          style: followUpHit.style,
          attackKind: followUpHit.attackKind,
          launchTick: attack.deps.world.tick,
          impactTick: attack.deps.world.tick + followUpHit.impactDelayTicks,
          rolledDamage: followUpHit.damage,
          accuracySucceeded: !forcedMiss && followUpHit.accurate,
          usingSpecialAttack: attack.isSpecialAttack,
          onKillEffect: onKillEffect,
          postHitEffects: rollPostHitEffects(),
          equipmentHitEffects: equipmentHitEffects,
          ...(attack.deps.encounterRules?.playerDamageOnNpc ? { weaponId: attack.player.equipment.weapon, spellId: attack.spellId } : {}),
          ...(primaryHit.protectedByNpcPrayer === undefined ? {} : { protectedByNpcPrayer: primaryHit.protectedByNpcPrayer }),
          sourceSelfDamageRatio:
            !forcedMiss && followUpHit.accurate ? followUpHit.procSelfDamageRatio : undefined,
          launchDamageMultipliers: {
            incomingDamageMultiplier: undefined,
            outgoingDamageMultiplier: attack.outgoingDamageMultiplier,
            specDamageMultiplier: attack.specialAttackDamageMultiplier,
          },
          sourceDeathPolicy: "persist",
        },
        {
          source: attack.player,
          target: attack.target,
        },
      );
      scheduleNpcRetaliation(attack.target, pendingHit);
    }
    awardAttackXp(attack, [
      {
        hits: attack.hits,
        forcedMiss: forcedMiss,
        hpAtLaunch: hpAtLaunch,
      },
      ...supplementalTargets.map((supplementalTarget) => ({
        hits: supplementalTarget.hits,
        forcedMiss: supplementalTarget.forcedMisses.every(Boolean),
        hpAtLaunch: supplementalTarget.hpAtLaunch,
      })),
    ]);
  }
}
function applyOutgoingDamageMultipliers(attack, damage) {
  const scaledDamage = Math.max(
    0,
    Math.floor(Math.floor(damage) * attack.outgoingDamageMultiplier),
  );
  return Math.max(0, Math.floor(scaledDamage * attack.specialAttackDamageMultiplier));
}
function healPlayerFromDamageDealt(attack, launchHeal, damage) {
  if (attack.player.vitals.hp >= attack.player.vitals.maxHp) {
    return;
  }
  const appliedDamage = applyOutgoingDamageMultipliers(attack, damage);
  const healAmount = Math.max(
    launchHeal.minimumHeal,
    Math.floor((appliedDamage * launchHeal.percentOfDamage) / 100),
  );
  attack.player.vitals.hp = Math.min(
    attack.player.vitals.maxHp,
    attack.player.vitals.hp + healAmount,
  );
  attack.player.stats.hitpoints.current = attack.player.vitals.hp;
}
function isAttackRejectedByEncounter(attack, target, hit) {
  const rules = attack.deps.encounterRules;
  if (rules?.isPlayerAttackProtected) {
    hit.protectedByNpcPrayer = rules.isPlayerAttackProtected(hit.style, target, {
      tick: attack.deps.world.tick,
      player: attack.player,
      world: attack.deps.world,
    }) === true;
  }
  return hit.protectedByNpcPrayer === true || (
    rules?.validateAttack?.(hit.attackKind, target.id, {
      tick: attack.deps.world.tick,
      player: attack.player,
      world: attack.deps.world,
    }) === false
  );
}
var venatorBowIdSet = new Set([27610]);
var RICOCHET_MAX_HIT_RATIO = {
  numerator: 2,
  denominator: 3,
};
function getActorCenterTile(actor) {
  const centerOffset = Math.floor((actor.size - 1) / 2);
  return [actor.position[0] + centerOffset, actor.position[1] + centerOffset];
}
function getActorCenterTiles(fromActor) {
  if (fromActor.size % 2 == 1) {
    return [getActorCenterTile(fromActor)];
  }
  const [centerX, centerY] = [
    fromActor.position[0] + fromActor.size / 2 - 1,
    fromActor.position[1] + fromActor.size / 2 - 1,
  ];
  return [
    [centerX, centerY],
    [centerX + 1, centerY],
    [centerX, centerY + 1],
    [centerX + 1, centerY + 1],
  ];
}
function canRicochetBetweenActors(fromActor, toActor) {
  const [toX, toY] = getActorCenterTile(toActor);
  const withinRicochetRange = getActorCenterTiles(fromActor).some(
    ([x, y]) => Math.max(Math.abs(x - toX), Math.abs(y - toY)) <= 2,
  );
  const [fromX, fromY] = getActorCenterTile(fromActor);
  return withinRicochetRange && hasLineOfSight(fromX, fromY, toX, toY);
}
function pickLatestSpawnedActor(actors) {
  let latestActor;
  for (const actor of actors) {
    if (
      undefined === latestActor ||
      (actor.spawnTick ?? -Infinity) >= (latestActor.spawnTick ?? -Infinity)
    ) {
      latestActor = actor;
    }
  }
  return latestActor;
}
function ricochetHopStartCycles(primaryFlightCycles, hopIndex) {
  return primaryFlightCycles + hopIndex * 15;
}
function collectAreaTargetsAround(target, candidates, areaConfig, canTarget) {
  const [targetX, targetY] = target.position;
  const areaTargets = [];
  for (const candidate of candidates) {
    if (
      !(candidate.id === target.id) &&
      !!canTarget(candidate) &&
      !(Math.abs(candidate.position[0] - targetX) > areaConfig.radius) &&
      !(Math.abs(candidate.position[1] - targetY) > areaConfig.radius)
    ) {
      areaTargets.push(candidate);
      if (areaTargets.length === areaConfig.maxTargets - 1) {
        break;
      }
    }
  }
  return areaTargets;
}
function resolvePlayerCombatParams(player, deps) {
  const combatParams = player.manualCastSpell
    ? {
        attackSpeed: 5,
        attackRange: 10,
      }
    : (deps.combatParamOverrides ?? computePlayerCombatParams(player));
  return (
    deps.encounterRules?.modifyPlayerCombatParams?.(combatParams, {
      tick: deps.world.tick,
      player: player,
      world: deps.world,
    }) ?? combatParams
  );
}
// player.facing is an angle in 2048ths of a turn: 0 faces south, 512 west,
// 1024 north, 1536 east (x grows to the east, y to the north).
function facePlayerTowardTarget(player, target) {
  const targetCenterX = target.position[0] + target.size / 2;
  const targetCenterY = target.position[1] + target.size / 2;
  const dx = targetCenterX - (player.position[0] + 0.5);
  const dy = targetCenterY - (player.position[1] + 0.5);
  if (dx === 0 && 0 === dy) {
    return;
  }
  const facingRadians = Math.atan2(-dx, -dy);
  player.facing =
    ((Math.round(facingRadians * (2048 / (2 * Math.PI))) % 2048) + 2048) % 2048;
}
function getConflictionAttack(attackCandidate) {
  if (!isConflictionGauntletsAttack(attackCandidate)) {
    return null;
  }
  if ("spell" === attackCandidate.attackResources.kind) {
    return {
      kind: "spell",
      spellId: attackCandidate.attackResources.spellId,
      targetId: attackCandidate.targetId,
    };
  }
  const weapon = attackCandidate.equipment.weapon;
  if (undefined === weapon) {
    return null;
  } else {
    return {
      kind: "charged_staff",
      weaponId: weapon,
      targetId: attackCandidate.targetId,
    };
  }
}
function planAttackWithOptions(attackInput, planOptions = {}) {
  return planPlayerAttack(
    attackInput,
    planOptions.consumeGuaranteedMaximum ?? true,
    planOptions.guaranteedMaximum ?? false,
    planOptions.maximumHitScale,
  );
}
function findRicochetHopTargets(primaryTarget, candidates, primaryKilled = false) {
  const hopTargets = [];
  let lastTarget = primaryTarget;
  for (let hopNumber = 0; hopNumber < 2; hopNumber++) {
    const fromActor = lastTarget;
    const nextTarget = pickLatestSpawnedActor(
      candidates.filter(
        (candidate) =>
          isActorAlive(candidate) &&
          candidate.id !== fromActor.id &&
          (candidate.id !== primaryTarget.id || (hopNumber > 0 && !primaryKilled)) &&
          canRicochetBetweenActors(fromActor, candidate),
      ),
    );
    if (nextTarget === undefined) {
      break;
    }
    hopTargets.push(nextTarget);
    lastTarget = nextTarget;
  }
  return hopTargets;
}
function buildVenatorRicochet(primaryTarget, primaryFlightCycles, ricochetOptions) {
  const hops = [];
  const flights = [];
  let hopSource = primaryTarget;
  for (const [hopIndex, hopTarget] of findRicochetHopTargets(primaryTarget, ricochetOptions.candidates, ricochetOptions.primaryKilled).entries()) {
    const startCycles = ricochetHopStartCycles(primaryFlightCycles, hopIndex);
    flights.push({
      targetId: hopTarget.id,
      sourcePosition: getActorCenterTile(hopSource),
      targetPosition: [hopTarget.position[0], hopTarget.position[1]],
      targetSize: hopTarget.size,
      startCycles: startCycles,
      endCycles: startCycles + 15,
    });
    hopSource = hopTarget;
    const hopPlan = ricochetOptions.planTarget(hopTarget, getHitDelayTicksFromCycles(startCycles), {
      consumeGuaranteedMaximum: false,
      guaranteedMaximum: false,
      maximumHitScale: RICOCHET_MAX_HIT_RATIO,
    });
    if (null === hopPlan || hopPlan.kind === "unsupported") {
      continue;
    }
    const hopOutcome = rollAttackPlanOutcome(hopPlan, ricochetOptions.random);
    hops.push({
      target: hopTarget,
      hits: hopOutcome.hits,
      expectedHit: hopOutcome.expectedHit,
    });
  }
  return {
    hops: hops,
    flights: flights,
  };
}
function getSoulreaperAfterAttack(soulreaper, tick, isSpecialAttack) {
  if (!isSpecialAttack) {
    return {
      stacks: Math.min(5, getSoulreaperStackCount(soulreaper) + 1),
      decayTick: tick + 50,
    };
  }
}
function isVenatorBow(weaponId) {
  return weaponId !== undefined && venatorBowIdSet.has(getBaseItemId(weaponId));
}
function performPlayerAutoAttack(player, deps) {
  if (!player.alive || !player.attackTarget) {
    return;
  }
  if (clearInvalidPlayerAttackTarget(player, deps.world)) {
    return;
  }
  const targetActor = deps.world.actors.get(player.attackTarget);
  if (!targetActor || !canPlayerTargetActor(player, targetActor) || "npc" !== targetActor.kind) {
    player.attackTarget = null;
    return;
  }
  if (!player.attackInteractionActive) {
    return;
  }
  const target = targetActor;
  facePlayerTowardTarget(player, target);
  const autoAttackPause = player.autoAttackPause;
  if (autoAttackPause && deps.world.tick >= autoAttackPause.resumeTick) {
    player.autoAttackPause = null;
  } else if (autoAttackPause?.targetId === target.id) {
    return;
  }
  const selectedAttackStyleIndex = player.selectedAttackStyleIndex;
  const manualCastSpell = player.manualCastSpell;
  const {
    attackSpeed: attackSpeed,
    attackRange: attackRange,
    meleeReach: meleeReach,
  } = resolvePlayerCombatParams(player, deps);
  if (!isTileInAttackRange(player.position, target.position, target.size, attackRange, true, meleeReach)) {
    return;
  }
  if (isTileInsideFootprint(player.position, target.position, target.size)) {
    return;
  }
  const nextAttackTick = deps.combatSystem.getNextAttackTick(player.id);
  const onCooldown = nextAttackTick !== undefined && deps.world.tick < nextAttackTick;
  // An encounter may let a target be attacked while the weapon cools down,
  // and say whether that attack keeps the timer or starts it again (the Doom
  // of Mokhaiotl's larvae and volatile earth). Without the rule, none is.
  const attackOnCooldown = onCooldown ? deps.encounterRules?.playerAttackOnCooldown?.(target, deps.world.tick) : undefined;
  if (onCooldown && !attackOnCooldown) {
    return;
  }
  // The same of a weapon that is ready: an encounter may let an attack start
  // no cooldown. Without the rule, every attack starts one.
  const keepsReady = !onCooldown && deps.encounterRules?.playerAttackKeepsReady?.(target, deps.world.tick) === true;
  const isSpecialAttackActive = player.isSpecialAttackActive;
  let specialAttackDef;
  let specialAttackAfterSpend = null;
  if (isSpecialAttackActive) {
    if (player.equipment.weapon !== undefined) {
      specialAttackDef = getSpecialAttackDefinition(player.equipment.weapon);
    }
    if (
      specialAttackDef?.targetAttribute !== undefined &&
      !target.formulaStats?.attributes?.includes(specialAttackDef.targetAttribute)
    ) {
      specialAttackDef = undefined;
    }
    if (!isActorAlive(target)) {
      specialAttackDef = undefined;
    }
  }
  if (isSpecialAttackActive && undefined !== specialAttackDef) {
    let energyCost = specialAttackDef.energyCost ?? 50;
    const energyCostMultiplier = resolveValueOrCallback(deps.encounterRules?.specialAttacks?.energyCostMultiplier, {
      tick: deps.world.tick,
      player: player,
      world: deps.world,
    });
    if (undefined !== energyCostMultiplier) {
      energyCost = Math.max(0, Math.floor(energyCost * energyCostMultiplier));
    }
    specialAttackAfterSpend = spendSpecialAttackEnergy(player.specialAttack, energyCost);
  }
  const isSpecialAttack = specialAttackAfterSpend !== null;
  const isPoweredSpellSpecial = isSpecialAttack && specialAttackDef?.poweredSpellWeaponId !== undefined;
  const activeSpell = isPoweredSpellSpecial
    ? null
    : getActiveSpell({
        weaponId: player.equipment.weapon,
        selectedStyleIndex: selectedAttackStyleIndex,
        selectedSpell: player.combatSupplies.selectedSpell,
        spellbook: player.combatSupplies.spellbook,
      });
  const weaponFormulaStyle = getWeaponFormulaStyle(player.equipment.weapon, selectedAttackStyleIndex);
  const formulaStyle = isPoweredSpellSpecial || manualCastSpell ? "magic" : weaponFormulaStyle;
  const resources = isPoweredSpellSpecial
    ? NO_ATTACK_RESOURCES
    : resolveAttackResources({
        weaponId: player.equipment.weapon,
        equipment: player.equipment,
        inventory: player.inventory,
        formulaStyle: formulaStyle,
        supplies: deps.combatSupplies,
        magicLevel: player.stats.magic.current,
        manualCastSpell: manualCastSpell,
        activeSpell: activeSpell?.name ?? null,
      });
  if (resources.kind === "unavailable") {
    if (manualCastSpell) {
      clearPlayerAttackTarget(player);
    }
    return;
  }
  const baseStyle = formulaStyleToAttackStyle(formulaStyle);
  const baseAttackKind = formulaStyleToAttackKind(formulaStyle);
  const spellId = resources.kind === "spell" ? resources.spellId : activeSpell?.name;
  const conflictionAttack = getConflictionAttack({
    equipment: player.equipment,
    formulaStyle: formulaStyle,
    attackResources: resources,
    targetId: target.id,
  });
  const pendingConflictionAttack = player.pendingConflictionAttack;
  const standardAccuracyMode =
    pendingConflictionAttack !== null && conflictionAttack !== null && isSameConflictionAttack(pendingConflictionAttack, conflictionAttack) ? "double_roll" : "single_roll";
  const finalStyle = isSpecialAttack && specialAttackDef?.styleOverride ? specialAttackDef.styleOverride : baseStyle;
  const attackKind = isSpecialAttack && specialAttackDef?.attackKindOverride ? specialAttackDef.attackKindOverride : baseAttackKind;
  const finalSpeed =
    isSpecialAttack && specialAttackDef?.attackSpeedOverride ? specialAttackDef.attackSpeedOverride : attackSpeed;
  const targetDistance = getDistanceToFootprint(
    player.position[0],
    player.position[1],
    target.position[0],
    target.position[1],
    target.size,
  );
  let impactDelayTicks;
  let projectileFlightCycles;
  const castSpell = isPoweredSpellSpecial ? null : manualCastSpell ? (getSpellDefinition(manualCastSpell) ?? activeSpell) : activeSpell;
  if (null != castSpell?.fixedHitDelay) {
    impactDelayTicks = castSpell.fixedHitDelay;
  } else if (castSpell) {
    const magicSpellHitDelay = projectileTimings.magic_spell;
    impactDelayTicks = getHitDelayTicksFromCycles(getProjectileFlightCycles(magicSpellHitDelay, targetDistance));
  } else if (isSpecialAttack && undefined !== specialAttackDef?.hitDelayTicks) {
    impactDelayTicks = specialAttackDef.hitDelayTicks;
  } else {
    const weaponProjectileTiming = getWeaponProjectileTiming(player.equipment.weapon, isSpecialAttack);
    projectileFlightCycles = weaponProjectileTiming ? getProjectileFlightCycles(weaponProjectileTiming, targetDistance) : undefined;
    impactDelayTicks = undefined !== projectileFlightCycles ? getHitDelayTicksFromCycles(projectileFlightCycles) : getHitDelayTicks(getHitDelayWeaponKind(player.equipment.weapon, formulaStyle), targetDistance);
  }
  const encounterContext = {
    tick: deps.world.tick,
    player: player,
    world: deps.world,
  };
  const outgoingDamageMultiplier = resolveValueOrCallback(deps.encounterRules?.outgoingDamageMultiplier, encounterContext) ?? 1;
  const specialAttackDamageMultiplier = isSpecialAttack
    ? (resolveValueOrCallback(deps.encounterRules?.specialAttacks?.damageMultiplier, encounterContext) ?? 1)
    : 1;
  const spellAreaConfig =
    isSpecialAttack || spellId === undefined || false === deps.encounterRules?.multiCombat
      ? undefined
      : getSpellDefinition(spellId)?.multiTarget;
  const chinchompaAreaConfig =
    isSpecialAttack ||
    manualCastSpell ||
    "ranged" !== formulaStyle ||
    deps.encounterRules?.multiCombat === false
      ? undefined
      : getChinchompaAreaConfig(player.equipment.weapon);
  const areaConfig = spellAreaConfig ?? chinchompaAreaConfig;
  const attackTargets =
    undefined === areaConfig
      ? [target]
      : [
          target,
          ...collectAreaTargetsAround(
            target,
            deps.world.getNpcs().filter((npc) => isNpcAttackableAtTick(npc, deps.world.tick)),
            areaConfig,
            undefined !== spellAreaConfig ? isActorAliveOrDeathPending : isActorAlive,
          ),
        ];
  const guaranteedMaximum =
    spellAreaConfig !== undefined &&
    (deps.encounterRules?.consumePlayerGuaranteedMaxHit?.(encounterContext) ?? false);
  const planTarget = (targetNpc, targetImpactDelayTicks, planOptions) =>
    planAttackWithOptions(
      {
        player: player,
        target: targetNpc,
        formulaStyle: formulaStyle,
        resources: resources,
        attackSpeedTicks: finalSpeed,
        delivery: {
          style: finalStyle,
          attackKind: attackKind,
          impactDelayTicks: targetImpactDelayTicks,
        },
        application: {
          outgoingDamageMultiplier: outgoingDamageMultiplier,
          specialAttackDamageMultiplier: specialAttackDamageMultiplier,
        },
        manualCast: manualCastSpell !== null,
        isSpecialAttack: isSpecialAttack,
        standardAccuracyMode: standardAccuracyMode,
        ...(deps.encounterRules === undefined
          ? {}
          : {
              encounterRules: deps.encounterRules,
            }),
        encounterContext: encounterContext,
        ...(deps.lookupItemStats === undefined
          ? {}
          : {
              lookupItemStats: deps.lookupItemStats,
            }),
        targetDistance: targetDistance,
      },
      planOptions,
    );
  const random = deps.random ?? Math.random;
  const targetOutcomes = [];
  let primaryHitAccuracy;
  let selectedBranchIndex = null;
  for (const targetNpc of attackTargets) {
    const isPrimaryTarget = targetNpc.id === target.id;
    const attackPlan = planTarget(
      targetNpc,
      impactDelayTicks,
      spellAreaConfig !== undefined
        ? {
            consumeGuaranteedMaximum: false,
            guaranteedMaximum: guaranteedMaximum,
          }
        : undefined === chinchompaAreaConfig || isPrimaryTarget
          ? {}
          : {
              consumeGuaranteedMaximum: false,
              guaranteedMaximum: false,
            },
    );
    if ("unsupported" === attackPlan?.kind || (attackPlan === null && isSpecialAttack)) {
      if (isPrimaryTarget) {
        if (isSpecialAttackActive) {
          player.isSpecialAttackActive = false;
        }
        return;
      }
      continue;
    }
    const attackOutcome =
      attackPlan === null
        ? {
            hits: [
              {
                damage: 0,
                accurate: false,
                style: finalStyle,
                attackKind: attackKind,
                impactDelayTicks: impactDelayTicks,
              },
            ],
            maximumRolledDamages: [0],
            expectedHit: 0,
            selectedBranchIndex: null,
          }
        : rollAttackPlanOutcome(attackPlan, random, isPrimaryTarget ? undefined : primaryHitAccuracy);
    if (isPrimaryTarget) {
      selectedBranchIndex = attackOutcome.selectedBranchIndex;
      if (undefined !== chinchompaAreaConfig) {
        primaryHitAccuracy = summarizePrimaryHitAccuracy(attackPlan, attackOutcome);
      }
    }
    targetOutcomes.push({
      target: targetNpc,
      hits: attackOutcome.hits,
      expectedHit: attackOutcome.expectedHit,
    });
  }
  const venatorRicochet =
    undefined === projectileFlightCycles ||
    "ranged" !== formulaStyle ||
    manualCastSpell ||
    isSpecialAttack ||
    false === deps.encounterRules?.multiCombat ||
    !isVenatorBow(player.equipment.weapon)
      ? undefined
      : buildVenatorRicochet(target, projectileFlightCycles, {
          candidates: deps.world
            .getNpcs()
            .filter(
              (npc) =>
                npc.formulaStats !== undefined &&
                isNpcAttackableAtTick(npc, deps.world.tick) &&
                deps.encounterRules?.validateAttack?.(attackKind, npc.id, encounterContext) !== false,
            ),
          primaryKilled: isPrimaryTargetKilledByHits(target, targetOutcomes[0], {
            outgoingDamageMultiplier: outgoingDamageMultiplier,
            specialAttackDamageMultiplier: specialAttackDamageMultiplier,
            forcedMiss:
              false === deps.encounterRules?.validateAttack?.(attackKind, target.id, encounterContext),
          }),
          random: random,
          planTarget: planTarget,
        });
  if (venatorRicochet) {
    for (const hop of venatorRicochet.hops) {
      const existingOutcome = targetOutcomes.find((targetOutcome) => targetOutcome.target.id === hop.target.id);
      if (existingOutcome) {
        targetOutcomes[targetOutcomes.indexOf(existingOutcome)] = {
          target: existingOutcome.target,
          hits: [...existingOutcome.hits, ...hop.hits],
          expectedHit: existingOutcome.expectedHit + hop.expectedHit,
        };
      } else {
        targetOutcomes.push(hop);
      }
    }
  }
  const [primaryOutcome, ...supplementalTargets] = targetOutcomes;
  if (!primaryOutcome) {
    return;
  }
  if (isSpecialAttackActive) {
    player.isSpecialAttackActive = false;
  }
  if (specialAttackAfterSpend !== null) {
    player.specialAttack = specialAttackAfterSpend;
  }
  if (!manualCastSpell && isSoulreaperAxe(player.equipment.weapon)) {
    player.soulreaper = getSoulreaperAfterAttack(player.soulreaper, deps.world.tick, isSpecialAttack);
  }
  const onLaunchEffects = isSpecialAttack ? specialAttackDef?.onFireEffects : undefined;
  launchPlayerAttack({
    player: player,
    target: target,
    deps: deps,
    ...(attackOnCooldown ? { attackOnCooldown: attackOnCooldown } : {}),
    ...(keepsReady ? { keepsReady: true } : {}),
    hits: primaryOutcome.hits,
    expectedHit: primaryOutcome.expectedHit,
    supplementalTargets: supplementalTargets,
    formulaStyle: formulaStyle,
    styleIndex: selectedAttackStyleIndex,
    finalStyle: finalStyle,
    finalSpeed: finalSpeed,
    resources: resources,
    conflictionAttack: conflictionAttack,
    spellId: spellId,
    manualCast: Boolean(manualCastSpell),
    isSpecialAttack: isSpecialAttack,
    specialAttackDef: specialAttackDef,
    outgoingDamageMultiplier: outgoingDamageMultiplier,
    specialAttackDamageMultiplier: specialAttackDamageMultiplier,
    selectedBranchIndex: selectedBranchIndex,
    ...(onLaunchEffects === undefined
      ? {}
      : {
          onLaunchEffects: onLaunchEffects,
        }),
    ...(venatorRicochet === undefined || venatorRicochet.flights.length === 0
      ? {}
      : {
          ricochets: venatorRicochet.flights,
        }),
  });
}
function isPrimaryTargetKilledByHits(primaryTarget, targetHits, damageModifiers) {
  return (
    targetHits?.target.id === primaryTarget.id &&
    !damageModifiers.forcedMiss &&
    targetHits.hits.reduce((totalDamage, hit) => {
      if (!hit.accurate) {
        return totalDamage;
      }
      const scaledDamage = Math.floor(
        Math.max(1, Math.floor(hit.damage)) * damageModifiers.outgoingDamageMultiplier,
      );
      return (
        totalDamage + Math.max(0, Math.floor(scaledDamage * damageModifiers.specialAttackDamageMultiplier))
      );
    }, 0) >= primaryTarget.vitals.hp
  );
}
export {
  resolveValueOrCallback,
  canPlayerTargetActor,
  clearPlayerAttackTarget,
  setPlayerAttackTarget,
  clearInvalidPlayerAttackTarget,
  resolvePlayerCombatParams,
  performPlayerAutoAttack,
};
