import { scheduleNextActionTick } from "../encounters/shared/npcHelpers.js";
// True when the NPC already targets the attacker and its next action is
// still to come or was due no more than 8 ticks ago. An attack then does not
// delay its next action (delayNextActionForRetaliation).
function isAlreadyFightingSource(combat, tick, sourceId) {
  // An aggressive NPC can acquire a target before its first combat exchange.
  // Opt in so encounters with pre-existing retaliation rules stay unchanged.
  if (
    combat.retaliation?.startsOutOfCombat === true &&
    combat.lastAttackTick === null &&
    combat.retaliation.lastIncomingAttackTick === null
  ) {
    return false;
  }
  return combat.targetId === sourceId && combat.nextActionTick + 8 >= tick;
}
function delayNextActionForRetaliation(combat, tick, sourceId) {
  if (isAlreadyFightingSource(combat, tick, sourceId)) {
    return false;
  }
  combat.nextActionTick = Math.max(combat.nextActionTick, tick + Math.floor(combat.attackSpeed / 2));
  return true;
}
function getStandardRetaliationTick(pendingHit) {
  if (pendingHit.style !== "magic" || pendingHit.accuracySucceeded) {
    return pendingHit.impactTick;
  } else {
    return pendingHit.launchTick + 1;
  }
}
function scheduleNpcRetaliation(npc, pendingHit) {
  if (!npc.alive || !npc.combat.retaliation) {
    return;
  }
  let retaliationTick;
  switch (npc.combat.retaliation.mode) {
    case "standard":
      retaliationTick = getStandardRetaliationTick(pendingHit);
      break;
    case "retarget":
    case "one-tick":
      retaliationTick =
        pendingHit.style !== "magic" || pendingHit.accuracySucceeded
          ? pendingHit.impactTick
          : pendingHit.launchTick;
      break;
    default: {
      const mode = npc.combat.retaliation.mode;
      throw new TypeError(`Unknown retaliation mode: ${mode}`);
    }
  }
  if (retaliationTick > pendingHit.launchTick) {
    npc.combat.retaliation.pending.push({
      tick: retaliationTick,
      sourceId: pendingHit.sourceId,
    });
  } else {
    applyNpcRetaliation(npc, pendingHit.sourceId, retaliationTick);
  }
}
function resolvePendingRetaliations(world) {
  for (const npc of world.getNpcs()) {
    const retaliation = npc.combat.retaliation;
    if (!retaliation) {
      continue;
    }
    const pending = retaliation.pending;
    retaliation.pending = [];
    if (npc.alive) {
      for (const entry of pending) {
        if (entry.tick > world.tick) {
          retaliation.pending.push(entry);
        } else if (world.actors.get(entry.sourceId)?.alive) {
          applyNpcRetaliation(npc, entry.sourceId, world.tick);
        }
      }
    }
  }
}
function applyNpcRetaliation(npc, sourceId, tick) {
  const retaliation = npc.combat.retaliation;
  if (retaliation) {
    switch (retaliation.mode) {
      case "standard":
        delayNextActionForRetaliation(npc.combat, tick, sourceId);
        break;
      case "one-tick":
        scheduleNextActionTick(npc.combat, tick, 1);
        break;
      case "retarget":
        break;
      default: {
        const mode = retaliation.mode;
        throw new Error(`Unknown retaliation mode: ${mode}`);
      }
    }
    retaliation.lastIncomingAttackTick = tick;
    npc.combat.targetId = sourceId;
  }
}
export { scheduleNpcRetaliation, resolvePendingRetaliations };
