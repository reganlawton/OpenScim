// Corrupted Gauntlet practice room with player weapons, Hunllef attacks,
// floor hazards, and tornadoes.
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { createOccupancyStepCheck } from "../../engine/occupancy.js";
import { canFootprintStepInArena } from "../shared/npcMovement.js";
import { floorPatterns, floorPhase } from "./floorPatterns.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoVisual } from "../inferno/events.js";
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { Prayer } from "../../engine/prayerTables.js";
import { corruptedHunllefLoadouts } from "./loadouts.js";

export const kind = "corrupted_hunllef";
export const bossId = "corrupted-hunllef";
export const npcTypeId = 9036; // CACHE: Corrupted Hunllef ranged form
export const protectionForms = { melee: 9035, range: 9036, magic: 9037 }; // CACHE
const protectionStyles = ["melee", "range", "magic"];
export const mapSquare = { x: 30, y: 88 }; // CACHE: template chunks (246,710) and (247,711)
// CACHE: chunk (246,710) begins at tile (48,48) of map square (30,88).
// tsps controller: combat floor begins two tiles into the 16 x 16 room.
export const arena = { minX: 50, maxX: 61, minY: 50, maxY: 61 };
export const bossStart = [56, 57]; // supplied arena-local (6,7), 5 x 5 footprint
const playerStart = [55, 52]; // user-specified practice spawn on a final-phase-safe tile
const readyTicks = 4; // inferred simulator grace after the countdown: 2.4 seconds to prepare
const firstPatternTick = readyTicks + 4; // inferred: preserve the Near-Reality-derived four-tick floor offset
const patternInterval = 30; // inferred from Near-Reality-derived tsps controller
const floorDamage = [10, 20]; // inferred from Near-Reality-derived tsps controller; WIKI confirms damage every orange tick
const bossAttackRange = 6; // Overridden original value of 5 inferred from Near-Reality-derived tsps controller that caused the boss to jump 2 tiles.
const pursuitStepTicks = 2; // inferred: separate visible tile steps during staged boss movement
const attackInterval = 5; // WIKI: one attack every five ticks
const firstAttackTick = readyTicks + 2; // inferred: preserve the tsps two-tick attack lead after the ready period
const attacksPerStyle = 4; // WIKI: standard, prayer-disable, and tornado attacks count
const tornadoInterval = 56; // inferred from Near-Reality-derived tsps controller
const tornadoLifetime = 20; // WIKI
const tornadoSummonDelay = 2; // inferred: wind-up before NPCs appear; live frame/tick offset unverified
const tornadoCounts = [2, 3, 4]; // WIKI: corrupted tiers by HP thirds
const unprayedMaxHits = [68, 55, 45, 35]; // WIKI
const prayedDamageRatios = [0.24, 0.24, 0.23, 0.23]; // inferred: WIKI prayed maxima are 16/13/10/8
const tornadoDamage = [[15, 30], [15, 25], [10, 20], [7, 15]]; // WIKI
const disableChance = 0.15; // inferred: agreed simulator rate, at most once per Magic cycle
const projectileIds = { range: 1712, magic: 1708, disable: 1714 }; // CACHE
const impactIds = { magic: 1710, disable: 1716, tornado: 1718 }; // CACHE
const tornadoNpcTypeId = 9039; // CACHE
const sameTile = (a, b) => a[0] === b[0] && a[1] === b[1];
const armourTier = player => {
  const ids = [player.equipment.head, player.equipment.body, player.equipment.legs];
  for (let tier = 3; tier >= 1; tier--) {
    const offset = tier - 1;
    if (ids[0] === 23840 + offset && ids[1] === 23843 + offset && ids[2] === 23846 + offset) return tier;
  }
  return 0; // TABLE: only a full matching corrupted armour set receives this tier
};
const rollBetween = (random, [min, max]) => min + Math.floor(random() * (max - min + 1));
export const startPhaseKey = "corruptedHunllefStartPhase";
export const prayerTileMarkersKey = "corruptedHunllefPrayerTileMarkers";
export const tornadoTileMarkerColorKey = "corruptedHunllefTornadoTileMarkerColor";
export const prayerTileMarkerColorKeys = { range: "corruptedHunllefRangeTileColor", magic: "corruptedHunllefMagicTileColor", melee: "corruptedHunllefMeleeTileColor" };
const hpAtPhase = (maxHp, phase) => phase === 1 ? Math.floor(maxHp * 2 / 3)
  : phase === 2 ? Math.floor(maxHp / 3) : maxHp; // inferred: first HP at or below each tsps phase threshold
