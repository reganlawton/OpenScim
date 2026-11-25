// The Alchemical Hydra (https://oldschool.runescape.wiki/w/Alchemical_Hydra),
// in its chamber in the Karuulm Slayer Dungeon.
//
// It attacks with ranged and magic, every 6 ticks: three basic attacks a
// style, then the other style, its heads swaying back as it switches. A
// phase's fourth attack is its special, then every tenth. At 825, 550 and
// 275 hitpoints a head falls off and it takes its next form:
// - serpentine (green): two projectiles an attack; its special is poison,
//   five blobs thrown at and around the player, which splash and leave pools
//   (poison.js);
// - electric (blue): its special is lightning, four currents that close in
//   on the player and bind them (lightning.js);
// - flame (red): its special walks it back to the middle, where it stuns the
//   player, breathes walls of fire to either side of them and then a fire
//   that follows them (fire.js);
// - enraged (grey): an attack every 4 ticks, the style changing every attack,
//   and the poison again.
// The first three forms take 75% less damage until the vent of the colour
// that beats theirs erupts under them (red for green, green for blue, blue for
// red). The three vents erupt together every 8 ticks; any other vent under it
// empowers it, its hits up by half, until the right one weakens it.
//
// Sources: WIKI the Alchemical Hydra and its Strategies page; TABLE the
// monster table; CACHE the game cache's ids (ids.js) and the lengths of its
// sequences. OBS (tsps) is RSPSApp's reading of five rsprox recordings of the
// game (1000143, 1000471, 1000473, 1000480 and 1000497, revision 227, 150+
// kills from kill count 1 to 99, two accounts: RSPSApp/tsps
// docs/alchemical-hydra.md and server/plugins/bosses/data/alchemical-hydra.json);
// "tsps, theirs" is what RSPSApp chose where no source settles it. Where
// those recordings and the wiki disagree on a number, the recordings are
// followed and the wiki's number named beside them. Numbers no source gives
// are marked inferred. There are no Outside recordings of it yet.
//
// Not yet: "The chemical burns you as it cascades over you." (recorded 10
// times, 9 to 17 damage). Nothing says where it comes from: OBS (tsps) it lines
// up with no vent or fire tile; the wiki's two pages do not have it, and the
// cache has no text of it. One draft of a wiki user's (User:Kanga/Sandbox1)
// says that "standing on the vents above the chemical pool will deal damage to
// the player when it bursts up", which the recordings do not bear out. (CACHE:
// a player can stand on the three vents' tiles.)
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { setNpcDefenceDrain } from "../../engine/npcState.js";
import { CollisionFlag } from "../../engine/collision.js";
import { setArenaConfig, getArenaDefaultWalkable } from "../../engine/arena.js";
import { defineNpc, NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import {
  npcTypeIds, bossSize, bossStart, playerStart, vents, heads, key, same, chebyshev, gapTo, footprintTiles, spotAnims,
} from "./ids.js";
import { Poison } from "./poison.js";
import { Lightning } from "./lightning.js";
import { Fire } from "./fire.js";
import { alchemicalHydraLoadouts } from "./loadouts.js";

export const alchemicalHydraKind = "alchemical_hydra";
// CACHE: the chamber is map square 21,160 (region 5536).
export const alchemicalHydraMapSquare = { x: 21, y: 160 };
export const bossActorId = "alchemical-hydra";

// The four phases. `below`: the hitpoints at which it leaves the phase (WIKI:
// 75%, 50%, 25% of 1,100). `vent`: the vent that weakens it (WIKI).
// `changeTicks`: ticks from the head falling to the next form (OBS (tsps):
// 2 out of serpentine, 142 of 157 changes; 1 out of electric, 134; 2 out of
// flame, 86 of 157, the rest 3). `form` and `toNext`: its NPC types (CACHE).
export const phases = [
  { name: "serpentine", form: npcTypeIds.serpentine, toNext: npcTypeIds.toElectric, version: "Serpentine", below: 825, vent: "red", special: "poison", changeTicks: 2 },
  { name: "electric", form: npcTypeIds.electric, toNext: npcTypeIds.toFlame, version: "Electric", below: 550, vent: "green", special: "lightning", changeTicks: 1 },
  { name: "flame", form: npcTypeIds.flame, toNext: npcTypeIds.toEnraged, version: "Fire", below: 275, vent: "blue", special: "fire", changeTicks: 2 },
  { name: "enraged", form: npcTypeIds.enraged, toNext: null, version: "Extinguished", below: 0, vent: null, special: "poison", changeTicks: 0 },
];
// Max hits and projectiles an attack, by phase and style. WIKI: the infobox's
// max hits (serpentine 17 x 2, electric 35, flame 35, enraged 55). OBS (tsps):
// how many projectiles each throws (5,671 attacks), and that the electric
// form's magic is two of 17 (114 hits never past 17) and its ranged one of 35.
const styles = [
  { range: { maxHit: 17, hits: 2 }, magic: { maxHit: 17, hits: 2 } },
  { range: { maxHit: 35, hits: 1 }, magic: { maxHit: 17, hits: 2 } },
  { range: { maxHit: 35, hits: 1 }, magic: { maxHit: 35, hits: 1 } },
  { range: { maxHit: 55, hits: 1 }, magic: { maxHit: 55, hits: 1 } },
];
// WIKI: empowered, 26 for 17 and 52 for 35 (the infobox's empowered max hits); 55 stays.
const empowered = { 17: 26, 35: 52, 55: 55 };
const attackTicks = 6; // WIKI, TABLE, OBS (tsps)
const enragedAttackTicks = 4; // WIKI, TABLE, OBS (tsps)
const firstAttackTick = 1; // OBS (tsps): it attacks on the tick the player comes in
const afterSpawnTicks = [6, 6, 6, 4]; // OBS (tsps): its first attack after a new form's spawn
const styleEvery = 3; // WIKI, OBS (tsps): three basic attacks a style, the count carried over a phase change
const swayTicks = 3; // OBS (tsps): the heads sway 3 ticks after the third attack of a style
const specialAt = 4; // WIKI, OBS (tsps): a phase's fourth attack is its special ...
const specialEvery = 10; // ... then every tenth (OBS (tsps): 30 runs past the second)
const reach = 10; // OBS (tsps): it attacks from up to 9 tiles of its footprint; 10 is tsps, theirs ...
const closeIn = 4; // ... and walks while the player is further than 4 off it (13,643 of 13,773 ticks at 4 it stayed)
const shieldedShare = 0.25; // WIKI: 75% damage reduction while shielded
// OBS (tsps): every flight starts at cycle 30 and ends at 40 + 5 a tile from
// its south-west tile to the target (2,786 flights); its hit lands the whole
// ticks of that later. The first head's from 30 high, the second's from 35,
// to 16; the first's progress 64 (it is 64 or 0 recorded, no pattern found).
const flight = { start: 30, base: 40, perTile: 5, startHeights: [30, 35], endHeight: 16, startOffsets: [64, 0] };
// OBS (tsps): the vents erupt together every 8 ticks of the world's clock
// (3,856 of 3,863 gaps), go off 5 ticks later, and count 2 ticks after the
// eruption: a vent tile under its 6 x 6 (934 of 934). inferred: where the
// world's clock stands as a run starts is drawn from its seed.
const ventEvery = 8;
const ventOnTicks = 5;
const ventCountsAfter = 2;
// OBS (tsps): at 0 hitpoints it plays its death, becomes its last form 3 ticks
// later and is gone 7 ticks after that.
const lastFormAfter = 3;
const deathTicks = 10;
const messages = {
  weakened: "The chemicals neutralise the Alchemical Hydra's defences!",
  empowered: "The chemicals are absorbed by the Alchemical Hydra, empowering it further!",
  absorbed: "The Alchemical Hydra's defences partially absorb your attack!",
  enraged: "The Alchemical Hydra becomes enraged!",
  changingForm: "You cannot attack the Alchemical Hydra as it changes form!",
}; // OBS (tsps)
const roar = "Roaaaaaaaaaaar!"; // WIKI, OBS (tsps)
const roarTicks = 5; // inferred: how long it stays over its heads, as Sol Heredit's lines do
const sounds = { switch: 4106, roar: 4076, geyser: 4078, death: 4080 }; // OBS (tsps)

// TABLE: its stats, by phase (its four versions; the same but for the flame form's burn immunity).
const formulaStatsOf = (phase) => getMonsterFormulaStats(phases[phase].form, phases[phase].version);
const opposite = (style) => (style === "range" ? "magic" : "range");
const octants = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];

