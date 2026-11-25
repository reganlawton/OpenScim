// Doom of Mokhaiotl (https://oldschool.runescape.wiki/w/Doom_of_Mokhaiotl):
// one delve of the boss, chosen in the set-up (1 to 8). What the delve
// changes, and where each number comes from, is in delves.js; the room's
// hazards are in hazards.js.
//
// He stands in the middle of his room. His first attack comes 6 ticks in;
// then, every attack:
// - beside him, the tongue (up to 40, halved by Protect from Melee), and he
//   acts again 4 ticks later;
// - otherwise one to three orbs between rock throws (sometimes a throw at
//   once): blue magic, green ranged, from delve 2 red melee, each rolled where
//   it lands. A throw is followed by twice his attack speed;
// - about one throw in three, 2 ticks later, the melee charge: he takes only
//   melee, and 13 ticks later fires a beam no prayer stops (60/80/99). A
//   melee hit stops it, adds a fifth of the Strength bonus as a hit of its own
//   a tick after each hitsplat (the "punish"), clears acid around the player and holds his next attack;
// - with some attacks, larvae (hazards.js).
// From delve 3, at 75% hitpoints after two attacks, the demonic shield: 500
// points that only demonbane harms (a larva bursting on it takes 100), larvae
// from the north-west, and a beam charging all the while (17 ticks, restarted
// by each demonbane hit). It ends broken or when the beam fires, with a rock
// throw. Larvae killed meanwhile store 3 damage each (up to 50) for him.
//
// ponytail: not yet: burrowing (delve 5+), giant
// larvae (8), holy water, the shield's own hitpoint bar (the interface shows
// his hitpoints), acid's venom, sounds.
import { getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { canNpcActAtTick } from "../../engine/npcState.js";
import { createSeededRandom } from "../../engine/random.js";
import { createCollisionMap } from "../../engine/collision.js";
import { isDemonbaneAttack } from "../../engine/playerAttack/formula.js";
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { defineNpc, NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange } from "../shared/npcAttack.js";
import { buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoVisual } from "../inferno/events.js";
import { delveRules, npcTypeIds, spotAnims, bossStart, bossSize, tongueMaxHit } from "./delves.js";
import { Rocks, Larvae, Shockwave, Acid, roomDefinitions, bossCentre, holyWater } from "./hazards.js";

export const doomKind = "doom_of_mokhaiotl";
// The room of the delves, below the Ruins of Mokhaiotl.
export const doomMapSquare = { x: 20, y: 149 };
// Delves 2 to 8 are a room of their own, copied from map square 53,100
// (captured: the instance of delves 2 to 4, all 64 chunks, rotation 0), with
// the same local tiles. It is a variant kind: a scene and an arena of its own.
export const doomDeepKind = "doom_of_mokhaiotl_deep";
export const doomDeepMapSquare = { x: 53, y: 100 };
const playerStart = [31, 28];
export const bossActorId = "doom";
export const doomNpcTypeId = npcTypeIds.doom;
export const delveKey = "doomDelve";
const ticksFromDefeatToVictory = 7; // the despawn sequence

const formulaStyles = { range: "ranged", magic: "magic", melee: "melee_crush" };
const attackKinds = { range: "range_arrow", magic: "magic_fire", melee: "melee_crush" };
const firstAttackTicks = 6;
const tongueTicks = 4;
const charge = { chance: 1 / 3, delay: 2, ticks: 13 };
const shieldPoints = 500;
const shieldChargeTicks = 17;
const shieldStoreCap = 50;

const bossDefinition = defineNpc({
  id: "doom-of-mokhaiotl",
  move: false,
  tick: ({ actor, context, config }) => config.bossTurn(actor, context),
});

class DemonicShield {
  constructor(doom) {
    this.doom = doom;
  }
  reset() {
    this.up = false;
    this.used = false;
    this.points = 0;
    this.stored = 0;
  }
  start(context) {
    const doom = this.doom;
    this.up = true;
    this.points = shieldPoints;
    this.stored = 0;
    this.raisedAt = context.tick;
    this.firesAt = context.tick + shieldChargeTicks;
    this.cancelledAt = null;
    this.nextLarvaAt = context.tick + 5;
    doom.phase = "shield";
    doom.setChargeAccuracy(doom.boss(context.world), true);
  }
  // A demonbane hit (always landing) or a larva bursting on it.
  hit(amount, { restartsCharge = false } = {}) {
    this.points = Math.max(0, this.points - amount);
    if (!restartsCharge) return;
    this.firesAt = this.doom.now + shieldChargeTicks;
    this.cancelledAt = this.doom.now;
  }
  store() {
    this.stored = Math.min(shieldStoreCap, this.stored + 3);
  }
  turn(boss, context) {
    const doom = this.doom;
    if (this.points <= 0) return this.end(boss, context);
    if (context.tick >= this.firesAt) {
      doom.fireBeam(boss, context);
      return this.end(boss, context);
    }
    if (this.cancelledAt === context.tick) doom.animate(context, "beamCancel");
    else doom.chargeLoop(boss, context, context.tick === this.raisedAt + 2 || context.tick === this.cancelledAt + 2);
    if (context.tick >= this.nextLarvaAt) {
      this.nextLarvaAt = context.tick + doom.randomInt(7, 9);
      doom.larvae.spawn(context, { duringShield: true });
    }
  }
  end(boss, context) {
    const doom = this.doom;
    this.up = false;
    doom.phase = "attacks";
    doom.setChargeAccuracy(boss, false);
    if (this.stored > 0) doom.hitBoss(boss, this.stored, context);
    // The shockwave's timer stands still while the shield is up.
    doom.shockwave.nextAt += context.tick - this.raisedAt;
    doom.sinceRock = 0;
    doom.rocks.throw(context);
    doom.nextAt = context.tick + 2 * doom.rules.attackSpeed;
  }
}

class DoomEncounter {
  kind = doomKind;
  runStartMechanicsKeys = [delveKey];
  constructor(firstDelve = 1) {
    this.firstDelve = firstDelve;
    if (firstDelve > 1) this.kind = doomDeepKind;
    this.rocks = new Rocks(this);
    this.larvae = new Larvae(this);
    this.shockwave = new Shockwave(this);
    this.acid = new Acid(this);
    this.shield = new DemonicShield(this);
    this.definitions = new NpcDefinitionRegistry([bossDefinition, ...roomDefinitions].map((definition) => definition.register(this)));
    this.reset();
  }

  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.rules ??= delveRules(1);
    this.startRun();
  }
  // Everything a run starts with; again when the delve is chosen.
  startRun() {
    this.now = 0;
    this.tasks = [];
    this.pendingDamages = [];
    this.phase = "attacks";
    this.nextAt = firstAttackTicks;
    this.sinceRock = 1;
    this.attacksMade = 0;
    this.charge = null; // { firesAt }
    this.punish = null; // { tick, bonus }
    this.rocks.reset();
    this.larvae.reset();
    this.shockwave.reset();
    this.shockwave.nextAt = this.randomInt(79, 96);
    this.acid.reset();
    this.shield.reset();
    // He surfaces as the fight starts (captured: anim 12418 with graphic 3372).
    this.later(1, (ctx) => this.animate(ctx, "emerge", [{ spotAnimId: spotAnims.emerge, target: buildActorVisualTarget(this.boss(ctx.world)), height: 0, delayCycles: 0 }]));
  }
  randomInt(low, high) {
    return low + Math.floor(this.random() * (high - low + 1));
  }
  later(ticks, task) {
    this.tasks.push({ tick: this.now + ticks, task });
  }
  boss(world) {
    return world.getNpc(bossActorId);
  }
  getSeeds() {
    return { encounterSeed: this.seed };
  }
  getDefaultMechanicsConfig() {
    return { [delveKey]: String(this.firstDelve) };
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
  // Rocks block the way: a copy of the room's collision that they flag.
  refineArenaConfig(arena) {
    if (!arena.collisionMap) return arena;
    const map = createCollisionMap(arena.collisionMap.sizeX, arena.collisionMap.sizeY);
    map.flags.set(arena.collisionMap.flags);
    this.rocks.collision = map;
    return { ...arena, collisionMap: map };
  }
  // The NPCs may exist before the delve is known: the boss takes its numbers again.
  configureRunStart(mechanics, context) {
    // Each room keeps to its own delves: a setup saved for another (or from
    // before the rooms were split) must not make delve 1 a deeper one.
    const [low, high] = this.firstDelve === 1 ? [1, 1] : [2, 8];
    const chosen = Number(mechanics[delveKey]) || this.firstDelve;
    this.rules = delveRules(Math.min(high, Math.max(low, chosen)));
    this.random = createSeededRandom(this.seed);
    this.startRun();
    const boss = context?.world.actors.get(bossActorId);
    if (!boss) return;
    boss.vitals = { hp: this.rules.hitpoints, maxHp: this.rules.hitpoints };
    boss.formulaStats = structuredClone(getMonsterFormulaStats(doomNpcTypeId, `Delve ${this.rules.delve}`));
    boss.combat.attackSpeed = this.rules.attackSpeed;
  }
  createNpcs() {
    const hp = this.rules.hitpoints;
    return [
      bossDefinition.createActor(
        {
          id: bossActorId, kind: "npc", role: "boss", npcTypeId: doomNpcTypeId, archetypeId: "doom_of_mokhaiotl", size: bossSize, alive: true,
          position: [...bossStart], previousPosition: [...bossStart], facing: 0, history: new Map(),
          vitals: { hp, maxHp: hp },
          formulaStats: structuredClone(getMonsterFormulaStats(doomNpcTypeId, `Delve ${this.rules.delve}`)),
          combat: {
            attackSpeed: this.rules.attackSpeed, attackRange: 64, attackStyle: "magic", nextActionTick: Infinity, targetId: "player", lastAttackTick: null,
            animations: { idle: null, walk: null, run: null, attack: null, death: null },
          },
        },
        {},
      ),
    ];
  }

  // Every tick, before the NPCs: what is due, and the acid underfoot.
  resolveHazards(context) {
    this.now = context.tick;
    for (let due = this.takeDueTask(); due; due = this.takeDueTask()) due.task(context);
    return [...this.drainDamages(), ...this.acid.hurt(context)];
  }
  takeDueTask() {
    const index = this.tasks.findIndex((entry) => entry.tick <= this.now);
    return index < 0 ? null : this.tasks.splice(index, 1)[0];
  }
  drainDamages() {
    const damages = this.pendingDamages;
    this.pendingDamages = [];
    return damages;
  }
  // After the player: what their attacks set off (larvae bursting).
  processPostTick(context) {
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    this.showOverhead(this.boss(context.world));
    if (this.shieldResisted) {
      this.shieldResisted = false;
      context.tickEvents.emit({ type: "game_message", kind: "game", segments: [{ text: "The demonic shield resists your attack!" }] });
    }
    return this.drainDamages();
  }
  // What he shows over his head (captured): ranged and magic prayed (one
  // combined icon) while he charges for the melee punish; the charge bar then
  // and while the shield is up, a demonbane hit starting it again; the
  // shield's points in a bar above it.
  showOverhead(boss) {
    if (!boss) return;
    const shield = this.shield.up && this.phase === "shield";
    boss.overheadPrayers = this.charge && boss.alive ? ["range", "magic"] : undefined;
    boss.chargeBar = !boss.alive ? undefined
      : this.charge ? { fromTick: this.charge.firesAt - charge.ticks, toTick: this.charge.firesAt }
      : shield ? { fromTick: this.shield.firesAt - shieldChargeTicks, toTick: this.shield.firesAt }
      : undefined;
    boss.shieldBar = shield && boss.alive ? { ratio: this.shield.points / shieldPoints } : undefined;
  }
  getOutcome() {
    return this.outcome;
  }
  getSnapshot() {
    return {
      kind: this.kind,
      state: {
        delve: this.rules.delve,
        charging: this.charge !== null || this.shield.up,
        shieldPoints: this.shield.up ? this.shield.points : null,
        larvaCharge: this.larvae.charge,
        acid: this.acid.tiles(),
        rocks: [...this.rocks.standing].map((tile) => tile.split(",").map(Number)),
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel(npcId) {
    return npcId === bossActorId ? "Doom of Mokhaiotl" : "Demonic larva";
  }
  getNpcDefinitions() {
    return this.definitions;
  }
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }
  getEngineRules() {
    return {
      // Charging, he protects himself from ranged and magic.
      validateAttack: (attackKind, targetId) => (this.charge && targetId === bossActorId && !attackKind.startsWith("melee") ? false : null),
      playerDamageOnNpc: (damage, { attacker, target, attack }) => this.playerDamage(damage, attacker, target, attack),
    };
  }
  playerDamage(damage, player, target, attack) {
    const demonbane = isDemonbaneAttack(attack);
    if (this.larvae.isLarva(target)) return this.larvae.damage(target, damage, attack, demonbane);
    if (target.id !== bossActorId) return damage;
    if (this.shield.up) {
      if (demonbane) this.shield.hit(Math.max(1, damage), { restartsCharge: true });
      else this.shieldResisted = true; // told after the tick (processPostTick)
      return 0;
    }
    // Captured: the bonus is a hitsplat of its own a tick later, one for each of the attack's hitsplats that hurt.
    if (damage > 0 && this.punish && this.now - this.punish.tick <= 1 && attack.attackKind?.startsWith("melee")) {
      const bonus = this.punish.bonus;
      this.later(1, (ctx) => {
        const boss = this.boss(ctx.world);
        if (boss?.alive && bonus > 0) this.hitBoss(boss, bonus, ctx);
      });
    }
    return damage;
  }
  // The melee punish.
  onPlayerAttackStarted(attack, context) {
    if (!this.charge || attack.targetId !== bossActorId || !attack.attackKind?.startsWith("melee")) return;
    const player = context.world.getPlayer();
    this.charge = null;
    this.setChargeAccuracy(this.boss(context.world), false);
    this.punish = { tick: attack.tick, bonus: Math.floor((player.equipmentStats?.meleeStrength ?? 0) / 5) };
    this.nextAt = attack.tick + this.rules.punishDelayTicks - 1;
    this.acid.clearAround(player.position);
    this.animate(context, "beamCancel");
  }
  // Every hit that hurts him sprays acid.
  onPlayerAttackResolved(hit, context) {
    const boss = this.boss(context.world);
    if (hit.targetId === bossActorId && hit.effectiveDamage > 0 && boss?.alive) this.acid.spray(boss, context);
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    const npc = context.world.getNpc(defeat.npcId);
    if (npc && this.larvae.isLarva(npc)) return this.larvae.killed(npc, context);
    if (npc && this.shockwave.earth.has(npc.id)) return this.shockwave.earthDestroyed(npc, context);
    if (defeat.npcId !== bossActorId) return;
    this.tasks = [];
    this.charge = null;
    this.shield.up = false;
    for (const other of context.world.getNpcs()) if (other.id !== bossActorId && other.alive) context.despawnNpc(other.id);
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spotAnims.despawn, target: buildActorVisualTarget(npc), height: 0, delayCycles: 0 }] });
    if (this.punish && defeat.tick - this.punish.tick <= 1) holyWater(this, context);
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + ticksFromDefeatToVictory, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }

  // --- the boss ----------------------------------------------------------
  bossTurn(boss, context) {
    this.now = context.tick;
    const result = { environmentalDamages: [], npcAttacks: [] };
    const player = context.world.getPlayer();
    if (!canNpcActAtTick(boss, context.tick) || !player.alive) return result;
    faceActorToward(boss, player);
    if (this.phase === "shield") {
      this.shield.turn(boss, context);
      return result;
    }
    if (this.phase !== "attacks") return result; // raising the shield
    if (!this.shockwave.active && context.tick >= this.shockwave.nextAt) this.shockwave.start(context);
    if (this.charge) {
      if (context.tick >= this.charge.firesAt) {
        this.charge = null;
        this.setChargeAccuracy(boss, false);
        this.fireBeam(boss, context);
        this.nextAt = context.tick + this.rules.attackSpeed;
      } else this.chargeLoop(boss, context, context.tick === this.charge.firesAt - charge.ticks + 1);
      return result;
    }
    if (context.tick < this.nextAt || this.shockwave.holdsAttacks(context.tick)) return result;
    if (this.shieldDue(boss)) {
      this.raiseShield(context);
      return result;
    }
    const hold = this.orbHold(boss, player, context.tick);
    if (hold > 0) {
      this.nextAt = context.tick + hold;
      return result;
    }
    this.attacksMade++;
    this.nextAt = context.tick + this.attack(boss, player, context, result);
    if (this.random() < this.rules.larvaChance) this.larvae.spawn(context);
    return result;
  }
  attack(boss, player, context, result) {
    if (isNpcInAttackRange(boss, player, 1)) {
      this.animate(context, "tongue");
      this.later(1, (ctx) => this.pendingDamages.push({
        baseDamage: [0, tongueMaxHit], attackType: "melee", source: "Tongue", prayerReduction: { type: "reduce", value: 0.5 }, playerPosition: [...ctx.playerPos],
      }));
      return tongueTicks;
    }
    const rock = this.sinceRock >= 3 || (this.sinceRock >= 1 && this.random() < 0.5);
    if (!rock) {
      this.sinceRock++;
      this.throwOrb(boss, player, context, result);
      return this.rules.attackSpeed;
    }
    this.sinceRock = 0;
    this.rocks.throw(context);
    // Never before a shockwave (wiki).
    if (!this.shockwave.active && this.random() < charge.chance) this.later(charge.delay, (ctx) => this.startCharge(ctx));
    return 2 * this.rules.attackSpeed;
  }
  // His next orb waits for a rock in the air, and lands after its orbs.
  orbHold(boss, player, tick) {
    if (isNpcInAttackRange(boss, player, 1)) return 0;
    if (this.rocks.inAir > 0) return 1;
    return Math.max(0, this.rocks.orbsLandAt + 1 - (tick + Math.ceil(this.rules.orbEndCycles / 30)));
  }
  shieldDue(boss) {
    return this.rules.demonicShield && !this.shield.used && !this.shockwave.active && this.attacksMade >= 2 && boss.vitals.hp <= boss.vitals.maxHp * 0.75;
  }
  raiseShield(context) {
    this.shield.used = true;
    this.phase = "raising";
    this.animate(context, "beamCharge");
    this.later(2, (ctx) => this.shield.start(ctx));
  }
  animate(context, clipId, graphics = [], projectiles = []) {
    emitInfernoVisual(context.tickEvents, { animations: [{ actorId: bossActorId, clipId, delayCycles: 0 }], projectiles, graphics });
  }
  throwOrb(boss, player, context, result) {
    const styles = this.rules.orbStyles;
    const style = styles[Math.floor(this.random() * styles.length)];
    const end = this.rules.orbEndCycles;
    result.npcAttacks.push(this.rollOrb(boss, player, style, { impactDelayTicks: Math.ceil(end / 30) }));
    this.orbImpact(style, Math.ceil(end / 30));
    const centre = bossCentre(boss);
    this.animate(context, "orb", [], [{
      spotAnimId: spotAnims.orb[style], sourcePosition: [centre[0] + 0.5, centre[1] + 0.5], target: buildActorVisualTarget(player),
      startDelayCycles: 55, endDelayCycles: end, slope: 30, startOffset: 0, startHeight: 200, endHeight: 100,
    }]);
  }
  // An orb that lands unprayed bursts on the player (captured: no burst when prayed against).
  orbImpact(style, ticks) {
    this.later(ticks, (ctx) => {
      const player = ctx.world.getPlayer();
      if (!player.alive || isCorrectProtectionPrayer(style, player.activePrayer)) return;
      emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spotAnims.orbImpact[style], target: buildActorVisualTarget(player), height: 100, delayCycles: 0 }] });
    });
  }
  rollOrb(boss, player, style, timing) {
    const attack = rollNpcAttack({
      attacker: boss,
      target: player,
      plan: { formulaStyle: formulaStyles[style], damageType: style, attackKind: attackKinds[style], maxHit: this.rules.orbMaxHit, prayerCheckAt: "impact", sourceDeathPolicy: "persist", ...timing },
      random: this.random,
    });
    if (!attack) throw new TypeError("Missing formula stats for the Doom of Mokhaiotl");
    return attack;
  }
  startCharge(context) {
    const boss = this.boss(context.world);
    if (this.phase !== "attacks" || this.charge || !boss?.alive) return;
    this.charge = { firesAt: context.tick + charge.ticks };
    this.setChargeAccuracy(boss, true);
    this.animate(context, "beamCharge", [{ spotAnimId: spotAnims.beamCharge, target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 }]);
  }
  // Captured: the loop (12409) starts once, a tick after the charge (2 after
  // the shield's raise or a cancel) and runs on; the graphic comes every tick.
  // Starting the loop again each tick made it flicker.
  chargeLoop(boss, context, startsLoop) {
    const graphics = [{ spotAnimId: spotAnims.beamCharge, target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 }];
    if (startsLoop) this.animate(context, "beamLoop", graphics);
    else emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
  }
  // The beam hits the next tick, for its full damage.
  fireBeam(boss, context) {
    const player = context.world.getPlayer();
    const centre = bossCentre(boss);
    const segment = (spotAnimId, startDelayCycles, endDelayCycles) => ({
      spotAnimId, sourcePosition: [centre[0] + 0.5, centre[1] + 0.5], target: buildActorVisualTarget(player),
      startDelayCycles, endDelayCycles, slope: 0, startOffset: 0, startHeight: 100, endHeight: 100,
    });
    this.animate(context, "beamFire", [], [segment(spotAnims.beamHead, 0, 25), segment(spotAnims.beamMiddle, 1, 27), segment(spotAnims.beamEnd, 2, 29)]);
    this.later(1, (ctx) => {
      emitInfernoVisual(ctx.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spotAnims.beamImpact, target: buildActorVisualTarget(ctx.world.getPlayer()), height: 50, delayCycles: 0 }] });
      this.pendingDamages.push({ baseDamage: this.rules.beamMaxHit, attackType: "typeless", source: "Beam", playerPosition: [...ctx.playerPos] });
    });
  }
  // While he charges (the melee charge, the shield), every attack on him hits (wiki).
  setChargeAccuracy(boss, accurate) {
    if (boss?.formulaStats) boss.formulaStats.alwaysAccuratePlayerHit = accurate;
  }
  // Damage to him from the room (larvae bursting, stored damage): a hit of his own.
  hitBoss(boss, amount, context) {
    context.queueNpcHit({
      attackerId: boss.id, targetId: boss.id, style: "typeless", attackKind: "typeless",
      rolledDamage: amount, accuracySucceeded: true, impactDelayTicks: 0, sourceDeathPolicy: "persist",
    });
  }
}

