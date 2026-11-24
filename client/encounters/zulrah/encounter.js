// Zulrah encounter: 4 OSRS rotations, Magma melee slams, Jad alternation, Snakelings, Toxic clouds, and Venom.
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { defineNpc, NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildNpcProjectileVisual, scheduleNextActionTick } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { zulrahRotations, zulrahSpots } from "./rotations.js";

export const zulrahKind = "zulrah";

// Zulrah's Shrine spans map squares (35, 47) [region 9007] and (35, 48) [region 9008].
export const zulrahMapSquare = { x: 35, y: 47 };
export const zulrahMapSquareOffsets = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: 1 },
];

// World (2268, 3068) relative to (35, 47) -> [28, 60] (south-center of the shrine).
const playerStart = [28, 60];
export const zulrahCenterStart = zulrahSpots.CENTER;

export const zulrahActorId = "zulrah";
export const zulrahNpcIds = {
  serpentine: 2042,
  magma: 2043,
  tanzanite: 2044,
  snakelingMelee: 2045,
  snakelingMagic: 2046,
};

export const zulrahSeqIds = {
  idle: 5070,
  shoot: 5069,
  submerge: 5072,
  emerge: 5073,
  meleeFocus: 5806,
  meleeAttack: 5807,
};

export const zulrahSpotIds = {
  rangedProjectile: 1044,
  toxicCloud: 1045,
  magicProjectile: 1046,
  snakelingSpawn: 1047,
};

const zulrahSize = 5;
const attackSpeedTicks = 3; // WIKI: Zulrah attacks every 3 ticks (1.8s) during ranged/magic/jad phases.
const cloudCadenceTicks = 3; // WIKI/OBS: Toxic cloud volleys & snakeling spawns occur every 3 ticks.
const cloudTravelTicks = 2; // WIKI/OBS: Toxic clouds land ~2 ticks after Zulrah spits them.
const submergeDurationTicks = 2; // WIKI/OBS: Dive anim (5072) plays into phase transition without snapping back to idle.
const emergeDurationTicks = 4; // WIKI: Zulrah surfaces (~4 ticks) before its first action.
const toxicCloudDurationTicks = 17; // WIKI: Toxic clouds linger ~10s (~17 ticks) before dissipating.
const venomVarpSeverity = 1000000; // Engine VENOM_VARP_THRESHOLD.
const ticksFromDefeatToVictory = 4;

export const zulrahRotationKey = "zulrahRotation";
export const zulrahTrainingOverlayKey = "zulrahTrainingOverlay";
export const zulrahSnakelingsKey = "zulrahSnakelings";
export const zulrahToxicCloudsKey = "zulrahToxicClouds";

export const nextPhaseCommand = { encounter: zulrahKind, type: "next-phase" };
export const resetRotationCommand = { encounter: zulrahKind, type: "reset-rotation" };
export const jumpToJadCommand = { encounter: zulrahKind, type: "jump-to-jad" };

const rangedProjectile = {
  spotAnimId: zulrahSpotIds.rangedProjectile,
  timing: { delay: 41, lengthAdjustment: 0, stepMultiplier: 5, progress: 0 },
  slope: 16,
  startHeight: 43,
  endHeight: 31,
};

const magicProjectile = {
  spotAnimId: zulrahSpotIds.magicProjectile,
  timing: { delay: 41, lengthAdjustment: 0, stepMultiplier: 5, progress: 0 },
  slope: 16,
  startHeight: 43,
  endHeight: 31,
};

function formToNpcTypeId(form) {
  if (form === "magma") return zulrahNpcIds.magma;
  if (form === "tanzanite") return zulrahNpcIds.tanzanite;
  return zulrahNpcIds.serpentine;
}

function faceTile(actor, targetTile) {
  if (!actor || !targetTile) return;
  const cx = actor.position[0] + (actor.size ? (actor.size - 1) / 2 : 2);
  const cy = actor.position[1] + (actor.size ? (actor.size - 1) / 2 : 2);
  const dx = targetTile[0] - cx;
  const dy = targetTile[1] - cy;
  if (dx === 0 && dy === 0) return;
  const radians = Math.atan2(-dx, -dy);
  actor.facing = ((Math.round(radians * (2048 / (2 * Math.PI))) % 2048) + 2048) % 2048;
}

