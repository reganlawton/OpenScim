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

export const startModeKey = "graardorStartMode";
export const startModeAltarDoor = "altar_door";
export const startModeStandardDoor = "standard_door";
export const startModeSixZero = "six_zero";
export const spawnMinionsKey = "graardorSpawnMinions";
export const healGraardorCommand = {
  encounter: generalGraardorKind,
  type: "heal-graardor",
};

// North "Shoot->door" tile of the Altar-Door lane (x = 54), directly in front of the Bandos altar at (53..55, 58..60).
export const altarDoorPlayerStart = [54, 57]; // WIKI, OBS: Region 11347 Altar-Door north endpoint
export const altarDoorGraardorStart = [52, 50]; // inferred: 4x4 footprint centered on the x = 54 Altar-Door lane (x: 52..55, y: 50..53)
export const altarDoorGrimspikeStart = [50, 50]; // inferred: world (2868, 5362, 2) shifted 2 tiles west off the boss lane

// Standard room entry: player steps through the Big door at (47, 42) onto (48, 42) while General Graardor and his bodyguards stand at their default spawns.
export const standardDoorPlayerStart = [48, 42]; // WIKI, OBS: world (2864, 5354, 2) -> local (48, 42), inside the west Big door
export const standardGraardorStart = [56, 47]; // OBS: world (2872, 5359, 2) -> local (56, 47), default Bandos room spawn
export const standardGrimspikeStart = [52, 50]; // OBS: world (2868, 5362, 2) -> local (52, 50)
export const sixZeroPlayerStart = [57, 40]; // OBS: user-supplied RuneLite region 11347, plane 2 marker labelled "start"

const strongstackStart = [50, 46]; // OBS: world (2866, 5358, 2) -> local (50, 46)
const steelwillStart = [56, 40]; // OBS: world (2872, 5352, 2) -> local (56, 40)

const graardorSize = 4; // CACHE, TABLE
const minionSize = 1; // CACHE, TABLE
const southFacing = 0; // CACHE: 0 in 2048ths of a turn faces south
const westFacing = 512; // CACHE: 512 in 2048ths of a turn faces west
const northFacing = 1024; // CACHE: 1024 in 2048ths of a turn faces north

const graardorAttackSpeedTicks = 6; // WIKI, TABLE: 6 ticks (3.6 seconds)
const minionAttackSpeedTicks = 5; // WIKI, TABLE: 5 ticks (3.0 seconds)
const meleeAttackRange = 1; // WIKI: Graardor and Strongstack only attack from melee range
const rangedMagicMinionAttackRange = 16; // WIKI: Steelwill and Grimspike attack across the chamber

const graardorMeleeMaxHit = 60; // WIKI, TABLE
const graardorRangedMaxHit = 35; // WIKI: Shockwave ranged attack max hit 35
const graardorRangedMinHit = 15; // WIKI: General Graardor, Mod Ash (23 October 2018): uniform 15–35 inclusive on a successful hit
const strongstackMaxHit = 15; // WIKI, TABLE
const steelwillMaxHit = 15; // WIKI: Sergeant Steelwill magic max hit (https://oldschool.runescape.wiki/w/Sergeant_Steelwill)
const grimspikeMaxHit = 21; // WIKI, TABLE

const graardorRangedChanceDenominator = 3; // WIKI: 1/3 chance to use ranged shockwave when in melee distance
const ticksFromDefeatToVictory = 7; // CACHE: seq 7020 is 125 cycles (~5 ticks) plus 2 ticks settle
const minionDespawnAfterDeathTicks = 5; // CACHE: seq 6156 is 80 cycles (~3 ticks) plus 2 ticks settle

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

function getStartMode(mechanics) {
  const mode = mechanics?.[startModeKey];
  return mode === startModeAltarDoor || mode === startModeSixZero ? mode : startModeStandardDoor;
}

function getGraardorStartForMode(standardDoor) {
  return standardDoor ? standardGraardorStart : altarDoorGraardorStart;
}

function getGrimspikeStartForMode(standardDoor) {
  return standardDoor ? standardGrimspikeStart : altarDoorGrimspikeStart;
}

function isRedXObjectTile(tile) {
  if (!Array.isArray(tile) || tile.length < 2) {
    return false;
  }
  const [x, y] = tile;
  // Big door at (47, 41..43) on the west wall, or Bandos altar at (53..55, 58..60) on the north wall (CACHE).
  return (x === 47 && y >= 41 && y <= 43) || (x >= 53 && x <= 55 && y >= 58 && y <= 60);
}