const bossDefinition = defineNpc({
  id: "alchemical-hydra",
  move: ({ actor, context, config }) => config.moveBoss(actor, context),
  tick: ({ actor, context, config }) => config.bossTurn(actor, context),
});

class AlchemicalHydraEncounter {
  kind = alchemicalHydraKind;
  constructor() {
    this.poison = new Poison(this);
    this.lightning = new Lightning(this);
    this.fire = new Fire(this);
    this.arenaBase = null;
    this.floor = new Set();
    this.definitions = new NpcDefinitionRegistry([bossDefinition.register(this)]);
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
    this.epoch = 0; // counts the phase changes and the death: a task of an earlier one does nothing
    this.phase = 0;
    this.changing = null; // { until, from }
    this.shielded = true;
    this.empowered = false;
    // WIKI: "it can start off with either attack style"; OBS (tsps): both are recorded.
    this.style = this.random() < 0.5 ? "range" : "magic";
    this.basics = 0; // basic attacks of the current style
    this.attacks = 0; // attacks this phase, specials included
    this.nextAttackAt = firstAttackTick;
    this.boundUntil = 0;
    this.attackedShieldAt = null; // the tick of the player's last attack on its shield
    this.ventOffset = Math.floor(this.random() * ventEvery);
    this.lastEruption = null;
    this.dead = false;
    this.poison.reset();
    this.lightning.reset();
    this.fire.reset();
    this.updateArena();
  }
  randomInt(low, high) {
    return low + Math.floor(this.random() * (high - low + 1));
  }
  // `outlivesIt`: runs after its death too.
  later(ticks, task, { outlivesIt = false } = {}) {
    this.tasks.push({ tick: this.now + ticks, task, outlivesIt });
  }
  boss(world = this.world) {
    return world?.getNpc(bossActorId);
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
    this.outcome = { phase: "active" };
    this.startRun();
    const boss = context?.world.actors.get(bossActorId);
    if (!boss) return;
    Object.assign(boss, this.formOf(0));
    boss.position = [...bossStart];
    boss.previousPosition = [...bossStart];
    boss.attackBlockedUntilTick = undefined;
    boss.combat.targetId = "player";
  }
  formOf(phase) {
    return { npcTypeId: phases[phase].form, formulaStats: formulaStatsOf(phase) };
  }
  createNpcs() {
    const hp = getMonsterHitpoints(npcTypeIds.serpentine); // TABLE: 1,100
    return [
      bossDefinition.createActor(
        {
          id: bossActorId, kind: "npc", role: "boss", archetypeId: "alchemical_hydra", size: bossSize, alive: true,
          ...this.formOf(0),
          position: [...bossStart], previousPosition: [...bossStart], facing: 0, history: new Map(),
          vitals: { hp, maxHp: hp },
          combat: {
            attackSpeed: attackTicks, attackRange: reach, attackStyle: this.style, nextActionTick: firstAttackTick, targetId: "player", lastAttackTick: null,
            animations: { idle: null, walk: null, run: null, attack: null, death: null },
          },
        },
        {},
      ),
    ];
  }