const maxBossHp = getMonsterHitpoints(npcTypeId); // TABLE
const startPhases = [
  { value: "full", label: "Full health", phase: 0 },
  { value: "middle", label: "Phase 2", phase: 1 },
  { value: "low", label: "Phase 3", phase: 2 },
];

export class CorruptedHunllefEncounter {
  kind = kind;
  constructor() { this.reset(); }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.protection = protectionStyles[Math.floor(this.random() * protectionStyles.length)]; // tsps controller: seeded initial protection
    this.offProtectionHits = 0;
    this.floor = new Map();
    this.nextPatternTick = firstPatternTick;
    this.lastPattern = null;
    this.startPhase = 0;
    this.nextPursuitTick = readyTicks;
    this.attackStyle = "range"; // WIKI: always opens with Ranged, independent of starting HP
    this.countedAttacks = 0;
    this.magicDisableUsed = false;
    this.nextAttackTick = firstAttackTick;
    this.nextTornadoTick = readyTicks + tornadoInterval;
    this.pendingTornadoSummonTick = null;
    this.pendingSwitchTick = null;
    this.pendingPrayerDisables = [];
    this.pendingMagicImpacts = [];
    this.tornadoes = new Map();
    this.nextTornadoId = 0;
  }
  getSeeds() { return { encounterSeed: this.seed }; }
  getDefaultMechanicsConfig() { return { infiniteHealth: true, [startPhaseKey]: "full", [prayerTileMarkersKey]: false,
    [tornadoTileMarkerColorKey]: "#ffffff", [prayerTileMarkerColorKeys.range]: "#00ff00",
    [prayerTileMarkerColorKeys.magic]: "#0000ff", [prayerTileMarkerColorKeys.melee]: "#ff0000" }; } // staging practice
  configureRunStart(mechanics, context) {
    this.startPhase = startPhases.find(({ value }) => value === mechanics[startPhaseKey])?.phase ?? 0;
    const player = context?.world?.getPlayer();
    if (player) {
      player.activePrayer = Prayer.ProtectRange; // inferred simulator convenience: Hunllef always opens Ranged
      player.prayerState.activePrayers = [Prayer.ProtectRange];
    }
  }
  getDefaultPlayerStart() { return [...playerStart]; }
  getIntroConfig() { return null; }
  getArenaConfig() {
    return { bounds: { ...arena, width: 12, height: 12 }, collisionMap: null,
      walkableTiles: new Set(Array.from({ length: 144 }, (_, i) => `${arena.minX + i % 12},${arena.minY + Math.floor(i / 12)}`)) }; // inferred walkable floor pending collision extraction
  }
  createNpcs() {
    const hp = getMonsterHitpoints(npcTypeId); // TABLE
    return [{ id: bossId, kind: "npc", role: "boss", npcTypeId: protectionForms[this.protection], archetypeId: kind,
      size: 5, alive: true, position: [...bossStart], previousPosition: [...bossStart], facing: 0, history: new Map(),
      overheadPrayers: [this.protection],
      vitals: { hp: hpAtPhase(hp, this.startPhase), maxHp: hp }, formulaStats: structuredClone(getMonsterFormulaStats(npcTypeId)),
      combat: { attackSpeed: attackInterval, attackRange: bossAttackRange, attackStyle: "range", nextActionTick: 0,
        targetId: "player", lastAttackTick: null,
        animations: { idle: 8417, walk: 8416, run: 8416, attack: null, death: null } } }]; // CACHE sequences; boss idle for staging
  }
  moveNpc(npc, context) {
    if (this.tornadoes.has(npc.id)) {
      if (context.tick >= this.tornadoes.get(npc.id).expiresAt) return [];
      const player = context.world.getPlayer();
      if (!player?.alive) return [];
      const next = [npc.position[0] + Math.sign(player.position[0] - npc.position[0]),
        npc.position[1] + Math.sign(player.position[1] - npc.position[1])];
      return sameTile(next, npc.position) ? [] : [{ npcId: npc.id, path: [next] }]; // inferred: one diagonal-capable step, no clipping
    }
    if (npc.id !== bossId || !npc.alive) return [];
    if (context.tick < this.nextPursuitTick) return [];
    const player = context.world.getPlayer();
    if (!player?.alive) return [];
    const gap = (value, from) => Math.max(0, from - value, value - (from + npc.size - 1));
    const distance = Math.max(gap(player.position[0], npc.position[0]), gap(player.position[1], npc.position[1]));
    if (distance <= bossAttackRange) return [];
    // Near-Reality-derived: prefer diagonal pursuit, then either cardinal step.
    const dx = Math.sign(player.position[0] - (npc.position[0] + Math.floor(npc.size / 2)));
    const dy = Math.sign(player.position[1] - (npc.position[1] + Math.floor(npc.size / 2)));
    const free = createOccupancyStepCheck(context.world.occupancy);
    for (const [sx, sy] of [[dx, dy], [dx, 0], [0, dy]]) {
      if (!sx && !sy) continue;
      const next = [npc.position[0] + sx, npc.position[1] + sy];
      if (canFootprintStepInArena(npc.position, next, { width: npc.size, height: npc.size }) && free(npc.position, next, npc.size)) {
        this.nextPursuitTick = context.tick + pursuitStepTicks;
        return [{ npcId: npc.id, path: [next] }];
      }
    }
    return [];
  }
  getEngineRules() {
    return { isPlayerAttackProtected: (style, target) => target.id === bossId && style === this.protection,
      playerDamageOnNpc: (damage, { target, attack }) => {
      if (target.id !== bossId) return damage;
      const style = attack.style;
      if (!protectionStyles.includes(style)) return damage;
      if (attack.protectedByNpcPrayer) return 0; // inferred: launch-time verdict keeps damage and XP aligned
      // tsps controller: an off-protection hit counts even when it rolls zero.
      if (++this.offProtectionHits === 6) {
        this.protection = style;
        this.offProtectionHits = 0;
        target.overheadPrayers = [style];
        target.npcTypeId = protectionForms[style];
      }
      return damage;
    } };
  }
  processNpcTick(npc, context) {
    const result = { environmentalDamages: [], npcAttacks: [] };
    if (npc.id !== bossId || !npc.alive || this.outcome.phase !== "active") return result;
    const player = context.world.getPlayer();
    if (!player?.alive || context.tick < this.nextAttackTick) return result;
    const gap = (value, from) => Math.max(0, from - value, value - (from + npc.size - 1));
    const distance = Math.max(gap(player.position[0], npc.position[0]), gap(player.position[1], npc.position[1]));
    if (distance > bossAttackRange) return result;
    this.nextAttackTick = context.tick + attackInterval;
    faceActorToward(npc, player);
    if (player.position[0] >= npc.position[0] && player.position[0] < npc.position[0] + npc.size &&
      player.position[1] >= npc.position[1] && player.position[1] < npc.position[1] + npc.size) {
      this.animate(context, "stomp");
      result.environmentalDamages.push({ source: "Corrupted Hunllef's stomp", attackType: "typeless",
        baseDamage: [0, 68], playerPosition: [...player.position] }); // WIKI: stomp max 68; no style count
      return result;
    }
    if (context.tick >= this.nextTornadoTick && this.countedAttacks < attacksPerStyle - 1 &&
      this.tornadoes.size === 0 && this.pendingTornadoSummonTick === null) {
      this.animate(context, "tornado");
      this.pendingTornadoSummonTick = context.tick + tornadoSummonDelay;
      this.nextTornadoTick = context.tick + tornadoInterval;
    } else {
      const disable = this.attackStyle === "magic" && !this.magicDisableUsed && this.random() < disableChance;
      if (disable) this.magicDisableUsed = true;
      const tier = armourTier(player);
      const style = this.attackStyle;
      const attack = rollNpcAttack({ attacker: npc, target: player, random: this.random,
        plan: { formulaStyle: style === "range" ? "ranged" : "magic", damageType: style,
          attackKind: disable ? "hunllef_prayer_disable" : `hunllef_${style}`,
          maxHit: unprayedMaxHits[tier], impactDelayTicks: 2, prayerCheckAt: "impact", sourceDeathPolicy: "persist" } }); // inferred: two-tick projectile flight
      if (attack) {
        attack.prayerReduction = { type: "reduce", value: prayedDamageRatios[tier] }; // inferred: WIKI maxima after reduction
        result.npcAttacks.push(attack);
        if (disable) this.pendingPrayerDisables.push(context.tick + attack.impactDelayTicks);
        else if (style === "magic") this.pendingMagicImpacts.push(context.tick + attack.impactDelayTicks);
      }
      this.animate(context, "attack", [{ spotAnimId: projectileIds[disable ? "disable" : style],
        sourcePosition: [npc.position[0] + 2.5, npc.position[1] + 2.5],
        target: buildActorVisualTarget(player), startDelayCycles: 0, endDelayCycles: 60,
        slope: 0, startOffset: 0, startHeight: 120, endHeight: 100 }]); // inferred visual flight timing
    }
    this.countedAttacks++;
    if (this.countedAttacks === attacksPerStyle) {
      this.countedAttacks = 0;
      this.pendingSwitchTick = context.tick + 1; // inferred: switch cue on the next controller tick
    }
    return result;
  }
  animate(context, clipId, projectiles = []) {
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId: bossId, clipId, delayCycles: 0 }],
      projectiles, graphics: [] });
  }
  summonTornadoes(context, player) {
    const boss = context.world.getNpc(bossId);
    const count = tornadoCounts[floorPhase(boss.vitals.hp, boss.vitals.maxHp)];
    for (let i = 0; i < count; i++) {
      let position;
      do { position = [arena.minX + Math.floor(this.random() * 12), arena.minY + Math.floor(this.random() * 12)]; }
      while (sameTile(position, player.position)); // inferred from tsps: only the player's exact tile is excluded
      const id = `hunllef-tornado-${this.nextTornadoId++}`;
      context.spawnNpc({ id, kind: "npc", role: "hazard", npcTypeId: tornadoNpcTypeId, archetypeId: kind,
        size: 1, alive: true, untargetable: true, blocksNpcMovement: false,
        position, previousPosition: [...position], facing: 0, history: new Map(),
        vitals: { hp: 1, maxHp: 1 }, combat: { attackSpeed: 0, attackRange: 0,
          attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
          animations: { idle: null, walk: null, run: null, attack: null, death: null } } });
      this.tornadoes.set(id, { expiresAt: context.tick + tornadoLifetime });
    }
  }
  resolveHazards(context) {
    const boss = context.world.getNpc(bossId);
    if (!boss?.alive || this.outcome.phase !== "active") {
      this.floor.clear();
      for (const id of this.tornadoes.keys()) context.despawnNpc(id);
      this.tornadoes.clear();
      this.pendingTornadoSummonTick = null;
      return [];
    }
    const tick = context.tick;
    if (this.pendingTornadoSummonTick !== null && tick >= this.pendingTornadoSummonTick) {
      this.pendingTornadoSummonTick = null;
      this.summonTornadoes(context, context.world.getPlayer());
    }
    if (this.pendingSwitchTick !== null && tick >= this.pendingSwitchTick) {
      this.attackStyle = this.attackStyle === "range" ? "magic" : "range";
      boss.combat.attackStyle = this.attackStyle;
      if (this.attackStyle === "magic") this.magicDisableUsed = false;
      this.pendingSwitchTick = null;
      this.animate(context, this.attackStyle === "magic" ? "switchMagic" : "switchRange"); // CACHE: distinct transition sequences
    }
    const hazards = [];
    const player = context.world.getPlayer();
    for (const [id, tornado] of this.tornadoes) {
      const actor = context.world.getNpc(id);
      if (!actor || tick >= tornado.expiresAt) {
        if (actor) context.despawnNpc(id);
        this.tornadoes.delete(id);
      } else if (player?.alive && sameTile(actor.position, player.position)) {
        hazards.push({ source: "Corrupted Hunllef's tornado", attackType: "typeless",
          baseDamage: rollBetween(this.random, tornadoDamage[armourTier(player)]),
          playerPosition: [...player.position] }); // WIKI: same-tile damage every tick
        emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
          graphics: [{ spotAnimId: impactIds.tornado, target: buildActorVisualTarget(player), height: 0, delayCycles: 0 }] });
      }
    }
    for (const [key, tile] of this.floor) {
      if (tick >= tile.clearAt) this.floor.delete(key);
      else if (tick >= tile.damageAt) tile.state = "damage";
    }
    if (tick >= this.nextPatternTick) {
      const phase = floorPhase(boss.vitals.hp, boss.vitals.maxHp);
      const pool = floorPatterns[phase];
      const pattern = pool[Math.floor(this.random() * pool.length)]; // seeded, uniform pool choice
      this.lastPattern = { patternId: pattern.patternId, phase, startTick: tick };
      for (const [x, y] of pattern.tiles) {
        const key = `${x},${y}`;
        if (!this.floor.has(key)) this.floor.set(key, { x, y, state: "warning",
          damageAt: tick + pattern.warningTicks, clearAt: tick + pattern.warningTicks + pattern.damageTicks });
      }
      this.nextPatternTick = tick + patternInterval;
    }
    const [px, py] = context.playerPos;
    const tile = this.floor.get(`${px - arena.minX},${py - arena.minY}`);
    if (tile?.state === "damage") hazards.push({ source: "Corrupted Hunllef's floor", attackType: "typeless",
      baseDamage: floorDamage, playerPosition: [px, py] });
    return hazards;
  }
  processPostTick(context) {
    if (this.outcome.phase === "active" && this.pendingMagicImpacts.some(tick => tick <= context.tick)) {
      this.pendingMagicImpacts = this.pendingMagicImpacts.filter(tick => tick > context.tick);
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
        graphics: [{ spotAnimId: impactIds.magic, target: buildActorVisualTarget(context.world.getPlayer()), height: 100, delayCycles: 0 }] });
    }
    if (this.outcome.phase === "active" && this.pendingPrayerDisables.some(tick => tick <= context.tick)) {
      this.pendingPrayerDisables = this.pendingPrayerDisables.filter(tick => tick > context.tick);
      context.deactivateAllPrayers?.();
      context.tickEvents.emit({ type: "game_message", kind: "game",
        segments: [{ text: "Your prayers have been disabled!" }] });
      const player = context.world.getPlayer();
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [],
        graphics: [{ spotAnimId: impactIds.disable, target: buildActorVisualTarget(player), height: 100, delayCycles: 0 }] });
    }
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick)
      this.outcome = { ...this.outcome, phase: "victory" };
    return [];
  }
  onNpcDefeated(defeat, context, ownership) {
    if (defeat.npcId !== bossId || ownership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick,
      completionTick: defeat.tick + 4, primaryActorId: bossId, completionActorIds: [bossId] }; // inferred visual delay
  }
  getOutcome() { return this.outcome; }
  getSnapshot({ world } = {}) { const boss = world?.getNpc(bossId); return { kind, state: { bossAttacksPending: false,
    bossPosition: boss ? [...boss.position] : [...bossStart],
    phase: boss ? floorPhase(boss.vitals.hp, boss.vitals.maxHp) : this.startPhase, protection: this.protection,
    attackStyle: this.attackStyle, countedAttacks: this.countedAttacks, nextAttackTick: this.nextAttackTick,
    nextTornadoTick: this.nextTornadoTick, pendingTornadoSummonTick: this.pendingTornadoSummonTick,
    magicDisableUsed: this.magicDisableUsed,
    tornadoes: [...this.tornadoes.keys()].map(id => world?.getNpc(id)).filter(Boolean).map(actor => ({ id: actor.id, position: [...actor.position] })),
    offProtectionHits: this.offProtectionHits, floor: [...this.floor.values()].map(({ x, y, state, damageAt, clearAt }) =>
      ({ x: arena.minX + x, y: arena.minY + y, state, damageAt, clearAt })),
    lastPattern: this.lastPattern, nextPatternTick: this.nextPatternTick }, visuals: {} }; }
  getNpcDamageSourceLabel() { return "Corrupted Hunllef"; }
}