const graardorDefinition = defineNpc({
  id: "general-graardor-boss",
  move: ({ actor, context, config }) => {
    if (!config.isFightActive() || config.isRedXStalled(actor, context)) {
      return [];
    }
    return getNpcPursuitMoves(actor, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!config.isFightActive() || config.isRedXStalled(actor, context)) {
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
          minHit: graardorRangedMinHit,
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
  runStartMechanicsKeys = [startModeKey, spawnMinionsKey];
  encounterSeed = 1;
  random = createSeededRandom(1);
  outcome = activeOutcome;
  standardDoorStart = true;
  startMode = startModeStandardDoor;
  spawnMinions = true;
  redXInteractionActive = false;
  definitions;

  constructor() {
    const config = {
      isFightActive: () => this.outcome.phase === "active",
      // WIKI: https://oldschool.runescape.wiki/w/Red-X — suppress pathfinding
      // while underneath with a Red-X interaction active. No timed exit grace.
      isRedXStalled: (actor, context) =>
        this.redXInteractionActive && areFootprintsOverlapping(actor, context.world.getPlayer()),
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
    this.redXInteractionActive = false;
  }

  getSeeds() {
    return { encounterSeed: this.encounterSeed };
  }

  getNpcDefinitions() {
    return this.definitions;
  }

  getDefaultMechanicsConfig() {
    return {
      [startModeKey]: startModeStandardDoor,
      [spawnMinionsKey]: true,
    };
  }

  configureRunStart(mechanics, runStartContext) {
    const previousStartMode = this.startMode;
    const previousSpawnMinions = this.spawnMinions;
    this.startMode = getStartMode(mechanics);
    // Inferred: 6:0 uses the normal room spawns; only Altar-Door pre-aligns the boss.
    this.standardDoorStart = this.startMode !== startModeAltarDoor;
    this.spawnMinions = mechanics[spawnMinionsKey] !== false;
    if (!runStartContext) {
      return;
    }
    const existingGraardor = runStartContext.world.getNpc(graardorActorId);
    if (!existingGraardor) {
      return;
    }
    if (previousStartMode !== this.startMode) {
      runStartContext.placePlayer(this.getDefaultPlayerStart(mechanics));
      const graardorPos = getGraardorStartForMode(this.standardDoorStart);
      existingGraardor.position = [...graardorPos];
      existingGraardor.previousPosition = [...graardorPos];
      existingGraardor.facing = this.standardDoorStart ? westFacing : northFacing;
      existingGraardor.history.clear();
      existingGraardor.history.set(0, [...graardorPos]);
      const existingGrimspike = runStartContext.world.getNpc(grimspikeActorId);
      if (existingGrimspike) {
        const grimspikePos = getGrimspikeStartForMode(this.standardDoorStart);
        existingGrimspike.position = [...grimspikePos];
        existingGrimspike.previousPosition = [...grimspikePos];
        existingGrimspike.history.clear();
        existingGrimspike.history.set(0, [...grimspikePos]);
      }
      runStartContext.world.occupancy.syncActors(runStartContext.world.actors.values());
    }
    if (previousSpawnMinions !== this.spawnMinions) {
      for (const minionId of [strongstackActorId, steelwillActorId, grimspikeActorId]) {
        runStartContext.despawnNpc(minionId);
      }
      if (this.spawnMinions) {
        for (const minion of this.createMinionNpcs()) {
          runStartContext.spawnNpc(minion);
        }
      }
    }
  }

  getDefaultPlayerStart(mechanics = {}) {
    if (getStartMode(mechanics) === startModeSixZero) return [...sixZeroPlayerStart];
    return getStartMode(mechanics) === startModeStandardDoor
      ? [...standardDoorPlayerStart]
      : [...altarDoorPlayerStart];
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

  createMinionNpcs() {
    return [
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
        position: getGrimspikeStartForMode(this.standardDoorStart),
        facing: southFacing,
        attackSpeed: minionAttackSpeedTicks,
        attackRange: rangedMagicMinionAttackRange,
        attackStyle: "range",
      }),
    ];
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
        position: getGraardorStartForMode(this.standardDoorStart),
        facing: this.standardDoorStart ? westFacing : northFacing,
        attackSpeed: graardorAttackSpeedTicks,
        attackRange: meleeAttackRange,
        attackStyle: "melee",
      }),
    ];
    if (this.spawnMinions) {
      npcs.push(...this.createMinionNpcs());
    }
    return npcs;
  }

  resolveHazards(context) {
    const player = context.world.getPlayer();
    // Resolve the current destination after queued inputs, before Graardor's
    // turn. Attacking or choosing another destination cancels the interaction.
    // Inferred: door/altar destinations represent the existing object-click path.
    this.redXInteractionActive = player.attackTarget === null && isRedXObjectTile(context.inputs.targetTile);
    return [];
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
        startMode: this.startMode,
        spawnMinions: this.spawnMinions,
        redXInteractionActive: this.redXInteractionActive,
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
      "Bandos' Stronghold boss fight with Sergeant Strongstack, Sergeant Steelwill, and Sergeant Grimspike. Practice standard door entry, the Altar-Door red-X method, or 6:0 ranged kiting.",
    mapSquare: generalGraardorMapSquare,
    playerStart: standardDoorPlayerStart,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: standardDoorPlayerStart },
    victory: {
      title: "VICTORY",
      narrative: "GENERAL GRAARDOR DEFEATED",
      accent: "gold",
    },
  },
  controls: {
    defaultMechanicsConfig: {
      [startModeKey]: startModeStandardDoor,
      [spawnMinionsKey]: true,
    },
    mechanicsToggles: [
      {
        key: startModeKey,
        label: "Starting Position",
        compactLabel: "Start",
        setup: true,
        choices: [
          {
            value: startModeStandardDoor,
            label: "Standard",
          },
          {
            value: startModeAltarDoor,
            label: "Altar-Door",
          },
          {
            value: startModeSixZero,
            label: "6:0",
          },
        ],
        info: "Standard starts at the west Big door. Altar-Door starts at the north altar tile with General Graardor aligned on the central lane. 6:0 starts on the southeast start marker with the normal room spawns. Altar-Door and 6:0 have separate tile marker presets.",
      },
      { key: spawnMinionsKey, label: "Spawn bodyguard minions", setup: true },
    ],
    debugActions: [
      { command: healGraardorCommand, label: "Heal General Graardor" },
    ],
  },
};