const zulrahBossNpc = defineNpc({
  id: "zulrah-boss",
  move: false,
  tick: ({ actor, context, config }) => {
    const encounter = config.getEncounter();
    return encounter.tickBoss(actor, context);
  },
});

const snakelingNpc = defineNpc({
  id: "zulrah-snakeling",
  tick: ({ actor, context }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!actor.alive || !player.alive) return idle;
    if (context.tick < actor.combat.nextActionTick) return idle;

    const isMagic = actor.npcTypeId === zulrahNpcIds.snakelingMagic;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: isMagic ? "magic" : "melee",
        damageType: isMagic ? "magic" : "melee",
        attackKind: isMagic ? "magic_fire" : "melee_crush",
        maxHit: 15, // WIKI: Snakelings hit up to 15.
        projectile: isMagic ? magicProjectile.timing : null,
        prayerCheckAt: "launch",
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    if (!npcAttack) return idle;

    if (npcAttack.baseDamage > 0) {
      npcAttack.applyPoison = venomVarpSeverity;
    }

    faceTile(actor, player.position);
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: isMagic ? "snakeling_magic" : "snakeling_melee",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: isMagic ? [buildNpcProjectileVisual(actor, player, magicProjectile)] : [],
    });

    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, 4);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

class ZulrahEncounter {
  kind = zulrahKind;
  runStartMechanicsKeys = [zulrahRotationKey, zulrahSnakelingsKey, zulrahToxicCloudsKey];

