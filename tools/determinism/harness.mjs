// Runs the simulation engine without a browser and digests its state at every
// tick, so that a refactor can be checked against the digests of the commit
// before it. Scenarios are in scenarios/*.mjs; the recorded digests are in
// test/determinism-digests.json and test/test-determinism.mjs compares them.
//
//   node tools/determinism/harness.mjs                  run all, compare with the recorded digests
//   node tools/determinism/harness.mjs --update         record the digests
//   node tools/determinism/harness.mjs --only yama      scenarios whose name contains "yama"
//   node tools/determinism/harness.mjs --file yama      only scenarios/yama.mjs (with any of the above)
//   node tools/determinism/harness.mjs --trace <name>   one line per tick: what happened
//   node tools/determinism/harness.mjs --dump <name> <tick>   the text that is digested at that tick
//   node tools/determinism/harness.mjs --self-test
//
// The engine runs on the real game cache (item stats, arena collision), read
// from client/osrs-cache/ as `npm run assets` leaves it. The client is the
// one under the current directory, so the same harness can run a second copy
// of the tree (an export of another commit) for comparison.
//
// Every seed is fixed: the engine's combat seed is passed in, and Math.random
// is replaced for the length of a scenario by a seeded generator, because the
// encounters draw their own seeds from it and a few places fall back to it.
//
// What the scenarios run (coverage.mjs measures it): four fifths of the
// engine chunk, and over nine tenths of the game logic of Yama, the Inferno,
// Sol Heredit and Zebak, with the shared combat rules they call. What no
// scenario can see: anything drawn or heard (scenes, audio rules), the React
// interface and how it turns clicks into actions, the replay recorder and
// player, and the cache loader beyond items and arenas.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const digestFile = "test/determinism-digests.json";
export const cacheZip = "client/osrs-cache/disk.zip";
const cacheManifest = "client/osrs-cache/manifest.json";

// ---------------------------------------------------------------------------
// Environment: the client chunks, the cache, the arena of each encounter.

let environment;
export function loadEnvironment() {
  return (environment ??= (async () => {
    register("./node-hooks.mjs", import.meta.url);
    globalThis.self ??= globalThis; // PicoGL reads `self` when it loads
    globalThis.location ??= { pathname: "/" }; // the cache loader reads the route
    // The Zebak modules fetch their map groups by web-root path.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, ...rest) =>
      typeof url === "string" && url.startsWith("/") ? new Response(readFileSync("client" + url)) : realFetch(url, ...rest);
    const chunk = (name) => import(pathToFileURL(`${process.cwd()}/client/assets/${name}.js`).href);
    const engineModule = await chunk("simulationEngineFactory");
    const rendering = await chunk("rendering");
    const { CacheManager, toLocPlacement } = await chunk("player");

    // The cache loader takes its storage and its download client as arguments.
    // Neither is needed: the archive is read from disk and handed over.
    const unused = new Proxy({}, { get: () => async () => null });
    const cacheManager = new CacheManager(unused, unused);
    cacheManager.cacheInfo = JSON.parse(readFileSync(cacheManifest, "utf8"));
    const zip = readFileSync(cacheZip);
    const warn = console.warn;
    console.warn = () => {}; // one sprite needs a canvas; the loader warns and carries on
    try {
      await cacheManager.MC(await cacheManager.bC(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)));
    } finally {
      console.warn = warn;
    }

    // What the application does once the cache is ready (useEncounterManager
    // in application.js): build the arena from the map and register it under
    // the encounter's kind, where the engine looks for it.
    const registry = rendering.encounterRegistry;
    const arenas = new Map();
    const arenaDescriptors = new Map(); // a variant with a map square of its own (the Doom's deeper room) builds its arena again
    async function prepareArena(kind) {
      const descriptor = registry.getDescriptor(kind) ?? registry.getDescriptorOfKindOrVariant(kind);
      if (arenaDescriptors.has(descriptor.kind) && arenaDescriptors.get(descriptor.kind) !== descriptor) arenas.delete(descriptor.kind);
      if (arenas.has(descriptor.kind) || (descriptor.collision?.mode ?? "auto") === "custom") return;
      const seed = descriptor.collision?.seed ?? descriptor.playerStart;
      const arena = await cacheManager.ld({
        mapX: descriptor.mapSquare.x,
        mapY: descriptor.mapSquare.y,
        seedX: seed[0],
        seedY: seed[1],
        mapSquareOffsets: descriptor.mapSquareOffsets,
        extraLocs: descriptor.collision?.dynamicLocs?.map(toLocPlacement),
        excludedStaticLocIds: descriptor.collision?.excludedStaticLocIds,
      });
      if (arena.bounds === null && arena.walkableTiles === null && arena.collisionMap === null)
        throw new Error(`no arena for ${kind}: is the map square in the trimmed cache?`);
      arenas.set(descriptor.kind, arena);
      arenaDescriptors.set(descriptor.kind, descriptor);
      rendering.registerArenaConfig(descriptor.kind, arena);
    }
    // getEncounterControls: the controls of an encounter kind (mechanics toggles, debug actions), as the menus read them.
    return { engineModule, objTypeLoader: cacheManager.getObjTypeLoader(), prepareArena, registry, controlsOf: rendering.getEncounterControls, rendering, cacheId: cacheManager.cacheInfo.id };
  })());
}

