import { defaultYamaFireballBeats } from "./fireballGeometry.js";
import { getDistanceToFootprint } from "../../engine/attackRange.js";
import { getNpcAttackAccuracy, getPrayerMultipliers, getDrainedNpcFormulaStats, getPlayerFormulaStats } from "../../engine/combatFormulas.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { getYamaBeatInfo, getNextYamaBeatTick } from "./beatClock.js";
import { getYamaAttackKind, yamaSize } from "./constants.js";
import { getMissingHpPercent } from "./contracts.js";
function createYamaAttackPolicyState(openingStyle, attackPattern) {
  return {
    openingStyle: openingStyle,
    attackPattern: attackPattern,
  };
}
// The two functions below compute the style of an intent that the post-tick
// does not use: see yamaAttackPolicy.
function getAlternatingStyle(attackOrdinal, openingStyle) {
  if (attackOrdinal % 2 == 0) {
    return openingStyle;
  } else if (openingStyle === "magic") {
    return "range";
  } else {
    return "magic";
  }
}
function getStyleForBeat(beatInfo, openingStyle, attackPattern) {
  const beatsPerCycle = attackPattern?.beatsPerCycle ?? 10;
  const snapFireballBeats = attackPattern?.snapFireballBeats ?? attackPattern?.fireballBeats ?? defaultYamaFireballBeats;
  const cycleIndex = Math.floor(beatInfo.globalBeatOrdinal / beatsPerCycle);
  const earlierSnapBeats = snapFireballBeats.filter((snapBeat) => snapBeat < beatInfo.beatIndex).length;
  return getAlternatingStyle(cycleIndex * (beatsPerCycle - snapFireballBeats.length) + (beatInfo.beatIndex - earlierSnapBeats), openingStyle);
}
// What Yama wants to do on a beat: a melee when the player is next to him,
// nothing on a snap fireball beat, otherwise a magic or ranged attack. The
// post-tick of yamaNpcDefinition takes that much from it, and the attack kind
// of the melee. For a magic or ranged intent it ignores `style` and
// `attackKind` and takes the style from queueAlternatingAttack, which counts
// the attacks queued so far instead of the beats. The post-tick asks only on
// a beat and with the player alive, so the answers "face" and the first
// "idle" are never given. `init` is never called.
var yamaAttackPolicy = {
  init: () => ({
    openingStyle: "magic",
  }),
  onTick(policyInput, policyState) {
    const player = policyInput.world.getPlayer();
    const beatInfo = getYamaBeatInfo(policyInput.tick, policyState.attackPattern);
    if (!player || !player.alive) {
      return {
        intent: {
          type: "idle",
        },
        nextState: policyState,
      };
    }
    if (!beatInfo.isBeat) {
      return {
        intent: {
          type: "face",
          targetId: player.id,
        },
        nextState: policyState,
      };
    }
    if (
      getDistanceToFootprint(
        player.position[0],
        player.position[1],
        policyInput.self.position[0],
        policyInput.self.position[1],
        yamaSize,
      ) <= 1
    ) {
      return {
        intent: {
          type: "attack",
          targetId: player.id,
          style: "melee",
          attackKind: "melee_crush",
        },
        nextState: policyState,
      };
    }
    if (beatInfo.fireballBeatKind === "snap") {
      return {
        intent: {
          type: "idle",
        },
        nextState: policyState,
      };
    }
    const style = getStyleForBeat(beatInfo, policyState.openingStyle, policyState.attackPattern);
    return {
      intent: {
        type: "attack",
        targetId: player.id,
        style: style,
        attackKind: getYamaAttackKind(style),
      },
      nextState: policyState,
    };
  },
};
// Yama's timeline. In the post-tick of a beat he queues an attack
// (`postTick`); in his next turn, one tick later, he launches it (`tick`). A
// melee is rolled at once, with an impact delay of 1 tick. Magic and ranged
// start a windup of 3 ticks instead; the turn that ends it rolls the attack,
// with an impact delay of 0.
var yamaNpcDefinition = defineNpc({
  id: "yama",
  move: false,
  tick: ({ actor: actor, config: config, context: context }) => {
    const queuedAttack = actor.state.queuedAttack;
    actor.state.queuedAttack = null;
    // The attack begun in this turn, for the snapshot (`lastAttackKind`): cleared
    // at the start of every turn, set below when an attack is launched, and set
    // to "fireball" by the encounter when a snap burst starts.
    actor.state.latestAttackKind = null;
    actor.state.latestAttackTick = null;
    if (!actor.alive || !context.world.getPlayer()?.alive) {
      clearYamaAttackState(actor);
      return {
        environmentalDamages: [],
      };
    }
    const npcAttacks = [];
    const windup = actor.state.windup;
    if (windup && context.tick >= windup.releaseTick) {
      actor.state.windup = null;
      npcAttacks.push(
        buildYamaAttack(actor, windup, {
          config: config,
          world: context.world,
        }),
      );
    }
    if (!queuedAttack) {
      return {
        npcAttacks: npcAttacks,
        environmentalDamages: [],
      };
    }
    const attackMechanics = config.getMechanics();
    if (
      queuedAttack.style === "melee"
        ? attackMechanics.meleeEnabled
        : attackMechanics.rangedMagicEnabled
    ) {
      actor.state.latestAttackKind = queuedAttack.attackKind;
      actor.state.latestAttackTick = context.tick;
      if (queuedAttack.style === "melee") {
        npcAttacks.push(
          buildYamaAttack(actor, queuedAttack, {
            config: config,
            world: context.world,
          }),
        );
      } else {
        actor.state.windup = {
          style: queuedAttack.style,
          attackKind: queuedAttack.attackKind,
          releaseTick: context.tick + 3,
        };
        actor.combat.lastAttackTick = context.tick;
        context.tickEvents.emit({
          type: "attack_started",
          sourceId: actor.id,
          targetId: "player",
          style: queuedAttack.style,
          attackKind: queuedAttack.attackKind,
          impactDelayTicks: 3,
        });
      }
      return {
        npcAttacks: npcAttacks,
        environmentalDamages: [],
      };
    } else {
      return {
        npcAttacks: npcAttacks,
        environmentalDamages: [],
      };
    }
  },
  postTick: ({ actor: actor, config: config, context: context }) => {
    if (!actor.alive || !context.world.getPlayer()?.alive) {
      clearYamaAttackState(actor);
      return [];
    }
    actor.state.didPlanMelee = false;
    const attackMechanics = config.getMechanics();
    const beatInfo = getYamaBeatInfo(context.tick, config.attackPattern);
    if (
      (!attackMechanics.meleeEnabled && !attackMechanics.rangedMagicEnabled) ||
      !beatInfo.isBeat
    ) {
      return [];
    }
    const decision = yamaAttackPolicy.onTick(
      {
        self: actor,
        world: context.world,
        tick: context.tick,
      },
      actor.state.attackPolicy,
    );
    actor.state.attackPolicy = decision.nextState;
    const intent = decision.intent;
    if (!intent) {
      return [];
    }
    switch (intent.type) {
      case "face":
      case "idle":
        return [];
      case "attack":
        break;
      default:
        return (function (unexpectedIntent) {
          throw new TypeError(
            `Unexpected Yama attack intent: ${JSON.stringify(unexpectedIntent)}`,
          );
        })(intent);
    }
    if (intent.style === "melee") {
      if (attackMechanics.meleeEnabled) {
        actor.state.queuedAttack = {
          style: "melee",
          attackKind: intent.attackKind,
        };
        // Read by the encounter's post-tick in this same tick: a planned melee
        // cancels the beat's fireball burst (FireballRuntime.processPostTick) and
        // owes one void flare (VoidFlareCoordinator.processPostTick).
        actor.state.didPlanMelee = true;
      } else if (
        attackMechanics.rangedMagicEnabled &&
        beatInfo.fireballBeatKind !== "snap"
      ) {
        queueAlternatingAttack(actor.state);
      }
    } else if (attackMechanics.rangedMagicEnabled) {
      queueAlternatingAttack(actor.state);
    }
    return [];
  },
  attackTimer: ({ actor: actor, config: config, context: context }) => {
    const attackMechanics = config.getMechanics();
    if (attackMechanics.meleeEnabled || attackMechanics.rangedMagicEnabled) {
      if (actor.combat.targetId === null) {
        return null;
      } else {
        return {
          nextAttackTick: getNextYamaBeatTick(context.tick, config.attackPattern),
          attackSpeed: config.attackPattern.beatIntervalTicks,
        };
      }
    } else {
      return null;
    }
  },
  onDefeated: ({ actor: actor }) => clearYamaAttackState(actor),
});
function getYamaState(actor) {
  return yamaNpcDefinition.getState(actor);
}
function clearYamaAttackState(actor) {
  const state = yamaNpcDefinition.getState(actor);
  if (state) {
    state.queuedAttack = null;
    state.windup = null;
    state.latestAttackKind = null;
    state.latestAttackTick = null;
    state.didPlanMelee = false;
    state.alternatingAttackCount = 0;
  }
}
function queueAlternatingAttack(state) {
  const alternateStyle = state.openingStyle === "magic" ? "range" : "magic";
  const style = state.alternatingAttackCount % 2 == 0 ? state.openingStyle : alternateStyle;
  state.queuedAttack = {
    style: style,
    attackKind: getYamaAttackKind(style),
  };
  state.alternatingAttackCount += 1;
}
// The severity of the poison of Yama's melee (the engine's
// applyPoisonToPlayer takes `applyPoison` as a severity).
var yamaMeleePoisonSeverity = 100;
function buildYamaAttack(actor, attack, environment) {
  const { config: config } = environment;
  const isMelee = attack.style === "melee";
  return {
    attackerId: actor.id,
    targetId: "player",
    style: attack.style,
    attackKind: attack.attackKind,
    // A [minimum, maximum] range: the engine rolls it (resolveRolledDamage in
    // client/engine/damage.js).
    rolledDamage: isMelee ? config.meleeDamage : config.rangedMagicDamage,
    damageBonusPercent: config.wretchedStrength
      ? getMissingHpPercent(actor.vitals.hp, actor.vitals.maxHp)
      : undefined,
    accuracySucceeded: rollYamaAccuracy(actor, attack.style, environment),
    impactDelayTicks: isMelee ? 1 : 0,
    applyPoison: isMelee ? yamaMeleePoisonSeverity : undefined,
    prayerReduction: isMelee
      ? config.meleePrayerReduction
      : config.rangedMagicPrayerReduction,
    prayerCheckAt: isMelee ? "launch" : "impact",
    isContinuation: !isMelee,
    sourceDeathPolicy: isMelee ? "cancel-before-impact" : "persist",
  };
}
function rollYamaAccuracy(actor, style, environment) {
  const formulaStats = getDrainedNpcFormulaStats(actor);
  if (!formulaStats) {
    throw new TypeError("Yama cannot roll accuracy without formula stats");
  }
  const player = environment.world.getPlayer();
  if (!player) {
    throw new TypeError(
      "Yama cannot roll accuracy with no player in the world",
    );
  }
  const formulaStyle = style === "melee" ? "melee_slash" : style === "range" ? "ranged" : "magic";
  // The sandbox's free-for-all hands Yama a monster as the one he fights
  // (sandbox/encounter.js): its own stats then.
  const hitChance = player.kind !== "player"
    ? getNpcAttackAccuracy(formulaStats, getDrainedNpcFormulaStats(player), formulaStyle)
    : getNpcAttackAccuracy(
        formulaStats,
        getPlayerFormulaStats(player),
        formulaStyle,
        player.equipmentStats,
        getPrayerMultipliers(player.activePrayer, player.offensivePrayer),
      );
  return environment.config.accuracyRandom() < hitChance;
}
export { createYamaAttackPolicyState, yamaNpcDefinition, getYamaState };
