import { areFootprintsOverlapping } from "../../engine/attackRange.js";
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { isNpcInAttackRange, rollNpcAttack } from "../shared/npcAttack.js";
import { defineNpc, NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { activeOutcome, buildNpcProjectileVisual, scheduleNextActionTick } from "../shared/npcHelpers.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";

export const generalGraardorKind = "general_graardor";
export const generalGraardorMapSquare = { x: 44, y: 83 }; // CACHE: region 11347 (44 << 8 | 83), Bandos' Stronghold

export const graardorNpcTypeId = 2215; // CACHE, TABLE: General Graardor
export const strongstackNpcTypeId = 2216; // CACHE, TABLE: Sergeant Strongstack
export const steelwillNpcTypeId = 2217; // CACHE, TABLE: Sergeant Steelwill
export const grimspikeNpcTypeId = 2218; // CACHE, TABLE: Sergeant Grimspike

export const graardorActorId = "general_graardor";
export const strongstackActorId = "sergeant_strongstack";
export const steelwillActorId = "sergeant_steelwill";
export const grimspikeActorId = "sergeant_grimspike";

export const spawnMinionsKey = "graardorSpawnMinions";
export const healGraardorCommand = {
  encounter: generalGraardorKind,
  type: "heal-graardor",
};

// North "Shoot->door" tile of the 6:0 Altar-Door lane (x = 54), directly in front of the Bandos altar at (53..55, 58..60).
const playerStart = [54, 57]; // WIKI, OBS: Region 11347 Altar-Door north endpoint
const graardorStart = [52, 50]; // inferred: 4x4 footprint centered on the x = 54 Altar-Door lane (x: 52..55, y: 50..53)
const strongstackStart = [50, 46]; // OBS: world (2866, 5358, 2) -> local (50, 46)
const steelwillStart = [56, 40]; // OBS: world (2872, 5352, 2) -> local (56, 40)
const grimspikeStart = [50, 50]; // inferred: world (2868, 5362, 2) shifted 2 tiles west off the boss lane

const graardorSize = 4; // CACHE, TABLE
const minionSize = 1; // CACHE, TABLE
const southFacing = 0; // CACHE: 0 in 2048ths of a turn faces south
const northFacing = 1024; // CACHE: 1024 in 2048ths of a turn faces north

const graardorAttackSpeedTicks = 6; // WIKI, TABLE: 6 ticks (3.6 seconds)
const minionAttackSpeedTicks = 5; // WIKI, TABLE: 5 ticks (3.0 seconds)
const meleeAttackRange = 1; // WIKI: Graardor and Strongstack only attack from melee range
const rangedMagicMinionAttackRange = 16; // WIKI: Steelwill and Grimspike attack across the chamber

const graardorMeleeMaxHit = 60; // WIKI, TABLE
const graardorRangedMaxHit = 35; // WIKI: Shockwave ranged attack max hit 35
const strongstackMaxHit = 15; // WIKI, TABLE
const steelwillMaxHit = 16; // WIKI, TABLE
const grimspikeMaxHit = 21; // WIKI, TABLE

const graardorRangedChanceDenominator = 3; // WIKI: 1/3 chance to use ranged shockwave when in melee distance
const ticksFromDefeatToVictory = 7; // CACHE: seq 7020 is 125 cycles (~5 ticks) plus 2 ticks settle
const minionDespawnAfterDeathTicks = 5; // CACHE: seq 6156 is 80 cycles (~3 ticks) plus 2 ticks settle
const redXStallDurationTicks = 3; // WIKI, OBS: red-X object walk under Graardor stalls his movement/attack through exit shot

const graardorRangedProjectile = {
  spotAnimId: 1202, // CACHE: General Graardor shockwave projectile
  timing: {
    delay: 41, // inferred: standard GWD projectile launch delay in client cycles
    lengthAdjustment: 5, // inferred
    stepMultiplier: 5, // inferred
    progress: 64, // inferred
  },
  slope: 5, // inferred
  startHeight: 40, // inferred
  endHeight: 36, // inferred
};

const steelwillMagicCastSpotAnimId = 1216; // CACHE: Sergeant Steelwill magic cast graphic
const steelwillMagicProjectile = {
  spotAnimId: 1217, // CACHE: Sergeant Steelwill magic projectile
  timing: {
    delay: 41, // inferred
    lengthAdjustment: 5, // inferred
    stepMultiplier: 5, // inferred
    progress: 64, // inferred
  },
  slope: 12, // inferred
  startHeight: 43, // inferred
  endHeight: 36, // inferred
};

const grimspikeRangedProjectile = {
  spotAnimId: 1220, // CACHE: Sergeant Grimspike ranged projectile
  timing: {
    delay: 41, // inferred
    lengthAdjustment: 5, // inferred
    stepMultiplier: 5, // inferred
    progress: 64, // inferred
  },
  slope: 10, // inferred
  startHeight: 40, // inferred
  endHeight: 36, // inferred
};

function isRedXObjectTile(tile) {
  if (!Array.isArray(tile) || tile.length < 2) {
    return false;
  }
  const [x, y] = tile;
  // Big door at (47, 42) on the west wall, or Bandos altar at (53..55, 58..60) on the north wall (CACHE).
  return (x === 47 && y === 42) || (x >= 53 && x <= 55 && y >= 58 && y <= 60);
}

const graardorDefinition = defineNpc({
  id: "general-graardor-boss",
  move: ({ actor, context, config }) => {
    if (!config.isFightActive() || config.isRedXStalled(context.tick)) {
      return [];
    }
    return getNpcPursuitMoves(actor, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!config.isFightActive() || config.isRedXStalled(context.tick)) {
      return idle;
    }
    const player = context.world.getPlayer();
    if (
      context.tick < actor.combat.nextActionTick ||
      !player.alive ||
      actor.combat.startedTurnOverlappingTarget
    ) {
      return idle;
    }
    // WIKI: General Graardor only attacks when within melee range (1 tile), even for his ranged attack.
    if (!isNpcInAttackRange(actor, player, meleeAttackRange)) {
      return idle;
    }
    const useRanged = Math.floor(context.random() * graardorRangedChanceDenominator) === 0;
    const plan = useRanged
      ? {
          formulaStyle: "ranged",
          damageType: "range",
          attackKind: "range_arrow",
          maxHit: graardorRangedMaxHit,
          projectile: graardorRangedProjectile.timing,
          sourceDeathPolicy: "cancel-before-impact",
        }
      : {
          formulaStyle: "melee_crush",
          damageType: "melee",
          attackKind: "melee_crush",
          maxHit: graardorMeleeMaxHit,
          impactDelayTicks: 0,
          sourceDeathPolicy: "cancel-before-impact",
        };
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan,
      random: context.random,
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: useRanged ? "ranged" : "melee",
      kind: useRanged ? "graardor_ranged" : "graardor_melee",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: useRanged
        ? [buildNpcProjectileVisual(actor, player, graardorRangedProjectile)]
        : [],
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, graardorAttackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

const strongstackDefinition = defineNpc({
  id: "general-graardor-strongstack",
  move: ({ actor, context, config }) => {
    if (!config.isFightActive()) {
      return [];
    }
    return getNpcPursuitMoves(actor, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!config.isFightActive()) {
      return idle;
    }
    const player = context.world.getPlayer();
    if (
      context.tick < actor.combat.nextActionTick ||
      !player.alive ||
      actor.combat.startedTurnOverlappingTarget
    ) {
      return idle;
    }
    if (!isNpcInAttackRange(actor, player, actor.combat.attackRange)) {
      return idle;
    }
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: "melee_crush",
        damageType: "melee",
        attackKind: "melee_crush",
        maxHit: strongstackMaxHit,
        impactDelayTicks: 0,
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "strongstack_melee",
      impactDelayTicks: 0,
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, minionAttackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

const steelwillDefinition = defineNpc({
  id: "general-graardor-steelwill",
  move: ({ actor, context, config }) => {
    if (!config.isFightActive()) {
      return [];
    }
    return getNpcPursuitMoves(actor, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!config.isFightActive()) {
      return idle;
    }
    const player = context.world.getPlayer();
    if (
      context.tick < actor.combat.nextActionTick ||
      !player.alive ||
      actor.combat.startedTurnOverlappingTarget
    ) {
      return idle;
    }
    if (!isNpcInAttackRange(actor, player, actor.combat.attackRange)) {
      return idle;
    }
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: "magic",
        damageType: "magic",
        attackKind: "magic_fire",
        maxHit: steelwillMaxHit,
        projectile: steelwillMagicProjectile.timing,
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    emitInfernoVisual(context.tickEvents, {
      animations: [],
      projectiles: [],
      graphics: [
        {
          spotAnimId: steelwillMagicCastSpotAnimId,
          target: {
            kind: "actor",
            actorId: actor.id,
            size: actor.size,
            position: [...actor.position],
          },
          height: 100, // inferred: chest height cast graphic
          delayCycles: 0,
        },
      ],
    });
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "steelwill_magic",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: [buildNpcProjectileVisual(actor, player, steelwillMagicProjectile)],
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, minionAttackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

const grimspikeDefinition = defineNpc({
  id: "general-graardor-grimspike",
  move: ({ actor, context, config }) => {
    if (!config.isFightActive()) {
      return [];
    }
    return getNpcPursuitMoves(actor, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!config.isFightActive()) {
      return idle;
    }
    const player = context.world.getPlayer();
    if (
      context.tick < actor.combat.nextActionTick ||
      !player.alive ||
      actor.combat.startedTurnOverlappingTarget
    ) {
      return idle;
    }
    if (!isNpcInAttackRange(actor, player, actor.combat.attackRange)) {
      return idle;
    }
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: "ranged",
        damageType: "range",
        attackKind: "range_arrow",
        maxHit: grimspikeMaxHit,
        projectile: grimspikeRangedProjectile.timing,
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "grimspike_ranged",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: [buildNpcProjectileVisual(actor, player, grimspikeRangedProjectile)],
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, minionAttackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

function buildNpcActor({
  definition,
  id,
  role,
  npcTypeId,
  archetypeId,
  size,
  position,
  facing,
  attackSpeed,
  attackRange,
  attackStyle,
}) {
  const hp = getMonsterHitpoints(npcTypeId);
  const formulaStats = getMonsterFormulaStats(npcTypeId);
  if (hp === null || !formulaStats) {
    throw new TypeError(`Monster table has no entry for NPC type ${npcTypeId}`);
  }
  return definition.createActor(
    {
      id,
      kind: "npc",
      role,
      npcTypeId,
      archetypeId,
      size,
      alive: true,
      position: [...position],
      previousPosition: [...position],
      facing,
      passThruNpcs: true,
      history: new Map(),
      vitals: { hp, maxHp: hp },
      formulaStats,
      combat: {
        attackSpeed,
        attackRange,
        attackStyle,
        nextActionTick: 0,
        targetId: "player",
        lastAttackTick: null,
        animations: { attack: null, defend: null, death: null, idle: null, walk: null },
      },
    },
    {},
  );
}

export class GeneralGraardorEncounter {
  kind = generalGraardorKind;
  runStartMechanicsKeys = [spawnMinionsKey];
  encounterSeed = 1;
  random = createSeededRandom(1);
  outcome = activeOutcome;
  spawnMinions = true;
  currentTick = 0;
  redXStallUntilTick = -1;
  definitions;

  constructor() {
    const config = {
      isFightActive: () => this.outcome.phase === "active",
      isRedXStalled: (tick) => tick <= this.redXStallUntilTick,
    };
    this.definitions = new NpcDefinitionRegistry([
      graardorDefinition.register(config),
      strongstackDefinition.register(config),
      steelwillDefinition.register(config),
      grimspikeDefinition.register(config),
    ]);
    this.reset();
  }

  reset(seeds) {
    this.encounterSeed =
      seeds?.encounterSeed ?? (Math.floor(Math.random() * 4294967296) >>> 0 || 1);
    this.random = createSeededRandom(this.encounterSeed);
    this.outcome = activeOutcome;
    this.currentTick = 0;
    this.redXStallUntilTick = -1;
  }

  getSeeds() {
    return { encounterSeed: this.encounterSeed };
  }

  getNpcDefinitions() {
    return this.definitions;
  }

  getDefaultMechanicsConfig() {
    return { [spawnMinionsKey]: true };
  }

  configureRunStart(mechanics) {
    this.spawnMinions = mechanics[spawnMinionsKey] !== false;
  }

  getDefaultPlayerStart() {
    return [...playerStart];
  }

  getIntroConfig() {
    return null;
  }

  getArenaConfig() {
    return { bounds: null, collisionMap: null, walkableTiles: null };
  }

  getEngineRules() {
    return {
      multiCombat: true,
    };
  }

  createNpcs() {
    const npcs = [
      buildNpcActor({
        definition: graardorDefinition,
        id: graardorActorId,
        role: "boss",
        npcTypeId: graardorNpcTypeId,
        archetypeId: "general_graardor",
        size: graardorSize,
        position: graardorStart,
        facing: northFacing,
        attackSpeed: graardorAttackSpeedTicks,
        attackRange: meleeAttackRange,
        attackStyle: "melee",
      }),
    ];
    if (this.spawnMinions) {
      npcs.push(
        buildNpcActor({
          definition: strongstackDefinition,
          id: strongstackActorId,
          role: "minion",
          npcTypeId: strongstackNpcTypeId,
          archetypeId: "sergeant_strongstack",
          size: minionSize,
          position: strongstackStart,
          facing: northFacing,
          attackSpeed: minionAttackSpeedTicks,
          attackRange: meleeAttackRange,
          attackStyle: "melee",
        }),
        buildNpcActor({
          definition: steelwillDefinition,
          id: steelwillActorId,
          role: "minion",
          npcTypeId: steelwillNpcTypeId,
          archetypeId: "sergeant_steelwill",
          size: minionSize,
          position: steelwillStart,
          facing: northFacing,
          attackSpeed: minionAttackSpeedTicks,
          attackRange: rangedMagicMinionAttackRange,
          attackStyle: "magic",
        }),
        buildNpcActor({
          definition: grimspikeDefinition,
          id: grimspikeActorId,
          role: "minion",
          npcTypeId: grimspikeNpcTypeId,
          archetypeId: "sergeant_grimspike",
          size: minionSize,
          position: grimspikeStart,
          facing: southFacing,
          attackSpeed: minionAttackSpeedTicks,
          attackRange: rangedMagicMinionAttackRange,
          attackStyle: "range",
        }),
      );
    }
    return npcs;
  }

  resolveHazards(context) {
    this.currentTick = context.tick;
    this.lastWorld = context.world;
    return [];
  }

  moveDisplacedPlayer(player, targetTile, _teleportPlayer, playerStep) {
    const graardor = this.lastWorld?.getNpc(graardorActorId);
    if (
      graardor?.alive &&
      player.attackTarget === null &&
      isRedXObjectTile(targetTile) &&
      areFootprintsOverlapping(graardor, {
        position: playerStep.position,
        size: player.size,
      })
    ) {
      this.redXStallUntilTick = Math.max(
        this.redXStallUntilTick,
        this.currentTick + redXStallDurationTicks,
      );
    }
    return undefined;
  }

  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }

  onNpcDefeated(defeat, _context, completionOwnership) {
    if (defeat.npcId !== graardorActorId || completionOwnership !== "encounter-owned") {
      return;
    }
    // Defeating General Graardor completes the fight even if the bodyguard minions are still alive.
    this.outcome = {
      phase: "resolving",
      decisiveTick: defeat.tick,
      completionTick: defeat.tick + ticksFromDefeatToVictory,
      primaryActorId: graardorActorId,
      completionActorIds: [
        graardorActorId,
        strongstackActorId,
        steelwillActorId,
        grimspikeActorId,
      ],
    };
  }

  processPostTick(context) {
    for (const minionId of [strongstackActorId, steelwillActorId, grimspikeActorId]) {
      const minion = context.world.getNpc(minionId);
      if (
        minion &&
        !minion.alive &&
        minion.death &&
        context.tick >= minion.death.killTick + minionDespawnAfterDeathTicks
      ) {
        context.despawnNpc(minionId);
      }
    }
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) {
      this.outcome = { ...this.outcome, phase: "victory" };
    }
    return [];
  }

  executeCommand(command, context) {
    if (command.type !== healGraardorCommand.type) {
      return null;
    }
    const graardor = context.world.getNpc(graardorActorId);
    if (!graardor?.alive) {
      return null;
    }
    graardor.vitals = { ...graardor.vitals, hp: graardor.vitals.maxHp };
    return { gameEvents: [] };
  }

  getOutcome() {
    return this.outcome;
  }

  getSnapshot() {
    return {
      kind: this.kind,
      state: {
        spawnMinions: this.spawnMinions,
        redXStallUntilTick: this.redXStallUntilTick,
      },
      visuals: {},
    };
  }

  getNpcDamageSourceLabel(npcId) {
    switch (npcId) {
      case graardorActorId:
        return "General Graardor";
      case strongstackActorId:
        return "Sergeant Strongstack";
      case steelwillActorId:
        return "Sergeant Steelwill";
      case grimspikeActorId:
        return "Sergeant Grimspike";
      default:
        return "General Graardor";
    }
  }
}

export const generalGraardorDefinition = {
  kind: generalGraardorKind,
  factory: () => new GeneralGraardorEncounter(),
  descriptor: {
    kind: generalGraardorKind,
    displayName: "General Graardor",
    description:
      "Bandos' Stronghold boss fight with Sergeant Strongstack, Sergeant Steelwill, and Sergeant Grimspike. Practice the 6:0 Altar-Door red-X method and minion tanking.",
    mapSquare: generalGraardorMapSquare,
    playerStart,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: playerStart },
    victory: {
      title: "VICTORY",
      narrative: "GENERAL GRAARDOR DEFEATED",
      accent: "gold",
    },
  },
  controls: {
    defaultMechanicsConfig: { [spawnMinionsKey]: true },
    mechanicsToggles: [
      { key: spawnMinionsKey, label: "Spawn bodyguard minions", setup: true },
    ],
    debugActions: [
      { command: healGraardorCommand, label: "Heal General Graardor" },
    ],
  },
};
