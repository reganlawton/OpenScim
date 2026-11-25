// Zebak (Tombs of Amascut). The encounter is client/toa/zebak/*.js; together
// these fights run every part of it that player inputs reach, and the engine
// paths that exist only for it (jug actions, the tide, Tombs-only weapons).
//
// The arena: Zebak fills x 14-22, y 28-36 and faces east. The platform is
// x 22-38, y 22-42, less a few tiles of its corners and edges; column 23 beside
// him is the bite row. A Great Roar is survived on the one to three tiles east
// of a rock, on its row. Tidal Waves start at y 21 (first time, moving north) or
// y 43 (second time, moving south), cover columns 19-39 and leave a gap of 3, 2
// or 1 tiles by path level. A wave is its crest and the two rows behind it: it
// strikes a player who stands in them outside the gap, if his last step was in
// them too, and throws him 3 rows on after the step he was making. A player
// thrown off the platform lands on the row he swims on (45 north, 20 south), swims a tile a tick and
// climbs out by the Rock steps (columns 29-30 north, 30-31 south).
//
// Timing, at path 0: Zebak acts first on tick 4 and then every 7 ticks; a spit
// hits 8 ticks after it starts. A special's spit is animated a tick after the
// special starts; its rocks, jugs and acid all land 6 ticks after the start (7
// when a blood spell was cast as it started). A first roar is 34 ticks after
// its special starts (29 for a second): its dust on the roar's 3rd, 5th and 7th
// tick, its damage on the 4th, 6th and 8th, and it is over on the 11th. After a
// roar's special he first spits 11 ticks on. The waves' boulders fall 8 ticks
// after they start, the three crests appear 15, 22 and 29 ticks after and move
// one row a tick; he spits 16 and 23 ticks after the start and then not before
// the 33rd. Specials are queued when his hitpoints cross 85%, 70%, 55% and 40%;
// under 25% he is enraged. Acid hits 6-9 a tick as poison, a wave 6-10, both
// times the raid level's scale, and each takes a fifth of its damage in prayer
// points. A blood cloud appears on a 3x3 by either shore, walks onto the
// player's tile, hits him the tick after and rests two ticks; it loses 2
// hitpoints every tick. Which special comes first, the layouts and the gaps
// follow from the seed, so the tick numbers and tiles in the scripts below are
// those of each scenario's seed.
//
// The scripts read the encounter snapshot and fields of the actors that have
// real names (position, facing, npcTypeId, archetypeId, vitals, attackTarget,
// inventory). Nothing is read from api.engine.encounter.
import { attack, boss, command, equip, item, magicGear, meleeGear, offensive, protect, rangedGear, setBossHp, special, toggleRun, use } from "./common.mjs";

const ZEBAK = "zebak";
/** In the Tombs: more accurate when the target is under 25%, heals on a kill, and its special is Tumeken's Light. */
const KERIS_PARTISAN_OF_THE_SUN = 27291;
/** Its special heals the player: an effect on the target's debuffs that is not a Defence drain. */
const SARADOMIN_GODSWORD = 11806;
/** Its special drains Defence by the damage dealt; Zebak's Defence drain is capped at 20. */
const BANDOS_GODSWORD = 11804;
/** A powered staff of the Tombs; needs 70 Magic. Its special, Condemn, drains Magic and Defence. */
const ACCURSED_SCEPTRE = 27665;
/** Its arrows bounce to other monsters in reach: the engine asks the encounter about every candidate (only Zebak is one). */
const VENATOR_BOW = 27610;
const rune = { water: 555, death: 560, blood: 565 };
const level = (value) => ({ current: value, max: value });
const maxedStats = { attack: level(99), strength: level(99), defence: level(99), ranged: level(99), magic: level(99), prayer: level(99), hitpoints: level(99), agility: level(99) };
/** The twisted bow reaches Zebak (east edge x 22, range 10) from this column or further west. */
const BOW_REACH_X = 32;
/** A jug's NPC type while it rolls (11735 at rest). */
const ROLLING_JUG = 11736;