  // --- the chamber's floor ------------------------------------------------
  // The arena from the map, and the tiles the Hydra's fires block while they stand.
  refineArenaConfig(arena) {
    this.arenaBase = arena;
    this.floor = new Set(arena?.walkableTiles ?? []);
    return this.arenaWithBlockers();
  }
  arenaWithBlockers() {
    const base = this.arenaBase;
    if (!base?.collisionMap) return base;
    const blocked = this.fire.blockedTiles();
    if (blocked.size === 0) return base;
    const map = base.collisionMap;
    const getFlag = (x, y) => (blocked.has(x + "," + y) && map.getFlag(x, y) !== -1 ? map.getFlag(x, y) | CollisionFlag.OBJECT : map.getFlag(x, y));
    return {
      bounds: base.bounds,
      walkableTiles: base.walkableTiles ? new Set([...base.walkableTiles].filter((tile) => !blocked.has(tile))) : null,
      collisionMap: { sizeX: map.sizeX, sizeY: map.sizeY, getFlag, hasFlag: (x, y, mask) => { const flag = getFlag(x, y); return flag !== -1 && (flag & mask) !== 0; } },
    };
  }
  updateArena() {
    if (this.arenaBase) setArenaConfig(this.arenaWithBlockers(), getArenaDefaultWalkable());
  }
  // A tile of the chamber's floor (any tile, before the arena is built).
  isFloor(tile) {
    return this.floor.size === 0 || this.floor.has(key(tile));
  }
  // Whether the Hydra can stand with its south-west tile here: all of it on
  // the floor or a vent (it stands over the vents). Its own blockers do not stop it.
  canStand(position) {
    const ventTiles = Object.values(vents);
    return footprintTiles(position).every((tile) => this.isFloor(tile) || ventTiles.some((vent) => same(vent, tile)));
  }