// ---------------------------------------------------------------------------
// Canonical text of a value: one line per leaf, in the order the program
// would see (property insertion order, Map and Set order). Functions are left
// out, classes are not named, so renaming code does not change the text;
// renaming or reordering a field of the state does.

export function canonicalText(root, skip = new Set()) {
  const lines = [];
  const seen = new Map();
  const walk = (label, value, depth) => {
    const head = " ".repeat(depth) + label;
    if (value === null || typeof value !== "object") {
      lines.push(head + (typeof value === "string" ? JSON.stringify(value) : Object.is(value, -0) ? "-0" : String(value)));
      return;
    }
    if (skip.has(value)) return void lines.push(head + "<skipped>");
    if (seen.has(value)) return void lines.push(head + "<ref " + seen.get(value) + ">");
    seen.set(value, seen.size);
    if (value instanceof WeakMap || value instanceof WeakSet) return void lines.push(head + "<weak>");
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return void lines.push(head + "<" + bytes.length + " bytes " + createHash("sha256").update(bytes).digest("hex").slice(0, 16) + ">");
    }
    if (Array.isArray(value)) {
      lines.push(head + "[" + value.length + "]");
      for (let i = 0; i < value.length; i++) {
        if (!(i in value)) lines.push(" ".repeat(depth + 1) + i + ": <hole>");
        else if (typeof value[i] === "function") lines.push(" ".repeat(depth + 1) + i + ": <function>");
        else walk(i + ": ", value[i], depth + 1);
      }
    } else if (value instanceof Map) {
      lines.push(head + "Map(" + value.size + ")");
      for (const [key, item] of value) {
        if (key !== null && typeof key === "object") {
          walk("key: ", key, depth + 1);
          walk("value: ", item, depth + 1);
        } else walk(JSON.stringify(key) + " => ", item, depth + 1);
      }
    } else if (value instanceof Set) {
      lines.push(head + "Set(" + value.size + ")");
      for (const item of value) walk("- ", item, depth + 1);
    } else {
      lines.push(head + "{");
      for (const key of Object.keys(value)) {
        if (typeof value[key] !== "function") walk(key + ": ", value[key], depth + 1);
      }
    }
  };
  walk("", root, 0);
  return lines.join("\n");
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Everything the engine holds after a tick: the state and the events the
 * application takes each tick, what its panels ask for between ticks, and the
 * engine object itself.
 */
function tickText(engine, skip) {
  const tick = engine.currentTick;
  const views = {
    theoreticalDps: engine.getAdjustedTheoreticalDps(),
    attackCooldown: engine.getPlayerAttackCooldown("player", tick),
    nextAttackTick: engine.getPlayerNextAttackTick("player"),
    attackSpeed: engine.getPlayerAttackSpeed("player"),
    npcAttackTimers: [...engine.worldState.actors.values()].filter((actor) => actor.kind === "npc").map((npc) => [npc.id, engine.getNpcAttackTimer(npc.id)]),
    pendingPrayers: [engine.pendingProtectionPrayer, engine.pendingOffensivePrayer, engine.pendingIndependentPrayers],
    pendingSpecialAttackToggles: engine.pendingSpecialAttackToggles,
    prayerRestoreRules: engine.getPrayerRestoreProjectionRules(),
    // The inventory panel asks where each item would be worn and whether it is ammunition.
    wearSlots: engine.player().inventory.map((entry) => (entry ? [engine.getEquipmentSlotForItem(entry.id), engine.isAmmoSlotItem(entry.id)] : null)),
    outcome: engine.getEncounterOutcome(),
  };
  return canonicalText({ state: engine.getState(), events: engine.getLastTickEvents(), views, engine }, skip);
}