/** { special, enraged, waveShove, acid, splashes, queued, bloodTrail } */
const state = (api) => api.engine.getEncounterSnapshot().state;
/** The living objects of the fight: "rock" | "jug" | "wave" | "cloud". */
const objects = (api, kind) => api.npcs().filter((npc) => npc.archetypeId === "zebak-" + kind);
const sameTile = (a, b) => a[0] === b[0] && a[1] === b[1];
const onAcid = (api, tile) => state(api).acid.some((pool) => sameTile(pool, tile));
const jugAt = (api, x, y) => objects(api, "jug").find((jug) => sameTile(jug.position, [x, y]))?.id;
/** That share of Zebak's full hitpoints, for setBossHp. */
const bossHp = (api, share) => Math.floor(boss(api).vitals.maxHp * share);

/** A click on a tile: drops the attack target and walks there. */
function walkTo(api, x, y) {
  api.act({ type: "attackTarget", targetId: null });
  api.moveTo(x, y);
}
/** "Push" | "Pull" | "Hit" on a jug: what its menu sends (a rolling jug's "Attack" is sent as "Hit"). */
const jugAction = (api, action, id) => command(api, { encounter: ZEBAK, action, id });

/** The tile nearest to `from` (west and south first) in the middle of the platform that `accept` takes. */
function nearestTile([fromX, fromY], accept) {
  for (let radius = 0; radius <= 12; radius++)
    for (let x = fromX - radius; x <= fromX + radius; x++)
      for (let y = fromY - radius; y <= fromY + radius; y++) {
        const onRing = Math.max(Math.abs(x - fromX), Math.abs(y - fromY)) === radius;
        if (onRing && x >= 24 && x <= 36 && y >= 26 && y <= 38 && accept([x, y])) return [x, y];
      }
  return null;
}

/** Great Roar: a tile sheltered by a rock and within bow range, off the acid if one is. Null without rocks. */
function shelterTile(api) {
  const position = api.player().position;
  const rocks = objects(api, "rock").map((rock) => rock.position);
  const sheltered = ([x, y]) => x <= BOW_REACH_X && rocks.some(([rockX, rockY]) => y === rockY && x > rockX && x <= rockX + 3);
  const free = (tile) => sheltered(tile) && !rocks.some((rock) => sameTile(rock, tile));
  return nearestTile(position, (tile) => free(tile) && !onAcid(api, tile)) ?? nearestTile(position, free);
}

/** Tidal Waves: the crests out, each as { row, gap }: its row and the columns 19-39 it leaves open. */
function crests(api) {
  const rows = new Map();
  for (const wave of objects(api, "wave")) {
    if (!rows.has(wave.position[1])) rows.set(wave.position[1], new Set());
    rows.get(wave.position[1]).add(wave.position[0]);
  }
  return [...rows].map(([row, columns]) => ({ row, gap: Array.from({ length: 21 }, (_, index) => 19 + index).filter((x) => !columns.has(x)) }));
}

/** Tidal Waves: where to stand for the crest that threatens the player next, off the acid. Null when none does.
 *  A wave is its crest and the two rows behind it: a crest threatens until it is three rows past him. The tile
 *  is in that crest's gap, and when he gets there (two tiles a tick) no crest has it in its three rows. */
function gapTile(api) {
  const position = api.player().position;
  const waves = objects(api, "wave");
  const direction = waves[0]?.facing === 1024 ? 1 : -1; // crests that come from the south face north
  const fronts = crests(api);
  /** How many rows the crest is past `y` after `ticks` more ticks (negative: it has not reached it). */
  const past = (front, y, ticks) => (front.row + ticks * direction - y) * direction;
  const threats = fronts.filter((front) => past(front, position[1], 0) < 3);
  if (!threats.length) return null;
  const next = threats.reduce((a, b) => (past(a, position[1], 0) > past(b, position[1], 0) ? a : b));
  const safeOnArrival = ([x, y]) => {
    const ticks = Math.ceil(Math.max(Math.abs(x - position[0]), Math.abs(y - position[1])) / 2);
    return fronts.every((front) => {
      const rows = past(front, y, ticks);
      return rows < 0 || rows >= 3 || front.gap.includes(x);
    });
  };
  return nearestTile(position, ([x, y]) => next.gap.includes(x) && safeOnArrival([x, y]) && !onAcid(api, [x, y]))
    ?? nearestTile(position, ([x, y]) => next.gap.includes(x) && safeOnArrival([x, y]));
}