  // --- every tick ----------------------------------------------------------
  // Before the NPCs: what is due, the vents, the burn.
  resolveHazards(context) {
    this.now = context.tick;
    this.world = context.world;
    for (let due = this.takeDueTask(); due; due = this.takeDueTask()) due.task(context);
    if (this.changing) this.refuseAttack(context);
    if (!this.dead) {
      this.vents(context);
      for (const hit of this.fire.tick(context)) this.hurt(hit);
    }
    return this.drainPending(context);
  }
  // After the player has moved: the pools, the currents and the fires.
  processPostTick(context) {
    this.now = context.tick;
    if (this.outcome.phase === "resolving" && context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    const player = context.world.getPlayer();
    for (const hit of this.poison.step(player, context.tick)) this.hurt(hit);
    if (!this.dead) {
      this.absorbs(context);
      for (const hit of [...this.lightning.step(player, context), ...this.fire.step(player, context)]) this.hurt(hit);
    }
    return this.drainPending(context);
  }
  takeDueTask() {
    const index = this.tasks.findIndex((entry) => entry.tick <= this.now);
    return index < 0 ? null : this.tasks.splice(index, 1)[0];
  }
  // Damage to the player, applied by the hook that runs next.
  hurt(hit) {
    this.pending.push({ attackType: "typeless", ...hit });
  }
  drainPending(context) {
    const player = context.world.getPlayer();
    const hits = this.pending.map((hit) => ({ ...hit, playerPosition: [...player.position] }));
    this.pending = [];
    return player.alive ? hits : [];
  }
  // A game message: its text, or a segment of it ({ text, color }).
  message(context, message) {
    context.tickEvents.emit({ type: "game_message", kind: "game", segments: [typeof message === "string" ? { text: message } : { ...message }] });
  }
  // A visual event: the Hydra's clips, projectiles, graphics, and the sounds
  // the audio layer plays (audio.js).
  visual(context, { animations = [], projectiles = [], graphics = [], sounds = [] }) {
    emitInfernoVisual(context.tickEvents, {
      animations: animations.map((clipId) => ({ actorId: bossActorId, clipId, delayCycles: 0 })),
      projectiles, graphics, hydraSounds: sounds,
    });
  }
  // The player is bound until this tick; a later bind extends one, never shortens it (OBS (tsps)).
  bind(tick, ticks) {
    this.boundUntil = Math.max(this.boundUntil, tick + ticks);
  }
  isBound(tick = this.now) {
    return tick < this.boundUntil;
  }

  // --- the vents -----------------------------------------------------------
  vents(context) {
    const tick = context.tick;
    if ((tick - this.ventOffset) % ventEvery === 0) {
      this.lastEruption = tick;
      const ventTiles = Object.values(vents);
      this.visual(context, { sounds: ventTiles.map((tile) => ({ id: sounds.geyser, delayCycles: 38, range: 10, position: [...tile] })) });
    }
    if (this.lastEruption === null || tick !== this.lastEruption + ventCountsAfter) return;
    const boss = this.boss(context.world);
    if (!boss?.alive || this.changing) return;
    const want = phases[this.phase].vent;
    for (const [colour, tile] of Object.entries(vents)) {
      if (gapTo(tile, boss.position) !== 0) continue;
      if (colour === want) {
        if (!this.shielded) continue;
        // OBS (tsps): once a phase; the roar and its sound. WIKI: "Roaaaaaaaaaaar!" over it.
        this.shielded = false;
        this.empowered = false;
        this.message(context, messages.weakened);
        context.tickEvents.emit({ type: "overhead_text", anchor: { kind: "actor", actorId: bossActorId }, overheadText: roar, overheadCycle: roarTicks });
        this.visual(context, { sounds: [{ id: sounds.roar, range: 15, position: this.middle(boss) }] });
      } else {
        // OBS (tsps): any other vent, every eruption, enraged too.
        this.empowered = true;
        this.message(context, messages.empowered);
      }
    }
  }
  erupting(tick = this.now) {
    return this.lastEruption !== null && tick - this.lastEruption < ventOnTicks;
  }

  // --- its movement --------------------------------------------------------
  moveBoss(boss, context) {
    this.now = context.tick;
    this.world = context.world;
    if (!boss.alive || this.dead) return [];
    if (this.changing) return [];
    if (this.checkPhase(boss, context)) return [];
    if (this.fire.walking()) return this.fire.walkStep(boss);
    if (this.fire.busy(context.tick)) return [];
    const player = context.world.getPlayer();
    if (!player.alive) return [];
    const gap = gapTo(player.position, boss.position);
    // Under it: the engine's way out from under (inferred).
    if (gap === 0) return getNpcPursuitMoves(boss, { ...context, random: this.random });
    if (gap <= closeIn) return [];
    const [px, py] = player.position;
    const [x, y] = boss.position;
    const dx = px < x ? -1 : px > x + bossSize - 1 ? 1 : 0;
    const dy = py < y ? -1 : py > y + bossSize - 1 ? 1 : 0;
    const step = [[x + dx, y + dy], [x + dx, y], [x, y + dy]].find((to) => !same(to, boss.position) && this.canStand(to));
    return step ? [{ npcId: boss.id, path: [step] }] : [];
  }

  // --- the phases ----------------------------------------------------------
  // Past its phase's threshold a head falls and it changes form, holding still.
  checkPhase(boss, context) {
    if (this.phase >= 3 || boss.vitals.hp > phases[this.phase].below) return false;
    this.beginChange(boss, context);
    return true;
  }
  beginChange(boss, context) {
    const from = this.phase;
    this.epoch++;
    this.changing = { from, until: context.tick + phases[from].changeTicks };
    this.swapForm(boss, { npcTypeId: phases[from].toNext });
    boss.attackBlockedUntilTick = context.tick + 1; // the player's attack ends quietly: his next needs a click (OBS (tsps): 425 of 426)
    this.visual(context, { animations: ["phaseOut"] });
    // WIKI: a special in progress ends; the lightning dissipates; the fires stay.
    this.fire.endSpecial(boss);
    this.lightning.reset();
    this.later(phases[from].changeTicks, (ctx) => this.endChange(ctx));
  }
  // It changes form: a click on it (the player's target is read before this, so a target now is a click of this tick)
  // is refused with the game's message (OBS (tsps)), wherever the player stands (inferred). Blocking it for this tick
  // alone drops the target before he moves or attacks, and lets the next tick's click reach here.
  refuseAttack(context) {
    const boss = this.boss(context.world);
    if (!boss) return;
    if (context.world.getPlayer().attackTarget === bossActorId) this.message(context, messages.changingForm);
    boss.attackBlockedUntilTick = context.tick + 1;
  }
  endChange(context) {
    const boss = this.boss(context.world);
    if (!boss?.alive || !this.changing) return;
    this.phase = this.changing.from + 1;
    this.changing = null;
    this.attacks = 0;
    this.shielded = this.phase < 3; // WIKI: no shield once enraged
    this.empowered = false;
    this.swapForm(boss, this.formOf(this.phase));
    boss.attackBlockedUntilTick = undefined;
    boss.combat.attackSpeed = this.phase === 3 ? enragedAttackTicks : attackTicks;
    this.nextAttackAt = context.tick + afterSpawnTicks[this.phase];
    boss.combat.nextActionTick = this.nextAttackAt;
    this.visual(context, { animations: ["phaseIn"] });
    if (this.phase === 3) this.message(context, messages.enraged);
  }
  // Another form (the scene draws it anew: presentation.js).
  swapForm(boss, form) {
    Object.assign(boss, form);
  }
  // A boss hitpoints preset: straight into the phase of those hitpoints, without a change.
  enterBossHpPhase(hp, context) {
    const boss = this.boss(context.world);
    if (!boss?.alive) return;
    const phase = phases.findIndex((entry) => hp > entry.below);
    if (phase < 0 || phase === this.phase) return;
    this.epoch++;
    this.changing = null;
    this.fire.endSpecial(boss);
    this.lightning.reset();
    this.phase = phase;
    this.attacks = 0;
    this.shielded = phase < 3;
    this.empowered = false;
    this.swapForm(boss, this.formOf(phase));
    boss.attackBlockedUntilTick = undefined;
    boss.combat.attackSpeed = phase === 3 ? enragedAttackTicks : attackTicks;
    this.nextAttackAt = Math.max(this.nextAttackAt, context.tick + 1);
  }

  // --- its turn ------------------------------------------------------------
  bossTurn(boss, context) {
    const idle = { environmentalDamages: [] };
    this.now = context.tick;
    if (!boss.alive || this.dead || this.changing) return idle;
    if (this.fire.special) {
      this.fire.turn(boss, context);
      if (this.fire.special) return idle;
    }
    const player = context.world.getPlayer();
    if (!player.alive || context.tick < this.nextAttackAt) return idle;
    const gap = gapTo(player.position, boss.position);
    if (gap === 0 || gap > reach) return idle; // inferred: it waits for a target it can reach
    const n = this.attacks + 1;
    const special = n === specialAt || (n > specialAt && (n - specialAt) % specialEvery === 0);
    this.attacks = n;
    boss.combat.lastAttackTick = context.tick;
    this.nextAttackAt = context.tick + (this.phase === 3 ? enragedAttackTicks : attackTicks);
    boss.combat.nextActionTick = this.nextAttackAt;
    if (special) {
      this.special(boss, player, context);
      return idle;
    }
    const style = this.phase === 3 || this.basics >= styleEvery ? opposite(this.style) : this.style;
    if (style !== this.style) this.basics = 0;
    this.style = style;
    this.basics++;
    boss.combat.attackStyle = style;
    if (this.phase < 3 && this.basics === styleEvery) {
      const epoch = this.epoch;
      this.later(swayTicks, (ctx) => {
        if (this.epoch !== epoch || this.dead || this.fire.walking()) return;
        this.visual(ctx, { animations: ["switch"], sounds: [{ id: sounds.switch, delayCycles: 5, range: 15, position: this.middle(boss) }] });
      });
    }
    return { environmentalDamages: [], npcAttacks: this.basicAttack(boss, player, style, context) };
  }
  middle(boss) {
    return [boss.position[0] + (bossSize >> 1), boss.position[1] + (bossSize >> 1)];
  }
  // The way it faces a tile, one of eight from its footprint's middle (tsps).
  facingName(boss, [tx, ty]) {
    const half = (bossSize - 1) / 2;
    const dx = tx - (boss.position[0] + half);
    const dy = ty - (boss.position[1] + half);
    if (dx === 0 && dy === 0) return "S";
    return octants[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  }
  // Where its heads launch from (ids.js); a second head from the same tile
  // pulled into the footprint's inner 4 x 4 (OBS (tsps)).
  launchTiles(boss, style, target, count) {
    const [x, y] = heads[this.facingName(boss, target)][style === "range" ? "ranged" : "magic"];
    const tiles = [[boss.position[0] + x, boss.position[1] + y]];
    if (count > 1) tiles.push([boss.position[0] + Math.min(4, Math.max(1, x)), boss.position[1] + Math.min(4, Math.max(1, y))]);
    return tiles;
  }
  maxHitOf(style) {
    const { maxHit, hits } = styles[this.phase][style];
    return { maxHit: this.empowered ? (empowered[maxHit] ?? maxHit) : maxHit, hits };
  }
  basicAttack(boss, player, style, context) {
    const { maxHit, hits } = this.maxHitOf(style);
    const end = flight.base + flight.perTile * chebyshev(boss.position, player.position);
    const impactDelayTicks = Math.max(1, Math.floor(end / 30)); // OBS (tsps): an 85-cycle flight hits on the 2nd tick
    const attacks = [];
    for (let n = 0; n < hits; n++) {
      const attack = rollNpcAttack({
        attacker: boss, target: player, random: this.random,
        plan: {
          formulaStyle: style === "range" ? "ranged" : "magic", damageType: style, attackKind: style === "range" ? "range_arrow" : "magic",
          // inferred: the player's protection prayer counts as the hit lands; WIKI: if it dies first, the hit does nothing.
          maxHit, impactDelayTicks, prayerCheckAt: "impact", sourceDeathPolicy: "cancel-before-impact",
        },
      });
      if (!attack) throw new TypeError("Missing formula stats for the Alchemical Hydra");
      attacks.push(n === 0 ? attack : { ...attack, isContinuation: true });
    }
    const target = buildActorVisualTarget(player);
    const projectiles = this.launchTiles(boss, style, player.position, hits).map((from, n) => ({
      spotAnimId: style === "range" ? spotAnims.ranged : spotAnims.magic, sourcePosition: [from[0] + 0.5, from[1] + 0.5], target,
      startDelayCycles: flight.start, endDelayCycles: end, slope: 0, startOffset: flight.startOffsets[n], startHeight: flight.startHeights[n], endHeight: flight.endHeight,
    }));
    emitInfernoNpcAttack(context, { actor: boss, target: player, clipId: style, kind: "alchemical_hydra_" + style, impactDelayTicks, projectiles });
    return attacks;
  }
  special(boss, player, context) {
    const kind = phases[this.phase].special;
    if (kind === "fire") {
      // WIKI: it walks to the middle first; the breaths carry their own sequences.
      this.fire.start(context);
      return;
    }
    faceActorToward(boss, player);
    this.visual(context, { animations: ["special"] });
    if (kind === "poison") this.poison.throw(boss, player, context);
    else this.lightning.cast(boss, context);
  }

  // --- the player ----------------------------------------------------------
  getEngineRules() {
    return {
      // WIKI: 75% less damage while shielded.
      playerDamageOnNpc: (damage, { target, attack }) => (target.id === bossActorId && this.shielded ? this.shieldHit(damage, target, attack) : damage),
    };
  }
  // A hit on its shield: what is left of it. WIKI: the "BGS spec applies before Hydra's 75% damage reduction": the engine
  // drains what the hit does, and the rest of the hit is drained here.
  shieldHit(damage, boss, attack) {
    const left = Math.floor(damage * shieldedShare); // inferred: rounded down
    if (attack?.postHitEffects?.some((effect) => effect.effect === "drain_defence" && effect.flat)) setNpcDefenceDrain(boss, (boss.debuffs?.defenceDrain ?? 0) + damage - left);
    return left;
  }
  onPlayerAttackStarted(attack, context) {
    // Whether it lands is known once its hits are queued (absorbs).
    if (attack.targetId === bossActorId && this.shielded && !this.dead) this.attackedShieldAt = attack.tick;
  }
  // OBS (tsps): the message on the attack's tick, for a hit that lands: not for a miss. A thrall's hit has no weapon.
  absorbs(context) {
    if (this.attackedShieldAt !== context.tick) return;
    const landed = context.world.pendingHits.some(
      (hit) => hit.sourceId === "player" && hit.targetId === bossActorId && hit.launchTick === context.tick && hit.accuracySucceeded && Object.hasOwn(hit, "weaponId"),
    );
    if (landed) this.message(context, messages.absorbed);
  }
  // Pushed out from under it as it turns solid, or held where he stands while bound.
  moveDisplacedPlayer(player, targetTile, place) {
    const out = this.fire.pushOutTile(player);
    if (out) {
      place(out, player.facing);
      return true;
    }
    if (!this.isBound()) return undefined;
    player.previousPosition = [...player.position];
    player.movementPath = [];
    player.isMoving = false;
    player.isRunning = false;
    return false;
  }

  // --- its death -----------------------------------------------------------
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== bossActorId) return;
    this.dead = true;
    this.epoch++;
    this.tasks = this.tasks.filter((entry) => entry.outlivesIt);
    this.pending = [];
    this.changing = null;
    // WIKI: its poison stays: "Poison blobs will still deal damage and need to be avoided as these will fade as normal".
    // tsps: its death clears every current and fire.
    this.lightning.reset();
    this.fire.reset();
    this.boundUntil = 0;
    this.updateArena();
    const boss = this.boss(context.world);
    if (boss) this.visual(context, { sounds: [{ id: sounds.death, range: 15, position: this.middle(boss) }] });
    // Its last form, drawn playing hydra_death (presentation.js). inferred: killed before it was enraged, it falls the same.
    this.later(lastFormAfter, (ctx) => {
      const dead = this.boss(ctx.world);
      if (!dead || dead.alive) return;
      this.swapForm(dead, { npcTypeId: npcTypeIds.dead });
      this.visual(ctx, { animations: ["finalDeath"] });
    }, { outlivesIt: true });
    if (completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + deathTicks, primaryActorId: bossActorId, completionActorIds: [bossActorId] };
  }
  getOutcome() {
    return this.outcome;
  }
  // The scene draws the vents from this (presentation.js); a script reads
  // what is coming (tools/determinism/scenarios/alchemical-hydra.mjs).
  getSnapshot({ tick } = {}) {
    const now = tick ?? this.now;
    const n = this.attacks + 1;
    return {
      kind: this.kind,
      state: {
        phase: phases[this.phase].name,
        changing: this.changing !== null,
        shielded: this.shielded,
        empowered: this.empowered,
        style: this.style,
        basics: this.basics,
        attacks: this.attacks,
        nextIsSpecial: n === specialAt || (n > specialAt && (n - specialAt) % specialEvery === 0),
        nextAttackAt: this.nextAttackAt,
        weakeningVent: phases[this.phase].vent,
        erupting: this.erupting(now),
        eruptedAt: this.lastEruption,
        nextEruption: now + ((((this.ventOffset - now) % ventEvery) + ventEvery) % ventEvery),
        bound: this.isBound(now),
        boundUntil: this.boundUntil,
        ...this.poison.snapshot(now),
        ...this.lightning.snapshot(now),
        ...this.fire.snapshot(now),
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel() {
    return "Alchemical Hydra";
  }
  getNpcDefinitions() {
    return this.definitions;
  }
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }
}

const phasePresets = [
  { label: "Serpentine (full)", hp: 1100, hint: "Shielded until the red vent erupts under it." },
  { label: "Electric (75%)", hp: 825, hint: "Lightning; the green vent weakens it." },
  { label: "Flame (50%)", hp: 550, hint: "Fire walls and the tracking fire; the blue vent weakens it." },
  { label: "Enraged (25%)", hp: 275, hint: "No shield; an attack every 4 ticks, the style changing every attack." },
];

export const alchemicalHydraDefinition = {
  kind: alchemicalHydraKind,
  factory: () => new AlchemicalHydraEncounter(),
  descriptor: {
    kind: alchemicalHydraKind,
    displayName: "Alchemical Hydra",
    description: "The Karuulm Slayer Dungeon: three-attack style switches, its shield and the vents that take it away, and the poison, lightning and fire of its four forms.",
    mapSquare: alchemicalHydraMapSquare,
    playerStart,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "THE ALCHEMICAL HYDRA DEFEATED", accent: "gold" },
    isWorkInProgress: true,
    loadouts: alchemicalHydraLoadouts,
    // The vents, in their colours, and the middle its flame special walks it back to.
    tileMarkerPresets: [{
      id: "alchemical_hydra_vents", name: "Vents", description: "The red, green and blue vents, and the tiles its flame special walks it back to",
      link: "https://oldschool.runescape.wiki/w/Alchemical_Hydra/Strategies",
      markers: [
        [...vents.red, "#CCFF3030", "Red"], [...vents.green, "#CC30FF30", "Green"], [...vents.blue, "#CC3080FF", "Blue"],
        ...footprintTiles(bossStart).map(([x, y]) => [x, y, "#66FFFFFF"]),
      ],
    }],
  },
  controls: {
    defaultMechanicsConfig: {},
    mechanicsToggles: [],
    bossHpPresets: phasePresets,
    debugActions: [],
  },
};
// How the registry finds it (encounters/registry.js), and where it stands in the encounter picker.
export { alchemicalHydraDefinition as definition };
export const order = 77;