// ---------------------------------------------------------------------------
// Running a scenario.

function seededRandom(seed) {
  // mulberry32
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inventoryOf = (ids = []) => Array.from({ length: 28 }, (_, slot) => (ids[slot] ? { id: ids[slot] } : null));

/**
 * Runs one scenario. Returns { digests, final, ticks, outcome, unseeded,
 * rebuilt } and calls onTick(tick, engine, text) after every tick.
 */
export async function runScenario(scenario, { onTick, wantText } = {}) {
  const { engineModule, objTypeLoader, prepareArena, registry, controlsOf, rendering } = await loadEnvironment();
  if (scenario.pure) {
    // Not a fight: the value of a function of the engine chunk's exports (and of the encounter registry, the controls,
    // and the exports of rendering.js, where the rules the engine and the encounters share are reached from).
    const texts = [canonicalText(scenario.pure(engineModule, objTypeLoader, registry, controlsOf, rendering), new Set([objTypeLoader]))];
    const digests = texts.map(sha256);
    return { digests, final: sha256(digests.join("")), ticks: 0, outcome: "pure", unseeded: { setup: 0, ticks: 0, rebuild: 0, sites: new Map() }, texts: wantText ? texts : undefined };
  }
  await prepareArena(scenario.kind);
  const skip = new Set([objTypeLoader]);

  const realRandom = Math.random;
  const random = seededRandom(scenario.seed ^ 0x5eed);
  const unseeded = { setup: 0, ticks: 0, rebuild: 0, sites: new Map() };
  let counting = "setup";
  Math.random = () => {
    unseeded[counting]++;
    const site = new Error().stack.split("\n")[2]?.trim().replace(/\(file:.*\/client\//, "(") ?? "?";
    unseeded.sites.set(site, (unseeded.sites.get(site) ?? 0) + 1);
    return random();
  };
  try {
    let mechanics = { ...scenario.mechanics };
    const loadout = () => ({
      inventory: inventoryOf(scenario.inventory),
      equipment: { ...scenario.equipment },
      combatSupplies: { ...engineModule.createEmptyCombatSupplies(), ...scenario.supplies },
      attackStylePerCategory: { ...scenario.attackStyles },
    });
    const engine = engineModule.createSimulationEngine({
      encounterConfig: { kind: scenario.kind, mechanics, ...(scenario.options ? { options: scenario.options } : {}) },
      objTypeLoader,
      enableIntro: scenario.intro === true,
      stats: scenario.stats,
      startHp: scenario.startHp,
      ...loadout(),
      startPosition: scenario.start,
      combatSeed: scenario.seed,
    });
    // Who declares the run complete: the encounter, or the application (a tutorial step, for one).
    if (scenario.completionOwnership) engine.setCompletionOwnership(scenario.completionOwnership);
    engine.applyPrepot(); // the application applies the pre-pot when a run starts
    let recording = engine.getEngineRunConfig();
    let frames = [{ input: null, actions: [], events: engine.getLastTickEvents(), state: engine.getState() }];
    const texts = [tickText(engine, skip)];
    onTick?.(0, engine, texts[0]);
    counting = "ticks";

    // What a script may do before a tick. Actions are the replay actions the
    // application records (SimulationEngine applies them by type).
    let target = null;
    let actions = [];
    let restarted = false;
    const freshFrames = () => [{ input: null, actions: [], events: engine.getLastTickEvents(), state: engine.getState() }];
    // The application's restart (Grid.js, the function that calls
    // engine.reset): reset the engine with the plan's start tile, encounter
    // seeds and run mechanics, put the loadout back, apply the pre-pot.
    const restartRun = (plan) => {
      const start = plan ? plan.startPosition : (engine.planRestartStart() ?? undefined);
      if (plan?.encounterSeeds) {
        const { completionOwnership, encounter } = engine.getEngineRunConfig();
        engine.reset(start ? [...start] : undefined, { completionOwnership, encounter: { kind: encounter.kind, seeds: { ...plan.encounterSeeds } } }, plan.runMechanics);
      } else {
        engine.reset(start ? [...start] : undefined, undefined, plan?.runMechanics);
      }
      const { inventory, equipment, combatSupplies, attackStylePerCategory } = loadout();
      engine.setAttackStylePerCategory(attackStylePerCategory);
      engine.setInventory(inventory);
      engine.setEquipment(equipment);
      engine.setCombatSupplies(combatSupplies);
      engine.applyPrepot();
      target = null;
      restarted = true;
    };
    const api = {
      engine,
      act: (action) => actions.push(action),
      moveTo: (x, y) => (target = [x, y]),
      mechanics(patch) {
        engine.setMechanicsConfig((mechanics = { ...mechanics, ...patch }));
        // Settings changed before the first tick belong to the run's start.
        if (engine.currentTick === 0) {
          recording = engine.getEngineRunConfig();
          frames = freshFrames();
        }
      },
      skipIntro: () => engine.completeIntro(),
      // The stats panel, the tutorial's pause, and a command the tutorial runs at once instead of queueing.
      setStats: (stats) => engine.setStats(stats),
      pause: (paused) => engine.setTutorialPaused(paused),
      commandNow: (encounterCommand) => engine.executeEncounterCommand(encounterCommand),
      // Asked by the interface before it sends an encounter-specific input (Sol Heredit's grapple).
      acceptsInput: (input) => engine.acceptsInput(input),
      // Before the first tick the application lets the player walk to a start tile.
      prepareStart: (x, y) => engine.prepareStartPosition([x, y]),
      finalizeStart() {
        engine.finalizeStartPosition();
        recording = engine.getEngineRunConfig(); // the application's recording starts from the chosen tile
        frames = freshFrames();
      },
      // The restart button: fresh encounter seeds, or the ones given. A new
      // recording starts here.
      restart: (encounterSeeds) => restartRun(encounterSeeds ? { encounterSeeds, startPosition: engine.planRestartStart() ?? undefined } : undefined),
      // An encounter command the way the interface sends it: if the encounter
      // answers with a restart plan (the Inferno's "retry wave"), restart;
      // otherwise queue the command.
      practice(encounterCommand) {
        const plan = engine.planPracticeRestart(encounterCommand);
        if (plan) restartRun(plan);
        else actions.push({ type: "encounterCommand", command: encounterCommand });
        return Boolean(plan);
      },
      npcs: () => [...engine.worldState.actors.values()].filter((actor) => actor.kind === "npc" && actor.alive),
      player: () => engine.player(),
    };
    for (let tick = 1; tick <= scenario.ticks; tick++) {
      actions = [];
      scenario.script?.(tick, api);
      if (restarted) {
        restarted = false;
        recording = engine.getEngineRunConfig();
        frames = freshFrames();
        texts.push(tickText(engine, skip));
        onTick?.(tick, engine, texts.at(-1));
        continue;
      }
      for (const action of actions) engine.injectAction(action);
      const input = target ?? engine.getState().playerPosition;
      const before = engine.currentTick;
      if (!engine.isTutorialPaused()) engine.advanceTick(input); // the application does not tick while the tutorial has paused the run
      if (engine.isLastTickInputLocked()) target = null; // the application drops the clicked tile while input is locked
      if (engine.currentTick === before) {
        continue; // no tick passes during the intro, a pause, after a death or after a victory; the script may still restart
      }
      frames.push({ input, actions, events: engine.getLastTickEvents(), state: engine.getState() });
      texts.push(tickText(engine, skip));
      onTick?.(tick, engine, texts.at(-1));
    }

    // The replay path: rebuild an engine from the recording at a frame in the
    // middle, then play the remaining frames on it.
    counting = "rebuild";
    const last = frames.length - 1;
    const rebuildAt = Math.floor(last / 2);
    const rebuiltEngine = engineModule.rebuildEngineAtReplayFrame(recording, frames, rebuildAt, objTypeLoader);
    if (!rebuiltEngine) throw new Error(`${scenario.name}: the replay rebuild returned nothing`);
    // What the application does with a rebuilt engine before it takes over:
    // drop the work limits and adopt the arena again (the rebuild puts the
    // previous one back).
    rebuiltEngine.clearReplayTakeoverWork();
    rebuiltEngine.reapplyArenaConfig();
    if (rebuiltEngine.getIntroActive()) rebuiltEngine.completeIntro();
    const rebuiltAt = sha256(tickText(rebuiltEngine, skip));
    for (let index = rebuildAt + 1; index <= last; index++) {
      if (frames[index].state.mechanicsConfig) rebuiltEngine.setMechanicsConfig(frames[index].state.mechanicsConfig);
      for (const action of frames[index].actions) rebuiltEngine.injectAction(action);
      rebuiltEngine.advanceTick(frames[index].input);
    }
    const digests = texts.map(sha256);
    return {
      digests,
      final: sha256(digests.join("")),
      ticks: texts.length - 1,
      outcome: engine.player().alive ? engine.getEncounterOutcome().phase : "dead",
      unseeded,
      rebuilt: { frame: rebuildAt, digest: rebuiltAt, final: sha256(tickText(rebuiltEngine, skip)) },
      replayMatches: stateText(rebuiltEngine, skip) === stateText(engine, skip),
      replayDifference: firstDifference(stateText(engine, skip), stateText(rebuiltEngine, skip)),
      texts: wantText ? texts : undefined,
    };
  } finally {
    Math.random = realRandom;
  }
}

/** What the application would draw: used to say whether a replayed run ends where the live run did. */
const stateText = (engine, skip) => canonicalText(engine.getState(), skip);
function firstDifference(live, replayed) {
  const a = live.split("\n"), b = replayed.split("\n");
  const line = a.findIndex((text, index) => text !== b[index]);
  return line < 0 ? null : { line, live: a[line], replayed: b[line] };
}

/** The form in which a scenario's result is recorded. */
export function recordOf(result) {
  if (result.outcome === "pure") return { ticks: 0, outcome: "pure", final: result.final };
  return {
    ticks: result.ticks,
    outcome: result.outcome,
    final: result.final,
    perTick: result.digests.map((digest) => digest.slice(0, 10)).join(" "),
    unseededRandomCalls: { setup: result.unseeded.setup, ticks: result.unseeded.ticks, rebuild: result.unseeded.rebuild },
    replayRebuild: { frame: result.rebuilt.frame, digest: result.rebuilt.digest.slice(0, 16), final: result.rebuilt.final.slice(0, 16), endsLikeLiveRun: result.replayMatches },
  };
}

/** Null if equal; otherwise a sentence that names the first difference. */
export function difference(name, recorded, actual) {
  if (!recorded) return `${name}: no recorded digests (run with --update)`;
  if (JSON.stringify(recorded) === JSON.stringify(actual)) return null;
  const was = (recorded.perTick ?? "").split(" ");
  const now = (actual.perTick ?? "").split(" ");
  const tick = now.findIndex((digest, index) => digest !== was[index]);
  if (tick >= 0) return `${name}: state differs from tick ${tick} on (see --dump ${name} ${tick})`;
  if (was.length !== now.length) return `${name}: ran ${now.length - 1} ticks, recorded ${was.length - 1}`;
  for (const key of ["outcome", "unseededRandomCalls", "replayRebuild"]) {
    if (JSON.stringify(recorded[key]) !== JSON.stringify(actual[key]))
      return `${name}: ${key} is ${JSON.stringify(actual[key])}, recorded ${JSON.stringify(recorded[key])}`;
  }
  return `${name}: differs`;
}

/** The scenario files, or the one named (so that a file being edited cannot break the others). */
export const scenarioFiles = ["engine", "shared", "yama", "inferno", "sol-heredit", "zebak", "fixture", "colosseum", "vardorvis", "doom-of-mokhaiotl", "zulrah"];
export async function loadScenarios(file) {
  const lists = await Promise.all((file ? [file] : scenarioFiles).map((name) => import(`./scenarios/${name}.mjs`)));
  const scenarios = lists.flatMap((module) => module.scenarios);
  if (new Set(scenarios.map((scenario) => scenario.name)).size !== scenarios.length) throw new Error("two scenarios share a name");
  return scenarios;
}

export const readRecorded = () => (existsSync(digestFile) ? JSON.parse(readFileSync(digestFile, "utf8")) : { scenarios: {} });

// ---------------------------------------------------------------------------

function selfTest() {
  const shared = { n: 1 };
  const cyclic = { name: "a", list: [1, , -0, NaN, "x"], map: new Map([["k", shared]]), set: new Set([shared]), fn() {}, bytes: new Uint8Array([1, 2]) };
  cyclic.self = cyclic;
  const text = canonicalText(cyclic);
  const expected = [
    "{",
    ' name: "a"',
    " list: [5]",
    "  0: 1",
    "  1: <hole>",
    "  2: -0",
    "  3: NaN",
    '  4: "x"',
    " map: Map(1)",
    '  "k" => {',
    "   n: 1",
    " set: Set(1)",
    "  - <ref 3>",
    " bytes: <2 bytes a12871fee210fb86>",
    " self: <ref 0>",
  ].join("\n");
  if (text !== expected) throw new Error("canonicalText:\n" + text);
  if (canonicalText({ a: 1, b: 2 }) === canonicalText({ b: 2, a: 1 })) throw new Error("property order must show");
  if (canonicalText({ a: 1, f() {} }) !== canonicalText({ a: 1 })) throw new Error("functions must not show");
  if (canonicalText({ big: shared }, new Set([shared])) !== "{\n big: <skipped>") throw new Error("skip");
  const a = seededRandom(7), b = seededRandom(7);
  if (a() !== b() || a() === a()) throw new Error("seededRandom");
  const record = { perTick: "aa bb cc", outcome: "active" };
  if (difference("s", record, { ...record }) !== null) throw new Error("difference: equal");
  if (!difference("s", record, { ...record, perTick: "aa xx cc" }).includes("tick 1")) throw new Error("difference: tick");
  console.log("determinism harness self-test passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const valueOf = (name) => (flag(name) ? args[args.indexOf(name) + 1] : undefined);
  if (flag("--self-test")) {
    selfTest();
  } else if (!existsSync(cacheZip)) {
    console.error(`${cacheZip} is missing: run "npm run assets" first`);
    process.exit(1);
  } else {
    const scenarios = await loadScenarios(valueOf("--file"));
    const named = (name) => scenarios.find((scenario) => scenario.name === name) ?? (console.error("no scenario " + name), process.exit(1));
    if (flag("--dump")) {
      const tick = Number(args[args.indexOf("--dump") + 2]);
      const result = await runScenario(named(valueOf("--dump")), { wantText: true });
      console.log(result.texts[tick] ?? `only ${result.ticks} ticks`);
    } else if (flag("--trace")) {
      const result = await runScenario(named(valueOf("--trace")), {
        onTick(tick, engine) {
          const counts = {};
          for (const event of engine.getLastTickEvents()) counts[event.type] = (counts[event.type] ?? 0) + 1;
          const player = engine.player();
          const npcs = [...engine.worldState.actors.values()].filter((actor) => actor.kind === "npc");
          const shown = npcs.slice(0, 6).map((npc) => `${npc.id}${npc.alive ? "" : "(dead)"}@${npc.position}:${npc.vitals.hp}`).join(" ");
          console.log(
            `${String(tick).padStart(3)} p@${player.position} hp${player.vitals.hp} pray${player.prayerState.points} ` +
              `spec${player.specialAttack.energy} | ${shown}${npcs.length > 6 ? ` +${npcs.length - 6}` : ""} | ` +
              Object.entries(counts).map(([type, count]) => (count > 1 ? `${type}x${count}` : type)).join(" "),
          );
        },
      });
      console.log(`${result.ticks} ticks, outcome ${result.outcome}, unseeded Math.random calls:`, result.unseeded.setup, "at setup,", result.unseeded.ticks, "in ticks,", result.unseeded.rebuild, "in the replay rebuild");
      for (const [site, count] of result.unseeded.sites) console.log(`  ${count}x ${site}`);
    } else {
      const only = valueOf("--only");
      const chosen = scenarios.filter((scenario) => !only || scenario.name.includes(only));
      const recorded = readRecorded();
      const { cacheId } = await loadEnvironment();
      let failures = 0;
      for (const scenario of chosen) {
        const started = Date.now();
        const record = recordOf(await runScenario(scenario));
        const problem = flag("--update") ? null : difference(scenario.name, recorded.scenarios[scenario.name], record);
        if (problem) failures++;
        recorded.scenarios[scenario.name] = flag("--update") ? record : recorded.scenarios[scenario.name];
        console.log(`${problem ? "DIFFERENT" : "ok       "} ${scenario.name.padEnd(34)} ${String(record.ticks).padStart(4)} ticks  ${record.outcome.padEnd(9)} ${record.final.slice(0, 12)}  ${Date.now() - started} ms${problem ? "\n  " + problem : ""}`);
      }
      if (flag("--update")) {
        // Keep the file in scenario order and drop scenarios that no longer exist.
        const all = await loadScenarios();
        const kept = Object.fromEntries(all.filter((scenario) => recorded.scenarios[scenario.name]).map((scenario) => [scenario.name, recorded.scenarios[scenario.name]]));
        writeFileSync(digestFile, JSON.stringify({ cache: cacheId, scenarios: kept }, null, 1) + "\n");
        console.log(`recorded ${chosen.length} scenarios; ${digestFile} now holds ${Object.keys(kept).length}`);
      }
      process.exit(failures ? 1 : 0);
    }
  }
}
