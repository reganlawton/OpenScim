// A fixture: the smallest encounter that is a fight. It is the worked example
// of docs/ADDING-AN-ENCOUNTER.md and is registered only by the tests (see
// register.mjs beside this file); the site does not know it.
//
// One monster, a Jal-ImKot borrowed from the Inferno, stands in Yama's arena.
// It walks up to the player and hits with melee every four ticks. When it is
// dead the fight is won. A mechanics toggle makes it hit harder and a debug
// action heals it, to show how the menus reach an encounter.
//
// The imports name client modules from the web root ("/engine/..."), as the
// modules of client/toa/ do. An encounter that lives in
// client/encounters/<name>/ imports them relatively.
import { getMonsterFormulaStats, getMonsterHitpoints } from "/engine/monsterStats.js";
import { createSeededRandom } from "/engine/random.js";
import { defineNpc, NpcDefinitionRegistry } from "/encounters/shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange } from "/encounters/shared/npcAttack.js";
import { scheduleNextActionTick } from "/encounters/shared/npcHelpers.js";
import { emitInfernoNpcAttack } from "/encounters/inferno/events.js";

export const trainingGroundKind = "training_ground";
// Yama's map square: the trimmed game cache has its terrain and collision.
export const trainingGroundMapSquare = { x: 23, y: 157 };
// Tiles are [x, y] within the map square, 0 to 63, south-west first.
const playerStart = [31, 37];
const partnerStart = [30, 29];
export const partnerActorId = "sparring-partner";
export const partnerNpcTypeId = 7697; // Jal-ImKot
const partnerSize = 4;
const attackSpeedTicks = 4;
const ticksFromDefeatToVictory = 3;
export const hardHitsKey = "trainingGroundHardHits";
export const healPartnerCommand = { encounter: trainingGroundKind, type: "heal-partner" };

// The monster's behaviour. Its movement is the default of an NPC definition:
// it walks towards `combat.targetId` until it is within `combat.attackRange`.
const partnerDefinition = defineNpc({
  id: "training-ground-sparring-partner",
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (context.tick < actor.combat.nextActionTick || !player.alive) return idle;
    if (!isNpcInAttackRange(actor, player, actor.combat.attackRange)) return idle;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: "melee_slash",
        damageType: "melee",
        attackKind: "melee_slash",
        maxHit: config.maxHit(),
        impactDelayTicks: 0,
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    // Null when the attacker has no formula stats: an NPC type the monster table lacks.
    if (!npcAttack) throw new TypeError(`Missing formula stats for ${actor.id}`);
    // The scene plays the clip "attack" of the monster's render config.
    emitInfernoNpcAttack(context, { actor, target: player, clipId: "attack", kind: "training_ground_melee", impactDelayTicks: 0 });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, attackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

class TrainingGroundEncounter {
  kind = trainingGroundKind;
  constructor() {
    this.definitions = new NpcDefinitionRegistry([partnerDefinition.register({ maxHit: () => (this.hardHits ? 20 : 8) })]);
    this.reset();
  }

  // --- what the engine always calls -------------------------------------
  // A new run. `seeds` is what getSeeds returned, when a run is repeated
  // (a restart with the same seeds, a replay).
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.hardHits = false;
  }
  getSeeds() {
    return { encounterSeed: this.seed };
  }
  getDefaultMechanicsConfig() {
    return { [hardHitsKey]: false };
  }
  getDefaultPlayerStart() {
    return [...playerStart];
  }
  getIntroConfig() {
    return null;
  }
  // Used until the application has built the arena from the map square
  // (the descriptor's `collision`), which it then registers for the kind.
  getArenaConfig() {
    return { bounds: null, collisionMap: null, walkableTiles: null };
  }
  createNpcs() {
    const hitpoints = getMonsterHitpoints(partnerNpcTypeId);
    return [
      partnerDefinition.createActor(
        {
          id: partnerActorId,
          kind: "npc",
          // Not "boss": the default scene plays the death of any other NPC by itself.
          role: "minion",
          npcTypeId: partnerNpcTypeId,
          archetypeId: "training_ground_partner",
          size: partnerSize,
          alive: true,
          position: [...partnerStart],
          previousPosition: [...partnerStart],
          facing: 0,
          history: new Map(),
          vitals: { hp: hitpoints, maxHp: hitpoints },
          formulaStats: structuredClone(getMonsterFormulaStats(partnerNpcTypeId)),
          combat: {
            attackSpeed: attackSpeedTicks,
            attackRange: 1,
            attackStyle: "melee",
            nextActionTick: attackSpeedTicks,
            targetId: "player",
            lastAttackTick: null,
            animations: { idle: null, walk: null, run: null, attack: null, death: null },
          },
        },
        {},
      ),
    ];
  }
  // Every tick before the NPCs act, and after the player has: damage to
  // apply to the player, as a list.
  resolveHazards() {
    return [];
  }
  processPostTick(context) {
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    return [];
  }
  getOutcome() {
    return this.outcome;
  }
  // What the scene and the interface are handed each tick.
  getSnapshot() {
    return { kind: this.kind, state: { hardHits: this.hardHits }, visuals: {} };
  }
  getNpcDamageSourceLabel() {
    return "Sparring partner";
  }

  // --- what the engine calls if it is there -----------------------------
  getNpcDefinitions() {
    return this.definitions;
  }
  // At tick 0, whenever the mechanics change.
  configureRunStart(mechanics) {
    this.hardHits = mechanics[hardHitsKey] === true;
  }
  // An NPC's turn, after it has moved.
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== partnerActorId || completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + ticksFromDefeatToVictory, primaryActorId: partnerActorId, completionActorIds: [partnerActorId] };
  }
  // A debug action of the controls below. Returns the tick events to emit
  // (none here) when the command was run, and nothing when it was not.
  executeCommand(command, context) {
    if (command.type !== healPartnerCommand.type) return null;
    const partner = context.world.getNpc(partnerActorId);
    if (!partner?.alive) return null;
    partner.vitals = { ...partner.vitals, hp: partner.vitals.maxHp };
    return { gameEvents: [] };
  }
}

export const definition = {
  kind: trainingGroundKind,
  factory: () => new TrainingGroundEncounter(),
  descriptor: {
    kind: trainingGroundKind,
    displayName: "Training Ground",
    description: "A test fixture: one sparring partner in Yama's arena.",
    mapSquare: trainingGroundMapSquare,
    playerStart,
    loadsMapLocs: true,
    // The arena is the tiles that can be walked to from `seed`.
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "SPARRING PARTNER DEFEATED", accent: "gold" },
    // What the menus have of an encounter, written here and not in a table of application.js.
    loadouts: { sparring: { name: "Sparring", equipment: { cape: 22109 /* Ava's assembler */ }, inventory: [6685 /* Saradomin brew */, null, 6685] } },
    seo: { title: "Training Ground Simulator", description: "Spar with one partner in Yama's arena.", keywords: ["Training Ground"], noindex: true },
    tileMarkerPresets: [{ id: "training_ground_ring", name: "Sparring ring", description: "Where the partner starts", markers: [[30, 30, "#FF14D74F", "Partner"], [31, 30, "#80D81414"]] }],
  },
  controls: {
    defaultMechanicsConfig: { [hardHitsKey]: false },
    mechanicsToggles: [{ key: hardHitsKey, label: "Hard hits", setup: true }],
    debugActions: [{ command: healPartnerCommand, label: "Heal the sparring partner" }],
  },
};
