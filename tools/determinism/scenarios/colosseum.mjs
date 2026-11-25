// The waves of the Fortis Colosseum (kind "colosseum").
//
// A run starts on the wave of the mechanics key "colosseumStartWave". By
// default Minimus stands in the arena first and offers three modifiers
// before every wave (colosseum/minimus-offers); the other scenarios switch
// him off with "colosseumModifierChoice", and what follows is their run. Its
// monsters are placed on tick 5: the Fremennik warband (a berserker, an
// archer and a seer of about 50 hitpoints each, who run to the player's
// sides) and the wave's own monsters, on spawn points away from where the
// player stood on tick 4. The reinforcements come on tick 71. The player
// starts at 23,36. A wave is completed on the first tick on which none of
// its monsters is left, and the next one is placed 8 ticks later; after
// wave 11 the run is won 3 ticks after the wave is completed.
import { attack, command, magicGear, protect, rangedGear } from "./common.mjs";
import { buildReinforcementSpawns, buildWaveSpawns, getWaveMonsterKinds } from "../../../client/encounters/colosseum/waves.js";
import { colosseumMonsters, southSpawns, spawnPointExclusionDistance, waveSpawnPoints } from "../../../client/encounters/colosseum/constants.js";

const KIND = "colosseum";
/** Mechanics without Minimus and his offers: a run starts with its first wave, and a wave follows a wave. */
const noMinimus = { colosseumModifierChoice: false };
const START = [23, 36];

/** What the encounter shows of itself: wave, phase, placeTick, reinforcementTick. */
const seen = (api) => api.engine.getEncounterSnapshot().state;
/** The living monsters whose actor id names one of `kinds` ("shaman", "jaguar", "berserker", ...); all of them without kinds. */
const monsters = (api, ...kinds) => api.npcs().filter((npc) => npc.death === undefined && (kinds.length === 0 || kinds.some((kind) => npc.id.startsWith(`colosseum_${kind}_`))));
/** Clicks the first living monster in the order of `kinds`, unless it is the player's target already. */
function attackFirst(api, kinds) {
  for (const kind of kinds) {
    const [npc] = monsters(api, kind);
    if (npc) {
      if (api.player().attackTarget !== npc.id) attack(api, npc.id);
      return;
    }
  }
}
/** Turns a protection prayer on; the action is a toggle, so it is sent only on a change. */
function pray(api, prayer) {
  if (api.player().activePrayer !== prayer) protect(api, prayer);
}
const steps = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// The spawn allocation as waves.js makes it, for four seeds, three waves
// (wave 4 has two reinforcements, a shaman beside a jaguar) and four player
// tiles. Four things must hold of each, or the scenario throws: the same
// inputs give the same spawns, every monster of the wave is on a spawn
// point, none is within 4 steps of the player, and no two reinforcements
// stand on the same tile.
function spawnAllocation() {
  const playerTiles = [START, [29, 34], [42, 35], [32, 30]];
  const waves = [1, 4, 8];
  const rows = [];
  for (const seed of [1, 2, 77, 4000000000]) {
    for (const wave of waves) {
      for (const playerTile of playerTiles) {
        const spawns = buildWaveSpawns(seed, wave, playerTile);
        // The first three spawns are the warband, which has tiles of its own.
        const placedOnPoints = spawns.slice(3);
        const reinforcements = buildReinforcementSpawns(seed, wave, playerTile);
        // The tiles the reinforcements cover, along their row.
        const rowTiles = reinforcements.flatMap((spawn) => Array.from({ length: colosseumMonsters[spawn.kind].size }, (unusedElement, index) => spawn.position[0] + index));
        rows.push({
          seed,
          wave,
          playerTile,
          spawns: spawns.map((spawn) => [spawn.kind, ...spawn.position]),
          reinforcements: reinforcements.map((spawn) => [spawn.kind, ...spawn.position]),
          reinforcementsApart: new Set(rowTiles).size === rowTiles.length,
          sameAgain: JSON.stringify(buildWaveSpawns(seed, wave, playerTile)) === JSON.stringify(spawns),
          onSpawnPoints: placedOnPoints.every((spawn) => waveSpawnPoints.some((point) => point[0] === spawn.position[0] && point[1] === spawn.position[1])),
          nearestToPlayer: Math.min(...placedOnPoints.map((spawn) => steps(spawn.position, playerTile))),
          awayFromPlayer: placedOnPoints.every((spawn) => steps(spawn.position, playerTile) > spawnPointExclusionDistance),
        });
      }
    }
  }
  const failed = rows.find((row) => !row.sameAgain || !row.onSpawnPoints || !row.awayFromPlayer || !row.reinforcementsApart);
  if (failed) throw new Error(`colosseum/spawn-allocation: a check failed for ${JSON.stringify(failed)}`);
  return rows;
}

