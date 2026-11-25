// The Maggot King (https://oldschool.runescape.wiki/w/Maggot_King), in his
// lair on Vampyrium, after The Blood Moon Rises.
//
// He keeps behind a row of bones north of the player's floor (15 x 4 tiles)
// and fights in rotations, each ended by a screech:
// - far (y 39), spits: ranged first, then magic and ranged in turn, one
//   style a rotation. A spit hits up to 46, all of it stopped by the right
//   protection prayer, and splashes bile on the player's tile and two beside
//   it: poisonous from a ranged one, sticky from a magic one (floor.js);
// - near, on the bones (y 37), once below two thirds of his hitpoints: head
//   slams every 4 ticks on a 3 x 4 in front of him, up to 55 (35 through
//   Protect from Melee), each with three biles. Far and near take turns from
//   then on; below a fifth he stays near for good.
// A rotation is 4 to 7 attacks. A screech: a protection prayer up is hurt
// every tick of it, his Defence is halved meanwhile, and ten piles of
// carrion are thrown onto the floor, each breaking into fragments, which
// stay as carrion; from 85% of his hitpoints, larvae too (larvae.js).
//
// Fire spells burn him and lower his Magic defence; he is weak to fire far
// away, hardly near. A melee hit as a slam lands is a punish: it costs the
// weapon no time and does half as much again.
//
// Sources: OBS is four kills (kill counts 686 to 689) of one player's
// Outside recordings, 23 screeches and 26 larvae among them, and a fifth (690)
// where it says so; WIKI the Maggot King and its Strategies page; CACHE and
// tsps RSPSApp/tsps docs/maggot-king.md, which read the cache and the wiki.
// Numbers no source gives are marked inferred.
//
// ponytail: not yet: sounds of the encounter's own (those of the sequences'
// frames play). The engine applies no elemental weakness: the fire weakness is
// the encounter's own, as near to the wiki's as a rule of the encounter can
// get (updateStats, playerDamage).
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { applyBurnStack } from "../../engine/specialAttacks.js";
import { getRangedDefenceType, getWeaponFormulaStyle } from "../../engine/weapons.js";
import { getActiveSpell } from "../../data/weaponCategories.js";
import { combatSpells } from "../../data/combatSpells.js";
import { defineNpc, NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildActorVisualTarget, getProjectileSourcePosition } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import {
  npcTypeIds, spotAnims, floor, bossSize, farY, nearY, farX, nearX, bossStart, playerStart,
  onFloor, centreX,
} from "./ids.js";
import { Floor } from "./floor.js";
import { Larvae, larvaDefinition } from "./larvae.js";
import { maggotKingLoadouts } from "./loadouts.js";

export const maggotKingKind = "maggot_king";
// CACHE: region 11645, the square the lair's instance copies (OBS).
export const maggotKingMapSquare = { x: 45, y: 125 };
export const bossActorId = "maggot-king";