export const corruptedHunllefDefinition = { kind, factory: () => new CorruptedHunllefEncounter(), descriptor: {
  kind, displayName: "Corrupted Hunllef", description: "Prepare in the Corrupted Gauntlet boss room.",
  mapSquare, playerStart, collision: { mode: "custom" }, loadsMapLocs: true, isWorkInProgress: true,
  loadouts: corruptedHunllefLoadouts,
  victory: { title: "VICTORY", narrative: "CORRUPTED HUNLLEF DEFEATED", accent: "blood" },
}, controls: { defaultMechanicsConfig: { infiniteHealth: true, [startPhaseKey]: "full", [prayerTileMarkersKey]: false,
    [tornadoTileMarkerColorKey]: "#ffffff", [prayerTileMarkerColorKeys.range]: "#00ff00",
    [prayerTileMarkerColorKeys.magic]: "#0000ff", [prayerTileMarkerColorKeys.melee]: "#ff0000" },
  mechanicsToggles: [
    { key: startPhaseKey, label: "Starting boss health", setup: true,
      choices: startPhases.map(({ value, label }) => ({ value, label })) },
    { key: prayerTileMarkersKey, label: "Tile markers by protection prayer", setup: true, info: "Color Hunllef's tiles according to the prayer protecting it." },
    { key: prayerTileMarkerColorKeys.range, label: "Ranged protection tile color", type: "color", setup: true, dependsOn: prayerTileMarkersKey },
    { key: prayerTileMarkerColorKeys.magic, label: "Magic protection tile color", type: "color", setup: true, dependsOn: prayerTileMarkersKey },
    { key: prayerTileMarkerColorKeys.melee, label: "Melee protection tile color", type: "color", setup: true, dependsOn: prayerTileMarkersKey },
    { key: tornadoTileMarkerColorKey, label: "Tornado tile color", type: "color", setup: true },
  ],
  bossHpPresets: startPhases.map(({ label, phase }) => ({ label,
    hp: hpAtPhase(maxBossHp, phase), hint: phase === 0 ? "First floor pattern pool."
      : `Starts floor pattern pool ${phase + 1} on the next pattern.` })),
  debugActions: [] } };
// The current registry discovers each encounter directory automatically.
export { corruptedHunllefDefinition as definition };
export const order = 80;