  constructor() {
    this.definitions = new NpcDefinitionRegistry([
      zulrahBossNpc.register({ getEncounter: () => this }),
      snakelingNpc.register({}),
    ]);
    this.reset();
  }

  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.rotation = 1;
    this.phaseIndex = 0;
    this.phaseState = "emerging";
    this.stateUntilTick = emergeDurationTicks;
    this.phaseAttackCount = 0;
    this.phaseActions = [];
    this.pendingClouds = [];
    this.pendingMeleeTarget = null;
    this.meleeWindupEndTick = null;
    this.activeClouds = [];
    this.pendingSnakelings = [];
    this.snakelingCounter = 0;
    this.spawnedSnakelingIds = [];
    this.snakelingsEnabled = true;
    this.toxicCloudsEnabled = true;
    this.lastCloudDamageTick = -10;
  }

  getSeeds() {
    return { encounterSeed: this.seed };
  }

  getDefaultMechanicsConfig() {
    return {
      [zulrahRotationKey]: "random",
      [zulrahTrainingOverlayKey]: true,
      [zulrahSnakelingsKey]: true,
      [zulrahToxicCloudsKey]: true,
    };
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

  configureRunStart(mechanics) {
    const choice = mechanics?.[zulrahRotationKey] ?? "random";
    if (choice === "random") {
      this.rotation = 1 + Math.floor(this.random() * 4);
    } else {
      this.rotation = Number(choice) || 1;
    }
    this.snakelingsEnabled = mechanics?.[zulrahSnakelingsKey] ?? true;
    this.toxicCloudsEnabled = mechanics?.[zulrahToxicCloudsKey] ?? true;
    this.phaseIndex = 0;
    this.phaseState = "emerging";
    this.stateUntilTick = emergeDurationTicks;
    this.phaseAttackCount = 0;
    this.phaseActions = [];
    this.pendingClouds = [];
    this.pendingMeleeTarget = null;
    this.meleeWindupEndTick = null;
    this.activeClouds = [];
    this.pendingSnakelings = [];
  }

  getCurrentPhase() {
    const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
    return phases[this.phaseIndex % phases.length];
  }

  getNextPhase() {
    const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
    const nextIdx = this.phaseIndex + 1 >= phases.length ? 1 : this.phaseIndex + 1;
    return phases[nextIdx];
  }

  createNpcs() {
    const phase = this.getCurrentPhase();
    const npcTypeId = formToNpcTypeId(phase.form);
    const hitpoints = getMonsterHitpoints(npcTypeId);
    const pos = zulrahSpots[phase.spot] ?? zulrahCenterStart;
    return [
      zulrahBossNpc.createActor(
        {
          id: zulrahActorId,
          kind: "npc",
          role: "boss",
          npcTypeId,
          archetypeId: "zulrah",
          size: zulrahSize,
          alive: true,
          untargetable: true,
          position: [...pos],
          previousPosition: [...pos],
          facing: 0,
          history: new Map(),
          vitals: { hp: hitpoints, maxHp: hitpoints },
          formulaStats: structuredClone(getMonsterFormulaStats(npcTypeId)),
          combat: {
            attackSpeed: attackSpeedTicks,
            attackRange: 25,
            attackStyle: "range",
            nextActionTick: emergeDurationTicks,
            targetId: "player",
            lastAttackTick: null,
            animations: { attack: null, death: null },
          },
        },
        {},
      ),
    ];
  }

  getNpcDefinitions() {
    return this.definitions;
  }

  buildPhaseActions(phase) {
    const actions = [];
    const attackCount = phase.attacks ?? 0;
    const attackKind = phase.pattern === "melee" ? "melee" : "attack";
    for (let i = 0; i < attackCount; i += 1) {
      actions.push({ kind: attackKind });
    }
    if (this.toxicCloudsEnabled && phase.cloudVolleys?.length) {
      for (const volley of phase.cloudVolleys) {
        actions.push({ kind: "venom", volley });
      }
    }
    if (this.snakelingsEnabled && phase.snakelings?.length) {
      for (const spec of phase.snakelings) {
        actions.push({ kind: "snakeling", spec });
      }
    }
    return actions;
  }

  submergeBoss(actor, context) {
    this.phaseState = "submerging";
    this.stateUntilTick = context.tick + submergeDurationTicks;
    actor.untargetable = true;
    emitInfernoVisual(context.tickEvents, {
      animations: [{ actorId: zulrahActorId, clipId: "submerge", delayCycles: 0 }],
    });
  }

  transitionToPhase(actor, nextIndex, context, { immediate = false } = {}) {
    const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
    this.phaseIndex = nextIndex % phases.length;
    const phase = phases[this.phaseIndex];
    const nextType = formToNpcTypeId(phase.form);
    const pos = zulrahSpots[phase.spot] ?? zulrahCenterStart;

    actor.npcTypeId = nextType;
    actor.formulaStats = structuredClone(getMonsterFormulaStats(nextType));
    actor.position = [...pos];
    actor.previousPosition = [...pos];
    faceTile(actor, context.world.getPlayer()?.position);
    this.phaseAttackCount = 0;
    this.phaseActions = this.buildPhaseActions(phase);
    this.pendingMeleeTarget = null;
    this.meleeWindupEndTick = null;

    if (immediate) {
      this.phaseState = "active";
      actor.untargetable = false;
      actor.combat.nextActionTick = context.tick + 1;
    } else {
      this.phaseState = "emerging";
      this.stateUntilTick = context.tick + emergeDurationTicks;
      // Keep Zulrah targetable once it surfaces so player clicks queue cleanly instead of dead-clicking.
      actor.untargetable = false;
      actor.combat.nextActionTick = context.tick + emergeDurationTicks;
    }

    if (context.tickEvents) {
      emitInfernoVisual(context.tickEvents, {
        animations: [{ actorId: zulrahActorId, clipId: "emerge", delayCycles: 0 }],
      });
    }
  }

  tickBoss(actor, context) {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!actor.alive || !player.alive) return idle;

    // Land any toxic clouds whose travel delay has elapsed.
    if (this.pendingClouds.length) {
      const landed = [];
      const remaining = [];
      for (const c of this.pendingClouds) {
        if (context.tick >= c.landTick) landed.push(c);
        else remaining.push(c);
      }
      this.pendingClouds = remaining;
      if (landed.length) {
        const graphics = [];
        for (const c of landed) {
          this.activeClouds.push({ x: c.x, y: c.y, expiresTick: context.tick + toxicCloudDurationTicks });
          graphics.push({
            spotAnimId: zulrahSpotIds.toxicCloud,
            target: { kind: "tile", position: [c.x, c.y] },
            height: 0,
            delayCycles: 0,
          });
        }
        if (this.toxicCloudsEnabled && context.tickEvents) {
          emitInfernoVisual(context.tickEvents, { graphics });
        }
      }
    }

    this.activeClouds = this.activeClouds.filter((c) => c.expiresTick > context.tick);
    if (this.toxicCloudsEnabled && this.activeClouds.length && context.tick % 4 === 0 && context.tickEvents) {
      emitInfernoVisual(context.tickEvents, {
        graphics: this.activeClouds.map((c) => ({
          spotAnimId: zulrahSpotIds.toxicCloud,
          target: { kind: "tile", position: [c.x, c.y] },
          height: 0,
          delayCycles: 0,
        })),
      });
    }

    if (this.phaseState === "submerging") {
      if (context.tick >= this.stateUntilTick) {
        const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
        const nextIdx = this.phaseIndex + 1 >= phases.length ? 1 : this.phaseIndex + 1;
        this.transitionToPhase(actor, nextIdx, context);
      }
      return idle;
    }

    if (this.phaseState === "emerging") {
      if (context.tick >= this.stateUntilTick) {
        this.phaseState = "active";
        actor.untargetable = false;
        if (!this.phaseActions.length) {
          this.phaseActions = this.buildPhaseActions(this.getCurrentPhase());
        }
      } else {
        return idle;
      }
    }

    const phase = this.getCurrentPhase();

    // Complete Magma melee slam windup & impact (5806/5807 are full ~7-tick slam animations).
    if (this.pendingMeleeTarget && context.tick >= this.meleeWindupEndTick) {
      const [tx, ty] = this.pendingMeleeTarget;
      const [px, py] = player.position;
      this.pendingMeleeTarget = null;
      this.meleeWindupEndTick = null;
      this.phaseAttackCount += 1;
      const environmentalDamages = [];
      if (px === tx && py === ty) {
        environmentalDamages.push({
          baseDamage: 1 + Math.floor(this.random() * 41), // WIKI: Magma slam max hit 41.
          attackType: "typeless",
          source: "Zulrah (Melee)",
          playerPosition: [...player.position],
        });
      }
      // Allow 2 ticks for the slam recovery before diving or winding up the next slam.
      scheduleNextActionTick(actor.combat, context.tick, this.phaseActions.length ? 3 : 2);
      return { environmentalDamages };
    }

    if (this.pendingMeleeTarget || context.tick < actor.combat.nextActionTick) return idle;

    if (!this.phaseActions.length) {
      this.submergeBoss(actor, context);
      return idle;
    }

    const action = this.phaseActions.shift();

    if (action.kind === "melee") {
      this.pendingMeleeTarget = [...player.position];
      this.meleeWindupEndTick = context.tick + 5;
      faceTile(actor, this.pendingMeleeTarget);
      emitInfernoVisual(context.tickEvents, {
        animations: [{ actorId: zulrahActorId, clipId: this.phaseAttackCount % 2 === 0 ? "meleeFocus" : "meleeAttack", delayCycles: 0 }],
      });
      return idle;
    }

    if (action.kind === "venom") {
      emitInfernoVisual(context.tickEvents, {
        animations: [{ actorId: zulrahActorId, clipId: "shoot", delayCycles: 0 }],
      });
      for (const [x, y] of action.volley) {
        this.pendingClouds.push({ x, y, landTick: context.tick + cloudTravelTicks });
      }
      if (!this.phaseActions.length) {
        this.submergeBoss(actor, context);
      } else {
        scheduleNextActionTick(actor.combat, context.tick, cloudCadenceTicks);
      }
      return idle;
    }

    if (action.kind === "snakeling") {
      emitInfernoVisual(context.tickEvents, {
        animations: [{ actorId: zulrahActorId, clipId: "shoot", delayCycles: 0 }],
      });
      this.pendingSnakelings.push({ ...action.spec, spawnAtTick: context.tick + cloudTravelTicks });
      if (!this.phaseActions.length) {
        this.submergeBoss(actor, context);
      } else {
        scheduleNextActionTick(actor.combat, context.tick, cloudCadenceTicks);
      }
      return idle;
    }

    // Standard Ranged, Tanzanite (Mage/Range mix), or Jad alternating attacks.
    let isMagic = false;
    if (phase.pattern === "jad_range_first") {
      isMagic = this.phaseAttackCount % 2 === 1;
    } else if (phase.pattern === "jad_mage_first") {
      isMagic = this.phaseAttackCount % 2 === 0;
    } else if (phase.pattern === "mage") {
      // WIKI: Tanzanite phase primarily uses Magic (~67%) with occasional Ranged (~33%).
      isMagic = this.random() < 0.67;
    }

    const projectile = isMagic ? magicProjectile : rangedProjectile;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: isMagic ? "magic" : "ranged",
        damageType: isMagic ? "magic" : "range",
        attackKind: isMagic ? "magic_fire" : "range_arrow",
        maxHit: 41, // WIKI: Zulrah max hit is 41 for ranged and magic.
        projectile: projectile.timing,
        prayerCheckAt: "launch",
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    if (!npcAttack) return idle;

    if (npcAttack.baseDamage > 0) {
      npcAttack.applyPoison = venomVarpSeverity;
    }

    faceTile(actor, player.position);
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "shoot",
      kind: isMagic ? "zulrah_magic" : "zulrah_ranged",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: [buildNpcProjectileVisual(actor, player, projectile)],
    });

    actor.combat.lastAttackTick = context.tick;
    this.phaseAttackCount += 1;

    if (!this.phaseActions.length) {
      this.submergeBoss(actor, context);
    } else {
      scheduleNextActionTick(actor.combat, context.tick, attackSpeedTicks);
    }

    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  }

  resolveHazards(context, mechanics) {
    if (!(mechanics?.[zulrahToxicCloudsKey] ?? this.toxicCloudsEnabled)) return [];
    const player = context.world.getPlayer();
    if (!player?.alive || !this.activeClouds.length) return [];
    if (context.tick - this.lastCloudDamageTick < 2) return [];

    const [px, py] = player.position;
    const inCloud = this.activeClouds.some(
      (c) => c.expiresTick > context.tick && Math.max(Math.abs(px - c.x), Math.abs(py - c.y)) <= 1,
    );
    if (!inCloud) return [];

    this.lastCloudDamageTick = context.tick;
    return [
      {
        baseDamage: 1 + Math.floor(this.random() * 4), // WIKI: Toxic clouds deal 1-4 venom damage per tick interval.
        attackType: "typeless",
        hitsplatType: "venom",
        source: "Toxic cloud",
        playerPosition: [...player.position],
        applyPoison: venomVarpSeverity,
      },
    ];
  }

  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }

  processPostTick(context) {
    if (this.pendingSnakelings.length > 0 && this.outcome.phase === "active") {
      const graphics = [];
      const remaining = [];
      for (const spec of this.pendingSnakelings) {
        if ((spec.spawnAtTick ?? 0) > context.tick) {
          remaining.push(spec);
          continue;
        }
        this.snakelingCounter += 1;
        const id = `snakeling_${this.snakelingCounter}`;
        const npcTypeId = spec.type === "magic" ? zulrahNpcIds.snakelingMagic : zulrahNpcIds.snakelingMelee;
        const hitpoints = getMonsterHitpoints(npcTypeId);
        this.spawnedSnakelingIds.push(id);
        context.spawnNpc(
          snakelingNpc.createActor(
            {
              id,
              kind: "npc",
              role: "minion",
              npcTypeId,
              archetypeId: "snakeling",
              size: 1,
              alive: true,
              position: [...spec.position],
              previousPosition: [...spec.position],
              facing: 0,
              history: new Map(),
              vitals: { hp: hitpoints, maxHp: hitpoints },
              formulaStats: structuredClone(getMonsterFormulaStats(npcTypeId)),
              combat: {
                attackSpeed: 4,
                attackRange: spec.type === "magic" ? 10 : 1,
                attackStyle: spec.type === "magic" ? "magic" : "melee",
                nextActionTick: context.tick + 2,
                targetId: "player",
                lastAttackTick: null,
                animations: { attack: 2414, death: 2407 },
              },
            },
            {},
          ),
        );
        graphics.push({
          spotAnimId: zulrahSpotIds.snakelingSpawn,
          target: { kind: "tile", position: [...spec.position] },
          height: 0,
          delayCycles: 0,
        });
      }
      this.pendingSnakelings = remaining;
      if (graphics.length) {
        if (context.tickEvents) {
        emitInfernoVisual(context.tickEvents, { graphics });
      }
      }
    }

    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) {
      this.outcome = { ...this.outcome, phase: "victory" };
    }
    return [];
  }

  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== zulrahActorId || completionOwnership !== "encounter-owned") return;
    for (const id of this.spawnedSnakelingIds) {
      if (context?.world?.getNpc(id)?.alive) {
        context.despawnNpc(id);
      }
    }
    this.outcome = {
      phase: "resolving",
      decisiveTick: defeat.tick,
      completionTick: defeat.tick + ticksFromDefeatToVictory,
      primaryActorId: zulrahActorId,
      completionActorIds: [zulrahActorId],
    };
  }

  executeCommand(command, context) {
    const boss = context.world.getNpc(zulrahActorId);
    if (!boss?.alive) return null;

    if (command.type === nextPhaseCommand.type) {
      const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
      const nextIdx = this.phaseIndex + 1 >= phases.length ? 1 : this.phaseIndex + 1;
      this.transitionToPhase(boss, nextIdx, context, { immediate: true });
      return { gameEvents: [] };
    }
    if (command.type === resetRotationCommand.type) {
      this.activeClouds = [];
      this.pendingClouds = [];
      this.pendingSnakelings = [];
      for (const id of this.spawnedSnakelingIds) {
        if (context.world.getNpc(id)?.alive) context.despawnNpc(id);
      }
      this.spawnedSnakelingIds = [];
      this.transitionToPhase(boss, 0, context, { immediate: false });
      return { gameEvents: [] };
    }
    if (command.type === jumpToJadCommand.type) {
      const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
      const jadIndex = phases.findIndex((p) => p.pattern.startsWith("jad_"));
      this.transitionToPhase(boss, jadIndex >= 0 ? jadIndex : 0, context, { immediate: true });
      return { gameEvents: [] };
    }
    return null;
  }

  getOutcome() {
    return this.outcome;
  }

  getSnapshot() {
    const phases = zulrahRotations[this.rotation] ?? zulrahRotations[1];
    const current = this.getCurrentPhase();
    const next = this.getNextPhase();
    return {
      kind: zulrahKind,
      state: {
        rotation: this.rotation,
        phaseIndex: this.phaseIndex,
        phaseCount: phases.length,
        phaseState: this.phaseState,
        form: current.form,
        pattern: current.pattern,
        hint: current.hint,
        safeTiles: current.safeTiles,
        nextForm: next.form,
        nextPattern: next.pattern,
        nextSafeTiles: next.safeTiles,
        nextHint: next.hint,
        meleeTargetTile: this.pendingMeleeTarget,
        pendingClouds: this.pendingClouds.map(({ x, y }) => [x, y]),
        activeClouds: this.activeClouds.map(({ x, y }) => [x, y]),
      },
      visuals: {},
    };
  }

  getNpcDamageSourceLabel(npcId) {
    return npcId === zulrahActorId ? "Zulrah" : "Snakeling";
  }
}