const firstAttackTick = 4; // OBS: his first spit 3 to 5 ticks into the four recordings
const firstSpeed = 6; // OBS: before the first screech (every gap of the four)
const distantSpeed = 5; // OBS, WIKI: a tick faster after it
const slamSpeed = 4; // OBS
// OBS: 4 to 7 attacks to a rotation, all 23 complete ones (WIKI, tsps: 4 to 8).
const rotation = [4, 7];
// OBS: from a screech to the next rotation's first attack: 13 when he stays
// far (8 of 8), 11 when he comes near, goes back or stays near (14 of 14).
const afterScreech = { stay: 13, move: 11 };
// His hitpoints as a screech starts. OBS: a larva after one at 1274, none at
// 1302 and up (WIKI: about 1250); near after one at 983, not at 1042 and up
// (kill 690; WIKI: about 980); for good after one at 291, not at 309 and up (kill 690; WIKI 305).
const larvaHp = 1275;
const meleeHp = 1000;
const finalHp = 305;
const spitMaxHit = 46; // WIKI
const spitTicks = 2; // OBS: the hit lands 2 ticks after the spit (the projectile flies from 45 to 60 cycles)
const bileTicks = 3; // OBS: the bile lies 3 ticks after the spit lands (its drops fall 90 cycles)
// OBS: protection prayers were down from at most 3 ticks into a screech to at
// least 8 (23 screeches, no damage taken); WIKI: 15 to 25 a tick when one is up.
const screechWindow = [3, 8];
const screechDamage = [15, 25];
const throwTick = 3; // OBS: shadows, piles thrown, larvae launched, the roar's graphic
const pileTicks = 4; // OBS: projectile 3796 flies 120 cycles
const fragmentTicks = 2; // OBS: projectile 3797 flies 60 cycles
const pileMaxHit = 25; // WIKI; OBS: 10 on a pile
const fragmentMaxHit = 10; // WIKI; OBS: 1 to 10, nine hits
// OBS: five piles to each half of the floor, as the server lists them: the
// east's x 31 to 38, the west's 24 to 32 (23 of 23 screeches).
const halves = [[31, 38], [24, 32]];
const pilesPerHalf = 5;
// OBS: a pile breaks into at most 4 fragments on the tiles around it, fewer
// at the floor's edge (inferred: 4 of its 8 neighbours, those off the floor lost).
const fragmentsPerPile = 4;
const slamMaxHit = 55; // WIKI
const slamPrayed = 0.64; // WIKI: 35 of 55 through Protect from Melee
const slamTicks = 2; // OBS: graphic 2953 on the twelve tiles and the biles land 2 ticks after the slam
const slamBiles = 3; // OBS, WIKI
const drainsRestored = 9; // WIKI: drained Defence is restored after a screech (inferred: as it ends)
const deathTicks = 8; // OBS: the corpse 8 ticks after his death
const farReach = 4; // OBS: far, he walks till the player is within 4 columns of his middle
const burnDefence = 20; // WIKI: his Magic defence per stack of burn
const burnPulses = 5; // WIKI: 5 burn damage a fire spell
const punishBonus = 1.5; // WIKI: the first hitsplat of a punish
// WIKI (Elemental weakness): the standard spellbook's strikes to surges of the element.
const fireSpells = new Map(combatSpells.filter((spell) => spell.element === "fire" && spell.spellbook === "standard").map((spell) => [spell.name, spell]));
const fireSpell = (name) => fireSpells.get(name) ?? null;

// TABLE: his three sets of stats. Far: Magic defence +150, 80% weak to fire;
// near: +400, 5%; roaring (screeching): Defence 100.
const versions = Object.fromEntries(["Far", "Nearby", "Roaring"].map((version) => [version, getMonsterFormulaStats(npcTypeIds.king, version)]));
const weaknessPercent = { Far: 80, Nearby: 5, Roaring: 80 }; // TABLE

const bossDefinition = defineNpc({
  id: "maggot-king",
  move: ({ actor, context, config }) => config.moveBoss(actor, context),
  tick: ({ actor, context, config }) => config.bossTurn(actor, context),
});

const clamp = (value, { min, max }) => Math.max(min, Math.min(max, value));
const onTile = (spotAnimId, position, delayCycles = 0) => ({ spotAnimId, target: { kind: "tile", position: [...position] }, height: 0, delayCycles, onGround: true });
const tileProjectile = (spotAnimId, from, to, startDelayCycles, endDelayCycles, startHeight, endHeight, slope) => ({
  spotAnimId, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target: { kind: "tile", position: [...to] },
  startDelayCycles, endDelayCycles, slope, startOffset: 0, startHeight, endHeight,
});
const neighbours = ([x, y]) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => [x + dx, y + dy]);
const protectionPrayers = new Set(["ProtectMagic", "ProtectRange", "ProtectMelee"]);