// The practice switches of the south spawns A and B (waves.js), for four seeds, every wave and three player tiles,
// with A and B each random, any, or each kind the wave has. Five things must hold of each, or the scenario throws:
// both random is the game's wave; the warband stands where it stands without the switches; a kind asked for stands
// on its point, and "any" puts a monster there, unless the point is near the player or no monster is left for it;
// no two monsters share a point; the wave has as many monsters as without them.
function southSpawnPresets() {
  const isAt = (spawn, point) => spawn.position[0] === point[0] && spawn.position[1] === point[1];
  const rows = [];
  for (const seed of [1, 2, 77, 4000000000]) {
    for (let wave = 1; wave <= 11; wave++) {
      const kinds = [...new Set(getWaveMonsterKinds(wave))];
      const settings = ["random", "any", ...kinds];
      for (const playerTile of [START, [29, 34], [32, 30]]) {
        const plain = buildWaveSpawns(seed, wave, playerTile);
        for (const a of settings) {
          for (const b of settings) {
            const practised = buildWaveSpawns(seed, wave, playerTile, {}, { south: { a, b } });
            const monsters = practised.slice(3);
            const onPoint = (point) => monsters.find((spawn) => isAt(spawn, point));
            const available = (point) => steps(point, playerTile) > spawnPointExclusionDistance;
            // What can be met: A first among kinds, so B's kind needs a monster A did not take.
            const counts = Object.fromEntries(kinds.map((kind) => [kind, getWaveMonsterKinds(wave).filter((other) => other === kind).length]));
            if (kinds.includes(a) && available(southSpawns.a)) counts[a]--;
            const metA = a === "random" || !available(southSpawns.a) || (a === "any" ? onPoint(southSpawns.a) : onPoint(southSpawns.a)?.kind === a);
            const bPossible = available(southSpawns.b) && (b === "any" ? monsters.length > (a === "random" ? 0 : 1) : (counts[b] ?? 0) > 0);
            const metB = b === "random" || !bPossible || (b === "any" ? onPoint(southSpawns.b) : onPoint(southSpawns.b)?.kind === b);
            const checks = [
              a !== "random" || b !== "random" || JSON.stringify(plain) === JSON.stringify(practised),
              JSON.stringify(plain.slice(0, 3)) === JSON.stringify(practised.slice(0, 3)),
              metA && metB,
              new Set(monsters.map((spawn) => spawn.position.join())).size === monsters.length,
              monsters.length === plain.length - 3,
            ];
            if (checks.includes(false)) throw new Error(`colosseum/south-spawn-presets: a check failed for ${JSON.stringify({ seed, wave, playerTile, a, b, checks, practised })}`);
            if (playerTile === START) rows.push({ seed, wave, a, b, south: [onPoint(southSpawns.a)?.kind ?? null, onPoint(southSpawns.b)?.kind ?? null] });
          }
        }
      }
    }
  }
  return rows;
}