const delveControls = (delves) => ({
  defaultMechanicsConfig: { [delveKey]: String(delves[0]) },
  mechanicsToggles: [{ key: delveKey, label: "Delve", setup: true, choices: delves.map((n) => ({ value: String(n), label: String(n) })) }],
  debugActions: [],
});
const roomVariants = [
  { id: "delve_1", encounterKind: doomKind, name: "Delve 1", subtitle: "The first room.", available: true, presetsKey: doomKind },
  { id: "delves_2_8", encounterKind: doomDeepKind, name: "Delves 2–8", subtitle: "The room below, where the deeper delves are fought.", available: true, presetsKey: doomKind },
];

export const doomDefinition = {
  kind: doomKind,
  factory: () => new DoomEncounter(),
  descriptor: {
    kind: doomKind,
    displayName: "Doom of Mokhaiotl",
    description: "Delve into the Doom of Mokhaiotl's lair, delves 1 to 8.",
    mapSquare: doomMapSquare,
    playerStart,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "DOOM OF MOKHAIOTL DEFEATED", accent: "blood" },
    isWorkInProgress: true,
    variants: roomVariants,
    variantLabel: "Delve",
  },
  controls: delveControls([1]),
  variantFactories: { [doomDeepKind]: () => new DoomEncounter(2) },
  variantControls: { [doomDeepKind]: delveControls([2, 3, 4, 5, 6, 7, 8]) },
};
// The deep room's descriptor: the same encounter on another map square
// (registry.js, variantDescriptors).
doomDefinition.variantDescriptors = { [doomDeepKind]: { ...doomDefinition.descriptor, mapSquare: doomDeepMapSquare } };
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { doomDefinition as definition };
export const order = 20;