// The spell of the player's next attack, a cast or the autocast; null for none.
function playerSpellName(player) {
  if (!player) return null;
  if (player.manualCastSpell) return typeof player.manualCastSpell === "string" ? player.manualCastSpell : (player.manualCastSpell.name ?? null);
  const spell = getActiveSpell({
    weaponId: player.equipment?.weapon, selectedStyleIndex: player.selectedAttackStyleIndex,
    selectedSpell: player.combatSupplies?.selectedSpell, spellbook: player.combatSupplies?.spellbook ?? "arceuus",
  });
  return spell?.name ?? null;
}
// The style of the player's next attack: "magic", "ranged" or "melee_<type>".
function playerFormulaStyle(player) {
  if (!player) return "";
  return playerSpellName(player) ? "magic" : getWeaponFormulaStyle(player.equipment?.weapon, player.selectedAttackStyleIndex);
}

class MaggotKingEncounter {
  kind = maggotKingKind;
  constructor() {
    this.floor = new Floor(this);
    this.larvae = new Larvae(this);
    this.definitions = new NpcDefinitionRegistry([bossDefinition, larvaDefinition].map((definition) => definition.register(this)));
    this.reset();
  }
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.outcome = { phase: "active" };
    this.startRun();
  }
  startRun() {
    this.now = 0;
    this.tasks = [];
    this.pending = [];
    this.phase = "distant"; // "distant" | "melee" | "dead"
    this.style = "range"; // of the distant rotations: ranged first (WIKI, OBS)
    this.speed = firstSpeed;
    this.attacksLeft = this.randomInt(...rotation);
    this.nextAt = firstAttackTick;
    this.final = false;
    this.movement = "far"; // "far" | "near" | "hold" | "ascend"
    this.screechAt = null;
    this.slam = null; // { tiles, landsAt }
    this.incoming = []; // what will land where: { kind: "bile" | "slam" | "pile" | "fragment", tiles, landsAt }
    this.punish = null;
    this.lastTargetId = null;
    this.floor.reset();
    this.larvae.reset();
  }
  randomInt(low, high) {
    return low + Math.floor(this.random() * (high - low + 1));
  }
  pick(list) {
    return list[Math.floor(this.random() * list.length)];
  }
  later(ticks, task) {
    this.tasks.push({ tick: this.now + ticks, task });
  }
  expect(kind, tiles, landsAt) {
    this.incoming.push({ kind, tiles: tiles.map((tile) => [...tile]), landsAt });
  }
  boss(world) {
    return world.getNpc(bossActorId);
  }
  getSeeds() {
    return { encounterSeed: this.seed };
  }
  getDefaultMechanicsConfig() {
    return {};
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
  configureRunStart(mechanics, context) {
    this.random = createSeededRandom(this.seed);
    this.startRun();
    const boss = context?.world.actors.get(bossActorId);
    if (!boss) return;
    boss.position = [...bossStart];
    boss.previousPosition = [...bossStart];
    boss.formulaStats = structuredClone(versions.Far);
  }
  createNpcs() {
    const hp = getMonsterHitpoints(npcTypeIds.king); // TABLE: 1500
    return [
      bossDefinition.createActor(
        {
          id: bossActorId, kind: "npc", role: "boss", npcTypeId: npcTypeIds.king, archetypeId: "maggot_king", size: bossSize, alive: true,
          // OBS: he faces south all fight, and walks sideways (his walk's left and right).
          position: [...bossStart], previousPosition: [...bossStart], facing: 0, lockedFacing: 0, history: new Map(),
          vitals: { hp, maxHp: hp },
          formulaStats: structuredClone(versions.Far),
          combat: {
            attackSpeed: firstSpeed, attackRange: 64, attackStyle: "range", nextActionTick: Infinity, targetId: "player", lastAttackTick: null,
            animations: { idle: null, walk: null, run: null, attack: null, death: null },
          },
        },
        {},
      ),
    ];
  }

  // --- every tick ----------------------------------------------------------
  // Before the NPCs: what is due, his stats for the tick, the leeches and the screech.
  resolveHazards(context) {
    this.now = context.tick;
    this.world = context.world;
    for (let due = this.takeDueTask(); due; due = this.takeDueTask()) due.task(context);
    this.incoming = this.incoming.filter((entry) => entry.landsAt > this.now);
    const boss = this.boss(context.world);
    if (boss?.alive) this.updateStats(boss, context.world.getPlayer());
    const damages = [...this.larvae.leech(context), ...this.drainPending()];
    const player = context.world.getPlayer();
    if (boss?.alive && player.alive && this.screeching() && protectionPrayers.has(player.activePrayer)) {
      damages.push({ baseDamage: screechDamage, attackType: "typeless", source: "Screech", playerPosition: [...player.position] });
    }
    return damages;
  }
  // After the player has moved: bile underfoot, and who stands under a larva.
  processPostTick(context) {
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    const player = context.world.getPlayer();
    const damages = player.alive && this.phase !== "dead" ? this.floor.step(player, context) : [];
    this.larvae.watch(context);
    return damages;
  }
  takeDueTask() {
    const index = this.tasks.findIndex((entry) => entry.tick <= this.now);
    return index < 0 ? null : this.tasks.splice(index, 1)[0];
  }
  drainPending() {
    const damages = this.pending;
    this.pending = [];
    return damages;
  }
  screeching(tick = this.now) {
    return this.screechAt !== null && tick >= this.screechAt + screechWindow[0] && tick <= this.screechAt + screechWindow[1];
  }
  // Which of his three sets of stats, with his burn's Magic defence off it.
  version(boss) {
    if (this.screeching()) return "Roaring";
    return boss.position[1] === nearY ? "Nearby" : "Far";
  }
  updateStats(boss, player) {
    const version = this.version(boss);
    const stats = structuredClone(versions[version]);
    stats.defensive.magic = Math.max(0, stats.defensive.magic - burnDefence * (boss.burnStacks?.length ?? 0)); // inferred: never below 0
    // WIKI: a point of weakness is 1% more magic accuracy. The engine applies
    // no weakness: here a fire spell's accuracy roll against him is that much
    // likelier to win, as a lower defence roll for the tick it is cast in.
    if (fireSpell(playerSpellName(player))) stats.defensive.magic = Math.floor((stats.defensive.magic + 64) / (1 + weaknessPercent[version] / 100)) - 64;
    boss.formulaStats = stats;
  }

  // --- his movement --------------------------------------------------------
  // Far, he keeps the player within 4 columns of his middle (OBS); near, he
  // walks his middle over the player's column, until his first slam; after
  // a near rotation's screech he keeps to the player's column 2 ticks more,
  // then goes back up (OBS). A tile a tick, diagonally where he can.
  moveBoss(boss, context) {
    if (!boss.alive || this.movement === "hold") return [];
    const player = context.world.getPlayer();
    const [x, y] = boss.position;
    let target;
    if (this.movement === "near") target = [clamp(player.position[0] - (bossSize >> 1), nearX), nearY];
    else if (this.movement === "ascend") target = [clamp(x, farX), farY];
    else {
      const middle = x + (bossSize >> 1);
      let wanted = x;
      if (player.position[0] > middle + farReach) wanted = player.position[0] - farReach - (bossSize >> 1);
      else if (player.position[0] < middle - farReach) wanted = player.position[0] + farReach - (bossSize >> 1);
      target = [clamp(wanted, farX), farY];
    }
    if (this.movement === "ascend" && y === farY) this.movement = "far";
    const step = [x + Math.sign(target[0] - x), y + Math.sign(target[1] - y)];
    if (step[0] === x && step[1] === y) return [];
    return [{ npcId: boss.id, path: [step] }];
  }

  // --- his turn ------------------------------------------------------------
  bossTurn(boss, context) {
    this.now = context.tick;
    const result = { environmentalDamages: [], npcAttacks: [] };
    const player = context.world.getPlayer();
    if (!boss.alive || !player.alive || this.phase === "dead" || context.tick < this.nextAt) return result;
    if (this.attacksLeft <= 0) {
      this.screech(boss, context);
      return result;
    }
    this.attacksLeft--;
    if (this.phase === "melee") {
      this.headSlam(boss, context);
      this.nextAt = context.tick + slamSpeed;
      return result;
    }
    result.npcAttacks.push(this.spit(boss, player, context));
    this.nextAt = context.tick + this.speed;
    return result;
  }
  animate(context, clipId, graphics = [], projectiles = []) {
    emitInfernoVisual(context.tickEvents, { animations: clipId ? [{ actorId: bossActorId, clipId, delayCycles: 0 }] : [], projectiles, graphics });
  }

  // A spit at the player's tile: it hits 2 ticks later (prayer as it lands),
  // and its drops fall on that tile and two around it, bile 3 ticks after.
  spit(boss, player, context) {
    const style = this.style;
    const attack = rollNpcAttack({
      attacker: boss,
      target: player,
      plan: {
        formulaStyle: style === "range" ? "ranged" : "magic", damageType: style, attackKind: style === "range" ? "range_arrow" : "magic_fire",
        maxHit: spitMaxHit, impactDelayTicks: spitTicks, prayerCheckAt: "impact", sourceDeathPolicy: "persist",
      },
      random: this.random,
    });
    if (!attack) throw new TypeError("Missing formula stats for the Maggot King");
    const spotAnimId = style === "range" ? spotAnims.rangedSpit : spotAnims.magicSpit;
    // OBS: the spit flies from 45 to 60 cycles, from 260 to 100 high, slope 5, starting 370 out of his middle.
    const projectile = {
      spotAnimId, sourcePosition: getProjectileSourcePosition(boss), target: buildActorVisualTarget(player),
      startDelayCycles: 45, endDelayCycles: 60, slope: 5, startOffset: 370, startHeight: 260, endHeight: 100,
    };
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: style, kind: "maggot_king_" + style, impactDelayTicks: spitTicks, projectiles: [projectile] });
    boss.facing = boss.lockedFacing ?? 0; // the helper turns him to the player
    const tile = [...player.position];
    this.later(spitTicks, (ctx) => this.splash(ctx, tile, style === "range" ? "poison" : "sticky", spotAnimId));
    return attack;
  }
  // OBS: the tile and two of its eight neighbours on the floor, at random.
  splash(context, tile, bile, spotAnimId) {
    const around = neighbours(tile).filter(onFloor);
    const tiles = [tile];
    while (tiles.length < 3 && around.length) tiles.push(around.splice(Math.floor(this.random() * around.length), 1)[0]);
    // OBS: graphic 3999 on each, and drops falling onto them (the spit's own projectile, 100 high to the floor in 90 cycles, slope 50).
    this.animate(context, null, tiles.map((t) => onTile(spotAnims.splat, t)), tiles.map((t) => tileProjectile(spotAnimId, tile, t, 0, 90, 100, 0, 50)));
    this.expect("bile", tiles, this.now + bileTicks);
    this.later(bileTicks, () => tiles.forEach((t) => this.floor.place(t, bile)));
  }

  // The 3 x 4 in front of his middle: debris shows on it at once, it lands 2
  // ticks later with three biles of either kind (OBS: 50 slams, both kinds).
  headSlam(boss, context) {
    if (this.movement === "near") this.movement = "hold";
    const middle = centreX(boss);
    const tiles = [];
    for (let x = middle - 1; x <= middle + 1; x++) for (let y = floor.minY; y <= floor.maxY; y++) if (onFloor([x, y])) tiles.push([x, y]);
    const landsAt = context.tick + slamTicks;
    this.slam = { tiles, landsAt };
    const biles = [...tiles];
    const chosen = [];
    while (chosen.length < slamBiles && biles.length) chosen.push(biles.splice(Math.floor(this.random() * biles.length), 1)[0]);
    const kinds = chosen.map(() => (this.random() < 0.5 ? "poison" : "sticky"));
    // OBS: the biles fly from him, 50 high to the floor in 60 cycles, slope 10.
    const source = [middle, boss.position[1] + (bossSize >> 1)];
    const projectiles = chosen.map((tile, i) => tileProjectile(kinds[i] === "poison" ? spotAnims.rangedSpit : spotAnims.magicSpit, source, tile, 0, 60, 50, 0, 10));
    this.animate(context, "slam", tiles.map((tile) => onTile(spotAnims.debris, tile)), projectiles);
    this.expect("slam", tiles, landsAt);
    this.expect("bile", chosen, landsAt);
    this.later(slamTicks, (ctx) => {
      const player = ctx.world.getPlayer();
      this.animate(ctx, null, tiles.map((tile) => onTile(spotAnims.slamImpact, tile)));
      chosen.forEach((tile, i) => this.floor.place(tile, kinds[i]));
      if (player.alive && tiles.some(([x, y]) => x === player.position[0] && y === player.position[1])) {
        this.pending.push({ baseDamage: [0, slamMaxHit], attackType: "melee", source: "Head slam", prayerReduction: { type: "reduce", value: slamPrayed }, playerPosition: [...player.position] });
      }
    });
  }

  // --- the screech ----------------------------------------------------------
  screech(boss, context) {
    const tick = context.tick;
    const hp = boss.vitals.hp;
    const wasMelee = this.phase === "melee";
    let next = "distant";
    let fill = false;
    // inferred: once below a fifth he stays near, whatever larvae heal him (WIKI: he "stops retreating").
    if (this.final || hp <= finalHp) {
      next = "melee";
      fill = !this.final;
      this.final = true;
    } else if (hp <= meleeHp && !wasMelee) next = "melee";
    // OBS: the far rotations take turns, ranged and magic, whatever near ones come between.
    if (next === "distant") this.style = this.style === "range" ? "magic" : "range";
    this.screechAt = tick;
    this.phase = next;
    this.speed = next === "melee" ? slamSpeed : distantSpeed;
    this.attacksLeft = this.randomInt(...rotation);
    this.nextAt = tick + (next === "distant" && !wasMelee ? afterScreech.stay : afterScreech.move);
    this.slam = null;
    // Near, he goes on following the player's column until he moves off.
    if (wasMelee) this.movement = "near";
    this.animate(context, "screech", [{ spotAnimId: spotAnims.screech, target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 }]);
    const larva = !fill && hp <= larvaHp;
    this.later(throwTick, (ctx) => {
      this.movement = next === "melee" ? "near" : wasMelee ? "ascend" : "far";
      const king = this.boss(ctx.world);
      if (!king?.alive) return;
      this.animate(ctx, null, [{ spotAnimId: spotAnims.roar, target: buildActorVisualTarget(king), height: 0, delayCycles: 0 }]);
      this.throwCarrion(ctx);
      if (fill) this.larvae.fill(ctx);
      else if (larva) this.larvae.launchOne(ctx);
    });
    this.later(drainsRestored, (ctx) => {
      const king = this.boss(ctx.world);
      if (king?.debuffs) king.debuffs = { ...king.debuffs, attackDrain: 0, strengthDrain: 0, magicDrain: 0, defenceDrain: 0 };
    });
  }
  // Ten piles, five to a half: a shadow on each as it is thrown from the
  // north; 4 ticks later it lands (up to 25 on its tile) and breaks into
  // fragments, which land 2 ticks after that (up to 10 each) as carrion.
  throwCarrion(context) {
    const taken = new Set();
    const piles = [];
    for (const [from, to] of halves) {
      for (let n = 0; n < pilesPerHalf; n++) {
        let tile;
        do tile = [this.randomInt(from, to), this.randomInt(floor.minY, floor.maxY)];
        while (taken.has(tile.join()));
        taken.add(tile.join());
        piles.push(tile);
      }
    }
    // OBS: thrown from a tile of the dark north, beside the pile's column, y 39 to 45.
    const projectiles = piles.map((tile) => tileProjectile(spotAnims.carrion, [tile[0] + this.randomInt(-1, 1), this.randomInt(39, 45)], tile, 0, pileTicks * 30, 0, 0, 35));
    this.animate(context, null, piles.map((tile) => onTile(spotAnims.shadow, tile)), projectiles);
    this.expect("pile", piles, context.tick + pileTicks);
    this.later(pileTicks, (ctx) => this.pilesLand(ctx, piles));
  }
  pilesLand(context, piles) {
    const player = context.world.getPlayer();
    if (player.alive && piles.some(([x, y]) => x === player.position[0] && y === player.position[1])) {
      this.pending.push({ baseDamage: [0, pileMaxHit], attackType: "typeless", source: "Carrion", playerPosition: [...player.position] });
    }
    const fragments = [];
    const projectiles = [];
    for (const pile of piles) {
      const around = neighbours(pile);
      for (let n = 0; n < fragmentsPerPile; n++) {
        const tile = around.splice(Math.floor(this.random() * around.length), 1)[0];
        if (!onFloor(tile)) continue;
        fragments.push(tile);
        projectiles.push(tileProjectile(spotAnims.fragment, pile, tile, 0, fragmentTicks * 30, 0, 0, 35));
      }
    }
    this.animate(context, null, fragments.map((tile) => onTile(spotAnims.debris, tile)), projectiles);
    this.expect("fragment", fragments, context.tick + fragmentTicks);
    this.later(fragmentTicks, (ctx) => {
      const you = ctx.world.getPlayer();
      for (const tile of fragments) {
        this.floor.place(tile, "carrion");
        if (you.alive && tile[0] === you.position[0] && tile[1] === you.position[1]) {
          this.pending.push({ baseDamage: [0, fragmentMaxHit], attackType: "typeless", source: "Carrion fragment", playerPosition: [...you.position] });
        }
      }
    });
  }

  // --- the player's hits ----------------------------------------------------
  getEngineRules() {
    return {
      playerDamageOnNpc: (damage, { target, attack }) => this.playerDamage(damage, target, attack),
      playerAttackOnCooldown: (target, tick) => this.attackOnCooldown(target, tick),
      playerAttackKeepsReady: (target, tick) => this.isPunish(target, tick),
      playerAlwaysAccurate: (context, attack) => this.alwaysAccurate(context, attack),
    };
  }
  // OBS: a punish is on the tick a slam lands, 2 after it starts (a greataxe's
  // costless hits fell on the impacts, all five kills). WIKI: "slams down".
  isSlamTick(tick) {
    return this.slam !== null && this.slam.landsAt === tick;
  }
  // A larva in the air shot with standard ranged (a bow: WIKI, "standard
  // ranged"; OBS: the player switched to a bow for them) dies at once and costs
  // the weapon no time (WIKI): it may be shot while the weapon cools down, the
  // timer kept, unless it was what was attacked last (as the Doom of
  // Mokhaiotl's larvae). A punish costs a melee weapon no time either.
  shootsLarva(target, tick, style, weaponId) {
    return this.larvae.isLarva(target) && this.larvae.flying(target, tick) && style === "ranged" && getRangedDefenceType(weaponId) === "standard";
  }
  attackOnCooldown(target, tick) {
    const player = this.world?.getPlayer();
    const style = playerFormulaStyle(player);
    if (target.id !== this.lastTargetId && this.shootsLarva(target, tick, style, player?.equipment?.weapon)) return { keepCooldown: true };
    if (this.isPunish(target, tick)) return { keepCooldown: true };
    return undefined;
  }
  // OBS: it costs a weapon that is ready nothing either: 6 of 47 punishes with
  // a 7-tick greataxe, which swung again 2 ticks later in 5 of them.
  isPunish(target, tick) {
    return target.id === bossActorId && this.isSlamTick(tick) && playerFormulaStyle(this.world?.getPlayer()).startsWith("melee");
  }
  // A standard ranged hit on a larva in the air never misses (WIKI: it dies of it).
  // inferred: a crush punish never misses either (WIKI: crush gets "a
  // significant accuracy boost"; others an unnamed one, not modelled).
  alwaysAccurate(context, attack) {
    if (this.larvae.isLarva(attack.target)) return this.shootsLarva(attack.target, context.tick, playerFormulaStyle(context.player), context.player?.equipment?.weapon);
    return attack.target.id === bossActorId && attack.style === "melee" && this.isSlamTick(context.tick) && playerFormulaStyle(context.player) === "melee_crush";
  }
  onPlayerAttackStarted(attack) {
    this.lastTargetId = attack.targetId;
    if (attack.targetId === bossActorId && this.isSlamTick(attack.tick) && attack.attackKind?.startsWith("melee")) this.punish = { tick: attack.tick };
  }
  playerDamage(damage, target, attack) {
    if (attack.hitsplatType === "burn" || attack.hitsplatType === "poison") return damage;
    if (this.larvae.isLarva(target)) return attack.style === "range" && this.shootsLarva(target, this.now, "ranged", attack.weaponId) ? target.vitals.hp : damage;
    if (target.id !== bossActorId) return damage;
    let result = damage;
    if (this.punish && attack.attackKind?.startsWith("melee")) {
      this.punish = null;
      result = Math.floor(result * punishBonus);
    }
    const spell = fireSpell(attack.spellId);
    if (spell && attack.accuracySucceeded) {
      // WIKI: the weakness adds its share of the spell's base max hit to the
      // max hit. inferred: added here as a roll of its own up to that share,
      // which keeps the max and the mean of the game's single roll.
      result += this.randomInt(0, Math.floor((spell.maxHit * weaknessPercent[this.version(target)]) / 100));
      applyBurnStack({ target, sourceId: "player", origin: "maggot-king-fire", severity: "normal", pulses: burnPulses, tick: this.now });
    }
    return result;
  }

  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== bossActorId) return;
    this.tasks = [];
    this.pending = [];
    this.phase = "dead";
    this.slam = null;
    this.incoming = [];
    const boss = context.world.getNpc(bossActorId);
    if (boss) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ spotAnimId: spotAnims.death, target: buildActorVisualTarget(boss), height: 0, delayCycles: 0 }] });
    this.larvae.dieWithHim(context);
    // OBS: the floor is cleared the tick after.
    this.later(1, () => this.floor.reset());
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + deathTicks, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }
  getOutcome() {
    return this.outcome;
  }
  // The scene draws the floor from this (presentation.js); a script reads
  // what is coming (tools/determinism/scenarios/maggot-king.mjs).
  getSnapshot() {
    return {
      kind: this.kind,
      state: {
        phase: this.phase,
        style: this.style,
        final: this.final,
        screeching: this.screeching(),
        screechAt: this.screechAt,
        nextAttackAt: this.nextAt,
        attacksLeft: this.attacksLeft,
        slam: this.slam && this.slam.landsAt > this.now ? { tiles: this.slam.tiles, landsAt: this.slam.landsAt } : null,
        incoming: this.incoming,
        ...this.floor.snapshot(),
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel(npcId) {
    return npcId === bossActorId ? "Maggot King" : "Ur-maggot larvae";
  }
  getNpcDefinitions() {
    return this.definitions;
  }
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }
}

export const maggotKingDefinition = {
  kind: maggotKingKind,
  factory: () => new MaggotKingEncounter(),
  descriptor: {
    kind: maggotKingKind,
    displayName: "Maggot King",
    description: "Vampyrium. Ranged and magic spits around screeches, bile and carrion on the floor, larvae that eat it, and head slams once he comes close.",
    mapSquare: maggotKingMapSquare,
    playerStart,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "THE MAGGOT KING DEFEATED", accent: "blood" },
    isWorkInProgress: true,
    loadouts: maggotKingLoadouts,
  },
  controls: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker: after the Doom.
export { maggotKingDefinition as definition };
export const order = 25;
