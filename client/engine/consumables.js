import { combatStatNames, decayingStatNames, cloneStats } from "./playerState.js";
import { computePrayerRestoreAmount } from "./prayers.js";
function createFourDosePotionEntries(doseItemIds, createEffects) {
  const [fourDoseItemId, threeDoseItemId, twoDoseItemId, oneDoseItemId] = doseItemIds;
  return {
    [fourDoseItemId]: {
      track: "potion",
      delayTicks: 3,
      consume: {
        type: "replace",
        withId: threeDoseItemId,
      },
      effects: createEffects(),
    },
    [threeDoseItemId]: {
      track: "potion",
      delayTicks: 3,
      consume: {
        type: "replace",
        withId: twoDoseItemId,
      },
      effects: createEffects(),
    },
    [twoDoseItemId]: {
      track: "potion",
      delayTicks: 3,
      consume: {
        type: "replace",
        withId: oneDoseItemId,
      },
      effects: createEffects(),
    },
    [oneDoseItemId]: {
      track: "potion",
      delayTicks: 3,
      consume: {
        type: "replace",
        withId: 229,
      },
      effects: createEffects(),
    },
  };
}
var extraPotionConsumables = {
  ...createDosedConsumableEntries([23885, 23884, 23883, 23882], 229, "potion", 3, () => [ // CACHE: Egniol potion doses; WIKI: restores prayer and run energy, with stamina
    { op: "restore_prayer_formula", formula: "prayer_potion" },
    { op: "restore_run", amount: 4000 },
    { op: "apply_timed_effect", effectType: "stamina", durationTicks: 200 },
  ]),
  ...createFourDosePotionEntries([22461, 22464, 22467, 22470], () => [
    {
      op: "boost_formula",
      stat: "ranged",
      scaleStat: "ranged",
      percent: 0.1,
      flat: 4,
    },
    {
      op: "boost_formula",
      stat: "defence",
      scaleStat: "defence",
      percent: 0.15,
      flat: 5,
    },
  ]),
  ...createFourDosePotionEntries([12625, 12627, 12629, 12631], () => [
    {
      op: "restore_run",
      amount: 2000,
    },
    {
      op: "apply_timed_effect",
      effectType: "stamina",
      durationTicks: 200,
    },
  ]),
  ...createFourDosePotionEntries([30125, 30128, 30131, 30134], () => [
    {
      op: "apply_timed_effect",
      effectType: "prayer_regeneration",
      durationTicks: 800,
    },
  ]),
  ...createFourDosePotionEntries([31650, 31653, 31656, 31659], () => [
    {
      op: "overheal_formula",
      scaleStat: "hitpoints",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "boost_formula",
      stat: "ranged",
      scaleStat: "ranged",
      percent: 0.1,
      flat: 4,
    },
    {
      op: "drain_formula",
      stat: "attack",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "strength",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "defence",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "magic",
      percent: 0.1,
      flat: 2,
    },
  ]),
};
var ATTACK_DELAY_TICKS_BY_CONSUMABLE_TRACK = {
  food: 3,
  combo_food: 2,
  potion: 0,
};
var STAT_RESTORE_FORMULAS = {
  super_restore: {
    percent: 0.25,
    flat: 8,
  },
  sanfew: {
    percent: 0.3,
    flat: 4,
  },
};
function createRangingBoostEffects() {
  return [
    {
      op: "boost_formula",
      stat: "ranged",
      scaleStat: "ranged",
      percent: 0.1,
      flat: 4,
    },
  ];
}
function createSuperCombatBoostEffects() {
  return ["attack", "strength", "defence"].map((stat) => ({
    op: "boost_formula",
    stat: stat,
    scaleStat: stat,
    percent: 0.15,
    flat: 5,
  }));
}
function createDosedConsumableEntries(doseItemIds, emptyContainerItemId, track, delayTicks, createEffects) {
  const [fourDoseItemId, threeDoseItemId, twoDoseItemId, oneDoseItemId] = doseItemIds;
  return {
    [fourDoseItemId]: {
      track: track,
      delayTicks: delayTicks,
      consume: {
        type: "replace",
        withId: threeDoseItemId,
      },
      effects: createEffects(),
    },
    [threeDoseItemId]: {
      track: track,
      delayTicks: delayTicks,
      consume: {
        type: "replace",
        withId: twoDoseItemId,
      },
      effects: createEffects(),
    },
    [twoDoseItemId]: {
      track: track,
      delayTicks: delayTicks,
      consume: {
        type: "replace",
        withId: oneDoseItemId,
      },
      effects: createEffects(),
    },
    [oneDoseItemId]: {
      track: track,
      delayTicks: delayTicks,
      consume: {
        type: "replace",
        withId: emptyContainerItemId,
      },
      effects: createEffects(),
    },
  };
}
function createSteppedDoseConsumableEntries(fourDoseItemId, itemIdStep, emptyContainerItemId, track, delayTicks, createEffects) {
  return createDosedConsumableEntries([fourDoseItemId, fourDoseItemId + itemIdStep, fourDoseItemId + itemIdStep * 2, fourDoseItemId + 3 * itemIdStep], emptyContainerItemId, track, delayTicks, createEffects);
}
function withMinHpToUse(consumableEntries, minHpToUse) {
  return Object.fromEntries(
    Object.entries(consumableEntries).map(([itemId, consumableDefinition]) => [
      itemId,
      {
        ...consumableDefinition,
        minHpToUse: minHpToUse,
      },
    ]),
  );
}
function withPlayerGraphic(consumableEntries, playerGraphic) {
  return Object.fromEntries(
    Object.entries(consumableEntries).map(([itemId, consumableDefinition]) => [
      itemId,
      {
        ...consumableDefinition,
        playerGraphic: playerGraphic,
      },
    ]),
  );
}
var consumableDefinitionByItemId = {
  ...extraPotionConsumables,
  13441: { // Anglerfish
    track: "food",
    delayTicks: 3,
    consume: {
      type: "remove",
    },
    effects: [
      {
        op: "heal_formula",
        baseAmount: 3,
        scaleStat: "hitpoints",
      },
    ],
  },
  29143: { // Cooked moonlight antelope
    track: "food",
    delayTicks: 3,
    consume: {
      type: "remove",
    },
    effects: [
      {
        op: "heal",
        amount: 14,
      },
      {
        op: "delayed_heal",
        amount: 12,
        delayTicks: 7,
        group: "hunter_meat",
      },
    ],
  },
  3144: { // Cooked karambwan
    track: "combo_food",
    delayTicks: 3,
    consume: {
      type: "remove",
    },
    effects: [
      {
        op: "heal",
        amount: 18,
      },
    ],
  },
  27641: { // Saturated heart
    track: "potion",
    delayTicks: 0,
    consume: {
      type: "none",
    },
    effects: [
      {
        op: "saturated_heart",
      },
    ],
    playerGraphic: 2287,
  },
  ...createSteppedDoseConsumableEntries(10925, 2, 229, "potion", 3, () => [ // Sanfew serum(4)
    {
      op: "restore_all_stats",
      formula: "sanfew",
    },
    {
      op: "restore_prayer_formula",
      formula: "sanfew",
    },
    {
      op: "cure_poison",
      immunityTicks: 600,
    },
  ]),
  ...createSteppedDoseConsumableEntries(3024, 2, 229, "potion", 3, () => [ // Super restore(4)
    {
      op: "restore_all_stats",
      formula: "super_restore",
    },
    {
      op: "restore_prayer_formula",
      formula: "super_restore",
    },
  ]),
  ...createSteppedDoseConsumableEntries(6685, 2, 229, "potion", 3, () => [ // Saradomin brew(4)
    {
      op: "overheal_formula",
      scaleStat: "hitpoints",
      percent: 0.15,
      flat: 2,
    },
    {
      op: "boost_formula",
      stat: "defence",
      scaleStat: "defence",
      percent: 0.2,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "attack",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "strength",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "magic",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "ranged",
      percent: 0.1,
      flat: 2,
    },
  ]),
  ...createSteppedDoseConsumableEntries(12695, 2, 229, "potion", 3, createSuperCombatBoostEffects), // Super combat potion(4)
  ...withMinHpToUse(
    createDosedConsumableEntries([23685, 23688, 23691, 23694], 229, "potion", 3, () => [ // Divine super combat potion(4)
      ...createSuperCombatBoostEffects(),
      {
        op: "self_damage",
        amount: 10,
      },
      {
        op: "divine_decay_lock",
        stats: ["attack", "strength", "defence"],
        durationTicks: 500,
      },
    ]),
    11,
  ),
  ...createDosedConsumableEntries([2444, 169, 171, 173], 229, "potion", 3, createRangingBoostEffects), // Ranging potion(4)
  ...withMinHpToUse(
    createDosedConsumableEntries([23733, 23736, 23739, 23742], 229, "potion", 3, () => [ // Divine ranging potion(4)
      {
        op: "boost_formula",
        stat: "ranged",
        scaleStat: "ranged",
        percent: 0.1,
        flat: 4,
      },
      {
        op: "self_damage",
        amount: 10,
      },
      {
        op: "divine_decay_lock",
        stats: ["ranged"],
        durationTicks: 500,
      },
    ]),
    11,
  ),
  ...createSteppedDoseConsumableEntries(27629, 3, 229, "potion", 3, () => [ // Forgotten brew(4)
    {
      op: "boost_formula",
      stat: "magic",
      scaleStat: "magic",
      percent: 0.08,
      flat: 3,
    },
    {
      op: "restore_prayer_formula",
      formula: "forgotten_brew",
    },
    {
      op: "drain_formula",
      stat: "attack",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "strength",
      percent: 0.1,
      flat: 2,
    },
    {
      op: "drain_formula",
      stat: "defence",
      percent: 0.1,
      flat: 2,
    },
  ]),
  ...createSteppedDoseConsumableEntries(4417, 2, 1980, "potion", 3, () => [ // Guthix rest(4)
    {
      op: "overheal",
      amount: 5,
    },
    {
      op: "restore_run",
      amount: 500,
    },
    {
      op: "reduce_poison",
      amount: 1,
    },
  ]),
  ...createSteppedDoseConsumableEntries(5952, 2, 229, "potion", 3, () => [ // Antidote++(4)
    {
      op: "cure_poison",
      immunityTicks: 1200,
    },
  ]),
  ...createSteppedDoseConsumableEntries(31638, 3, 229, "potion", 3, () => [ // Extended stamina potion(4)
    {
      op: "restore_run",
      amount: 4000,
    },
    {
      op: "apply_timed_effect",
      effectType: "stamina",
      durationTicks: 400,
    },
  ]),
  ...createSteppedDoseConsumableEntries(31614, 3, 229, "potion", 3, () => [ // Extreme energy potion(4)
    {
      op: "restore_run",
      amount: 3900,
    },
  ]),
  ...withPlayerGraphic(
    createSteppedDoseConsumableEntries(30875, 3, 229, "potion", 3, () => [ // Surge potion(4)
      {
        op: "surge",
        percent: 25,
      },
    ]),
    3232,
  ),
  ...createDosedConsumableEntries([2434, 139, 141, 143], 229, "potion", 3, () => [ // Prayer potion(4)
    {
      op: "restore_prayer_formula",
      formula: "prayer_potion",
    },
  ]),
  29183: { // Snowy knight mix (2)
    track: "potion",
    delayTicks: 3,
    consume: {
      type: "replace",
      withId: 29201,
    },
    effects: [
      {
        op: "heal",
        amount: 8,
      },
    ],
  },
  29201: { // Snowy knight mix (1)
    track: "potion",
    delayTicks: 3,
    consume: {
      type: "remove",
    },
    effects: [
      {
        op: "heal",
        amount: 8,
      },
    ],
  },
  229: {
    track: "potion",
    delayTicks: 0,
    consume: {
      type: "none",
    },
    effects: [],
  },
  22081: { // Locator orb
    consume: {
      type: "none",
    },
    effects: [
      {
        op: "self_damage",
        amount: 10,
      },
    ],
  },
  7510: { // Dwarven rock cake
    consume: {
      type: "none",
    },
    effects: [
      {
        op: "self_damage",
        amount: 1,
      },
    ],
    minHpToUse: 3,
  },
};
var rockCakeGuzzleConsumable = {
  consume: {
    type: "none",
  },
  effects: [
    {
      op: "self_damage_formula",
      percent: 0.1,
      flat: 1,
    },
  ],
};
function getConsumableDefinition(itemId, option = "default") {
  switch (option) {
    case "default":
      return consumableDefinitionByItemId[itemId];
    case "guzzle":
      if (7510 === itemId) { // Dwarven rock cake
        return rockCakeGuzzleConsumable;
      } else {
        return undefined;
      }
    default:
      // An option without a case comes back as it went in, where the callers
      // expect a definition or undefined.
      return option;
  }
}
var prepotEffectOpSet = new Set([
  "boost_formula",
  "divine_decay_lock",
  "saturated_heart",
  "apply_timed_effect",
  "cure_poison",
]);
function filterPrepotEffects(effects) {
  return effects.filter((effect) => prepotEffectOpSet.has(effect.op));
}
function hasPrepotEffect(consumableDefinition) {
  return consumableDefinition.effects.some((effect) => prepotEffectOpSet.has(effect.op));
}
function boostStatLevel(maxLevel, currentLevel, boostAmount) {
  return Math.max(currentLevel, Math.min(currentLevel + boostAmount, maxLevel + boostAmount));
}
function drainStatLevel(currentLevel, drainAmount) {
  return Math.max(0, currentLevel - drainAmount);
}
function restoreStatLevel(maxLevel, currentLevel, restoreAmount) {
  if (currentLevel < maxLevel) {
    return Math.min(maxLevel, currentLevel + restoreAmount);
  } else {
    return currentLevel;
  }
}
function withStatCurrentLevel(stats, statName, newLevel) {
  if (stats[statName].current === newLevel) {
    return stats;
  }
  const updatedStats = cloneStats(stats);
  updatedStats[statName] = {
    ...updatedStats[statName],
    current: newLevel,
  };
  return updatedStats;
}
function withStatDecayLocks(statDecayLocks, statNames, decayLock) {
  const updatedLocks = {
    ...statDecayLocks,
  };
  for (const statName of statNames) {
    updatedLocks[statName] = decayLock;
  }
  return updatedLocks;
}
function isDecayLockableStat(statName) {
  return combatStatNames.includes(statName);
}
function getHpRegenIntervalTicks(rapidHealActive) {
  if (rapidHealActive) {
    return 50;
  } else {
    return 100;
  }
}
var consumableTrackBlockers = {
  food: ["potion", "combo_food"],
  potion: ["combo_food"],
  combo_food: [],
};
function applyItemConsumption(inventory, inventoryIndex, consumeRule) {
  const updatedInventory = [...inventory];
  const itemRef = updatedInventory[inventoryIndex];
  switch (consumeRule.type) {
    case "remove":
      updatedInventory[inventoryIndex] = null;
      break;
    case "replace":
      updatedInventory[inventoryIndex] = {
        id: consumeRule.withId,
      };
      break;
    case "none":
      break;
    case "decrement": {
      if (itemRef === null) {
        break;
      }
      const quantity = itemRef.quantity ?? 1;
      updatedInventory[inventoryIndex] =
        quantity > 1
          ? {
              id: itemRef.id,
              quantity: quantity - 1,
            }
          : null;
      break;
    }
  }
  return updatedInventory;
}
function isCooldownTrackReady(cooldownTracks, track, tick) {
  if (tick < cooldownTracks[track]) {
    return false;
  }
  for (const blockingTrack of consumableTrackBlockers[track]) {
    if (tick < cooldownTracks[blockingTrack]) {
      return false;
    }
  }
  return true;
}
function withCooldownTrackDelay(cooldownTracks, track, tick, delayTicks) {
  const readyTick = tick + delayTicks;
  const currentReadyTick = cooldownTracks[track];
  return {
    ...cooldownTracks,
    [track]: Math.max(currentReadyTick, readyTick),
  };
}
function isSurgeEffectBlocked(effects, playerState) {
  return effects.some(
    (effect) =>
      effect.op === "surge" &&
      (playerState.combatTimers.surgePotionCooldownTicks > 0 ||
        playerState.specialAttack.energy >= 100),
  );
}
var VENOM_VARP_BASE = 1000000;
function venomVarpToPoisonVarp(poisonVarp) {
  return (
    (function (venomVarp) {
      return Math.min((venomVarp - 999997) * 2, 20);
    })(poisonVarp) * 5
  );
}
function addPlayerHpCapped(playerState, healAmount, hpCap) {
  return {
    ...playerState,
    playerHP: Math.min(hpCap, playerState.playerHP + healAmount),
  };
}
function scalePercentPlusFlat(baseAmount, percent, flat) {
  return Math.floor(baseAmount * percent) + flat;
}
function scaleByOptionalMultiplier(amount, multiplier) {
  if (multiplier === undefined) {
    return amount;
  } else {
    return Math.floor(amount * multiplier);
  }
}
function applyNonLethalSelfDamage(playerState, damage) {
  const remainingHp = Math.max(1, playerState.playerHP - damage);
  return {
    ...playerState,
    playerHP: remainingHp,
  };
}
function applyHeal(playerState, healAmount) {
  const healedHp = Math.min(playerState.maxHP, playerState.playerHP + healAmount);
  return {
    ...playerState,
    playerHP: Math.max(playerState.playerHP, healedHp),
  };
}
function applyHealFormula(playerState, baseAmount, scaleStat, healingMultiplier, blockOverheal) {
  const scaleStatName = scaleStat ?? "hitpoints";
  const maxLevel = playerState.stats[scaleStatName].max;
  const formulaAmount =
    Math.floor(maxLevel / 10) +
    Math.floor(maxLevel / 25) * 2 +
    Math.floor(maxLevel / 93) * 5 +
    2;
  const healAmount = scaleByOptionalMultiplier(Math.max(formulaAmount, baseAmount), healingMultiplier);
  const hpCap = blockOverheal ? playerState.maxHP : playerState.maxHP + healAmount;
  const healedHp = Math.min(hpCap, playerState.playerHP + healAmount);
  return {
    ...playerState,
    playerHP: healedHp,
  };
}
function applyDelayedHeal(playerState, healAmount, delayTicks, group) {
  const keptEffects = group
    ? playerState.activeEffects.filter((activeEffect) => activeEffect.data?.group !== group)
    : playerState.activeEffects;
  const delayedHealEffect = {
    id: "delayed_heal_" + playerState.currentTick + "_" + healAmount + "_" + delayTicks,
    type: "delayed_heal",
    ticksRemaining: delayTicks,
    tickDuration: delayTicks,
    startedTick: playerState.currentTick,
    data: {
      amount: healAmount,
      group: group,
    },
  };
  return {
    ...playerState,
    activeEffects: [...keptEffects, delayedHealEffect],
  };
}
function applyBoostFormula(playerState, statName, boostAmount) {
  const stat = playerState.stats[statName];
  return {
    ...playerState,
    stats: withStatCurrentLevel(playerState.stats, statName, boostStatLevel(stat.max, stat.current, boostAmount)),
  };
}
function applyDrainFormula(playerState, statName, drainAmount) {
  return {
    ...playerState,
    stats: withStatCurrentLevel(playerState.stats, statName, drainStatLevel(playerState.stats[statName].current, drainAmount)),
  };
}
function applyRestorePrayerFormula(playerState, restoreAmount) {
  // Points raised beyond the level (a special attack can) are not lowered.
  const restoredPoints = Math.max(
    playerState.prayerState.points,
    Math.min(playerState.prayerState.maxPoints, playerState.prayerState.points + restoreAmount),
  );
  return {
    ...playerState,
    prayerState: {
      ...playerState.prayerState,
      points: restoredPoints,
    },
  };
}
function applyRestoreAllStats(playerState, formula) {
  const { percent: percent, flat: flat } = STAT_RESTORE_FORMULAS[formula];
  let stats = playerState.stats;
  for (const statName of decayingStatNames) {
    const { current: current, max: maxLevel } = stats[statName];
    stats = withStatCurrentLevel(stats, statName, restoreStatLevel(maxLevel, current, scalePercentPlusFlat(maxLevel, percent, flat)));
  }
  return {
    ...playerState,
    stats: stats,
  };
}
function applyRestoreRun(playerState, runEnergyAmount) {
  return {
    ...playerState,
    runEnergy: {
      energy: Math.min(10000, playerState.runEnergy.energy + runEnergyAmount),
    },
  };
}
function applyCurePoison(playerState, immunityTicks) {
  const immunityCycles = Math.ceil(immunityTicks / 30);
  return {
    ...playerState,
    poisonState: {
      ...playerState.poisonState,
      poisonVarp: -immunityCycles,
      poisonTickCounter: 30,
      startedTick: playerState.currentTick,
    },
  };
}
function applyReducePoison(playerState, reduceAmount) {
  const { poisonVarp: poisonVarp } = playerState.poisonState;
  if (poisonVarp < 0 || 0 === poisonVarp) {
    return playerState;
  }
  const reducedPoisonVarp =
    poisonVarp >= VENOM_VARP_BASE
      ? Math.max(0, venomVarpToPoisonVarp(poisonVarp) - reduceAmount)
      : Math.max(0, poisonVarp - reduceAmount);
  return {
    ...playerState,
    poisonState: {
      ...playerState.poisonState,
      poisonVarp: reducedPoisonVarp,
    },
  };
}
function applySaturatedHeart(playerState) {
  if (playerState.combatTimers.saturatedHeartCooldownTicks > 0) {
    return playerState;
  }
  const magic = playerState.stats.magic;
  return {
    ...playerState,
    stats: withStatCurrentLevel(
      playerState.stats,
      "magic",
      boostStatLevel(magic.max, magic.current, scalePercentPlusFlat(magic.max, 0.1, 4)),
    ),
    combatTimers: {
      ...playerState.combatTimers,
      saturatedHeartCooldownTicks: 500,
      statDecayLocks: withStatDecayLocks(playerState.combatTimers.statDecayLocks, ["magic"], {
        ticksRemaining: 500,
        source: "saturated_heart",
      }),
    },
  };
}
function applyTimedEffect(playerState, effectType, durationTicks, ringExtended = false) {
  const timedEffect = {
    id: effectType + "_" + playerState.currentTick,
    type: effectType,
    ticksRemaining: durationTicks,
    tickDuration: durationTicks,
    startedTick: playerState.currentTick,
    ...(ringExtended
      ? {
          ringExtended: true,
        }
      : {}),
  };
  const keptEffects = playerState.activeEffects.filter((activeEffect) => activeEffect.type !== effectType);
  return {
    ...playerState,
    activeEffects: [...keptEffects, timedEffect],
  };
}
function applyConsumableEffect(effect, playerState, effectModifiers) {
  switch (effect.op) {
    case "heal":
      return applyHeal(playerState, scaleByOptionalMultiplier(effect.amount, effectModifiers?.healing));
    case "heal_formula":
      return applyHealFormula(playerState, effect.baseAmount, effect.scaleStat, effectModifiers?.healing, effectModifiers?.blockOverheal);
    case "overheal": {
      const healAmount = scaleByOptionalMultiplier(effect.amount, effectModifiers?.healing);
      return addPlayerHpCapped(playerState, healAmount, effectModifiers?.blockOverheal ? playerState.maxHP : playerState.maxHP + healAmount);
    }
    case "overheal_formula": {
      const healAmount = scaleByOptionalMultiplier(
        scalePercentPlusFlat(playerState.stats[effect.scaleStat].max, effect.percent, effect.flat),
        effectModifiers?.healing,
      );
      return addPlayerHpCapped(playerState, healAmount, effectModifiers?.blockOverheal ? playerState.maxHP : playerState.maxHP + healAmount);
    }
    case "delayed_heal":
      return applyDelayedHeal(playerState, scaleByOptionalMultiplier(effect.amount, effectModifiers?.healing), effect.delayTicks, effect.group);
    case "boost_formula":
      return applyBoostFormula(playerState, effect.stat, scalePercentPlusFlat(playerState.stats[effect.scaleStat].max, effect.percent, effect.flat));
    case "divine_decay_lock":
      return {
        ...playerState,
        combatTimers: {
          ...playerState.combatTimers,
          statDecayLocks: withStatDecayLocks(playerState.combatTimers.statDecayLocks, effect.stats, {
            ticksRemaining: effect.durationTicks,
            source: "divine",
          }),
        },
      };
    case "drain_formula":
      return applyDrainFormula(playerState, effect.stat, scalePercentPlusFlat(playerState.stats[effect.stat].current, effect.percent, effect.flat));
    case "restore_prayer_formula":
      return applyRestorePrayerFormula(
        playerState,
        scaleByOptionalMultiplier(
          computePrayerRestoreAmount(
            effect.formula,
            playerState.stats.prayer.max,
            effectModifiers?.enhancedPrayerRestoration ?? false,
          ),
          effectModifiers?.prayerRestore,
        ),
      );
    case "restore_all_stats":
      return applyRestoreAllStats(playerState, effect.formula);
    case "restore_run":
      return applyRestoreRun(playerState, effect.amount);
    case "surge":
      return {
        ...playerState,
        specialAttack: {
          ...playerState.specialAttack,
          energy: Math.min(100, playerState.specialAttack.energy + effect.percent),
        },
        combatTimers: {
          ...playerState.combatTimers,
          surgePotionCooldownTicks: 500,
        },
      };
    case "cure_poison":
      return applyCurePoison(
        playerState.poisonState.poisonVarp >= VENOM_VARP_BASE
          ? {
              ...playerState,
              poisonState: {
                ...playerState.poisonState,
                poisonVarp: venomVarpToPoisonVarp(playerState.poisonState.poisonVarp),
              },
            }
          : playerState,
        effect.immunityTicks,
      );
    case "reduce_poison":
      return applyReducePoison(playerState, effect.amount);
    case "saturated_heart":
      return applySaturatedHeart(playerState);
    case "apply_timed_effect": {
      const staminaExtendedByRing =
        "stamina" === effect.effectType && true === effectModifiers?.ringOfEnduranceEquipped;
      return applyTimedEffect(playerState, effect.effectType, effect.durationTicks * (staminaExtendedByRing ? 2 : 1), staminaExtendedByRing);
    }
    case "self_damage":
      return applyNonLethalSelfDamage(playerState, effect.amount);
    case "self_damage_formula":
      return applyNonLethalSelfDamage(playerState, scalePercentPlusFlat(playerState.playerHP, effect.percent, effect.flat));
    default:
      return playerState;
  }
}
function syncHitpointsStat(playerState) {
  if (playerState.playerHP === playerState.stats.hitpoints.current) {
    return playerState;
  }
  const updatedStats = cloneStats(playerState.stats);
  updatedStats.hitpoints = {
    ...updatedStats.hitpoints,
    current: playerState.playerHP,
  };
  return {
    ...playerState,
    stats: updatedStats,
  };
}
function applyConsumableEffects(effects, playerState, effectModifiers) {
  let newState = playerState;
  const doublesRunRestore =
    effectModifiers?.ringOfEnduranceEquipped &&
    effects.some(
      (effect) => effect.op === "apply_timed_effect" && effect.effectType === "stamina",
    );
  for (const effect of effects) {
    newState = applyConsumableEffect(
      doublesRunRestore && "restore_run" === effect.op
        ? {
            ...effect,
            amount: 2 * effect.amount,
          }
        : effect,
      newState,
      effectModifiers,
    );
  }
  return syncHitpointsStat(newState);
}
export {
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
};