/** Where to step when the player stands in acid: the nearest clean tile within bow range. Null on clean ground. */
function cleanTile(api) {
  const position = api.player().position;
  return onAcid(api, position) ? nearestTile(position, (tile) => !onAcid(api, tile) && tile[0] <= BOW_REACH_X) : null;
}

/** Walks into the gap of the coming crest, or else out of acid. False when there is nowhere to go. */
function dodge(api) {
  const refuge = gapTile(api) ?? cleanTile(api);
  if (refuge) walkTo(api, ...refuge);
  return refuge !== null;
}

/** What a script remembers of its run, by the api it is handed. */
const memories = new WeakMap();
/** Ticks from the start of a Great Roar's special to the roar itself, by Zebak's attack period (a second roar: 5 fewer). */
const ROAR_WINDUP = { 7: 34, 6: 31, 5: 29 };

/** Great Roar: true from two ticks before the roar until its last pulse (which lands on the roar's 8th tick).
 *  Until then the player need not stand behind a rock, where the acid often is. */
function roarIsNear(tick, api) {
  const memory = memories.get(api) ?? memories.set(api, { roars: 0, roaring: false, start: 0 }).get(api);
  const roaring = state(api).special === "roar";
  if (roaring && !memory.roaring) (memory.roars++, (memory.start = tick - 1)); // the script sees it the tick after it starts
  memory.roaring = roaring;
  if (!roaring) return false;
  const roar = memory.start + ROAR_WINDUP[boss(api).combat.attackSpeed] - (memory.roars > 1 ? 5 : 0);
  return tick >= roar - 2 && tick <= roar + 8;
}

/** A fight as a careful player has it: Rigour and one protection prayer at a time, an anglerfish when low,
 *  behind a rock for a Great Roar's pulses, in the gaps of the Tidal Waves, off the acid, shooting whenever in place. */
function carefulRangedFight(tick, api) {
  if (tick === 1) (offensive(api, "Rigour"), protect(api, "ProtectMagic"));
  if (tick === 80) protect(api, "ProtectRange");
  const player = api.player();
  const food = player.inventory.findIndex((slot) => slot?.id === item.anglerfish);
  if (player.vitals.hp <= 55 && food >= 0) use(api, food);
  const refuge = (roarIsNear(tick, api) ? shelterTile(api) : gapTile(api)) ?? cleanTile(api);
  if (refuge && !sameTile(player.position, refuge)) walkTo(api, ...refuge);
  else if (player.attackTarget !== ZEBAK && player.position[0] <= BOW_REACH_X) attack(api, ZEBAK);
}