export const zulrahDefinition = {
  kind: zulrahKind,
  factory: () => new ZulrahEncounter(),
  descriptor: {
    kind: zulrahKind,
    displayName: "Zulrah",
    description: "Zulrah's Shrine — 4 rotations, Jad phases, Snakelings, Toxic clouds & training aids.",
    mapSquare: zulrahMapSquare,
    mapSquareOffsets: zulrahMapSquareOffsets,
    playerStart,
    loadsMapLocs: true,
    isWorkInProgress: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "ZULRAH DEFEATED", accent: "gold" },
  },
  controls: {
    defaultMechanicsConfig: {
      [zulrahRotationKey]: "random",
      [zulrahTrainingOverlayKey]: true,
      [zulrahSnakelingsKey]: true,
      [zulrahToxicCloudsKey]: true,
    },
    mechanicsToggles: [
      {
        key: zulrahRotationKey,
        label: "Rotation",
        setup: true,
        choices: [
          { value: "random", label: "Random" },
          { value: "1", label: "Rotation 1" },
          { value: "2", label: "Rotation 2" },
          { value: "3", label: "Rotation 3" },
          { value: "4", label: "Rotation 4" },
        ],
      },
      {
        key: zulrahTrainingOverlayKey,
        label: "Rotation & Safe-Tile Guide",
        group: "aid",
      },
      {
        key: zulrahSnakelingsKey,
        label: "Snakeling spawns",
      },
      {
        key: zulrahToxicCloudsKey,
        label: "Toxic clouds",
      },
    ],
    debugActions: [
      { command: nextPhaseCommand, label: "Next phase" },
      { command: jumpToJadCommand, label: "Jump to Jad phase" },
      { command: resetRotationCommand, label: "Restart rotation" },
    ],
  },
};
