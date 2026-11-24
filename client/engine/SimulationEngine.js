import { logger } from "../util/logger.js";
import { packHsl } from "../util/packHsl.js";
import {
  getHitDelayWeaponKind,
  formulaStyleToAttackKind,
  getWeaponProjectileTiming,
  formulaStyleToAttackStyle,
  computePlayerCombatParams,
  getWeaponFormulaStyle,
} from "./weapons.js";
import { spotAnimIds } from "../data/spotAnimIds.js";
import {
  getWeaponCategoryOrUnarmed,
  getDefaultAttackStyleIndex,
  getActiveSpell,
  getWeaponCategoryDefinition,
} from "../data/weaponCategories.js";
import { hasSpecialAttack } from "../data/specialAttackDefinitions.js";
import {
  ringOfEnduranceItemId,
  createCombatTimers,
  createRunEnergy,
  maxRunEnergy,
  purgingStaffItemId,
  combatStatNames,
  decayingStatNames,
  resetStatsToMax,
  createSpecialAttackState,
  createPoisonState,
  createDefaultStats,
  lightbearerItemId,
  cloneStats,
} from "./playerState.js";
import { LogEventType } from "./logEventTypes.js";
import {
  isPrayerUnlockedByMechanics,
  Prayer,
  prayerDrainEffects,
  redemptionHealFraction,
  prayerSlotByPrayer,
  createPrayerState,
} from "./prayerTables.js";
import { resolveRolledDamage, applyPrayerReduction, isCorrectProtectionPrayer } from "./damage.js";
import {
  createEmptyEquipmentStats,
  getItemEquipmentStats,
  computeEquipmentStats,
  getGracefulBonusPercent,
  getCarriedWeight,
} from "./equipmentStats.js";
import { buildMechanicsConfig } from "./mechanicsConfig.js";
import { resolvePendingRetaliations } from "./npcRetaliation.js";
import { applyMonsterStatOverride } from "./monsterStats.js";
import { isTileInsideFootprint, getDistanceToFootprint, areFootprintsOverlapping, isTileInAttackRange } from "./attackRange.js";
import { createRandomDecisions } from "./decisions.js";
import { setArenaConfig, getArenaBounds, isInsideArenaBounds, getRegisteredArenaConfig } from "./arena.js";
import {
  recordNpcStepTick,
  isActorInWorld,
  applyNpcHitpointRegen,
  reviveNpc,
  isNpcDeathAnimationDueAtTick,
  canNpcActAtTick,
  isNpcDeathDueAtTick,
  getNpcDespawnTick,
  recordNpcDeath,
  markNpcDeathStarted,
  isNpcHeldInPlace,
  isNpcDeathAnimationTick,
} from "./npcState.js";
import { getHitDelayTicksFromCycles, getProjectileFlightCycles, getHitDelayTicks, projectileTimings } from "./projectiles.js";
import { NpcDefinitionRegistry } from "../encounters/shared/npcDefinitions.js";
import { createSeededRandom } from "./random.js";
import {
  createEmptyCombatSupplies,
  cloneCombatSupplies,
  createEmptyInventory,
  isItemStackable,
  clearInventorySlot,
} from "./supplies.js";
import { resolveBaseEncounterKind } from "./encounterKinds.js";
import {
  ATTACK_DELAY_TICKS_BY_CONSUMABLE_TRACK,
  consumableDefinitionByItemId,
  getConsumableDefinition,
  filterPrepotEffects,
  hasPrepotEffect,
  drainStatLevel,
  withStatCurrentLevel,
  isDecayLockableStat,
  getHpRegenIntervalTicks,
  applyItemConsumption,
  isCooldownTrackReady,
  withCooldownTrackDelay,
  isSurgeEffectBlocked,
  applyConsumableEffects,
} from "./consumables.js";
import { canCastSpell } from "./spells.js";
import { isThrallSpell, getThrallCastRefusal, resurrectThrall, runThrallTurn, getThrallSnapshot } from "./thralls.js";
import { applyPrayerActions, hasEnhancedPrayerRestoration } from "./prayers.js";
import { resolveAttackResources } from "./attackResources.js";
import {
  MAX_SPECIAL_ATTACK_ENERGY,
  decrementTickCounter,
  updateRunEnergy,
  getPoisonDamage,
  tickDeathChargeTimers,
  activateMarkOfDarkness,
  previewInstantSpecial,
  activateInstantSpecial,
  getPowerOfDeathDamageMultiplier,
  clearPowerOfDeathIfWeaponRemoved,
} from "./specialAttacks.js";
import { CombatSystem } from "./CombatSystem.js";
import { isConflictionGauntletsAttack, projectPlayerAttack } from "./playerAttack/projection.js";
import { planPlayerAttack } from "./playerAttack/planPlayerAttack.js";
import {
  resolveValueOrCallback,
  canPlayerTargetActor,
  clearPlayerAttackTarget,
  setPlayerAttackTarget,
  clearInvalidPlayerAttackTarget,
  resolvePlayerCombatParams,
  performPlayerAutoAttack,
} from "./playerAttack/launch.js";
import { parseEngineBootstrap } from "./bootstrap.js";
import { TickEventBuffer } from "./TickEventBuffer.js";
import { projectPendingPrayerOps, buildPrayerProjectionInput } from "./prayerProjection.js";
import { computePlayerStepToTile, computePlayerStepToNpc } from "./playerMovement.js";
import { countPendingInputOps, WorldState } from "./WorldState.js";
function getVisibleCombatTargetId(npc, combatTargetId) {
  if (true === npc.facesStepsWhileMoving && true === npc.isMoving) {
    return null;
  } else {
    return combatTargetId;
  }
}
function resolveCombatSeed(combatSeed) {
  if (Number.isInteger(combatSeed) && combatSeed >= 0) {
    return combatSeed;
  } else {
    return Math.floor(4294967295 * Math.random());
  }
}
var REDEMPTION_SPOT_ANIM_ID = spotAnimIds.VFX_PLAYER_REDEMPTION;
var DEATH_CHARGE_SPOT_ANIM_ID = spotAnimIds.VFX_PLAYER_DEATH_CHARGE;
var DEATH_CHARGE_UPGRADE_SPOT_ANIM_ID = spotAnimIds.VFX_PLAYER_DEATH_CHARGE_UPGRADE;
var wearPosToEquipmentSlot = {
  0: "head",
  1: "cape",
  2: "amulet",
  3: "weapon",
  4: "body",
  5: "shield",
  7: "legs",
  9: "hands",
  10: "boots",
  12: "ring",
};
var PLAYER_ACTOR_ID = "player";
var injuredPrayerMessageSegments = [
  {
    text: "You've been injured and can't use that prayer!",
  },
];
var metalBodyNameKeywords = [
  "platebody",
  "chainbody",
  "hauberk",
  "cuirass",
  "chestplate",
  "platemail",
  "armour",
  "armor",
];
var softBodyNameKeywords = [
  "robe",
  "robetop",
  "tunic",
  "shirt",
  "jacket",
  "vest",
  "leather",
  "hide",
  "d'hide",
];
var VENOM_VARP_THRESHOLD = 1000000;
function decaySoulreaperStacks(soulreaper, tick) {
  if (undefined === soulreaper || tick < soulreaper.decayTick) {
    return soulreaper;
  }
  const remainingStacks = soulreaper.stacks - 1;
  if (remainingStacks <= 0) {
    return undefined;
  } else {
    return {
      stacks: remainingStacks,
      decayTick: tick + 50,
    };
  }
}
function isTileInsideMapSquare(tile) {
  const [tileX, tileY] = tile;
  return tileX >= 0 && tileX < 64 && tileY >= 0 && tileY < 64;
}
function isStepDestinationInsideArena(destination) {
  const [x, y] = destination;
  // Multi-map-square arenas (e.g. Zulrah) have bounds extending beyond 0..63.
  return getArenaBounds() ? isInsideArenaBounds(x, y) : isTileInsideMapSquare(destination);
}
// Prayer drain. Every tick each active prayer adds its number from
// prayerDrainEffects to prayerState.drainCounter, except a prayer that was
// switched on in this tick. For every drainResistance in the counter (60 + 2
// x the prayer bonus) one prayer point is lost. The encounter's rule
// prayerDrain may scale the sum and change the resistance. At 0 points every
// prayer is switched off (drained: true).
function drainPrayerPoints(prayerState, prayerBonus, tick, drainModifiers) {
  if (prayerState.activePrayers.length === 0 || prayerState.points <= 0) {
    return {
      state: prayerState,
      drained: false,
    };
  }
  let totalDrainEffect = 0;
  for (const prayer of prayerState.activePrayers) {
    const activationTick = prayerState.prayerActivationTicks[prayer];
    if (activationTick === undefined || !(activationTick >= tick)) {
      totalDrainEffect += prayerDrainEffects[prayer] ?? 0;
    }
  }
  if (0 === totalDrainEffect) {
    return {
      state: prayerState,
      drained: false,
    };
  }
  if (null != drainModifiers?.drainMultiplier) {
    totalDrainEffect = Math.floor(totalDrainEffect * drainModifiers.drainMultiplier);
  }
  const drainResistance = drainModifiers?.modifyDrainResistance
    ? drainModifiers.modifyDrainResistance({
        totalDrainEffect: totalDrainEffect,
        drainResistance: prayerBonus * 2 + 60,
        prayerBonus: prayerBonus,
      })
    : 2 * prayerBonus + 60;
  let drainCounter = prayerState.drainCounter + totalDrainEffect;
  let prayerPoints = prayerState.points;
  while (drainCounter >= drainResistance && prayerPoints > 0) {
    prayerPoints -= 1;
    drainCounter -= drainResistance;
  }
  if (prayerPoints <= 0) {
    return {
      state: {
        ...prayerState,
        points: 0,
        drainCounter: 0,
        activePrayers: [],
        prayerActivationTicks: {},
      },
      drained: true,
    };
  } else {
    return {
      state: {
        ...prayerState,
        points: prayerPoints,
        drainCounter: drainCounter,
      },
      drained: false,
    };
  }
}
function applyLightbearerEquipped(specialAttack, lightbearerEquipped) {
  if (specialAttack.lightbearerEquipped === lightbearerEquipped) {
    return specialAttack;
  }
  if (!lightbearerEquipped) {
    return {
      ...specialAttack,
      lightbearerEquipped: false,
      regenTickCounter: 50,
    };
  }
  const counterExceedsLightbearerInterval = specialAttack.regenTickCounter > 25;
  return {
    ...specialAttack,
    lightbearerEquipped: true,
    regenTickCounter: counterExceedsLightbearerInterval ? 25 : specialAttack.regenTickCounter,
  };
}
function getSpecialAttackRegenIntervalTicks(specialAttackState) {
  if (specialAttackState.lightbearerEquipped) {
    return 25;
  } else {
    return 50;
  }
}
function regenerateSpecialAttackEnergy(specialAttack, energyAtTickStart = specialAttack.energy) {
  const regenIntervalTicks = getSpecialAttackRegenIntervalTicks(specialAttack);
  if (energyAtTickStart >= MAX_SPECIAL_ATTACK_ENERGY) {
    if (specialAttack.regenTickCounter === regenIntervalTicks) {
      return specialAttack;
    } else {
      return {
        ...specialAttack,
        regenTickCounter: regenIntervalTicks,
      };
    }
  }
  const regenTickCounter = specialAttack.regenTickCounter - 1;
  if (regenTickCounter <= 0) {
    const restoredEnergy = Math.min(MAX_SPECIAL_ATTACK_ENERGY, specialAttack.energy + 10);
    return {
      ...specialAttack,
      energy: restoredEnergy,
      regenTickCounter: regenIntervalTicks,
    };
  }
  return {
    ...specialAttack,
    regenTickCounter: regenTickCounter,
  };
}
function tickStatDecayLocks(stats, timers) {
  let updatedStats = stats;
  const remainingDecayLocks = {};
  const expiredSources = [];
  let anyDecayLock = false;
  for (const statName of combatStatNames) {
    const decayLock = timers.statDecayLocks[statName];
    if (!decayLock) {
      continue;
    }
    anyDecayLock = true;
    const ticksRemaining = Math.max(0, decayLock.ticksRemaining - 1);
    if (ticksRemaining > 0) {
      remainingDecayLocks[statName] = {
        ...decayLock,
        ticksRemaining: ticksRemaining,
      };
      continue;
    }
    if (!expiredSources.includes(decayLock.source)) {
      expiredSources.push(decayLock.source);
    }
    const stat = updatedStats[statName];
    if (stat.current > stat.max) {
      updatedStats = withStatCurrentLevel(updatedStats, statName, stat.max);
    }
  }
  if (anyDecayLock) {
    return {
      stats: updatedStats,
      timers: {
        ...timers,
        statDecayLocks: remainingDecayLocks,
      },
      expired: expiredSources,
    };
  } else {
    return {
      stats: stats,
      timers: timers,
      expired: expiredSources,
    };
  }
}
function applyStatDecayAndRecovery(stats, timers, tick, preserveActive, rapidRestoreDue) {
  const statBoostDecayTick = timers.statBoostDecayTick;
  const decayDue = tick >= statBoostDecayTick;
  const preserveExtendsDecay = decayDue && preserveActive && !timers.statBoostDecayExtended;
  const applyDecay = decayDue && !preserveExtendsDecay;
  const recoveryDue = tick >= timers.statRecoveryTick;
  const updatedStats = cloneStats(stats);
  if (applyDecay) {
    for (const statName of decayingStatNames) {
      const stat = updatedStats[statName];
      const decayLocked = isDecayLockableStat(statName) && undefined !== timers.statDecayLocks[statName];
      if (stat.current > stat.max && !decayLocked) {
        stat.current -= 1;
      }
    }
  }
  for (const statName of decayingStatNames) {
    const stat = updatedStats[statName];
    if (stat.current < stat.max && recoveryDue) {
      stat.current += 1;
    }
    if (stat.current < stat.max && rapidRestoreDue) {
      stat.current += 1;
    }
  }
  return {
    stats: updatedStats,
    timers: {
      ...timers,
      statBoostDecayTick: preserveExtendsDecay
        ? statBoostDecayTick + 50
        : applyDecay
          ? tick + 100
          : statBoostDecayTick,
      statBoostDecayExtended: !!preserveExtendsDecay || (!applyDecay && timers.statBoostDecayExtended),
      statRecoveryTick: recoveryDue ? tick + 100 : timers.statRecoveryTick,
    },
  };
}
// Preserve counts from the 25th tick after it was switched on.
function isPreserveActive(prayerState, tick) {
  if (!prayerState.activePrayers.includes(Prayer.Preserve)) {
    return false;
  }
  const activationTick = prayerState.prayerActivationTicks[Prayer.Preserve];
  return undefined !== activationTick && tick - activationTick >= 25;
}
function isRapidRestoreDue(prayerState, tick) {
  if (!prayerState.activePrayers.includes(Prayer.RapidRestore)) {
    return false;
  }
  const activationTick = prayerState.prayerActivationTicks[Prayer.RapidRestore];
  if (activationTick === undefined) {
    return false;
  }
  const ticksActive = tick - activationTick;
  return ticksActive > 0 && ticksActive % 100 == 0;
}
function consumeDeathChargeProc(specialAttack, combatTimers) {
  if (
    combatTimers.deathChargeActiveTicks <= 0 ||
    combatTimers.deathChargeProcsRemaining <= 0
  ) {
    return null;
  }
  const procsRemaining = combatTimers.deathChargeProcsRemaining - 1;
  return {
    special: {
      ...specialAttack,
      energy: Math.min(MAX_SPECIAL_ATTACK_ENERGY, specialAttack.energy + 15),
    },
    timers: {
      ...combatTimers,
      deathChargeProcsRemaining: procsRemaining,
      deathChargeActiveTicks: procsRemaining === 0 ? 0 : combatTimers.deathChargeActiveTicks,
    },
  };
}
function activateDeathChargeTimers(combatTimers, isDoubled) {
  if (combatTimers.deathChargeCooldownTicks > 0) {
    return null;
  } else {
    return {
      ...combatTimers,
      deathChargeCooldownTicks: 100,
      deathChargeActiveTicks: 100,
      deathChargeProcsRemaining: isDoubled ? 2 : 1,
    };
  }
}
function computeTheoreticalDps(attackInput) {
  const attackPlan = planPlayerAttack(attackInput, false, false);
  if (attackPlan === null || "unsupported" === attackPlan.kind) {
    return null;
  }
  const projection = projectPlayerAttack(attackPlan);
  return {
    dps: projection.appliedDamagePerSecond,
    maxHit: projection.maximumAppliedDamagePerAttack,
    accuracy: projection.hits[0].accuracyProbability,
    style: attackInput.formulaStyle,
    attackSpeedTicks: attackPlan.attackSpeedTicks,
    attackIntervalSeconds: attackPlan.attackSpeedTicks * 0.6,
    expectedRolledDamagePerAttack: projection.expectedRolledDamagePerAttack,
    expectedAppliedDamagePerAttack: projection.expectedAppliedDamagePerAttack,
    maximumRolledDamagePerAttack: projection.maximumRolledDamagePerAttack,
    maximumAppliedDamagePerAttack: projection.maximumAppliedDamagePerAttack,
    outgoingDamageMultiplier: attackPlan.application.outgoingDamageMultiplier,
    specialAttackDamageMultiplier:
      attackPlan.application.specialAttackDamageMultiplier,
    baseAttackRoll: attackPlan.diagnostics?.baseAttackRoll ?? null,
    baseDefenceRoll: attackPlan.diagnostics?.baseDefenceRoll ?? null,
    baseMaxHit: attackPlan.diagnostics?.baseMaxHit ?? null,
    profileMaxHit: attackPlan.diagnostics?.profileMaxHit ?? null,
    hits: projection.hits.map((projectedHit, index) => ({
      planIndex: projectedHit.planIndex,
      accuracyProbability: projectedHit.accuracyProbability,
      gateProbability: projectedHit.gateProbability,
      expectedRolledDamage: projectedHit.expectedRolledDamage,
      expectedAppliedDamage: projectedHit.expectedAppliedDamage,
      maximumRolledDamage: projectedHit.maximumRolledDamage,
      maximumAppliedDamage: projectedHit.maximumAppliedDamage,
      procChance: attackPlan.hits[index]?.proc?.chance ?? 0,
    })),
  };
}
function getConsumableAttackDelayTicks(consumableTrack) {
  return ATTACK_DELAY_TICKS_BY_CONSUMABLE_TRACK[consumableTrack];
}
function addItemToInventory(inventory, itemId, quantity, stackable) {
  const nextInventory = inventory.map((itemRef) =>
    itemRef
      ? {
          ...itemRef,
        }
      : null,
  );
  if (stackable) {
    const existingStackIndex = nextInventory.findIndex((itemRef) => itemRef !== null && itemRef.id === itemId);
    const existingStack = existingStackIndex === -1 ? null : nextInventory[existingStackIndex];
    if (existingStack) {
      nextInventory[existingStackIndex] = {
        id: itemId,
        quantity: (existingStack.quantity ?? 1) + quantity,
      };
      return nextInventory;
    }
  }
  const emptySlotIndex = nextInventory.indexOf(null);
  if (emptySlotIndex === -1) {
    return null;
  } else {
    nextInventory[emptySlotIndex] =
      stackable || quantity > 1
        ? {
            id: itemId,
            quantity: quantity,
          }
        : {
            id: itemId,
          };
    return nextInventory;
  }
}
// The player's poison is one number, poisonState.poisonVarp. 0: none. Below
// 0: immune, counting up to 0 by one a pulse. From 1: poison, with the damage
// getPoisonDamage gives, one less a pulse. From 1,000,000
// (VENOM_VARP_THRESHOLD): venom, one more a pulse, dealing 6, 8, ... up to 20.
// tickPoison allows a pulse when poisonTickCounter has run down and sets it
// to 30 again.
function computePlayerPoisonPulse(poisonState) {
  if (poisonState.poisonVarp === 0) {
    return {
      state: {
        ...poisonState,
      },
      damage: 0,
    };
  }
  if (poisonState.poisonVarp < 0) {
    return {
      state: {
        ...poisonState,
        poisonVarp: Math.min(0, poisonState.poisonVarp + 1),
      },
      damage: 0,
    };
  }
  if (poisonState.poisonVarp >= VENOM_VARP_THRESHOLD) {
    const venomDamage = Math.min((poisonState.poisonVarp - 999997) * 2, 20);
    return {
      state: {
        ...poisonState,
        poisonVarp: poisonState.poisonVarp + 1,
      },
      damage: venomDamage,
    };
  }
  const poisonDamage = getPoisonDamage(poisonState.poisonVarp);
  return {
    state: {
      ...poisonState,
      poisonVarp: Math.max(0, poisonState.poisonVarp - 1),
    },
    damage: poisonDamage,
  };
}
function getAliveTargetId(worldState, npc) {
  const targetId = npc.combat.targetId;
  if (targetId === null) {
    return null;
  } else if (worldState.actors.get(targetId)?.alive === true) {
    return targetId;
  } else {
    return null;
  }
}
function resolveNpcAttackTimer(npc, engine, aliveTargetId) {
  return (
    engine.getNpcAttackTimer(npc.id) ||
    (!npc.alive ||
    null === aliveTargetId ||
    npc.combat.attackSpeed <= 0 ||
    npc.combat.nextActionTick <= 0
      ? null
      : {
          nextAttackTick: npc.combat.nextActionTick,
          attackSpeed: npc.combat.attackSpeed,
        })
  );
}
function buildEngineState(worldState, engine) {
  const player = worldState.getPlayer();
  const npcs = worldState.getNpcs();
  const primaryNpc = npcs.find((npc) => npc.role === "boss") ?? npcs[0] ?? null;
  if (!player) {
    throw new Error("WorldState missing required player actor");
  }
  const npcSnapshots = (primaryNpc ? [primaryNpc, ...npcs.filter((npc) => npc.id !== primaryNpc.id)] : npcs).map(
    (npc) => {
      const role = npc.role ?? "npc";
      const aliveTargetId = getAliveTargetId(worldState, npc);
      const attackTimer = resolveNpcAttackTimer(npc, engine, aliveTargetId);
      const crawlMovement = npc.crawlMovement;
      const crawlMovementActive =
        crawlMovement &&
        worldState.tick >= crawlMovement.startTick &&
        worldState.tick < crawlMovement.startTick + 2 &&
        npc.position[0] === crawlMovement.to[0] &&
        npc.position[1] === crawlMovement.to[1];
      return {
        id: npc.id,
        npcTypeId: npc.npcTypeId,
        archetypeId: npc.archetypeId,
        role: role,
        alive: npc.alive,
        position: npc.position,
        previousPosition: npc.previousPosition,
        ...(npc.movementPath !== undefined && npc.movementPath.length > 1
          ? {
              movementPath: npc.movementPath,
            }
          : {}),
        ...(crawlMovementActive
          ? {
              crawlMovement: {
                from: [...crawlMovement.from],
                to: [...crawlMovement.to],
                startTick: crawlMovement.startTick,
              },
            }
          : {}),
        facingAngle: npc.facing,
        ...(undefined === npc.lockedFacing
          ? {}
          : {
              lockedFacing: npc.lockedFacing,
            }),
        ...(undefined === npc.actionFacing
          ? {}
          : {
              actionFacing: npc.actionFacing,
            }),
        combatTargetId: getVisibleCombatTargetId(npc, aliveTargetId),
        ...(attackTimer
          ? {
              attackTimer: attackTimer,
            }
          : {}),
        size: npc.size,
        hp: npc.vitals.hp,
        maxHp: npc.vitals.maxHp,
        outline: npc.outline,
        spawnTick: npc.spawnTick,
        despawnTick: npc.despawnTick,
        ...(undefined === npc.targetableFromTick
          ? {}
          : {
              targetableFromTick: npc.targetableFromTick,
            }),
        ...(npc.untargetable
          ? {
              untargetable: true,
            }
          : {}),
        ...(npc.despawnTimerLeadTicks === undefined
          ? {}
          : {
              despawnTimerLeadTicks: npc.despawnTimerLeadTicks,
            }),
        // Drawn by the overlay renderer (rendering.js, npcOverheadsAndBars).
        ...(npc.overheadPrayers?.length ? { overheadPrayers: [...npc.overheadPrayers] } : {}),
        ...(npc.chargeBar ? { chargeBar: { ...npc.chargeBar } } : {}),
        ...(npc.shieldBar ? { shieldBar: { ...npc.shieldBar } } : {}),
        ...(npc.alwaysShowHealthBar
          ? {
              alwaysShowHealthBar: true,
            }
          : {}),
        ...(npc.healthBarWhenUntargetable
          ? {
              healthBarWhenUntargetable: true,
            }
          : {}),
        ...(undefined === npc.spawnOrigin
          ? {}
          : {
              spawnOrigin: npc.spawnOrigin,
            }),
        ...(undefined === npc.deathCause
          ? {}
          : {
              deathCause: npc.deathCause,
            }),
        ...(npc.alive || npc.deathAnimationTick === undefined
          ? {}
          : {
              deathAnimationTick: npc.deathAnimationTick,
            }),
        history: engine.getNpcHistory(npc.id),
      };
    },
  );
  const primaryNpcPosition = npcSnapshots[0]?.position ?? [0, 0];
  const primaryNpcPreviousPosition = npcSnapshots[0]?.previousPosition ?? [0, 0];
  const primaryNpcFacingAngle = npcSnapshots[0]?.facingAngle ?? 0;
  const primaryNpcSize = npcSnapshots[0]?.size ?? 1;
  const prayerProjection = projectPendingPrayerOps(buildPrayerProjectionInput(player, worldState.tick, engine.getPrayerRestoreProjectionRules()));
  return {
    currentTick: worldState.tick,
    playerPosition: player.position,
    playerPreviousPosition: player.previousPosition,
    playerMovementPath: player.movementPath,
    playerFacingAngle: player.facing,
    playerIsMoving: player.isMoving,
    playerIsRunning: player.isRunning,
    primaryNpcPosition: primaryNpcPosition,
    primaryNpcPreviousPosition: primaryNpcPreviousPosition,
    primaryNpcFacingAngle: primaryNpcFacingAngle,
    primaryNpcSize: primaryNpcSize,
    playerOutline: player.outline,
    // The thrall is drawn as an NPC; it is not one (thralls.js).
    npcs: player.thrall ? [...npcSnapshots, getThrallSnapshot(player)] : npcSnapshots,
    ...(player.thrall
      ? { thrall: { spellName: player.thrall.spellName, ticksRemaining: player.thrall.expiresTick - worldState.tick } }
      : {}),
    encounter: engine.getEncounterSnapshot(),
    encounterOutcome: engine.getEncounterOutcome(),
    isAlive: player.alive,
    markOfDarknessActive: player.combatTimers.markOfDarknessActiveTicks > 0,
    markOfDarknessTicksRemaining: player.combatTimers.markOfDarknessActiveTicks,
    activePrayer: player.activePrayer,
    offensivePrayer: player.offensivePrayer,
    independentPrayers: player.independentPrayers,
    failedCondition: engine.getFailedCondition(),
    playerHistory: player.history,
    primaryNpcHistory: npcSnapshots[0]?.history ?? new Map(),
    playerHP: player.vitals.hp,
    maxHP: player.vitals.maxHp,
    poisonVarp: player.poisonState.poisonVarp,
    poisonTickCounter: player.poisonState.poisonTickCounter,
    damageHistory: engine.getDamageHistory(),
    eventLog: engine.getEventLog(),
    stats: player.stats,
    specialAttack: player.specialAttack,
    ...(player.soulreaper === undefined
      ? {}
      : {
          soulreaperStacks: player.soulreaper.stacks,
        }),
    combatTimers: player.combatTimers,
    inventory: player.inventory,
    groundItems: worldState.groundItems.map((groundItem) => ({
      ...groundItem,
      position: [...groundItem.position],
    })),
    isRunEnabled:
      countPendingInputOps(player, "run_toggle") % 2 == 1 ? !player.isRunEnabled : player.isRunEnabled,
    isSpecialAttackActive: player.isSpecialAttackActive,
    pendingSpecialAttackToggles: countPendingInputOps(player, "special_attack_toggle"),
    pendingProtectionPrayer: [prayerProjection.protectionTouched, prayerProjection.protection],
    pendingOffensivePrayer: [prayerProjection.offensiveTouched, prayerProjection.offensive],
    pendingIndependentPrayers: [prayerProjection.independentTouched, prayerProjection.independent],
    quickPrayersActive: prayerProjection.quickPrayersActive,
    runEnergy: player.runEnergy,
    equipmentStats: player.equipmentStats,
    prayerState: player.prayerState,
    playerEquipment: {
      ...player.equipment,
    },
    playerCombatSupplies: cloneCombatSupplies(player.combatSupplies),
    cooldownTracks: {
      ...player.cooldownTracks,
    },
    mechanicsConfig: {
      ...engine.getMechanicsConfig(),
    },
    attackTarget: player.attackTarget,
    lastAttackTarget: player.lastAttackTarget ?? null,
    selectedAttackStyleIndex: player.selectedAttackStyleIndex,
    playerAttackCooldown: engine.getPlayerAttackCooldown(player.id, worldState.tick),
    playerNextAttackTick: engine.getPlayerNextAttackTick(player.id),
    playerAttackSpeed: engine.getPlayerAttackSpeed(player.id),
    introActive: engine.getIntroActive(),
  };
}
var SimulationEngine = class {
  replayTakeoverWork;
  worldState;
  failedCondition;
  encounter;
  mechanicsConfig;
  playerMechanicsConfig = {};
  runMechanicsOverride = {};
  damageHistory;
  eventLog;
  objTypeLoader;
  tickEvents;
  combatSystem;
  npcDefinitions;
  encounterRules;
  protectionPrayerActivatedTick = null;
  protectionPrayersDisabledUntilTick = Number.NEGATIVE_INFINITY;
  lastTickEvents = [];
  // Set when a consumable with a self-damage effect was used and changed the
  // player's state while the inputs were applied (its hitsplat is out by
  // then): runTick asks tryTriggerRedemption once, after all inputs, and
  // clears it. No hit is waiting anywhere.
  selfDamageHitPending = false;
  npcTurnsRunning = false;
  addedOutsideNpcTurns = new WeakMap();
  _attackStylePerCategory = {};
  _introActive = false;
  _introEnabled = false;
  startedIntro = null;
  openingIntro = null;
  _tutorialPaused = false;
  pendingEquipmentSlotClicks = [];
  lastTickInputLocked = false;
  pendingEncounterCommands = [];
  completionOwnership = "encounter-owned";
  pendingNpcDefeats = [];
  configuredStats;
  startHp;
  encounterConfig;
  runStartPosition;
  prepotApplied = false;
  combatSeed;
  combatRandom;
  combatRandomOverride;
  rollCombat = () => this.combatRandom();
  combatDecisions;
  constructor(startPosOrOptions, initialInventory, objTypeLoader, encounter) {
    const options = Array.isArray(startPosOrOptions)
      ? {
          startPos: startPosOrOptions,
          initialInventory: initialInventory,
          objTypeLoader: objTypeLoader,
          encounter: encounter,
        }
      : {
          initialInventory: initialInventory,
          objTypeLoader: objTypeLoader,
          encounter: encounter,
          ...startPosOrOptions ?? {},
        };
    this.replayTakeoverWork = options.replayTakeoverWork;
    this.worldState = new WorldState();
    this.failedCondition = null;
    this._introEnabled = options.enableIntro ?? false;
    if (!options.encounter) {
      throw new Error("SimulationEngine requires an explicit encounter");
    }
    this.encounter = options.encounter;
    this.npcDefinitions = this.encounter.getNpcDefinitions?.() ?? new NpcDefinitionRegistry();
    this.encounterRules = this.encounter.getEngineRules?.();
    this.playerMechanicsConfig = {
      ...(options.mechanics ?? {}),
    };
    this.mechanicsConfig = buildMechanicsConfig(this.getDefaultMechanicsConfig(), this.playerMechanicsConfig);
    this.damageHistory = [];
    this.eventLog = [];
    this.objTypeLoader = options.objTypeLoader ?? null;
    this.tickEvents = new TickEventBuffer();
    this.combatRandomOverride = options.combatRandom;
    this.combatSeed = resolveCombatSeed(options.combatSeed);
    this.combatRandom = this.combatRandomOverride ?? createSeededRandom(this.combatSeed);
    this.combatDecisions = (options.combatDecisions ?? createRandomDecisions)(this.rollCombat);
    this.combatSystem = new CombatSystem({
      random: this.rollCombat,
    });
    this.encounterConfig = options.encounterConfig;
    this.configuredStats = resetStatsToMax(options.stats ?? createDefaultStats());
    this.startHp = Number.isFinite(options.startHp) ? options.startHp : undefined;
    this.applyArenaConfig(this.encounter);
    const startPosition = options.startPos ?? this.getDefaultStartPosition(this.encounter);
    this.runStartPosition = [...startPosition];
    this.initializeRun(startPosition, options.initialInventory ?? createEmptyInventory());
  }
  getEncounterRules() {
    return this.encounterRules;
  }
  // The player's attack range as the fight uses it, with the encounter's
  // rules: for what draws it (client/plugins/attackRanges.js).
  getPlayerAttackRange() {
    return resolvePlayerCombatParams(this.player(), { world: this.worldState, encounterRules: this.getEncounterRules() }).attackRange;
  }
  buildRulesContext() {
    return {
      tick: this.worldState.tick,
      player: this.player(),
      world: this.worldState,
    };
  }
  buildTickContext(tick, playerPosition, inputs, npcMovements, setProtectionPrayer) {
    return {
      tick: tick,
      playerPos: playerPosition,
      world: this.worldState,
      tickEvents: this.tickEvents,
      logEvent: (event) => this.logEvent(event),
      grantNextAttackSpeedup: (actorId, speedupTicks) => this.combatSystem.grantNextAttackSpeedup(actorId, speedupTicks, tick),
      spawnNpc: (npc) => this.spawnNpc(npc),
      despawnNpc: (npcId) => this.despawnNpc(npcId),
      queueNpcHit: (attack) => this.queueNpcHit(attack),
      inputs: inputs,
      getPlayerWeaponState: () => ({
        range: resolvePlayerCombatParams(this.player(), {world:this.worldState,encounterRules:this.getEncounterRules()}).attackRange,
        cooldown:this.getPlayerAttackCooldown(this.player().id,tick)
      }),
      attackObject: (target) => {
        const player = this.player();
        const weaponId = player.equipment.weapon;
        const styleIndex = player.selectedAttackStyleIndex;
        const spell = getActiveSpell({weaponId, selectedStyleIndex: styleIndex,
          selectedSpell: player.combatSupplies.selectedSpell, spellbook: player.combatSupplies.spellbook});
        const formulaStyle = getWeaponFormulaStyle(weaponId, styleIndex);
        const distance = getDistanceToFootprint(...player.position, ...target.position, target.size);
        const projectile = spell ? projectileTimings.magic_spell : getWeaponProjectileTiming(weaponId, false);
        const delay = spell?.fixedHitDelay ?? (projectile ? getHitDelayTicksFromCycles(getProjectileFlightCycles(projectile, distance)) : getHitDelayTicks(getHitDelayWeaponKind(weaponId, formulaStyle), distance));
        const params = resolvePlayerCombatParams(player, {world: this.worldState, encounterRules: this.getEncounterRules()});
        if (!this.combatSystem.tryStartAttackCooldown(tick, player, {getAttackSpeed: () => params.attackSpeed})) return;
        this.tickEvents.emit({
          type: "attack_started", sourceId: player.id, targetId: target.id,
          style: formulaStyleToAttackStyle(formulaStyle), attackKind: formulaStyleToAttackKind(formulaStyle), weaponId, ammoId: player.equipment.ammo,
          spellId: spell?.name, usingSpecialAttack: false, impactDelayTicks: delay,
          ...(formulaStyle === "ranged" || formulaStyle === "magic" ? {spellCast: {
            sourcePosition: [...player.position], targetPosition: [...target.position], targetSize: target.size, accurate: true,
          }} : {}),
        });
        return delay;
      },
      npcMovements: npcMovements,
      setProtectionPrayer: setProtectionPrayer,
      disableProtectionPrayersUntil: (untilTick) =>
        this.disableProtectionPrayersUntil(untilTick),
      teleportPlayer: (position, facing) => this.teleportPlayer(position, facing),
    };
  }
  teleportPlayer(position, facing) {
    const player = this.player();
    clearPlayerAttackTarget(player);
    player.pendingItemPickup = null;
    player.position = [...position];
    player.previousPosition = player.position;
    player.movementPath = [];
    player.isMoving = false;
    player.isRunning = false;
    player.facing = facing;
    this.worldState.occupancy.syncActors(this.worldState.actors.values());
  }
  isLastTickInputLocked() {
    return this.lastTickInputLocked;
  }
  buildNpcDefinitionContext() {
    return {
      tick: this.worldState.tick,
      world: this.worldState,
      tickEvents: this.tickEvents,
      random: this.rollCombat,
      decisions: this.combatDecisions,
      spawnNpc: (npc) => this.spawnNpc(npc),
      despawnNpc: (npcId) => this.despawnNpc(npcId),
      queueNpcHit: (attack) => this.queueNpcHit(attack),
      logEvent: (event) => this.logEvent(event),
      setProtectionPrayer: (protectionPrayer) => this.setProtectionPrayer(protectionPrayer),
      disableProtectionPrayersUntil: (untilTick) =>
        this.disableProtectionPrayersUntil(untilTick),
    };
  }
  disableProtectionPrayersUntil(untilTick) {
    this.protectionPrayersDisabledUntilTick = Math.max(
      this.protectionPrayersDisabledUntilTick,
      untilTick,
    );
  }
  spawnNpc(npc) {
    if (this.worldState.actors.has(npc.id)) {
      throw new Error("spawnNpc: duplicate actor id '" + npc.id + "'");
    }
    this.replayTakeoverWork?.recordNpcSpawns(this.getNpcCount(), 1);
    this.npcDefinitions.assertDefinitionMatches(npc);
    this.applyMonsterStatOverrides(npc);
    delete npc.crawlMovement;
    this.worldState.registerNpc(npc);
    if (!this.npcTurnsRunning) {
      this.addedOutsideNpcTurns.set(npc, this.worldState.tick);
    }
    npc.history.set(this.worldState.tick, [...npc.position]);
  }
  applyMonsterStatOverrides(npc) {
    npc.formulaStats = applyMonsterStatOverride(npc.formulaStats, this.getMonsterStatOverride(npc.npcTypeId));
  }
  despawnNpc(npcId) {
    const npc = this.worldState.getNpc(npcId);
    if (npc) {
      this.worldState.removeActor(npcId);
      this.tickEvents.emit({
        type: "actor_despawned",
        actorId: npcId,
      });
      this.npcDefinitions.notifyDespawn(npc, this.buildNpcDefinitionContext());
    }
  }
  applyRuleOutcome(ruleOutcome) {
    if (null == ruleOutcome) {
      return null;
    }
    if ("string" == typeof ruleOutcome) {
      if (this.mechanicsConfig.infiniteStamina && "StaminaDepleted" === ruleOutcome) {
        return null;
      } else {
        return ruleOutcome;
      }
    }
    if (
      ruleOutcome.runEnergyDelta !== undefined &&
      !this.mechanicsConfig.infiniteStamina
    ) {
      const player = this.player();
      player.runEnergy = {
        energy: Math.max(
          0,
          Math.min(maxRunEnergy, player.runEnergy.energy + ruleOutcome.runEnergyDelta),
        ),
      };
    }
    if (undefined !== ruleOutcome.prayerPointsDelta) {
      const player = this.player();
      const points = player.prayerState.points;
      player.prayerState = {
        ...player.prayerState,
        points: Math.max(
          0,
          Math.min(
            // Points raised beyond the level (a special attack can) stay.
            Math.max(player.prayerState.maxPoints, points),
            player.prayerState.points + ruleOutcome.prayerPointsDelta,
          ),
        ),
      };
      if (points > 0 && player.prayerState.points === 0) {
        this.depletePrayer(this.worldState.tick);
      }
    }
    if (ruleOutcome.playerStatDrains !== undefined) {
      const player = this.player();
      let drainedStats = player.stats;
      for (const statName of combatStatNames) {
        const drainAmount = ruleOutcome.playerStatDrains[statName];
        if (undefined !== drainAmount) {
          drainedStats = withStatCurrentLevel(drainedStats, statName, drainStatLevel(drainedStats[statName].current, drainAmount));
        }
      }
      player.stats = drainedStats;
    }
    for (const hitsplat of ruleOutcome.playerHitsplats ?? []) {
      this.tickEvents.emit({
        type: "hitsplat_spawned",
        targetId: PLAYER_ACTOR_ID,
        ...hitsplat,
      });
    }
    if (ruleOutcome.gameMessage) {
      this.tickEvents.emit({
        type: "game_message",
        kind: "game",
        segments: ruleOutcome.gameMessage,
      });
    }
    const failCondition = ruleOutcome.fail ?? null;
    if (
      failCondition &&
      this.mechanicsConfig.infiniteStamina &&
      "StaminaDepleted" === failCondition
    ) {
      return null;
    } else {
      return failCondition;
    }
  }
  getPlayerCombatParams(player) {
    const combatParams = computePlayerCombatParams(player);
    const encounterRules = this.getEncounterRules();
    if (encounterRules?.modifyPlayerCombatParams) {
      return encounterRules.modifyPlayerCombatParams(combatParams, this.buildRulesContext());
    } else {
      return combatParams;
    }
  }
  lookupItemStats(itemId) {
    if (null === this.objTypeLoader) {
      return null;
    }
    try {
      return getItemEquipmentStats(itemId, this.objTypeLoader);
    } catch {
      return null;
    }
  }
  buildCombatContext(overrides) {
    const encounterRules = this.getEncounterRules();
    const encounterContext = this.buildRulesContext();
    return {
      events: this.tickEvents,
      infiniteHealth: this.mechanicsConfig.infiniteHealth,
      incomingDamageMultiplier: resolveValueOrCallback(encounterRules?.incomingDamageMultiplier, encounterContext),
      outgoingDamageMultiplier: resolveValueOrCallback(encounterRules?.outgoingDamageMultiplier, encounterContext),
      specDamageMultiplier: resolveValueOrCallback(encounterRules?.specialAttacks?.damageMultiplier, encounterContext),
      playerDamageOnNpc: encounterRules?.playerDamageOnNpc,
      onDamageApplied: (appliedDamage) => this.handleDamageApplied(appliedDamage),
      onSourceSelfDamageApplied: () => this.tryTriggerRedemption(this.worldState.tick),
      ...overrides,
    };
  }
  applyArenaConfig(encounter) {
    const baseEncounterKind = resolveBaseEncounterKind(encounter.kind);
    const registeredArenaConfig = getRegisteredArenaConfig(baseEncounterKind);
    if (
      registeredArenaConfig &&
      (null !== registeredArenaConfig.bounds ||
        null !== registeredArenaConfig.walkableTiles ||
        registeredArenaConfig.collisionMap !== null)
    ) {
      setArenaConfig(encounter.refineArenaConfig?.(registeredArenaConfig) ?? registeredArenaConfig, false);
      return;
    }
    const arenaConfig = encounter.getArenaConfig();
    const hasArenaGeometry =
      null !== arenaConfig.bounds ||
      null !== arenaConfig.walkableTiles ||
      arenaConfig.collisionMap !== null;
    setArenaConfig(encounter.refineArenaConfig?.(arenaConfig) ?? arenaConfig, !hasArenaGeometry);
  }
  reapplyArenaConfig() {
    this.applyArenaConfig(this.encounter);
  }
  getDefaultStartPosition(encounter) {
    return encounter.getDefaultPlayerStart(this.mechanicsConfig);
  }
  buildRunStartContext() {
    return {
      world: this.worldState,
      spawnNpc: (npc) => this.spawnNpcAtRunStart(npc),
      despawnNpc: (npcId) => {
        const npc = this.worldState.getNpc(npcId);
        if (npc) {
          this.worldState.removeActor(npcId);
          this.npcDefinitions.notifyDespawn(npc, this.buildNpcDefinitionContext());
        }
      },
      placePlayer: (startPosition) => {
        const player = this.player();
        this.runStartPosition = [...startPosition];
        player.position = [...startPosition];
        player.previousPosition = player.position;
        player.movementPath = [];
        player.isMoving = false;
        player.isRunning = false;
        player.facing = this.getStartFacing();
        player.history.clear();
        player.history.set(0, player.position);
        const occupancy = this.worldState.occupancy;
        occupancy.clear();
        for (const actor of this.worldState.actors.values()) {
          occupancy.add(actor);
        }
      },
    };
  }
  spawnNpcAtRunStart(npc) {
    if (this.worldState.actors.has(npc.id)) {
      throw new Error("spawnNpc: duplicate actor id '" + npc.id + "'");
    }
    this.replayTakeoverWork?.recordNpcSpawns(this.getNpcCount(), 1);
    this.npcDefinitions.assertDefinitionMatches(npc);
    this.applyMonsterStatOverrides(npc);
    delete npc.crawlMovement;
    this.worldState.registerNpc(npc);
    npc.history.set(0, npc.position);
  }
  initializeRun(startPosition, inventory) {
    this.worldState.tick = 0;
    this.worldState.pendingHits = [];
    this.worldState.nextHitSequence = 0;
    this.worldState.nextNpcProcessingOrder = 0;
    this.worldState.areaEffects = [];
    this.worldState.actors = new Map();
    this.worldState.occupancy.clear();
    this.worldState.groundItems = [];
    this.worldState.groundItemSeq = 0;
    const openingIntro = this.getEnabledIntroConfig();
    this.startedIntro = openingIntro;
    this.openingIntro = openingIntro;
    this._introActive = openingIntro !== null;
    const player = this.createPlayerActor(startPosition, inventory);
    player.facing = this.getStartFacing();
    this.worldState.actors.set(player.id, player);
    this.worldState.occupancy.add(player);
    this.encounter.configureRunStart?.(this.mechanicsConfig, this.buildRunStartContext());
    const npcs = this.encounter.createNpcs(startPosition);
    this.replayTakeoverWork?.recordNpcSpawns(0, npcs.length);
    for (const npc of npcs) {
      this.npcDefinitions.assertDefinitionMatches(npc);
      this.applyMonsterStatOverrides(npc);
      delete npc.crawlMovement;
      this.worldState.registerNpc(npc);
      npc.history.set(0, npc.position);
    }
    player.history.set(0, player.position);
    const playerMaxHpReduction = this.encounterRules?.playerMaxHpReduction;
    if (playerMaxHpReduction !== undefined && playerMaxHpReduction > 0 && playerMaxHpReduction <= 1) {
      player.vitals.maxHp = Math.max(
        1,
        player.vitals.maxHp - Math.floor(player.vitals.maxHp * playerMaxHpReduction),
      );
      player.vitals.hp = Math.min(player.vitals.hp, player.vitals.maxHp);
    }
    if (undefined !== this.startHp) {
      player.vitals.hp = Math.max(
        1,
        Math.min(Math.floor(this.startHp), player.vitals.maxHp),
      );
    }
    this.syncVitalsToStats();
    this.logEvent({
      tick: 0,
      type: LogEventType.TICK_START,
      playerPosition: [...player.position],
    });
    this.tickEvents.setCurrentTick(0);
    if (openingIntro) {
      this.tickEvents.emit({
        type: "intro_started",
        animationSeqId: openingIntro.animationSeqId,
        landingPosition: [...startPosition],
      });
    }
    this.lastTickEvents = this.tickEvents.flush();
  }
  createPlayerActor(startPosition, inventory) {
    const stats = resetStatsToMax(this.configuredStats);
    const prayerState = createPrayerState();
    prayerState.points = stats.prayer.current;
    prayerState.maxPoints = stats.prayer.max;
    return {
      id: PLAYER_ACTOR_ID,
      kind: "player",
      alive: true,
      position: startPosition,
      previousPosition: startPosition,
      facing: 1024,
      size: 1,
      vitals: {
        hp: stats.hitpoints.current,
        maxHp: stats.hitpoints.max,
      },
      movementPath: [],
      isMoving: false,
      isRunning: false,
      history: new Map(),
      // activePrayer is the prayer of the protection slot that is on, or null:
      // one of the three protection prayers or Redemption (prayerSlotByPrayer).
      // The other two slots are offensivePrayer and independentPrayers;
      // syncActivePrayerList writes the prayers of all three into
      // prayerState.activePrayers.
      activePrayer: null,
      offensivePrayer: null,
      independentPrayers: [],
      prayerState: prayerState,
      stats: stats,
      poisonState: createPoisonState(),
      specialAttack: createSpecialAttackState(),
      combatTimers: createCombatTimers(),
      inventory: inventory,
      combatSupplies: createEmptyCombatSupplies(),
      isRunEnabled: true,
      isSpecialAttackActive: false,
      runEnergy: createRunEnergy(),
      ctrlClickOverride: false,
      equipment: {},
      equipmentStats: createEmptyEquipmentStats(),
      pendingInputOps: [],
      cooldownTracks: {
        food: 0,
        potion: 0,
        combo_food: 0,
      },
      pendingItemPickup: null,
      activeEffects: [],
      quickPrayersActive: false,
      outline: {
        color: packHsl(144, 246, 104),
        style: "full",
      },
      attackTarget: null,
      autoAttackPause: null,
      attackInteractionActive: true,
      manualCastSpell: null,
      selectedAttackStyleIndex: 0,
      pendingConflictionAttack: null,
      xpCounters: {},
    };
  }
  setStats(stats) {
    this.configuredStats = resetStatsToMax(stats);
    const player = this.player();
    player.stats = resetStatsToMax(this.configuredStats);
    player.vitals = {
      hp: player.stats.hitpoints.current,
      maxHp: player.stats.hitpoints.max,
    };
    player.prayerState = {
      ...createPrayerState(),
      points: player.stats.prayer.current,
      maxPoints: player.stats.prayer.max,
    };
  }
  player() {
    const player = this.worldState.getPlayer();
    if (!player) {
      throw new Error("Player actor missing from world state");
    }
    return player;
  }
  logEvent(event) {
    this.eventLog.push(event);
  }
  recordPositionHistory(history, tick, position) {
    history.set(tick, position);
    history.delete(tick - 50);
  }
  removeDeadNpcs(tick) {
    let npcsDueForRemoval = null;
    for (const actor of this.worldState.actors.values()) {
      if (actor.alive || actor.kind !== "npc") {
        continue;
      }
      const npc = actor;
      const despawnTick = getNpcDespawnTick(npc);
      if (!("boss" === npc.role) && !npc.retainAfterDeath && despawnTick !== undefined) {
        if (!(tick - despawnTick < 10)) {
          if (npcsDueForRemoval === null) {
            npcsDueForRemoval = [];
          }
          npcsDueForRemoval.push(npc);
        }
      }
    }
    if (npcsDueForRemoval) {
      for (const deadNpc of npcsDueForRemoval) {
        if (!isActorInWorld(this.worldState, deadNpc) || deadNpc.alive) {
          continue;
        }
        const despawnTick = getNpcDespawnTick(deadNpc);
        if (!("boss" === deadNpc.role) && !deadNpc.retainAfterDeath && despawnTick !== undefined) {
          if (!(tick - despawnTick < 10)) {
            this.worldState.removeActor(deadNpc.id);
            this.npcDefinitions.notifyDespawn(deadNpc, this.buildNpcDefinitionContext());
          }
        }
      }
    }
  }
  setMechanicsConfig(playerMechanicsConfig) {
    this.playerMechanicsConfig = {
      ...playerMechanicsConfig,
    };
    this.rebuildMechanicsConfig();
    if (this.worldState.tick === 0) {
      this.encounter.configureRunStart?.(this.mechanicsConfig, this.buildRunStartContext());
      this.syncOpeningIntro();
    }
    const offensivePrayer = this.worldState.getPlayer()?.offensivePrayer ?? null;
    if (!(null === offensivePrayer) && !isPrayerUnlockedByMechanics(offensivePrayer, this.mechanicsConfig)) {
      this.deactivateOffensivePrayer(this.worldState.tick);
    }
  }
  getEnabledIntroConfig() {
    if (this._introEnabled) {
      return this.encounter.getIntroConfig(this.mechanicsConfig);
    } else {
      return null;
    }
  }
  syncOpeningIntro() {
    const introConfig = this.getEnabledIntroConfig();
    const startedIntro = this.startedIntro;
    const openingIntro =
      null !== introConfig &&
      null !== startedIntro &&
      introConfig.facingAngle === startedIntro.facingAngle &&
      introConfig.animationSeqId === startedIntro.animationSeqId &&
      introConfig.message === startedIntro.message
        ? startedIntro
        : null;
    if (openingIntro !== this.openingIntro) {
      this.openingIntro = openingIntro;
      this.player().facing = this.getStartFacing();
    }
  }
  captureRunStartMechanics() {
    const runStartMechanics = Object.fromEntries(
      (this.encounter.runStartMechanicsKeys ?? []).map((mechanicsKey) => [
        mechanicsKey,
        this.mechanicsConfig[mechanicsKey],
      ]),
    );
    this.runMechanicsOverride = {
      ...this.runMechanicsOverride,
      ...runStartMechanics,
    };
    this.rebuildMechanicsConfig();
  }
  rebuildMechanicsConfig() {
    this.mechanicsConfig = buildMechanicsConfig(this.getDefaultMechanicsConfig(), {
      ...this.playerMechanicsConfig,
      ...this.runMechanicsOverride,
    });
  }
  getDefaultMechanicsConfig() {
    return this.encounter.getDefaultMechanicsConfig();
  }
  setGroundItems(groundItems) {
    this.worldState.groundItems = groundItems.map((groundItem) => ({
      ...groundItem,
      position: [groundItem.position[0], groundItem.position[1]],
    }));
    for (const groundItem of this.worldState.groundItems) {
      const groundItemSeq = Number.parseInt(groundItem.id.replace(/^gi-/, ""), 10);
      if (Number.isFinite(groundItemSeq) && groundItemSeq > this.worldState.groundItemSeq) {
        this.worldState.groundItemSeq = groundItemSeq;
      }
    }
  }
  setInventory(inventory) {
    this.player().inventory = inventory;
    this.recalculateEquipmentStats();
  }
  setCombatSupplies(combatSupplies) {
    const player = this.player();
    const spellbook = player.combatSupplies.spellbook;
    player.combatSupplies = cloneCombatSupplies(combatSupplies);
    if (player.combatSupplies.spellbook !== spellbook) {
      this.syncSelectedAttackStyle();
    }
  }
  getCombatSupplies() {
    return cloneCombatSupplies(this.player().combatSupplies);
  }
  setSelectedSpell(spellName) {
    const player = this.player();
    player.combatSupplies = {
      ...player.combatSupplies,
      selectedSpell: spellName,
    };
  }
  swapInventorySlots(fromIndex, toIndex) {
    const player = this.player();
    if (fromIndex === toIndex) {
      return;
    }
    if (fromIndex < 0 || fromIndex >= player.inventory.length) {
      return;
    }
    if (toIndex < 0 || toIndex >= player.inventory.length) {
      return;
    }
    const updatedInventory = [...player.inventory];
    const fromItem = updatedInventory[fromIndex];
    updatedInventory[fromIndex] = updatedInventory[toIndex];
    updatedInventory[toIndex] = fromItem;
    player.inventory = updatedInventory;
  }
  previewInventoryAfterEquip(inventoryIndex, slot) {
    return (
      this.computeEquipResult(this.player().inventory, this.player().equipment, inventoryIndex, slot)
        ?.inventory ?? null
    );
  }
  computeEquipResult(inventory, equipment, inventoryIndex, slot) {
    const itemRef = inventory[inventoryIndex];
    if (!itemRef) {
      return null;
    }
    const updatedInventory = [...inventory];
    const equipsTwoHandedWeapon = slot === "weapon" && this.isTwoHanded(itemRef.id);
    const equipsShieldOverTwoHander =
      "shield" === slot && equipment.weapon !== undefined && this.isTwoHanded(equipment.weapon);
    if (equipsTwoHandedWeapon) {
      const weapon = equipment.weapon;
      const shield = equipment.shield;
      if (
        undefined !== shield &&
        this.countFreeSlotsAfterRemoving(inventory, inventoryIndex) - (undefined !== weapon ? 1 : 0) < 1
      ) {
        return null;
      }
      updatedInventory[inventoryIndex] =
        weapon !== undefined
          ? {
              id: weapon,
            }
          : null;
      if (shield !== undefined) {
        const freeIndex = updatedInventory.indexOf(null);
        if (-1 !== freeIndex) {
          updatedInventory[freeIndex] = {
            id: shield,
          };
        }
      }
      return {
        inventory: updatedInventory,
        equipment: {
          ...equipment,
          weapon: itemRef.id,
          shield: undefined,
        },
      };
    }
    if (equipsShieldOverTwoHander) {
      const weapon = equipment.weapon;
      const shield = equipment.shield;
      if (
        undefined !== weapon &&
        this.countFreeSlotsAfterRemoving(inventory, inventoryIndex) - (undefined !== shield ? 1 : 0) < 1
      ) {
        return null;
      }
      updatedInventory[inventoryIndex] =
        shield !== undefined
          ? {
              id: shield,
            }
          : null;
      if (undefined !== weapon) {
        const freeIndex = updatedInventory.indexOf(null);
        if (-1 !== freeIndex) {
          updatedInventory[freeIndex] = {
            id: weapon,
          };
        }
      }
      return {
        inventory: updatedInventory,
        equipment: {
          ...equipment,
          weapon: undefined,
          shield: itemRef.id,
        },
      };
    }
    const replacedItemId = equipment[slot];
    updatedInventory[inventoryIndex] =
      undefined !== replacedItemId
        ? {
            id: replacedItemId,
          }
        : null;
    return {
      inventory: updatedInventory,
      equipment: {
        ...equipment,
        [slot]: itemRef.id,
      },
    };
  }
  previewInventoryAfterUnequip(slot) {
    return (
      this.computeUnequipResult(this.player().inventory, this.player().equipment, slot)
        ?.inventory ?? null
    );
  }
  computeUnequipResult(inventory, equipment, slot) {
    const equippedItemId = equipment[slot];
    if (undefined === equippedItemId) {
      return null;
    }
    const freeIndex = inventory.indexOf(null);
    if (freeIndex === -1) {
      return null;
    }
    const updatedInventory = [...inventory];
    updatedInventory[freeIndex] = {
      id: equippedItemId,
    };
    return {
      inventory: updatedInventory,
      equipment: {
        ...equipment,
        [slot]: undefined,
      },
    };
  }
  computeInventoryAfterEquipAmmo(inventory, combatSupplies, inventoryIndex) {
    const itemRef = inventory[inventoryIndex];
    if (!itemRef) {
      return null;
    }
    const equippedAmmo = combatSupplies.equippedAmmo;
    const updatedInventory = [...inventory];
    if (equippedAmmo?.id === itemRef.id) {
      updatedInventory[inventoryIndex] = null;
    } else {
      updatedInventory[inventoryIndex] =
        null === equippedAmmo
          ? null
          : {
              ...equippedAmmo,
            };
    }
    return updatedInventory;
  }
  computeInventoryAfterUnequipAmmo(inventory, combatSupplies) {
    const equippedAmmo = combatSupplies.equippedAmmo;
    if (equippedAmmo === null) {
      return null;
    }
    const freeIndex = inventory.indexOf(null);
    if (-1 === freeIndex) {
      return null;
    }
    const updatedInventory = [...inventory];
    updatedInventory[freeIndex] = {
      ...equippedAmmo,
    };
    return updatedInventory;
  }
  advanceTick(targetTile) {
    if (!this.canAdvanceTick()) {
      return;
    }
    const replayTakeoverWork = this.replayTakeoverWork;
    replayTakeoverWork?.beginTick(this.getNpcCount());
    try {
      this.runTick(targetTile);
    } finally {
      replayTakeoverWork?.endTick();
    }
  }
  getNpcCount() {
    return this.worldState.actors.size - 1;
  }
  clearReplayTakeoverWork() {
    this.replayTakeoverWork = undefined;
  }
  advanceNextEventIdPast(lastEventId) {
    this.tickEvents.advanceNextEventIdPast(lastEventId);
  }
  // One tick, in the order it runs. Where a hook of the encounter hands
  // damage back, it is applied at once (applyEnvironmentalDamage).
  //  1. The tick number advances. The encounter commands that were queued
  //     run. The rule onTickStart may fail the run: the tick ends there.
  //  2. The player's queued inputs. While the rule playerInputLocked says
  //     so they are dropped, and with them his attack target and a
  //     pickup he had ordered. Otherwise they are applied in the order
  //     they came (processPendingInputOps), and Redemption is checked if
  //     one of them used an item that damages its user. Clicks on
  //     equipment slots are not applied by the engine: the encounter's
  //     hooks get them as inputs.
  //  3. encounter.resolveHazards.
  //  4. The NPCs, each in its turn (runNpcBand, runNpcTurn).
  //  5. The hits queued on the player land; then the player's upkeep
  //     (runPlayerUpkeep).
  //  6. A target that can no longer be attacked is dropped. A ground item
  //     the player had ordered picked up is taken if he stands on its
  //     tile. The player steps, unless his input is locked: toward his
  //     target NPC while it is out of range or he stands under it, and
  //     without a target toward targetTile; the encounter may move him
  //     instead (moveDisplacedPlayer). Then he attacks if he can
  //     (performPlayerAutoAttack).
  //  7. A soulreaper stack decays. encounter.processPostTick. Run energy.
  //     The NPCs defeated in this tick are reported to the encounter. A
  //     timed protection prayer expires. Dead NPCs are removed.
  //  8. The events of the tick are flushed into lastTickEvents.
  // Nothing stops the tick when the player dies in it: the next one is
  // refused by canAdvanceTick.
  runTick(targetTile) {
    const player = this.player();
    const previousTick = this.worldState.tick;
    const tick = previousTick + 1;
    const specialAttackEnergyAtTickStart = player.specialAttack.energy;
    this.worldState.tick = tick;
    this.tickEvents.setCurrentTick(tick);
    this.logEvent({
      tick: tick,
      type: LogEventType.TICK_START,
      playerPosition: [...player.position],
    });
    const introMessage = this.openingIntro?.message;
    if (1 === tick && undefined !== introMessage) {
      this.tickEvents.emit({
        type: "game_message",
        kind: "game",
        segments: [
          {
            text: introMessage,
          },
        ],
      });
    }
    this.processPendingEncounterCommands();
    const encounterRules = this.getEncounterRules();
    if (encounterRules?.onTickStart) {
      const tickStartOutcome = encounterRules.onTickStart(this.buildRulesContext());
      const failedCondition = this.applyRuleOutcome(tickStartOutcome);
      if (failedCondition) {
        this.failRun(failedCondition, tick);
        this.lastTickEvents = this.tickEvents.flush();
        return;
      }
    }
    const inputLocked = resolveValueOrCallback(encounterRules?.playerInputLocked, this.buildRulesContext()) === true;
    this.lastTickInputLocked = inputLocked;
    if (inputLocked) {
      player.pendingInputOps = [];
      this.pendingEquipmentSlotClicks = [];
      player.pendingItemPickup = null;
      clearPlayerAttackTarget(player);
    }
    this.processPendingInputOps(tick);
    if (this.selfDamageHitPending) {
      this.selfDamageHitPending = false;
      this.tryTriggerRedemption(tick);
    }
    const mechanics = this.snapshotMechanicsConfig();
    const equipmentSlotClicks = [...this.pendingEquipmentSlotClicks];
    this.pendingEquipmentSlotClicks = [];
    const inputs = {
      equipmentSlotClicks: equipmentSlotClicks,
    };
    const npcMovements = new Map();
    const setProtectionPrayer = (prayer) => this.setProtectionPrayer(prayer);
    const tickContext = this.buildTickContext(tick, player.position, inputs, npcMovements, setProtectionPrayer);
    for (const hazardDamage of this.encounter.resolveHazards(tickContext, mechanics)) {
      this.applyEnvironmentalDamage(hazardDamage, tick);
    }
    this.runNpcBand(tickContext, mechanics, npcMovements);
    this.resolvePendingHitsOnPlayer();
    this.runPlayerUpkeep(tick, previousTick, specialAttackEnergyAtTickStart);
    clearInvalidPlayerAttackTarget(player, this.worldState);
    this.processPendingItemPickup();
    const position = player.position;
    const shouldRun =
      (player.ctrlClickOverride ? !player.isRunEnabled : player.isRunEnabled) &&
      player.runEnergy.energy > 0;
    let playerStep;
    const attackTargetActor = player.attackTarget
      ? this.worldState.actors.get(player.attackTarget)
      : undefined;
    if (inputLocked) {
      playerStep = {
        position: [...player.position],
        stepTiles: [],
      };
    } else if (undefined !== attackTargetActor && canPlayerTargetActor(player, attackTargetActor) && "npc" === attackTargetActor.kind) {
      const targetNpc = attackTargetActor;
      const { attackRange: attackRange, meleeReach: meleeReach } = resolvePlayerCombatParams(player, {
        world: this.worldState,
        encounterRules: this.getEncounterRules(),
      });
      const isUnderTarget = isTileInsideFootprint(player.position, targetNpc.position, targetNpc.size);
      const interactionRange = this.encounter.approachRange?.(targetNpc.id, attackRange);
      const effectiveRange = interactionRange ?? (player.attackInteractionActive ? attackRange : 1);
      const effectiveReach = player.attackInteractionActive || interactionRange !== undefined ? meleeReach : "cardinal";
      playerStep =
        !isUnderTarget && isTileInAttackRange(player.position, targetNpc.position, targetNpc.size, effectiveRange, true, effectiveReach)
          ? {
              position: [...player.position],
              stepTiles: [],
            }
          : computePlayerStepToNpc(player.position, targetNpc.position, targetNpc.size, shouldRun);
    } else {
      playerStep = computePlayerStepToTile(player.position, targetTile, shouldRun);
    }
    const playerMoved = this.encounter.moveDisplacedPlayer?.(player, targetTile, (position, facing) => {
      const origin = player.position;
      this.teleportPlayer(position, facing);
      player.previousPosition = origin;
      player.movementPath = [[...position]];
      player.isMoving = true;
    }, playerStep, hit => this.applyEnvironmentalDamage(hit, tick)) ?? this.applyPlayerStep(player, playerStep);
    this.recordPositionHistory(player.history, tick, player.position);
    if (playerMoved) {
      this.logEvent({
        tick: tick,
        type: LogEventType.PLAYER_MOVE,
        from: [...position],
        to: [...player.position],
      });
      this.tickEvents.emit({
        type: "movement",
        actorId: player.id,
        from: [...position],
        to: [...player.position],
      });
    }
    performPlayerAutoAttack(player, {
      random: this.rollCombat,
      world: this.worldState,
      tickEvents: this.tickEvents,
      combatSystem: this.combatSystem,
      infiniteHealth: this.mechanicsConfig.infiniteHealth,
      encounterRules: this.getEncounterRules(),
      combatSupplies: player.combatSupplies,
      lookupItemStats: (itemId) => this.lookupItemStats(itemId),
      onPlayerAttackStarted: (startedAttack) => {
        this.encounter.onPlayerAttackStarted?.(startedAttack, {
          world: this.worldState,
          tickEvents: this.tickEvents,
          spawnNpc: (npc) => this.spawnNpc(npc),
          despawnNpc: (npcId) => this.despawnNpc(npcId),
        });
      },
      onDamageApplied: (appliedDamage) => {
        this.handleDamageApplied(appliedDamage);
      },
    });
    runThrallTurn(player, {
      world: this.worldState,
      tick: tick,
      random: this.rollCombat,
      combatSystem: this.combatSystem,
      tickEvents: this.tickEvents,
    });
    player.soulreaper = decaySoulreaperStacks(player.soulreaper, tick);
    const postTickContext = this.buildTickContext(tick, player.position, inputs, npcMovements, setProtectionPrayer);
    for (const postTickDamage of this.encounter.processPostTick(postTickContext, mechanics)) {
      this.applyEnvironmentalDamage(postTickDamage, tick);
    }
    const staminaActive = player.activeEffects.some((activeEffect) => activeEffect.type === "stamina");
    player.runEnergy = updateRunEnergy(player.runEnergy, {
      isRunning: player.isRunning,
      agility: player.stats.agility.current,
      weight: this.objTypeLoader
        ? getCarriedWeight(player.equipment, player.inventory, this.objTypeLoader)
        : 0,
      gracefulBonusPercent: getGracefulBonusPercent(player.equipment),
      staminaActive: staminaActive,
      ringOfEnduranceEquipped: player.equipment.ring === ringOfEnduranceItemId,
    });
    if (player.runEnergy.energy <= 0 && player.isRunEnabled) {
      player.isRunEnabled = false;
    }
    this.flushPendingNpcDefeats(postTickContext);
    this.expireTimedProtectionPrayer(tick);
    this.removeDeadNpcs(tick);
    this.lastTickEvents = this.tickEvents.flush();
  }
  applyPlayerStep(player, playerStep) {
    const fromPosition = player.position;
    const toPosition = playerStep.position;
    if (
      isStepDestinationInsideArena(toPosition)
    ) {
      player.previousPosition = fromPosition;
      player.position = toPosition;
      player.movementPath = playerStep.stepTiles.map(([x, y]) => [x, y]);
      const occupancy = this.worldState.occupancy;
      occupancy.syncActors(this.worldState.actors.values());
      let fromTile = fromPosition;
      for (const stepTile of player.movementPath) {
        occupancy.step(player, fromTile, stepTile);
        fromTile = stepTile;
      }
    } else {
      player.position = fromPosition;
      player.previousPosition = fromPosition;
      player.movementPath = [];
    }
    const moved =
      fromPosition[0] !== player.position[0] || fromPosition[1] !== player.position[1];
    player.isMoving = moved;
    player.isRunning = moved && player.movementPath.length > 1;
    if (moved) {
      const finalTile = player.movementPath[player.movementPath.length - 1];
      const previousTile =
        player.movementPath.length > 1
          ? player.movementPath[player.movementPath.length - 2]
          : fromPosition;
      player.facing = this.computeFacingFromDelta(finalTile[0] - previousTile[0], finalTile[1] - previousTile[1], player.facing);
    }
    return moved;
  }
  prepareStartPosition(targetTile) {
    this.assertUnstartedRunPastIntro("prepareStartPosition");
    const player = this.player();
    if (!player.alive) {
      return null;
    }
    const queuedRunToggleCount = player.pendingInputOps.filter(
      (inputOp) => inputOp.type === "run_toggle",
    ).length;
    const runEnabledAfterToggles = queuedRunToggleCount % 2 == 1 ? !player.isRunEnabled : player.isRunEnabled;
    const shouldRun =
      (queuedRunToggleCount > 0 || !player.ctrlClickOverride ? runEnabledAfterToggles : !runEnabledAfterToggles) &&
      player.runEnergy.energy > 0;
    const position = player.position;
    if (this.applyPlayerStep(player, computePlayerStepToTile(position, targetTile, shouldRun))) {
      return {
        from: [...position],
        stepTiles: player.movementPath.map(([x, y]) => [x, y]),
        to: [...player.position],
        isRunning: player.isRunning,
      };
    } else {
      return null;
    }
  }
  finalizeStartPosition() {
    this.assertUnstartedRunPastIntro("finalizeStartPosition");
    const player = this.player();
    const startPosition = [...player.position];
    this.runStartPosition = [...startPosition];
    player.position = startPosition;
    player.previousPosition = startPosition;
    player.movementPath = [];
    player.isMoving = false;
    player.isRunning = false;
    player.facing = this.getStartFacing();
    player.history.clear();
    player.history.set(0, startPosition);
    const occupancy = this.worldState.occupancy;
    occupancy.clear();
    for (const actor of this.worldState.actors.values()) {
      occupancy.add(actor);
    }
    const firstEvent = this.eventLog[0];
    if (firstEvent?.type === LogEventType.TICK_START && firstEvent.tick === 0) {
      this.eventLog[0] = {
        ...firstEvent,
        playerPosition: [...startPosition],
      };
    }
  }
  assertUnstartedRunPastIntro(methodName) {
    if (0 !== this.worldState.tick || this._introActive) {
      throw new Error(methodName + " needs an unstarted run past its intro");
    }
  }
  getStartFacing() {
    return this.openingIntro?.facingAngle ?? 1024;
  }
  // The NPCs take their turns in ascending processingOrder. The next one
  // is looked for anew after every turn (findNextNpcByProcessingOrder).
  runNpcBand(tickContext, mechanics, npcMovements) {
    resolvePendingRetaliations(this.worldState);
    this.encounter.prepareNpcBand?.(tickContext, mechanics);
    const combatContext = this.buildCombatContext();
    const processedNpcs = new Set();
    let lastProcessingOrder = Number.NEGATIVE_INFINITY;
    this.npcTurnsRunning = true;
    try {
      while (true) {
        const nextNpc = this.findNextNpcByProcessingOrder(lastProcessingOrder);
        if (null === nextNpc) {
          break;
        }
        lastProcessingOrder = nextNpc.processingOrder ?? lastProcessingOrder;
        if (!processedNpcs.has(nextNpc)) {
          processedNpcs.add(nextNpc);
          this.runNpcTurn(nextNpc, tickContext, mechanics, npcMovements, combatContext);
        }
      }
    } finally {
      this.npcTurnsRunning = false;
    }
    for (const bandDamage of this.encounter.completeNpcBand?.(tickContext, mechanics) ?? []) {
      this.applyEnvironmentalDamage(bandDamage, tickContext.tick);
    }
  }
  findNextNpcByProcessingOrder(lastProcessingOrder) {
    let nextNpc = null;
    for (const npc of this.worldState.getNpcs()) {
      const processingOrder = npc.processingOrder;
      if (processingOrder === undefined) {
        throw new Error(
          "NPC '" +
            npc.id +
            "' is in the world without a processing order; register it with registerNpc",
        );
      }
      if (!(processingOrder <= lastProcessingOrder)) {
        if (
          null === nextNpc ||
          processingOrder < (nextNpc.processingOrder ?? processingOrder)
        ) {
          nextNpc = npc;
        }
      }
    }
    return nextNpc;
  }
  // One NPC's turn. The encounter may remove the NPC first. Then, before
  // it does anything: the hits queued on it land, a death that is due
  // starts, burn and poison pulse, its hitpoints regenerate. On the tick
  // of its death animation it only releases the attacks its definition
  // kept for that moment. An NPC that cannot act this tick, or that was
  // added to the world this tick outside the NPC turns, stops here.
  // Otherwise it moves (encounter.moveNpc, or else its definition's
  // move), turns to its target, the encounter resolves its local effects,
  // and it acts: encounter.processNpcTick hands back the attacks to launch.
  runNpcTurn(npc, tickContext, mechanics, npcMovements, combatContext) {
    const tick = tickContext.tick;
    this.encounter.removeNpcIfDue?.(npc, tickContext, mechanics);
    if (!isActorInWorld(this.worldState, npc)) {
      return;
    }
    this.clearStaleCrawlMovement(npc, tick);
    this.combatSystem.resolvePendingHitsOnTarget(this.worldState, combatContext, npc);
    if (!isActorInWorld(this.worldState, npc)) {
      return;
    }
    if (isNpcDeathDueAtTick(npc, tick)) {
      this.startPendingNpcDeath(npc);
    }
    if (isNpcDeathAnimationDueAtTick(npc, tick)) {
      this.npcDefinitions.notifyDeathAnimation(npc, this.buildNpcDefinitionContext());
    }
    this.combatSystem.applyBurnPulse(this.worldState, combatContext, npc);
    this.combatSystem.applyPoisonPulse(this.worldState, combatContext, npc);
    applyNpcHitpointRegen(npc, tick);
    if (!isActorInWorld(this.worldState, npc)) {
      return;
    }
    const target =
      null === npc.combat.targetId
        ? undefined
        : this.worldState.actors.get(npc.combat.targetId);
    npc.combat.startedTurnOverlappingTarget = true === target?.alive && areFootprintsOverlapping(npc, target);
    npc.previousPosition = npc.position;
    npc.movementPath = [];
    npc.isMoving = false;
    npc.isRunning = false;
    if (isNpcDeathAnimationTick(npc, tick)) {
      for (const releasedAttack of this.npcDefinitions.releaseOnDeathAnimation(
        npc,
        this.buildNpcDefinitionContext(),
      )) {
        if (!isActorInWorld(this.worldState, npc)) {
          break;
        }
        this.releaseNpcDeathAttack(npc, releasedAttack);
      }
      return;
    }
    if (!canNpcActAtTick(npc, tick)) {
      return;
    }
    if (this.addedOutsideNpcTurns.get(npc) === tick) {
      return;
    }
    this.worldState.occupancy.syncActors(this.worldState.actors.values());
    const movementRequests = this.encounter.moveNpc
      ? this.encounter.moveNpc(npc, tickContext, mechanics)
      : this.npcDefinitions.move(npc, this.buildNpcDefinitionContext());
    for (const movementRequest of movementRequests) {
      if (!isActorInWorld(this.worldState, npc)) {
        return;
      }
      this.applyNpcMovementRequest(npc, movementRequest, npcMovements);
    }
    if (!isActorInWorld(this.worldState, npc)) {
      return;
    }
    this.clearStaleCrawlMovement(npc, tick);
    this.faceNpcTowardTarget(npc);
    this.recordPositionHistory(npc.history, tick, npc.position);
    for (const localEffectDamage of this.encounter.resolveNpcLocalEffects?.(npc, tickContext, mechanics) ??
      []) {
      this.applyEnvironmentalDamage(localEffectDamage, tick);
    }
    if (!isActorInWorld(this.worldState, npc) || !canNpcActAtTick(npc, tick)) {
      return;
    }
    const npcTurn = this.encounter.processNpcTick?.(npc, tickContext, mechanics);
    if (npcTurn) {
      for (const npcAttack of npcTurn.npcAttacks ?? []) {
        if (!isActorInWorld(this.worldState, npc)) {
          break;
        }
        this.launchNpcAttack(npc, npcAttack, tick);
      }
      for (const environmentalDamage of npcTurn.environmentalDamages) {
        this.applyEnvironmentalDamage(environmentalDamage, tick);
      }
    }
  }
  clearStaleCrawlMovement(npc, tick) {
    const crawlMovement = npc.crawlMovement;
    if (
      crawlMovement &&
      (tick >= crawlMovement.startTick + 2 ||
        tick < crawlMovement.startTick ||
        npc.position[0] !== crawlMovement.to[0] ||
        npc.position[1] !== crawlMovement.to[1])
    ) {
      delete npc.crawlMovement;
    }
  }
  applyNpcMovementRequest(npc, movementRequest, npcMovements) {
    if (movementRequest.npcId !== npc.id) {
      throw new Error(
        "NPC '" +
          npc.id +
          "' returned a movement request for '" +
          movementRequest.npcId +
          "' from its own turn",
      );
    }
    const tick = this.worldState.tick;
    const startTile = [...npc.position];
    let path = isNpcHeldInPlace(npc, this.player(), tick) ? [] : movementRequest.path;
    if ("crawl" === movementRequest.movementSpeed && path.length > 0) {
      const firstTile = path[0];
      const dx = firstTile[0] - startTile[0];
      const dy = firstTile[1] - startTile[1];
      if (
        path.length !== 1 ||
        !Number.isInteger(dx) ||
        !Number.isInteger(dy) ||
        !(1 === Math.max(Math.abs(dx), Math.abs(dy)))
      ) {
        path = [];
      }
    }
    const finalTile = path.length > 0 ? path[path.length - 1] : startTile;
    const moved = finalTile[0] !== startTile[0] || finalTile[1] !== startTile[1];
    if (moved) {
      if ("crawl" === movementRequest.movementSpeed) {
        npc.crawlMovement = {
          from: [...startTile],
          to: [...finalTile],
          startTick: tick,
        };
      } else {
        delete npc.crawlMovement;
      }
      let fromTile = startTile;
      for (const stepTile of path) {
        this.worldState.occupancy.step(npc, fromTile, stepTile);
        fromTile = stepTile;
      }
      npc.position = [finalTile[0], finalTile[1]];
      npc.movementPath = path.map(([x, y]) => [x, y]);
      npc.isMoving = true;
      recordNpcStepTick(npc, tick);
      npc.isRunning = path.length > 1;
      const previousTile = path.length > 1 ? path[path.length - 2] : startTile;
      npc.facing =
        npc.lockedFacing ?? this.computeFacingFromDelta(finalTile[0] - previousTile[0], finalTile[1] - previousTile[1], npc.facing);
      this.tickEvents.emit({
        type: "movement",
        actorId: npc.id,
        from: [...startTile],
        to: [...npc.position],
      });
    }
    npcMovements.set(npc.id, {
      npcId: npc.id,
      from: startTile,
      to: [...npc.position],
      path: npc.movementPath ?? [],
      moved: moved,
    });
  }
  queueNpcHit(attack) {
    const attacker = this.worldState.getNpc(attack.attackerId);
    if (!attacker) {
      throw new Error(
        "queueNpcHit: attacker '" + attack.attackerId + "' is not registered",
      );
    }
    const target = this.worldState.actors.get(attack.targetId);
    if (target) {
      this.combatSystem.queueNpcHit(
        this.worldState,
        {
          attacker: attacker,
          target: target,
          attack: attack,
        },
        this.buildCombatContext(),
      );
    }
  }
  launchNpcAttack(npc, attack, tick) {
    if (attack.attackerId !== npc.id) {
      throw new Error(
        "NPC '" +
          npc.id +
          "' returned an attack for '" +
          attack.attackerId +
          "' from its own turn",
      );
    }
    const target = this.worldState.actors.get(attack.targetId);
    if (!target) {
      return;
    }
    const attackRequest = {
      attacker: npc,
      target: target,
      attack: attack,
    };
    const combatContext = this.buildCombatContext({
      enablePendingHits: true,
    });
    if (
      (attack.isContinuation
        ? this.combatSystem.tryLaunchContinuationAttack(this.worldState, attackRequest, combatContext)
        : this.combatSystem.tryLaunchAttack(this.worldState, attackRequest, combatContext)) &&
      !attack.isContinuation
    ) {
      npc.combat.lastAttackTick = tick;
    }
  }
  releaseNpcDeathAttack(npc, attack) {
    if (attack.attackerId !== npc.id) {
      throw new Error(
        "NPC '" +
          npc.id +
          "' released an attack for '" +
          attack.attackerId +
          "' as it died",
      );
    }
    const target = this.worldState.actors.get(attack.targetId);
    if (target) {
      this.combatSystem.tryLaunchDeathAnimationAttack(
        this.worldState,
        {
          attacker: npc,
          target: target,
          attack: attack,
        },
        this.buildCombatContext({
          enablePendingHits: true,
        }),
      );
    }
  }
  startPendingNpcDeath(npc) {
    markNpcDeathStarted(npc);
    this.npcDefinitions.notifyDeathStarted(npc, this.buildNpcDefinitionContext());
  }
  resolvePendingHitsOnPlayer() {
    this.combatSystem.resolvePendingHits(this.worldState, this.buildCombatContext(), "player");
  }
  // What happens to the player every tick whatever he does, in this
  // order: timed effects, poison, prayer drain, the special attack's
  // energy, the combat timers, the locks on stat decay, stat decay and
  // recovery, hitpoint regeneration.
  runPlayerUpkeep(tick, previousTick, specialAttackEnergyAtTickStart) {
    const player = this.player();
    this.tickActiveEffects(tick);
    this.tickPoison(tick);
    const prayerDrainRule = this.getEncounterRules()?.prayerDrain;
    const prayerDrainModifiers = prayerDrainRule
      ? {
          drainMultiplier: prayerDrainRule.multiplier,
          modifyDrainResistance: prayerDrainRule.modifyDrainResistance
            ? (drainParams) => prayerDrainRule.modifyDrainResistance(drainParams, this.buildRulesContext())
            : undefined,
        }
      : undefined;
    const prayerDrainOutcome = drainPrayerPoints(player.prayerState, player.equipmentStats.prayer, tick, prayerDrainModifiers);
    player.prayerState = prayerDrainOutcome.state;
    if (prayerDrainOutcome.drained) {
      this.depletePrayer(tick);
    }
    player.specialAttack = applyLightbearerEquipped(player.specialAttack, player.equipment.ring === lightbearerItemId);
    player.specialAttack = this.mechanicsConfig.infiniteSpecialAttack
      ? {
          ...player.specialAttack,
          energy: MAX_SPECIAL_ATTACK_ENERGY,
        }
      : regenerateSpecialAttackEnergy(player.specialAttack, specialAttackEnergyAtTickStart);
    const markOfDarknessActiveTicks =
      player.combatTimers.markOfDarknessActiveTicks;
    const deathChargeWasActive =
      player.combatTimers.deathChargeActiveTicks > 0 &&
      player.combatTimers.deathChargeProcsRemaining > 0;
    const combatTimers = player.combatTimers;
    player.combatTimers = {
      ...combatTimers,
      saturatedHeartCooldownTicks: decrementTickCounter(combatTimers.saturatedHeartCooldownTicks),
      surgePotionCooldownTicks: decrementTickCounter(combatTimers.surgePotionCooldownTicks),
      markOfDarknessCooldownTicks: decrementTickCounter(combatTimers.markOfDarknessCooldownTicks),
      markOfDarknessActiveTicks: decrementTickCounter(combatTimers.markOfDarknessActiveTicks),
      deathChargeCooldownTicks: decrementTickCounter(combatTimers.deathChargeCooldownTicks),
      ...tickDeathChargeTimers(combatTimers),
    };
    const decayLockOutcome = tickStatDecayLocks(player.stats, player.combatTimers);
    player.stats = decayLockOutcome.stats;
    player.combatTimers = decayLockOutcome.timers;
    if (decayLockOutcome.expired.includes("saturated_heart")) {
      this.tickEvents.emit({
        type: "status_effect_expired",
        effect: "saturated_heart",
      });
    }
    if (
      markOfDarknessActiveTicks > 0 &&
      0 === player.combatTimers.markOfDarknessActiveTicks
    ) {
      this.tickEvents.emit({
        type: "status_effect_expired",
        effect: "mark_of_darkness",
      });
    }
    if (deathChargeWasActive && player.combatTimers.deathChargeActiveTicks === 0) {
      this.tickEvents.emit({
        type: "status_effect_expired",
        effect: "death_charge",
      });
    }
    // Stat decay and recovery are counted against the tick before this one
    // (previousTick); Preserve and Rapid Restore against this tick.
    const statRestoreOutcome = applyStatDecayAndRecovery(
      player.stats,
      player.combatTimers,
      previousTick,
      isPreserveActive(player.prayerState, tick),
      isRapidRestoreDue(player.prayerState, tick),
    );
    player.stats = statRestoreOutcome.stats;
    player.combatTimers = statRestoreOutcome.timers;
    if (player.alive && player.vitals.hp > 0) {
      const currentHp = player.vitals.hp;
      const maxHp = player.vitals.maxHp;
      const hpRegenTick = player.combatTimers.hpRegenTick;
      const currentTick = tick;
      const rapidHealActive = player.independentPrayers.includes(Prayer.RapidHeal);
      const hpRegen =
        currentTick < hpRegenTick
          ? {
              hp: currentHp,
              regenTick: hpRegenTick,
            }
          : {
              hp: currentHp < maxHp ? currentHp + 1 : currentHp > maxHp ? currentHp - 1 : currentHp,
              regenTick: currentTick + getHpRegenIntervalTicks(rapidHealActive),
            };
      player.vitals.hp = hpRegen.hp;
      player.combatTimers = {
        ...player.combatTimers,
        hpRegenTick: hpRegen.regenTick,
      };
    }
    this.syncVitalsToStats();
  }
  pausePlayerAutoAttack(targetId, resumeTick) {
    const player = this.player();
    const autoAttackPause = player.autoAttackPause;
    player.autoAttackPause = {
      targetId: targetId,
      resumeTick:
        autoAttackPause?.targetId === targetId
          ? Math.max(autoAttackPause.resumeTick, resumeTick)
          : resumeTick,
    };
  }
  handleDamageApplied(hit) {
    const player = this.player();
    const sourceLabel =
      hit.sourceId === PLAYER_ACTOR_ID
        ? "PlayerAttack"
        : this.encounter.getNpcDamageSourceLabel(hit.sourceId);
    const targetNpc = this.worldState.getNpcs().find((npc) => npc.id === hit.targetId);
    const expectedHit = hit.sourceId === PLAYER_ACTOR_ID ? hit.expectedHit : undefined;
    if (hit.sourceId === PLAYER_ACTOR_ID && targetNpc) {
      this.encounter.onPlayerAttackResolved?.(
        {
          tick: hit.tick,
          sourceId: hit.sourceId,
          targetId: hit.targetId,
          attackType: hit.attackType,
          baseDamage: hit.baseDamage,
          effectiveDamage: hit.effectiveDamage,
          hpBefore: hit.hpBefore,
          hpAfter: hit.hpAfter,
        },
        {
          world: this.worldState,
          tickEvents: this.tickEvents,
          spawnNpc: (npc) => this.spawnNpc(npc),
          despawnNpc: (actorId) => this.despawnNpc(actorId),
          pausePlayerAutoAttack: (targetId, resumeTick) => {
            this.pausePlayerAutoAttack(targetId, resumeTick);
          },
        },
      );
    }
    if (targetNpc) {
      this.npcDefinitions.notifyDamageResolved(targetNpc, hit, this.buildNpcDefinitionContext());
    }
    this.damageHistory.push({
      tick: hit.tick,
      source: sourceLabel,
      sourceNpcTypeId: hit.sourceNpcTypeId,
      targetId: hit.targetId,
      baseDamage: hit.baseDamage,
      attackType: hit.attackType,
      activePrayer: hit.activePrayer,
      prayedCorrectly: hit.prayedCorrectly,
      effectiveDamage: hit.effectiveDamage,
      hpBefore: hit.hpBefore,
      hpAfter: hit.hpAfter,
      expectedHit: expectedHit,
    });
    this.logEvent({
      tick: hit.tick,
      type: LogEventType.DAMAGE_TAKEN,
      source: sourceLabel,
      attackType: hit.attackType,
      baseDamage: hit.baseDamage,
      effectiveDamage: hit.effectiveDamage,
      prayedCorrectly: hit.prayedCorrectly,
      hpAfter: hit.hpAfter,
    });
    if (!this.mechanicsConfig.infiniteHealth && player.vitals.hp <= 0) {
      player.alive = false;
      this.failedCondition = "Death";
      this.logEvent({
        tick: hit.tick,
        type: LogEventType.DEATH,
        cause: sourceLabel,
      });
    }
    const isLethal = hit.hpBefore > 0 && hit.hpAfter === 0;
    if (hit.onKillEffect && isLethal && hit.sourceId === PLAYER_ACTOR_ID) {
      this.applyOnKillEffect(player, hit.onKillEffect, hit.tick);
      if (targetNpc) {
        this.emitOnKillTargetGraphic(targetNpc, hit.onKillEffect);
      }
    }
    if (targetNpc && isLethal && hit.sourceId === PLAYER_ACTOR_ID) {
      const deathChargeProc = consumeDeathChargeProc(player.specialAttack, player.combatTimers);
      if (deathChargeProc) {
        player.specialAttack = deathChargeProc.special;
        player.combatTimers = deathChargeProc.timers;
        this.tickEvents.emit({
          type: "death_charge_proc",
        });
      }
    }
    if (targetNpc && isLethal) {
      if (targetNpc.death?.killTick !== hit.tick) {
        throw new Error(
          "NPC '" +
            targetNpc.id +
            "' reached 0 HP without its lethal transition being recorded",
        );
      }
      targetNpc.despawnTick ??= hit.tick;
      if (isNpcDeathDueAtTick(targetNpc, hit.tick)) {
        this.startPendingNpcDeath(targetNpc);
      }
      this.pendingNpcDefeats.push({
        actor: targetNpc,
        defeat: {
          npcId: targetNpc.id,
          tick: hit.tick,
        },
      });
    }
    if (hit.targetId === PLAYER_ACTOR_ID) {
      this.tryTriggerRedemption(hit.tick);
      if ("number" == typeof hit.applyPoison) {
        this.applyPoisonToPlayer(hit.applyPoison);
      }
      if (hit.effectiveDamage > 0 && hit.sourceId && hit.sourceId !== PLAYER_ACTOR_ID) {
        const ringId = player.equipment?.ring;
        if (
          ringId === 2550 ||
          ringId === 20655 ||
          ringId === 20657 ||
          ringId === 25248 ||
          ringId === 26762
        ) {
          const attackerNpc = this.worldState.getNpc(hit.sourceId);
          if (attackerNpc && attackerNpc.alive && attackerNpc.vitals.hp > 0) {
            // WIKI: Ring of recoil / Ring of suffering (r/ri) reflects floor(damage * 0.1) + 1.
            const recoilDamage = Math.floor(hit.effectiveDamage * 0.1) + 1;
            const recoilHit = this.combatSystem.applyDamage(
              player,
              attackerNpc,
              recoilDamage,
              "typeless",
              hit.tick,
              { infiniteHealth: this.mechanicsConfig.infiniteHealth },
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              "hit-queue",
            );
            this.tickEvents.emit({
              type: "hitsplat_spawned",
              targetId: attackerNpc.id,
              amount: recoilHit.effectiveDamage,
              hitsplatType: "damage",
            });
            this.handleDamageApplied(recoilHit);
          }
        }
      }
      this.notifyPlayerDamageTaken({
        sourceKind: "combat",
        source: sourceLabel,
        tick: hit.tick,
        attackType: hit.attackType,
        baseDamage: hit.baseDamage,
        effectiveDamage: hit.effectiveDamage,
        prayedCorrectly: hit.prayedCorrectly,
        hpBefore: hit.hpBefore,
        hpAfter: hit.hpAfter,
        ...(undefined === hit.sourceNpcTypeId
          ? {}
          : {
              sourceNpcTypeId: hit.sourceNpcTypeId,
            }),
      });
    }
    this.syncVitalsToStats();
  }
  flushPendingNpcDefeats(tickContext) {
    const pendingNpcDefeats = this.pendingNpcDefeats;
    this.pendingNpcDefeats = [];
    if (this.player().alive && this.failedCondition === null) {
      for (const { actor: actor, defeat: defeat } of pendingNpcDefeats) {
        this.encounter.onNpcDefeated?.(defeat, tickContext, this.completionOwnership);
        this.npcDefinitions.notifyDefeated(
          actor,
          defeat,
          this.completionOwnership,
          this.buildNpcDefinitionContext(),
        );
      }
    }
  }
  emitOnKillTargetGraphic(targetNpc, onKillEffect) {
    const targetGraphicBySize = onKillEffect.targetGraphicBySize;
    if (!targetGraphicBySize || targetGraphicBySize.length === 0) {
      return;
    }
    const spotAnimId =
      targetGraphicBySize[
        Math.min(Math.max(1, targetNpc.size), targetGraphicBySize.length) - 1
      ];
    this.tickEvents.emit({
      type: "npc_graphic_applied",
      targetId: targetNpc.id,
      spotAnimId: spotAnimId,
      height: 0,
    });
  }
  applyOnKillEffect(player, onKillEffect, tick) {
    if (onKillEffect.sunKerisHeal && player.prayerState.points >= 5) {
      player.prayerState.points -= 5;
      player.stats.prayer.current = player.prayerState.points;
      if (!player.prayerState.points) this.depletePrayer(tick);
      player.vitals.hp = Math.max(player.vitals.hp, Math.min(player.vitals.hp + 12, player.stats.hitpoints.max + 12));
      player.stats.hitpoints.current = player.vitals.hp;
    }
    if (onKillEffect.refundSpecEnergy) {
      const maxSpecialEnergy = 100;
      player.specialAttack = {
        ...player.specialAttack,
        energy: Math.min(maxSpecialEnergy, player.specialAttack.energy + onKillEffect.refundSpecEnergy),
      };
    }
    if (onKillEffect.reduceAttackDelayTicks) {
      this.combatSystem.reduceAttackDelay(player.id, onKillEffect.reduceAttackDelayTicks, tick);
    }
  }
  // A facing is an angle in 2048ths of a turn: 0 faces south, 512 west, 1024
  // north, 1536 east (x grows to the east, y to the north).
  computeFacingFromDelta(dx, dy, fallbackFacing) {
    if (0 === dx && 0 === dy) {
      return fallbackFacing;
    } else if (dx !== 0) {
      if (dx > 0) {
        if (dy > 0) {
          return 1280;
        } else if (dy < 0) {
          return 1792;
        } else {
          return 1536;
        }
      } else if (dy > 0) {
        return 768;
      } else if (dy < 0) {
        return 256;
      } else {
        return 512;
      }
    } else if (dy > 0) {
      return 1024;
    } else if (dy < 0) {
      return 0;
    } else {
      return fallbackFacing;
    }
  }
  faceNpcTowardTarget(npc) {
    if (npc.isMoving === true) {
      return;
    }
    if (npc.lockedFacing !== undefined) {
      return;
    }
    const targetId = npc.combat.targetId;
    if (targetId === null) {
      return;
    }
    const target = this.worldState.actors.get(targetId);
    if (target?.alive) {
      npc.facing = this.computeFacingToward(npc, target);
    }
  }
  computeFacingToward(npc, target) {
    const targetCenterX = target.position[0] + (target.size - 1) / 2;
    const targetCenterY = target.position[1] + (target.size - 1) / 2;
    const npcMaxX = npc.position[0] + npc.size - 1;
    const npcMaxY = npc.position[1] + npc.size - 1;
    const nearestX = Math.max(npc.position[0], Math.min(targetCenterX, npcMaxX));
    const nearestY = Math.max(npc.position[1], Math.min(targetCenterY, npcMaxY));
    return this.computeFacingFromDelta(targetCenterX - nearestX, targetCenterY - nearestY, npc.facing);
  }
  snapshotMechanicsConfig() {
    return {
      ...this.mechanicsConfig,
    };
  }
  setCtrlClickOverride(ctrlClickOverride) {
    this.player().ctrlClickOverride = ctrlClickOverride;
  }
  canCastArceuusSpell(spellName) {
    const player = this.player();
    return (
      "arceuus" === player.combatSupplies.spellbook &&
      canCastSpell(spellName, {
        equipment: player.equipment,
        inventory: player.inventory,
        runePouch: player.combatSupplies.runePouch ?? null,
        magicLevel: player.stats.magic.current,
      })
    );
  }
  castMarkOfDarkness() {
    const player = this.player();
    if (!this.canCastArceuusSpell("Mark of Darkness")) {
      return;
    }
    const hasPurgingStaff = player.equipment.weapon === purgingStaffItemId;
    const activatedTimers = activateMarkOfDarkness(player.stats.magic.max, hasPurgingStaff, player.combatTimers);
    if (activatedTimers) {
      player.combatTimers = activatedTimers;
      this.tickEvents.emit({
        type: "spell_self_cast",
        animationId: 8970,
        spotAnimId: 1852,
      });
    }
  }
  castDeathCharge() {
    const player = this.player();
    if (!this.canCastArceuusSpell("Death Charge")) {
      return;
    }
    const doubleDeathCharge = this.mechanicsConfig.doubleDeathCharge === true;
    const activatedTimers = activateDeathChargeTimers(player.combatTimers, doubleDeathCharge);
    if (activatedTimers) {
      player.combatTimers = activatedTimers;
      this.tickEvents.emit({
        type: "spell_self_cast",
        animationId: 8970,
        spotAnimId: doubleDeathCharge ? DEATH_CHARGE_UPGRADE_SPOT_ANIM_ID : DEATH_CHARGE_SPOT_ANIM_ID,
      });
    }
  }
  // A resurrection of the Arceuus spellbook (thralls.js). Like Mark of
  // Darkness it acts at once, between ticks.
  castThrall(spellName) {
    const player = this.player();
    if (!isThrallSpell(spellName) || !this.canCastArceuusSpell(spellName)) {
      return;
    }
    const refusal = getThrallCastRefusal(player, this.worldState.tick);
    if (refusal !== null) {
      if (refusal) this.tickEvents.emit({ type: "game_message", kind: "game", segments: [{ text: refusal }] });
      return;
    }
    for (const event of resurrectThrall(player, spellName, this.worldState.tick)) this.tickEvents.emit(event);
    this.syncVitalsToStats();
    if (player.prayerState.points === 0) {
      this.depletePrayer(this.worldState.tick);
    }
  }
  emitTeleportCastEvent() {
    this.tickEvents.emit({
      type: "spell_self_cast",
      animationId: 714,
      spotAnimId: 111,
    });
    this.lastTickEvents = this.tickEvents.flush();
  }
  injectAction(action) {
    this.replayTakeoverWork?.recordAction();
    switch (action.type) {
      case "protectionPrayer":
        this.queueProtectionPrayer(action.prayer);
        break;
      case "offensivePrayer":
        this.queueOffensivePrayer(action.prayer);
        break;
      case "independentPrayer":
        this.queueIndependentPrayer(action.prayer);
        break;
      case "equipFromInventory":
        this.queueEquipFromInventory(action.inventoryIndex, action.itemId, action.slot);
        break;
      case "equipAmmoFromInventory":
        this.queueEquipAmmoFromInventory(action.inventoryIndex, action.itemId);
        break;
      case "unequipAmmo":
        this.queueUnequipAmmo();
        break;
      case "itemAction":
        this.queueUseItem(action.inventoryIndex, action.option);
        break;
      case "unequip":
        this.queueUnequip(action.slot);
        break;
      case "specialAttackToggle":
        this.queueSpecialAttackToggle();
        break;
      case "runToggle":
        this.queueRunToggle();
        break;
      case "quickPrayerToggle":
        this.queueQuickPrayerToggle(action.selections);
        break;
      case "castMarkOfDarkness":
        this.castMarkOfDarkness();
        break;
      case "castDeathCharge":
        this.castDeathCharge();
        break;
      case "castThrall":
        this.castThrall(action.spell);
        break;
      case "ctrlClick":
        this.setCtrlClickOverride(action.ctrlKey);
        break;
      case "swapInventory":
        this.swapInventorySlots(action.from, action.to);
        break;
      case "attackTarget":
        this.queueAttackTarget(action.targetId);
        break;
      case "manualCast":
        this.queueAttackTarget(action.targetId, action.spellName);
        break;
      case "equipmentSlotClick":
        this.queueEquipmentSlotClick(action.slot);
        break;
      case "attackStyleChange":
        this.setAttackStyleIndex(action.index);
        break;
      case "selectedSpellChange":
        this.setSelectedSpell(action.spellName);
        break;
      case "setBossHp":
        this.setBossHp(action.hp);
        break;
      case "applyBossHpPreset":
        this.applyBossHpPreset(action.hp);
        break;
      case "dropItem":
        this.queueDropItem(action.inventoryIndex);
        break;
      case "pickupGroundItem":
        this.queuePickupGroundItem(action.groundItemId);
        break;
      case "encounterCommand":
        this.queueEncounterCommand(action.command);
    }
  }
  setObjTypeLoader(objTypeLoader) {
    this.objTypeLoader = objTypeLoader;
    this.recalculateEquipmentStats();
  }
  setEquipment(equipment) {
    const player = this.player();
    const weapon = player.equipment.weapon;
    player.equipment = equipment;
    this.recalculateEquipmentStats();
    if (equipment.weapon !== weapon) {
      player.isSpecialAttackActive = false;
      this.syncSelectedAttackStyle();
    }
  }
  queueInputOp(inputOp) {
    this.player().pendingInputOps.push(inputOp);
  }
  queueUnequip(slot) {
    this.queueInputOp({
      type: "unequip",
      slot: slot,
    });
  }
  queueEquipFromInventory(inventoryIndex, itemId, slot) {
    this.queueInputOp({
      type: "equip",
      inventoryIndex: inventoryIndex,
      itemId: itemId,
      slot: slot,
    });
  }
  queueEquipAmmoFromInventory(inventoryIndex, itemId) {
    this.queueInputOp({
      type: "equip_ammo",
      inventoryIndex: inventoryIndex,
      itemId: itemId,
    });
  }
  queueUnequipAmmo() {
    this.queueInputOp({
      type: "unequip_ammo",
    });
  }
  queueUseItem(inventoryIndex, option = "default") {
    this.queueInputOp({
      type: "use_item",
      inventoryIndex: inventoryIndex,
      option: option,
    });
  }
  queueDropItem(inventoryIndex) {
    this.queueInputOp({
      type: "drop_item",
      inventoryIndex: inventoryIndex,
    });
  }
  queuePickupGroundItem(groundItemId) {
    this.queueInputOp({
      type: "pickup_ground_item",
      groundItemId: groundItemId,
    });
  }
  queueSpecialAttackToggle() {
    this.queueInputOp({
      type: "special_attack_toggle",
    });
  }
  countPendingSpecialAttackToggles() {
    return this.player().pendingInputOps.filter(
      (inputOp) => inputOp.type === "special_attack_toggle",
    ).length;
  }
  projectSpecialAttackActive(extraInputOps = []) {
    const player = this.player();
    let specialAttackActive = player.isSpecialAttackActive;
    let loadout = {
      inventory: player.inventory,
      equipment: player.equipment,
      combatSupplies: player.combatSupplies,
    };
    let playerState = this.buildConsumableState(this.worldState.tick + 1);
    let untrackedItemUsed = false;
    for (const inputOps of [player.pendingInputOps, extraInputOps]) {
      for (const inputOp of inputOps) {
        switch (inputOp.type) {
          case "equip":
          case "unequip":
          case "equip_ammo":
          case "unequip_ammo": {
            const updatedLoadout = this.computeEquipmentOpResult(loadout, inputOp);
            if (updatedLoadout) {
              if (updatedLoadout.equipment.weapon !== loadout.equipment.weapon) {
                specialAttackActive = false;
              }
              loadout = updatedLoadout;
            }
            break;
          }
          case "special_attack_toggle": {
            const projectedPlayer = {
              ...player,
              ...loadout,
              specialAttack: playerState.specialAttack,
            };
            const instantSpecial = previewInstantSpecial(
              loadout.equipment.weapon,
              playerState.specialAttack,
              resolveValueOrCallback(
                this.encounter.getEngineRules?.()?.specialAttacks
                  ?.energyCostMultiplier,
                {
                  tick: playerState.currentTick,
                  player: projectedPlayer,
                  world: this.worldState,
                },
              ) ?? 1,
              this.encounter,
              playerState.prayerState,
            );
            if (instantSpecial !== null) {
              specialAttackActive = false;
              playerState = {
                ...playerState,
                specialAttack: instantSpecial.specialAttack,
                prayerState: instantSpecial.prayerState,
              };
              break;
            }
            if (undefined !== loadout.equipment.weapon && hasSpecialAttack(loadout.equipment.weapon)) {
              specialAttackActive = !specialAttackActive;
            }
            break;
          }
          case "drop_item":
            loadout = {
              ...loadout,
              inventory: clearInventorySlot(loadout.inventory, inputOp.inventoryIndex),
            };
            break;
          case "use_item": {
            const itemRef = loadout.inventory[inputOp.inventoryIndex];
            if (!itemRef) {
              break;
            }
            const consumable = getConsumableDefinition(itemRef.id, inputOp.option);
            if (!consumable) {
              break;
            }
            const { track: track, delayTicks: delayTicks } = consumable;
            if (undefined === track && untrackedItemUsed) {
              break;
            }
            if (undefined !== consumable.minHpToUse && playerState.playerHP < consumable.minHpToUse) {
              break;
            }
            if (
              track !== undefined &&
              delayTicks > 0 &&
              !isCooldownTrackReady(playerState.cooldownTracks, track, playerState.currentTick)
            ) {
              break;
            }
            if (isSurgeEffectBlocked(consumable.effects, playerState)) {
              break;
            }
            playerState = this.applyItemEffectsWithRestrictions(consumable, playerState, loadout).newState;
            loadout = {
              ...loadout,
              inventory: this.consumeInventoryItem(loadout.inventory, inputOp.inventoryIndex, consumable),
            };
            if (track !== undefined && delayTicks > 0) {
              playerState = {
                ...playerState,
                cooldownTracks: withCooldownTrackDelay(
                  playerState.cooldownTracks,
                  track,
                  playerState.currentTick,
                  delayTicks,
                ),
              };
            }
            untrackedItemUsed ||= track === undefined;
            break;
          }
        }
      }
    }
    return specialAttackActive;
  }
  getMonsterStatOverride(npcTypeId) {
    if (npcTypeId !== undefined) {
      return this.getEncounterRules()?.monsterStatOverrides?.[npcTypeId];
    }
  }
  getAdjustedTheoreticalDps() {
    const player = this.player();
    const targetId = player.attackTarget ?? player.lastAttackTarget;
    const target = targetId
      ? (this.worldState.getNpcs().find((npc) => npc.id === targetId) ??
        this.worldState.getNpcs().find((npc) => npc.role === "boss"))
      : this.worldState.getNpcs().find((npc) => npc.role === "boss");
    if (!target || target.vitals.hp <= 0) {
      return null;
    }
    const combatParams = this.getPlayerCombatParams(player);
    const formulaStyle = getWeaponFormulaStyle(player.equipment.weapon, player.selectedAttackStyleIndex);
    const spell = getActiveSpell({
      weaponId: player.equipment.weapon,
      selectedStyleIndex: player.selectedAttackStyleIndex,
      selectedSpell: player.combatSupplies.selectedSpell,
      spellbook: player.combatSupplies.spellbook,
    });
    const attackResources = resolveAttackResources({
      weaponId: player.equipment.weapon,
      equipment: player.equipment,
      inventory: player.inventory,
      formulaStyle: formulaStyle,
      supplies: player.combatSupplies,
      magicLevel: player.stats.magic.current,
      activeSpell: spell?.name ?? null,
    });
    const encounterContext = this.buildRulesContext();
    const encounterRules = this.getEncounterRules();
    const outgoingDamageMultiplier = resolveValueOrCallback(encounterRules?.outgoingDamageMultiplier, encounterContext) ?? 1;
    const standardAccuracyMode = isConflictionGauntletsAttack({
      equipment: player.equipment,
      formulaStyle: formulaStyle,
      attackResources: attackResources,
    })
      ? "steady_state"
      : "single_roll";
    return computeTheoreticalDps({
      player: player,
      target: target,
      formulaStyle: formulaStyle,
      resources: attackResources,
      attackSpeedTicks: combatParams.attackSpeed,
      delivery: {
        style: formulaStyleToAttackStyle(formulaStyle),
        attackKind: formulaStyleToAttackKind(formulaStyle),
        impactDelayTicks: 0,
      },
      application: {
        outgoingDamageMultiplier: outgoingDamageMultiplier,
        specialAttackDamageMultiplier: 1,
      },
      manualCast: false,
      isSpecialAttack: false,
      standardAccuracyMode: standardAccuracyMode,
      ...(undefined === encounterRules
        ? {}
        : {
            encounterRules: encounterRules,
          }),
      encounterContext: encounterContext,
      lookupItemStats: (itemId) => this.lookupItemStats(itemId),
      targetDistance: getDistanceToFootprint(
        player.position[0],
        player.position[1],
        target.position[0],
        target.position[1],
        target.size,
      ),
    });
  }
  setAttackTarget(targetId) {
    setPlayerAttackTarget(this.player(), this.worldState, {
      targetId: targetId,
      manualCastSpell: null,
    });
  }
  queueAttackTarget(targetId, manualCastSpell = null) {
    this.queueInputOp({
      type: "attack_target",
      targetId: targetId,
      manualCastSpell: manualCastSpell,
    });
  }
  acceptsInput(input) {
    return this.encounter.acceptsInput?.(input) ?? false;
  }
  queueEquipmentSlotClick(slot) {
    this.pendingEquipmentSlotClicks.push(slot);
  }
  setProtectionPrayer(protectionPrayer) {
    if (null === protectionPrayer) {
      this.deactivateProtectionPrayer(this.worldState.tick);
      return;
    }
    const player = this.player();
    if (player.activePrayer === protectionPrayer) {
      return;
    }
    const activePrayer = player.activePrayer;
    player.activePrayer = protectionPrayer;
    this.clearQuickPrayersActiveIfNoPrayers();
    this.syncActivePrayerList();
    this.tickEvents.emit({
      type: "prayer_changed",
      actorId: player.id,
      from: activePrayer,
      to: protectionPrayer,
    });
  }
  getAttackTarget() {
    return this.player().attackTarget;
  }
  setAttackStyleIndex(styleIndex) {
    const player = this.player();
    player.selectedAttackStyleIndex = styleIndex;
    const weaponCategory = getWeaponCategoryOrUnarmed(player.equipment.weapon);
    this._attackStylePerCategory[weaponCategory] = styleIndex;
  }
  setAttackStylePerCategory(attackStylePerCategory) {
    this._attackStylePerCategory = {
      ...attackStylePerCategory,
    };
    this.syncSelectedAttackStyle();
  }
  getAttackStylePerCategory() {
    return this._attackStylePerCategory;
  }
  syncSelectedAttackStyle() {
    const player = this.player();
    const weaponCategory = getWeaponCategoryOrUnarmed(player.equipment.weapon);
    const savedStyleIndex = this._attackStylePerCategory[weaponCategory];
    player.selectedAttackStyleIndex =
      undefined !== savedStyleIndex && getWeaponCategoryDefinition(player.equipment.weapon).styles[savedStyleIndex] !== undefined
        ? savedStyleIndex
        : getDefaultAttackStyleIndex(player.equipment.weapon, player.combatSupplies.spellbook);
  }
  isTwoHanded(itemId) {
    if (!this.objTypeLoader) {
      return false;
    }
    try {
      return this.objTypeLoader.load(itemId).wearPos2 === 5;
    } catch {
      return false;
    }
  }
  countFreeSlotsAfterRemoving(inventory, vacatedIndex) {
    let freeSlots = 0;
    for (let index = 0; index < inventory.length; index++) {
      if (!(null !== inventory[index]) || index === vacatedIndex) {
        freeSlots += 1;
      }
    }
    return freeSlots;
  }
  processPendingInputOps(tick) {
    const player = this.player();
    this.enforcePrayerRestrictions(tick);
    const pendingInputOps = player.pendingInputOps;
    if (0 === pendingInputOps.length) {
      return;
    }
    player.pendingInputOps = [];
    const activePrayer = player.activePrayer;
    const offensivePrayer = player.offensivePrayer;
    const independentPrayers = player.independentPrayers;
    let attackTargetSetThisTick = false;
    let untrackedItemUsed = false;
    let prayerFailureReported = false;
    for (const inputOp of pendingInputOps) {
      switch (inputOp.type) {
        case "protection":
        case "offensive":
        case "independent":
        case "quickPrayers":
          prayerFailureReported = this.executePrayerOp(inputOp, tick, prayerFailureReported);
          break;
        case "unequip":
        case "equip":
        case "equip_ammo":
        case "unequip_ammo":
          this.executeEquipmentOp(inputOp, attackTargetSetThisTick);
          break;
        case "use_item":
          untrackedItemUsed = this.executeUseItemOp(inputOp, attackTargetSetThisTick, untrackedItemUsed);
          break;
        case "drop_item":
          this.executeDropItemOp(inputOp, tick);
          break;
        case "special_attack_toggle":
          if (
            activateInstantSpecial(
              this,
              player,
              tick,
              resolveValueOrCallback(
                this.encounter.getEngineRules?.()?.specialAttacks
                  ?.energyCostMultiplier,
                {
                  tick: tick,
                  player: player,
                  world: this.worldState,
                },
              ) ?? 1,
            )
          ) {
            break;
          }
          if (player.equipment.weapon !== undefined && hasSpecialAttack(player.equipment.weapon)) {
            player.isSpecialAttackActive = !player.isSpecialAttackActive;
          }
          break;
        case "run_toggle":
          player.ctrlClickOverride = false;
          player.isRunEnabled = !player.isRunEnabled;
          break;
        case "attack_target":
          setPlayerAttackTarget(player, this.worldState, inputOp);
          player.pendingItemPickup = null;
          attackTargetSetThisTick = true;
          break;
        case "pickup_ground_item":
          player.pendingItemPickup = {
            groundItemId: inputOp.groundItemId,
          };
      }
    }
    if (player.activePrayer !== activePrayer) {
      this.logEvent({
        tick: tick,
        type: LogEventType.PRAYER_CHANGE,
        from: activePrayer,
        to: player.activePrayer,
      });
    }
    if (player.offensivePrayer !== offensivePrayer) {
      this.logEvent({
        tick: tick,
        type: LogEventType.PRAYER_CHANGE,
        from: offensivePrayer,
        to: player.offensivePrayer,
      });
    }
    for (const previousPrayer of independentPrayers) {
      if (!player.independentPrayers.includes(previousPrayer)) {
        this.logEvent({
          tick: tick,
          type: LogEventType.PRAYER_CHANGE,
          from: previousPrayer,
          to: null,
        });
      }
    }
    for (const currentPrayer of player.independentPrayers) {
      if (!independentPrayers.includes(currentPrayer)) {
        this.logEvent({
          tick: tick,
          type: LogEventType.PRAYER_CHANGE,
          from: null,
          to: currentPrayer,
        });
      }
    }
  }
  expireTimedProtectionPrayer(tick) {
    const protectionRestriction = this.getEncounterRules()?.prayerRestrictions?.protection;
    if ("object" != typeof protectionRestriction || !("expiresAfterTicks" in protectionRestriction)) {
      return;
    }
    if (
      null === this.player().activePrayer ||
      this.protectionPrayerActivatedTick === null
    ) {
      return;
    }
    const maxActiveTicks = Math.max(0, protectionRestriction.expiresAfterTicks - 1);
    if (!(tick - this.protectionPrayerActivatedTick < maxActiveTicks)) {
      this.deactivateProtectionPrayer(tick);
    }
  }
  deactivateProtectionPrayer(tick) {
    const player = this.player();
    const activePrayer = player.activePrayer;
    if (null !== activePrayer) {
      player.activePrayer = null;
      this.protectionPrayerActivatedTick = null;
      this.clearQuickPrayersActiveIfNoPrayers();
      this.syncActivePrayerList();
      this.logEvent({
        tick: tick,
        type: LogEventType.PRAYER_CHANGE,
        from: activePrayer,
        to: null,
      });
      this.tickEvents.setCurrentTick(tick);
      this.tickEvents.emit({
        type: "prayer_changed",
        actorId: player.id,
        from: activePrayer,
        to: null,
      });
    }
  }
  enforcePrayerRestrictions(tick) {
    const encounterRules = this.getEncounterRules();
    if (encounterRules?.prayerRestrictions?.protection === "blocked") {
      this.deactivateProtectionPrayer(tick);
    }
    if ("blocked" === encounterRules?.prayerRestrictions?.offensive) {
      this.deactivateOffensivePrayer(tick);
    }
    this.clearQuickPrayersActiveIfNoPrayers();
  }
  deactivateOffensivePrayer(tick) {
    const player = this.player();
    const offensivePrayer = player.offensivePrayer;
    if (offensivePrayer !== null) {
      player.offensivePrayer = null;
      this.clearQuickPrayersActiveIfNoPrayers();
      this.syncActivePrayerList();
      this.logEvent({
        tick: tick,
        type: LogEventType.PRAYER_CHANGE,
        from: offensivePrayer,
        to: null,
      });
      this.tickEvents.setCurrentTick(tick);
      this.tickEvents.emit({
        type: "prayer_changed",
        actorId: player.id,
        from: offensivePrayer,
        to: null,
      });
    }
  }
  executePrayerOp(inputOp, tick, prayerFailureReported) {
    const isPrayerUnlocked = (prayer) => isPrayerUnlockedByMechanics(prayer, this.mechanicsConfig);
    if ("quickPrayers" !== inputOp.type && null !== inputOp.prayer && !isPrayerUnlocked(inputOp.prayer)) {
      return prayerFailureReported;
    }
    const filteredInputOp =
      inputOp.type === "quickPrayers"
        ? {
            ...inputOp,
            selections: inputOp.selections.filter(isPrayerUnlocked),
          }
        : inputOp;
    const player = this.player();
    const encounterRules = this.getEncounterRules();
    const protectionRestriction = encounterRules?.prayerRestrictions?.protection;
    const offensiveRestriction = encounterRules?.prayerRestrictions?.offensive;
    const prayerUpdate = applyPrayerActions(
      {
        protection: player.activePrayer,
        offensive: player.offensivePrayer,
        independent: player.independentPrayers,
        quickPrayersActive: player.quickPrayersActive,
      },
      [filteredInputOp],
      player.prayerState.points > 0,
    );
    player.quickPrayersActive = prayerUpdate.quickPrayersActive;
    const protectionDisabled = tick < this.protectionPrayersDisabledUntilTick;
    const disabledProtectionPrayer =
      protectionDisabled && null !== prayerUpdate.protection && prayerUpdate.activated.includes(prayerUpdate.protection)
        ? prayerUpdate.protection
        : null;
    const protectionBlocked = "blocked" === protectionRestriction || protectionDisabled;
    const attemptedPrayer = prayerUpdate.rejected[0] ?? disabledProtectionPrayer;
    let failureReportedAfter = prayerFailureReported;
    if (!(null == attemptedPrayer) && !prayerFailureReported) {
      this.tickEvents.setCurrentTick(tick);
      this.tickEvents.emit({
        type: "prayer_activation_failed",
        actorId: player.id,
        attemptedPrayer: attemptedPrayer,
      });
      failureReportedAfter = true;
    }
    if (disabledProtectionPrayer !== null && 0 === prayerUpdate.rejected.length) {
      this.tickEvents.setCurrentTick(tick);
      this.tickEvents.emit({
        type: "game_message",
        kind: "game",
        segments: injuredPrayerMessageSegments,
      });
    }
    const protectionPrayer = protectionBlocked ? null : prayerUpdate.protection;
    const offensivePrayer = "blocked" === offensiveRestriction ? null : prayerUpdate.offensive;
    for (const transition of prayerUpdate.transitions) {
      if (
        (!("protection" === transition.slot) || !protectionBlocked) &&
        (!("offensive" === transition.slot) || offensiveRestriction !== "blocked")
      ) {
        this.tickEvents.setCurrentTick(tick);
        this.tickEvents.emit({
          type: "prayer_changed",
          actorId: player.id,
          from: transition.from,
          to: transition.to,
        });
        if (transition.from === Prayer.RapidHeal || transition.to === Prayer.RapidHeal) {
          this.resetHpRegenTimer(tick, transition.to === Prayer.RapidHeal);
        }
      }
    }
    const activatedPrayers = prayerUpdate.activated.filter(
      (prayer) => prayer === protectionPrayer || prayer === offensivePrayer || prayerUpdate.independent.includes(prayer),
    );
    if (activatedPrayers.length > 0) {
      const prayerActivationTicks = {
        ...player.prayerState.prayerActivationTicks,
      };
      for (const prayer of activatedPrayers) {
        prayerActivationTicks[prayer] = tick;
      }
      player.prayerState = {
        ...player.prayerState,
        prayerActivationTicks: prayerActivationTicks,
      };
    }
    if (
      null !== protectionPrayer &&
      prayerUpdate.activated.includes(protectionPrayer) &&
      typeof protectionRestriction == "object" &&
      "expiresAfterTicks" in protectionRestriction
    ) {
      this.protectionPrayerActivatedTick = tick;
    }
    let prayersChanged = false;
    if (prayerUpdate.protectionTouched && player.activePrayer !== protectionPrayer) {
      player.activePrayer = protectionPrayer;
      prayersChanged = true;
    }
    if (prayerUpdate.offensiveTouched && player.offensivePrayer !== offensivePrayer) {
      player.offensivePrayer = offensivePrayer;
      prayersChanged = true;
    }
    if (prayerUpdate.independentTouched) {
      const independent = prayerUpdate.independent;
      const independentPrayers = player.independentPrayers;
      if (
        independent.length !== independentPrayers.length ||
        independent.some((prayer, index) => prayer !== independentPrayers[index])
      ) {
        player.independentPrayers = [...independent];
        prayersChanged = true;
      }
    }
    this.clearQuickPrayersActiveIfNoPrayers();
    if (prayersChanged) {
      this.syncActivePrayerList();
    }
    return failureReportedAfter;
  }
  computeEquipmentOpResult(loadout, inputOp) {
    switch (inputOp.type) {
      case "unequip": {
        const unequipped = this.computeUnequipResult(loadout.inventory, loadout.equipment, inputOp.slot);
        if (unequipped) {
          return {
            ...loadout,
            ...unequipped,
          };
        } else {
          return null;
        }
      }
      case "equip": {
        if (inputOp.itemId === 27291 && this.player().stats.attack.max < 80) return null; // Keris partisan of the sun
        if (inputOp.itemId === 27665 && this.player().stats.magic.max < 70) return null; // Accursed sceptre
        const inventoryIndex = this.findInventoryIndexForItem(loadout.inventory, inputOp.inventoryIndex, inputOp.itemId);
        const equipped = this.computeEquipResult(loadout.inventory, loadout.equipment, inventoryIndex, inputOp.slot);
        if (equipped) {
          return {
            ...loadout,
            ...equipped,
          };
        } else {
          return null;
        }
      }
      case "equip_ammo": {
        const ammoInventoryIndex = this.findInventoryIndexForItem(loadout.inventory, inputOp.inventoryIndex, inputOp.itemId);
        const inventoryAfterEquip = this.computeInventoryAfterEquipAmmo(loadout.inventory, loadout.combatSupplies, ammoInventoryIndex);
        if (inventoryAfterEquip) {
          return {
            ...loadout,
            inventory: inventoryAfterEquip,
            combatSupplies: {
              ...loadout.combatSupplies,
              equippedAmmo: {
                id: inputOp.itemId,
              },
            },
          };
        } else {
          return null;
        }
      }
      case "unequip_ammo": {
        const inventoryAfterUnequip = this.computeInventoryAfterUnequipAmmo(loadout.inventory, loadout.combatSupplies);
        if (inventoryAfterUnequip) {
          return {
            ...loadout,
            inventory: inventoryAfterUnequip,
            combatSupplies: {
              ...loadout.combatSupplies,
              equippedAmmo: null,
            },
          };
        } else {
          return null;
        }
      }
      default:
        return inputOp;
    }
  }
  executeEquipmentOp(inputOp, attackTargetSetThisTick) {
    const player = this.player();
    const weapon = player.equipment.weapon;
    const updatedLoadout = this.computeEquipmentOpResult(
      {
        inventory: player.inventory,
        equipment: player.equipment,
        combatSupplies: player.combatSupplies,
      },
      inputOp,
    );
    if (updatedLoadout) {
      player.inventory = updatedLoadout.inventory;
      player.equipment = updatedLoadout.equipment;
      player.combatSupplies = updatedLoadout.combatSupplies;
      if ("equip" === inputOp.type) {
        this.tickEvents.emit({
          type: "item_equipped",
          slot: inputOp.slot,
          itemId: inputOp.itemId,
          equipSound: this.getEquipSound(inputOp.slot, inputOp.itemId),
        });
      }
      this.recalculateEquipmentStats();
      if (player.equipment.weapon !== weapon) {
        player.isSpecialAttackActive = false;
        this.syncSelectedAttackStyle();
      }
      if (!("equip" !== inputOp.type) || !("equip_ammo" !== inputOp.type)) {
        if (attackTargetSetThisTick) {
          player.attackInteractionActive = false;
        } else {
          player.attackTarget = null;
        }
      }
    }
  }
  findInventoryIndexForItem(inventory, inventoryIndex, itemId) {
    if (inventory[inventoryIndex]?.id === itemId) {
      return inventoryIndex;
    } else {
      return inventory.findIndex((itemRef) => itemRef?.id === itemId);
    }
  }
  getEquipSound(slot, itemId) {
    if (slot === "head") {
      return "helmet";
    }
    if ("legs" === slot) {
      return "legs";
    }
    if ("hands" === slot) {
      return "hands";
    }
    if (slot === "body") {
      if (this.isMetalBodyArmour(itemId)) {
        return "metal_body";
      } else {
        return "fun";
      }
    }
    if (slot === "weapon") {
      const weaponCategory = getWeaponCategoryOrUnarmed(itemId);
      if ("staff" === weaponCategory || "powered_staff" === weaponCategory) {
        return "staff";
      } else {
        return "fun";
      }
    }
    return "fun";
  }
  isMetalBodyArmour(itemId) {
    if (!this.objTypeLoader) {
      return false;
    }
    try {
      const itemName = this.objTypeLoader.load(itemId).name.toLowerCase();
      return (
        !softBodyNameKeywords.some((keyword) => itemName.includes(keyword)) && metalBodyNameKeywords.some((keyword) => itemName.includes(keyword))
      );
    } catch {
      return false;
    }
  }
  buildConsumableState(currentTick) {
    const player = this.player();
    return {
      playerHP: player.vitals.hp,
      maxHP: player.vitals.maxHp,
      stats: player.stats,
      poisonState: player.poisonState,
      prayerState: player.prayerState,
      runEnergy: player.runEnergy,
      specialAttack: player.specialAttack,
      combatTimers: player.combatTimers,
      cooldownTracks: player.cooldownTracks,
      activeEffects: player.activeEffects,
      currentTick: currentTick,
    };
  }
  applyItemEffectsWithRestrictions(consumable, playerState, loadout) {
    const itemRestrictions = this.getEncounterRules()?.itemRestrictions;
    const filteredEffects = consumable.effects.filter(
      (effect) =>
        (!itemRestrictions?.blockHealing ||
          (effect.op !== "heal" &&
            effect.op !== "heal_formula" &&
            effect.op !== "overheal" &&
            effect.op !== "overheal_formula" &&
            effect.op !== "delayed_heal")) &&
        (!itemRestrictions?.blockPrayerRestore ||
          (effect.op !== "restore_prayer_formula" &&
            (effect.op !== "apply_timed_effect" ||
              effect.effectType !== "prayer_regeneration"))),
    );
    return {
      filteredEffects: filteredEffects,
      newState: applyConsumableEffects(filteredEffects, playerState, {
        healing: itemRestrictions?.blockHealing ? 0 : itemRestrictions?.healingMultiplier,
        prayerRestore: itemRestrictions?.blockPrayerRestore ? 0 : itemRestrictions?.prayerRestoreMultiplier,
        blockOverheal: itemRestrictions?.blockOverheal,
        enhancedPrayerRestoration: hasEnhancedPrayerRestoration(loadout),
        ringOfEnduranceEquipped: loadout.equipment.ring === ringOfEnduranceItemId,
      }),
    };
  }
  consumeInventoryItem(inventory, inventoryIndex, consumable) {
    return applyItemConsumption(
      inventory,
      inventoryIndex,
      this.mechanicsConfig.vialSmasher === true &&
        "replace" === consumable.consume.type &&
        229 === consumable.consume.withId
        ? {
            type: "remove",
          }
        : consumable.consume,
    );
  }
  executeUseItemOp(inputOp, attackTargetSetThisTick, untrackedItemUsed) {
    const player = this.player();
    if (attackTargetSetThisTick) {
      player.attackInteractionActive = false;
    }
    const itemRef = player.inventory[inputOp.inventoryIndex];
    if (!itemRef) {
      return untrackedItemUsed;
    }
    const consumable = getConsumableDefinition(itemRef.id, inputOp.option);
    if (!consumable) {
      return untrackedItemUsed;
    }
    const { track: track, delayTicks: delayTicks } = consumable;
    const hasCooldown = undefined !== track && delayTicks > 0;
    if (hasCooldown && !isCooldownTrackReady(player.cooldownTracks, track, this.worldState.tick)) {
      return untrackedItemUsed;
    }
    if (undefined === track && untrackedItemUsed) {
      return untrackedItemUsed;
    }
    if (consumable.minHpToUse !== undefined && player.vitals.hp < consumable.minHpToUse) {
      return untrackedItemUsed;
    }
    const playerState = this.buildConsumableState(this.worldState.tick);
    if (isSurgeEffectBlocked(consumable.effects, playerState)) {
      return untrackedItemUsed;
    }
    const { filteredEffects: filteredEffects, newState: newState } = this.applyItemEffectsWithRestrictions(
      consumable,
      playerState,
      player,
    );
    const stateChanged = newState !== playerState;
    player.vitals.hp = newState.playerHP;
    player.vitals.maxHp = newState.maxHP;
    player.stats = newState.stats;
    player.poisonState = newState.poisonState;
    player.prayerState = newState.prayerState;
    player.runEnergy = newState.runEnergy;
    player.specialAttack = newState.specialAttack;
    player.combatTimers = newState.combatTimers;
    player.activeEffects = newState.activeEffects;
    const hasSelfDamage = filteredEffects.some(
      (effect) => effect.op === "self_damage" || effect.op === "self_damage_formula",
    );
    if (stateChanged && hasSelfDamage) {
      const selfDamage = Math.max(0, playerState.playerHP - newState.playerHP);
      clearPowerOfDeathIfWeaponRemoved(player, selfDamage);
      this.tickEvents.emit({
        type: "hitsplat_spawned",
        targetId: PLAYER_ACTOR_ID,
        amount: selfDamage,
        hitsplatType: selfDamage > 0 ? "damage" : "block",
      });
      this.selfDamageHitPending = true;
    }
    player.inventory = this.consumeInventoryItem(player.inventory, inputOp.inventoryIndex, consumable);
    if (hasCooldown) {
      player.cooldownTracks = withCooldownTrackDelay(
        player.cooldownTracks,
        track,
        this.worldState.tick,
        delayTicks,
      );
      this.tickEvents.emit({
        type: "item_consumed",
        track: track,
        itemId: itemRef.id,
      });
    }
    if (undefined !== track) {
      this.combatSystem.addAttackDelay(
        player.id,
        this.worldState.tick,
        getConsumableAttackDelayTicks(track),
      );
    }
    if (!attackTargetSetThisTick) {
      player.attackTarget = null;
    }
    if (consumable.playerGraphic !== undefined && stateChanged) {
      this.tickEvents.emit({
        type: "player_graphic_applied",
        spotAnimId: consumable.playerGraphic,
      });
    }
    this.syncVitalsToStats();
    return untrackedItemUsed || undefined === track;
  }
  executeDropItemOp(inputOp, droppedTick) {
    const player = this.player();
    const itemRef = player.inventory[inputOp.inventoryIndex];
    if (!itemRef) {
      return;
    }
    const quantity = itemRef.quantity ?? 1;
    const isStackable = isItemStackable(itemRef.id, quantity, this.objTypeLoader);
    const dropTile = [player.position[0], player.position[1]];
    player.inventory = clearInventorySlot(player.inventory, inputOp.inventoryIndex);
    const existingGroundItemIndex = isStackable
      ? this.worldState.groundItems.findIndex(
          (groundItem) =>
            groundItem.itemId === itemRef.id &&
            groundItem.position[0] === dropTile[0] &&
            groundItem.position[1] === dropTile[1],
        )
      : -1;
    const existingGroundItem = -1 === existingGroundItemIndex ? undefined : this.worldState.groundItems[existingGroundItemIndex];
    if (existingGroundItem) {
      this.worldState.groundItems[existingGroundItemIndex] = {
        ...existingGroundItem,
        quantity: existingGroundItem.quantity + quantity,
      };
    } else {
      this.worldState.groundItems.push({
        id: this.worldState.allocateGroundItemId(),
        itemId: itemRef.id,
        quantity: quantity,
        position: dropTile,
        droppedTick: droppedTick,
      });
    }
    this.tickEvents.emit({
      type: "ground_item_dropped",
      itemId: itemRef.id,
      quantity: quantity,
      position: dropTile,
    });
    this.recalculateEquipmentStats();
  }
  processPendingItemPickup() {
    const player = this.player();
    const pendingItemPickup = player.pendingItemPickup;
    if (!pendingItemPickup) {
      return;
    }
    const groundItemIndex = this.worldState.groundItems.findIndex(
      (groundItem) => groundItem.id === pendingItemPickup.groundItemId,
    );
    const targetGroundItem = -1 === groundItemIndex ? undefined : this.worldState.groundItems[groundItemIndex];
    if (!targetGroundItem) {
      player.pendingItemPickup = null;
      return;
    }
    if (
      player.position[0] !== targetGroundItem.position[0] ||
      player.position[1] !== targetGroundItem.position[1]
    ) {
      return;
    }
    player.pendingItemPickup = null;
    const isStackable = isItemStackable(targetGroundItem.itemId, targetGroundItem.quantity, this.objTypeLoader);
    const updatedInventory = addItemToInventory(player.inventory, targetGroundItem.itemId, targetGroundItem.quantity, isStackable);
    if (updatedInventory) {
      player.inventory = updatedInventory;
      this.worldState.groundItems.splice(groundItemIndex, 1);
      this.recalculateEquipmentStats();
      this.tickEvents.emit({
        type: "ground_item_taken",
        itemId: targetGroundItem.itemId,
        quantity: targetGroundItem.quantity,
        position: [targetGroundItem.position[0], targetGroundItem.position[1]],
      });
    }
  }
  tickActiveEffects(tick) {
    const player = this.player();
    if (0 === player.activeEffects.length) {
      return;
    }
    const remainingEffects = [];
    for (const effect of player.activeEffects) {
      if (effect.startedTick === tick) {
        remainingEffects.push(effect);
        continue;
      }
      const ticksRemaining = effect.ticksRemaining - 1;
      if (ticksRemaining <= 0) {
        if ("delayed_heal" === effect.type && player.alive) {
          const healedHp = Math.min(player.vitals.maxHp, player.vitals.hp + effect.data.amount);
          player.vitals.hp = Math.max(player.vitals.hp, healedHp);
          this.syncVitalsToStats();
        }
      } else {
        if (
          "prayer_regeneration" === effect.type &&
          (effect.tickDuration - ticksRemaining) % 12 == 0
        ) {
          player.prayerState = {
            ...player.prayerState,
            points: Math.max(
              player.prayerState.points,
              Math.min(player.prayerState.maxPoints, player.prayerState.points + 1),
            ),
          };
        }
        remainingEffects.push({
          ...effect,
          ticksRemaining: ticksRemaining,
        });
      }
    }
    player.activeEffects = remainingEffects;
  }
  tickPoison(tick) {
    const player = this.player();
    if (player.poisonState.poisonVarp === 0) {
      return;
    }
    if (player.poisonState.startedTick === tick) {
      return;
    }
    const poisonTickCounter = player.poisonState.poisonTickCounter - 1;
    if (poisonTickCounter > 0) {
      player.poisonState = {
        ...player.poisonState,
        poisonTickCounter: poisonTickCounter,
      };
      return;
    }
    const poisonPulse = computePlayerPoisonPulse(player.poisonState);
    player.poisonState = {
      ...poisonPulse.state,
      poisonTickCounter: 30,
    };
    if (poisonPulse.damage <= 0) {
      return;
    }
    const damageOverTime = poisonPulse.state.poisonVarp >= VENOM_VARP_THRESHOLD ? "venom" : "poison";
    this.applyDirectDamageToPlayer(
      poisonPulse.damage,
      "typeless",
      damageOverTime === "venom" ? "Venom" : "Poison",
      this.worldState.tick,
      undefined,
      undefined,
      damageOverTime,
    );
  }
  getEquipmentSlotForItem(itemId) {
    if (!this.objTypeLoader) {
      return null;
    }
    try {
      const objType = this.objTypeLoader.load(itemId);
      if (objType.isWearable()) {
        return wearPosToEquipmentSlot[objType.wearPos1] ?? null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  isAmmoSlotItem(itemId) {
    if (!this.objTypeLoader) {
      return false;
    }
    try {
      const objType = this.objTypeLoader.load(itemId);
      return objType.isWearable() && 13 === objType.wearPos1;
    } catch (error) {
      if (error instanceof Error && error.message === "Unknown item " + itemId) {
        return false;
      }
      throw error;
    }
  }
  getEquipmentStats() {
    return this.player().equipmentStats;
  }
  recalculateEquipmentStats() {
    const player = this.player();
    if (ringOfEnduranceItemId !== player.equipment.ring) {
      player.activeEffects = player.activeEffects.flatMap((effect) => {
        if ("stamina" !== effect.type || !effect.ringExtended) {
          return [effect];
        }
        const halvedTicksRemaining = Math.floor(effect.ticksRemaining / 2);
        if (halvedTicksRemaining > 0) {
          return [
            {
              ...effect,
              ticksRemaining: halvedTicksRemaining,
              ringExtended: false,
            },
          ];
        } else {
          return [];
        }
      });
    }
    if (this.objTypeLoader) {
      player.equipmentStats = computeEquipmentStats(player.equipment, this.objTypeLoader);
    } else {
      player.equipmentStats = createEmptyEquipmentStats();
    }
  }
  queueProtectionPrayer(prayer) {
    this.queueInputOp({
      type: "protection",
      prayer: prayer,
    });
  }
  queueOffensivePrayer(prayer) {
    this.queueInputOp({
      type: "offensive",
      prayer: prayer,
    });
  }
  queueIndependentPrayer(prayer) {
    this.queueInputOp({
      type: "independent",
      prayer: prayer,
    });
  }
  queueQuickPrayerToggle(selections) {
    this.queueInputOp({
      type: "quickPrayers",
      selections: [...selections],
    });
  }
  queueRunToggle() {
    this.queueInputOp({
      type: "run_toggle",
    });
  }
  projectPendingPrayers() {
    return projectPendingPrayerOps(
      buildPrayerProjectionInput(
        this.player(),
        this.worldState.tick,
        this.getPrayerRestoreProjectionRules(),
      ),
    );
  }
  getPrayerRestoreProjectionRules() {
    const itemRestrictions = this.getEncounterRules()?.itemRestrictions;
    return {
      allowed: true !== itemRestrictions?.blockPrayerRestore,
      ...(itemRestrictions?.prayerRestoreMultiplier === undefined
        ? {}
        : {
            multiplier: itemRestrictions.prayerRestoreMultiplier,
          }),
    };
  }
  getOffensivePrayer() {
    return this.player().offensivePrayer;
  }
  getEncounterSnapshot() {
    return this.encounter.getSnapshot({
      tick: this.worldState.tick,
      mechanics: this.mechanicsConfig,
      world: this.worldState,
    });
  }
  getEngineRunConfig() {
    const player = this.player();
    return {
      completionOwnership: this.completionOwnership,
      encounter: {
        kind: this.encounter.kind,
        seeds: this.encounter.getSeeds(),
      },
      bootstrap: {
        version: 14,
        startPosition: [...this.runStartPosition],
        baseStats: resetStatsToMax(this.configuredStats),
        ...(this.startHp === undefined
          ? {}
          : {
              startHp: this.startHp,
            }),
        enableIntro: this._introEnabled,
        ...(undefined === this.encounterConfig
          ? {}
          : {
              encounterConfig: this.encounterConfig,
            }),
        mechanicsConfig: {
          ...this.mechanicsConfig,
        },
        inventory: player.inventory.map((itemRef) =>
          itemRef
            ? {
                ...itemRef,
              }
            : null,
        ),
        equipment: {
          ...player.equipment,
        },
        combatSupplies: cloneCombatSupplies(player.combatSupplies),
        attackStylePerCategory: {
          ...this._attackStylePerCategory,
        },
        prepotApplied: this.prepotApplied,
        combatSeed: this.combatSeed,
      },
    };
  }
  setCombatSeed(combatSeed) {
    this.combatSeed = combatSeed;
    this.combatRandom = this.combatRandomOverride ?? createSeededRandom(combatSeed);
  }
  applyBootstrap(bootstrap) {
    this.configuredStats = resetStatsToMax(bootstrap.baseStats);
    this.startHp = Number.isFinite(bootstrap.startHp) ? bootstrap.startHp : undefined;
    this._introEnabled = bootstrap.enableIntro;
    this._attackStylePerCategory = {
      ...bootstrap.attackStylePerCategory,
    };
    this.setCombatSeed(bootstrap.combatSeed);
    this.setMechanicsConfig(bootstrap.mechanicsConfig);
  }
  syncActivePrayerList() {
    const player = this.player();
    const activePrayers = [];
    if (player.activePrayer && prayerSlotByPrayer[player.activePrayer] === "protection") {
      activePrayers.push(player.activePrayer);
    }
    if (player.offensivePrayer && "offensive" === prayerSlotByPrayer[player.offensivePrayer]) {
      activePrayers.push(player.offensivePrayer);
    }
    for (const independentPrayer of player.independentPrayers) {
      if ("independent" === prayerSlotByPrayer[independentPrayer]) {
        activePrayers.push(independentPrayer);
      }
    }
    player.prayerState = {
      ...player.prayerState,
      activePrayers: activePrayers,
    };
  }
  clearQuickPrayersActiveIfNoPrayers() {
    const player = this.player();
    if (
      player.activePrayer === null &&
      null === player.offensivePrayer &&
      0 === player.independentPrayers.length
    ) {
      player.quickPrayersActive = false;
    }
  }
  resetHpRegenTimer(tick, rapidHealActive) {
    const player = this.player();
    player.combatTimers = {
      ...player.combatTimers,
      hpRegenTick: tick + getHpRegenIntervalTicks(rapidHealActive),
    };
  }
  depletePrayer(tick) {
    const player = this.player();
    if (player.independentPrayers.includes(Prayer.RapidHeal)) {
      this.resetHpRegenTimer(tick, false);
    }
    player.prayerState = {
      ...player.prayerState,
      points: 0,
      drainCounter: 0,
      activePrayers: [],
      prayerActivationTicks: {},
    };
    player.activePrayer = null;
    player.offensivePrayer = null;
    player.independentPrayers = [];
    player.quickPrayersActive = false;
    this.protectionPrayerActivatedTick = null;
    this.tickEvents.setCurrentTick(tick);
    this.tickEvents.emit({
      type: "prayer_depleted",
      actorId: player.id,
    });
  }
  tryTriggerRedemption(tick) {
    const player = this.player();
    if (
      !player.alive ||
      player.activePrayer !== Prayer.Redemption ||
      player.prayerState.points <= 0
    ) {
      return;
    }
    const { hp: currentHp, maxHp: maxHp } = player.vitals;
    if (currentHp <= 0 || 10 * currentHp >= maxHp) {
      return;
    }
    const redemptionHeal = Math.floor(player.stats.prayer.max * redemptionHealFraction);
    player.vitals.hp = Math.min(maxHp, currentHp + redemptionHeal);
    this.depletePrayer(tick);
    this.tickEvents.setCurrentTick(tick);
    this.tickEvents.emit({
      type: "player_graphic_applied",
      spotAnimId: REDEMPTION_SPOT_ANIM_ID,
    });
    this.syncVitalsToStats();
  }
  getState() {
    const player = this.player();
    if (
      player.vitals.hp !== player.stats.hitpoints.current ||
      player.prayerState.points !== player.stats.prayer.current
    ) {
      logger.warn("Simulation", "Vitals desync detected in getState()", {
        playerHP: player.vitals.hp,
        statsHP: player.stats.hitpoints.current,
        prayerPoints: player.prayerState.points,
        statsPrayer: player.stats.prayer.current,
      });
    }
    const state = buildEngineState(this.worldState, this);
    state.pendingSpecialAttackActive = this.projectSpecialAttackActive();
    return state;
  }
  reset(startPosition, recording, runMechanicsOverride = {}) {
    const bootstrap = parseEngineBootstrap(recording ?? null);
    const combatSeed = bootstrap?.combatSeed ?? resolveCombatSeed(undefined);
    if (recording?.encounter?.seeds) {
      this.encounter.reset(recording.encounter.seeds);
    } else {
      this.encounter.reset();
    }
    this.runMechanicsOverride = {
      ...runMechanicsOverride,
    };
    if (bootstrap) {
      this.applyBootstrap(bootstrap);
    } else {
      this.rebuildMechanicsConfig();
      this.setCombatSeed(combatSeed);
    }
    const runStartPosition = startPosition ?? bootstrap?.startPosition ?? this.getDefaultStartPosition(this.encounter);
    this.runStartPosition = [...runStartPosition];
    const inventory = this.player().inventory;
    const combatSupplies = cloneCombatSupplies(this.player().combatSupplies);
    this.failedCondition = null;
    this.prepotApplied = false;
    this.lastTickInputLocked = false;
    this.pendingNpcDefeats = [];
    this.pendingEncounterCommands = [];
    if (recording) {
      this.completionOwnership = recording.completionOwnership;
    }
    this.npcDefinitions = this.encounter.getNpcDefinitions?.() ?? new NpcDefinitionRegistry();
    this.protectionPrayerActivatedTick = null;
    this.protectionPrayersDisabledUntilTick = Number.NEGATIVE_INFINITY;
    this.encounterRules = this.encounter.getEngineRules?.();
    this.damageHistory = [];
    this.eventLog = [];
    this.combatSystem.reset();
    this.applyArenaConfig(this.encounter);
    this.initializeRun(runStartPosition, inventory);
    this.player().combatSupplies = combatSupplies;
    this.recalculateEquipmentStats();
  }
  applyPrepot() {
    this.prepotApplied = true;
    if (!this.mechanicsConfig.autoPrepot) {
      return;
    }
    const player = this.player();
    const prepottedItemIds = new Set();
    for (let inventoryIndex = 0; inventoryIndex < player.inventory.length; inventoryIndex++) {
      const itemRef = player.inventory[inventoryIndex];
      if (!itemRef) {
        continue;
      }
      if (prepottedItemIds.has(itemRef.id)) {
        continue;
      }
      const consumableDefinition = consumableDefinitionByItemId[itemRef.id];
      if (!consumableDefinition || !hasPrepotEffect(consumableDefinition)) {
        continue;
      }
      prepottedItemIds.add(itemRef.id);
      const prepotEffects = filterPrepotEffects(consumableDefinition.effects);
      if (prepotEffects.length === 0) {
        continue;
      }
      const stateAfterEffects = applyConsumableEffects(
        prepotEffects,
        {
          playerHP: player.vitals.hp,
          maxHP: player.vitals.maxHp,
          stats: player.stats,
          poisonState: player.poisonState,
          prayerState: player.prayerState,
          runEnergy: player.runEnergy,
          specialAttack: player.specialAttack,
          combatTimers: player.combatTimers,
          cooldownTracks: player.cooldownTracks,
          activeEffects: player.activeEffects,
          currentTick: this.worldState.tick,
        },
        {
          ringOfEnduranceEquipped: player.equipment.ring === ringOfEnduranceItemId,
        },
      );
      player.vitals.hp = stateAfterEffects.playerHP;
      player.vitals.maxHp = stateAfterEffects.maxHP;
      player.stats = stateAfterEffects.stats;
      player.poisonState = stateAfterEffects.poisonState;
      player.prayerState = stateAfterEffects.prayerState;
      player.runEnergy = stateAfterEffects.runEnergy;
      player.combatTimers = stateAfterEffects.combatTimers;
      player.activeEffects = stateAfterEffects.activeEffects;
    }
    const purgingStaffEquipped = player.equipment.weapon === purgingStaffItemId;
    const purgingStaffInInventory = player.inventory.some((itemRef) => itemRef !== null && itemRef.id === purgingStaffItemId);
    if (purgingStaffEquipped || purgingStaffInInventory) {
      const combatTimersWithMark = activateMarkOfDarkness(player.stats.magic.max, true, player.combatTimers);
      if (combatTimersWithMark) {
        player.combatTimers = combatTimersWithMark;
      }
    }
    this.syncVitalsToStats();
  }
  canAdvanceTick() {
    return (
      this.player().alive &&
      !this._introActive &&
      this.encounter.getOutcome().phase !== "victory"
    );
  }
  getEncounterOutcome() {
    return this.encounter.getOutcome();
  }
  setTutorialPaused(tutorialPaused) {
    this._tutorialPaused = tutorialPaused;
  }
  setCompletionOwnership(completionOwnership) {
    this.completionOwnership = completionOwnership;
  }
  isTutorialPaused() {
    return this._tutorialPaused;
  }
  getIntroActive() {
    return this._introActive;
  }
  completeIntro() {
    if (this._introActive) {
      this._introActive = false;
      this.tickEvents.setCurrentTick(0);
      this.tickEvents.emit({
        type: "intro_completed",
      });
      this.lastTickEvents = this.tickEvents.flush();
    }
  }
  canExecuteEncounterCommand(command) {
    return (
      resolveBaseEncounterKind(this.encounter.kind) === resolveBaseEncounterKind(command.encounter) &&
      this.encounter.executeCommand !== undefined
    );
  }
  planPracticeRestart(command) {
    if (resolveBaseEncounterKind(this.encounter.kind) !== resolveBaseEncounterKind(command.encounter)) {
      return null;
    } else {
      return (
        this.encounter.planPracticeRestart?.(command, this.getMechanicsConfigWithoutRunOverride(), this.buildRestartContext()) ?? null
      );
    }
  }
  planRestartStart() {
    return this.encounter.planRestartStart?.(this.getMechanicsConfigWithoutRunOverride(), this.buildRestartContext()) ?? null;
  }
  getMechanicsConfigWithoutRunOverride() {
    return buildMechanicsConfig(this.getDefaultMechanicsConfig(), this.playerMechanicsConfig);
  }
  buildRestartContext() {
    return {
      playerPos: [...this.player().position],
    };
  }
  queueEncounterCommand(command) {
    if (!this.canExecuteEncounterCommand(command)) {
      return false;
    }
    this.pendingEncounterCommands.push(command);
    return true;
  }
  executeEncounterCommand(command) {
    if (!this.canExecuteEncounterCommand(command)) {
      return false;
    }
    const gameEvents = this.runEncounterCommand(command);
    if (null === gameEvents) {
      return false;
    }
    for (const gameEvent of gameEvents) {
      this.tickEvents.emit(gameEvent);
    }
    if (gameEvents.length > 0) {
      const flushedEvents = this.tickEvents.flush();
      this.lastTickEvents = [...this.lastTickEvents, ...flushedEvents];
    }
    return true;
  }
  processPendingEncounterCommands() {
    const pendingEncounterCommands = this.pendingEncounterCommands;
    this.pendingEncounterCommands = [];
    for (const command of pendingEncounterCommands) {
      for (const gameEvent of this.runEncounterCommand(command) ?? []) {
        this.tickEvents.emit(gameEvent);
      }
    }
  }
  runEncounterCommand(command) {
    const commandResult = this.encounter.executeCommand?.(
      command,
      {
        playerPos: this.player().position,
        tick: this.worldState.tick,
        world: this.worldState,
        spawnNpc: (npc) => {
          npc.spawnOrigin = "practice";
          this.spawnNpc(npc);
        },
        despawnNpc: (npcId) => this.despawnNpc(npcId),
      },
      this.mechanicsConfig,
    );
    if (commandResult) {
      return commandResult.gameEvents ?? [];
    } else {
      return null;
    }
  }
  setBossHp(requestedHp) {
    const npcs = this.worldState.getNpcs();
    const bossNpc = npcs.find((npc) => npc.role === "boss") ?? npcs[0];
    if (!bossNpc) {
      return 0;
    }
    const alive = bossNpc.alive;
    if (!alive && !this.pendingNpcDefeats.some((pendingDefeat) => pendingDefeat.actor === bossNpc)) {
      return bossNpc.vitals.hp;
    }
    const bossHp = Math.max(0, Math.min(bossNpc.vitals.maxHp, Math.floor(requestedHp)));
    bossNpc.vitals.hp = bossHp;
    if (!alive && bossHp > 0) {
      reviveNpc(bossNpc);
      this.pendingNpcDefeats = this.pendingNpcDefeats.filter(
        (pendingDefeat) => pendingDefeat.actor !== bossNpc,
      );
    } else if (alive && 0 === bossHp) {
      recordNpcDeath(bossNpc, this.worldState.tick, "scripted");
      this.startPendingNpcDeath(bossNpc);
      this.pendingNpcDefeats.push({
        actor: bossNpc,
        defeat: {
          npcId: bossNpc.id,
          tick: this.worldState.tick,
        },
      });
    }
    this.encounter.syncBossHp?.(bossHp, {
      world: this.worldState,
    });
    return bossHp;
  }
  applyBossHpPreset(requestedHp) {
    const bossHp = this.setBossHp(requestedHp);
    if (!(bossHp <= 0)) {
      this.encounter.enterBossHpPhase?.(bossHp, {
        tick: this.worldState.tick,
        world: this.worldState,
        spawnNpc: (npc) => this.spawnNpc(npc),
        despawnNpc: (npcId) => this.despawnNpc(npcId),
      });
    }
  }
  getEncounterKind() {
    return this.encounter.kind;
  }
  applyPlayerPrayerReduction(damage, attackType, prayerReduction) {
    return applyPrayerReduction(damage, attackType, this.player().activePrayer, prayerReduction);
  }
  applyEnvironmentalDamage(hit, tick) {
    // `hitsplatType` draws the hit with a hitsplat of its own (Vardorvis' bleed).
    this.applyDirectDamageToPlayer(
      hit.baseDamage,
      hit.attackType,
      hit.source,
      tick,
      hit.prayerReduction,
      hit.playerPosition,
      hit.hitsplatType,
    );
    const disablesProtectionPrayersForTicks =
      hit.disablesProtectionPrayersForTicks;
    if (undefined !== hit.applyPoison && this.player().alive) {
      this.applyPoisonToPlayer(hit.applyPoison);
    }
    if (
      undefined !== disablesProtectionPrayersForTicks &&
      this.player().alive
    ) {
      this.disableProtectionPrayersUntil(
        tick + disablesProtectionPrayersForTicks,
      );
      this.deactivateProtectionPrayer(tick);
    }
  }
  applyDirectDamageToPlayer(baseDamage, attackType, source, tick, prayerReduction, playerPosition, damageOverTime) {
    const player = this.player();
    let rolledDamage = Math.max(0, Math.floor(resolveRolledDamage(baseDamage, this.rollCombat)));
    const encounterRules = this.getEncounterRules();
    const incomingDamageMultiplier = resolveValueOrCallback(encounterRules?.incomingDamageMultiplier, this.buildRulesContext());
    if (undefined !== incomingDamageMultiplier) {
      rolledDamage = Math.max(0, Math.floor(rolledDamage * incomingDamageMultiplier));
    }
    const hpBefore = player.vitals.hp;
    if ("melee" === attackType) {
      rolledDamage = Math.floor(rolledDamage * getPowerOfDeathDamageMultiplier(player, tick));
    }
    const effectiveDamage = this.applyPlayerPrayerReduction(rolledDamage, attackType, prayerReduction);
    if (!this.mechanicsConfig.infiniteHealth) {
      clearPowerOfDeathIfWeaponRemoved(player, effectiveDamage);
      player.vitals.hp -= effectiveDamage;
      if (player.vitals.hp < 0) {
        player.vitals.hp = 0;
      }
    }
    const hpAfter = player.vitals.hp;
    const prayedCorrectly = attackType === "typeless" ? null : this.isPlayerPrayingAgainst(attackType);
    this.damageHistory.push({
      tick: tick,
      source: source,
      targetId: PLAYER_ACTOR_ID,
      baseDamage: rolledDamage,
      attackType: attackType,
      activePrayer: player.activePrayer,
      prayedCorrectly: prayedCorrectly,
      effectiveDamage: effectiveDamage,
      hpBefore: hpBefore,
      hpAfter: hpAfter,
      playerPosition: playerPosition,
    });
    this.logEvent({
      tick: tick,
      type: LogEventType.DAMAGE_TAKEN,
      source: source,
      attackType: attackType,
      baseDamage: rolledDamage,
      effectiveDamage: effectiveDamage,
      prayedCorrectly: prayedCorrectly,
      hpAfter: hpAfter,
    });
    this.tickEvents.emit({
      type: "hit_applied",
      targetId: PLAYER_ACTOR_ID,
      targetPosition: [...(playerPosition ?? player.position)],
      damage: effectiveDamage,
      blocked: effectiveDamage === 0,
      prayedCorrectly: prayedCorrectly,
      attackKind:
        "typeless" === attackType
          ? "typeless"
          : "magic" === attackType
            ? "magic_shadow"
            : "range" === attackType
              ? "range_shadow"
              : "melee_crush",
    });
    this.tickEvents.emit({
      type: "hitsplat_spawned",
      targetId: PLAYER_ACTOR_ID,
      amount: effectiveDamage,
      hitsplatType: damageOverTime ?? (effectiveDamage > 0 ? "damage" : "block"),
    });
    if (!this.mechanicsConfig.infiniteHealth && player.vitals.hp <= 0) {
      player.alive = false;
      this.failedCondition = "Death";
      this.logEvent({
        tick: tick,
        type: LogEventType.DEATH,
        cause: source,
      });
      this.tickEvents.emit({
        type: "actor_died",
        actorId: PLAYER_ACTOR_ID,
      });
    }
    if ("poison" !== damageOverTime && "venom" !== damageOverTime) {
      this.tryTriggerRedemption(tick);
    }
    this.notifyPlayerDamageTaken({
      sourceKind: "environment",
      source: source,
      tick: tick,
      attackType: attackType,
      baseDamage: rolledDamage,
      effectiveDamage: effectiveDamage,
      prayedCorrectly: prayedCorrectly,
      hpBefore: hpBefore,
      hpAfter: hpAfter,
      ...("poison" === damageOverTime || "venom" === damageOverTime
        ? {
            damageOverTime: damageOverTime,
          }
        : {}),
    });
    this.syncVitalsToStats();
  }
  notifyPlayerDamageTaken(hit) {
    const encounterRules = this.getEncounterRules();
    if (encounterRules?.onPlayerDamageTaken) {
      const ruleOutcome = encounterRules.onPlayerDamageTaken(hit, this.buildRulesContext());
      const failedCondition = this.applyRuleOutcome(ruleOutcome);
      if (failedCondition) {
        this.failRun(failedCondition, hit.tick);
      }
    }
  }
  isPlayerPrayingAgainst(attackType) {
    return isCorrectProtectionPrayer(attackType, this.player().activePrayer);
  }
  failRun(failedCondition, tick) {
    this.player().alive = false;
    this.failedCondition = failedCondition;
    this.logEvent({
      tick: tick,
      type: LogEventType.DEATH,
      cause: failedCondition,
    });
    this.tickEvents.emit({
      type: "actor_died",
      actorId: PLAYER_ACTOR_ID,
    });
  }
  syncVitalsToStats() {
    const player = this.player();
    player.stats = {
      ...player.stats,
      hitpoints: {
        current: player.vitals.hp,
        max: player.vitals.maxHp,
      },
      prayer: {
        current: player.prayerState.points,
        max: player.prayerState.maxPoints,
      },
    };
  }
  applyPoisonToPlayer(poisonSeverity) {
    const player = this.player();
    const poisonVarp = player.poisonState.poisonVarp;
    if (poisonVarp < 0 || poisonVarp >= VENOM_VARP_THRESHOLD) {
      return;
    }
    const wasUnpoisoned = poisonVarp === 0;
    player.poisonState = {
      ...player.poisonState,
      poisonVarp: Math.max(poisonVarp, poisonSeverity),
      ...(wasUnpoisoned
        ? {
            poisonTickCounter: 30,
            startedTick: this.worldState.tick,
          }
        : {}),
    };
  }
  getFailedCondition() {
    return this.failedCondition;
  }
  getDamageHistory() {
    return this.damageHistory;
  }
  getEventLog() {
    return this.eventLog;
  }
  getMechanicsConfig() {
    return {
      ...this.mechanicsConfig,
    };
  }
  getNpcHistory(npcId) {
    return this.worldState.getNpc(npcId)?.history ?? new Map();
  }
  getPlayerAttackCooldown(actorId, tick) {
    const nextAttackTick = this.combatSystem.getNextAttackTick(actorId);
    if (undefined === nextAttackTick) {
      return 0;
    } else {
      return Math.max(0, nextAttackTick - tick);
    }
  }
  getPlayerNextAttackTick(actorId) {
    return this.combatSystem.getNextAttackTick(actorId) ?? -1;
  }
  getNpcAttackTimer(npcId) {
    const npc = this.worldState.getNpc(npcId);
    if (npc?.alive) {
      return this.npcDefinitions.attackTimer(npc, this.buildNpcDefinitionContext());
    } else {
      return null;
    }
  }
  getPlayerAttackSpeed(actorId) {
    const scheduledAttackCycle = this.combatSystem.getScheduledAttackCycle(actorId);
    if (undefined !== scheduledAttackCycle) {
      return scheduledAttackCycle;
    } else {
      return computePlayerCombatParams(this.player()).attackSpeed;
    }
  }
  get isAlive() {
    return this.player().alive;
  }
  get prayerState() {
    return this.player().prayerState;
  }
  get stats() {
    return this.player().stats;
  }
  get specialAttack() {
    return this.player().specialAttack;
  }
  get combatTimers() {
    return this.player().combatTimers;
  }
  get inventory() {
    return this.player().inventory;
  }
  get runEnergy() {
    return this.player().runEnergy;
  }
  get activePrayer() {
    return this.player().activePrayer;
  }
  get offensivePrayer() {
    return this.player().offensivePrayer;
  }
  get independentPrayers() {
    return this.player().independentPrayers;
  }
  get markOfDarknessActive() {
    return this.player().combatTimers.markOfDarknessActiveTicks > 0;
  }
  get playerEquipment() {
    return this.player().equipment;
  }
  get equipmentStats() {
    return this.player().equipmentStats;
  }
  get cooldownTracks() {
    return this.player().cooldownTracks;
  }
  get pendingProtectionPrayer() {
    const prayerProjection = this.projectPendingPrayers();
    return [prayerProjection.protectionTouched, prayerProjection.protection];
  }
  get pendingOffensivePrayer() {
    const prayerProjection = this.projectPendingPrayers();
    return [prayerProjection.offensiveTouched, prayerProjection.offensive];
  }
  get pendingIndependentPrayers() {
    const prayerProjection = this.projectPendingPrayers();
    return [prayerProjection.independentTouched, prayerProjection.independent];
  }
  get pendingSpecialAttackToggles() {
    return this.countPendingSpecialAttackToggles();
  }
  get playerHistory() {
    return this.player().history;
  }
  get currentTick() {
    return this.worldState.tick;
  }
  getLastTickEvents() {
    return this.lastTickEvents;
  }
};
export { SimulationEngine };