// The practice commands "Retry Wave" and "Random Spawns", asked of an encounter the engine made. Wave 5 has begun
// with Quartet, the player stood at 30,35 before its monsters were placed, and Volatility was chosen since. Both
// plans restart on wave 5 from 30,35 with Quartet alone; "Retry Wave" keeps the seed, "Random Spawns" draws another
// (which is not digested: Math.random). A run reset with the plan's seeds has that seed and those modifiers, and
// gives them back as its seeds. Any other command has no plan.
function practiceRestart(engine, objTypeLoader) {
  const { encounter } = engine.createSimulationEngine({
    encounterConfig: { kind: KIND, mechanics: {} }, objTypeLoader, combatSeed: 1,
    inventory: engine.createEmptyInventory(), equipment: {}, combatSupplies: engine.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  encounter.encounterSeed = 1234;
  encounter.wave = 5;
  encounter.modifiersAtWaveStart = { quartet: 1 };
  encounter.playerTileBeforePlacing = [30, 35];
  encounter.setModifiers({ quartet: 1, volatility: 1 });
  const retry = encounter.planPracticeRestart({ encounter: KIND, type: "retry-wave" });
  const reroll = encounter.planPracticeRestart({ encounter: KIND, type: "reroll-wave" });
  const other = encounter.planPracticeRestart({ encounter: KIND, type: "talk-to-minimus" });
  encounter.reset(retry.encounterSeeds);
  const afterReset = { seeds: encounter.getSeeds(), modifiers: { ...encounter.modifiers } };
  const { encounterSeed: unusedSeed, ...rerollSeeds } = reroll.encounterSeeds;
  const rows = { retry, reroll: { ...reroll, encounterSeeds: rerollSeeds }, other, afterReset };
  const checks = {
    retry: JSON.stringify(retry) === JSON.stringify({ encounterSeeds: { encounterSeed: 1234, modifiers: { quartet: 1 } }, runMechanics: { colosseumStartWave: "5" }, startPosition: [30, 35] }),
    reroll: Number.isInteger(reroll.encounterSeeds.encounterSeed) && reroll.encounterSeeds.encounterSeed >= 0 && reroll.encounterSeeds.encounterSeed < 2 ** 32 && JSON.stringify(rerollSeeds) === JSON.stringify({ modifiers: { quartet: 1 } }) && reroll.runMechanics.colosseumStartWave === "5",
    other: other === null,
    afterReset: afterReset.seeds.encounterSeed === 1234 && JSON.stringify(afterReset.modifiers) === JSON.stringify({ quartet: 1 }) && JSON.stringify(afterReset.seeds.modifiers) === JSON.stringify({ quartet: 1 }),
  };
  if (Object.values(checks).includes(false)) throw new Error(`colosseum/practice-restart: a check failed: ${JSON.stringify({ checks, rows })}`);
  return rows;
}

/** The player's choice of what Minimus offers: 0, 1 or 2. */
const choose = (api, choice) => command(api, { encounter: KIND, type: "choose-modifier", choice });
/** A click on Minimus. */
const clickMinimus = (api) => command(api, { encounter: KIND, type: "talk-to-minimus" });
/** The set-up's choice of modifiers, { id: level }. */
const modifiers = (selection) => ({ options: { modifiers: selection } });

// What Minimus offers, asked of an encounter the engine made (modifiers.js cannot be imported here: Sol Heredit's
// modifiers, which it imports, import the application's vendor chunk). Four things must hold, or the scenario throws:
// before wave 1 the offer is Blasphemy, Relentless, Frailty; an upgrade that is open is offered before any
// modifier not yet taken; Red Flag and Dynamic Duo are not offered before wave 7; a modifier at its last level is
// not offered.
function modifierOffers(engine, objTypeLoader) {
  const { encounter } = engine.createSimulationEngine({
    encounterConfig: { kind: KIND, mechanics: {} }, objTypeLoader, combatSeed: 1,
    inventory: engine.createEmptyInventory(), equipment: {}, combatSupplies: engine.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  const offer = (selection, wave, seed = 3) => {
    encounter.encounterSeed = seed;
    encounter.setModifiers(selection);
    encounter.wave = wave;
    encounter.openOffer();
    return encounter.offer.options.map((option) => option.label);
  };
  const rows = {
    first: offer({}, 1),
    afterBlasphemy: offer({ blasphemy: 1 }, 2),
    twoUpgrades: offer({ blasphemy: 2, volatility: 1 }, 4),
    blasphemyAtItsLast: offer({ blasphemy: 3, volatility: 1 }, 5),
    early: [1, 2, 3, 4, 5, 6].flatMap((wave) => [11, 12, 13, 14, 15, 16, 17, 18].flatMap((seed) => offer({ quartet: 1, totemic: 1 }, wave, seed))),
    late: [7, 8, 9, 10, 11].flatMap((wave) => [11, 12, 13, 14, 15, 16, 17, 18].flatMap((seed) => offer({ quartet: 1, totemic: 1 }, wave, seed))),
  };
  const checks = {
    first: rows.first.join() === "Blasphemy,Relentless,Frailty",
    upgradeFirst: rows.afterBlasphemy[0] === "Blasphemy (II)" && rows.twoUpgrades.slice(0, 2).sort().join() === "Blasphemy (III),Volatility (II)",
    lastLevelLeftOut: rows.blasphemyAtItsLast[0] === "Volatility (II)" && !rows.blasphemyAtItsLast.some((label) => label.startsWith("Blasphemy")),
    notBeforeWave7: !rows.early.some((label) => label === "Red Flag" || label === "Dynamic Duo") && rows.late.includes("Red Flag") && rows.late.includes("Dynamic Duo"),
  };
  if (Object.values(checks).includes(false)) throw new Error(`colosseum/modifier-offers: a check failed: ${JSON.stringify({ checks, rows })}`);
  return rows;
}

export const scenarios = [
  { name: "colosseum/spawn-allocation", pure: spawnAllocation },
  { name: "colosseum/modifier-offers", pure: modifierOffers },
  { name: "colosseum/south-spawn-presets", pure: southSpawnPresets },
  { name: "colosseum/practice-restart", pure: practiceRestart },
  {
    // Minimus and his offers, through wave 1 into wave 2. He stands at 32,34 from tick 1. A click on him on tick 3
    // opens his offer (Blasphemy, Relentless, Frailty) and the first is chosen on tick 6: he is gone on that tick and
    // wave 1 is placed on tick 11. The player prays against magic and shoots; the shaman dies last, on tick 70, and
    // the wave is completed on tick 74, 0:38 after it was placed. Minimus comes on tick 77, on the tile north of the
    // player, and his offer opens with him. An order to walk on tick 79 is held back; a click on Minimus on tick 82
    // gets "You must make a choice before continuing!"; the first choice on tick 85, Blasphemy (II), the one upgrade
    // that is open, lets him go: Minimus is gone, the player walks as he was ordered, and wave 2 is placed on tick 90.
    name: "colosseum/minimus-offers",
    kind: KIND,
    seed: 5,
    ticks: 130,
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
      if (tick === 3) clickMinimus(api);
      if (tick === 6) choose(api, 0);
      const state = seen(api);
      if (state.phase === "active") attackFirst(api, ["seer", "archer", "berserker", "shaman"]);
      // Held by Minimus: an order to walk, a click on him with the choice open, then the choice.
      if (state.phase === "intermission" && state.offer) {
        const sinceOffer = tick - (api.npcs().find((npc) => npc.id === "colosseum_minimus")?.spawnTick ?? tick);
        if (sinceOffer === 2) api.moveTo(30, 30);
        if (sinceOffer === 5) clickMinimus(api);
        if (sinceOffer === 8) choose(api, 0);
      }
    },
  },
  {
    // The ten modifiers that are also Sol Heredit's, all chosen in the set-up, without Minimus, through wave 1 into
    // wave 2. Placed with the wave on tick 5: a second berserker one tile south-east of the archer (Quartet), two bee
    // swarms (Bees! II) and an orb on the ring round each pillar (Solarflare I), none of which comes near the start
    // tile. The player has infinite health, stands on the start tile, prays against magic and from tick 21 shoots: a
    // totem first, then the shaman, the warband and the jaguar. Every hit that hurts him adds a stack of Doom, past the
    // 15 that would kill him without infinite health. A swarm has poisoned him by tick 33. The shaman is down to half
    // its hitpoints by tick 39: a totem appears beside it at 27,31 (Totemic) and is destroyed on tick 44. His prayer
    // has run out on tick 47 (Blasphemy II takes 40 % of the damage he is dealt from it), and the spells hurt from
    // then. The jaguar comes on tick 71 and claws for up to 53 (47 and 6 more, Relentless III). It dies beside him on
    // tick 138, is gone after tick 141 and explodes on tick 142 for 20 (Volatility II), the tick the wave is completed
    // on, 1:22 after it was placed. Wave 2 is placed on tick 150 with a second seer; its shaman gets a totem on tick
    // 169.
    name: "colosseum/modifiers-of-the-set-up",
    kind: KIND,
    seed: 71,
    ticks: 200,
    mechanics: { ...noMinimus, infiniteHealth: true },
    ...modifiers({ quartet: 1, relentless: 3, volatility: 2, doom: 1, blasphemy: 2, frailty: 1, myopia: 1, bees: 2, solarflare: 1, totemic: 1 }),
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
      if (seen(api).phase === "active" && tick > 20) attackFirst(api, ["totem", "shaman", "seer", "archer", "berserker", "jaguar"]);
    },
  },
  {
    // The four modifiers that only the waves have, and Volatility III, chosen in the set-up, on wave 7. The player
    // has infinite health, stands on the start tile and prays against magic. Dynamic Duo: a second shockwave colossus
    // is placed at 36,42, east of the first at 33,42, and the two clap on the same ticks. Mantimayhem III: the
    // manticore settles on ranged, melee, magic, an order it does not have without the modifier; each orb is two
    // hits, and the ranged orb of tick 21, not prayed against, makes him venomous on tick 22. Reentry III: the
    // javelin thrown high on tick 28 comes down on him on tick 34 and leaves molten sand on his tile, on 22,35 and
    // on 21,35, for the rest of the run; standing in it he takes 6 to 8 every tick from then. Red Flag: the minotaur
    // is placed at 32,48 on tick 71, walks round the two colossi south of it and smashes him from tick 83. From tick
    // 111 he shoots the warband beside him: each of the three is gone four ticks after it died and explodes on the
    // tick after (ticks 123, 143 and 163, for 24, 21 and 18), and each leaves sand on its tile, which Reentry makes
    // permanent (Volatility III).
    name: "colosseum/modifiers-of-the-waves",
    kind: KIND,
    seed: 72,
    ticks: 220,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "7" },
    ...modifiers({ dynamicduo: 1, reentry: 3, mantimayhem: 3, redflag: 1, volatility: 3 }),
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
      if (seen(api).phase === "active" && tick > 110) attackFirst(api, ["seer", "archer", "berserker"]);
    },
  },
  {
    // Wave 1 cleared before the reinforcements, and wave 2 after it. The player shoots from the start tile: the seer
    // first (a ranged hit on it always lands, for the most it can), then the archer and the berserker beside him,
    // then the shaman, praying against its magic throughout. The last monster dies well before tick 71, so no jaguar
    // comes. The shaman dies last, on tick 64, and is gone after tick 67: the wave is completed on tick 68, 0:38 after
    // its monsters were placed, and wave 2 is placed on tick 76. He goes on shooting, its seer first, and without
    // infinite health or a prayer against missiles the monsters of wave 2 kill him on tick 97.
    name: "colosseum/wave-1-cleared-early",
    kind: KIND,
    seed: 5,
    ticks: 110,
    mechanics: noMinimus,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
      if (seen(api).phase === "active") attackFirst(api, ["seer", "archer", "berserker", "shaman"]);
    },
  },
  {
    // Wave 1 with its reinforcement. The player runs to open floor (30,36) and only prays against magic until the
    // jaguar warrior is placed on tick 71, in the north row because he stands at y 33 or more. From that tick he prays
    // against melee and shoots: the jaguar, which walks down to him and claws three hits at once, then the warband
    // and the shaman, which dies last, on tick 145. The wave is completed on tick 149 and wave 2 is placed on tick 157.
    name: "colosseum/wave-1-reinforcements",
    kind: KIND,
    seed: 9,
    ticks: 165,
    mechanics: { ...noMinimus, infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(30, 36);
      if (tick === 2) pray(api, "ProtectMagic");
      if (tick === 71) pray(api, "ProtectMelee");
      if (tick > 71) attackFirst(api, ["jaguar", "seer", "archer", "berserker", "shaman"]);
    },
  },
  {
    // The spawn points near the player are left out. With this seed the shaman is placed at 29,37 when the player
    // stays on the start tile (colosseum/wave-1-cleared-early); here he runs there during the countdown and stands
    // on it on tick 4, so the shaman is placed elsewhere.
    name: "colosseum/spawn-away-from-player",
    kind: KIND,
    seed: 5,
    ticks: 30,
    mechanics: { ...noMinimus, infiniteHealth: true },
    ...magicGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(29, 37);
    },
  },
  {
    // Wave 2: the javelin colossus. The player stands on the start tile with infinite health. The colossus throws
    // every 5 ticks; each javelin hits 3 ticks after the throw. Its fifth attack is thrown high and comes down 6
    // ticks later on the tile the player stood on: the first one finds him there, and he steps aside from the second
    // on the tick after it is thrown, so it lands on an empty tile.
    name: "colosseum/wave-2-javelin",
    kind: KIND,
    seed: 21,
    ticks: 80,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "2" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectRange");
      const thrownHigh = api.engine.getLastTickEvents().some((event) => event.type === "zuk_attack" && event.attack === "colosseum_javelin_high");
      const highJavelins = api.engine.encounter.highJavelins.length;
      if (thrownHigh && highJavelins > 0 && tick > 45) api.moveTo(api.player().position[0], api.player().position[1] - 2);
    },
  },
  {
    // Wave 4: the manticore. The player stands on the start tile with infinite health and prays against missiles.
    // The manticore has him in reach and in sight from the start: it settles the order of its orbs on tick 8, the
    // third after it was placed, charges for 10 ticks, throws the three orbs on ticks 18, 19 and 20 (each lands a
    // tick after it leaves, and only the one that is prayed against as it leaves is blocked) and charges again.
    name: "colosseum/wave-4-manticore",
    kind: KIND,
    seed: 31,
    ticks: 60,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "4" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectRange");
    },
  },
  {
    // The last wave to the victory. The player has infinite health, prays against magic and shoots: the shockwave
    // colossus, the shaman that comes with the minotaur on tick 71, the warband, the javelin colossus, the two
    // manticores and the minotaur, which dies last, on tick 392, and is gone after tick 396. The wave is completed on
    // tick 397 and the run is won on tick 400.
    name: "colosseum/wave-11-to-victory",
    kind: KIND,
    seed: 61,
    ticks: 1200,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "11" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
      if (seen(api).phase === "active") attackFirst(api, ["shockwave", "shaman", "seer", "archer", "berserker", "javelin", "manticore", "minotaur"]);
    },
  },
  {
    // Wave 7: the shockwave colossus beside a javelin colossus and a manticore. The player stands still and prays
    // against magic; the clap's hit lands the later the farther away the colossus stands.
    name: "colosseum/wave-7-shockwave",
    kind: KIND,
    seed: 41,
    ticks: 50,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "7" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMagic");
    },
  },
  {
    // Wave 9: two manticores and the minotaur. The player shoots the javelin colossus down to under 60 % of its
    // hitpoints, then lets it be and walks to six tiles west of it, clear of the pillar. The minotaur, placed on tick 71, walks towards
    // him and on its way heals the colossus to full: it is wounded, within 7 tiles of the minotaur and in its sight,
    // and the player is not beside the minotaur.
    name: "colosseum/wave-9-manticores-minotaur",
    kind: KIND,
    seed: 51,
    ticks: 150,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "9" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectMelee");
      const [javelin] = monsters(api, "javelin");
      if (!javelin) return;
      const wounded = javelin.vitals.hp < javelin.vitals.maxHp * 0.6;
      if (!wounded && tick < 71 && api.player().attackTarget !== javelin.id) attack(api, javelin.id);
      if (wounded) {
        if (api.player().attackTarget !== null) attack(api, null);
        api.moveTo(javelin.position[0] - 6, javelin.position[1] + 1);
      }
    },
  },
  {
    // Solarflare I, wave 1. An orb circles each pillar on the tiles touching it, placed with the wave on tick 5; the
    // south-west pillar's starts at 23,25 and steps north every second tick. At level I an orb hits only on its second
    // tick on a tile (the wiki's "Solarflare skip"). The player waits on 23,27; the orb arrives there on tick 8 and he
    // steps ahead of it to 23,28 on the same tick: no hit. It arrives on 23,28 on tick 10 and he is still there on
    // tick 11, its second: a hit of 10 to 20 on tick 12, as he steps away to 21,28. The orb rests at the corner 23,29
    // from tick 12 to 18; he stands on it from tick 14, after its second tick, and leaves on tick 17: no hit. Every
    // tick the snapshot's orbTiles, which the overlay Solarflare True Tile marks, are the orbs' tiles, or the scenario
    // throws.
    name: "colosseum/solarflare-contact",
    kind: KIND,
    seed: 81,
    ticks: 30,
    mechanics: { ...noMinimus, infiniteHealth: true },
    ...modifiers({ solarflare: 1 }),
    ...rangedGear,
    script(tick, api) {
      // The overlay's true tiles (overlays.js) are the orbs' own tiles, every tick.
      const orbTiles = api.npcs().filter((npc) => npc.id.startsWith("colosseum_solarflare_")).map((orb) => orb.position.join(","));
      if (seen(api).orbTiles.map((tile) => tile.join(",")).join(" ") !== orbTiles.join(" ")) throw new Error(`orbTiles on tick ${tick}`);
      if (tick === 1) api.moveTo(23, 27);
      if (tick === 8) api.moveTo(23, 28);
      if (tick === 12) api.moveTo(21, 28);
      if (tick === 14) api.moveTo(23, 29);
      if (tick === 17) api.moveTo(21, 29);
    },
  },
  {
    // Solarflare III, wave 1. The orbs step every tick. The player stands on 23,28 with Protect from Magic up: the
    // south-west pillar's orb steps onto him on tick 8 and off him on tick 9, one contact, which turns his prayer off
    // and hits him on tick 9 for 20 to 30.
    name: "colosseum/solarflare-iii",
    kind: KIND,
    seed: 82,
    ticks: 20,
    mechanics: { ...noMinimus, infiniteHealth: true },
    ...modifiers({ solarflare: 3 }),
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) {
        api.moveTo(23, 28);
        pray(api, "ProtectMagic");
      }
    },
  },
  {
    // Wave 8 with the practice switches set to mage front, range back: a shockwave colossus on south spawn A (29,31)
    // and a javelin colossus on B (32,27), placed on tick 5, or the scenario throws. The player stands on the start
    // tile.
    name: "colosseum/south-presets-wave-8",
    kind: KIND,
    seed: 83,
    ticks: 12,
    mechanics: { ...noMinimus, infiniteHealth: true, colosseumStartWave: "8", colosseumSouthA: "shockwave", colosseumSouthB: "javelin" },
    ...rangedGear,
    script(tick, api) {
      if (tick !== 6) return;
      const at = ([x, y]) => monsters(api).find((npc) => npc.position[0] === x && npc.position[1] === y)?.id.split("_")[1];
      if (at(southSpawns.a) !== "shockwave" || at(southSpawns.b) !== "javelin") throw new Error(`colosseum/south-presets-wave-8: ${at(southSpawns.a)} on A, ${at(southSpawns.b)} on B`);
    },
  },
];