export const scenarios = [
  {
    // The default fight to victory on real hitpoints: both spit styles prayed against and not, the first
    // Tidal Waves stood out in their gaps, a Great Roar sheltered from and cut short by enrage, the enraged
    // spits, the kill of head and tail and the spits that still land afterwards.
    name: "zebak/careful-ranged-kill",
    kind: "zebak",
    seed: 1,
    ticks: 200,
    ...rangedGear,
    inventory: [item.anglerfish, item.anglerfish],
    script: carefulRangedFight,
  },
  {
    // Both Great Roars and the Tidal Waves between them, with every jug input: hit from range (twice, and
    // once more when it is gone), pushed into the water, pulled six tiles, pushed into a rock, pushed from
    // its own tile, a pull abandoned, a rolling jug shot, a shot that waits for the bow, jugs left to the
    // roar; acid stood in and washed off by jugs and crests; a rock shot at; the first pulse taken in the
    // open, the others behind a rock.
    name: "zebak/roar-jugs",
    kind: "zebak",
    seed: 2,
    ticks: 136,
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      // 55%: three thresholds at once, so a roar, the waves and the second roar are queued.
      if (tick === 1) setBossHp(api, bossHp(api, 0.55));

      // First roar: starts tick 4, objects land tick 10, the roar on tick 38; its dust on ticks 41, 43 and 45
      // and its damage a tick after each, on 42, 44 and 46.
      // Rocks (24,29) (25,30); jugs (25,27) (27,26) (35,26) (35,31) (36,33) (34,37) (33,38).
      if (tick === 11) jugAction(api, "Hit", jugAt(api, 35, 31)); // six tiles away: the arrow takes 3 ticks
      if (tick === 12) jugAction(api, "Hit", jugAt(api, 35, 31)); // already doomed: accepted, changes nothing
      if (tick === 13) walkTo(api, 35, 33);
      if (tick === 15) jugAction(api, "Hit", "zebak-jug-6"); // the jug shot on tick 11, which has just shattered
      if (tick === 16) jugAction(api, "Push", jugAt(api, 36, 33)); // east: two tiles, then off the platform
      if (tick === 18) walkTo(api, 34, 36);
      if (tick === 20) jugAction(api, "Pull", jugAt(api, 34, 37)); // rolls south over the player, six tiles
      if (tick === 26) walkTo(api, 32, 34); // an acid pool: stands in it for five ticks
      if (tick === 31) walkTo(api, 29, 30);
      if (tick === 34) attack(api, objects(api, "rock")[0].id); // a rock can be shot at and never hit
      if (tick === 40) jugAction(api, "Push", jugAt(api, 35, 26)); // too far: the roar breaks it first
      // Tick 42: the first pulse hits in the open, a tile short of the rock at (25,30); behind it for the other two.
      if (tick === 41) walkTo(api, 27, 30);

      // Tidal Waves: start tick 49 from the south, crests on ticks 64, 71 and 78. Stands in each gap
      // until its crest is three rows past.
      if (tick >= 49 && tick < 98) dodge(api);

      // Second roar: starts tick 89 while crests are still crossing, objects land tick 95, the roar on
      // tick 118, its damage on ticks 122, 124 and 126. Rocks (29,35) (29,33) (30,31);
      // jugs (27,31) (27,36) (28,38) (31,25) (33,26) (32,38) (36,33); a crest carries the one at (32,38) a row on.
      if (tick === 98) walkTo(api, 26, 30);
      if (tick === 100) jugAction(api, "Push", jugAt(api, 27, 31)); // north-east, into the rock at (29,33)
      if (tick === 101) jugAction(api, "Pull", jugAt(api, 36, 33)); // sets off towards it ...
      if (tick === 103) walkTo(api, 27, 36); // ... and clicks away: the pull is dropped. Onto a jug's tile.
      if (tick === 107) jugAction(api, "Push", jugAt(api, 27, 36)); // from its own tile: a shove, no roll
      if (tick === 108) walkTo(api, 29, 38);
      if (tick === 110) jugAction(api, "Push", jugAt(api, 28, 38)); // rolls west
      if (tick === 111) jugAction(api, "Hit", objects(api, "jug").find((jug) => jug.npcTypeId === ROLLING_JUG).id); // shot as it rolls
      if (tick === 112) jugAction(api, "Hit", jugAt(api, 36, 33)); // waits four ticks for the bow
      if (tick === 118) walkTo(api, ...shelterTile(api)); // behind a rock for all three pulses
    },
  },
  {
    // Tidal Waves from both shores, by the rules of a recording (rev 243): a wave is its crest and the two
    // rows behind it. Struck while attacking and thrown 3 tiles; struck again a row behind the crest he
    // ran back through (no skip: no step on before it); struck as he walks and thrown from where his step ends; a step out
    // of the gap two rows behind a crest that leaves him untouched; a crest that throws him off the
    // platform into the water; bitten by the crocodile with and without Protect from Melee, a spell cast
    // from the water, a jug action refused there, the swim along the row and out by the Rock steps. A roar
    // that starts while crests still cross, a jug broken with an autocast spell, a second set of crests
    // whose first he runs into from behind and is thrown off the southern edge, and enrage while they are out.
    name: "zebak/waves-swept",
    kind: "zebak",
    seed: 5,
    ticks: 156,
    mechanics: { infiniteHealth: true },
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: "ancient", selectedSpell: "Ice Barrage" },
    inventory: [rune.blood, rune.death, rune.water],
    script(tick, api) {
      // 70%: Tidal Waves, then a Great Roar. The waves start on tick 4 from the south; crests rise on
      // row 21 on ticks 19, 26 and 33, a row a tick, each with its gap in columns 32-34.
      if (tick === 1) setBossHp(api, bossHp(api, 0.7));

      // First crest: steps onto row 32 on tick 30 with the player attacking on it, strikes him on
      // tick 31 and throws him to (29,35), which drops his target. On tick 32 he runs two tiles back
      // through it as it steps onto his row, to (29,33): no skip after a throw, he is one row behind the crest
      // and it strikes him on tick 33, to (29,36). On tick 34 he walks east for the gap and the crest
      // steps onto his row: struck on tick 35, he takes his step to (32,36) first and is thrown from there
      // to (32,39), in the gap.
      if (tick === 27) attack(api, ZEBAK);
      if (tick === 32) walkTo(api, 29, 33);
      if (tick === 34) walkTo(api, 32, 36);
      // Second crest: passes him in its gap. On tick 46, two rows behind it, he walks one tile out of
      // the gap to (31,39): his last step was in the gap, so it does not strike him.
      if (tick === 46) walkTo(api, 31, 39);
      // Third crest: steps onto his row on tick 51, strikes him on tick 52 and throws him three rows on,
      // off the platform's edge: into the water at (31,45).

      // In the water a crocodile bites every fourth tick (56, 60, 64, 68), and the only way is along the shore.
      if (tick === 53) protect(api, "ProtectMelee");
      if (tick === 57) walkTo(api, 32, 43); // swims a tile east, to (32,45)
      if (tick === 61) attack(api, ZEBAK); // casts from the water: always a miss
      if (tick === 62) (jugAction(api, "Hit", objects(api, "jug")[0].id), protect(api, "ProtectMelee")); // refused in the water; the prayer off again
      if (tick === 66) walkTo(api, 30, 36); // west to the Rock steps' column, a tick's wait, then up onto (30,42)

      // The Great Roar started on tick 44 with two crests still crossing; the roar on tick 78, its damage on
      // ticks 82, 84 and 86.
      if (tick === 70) setBossHp(api, bossHp(api, 0.55)); // the second Tidal Waves are queued
      if (tick === 74) jugAction(api, "Hit", objects(api, "jug")[0].id); // a jug broken with Ice Barrage
      if (tick === 78) walkTo(api, ...shelterTile(api));

      // Second waves: start tick 89 from the north; crests on row 43 on ticks 104, 111 and 118.
      if (tick === 92) walkTo(api, 30, 34);
      if (tick >= 105 && tick < 119) dodge(api); // lets the first crest pass in its gap
      if (tick === 120) walkTo(api, 36, 26); // runs into the two rows behind the first crest, by the southern edge:
      // struck on tick 123 and thrown off the platform, into the water on row 20
      if (tick === 137) setBossHp(api, 140); // under 25%: enrage, the crests still out vanish
      if (tick === 139) walkTo(api, 30, 30); // out by the southern Rock steps
    },
  },
  {
    // Melee from the bite row with the Keris partisans: bites with and without Protect from Melee, a bite
    // taken one step back, one run away from and one dodged by stepping under Zebak (who then spits at the
    // player inside him); the bleed while standing, running and walking and its blood trail; enrage and
    // the enraged bite. Then the partisan of the sun: Tumeken's Light and both of its refusals, the extra
    // accuracy under 25% and the heal on the kill.
    name: "zebak/melee-bite-bleed",
    kind: "zebak",
    seed: 13,
    ticks: 100,
    mechanics: { infiniteHealth: true },
    ...meleeGear,
    equipment: { ...meleeGear.equipment, weapon: item.kerisPartisanOfCorruption },
    inventory: [KERIS_PARTISAN_OF_THE_SUN, item.superRestore],
    script(tick, api) {
      // Zebak bites instead of spitting when the player is in the bite row as he acts: ticks 4, 11, 18, ...
      // A bite lands a tick later. With this seed the first two start a bleed (14 ticks each).
      if (tick === 1) attack(api, ZEBAK); // walks up to (23,32)
      if (tick === 12) protect(api, "ProtectMelee");
      if (tick === 13) walkTo(api, 27, 32); // bleeding: runs two ticks (the trail takes both tiles of a run step)
      if (tick === 15) (toggleRun(api), walkTo(api, 23, 32)); // and walks back; off the row on tick 18, so a spit
      if (tick === 19) attack(api, ZEBAK);
      if (tick === 32) walkTo(api, 24, 32); // one step back as he bites: still within the bite
      if (tick === 34) attack(api, ZEBAK);
      if (tick === 39) (toggleRun(api), walkTo(api, 26, 32)); // three tiles back as he bites: out of it
      if (tick === 41) attack(api, ZEBAK);
      if (tick === 46) walkTo(api, 22, 32); // under Zebak as he bites: the bite cannot land there
      // Tick 53: the player is not in the bite row but inside him, so he spits.
      if (tick === 54) attack(api, ZEBAK); // steps out from under him to stab
      if (tick === 55) setBossHp(api, 140); // under 25%: enrage
      if (tick === 56) (equip(api, 0, "weapon"), attack(api, ZEBAK)); // the partisan of the sun
      if (tick === 58) special(api); // Tumeken's Light: 75% energy and 50 prayer
      if (tick === 60) special(api); // refused: under 50 prayer
      if (tick === 61) (use(api, 1), attack(api, ZEBAK)); // super restore
      if (tick === 64) special(api); // refused: 25% energy left
      if (tick === 70) protect(api, "ProtectMelee"); // off: enraged bites every 4 ticks, unprotected
      if (tick === 80) setBossHp(api, 1); // the next stab kills and heals
    },
  },
  {
    // Not Just a Head alone: the one large blood cloud is cast as a Great Roar starts (which puts the
    // roar's throw a tick later), comes for the player, covers his tile and feeds on him, healing itself
    // and not Zebak, is cast at in vain, is held up behind the roar's rock and dies there of the 2
    // hitpoints it loses every tick. The roar's three pulses and the bites in the bite row; then a
    // Blood Barrage, which heals Zebak by twice its damage.
    name: "zebak/blood-cloud",
    kind: "zebak",
    seed: 3,
    ticks: 135,
    mechanics: { infiniteHealth: true, blood: true },
    ...magicGear,
    script(tick, api) {
      // Every sixth spit outside a special is a blood spell: the cloud, then two barrages. Two casts of
      // the shadow first, so that Zebak has hitpoints to regain.
      if (tick === 1) attack(api, ZEBAK);
      if (tick === 8) walkTo(api, 29, 30);
      // 85%: the Great Roar starts on tick 39, the sixth spit's turn, and the cloud is cast with it: the
      // rocks land on tick 46 instead of 45. The cloud appears at (29,24) on tick 42, moves from tick 45,
      // loses 2 hitpoints a tick from tick 46, covers the player's tile on tick 49 and hits him on tick 50.
      if (tick === 33) setBossHp(api, bossHp(api, 0.85));
      if (tick === 51) attack(api, objects(api, "cloud")[0].id); // a cloud can be cast at and never hit
      // To the bite row, west of the rock at (24,32): the cloud follows, is stuck east of the rock from
      // tick 55 and dies there on tick 59 (gone on tick 64). Bitten on ticks 57, 64 and 71, and hit by
      // all three pulses of the roar of tick 73, on ticks 77, 79 and 81.
      if (tick === 53) walkTo(api, 23, objects(api, "rock")[0].position[1]);
      if (tick === 85) walkTo(api, 36, 38);
      // Tick 119: the Blood Barrage is cast with the twelfth counted spit and lands on tick 122.
    },
  },
  {
    // Every invocation but Upset Stomach, at path 6: Quiet Prayers lets a tenth of a prayed spit and
    // barrage through, Blood Thinners sends three small clouds (once out of reach of the player, wandering
    // until they die; once feeding on him), Arterial Spray makes barrage and clouds heal Zebak more. The
    // fast spits, the fast enraged spits every 2 ticks, the venator bow (whose bounce finds no second
    // target here), and a kill by the debug hitpoints control with clouds out.
    name: "zebak/blood-spray-thinners-path6",
    kind: "zebak",
    seed: 1,
    ticks: 140,
    mechanics: { infiniteHealth: true, path: "6", quiet: true, blood: true, spray: true, clouds: true },
    ...rangedGear,
    equipment: { ...rangedGear.equipment, weapon: VENATOR_BOW },
    script(tick, api) {
      // Spits every 5 ticks. The first clouds appear on tick 32 on the north shore, 16 tiles or more from
      // here: too far to notice the player. They wander and die of the 2 hitpoints a tick.
      if (tick === 1) (offensive(api, "Rigour"), walkTo(api, 30, 22));
      if (tick === 36) walkTo(api, 28, 34);
      if (tick === 40) attack(api, ZEBAK); // three arrows
      if (tick === 52) walkTo(api, 28, 34);
      if (tick === 55) setBossHp(api, 200); // under 25%: enraged; a blood spell now comes eight spits after the last
      // Tick 59: a barrage is cast, six spits after the clouds, and lands unprayed on tick 62; Zebak
      // regains three times its damage.
      if (tick === 75) protect(api, "ProtectMagic"); // tick 81: a barrage prayed against
      // Tick 97: the second clouds, on the south shore, within reach; on the player's tile from tick 107,
      // each hitting him every third tick and healing Zebak by 4.
      if (tick === 110) attack(api, objects(api, "cloud")[0].id);
      if (tick === 113) attack(api, ZEBAK);
      if (tick === 116) setBossHp(api, 0); // killed outright, three clouds still feeding
    },
  },
  {
    // Upset Stomach at path 3, in melee: wider acid and a smaller jug splash, the 6-tick spits, the
    // earlier roar, the 2-tile gap. A jug walked up to and hit with a sword, acid stood in, both
    // godsword specials (the Bandos one drains more Defence than Zebak allows), all three pulses of the
    // first roar sheltered from (in acid: no sheltered tile is clean) and of the second taken in the
    // open. Arterial Spray and Blood Thinners are on without Not Just a Head, which leaves them off.
    name: "zebak/upset-stomach-path3",
    kind: "zebak",
    seed: 2,
    ticks: 122,
    intro: true, // Zebak has no intro; the engine asks him
    mechanics: { infiniteHealth: true, path: "3", upset: true, spray: true, clouds: true },
    equipment: { ...meleeGear.equipment, weapon: SARADOMIN_GODSWORD, shield: undefined },
    inventory: [BANDOS_GODSWORD],
    script(tick, api) {
      // 55%: roar (starts tick 4, the roar on tick 35, its damage on ticks 39, 41, 43), waves (tick 46; crests
      // on ticks 61, 68, 75), second roar (tick 85, the roar on tick 111, its damage on ticks 115, 117, 119).
      if (tick === 1) (setBossHp(api, bossHp(api, 0.55)), offensive(api, "Piety"), special(api), attack(api, ZEBAK));
      if (tick === 5) equip(api, 0, "weapon");
      if (tick === 6) (special(api), attack(api, ZEBAK));
      if (tick === 11) jugAction(api, "Hit", objects(api, "jug")[0].id); // walks round the rock to the jug at (25,27)
      if (tick === 18) walkTo(api, ...nearestTile(api.player().position, (tile) => onAcid(api, tile)));
      if (tick === 22) attack(api, ZEBAK); // back to the bite row
      if (tick === 33) walkTo(api, ...shelterTile(api));
      if (tick >= 44) dodge(api);
    },
  },
  {
    // A long fight to victory on real hitpoints at path 5 and raid level 50: the 5-tick fast spits, both
    // roars and both waves (1-tile gaps) handled as a careful player does, anglerfish eaten, prayer run
    // dry, enrage with the second waves out.
    name: "zebak/careful-kill-path5",
    kind: "zebak",
    seed: 13,
    ticks: 300,
    mechanics: { path: "5", other: "50" },
    ...rangedGear,
    inventory: Array(26).fill(item.anglerfish),
    script: carefulRangedFight,
  },
  {
    // The player dies of acid on the very tick Zebak would spit (tick 15), so the encounter's turn runs
    // with a dead player. On the way: the partisan of the sun and the accursed sceptre refused for want
    // of 80 Attack and 70 Magic.
    name: "zebak/death-in-acid",
    kind: "zebak",
    seed: 2,
    ticks: 30,
    startHp: 20,
    stats: { ...maxedStats, attack: level(79), magic: level(69) },
    ...rangedGear,
    inventory: [KERIS_PARTISAN_OF_THE_SUN, ACCURSED_SCEPTRE],
    script(tick, api) {
      if (tick === 1) setBossHp(api, bossHp(api, 0.85)); // a Great Roar; its acid lands on tick 10
      if (tick === 2) equip(api, 0, "weapon");
      if (tick === 3) equip(api, 1, "weapon");
      // Stands in the nearest pool from tick 12: 8 + 7 + 7 poison damage on ticks 13 to 15.
      if (tick === 12) walkTo(api, ...nearestTile(api.player().position, (tile) => onAcid(api, tile)));
    },
  },
  {
    // The player dies of a Great Roar in the open (second pulse, tick 44), blowpipe in hand.
    name: "zebak/death-in-roar",
    kind: "zebak",
    seed: 8,
    ticks: 60,
    ...rangedGear,
    equipment: { ...rangedGear.equipment, weapon: item.toxicBlowpipe },
    supplies: { blowpipe: { ammo: { id: item.dragonDart } } },
    script(tick, api) {
      if (tick === 1) (setBossHp(api, bossHp(api, 0.85)), walkTo(api, 26, 32));
      if (tick === 4) (special(api), attack(api, ZEBAK));
    },
  },
  {
    // The raid level changed before the first tick ("other" 300 to 450, path 0 to 2, with Quiet Prayers:
    // raid level 470, 1890 hitpoints, 6-tick spits) and a fight at that level: spits prayed against let
    // a tenth through, Condemn, Tidal Waves that run their full course with nothing queued behind them,
    // and a Great Roar cut short by enrage before its rocks land.
    name: "zebak/raid-level",
    kind: "zebak",
    seed: 7,
    ticks: 110,
    mechanics: { infiniteHealth: true, quiet: true, other: "300" },
    ...magicGear,
    equipment: { ...magicGear.equipment, weapon: ACCURSED_SCEPTRE },
    script(tick, api) {
      // The engine passes a mechanics change on to the encounter only before the first tick.
      if (tick === 1) (api.mechanics({ other: "450", path: "2" }), protect(api, "ProtectMagic"));
      if (tick === 10 || tick === 16) special(api);
      if (tick === 20) setBossHp(api, bossHp(api, 0.85)); // Tidal Waves: ticks 22 to 75
      if (tick === 40) protect(api, "ProtectRange");
      if (!dodge(api) && api.player().attackTarget !== ZEBAK) attack(api, ZEBAK);
      if (tick === 84) setBossHp(api, bossHp(api, 0.7)); // a Great Roar starts on tick 85 ...
      if (tick > 84 && state(api).special === "roar") setBossHp(api, bossHp(api, 0.2)); // ... enrage on tick 86
    },
  },
  {
    // Condemn until it lands, and Tumeken's Light when the player needs all of it. The accursed sceptre's special is
    // cast again and again (the energy does not run out here). Then the player stands in a Great Roar's acid, which
    // poisons him, drinks a Saradomin brew, which lowers his levels, and with exactly 50 prayer points uses the
    // partisan of the sun: the prayer points run dry, the poison is cured and the levels are restored.
    name: "zebak/tumekens-light-in-need",
    kind: "zebak",
    seed: 2,
    ticks: 30,
    mechanics: { infiniteHealth: true, infiniteSpecialAttack: true },
    stats: { ...maxedStats, prayer: level(51) },
    equipment: { ...magicGear.equipment, weapon: ACCURSED_SCEPTRE },
    inventory: [KERIS_PARTISAN_OF_THE_SUN, item.saradominBrew],
    script(tick, api) {
      if (tick === 1) (setBossHp(api, bossHp(api, 0.85)), attack(api, ZEBAK)); // a Great Roar; its acid lands on tick 10
      if (tick < 20 && !api.player().isSpecialAttackActive) special(api);
      // One tick in a pool: its hit on tick 21 poisons him and takes a prayer point, the 51st.
      if (tick === 20) walkTo(api, ...nearestTile(api.player().position, (tile) => onAcid(api, tile)));
      if (tick === 21) walkTo(api, ...nearestTile(api.player().position, (tile) => !onAcid(api, tile)));
      if (tick === 24) (use(api, 1), equip(api, 0, "weapon"));
      if (tick === 26) special(api);
    },
  },
];
