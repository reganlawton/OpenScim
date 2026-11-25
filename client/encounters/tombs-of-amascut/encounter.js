// The Tombs of Amascut are written in client/toa/: its nexus and Zebak. This
// directory only registers them (encounters/registry.js finds an encounter by
// its encounter.js). Zebak's definition is built from the rules of the engine
// and of the other encounters that are handed to it here.
import { zebakDefinition } from "/toa/zebak/native.js";
import { nexusDefinition } from "/toa/nexus.js";
import { getArenaWalkableTiles } from "../../engine/arena.js";
import { CollisionFlag, createCollisionMap } from "../../engine/collision.js";
import { createSeededRandom } from "../../engine/random.js";
import { startScriptedNpcDeath } from "../../engine/npcState.js";
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildNpcProjectileVisual } from "../shared/npcHelpers.js";
import { emitInfernoVisual, emitInfernoNpcAttack } from "../inferno/events.js";

export const definitions = [
  zebakDefinition({makeCollision:createCollisionMap,solidFlag:CollisionFlag.OBJECT,walkable:getArenaWalkableTiles,stats:getMonsterFormulaStats, seedRandom:createSeededRandom, rollAttack:rollNpcAttack, showAttack:emitInfernoNpcAttack, projectile:buildNpcProjectileVisual, animate:emitInfernoVisual, startNpcDeath:startScriptedNpcDeath}),
  nexusDefinition,
];
export const order = 10;
