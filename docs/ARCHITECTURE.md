# Architecture

What lives in which file, how the simulation engine and an encounter talk to
each other, and how a route becomes a running fight. It is also the plan for
splitting the engine and the encounters into modules (ROADMAP, phase 6).

The client was reconstructed from bundles, so most names are still machine
names and files are far too large. Line numbers of `rendering.js` below are
from commit `87e78c7` and are only for orientation (the file has lost about
16,500 lines to `client/engine/`, `client/encounters/` and `client/util/`
and 175,400 to `client/data/` since, three quarters of what it was): find
code by name or by what it does.
Names in `code font` are the names in the code today, short ones included.

## Files

| File | Lines | What it holds |
|---|---|---|
| `client/assets/vendor.js` | 63 | Re-exports of the npm libraries. |
| `client/assets/player.js` | 2,031 | The cache loader: `CacheDatabase` (IndexedDB), `CacheDownloadClient`, `CacheManager` (unzips the cache, builds the type loaders, builds an arena's collision from a map square). |
| `client/engine/` | 16,131 | The simulation engine, 43 modules: the 23 of the engine itself, nine with the rules it shares with the encounters (the arena, collision, attack range, NPC state, formulas), two with the rules over the weapon and ammunition tables, six with the player's rules it shares with the interface (prayers, mechanics defaults, equipment bonuses, monster stats, retaliation, damage) and three with the player's starting state, the replay limits and the log event types. No rendering, no DOM. See "Engine" below. |
| `client/data/` | 175,361 | The data tables the engine reads, each with the lookups that answer from it, seven modules: monsters (138,911 lines), equipment (33,650), weapon categories, item variants, special attack definitions, combat spells, spot animation ids. See "Data tables" below. |
| `client/util/` | 246 | What every layer uses and is neither a rule of the game nor game data: the logger and the colour packing. Two modules that import nothing. See "Utilities" below. |
| `client/assets/simulationEngineFactory.js` | 50 | Re-exports `client/engine/` for the chunks that import the engine from here. |
| `client/assets/rendering.js` | 63,990 | Misnamed: cache decoding and the renderer, the tables of the scenes (weapon animations, projectiles), the encounters' scenes and their presentations. See "rendering.js" below. |
| `client/assets/Grid.js` | 55,965 | React components, and the hook that owns the engine and runs the tick loop (`mse`), the replay recorder and player. |
| `client/assets/application.js` | 54,723 | The React application: routes, settings, the encounter manager hook (`qwe`, log tag `useEncounterManager`). |
| `client/encounters/shared/` | 1,169 | What the encounters share and the engine itself does not need: the NPC definition framework, NPC attack rolls, the default pursuit, the route search, the default scene builder. Six modules. See "Shared rules" below. |
| `client/encounters/registry.js` | 212 | The encounter definitions (for each encounter its kind, the factory of its encounter object, its descriptor and its controls), found in the `encounter.js` of every directory beside it; the lookups over them, and `encounterRegistry`, which the engine asks for the encounter of a kind. Moved out of `rendering.js` and cleaned. See "The encounters" below. |
| `client/encounters/presentations.js` | 57 | What draws an encounter, for the encounters written in modules: `presentationBuilders`, the functions found in the `presentation.js` of every encounter's directory, which `rendering.js` calls with its base scene class. See "Engine and encounter" below and `docs/ADDING-AN-ENCOUNTER.md`. |
| `client/encounters/lobby/` | 177 | The lobby encounter, `LobbyEncounter.js`, and its three NPCs, `lobbyNpcs.js`. Moved out of `rendering.js` and cleaned. |
| `client/encounters/yama/` | 2,798 | Yama, phase 3, in fourteen modules. Moved out of `rendering.js` and cleaned. See "The encounters" below. |
| `client/encounters/sol-heredit/` | 3,882 | Sol Heredit, in fifteen modules. Moved out of `rendering.js` and cleaned. |
| `client/encounters/inferno/` | 6,448 | The Inferno, in twenty-four modules. Moved out of `rendering.js` and cleaned. |
| `client/toa/zebak/*.js` | 1,700 | The Zebak encounter, written for this project against the same interface as the original three. `native.js` is the model for what an encounter module should look like. |
| `client/audio/soundEffects.js` | | Sound-effect synthesizer. In the browser it runs in `soundEffectsWorker.js`, off the main thread. |
| `tools/determinism/` | | Headless harness that runs scripted fights and digests the engine state every tick (`test/test-determinism.mjs`). |

Imports between the chunks: the engine imports the data modules of
`client/data/`, the two modules of `client/util/`, `vendor.js`, and the
encounter registry, `client/encounters/registry.js`, in
`createSimulationEngine.js`. No module of `client/engine/`,
`client/data/`, `client/util/` or `client/encounters/` imports
`rendering.js` or another chunk. `rendering.js` imports none of the engine's
classes; it imports the twenty rule modules of `client/engine/`, the data
modules, the utilities and the modules of `client/encounters/shared/` for
its scenes and menus, the encounter modules for its scenes, the registry
to pass it on to `Grid.js` and `application.js`, and
`client/encounters/presentations.js` for the presentations that are written
in modules. The encounter modules
import the rule modules, the data modules and the logger directly: see
"The import cycle" below, which is no longer one. `Grid.js` and
`application.js` import
all of the chunks and each other. The Zebak modules import nothing from the
chunks; `client/encounters/tombs-of-amascut/encounter.js` imports them and
hands them the rules they need
(`zebakDefinition({ makeCollision, rollAttack, ... })`).

### rendering.js

| Lines (about) | Contents |
|---|---|
| 1 – 30,000 | Bundler helpers, bzip2 and cache decoding, the WebGL renderer. The logger was here (now `client/util/logger.js`) and the renderer's colour packing (now `client/util/packHsl.js`). The current arena and `CollisionFlag` were here (now `client/engine/arena.js` and `collision.js`), `Prayer` with its tables (now `client/engine/prayerTables.js`), `LogEventType` (now `client/engine/logEventTypes.js`), the item variants and the spot animation ids (now `client/data/itemVariants.js` and `spotAnimIds.js`). The mechanics lists of the menus stay. |
| 30,000 – 207,000 | Was the data tables. The ones the engine reads are in `client/data/` now: the monster table (139,000 lines), the combat spells, the equipment list (33,600 lines), the weapon categories. The player's starting state sat between the spells and the equipment table (now `client/engine/playerState.js`). What stays is the tables of the scenes: the animations of each weapon (8,000 lines) and the projectile of each kind of ammunition (1,100 lines). |
| 207,000 – 213,000 | Was the shared game rules (now `client/engine/` and `client/encounters/shared/`), the player's equipment bonuses (now `client/engine/equipmentStats.js`), the Inferno's setup helpers (now `client/encounters/inferno/`), the ammunition rules and the weapon lookups (now `client/engine/ammunition.js` and `weapons.js`) and the special attack table (now `client/data/specialAttackDefinitions.js`). What stays: what only the Inferno's menus use, and tables for the scenes (projectile and spell visuals, audio rules). |
| 213,000 – 238,300 | Presentation: audio rules, terrain, actor and effect renderers, the scene classes: `SceneCompositor`, the base of all of them (4,000 lines), `iN` Sol Heredit, `qN`/`ZN` Yama, the lobby's `IE`/`CE`, and `InfernoScene`, which the Inferno uses as it is and which the presentations written in modules are handed as their base scene (Zebak and the nexus extend it). The members a scene of a module calls or overrides have real names (`tools/names/scene-members.json`); 89 other methods of the compositor still have the bundle's two or three letters. An NPC's retaliation and the protection prayer's reduction sat among them (now `client/engine/npcRetaliation.js` and `damage.js`), and the replay limits in front of the projectile classes (now `client/engine/replayLimits.js`). |
| 238,335 – 243,013 | Was the Inferno; now `client/encounters/inferno/`. |
| 243,014 – 243,163 | Was the lobby encounter; now `client/encounters/lobby/`. |
| 243,247 – 246,835 | Was Sol Heredit; now `client/encounters/sol-heredit/`. |
| 246,868 – 248,923 | Was Yama phase 3; now `client/encounters/yama/`. Two of its constants stay here (see "The import cycle"). |
| 248,932 – 249,143 | Was the encounter definitions and the lookups over them; now `client/encounters/registry.js`. One lookup stays, `EV` (the mechanics keys a kind knows), because it reads the mechanics lists of the menus. |
| 249,151 – 249,360 | Presentations `KV`: scene builder, render config, audio rules, camera, menu art. Four entries are written here (Yama, the lobby, Sol Heredit, the Inferno); those of the encounters written in modules come from `client/encounters/presentations.js`. |
| 249,741 – 249,793 | Was the encounter registry `encounterRegistry`; now `client/encounters/registry.js`. |
| 249,800 – 255,860 | Replay validation, canvas overlays, React components of the game view, exports. |

Code that only one encounter reaches (script: top-level bindings reachable
from its class and from what its registry entry mentions, and from nothing
else) has moved out: the Inferno (181 bindings / 6,020 lines), Sol Heredit
(126 / 3,730), Yama (60 / 2,240) and the lobby (6 / 150). What several of
them use, and what the engine uses too, followed (185 statements, 2,560
lines: "Shared rules" below), then what Yama and the Inferno share only
with their own scenes and menus (46 statements, 700 lines), and then the
player's rules the engine shares with the interface (38 statements, 750
lines), then the player's starting state, the replay limits and the log
event types (36 statements, 290 lines: the last three rule modules of the
engine table), then the data tables the engine reads with the rules
over them (84 statements, 175,700 lines: "Data tables" below), and last the
logger, the colour packing and two leftovers of the Inferno and the lobby
(10 statements, 290 lines: "Utilities" below).

## Engine

The engine is the modules of `client/engine/`. A module only imports modules
above it in this table, so there is no import cycle among them; all of them
may import the data modules of `client/data/`, the utilities of
`client/util/` and `vendor.js`. The first
twenty are the rule modules: nine with the rules the engine shares with the
encounters and the scenes, two with the rules over the weapon and
ammunition tables (`weapons.js`, `ammunition.js`), six with the player's
rules it shares with the interface, and three that import nothing at all
(the player's starting state, the replay limits, the log event types). They
moved here from `rendering.js` and can be imported from anywhere: none of
them imports `rendering.js`. Five take lookups from `client/data/`
(`combatFormulas.js`, `weapons.js`, `ammunition.js`, `equipmentStats.js`,
`monsterStats.js`). None of the other 23 modules imports a chunk either:
`createSimulationEngine.js` takes the encounter registry from
`client/encounters/registry.js`, and `encounterKinds.js` reads its table of
kinds off the same module, so it must be imported by no encounter (see "What is left in rendering.js for the
engine": nothing). Three take the logger
from `client/util/` (`CombatSystem.js`, `SimulationEngine.js`, `replay.js`),
and `SimulationEngine.js` the colour packing.

| Module | Lines | Contents | Uses |
|---|---|---|---|
| `collision.js` | 109 | `CollisionFlag` (the bits of a tile's collision flags and the masks made of them), `createCollisionMap` | |
| `arena.js` | 145 | the current arena, one module state: `setArenaConfig`, `getArenaBounds`, `isArenaTileWalkable`, `isInsideArenaBounds`, `getArenaCollisionMap`; the arenas registered by encounter kind (`registerArenaConfig`, `getRegisteredArenaConfig`) | |
| `random.js` | 16 | `createSeededRandom`, `hashInteger` | |
| `attackRange.js` | 207 | footprints (the square of tiles an actor covers), `hasLineOfSight`, `isFootprintInAttackRange`, `isTileInAttackRange` | arena, collision |
| `npcState.js` | 255 | what an NPC record says at a tick: bound, targetable, attackable; the death record (`recordNpcDeath`, `markNpcDeathStarted`, the death animation tick, `reviveNpc`); hitpoint regeneration | attackRange |
| `decisions.js` | 31 | `createRandomDecisions`: chance, integer and weighted choice from a random function. Each call takes a key that names its site; this implementation ignores the key | |
| `occupancy.js` | 122 | `OccupancyMap` (the tiles NPC footprints block; `world.occupancy`), `createOccupancyStepCheck` | |
| `combatFormulas.js` | 450 | attack and defence rolls, hit chance, max hit, prayer multipliers, the formula stats of an NPC and of the player. Imports the Tombs of Amascut roll scaling from `/toa/zebak/rules.js` and the weapon category definitions from `client/data/` | |
| `projectiles.js` | 56 | hit delay by weapon kind and distance, projectile flight in client cycles and ticks | |
| `weapons.js` | 274 | what a weapon is to the rules, from its id, its category and the selected style: `getPoweredStaffBaseMaxHit`, `getHitDelayWeaponKind`, `getRangedDefenceType`, `getWeaponFormulaStyle` (stab, slash, crush, ranged, magic), `computePlayerCombatParams` (attack speed and range), `getWeaponProjectileTiming`; `formulaStyleToAttackStyle`, `formulaStyleToAttackKind`. Reads the item variants and the weapon categories of `client/data/` | projectiles |
| `mechanicsConfig.js` | 17 | `commonMechanicsDefaults` (the mechanics settings every encounter has) and `buildMechanicsConfig`, which lays the encounter's defaults and the player's settings over them | |
| `prayerTables.js` | 79 | `Prayer`, the slot of each prayer (`prayerSlotByPrayer`: protection, offensive, independent), its drain (`prayerDrainEffects`), the prayers a mechanics setting unlocks (`isPrayerUnlockedByMechanics`), `createPrayerState` | mechanicsConfig |
| `npcRetaliation.js` | 92 | what an NPC does when it is attacked: `scheduleNpcRetaliation` (at once, or pending until the hit lands), `resolvePendingRetaliations`; the modes `standard`, `retarget`, `one-tick` | `scheduleNextActionTick` from `client/encounters/shared/npcHelpers.js` |
| `damage.js` | 53 | `resolveRolledDamage` (a number, or a roll between two), `isCorrectProtectionPrayer`, `applyPrayerReduction` (block, cap, reduce, bypass) | prayerTables |
| `ammunition.js` | 92 | which ammunition fits which weapon: the variant arrows with their ranged strength (`variantArrowsByItemId`), the weapons that need arrows, bolts or atlatl darts, the kind of an ammunition item (by its name in the equipment table), `isArrowOrBolt`, `weaponRequiresAmmo`, `isAmmoCompatibleWithWeapon`. Reads the item variants and the equipment list of `client/data/` | |
| `equipmentStats.js` | 454 | the graceful sets and `getGracefulBonusPercent`; an item's bonuses from its cache params, with the override table (`getItemEquipmentStats`); the bonuses of a loadout (`computeEquipmentStats`); `getCarriedWeight`. Reads the item variants of `client/data/` | ammunition |
| `monsterStats.js` | 65 | `getMonsterHitpoints`, `getMonsterFormulaStats`, `applyMonsterStatOverride`. Reads the two Maps over the monster table of `client/data/` | |
| `playerState.js` | 269 | what the player's state is made of and what a run starts with: the spellbook names and `isSpellbook`; the stat names with their labels and level bounds (`statNames`, `combatStatNames`, `decayingStatNames`, `clampStatLevel`, `isValidStatLevel`); a stat block new, from levels, cloned and reset (`createDefaultStats`, `createStatsFromLevels`, `cloneStats`, `resetStatsToMax`); `getCombatLevel`; the special attack, timer, poison and run energy records (`createSpecialAttackState`, `createCombatTimers`, `createPoisonState`, `createRunEnergy`); three item ids | |
| `replayLimits.js` | 34 | `ReplaySafetyError` (a reason and details), the limits a replay is held to before it is played or taken over (`snapshotNpcLimit`, `snapshotWorkLimit`, `projectileWorkLimit`, ...) and the tests of its values (`isSafeReplayCycle`, `isSafeReplayPosition`, `isSafeReplaySize`) | |
| `logEventTypes.js` | 9 | `LogEventType`, the types of the events in the log | |
| `supplies.js` | 231 | Zod schemas of item references, the rune pouch and the combat supplies; parsing, cloning and comparing them; `normalizeInventory`, `isItemStackable` | playerState |
| `encounterKinds.js` | 84 | `encounterDefinitions` (kind, variant kinds, route slug) and the retired kinds, read off the registered definitions (`client/encounters/registry.js`) and, for the fights that are not built, `client/dt2/bosses.js` | |
| `spells.js` | 273 | rune ids, combination runes, staves, level and rune requirements, `canCastSpell` | |
| `prayers.js` | 223 | `applyPrayerActions`, prayer restore formulas | prayerTables |
| `consumables.js` | 1,003 | the consumable table (`consumableDefinitionByItemId`), stat boosts and restores, cooldown tracks, `applyConsumableEffects` | prayers, playerState |
| `specialAttacks.js` | 400 | what a special attack leaves behind (`applySpecialAttackEffects`) and the instant specials; burn and poison as they are put on a target (the pulses are in `CombatSystem.js` and `SimulationEngine.js`); run energy (`updateRunEnergy`); Mark of Darkness; of the soulreaper axe and Death Charge only the stack count and the timers' tick (the rest is in `SimulationEngine.js` and `playerAttack/`) | npcState, playerState |
| `attackResources.js` | 88 | the ammunition or the spell an attack uses (`resolveAttackResources`: an ammunition id, a spell name, nothing, or "unavailable"; no runes are counted) | ammunition, spells |
| `thralls.js` | 250 | the greater thralls of the Arceuus spellbook: what a resurrection needs and does, the thrall's turn (it moves, and queues its hits as the player's), its snapshot for the scene. Not an actor of the world: it lives on `player.thrall` while it is there | attackRange, arena, npcState, projectiles |
| `CombatSystem.js` | 1,038 | attack timers, queued hits, hit resolution | npcState, npcRetaliation, damage, specialAttacks |
| `playerAttack/projection.js` | 519 | damage distributions, `projectPlayerAttack` (expected and maximum damage over the accuracy branches); also the two tests of the confliction gauntlets that `launch.js` uses (`isConflictionGauntletsAttack`, `isSameConflictionAttack`) | |
| `playerAttack/roll.js` | 350 | guaranteed-hit overrides, `rollDamageSpec`, `rollAttackPlan` | projection |
| `playerAttack/plan.js` | 679 | an attack plan from a profile, void sets, `buildPlayerAttackPlan` | combatFormulas, weapons, ammunition, roll |
| `playerAttack/formula.js` | 196 | formula stages: chinchompas, crystal armour, demonbane, twisted bow | |
| `playerAttack/profiles.js` | 1,156 | weapon id sets, the special attack profiles, `selectPlayerAttackProfile` | formula |
| `playerAttack/planPlayerAttack.js` | 187 | `planPlayerAttack`, `rollAttackPlanOutcome`, the selected combat style | weapons, specialAttacks, projection, roll, plan, profiles |
| `playerAttack/launch.js` | 1,163 | targeting, `launchPlayerAttack`, area targets and ricochets, `performPlayerAutoAttack` | attackRange, npcState, projectiles, weapons, npcRetaliation, specialAttacks, attackResources, projection, formula, planPlayerAttack |
| `bootstrap.js` | 80 | the replay bootstrap schema and its work limits | replayLimits |
| `TickEventBuffer.js` | 28 | the events of the current tick | |
| `prayerProjection.js` | 95 | what the pending prayer inputs will do (`projectPendingPrayerOps`) | consumables, prayers |
| `playerMovement.js` | 529 | path search, `computePlayerStepToTile`, `computePlayerStepToNpc` | arena, attackRange, collision |
| `WorldState.js` | 81 | tick, actors, pending hits, area effects, ground items, occupancy | occupancy |
| `SimulationEngine.js` | 4,651 | one tick (`runTick`), the player's inputs, state for the interface (`getState`) | all of the above except collision, occupancy, combatFormulas, ammunition, replayLimits, roll, plan, formula and profiles; `NpcDefinitionRegistry` from `client/encounters/shared/` |
| `createSimulationEngine.js` | 53 | `buildSimulationEngine`, `createSimulationEngine`: asks the registry for the encounter of a kind, constructs the engine around it, applies the loadout | SimulationEngine; `encounterRegistry` from `client/encounters/registry.js` |
| `replay.js` | 185 | `rebuildEngineAtReplayFrame`, and the class `ReplayTakeoverWorkTracker` that counts its work against the limits (not exported) | arena, replayLimits, bootstrap, createSimulationEngine |

`client/assets/simulationEngineFactory.js` only re-exports these modules, for
`Grid.js` and `application.js`, which still import from it under one-letter
aliases. `tools/plans/engine-split.json` is the plan the split was made from
(`tools/split-chunk.mjs`).

### One tick

`engine.advanceTick(targetTile)` runs one tick (600 ms of game time) unless the player
is dead, the intro is showing or the encounter is won. In order:

1. advance `worldState.tick`; queued encounter commands run
   (`executeCommand`); the `onTickStart` rule may end the run, and then the
   tick ends here;
2. the player's queued inputs (prayers, equipment, items, specials): dropped
   while the rule `playerInputLocked` says so, with his attack target and a
   pickup he had ordered; otherwise applied in the order they came. Clicks
   on equipment slots are not applied by the engine: the encounter's hooks
   get them as `inputs`;
3. `encounter.resolveHazards` – ground and timed damage;
4. the NPC band: pending retaliations, `prepareNpcBand`, then each NPC in
   processing order takes its turn, then `completeNpcBand`. A turn: the hits
   queued on that NPC land, a death that is due starts, burn and poison
   pulse, its hitpoints regenerate; then it moves (`moveNpc` or its
   definition's `move`), `resolveNpcLocalEffects`, and it acts
   (`processNpcTick`);
5. hits queued on the player land (`CombatSystem`); the player's upkeep runs
   (timed effects, poison, prayer drain, special attack energy, timers, stat
   decay and recovery, hitpoint regeneration);
6. a target that can no longer be attacked is dropped, and a ground item the
   player had ordered picked up is taken if he stands on its tile; the
   player moves unless his input is locked (toward his target NPC while it
   is out of range or he stands under it, without a target toward the
   clicked tile; `moveDisplacedPlayer` may move him instead), then attacks
   if able (`performPlayerAutoAttack`);
7. a soulreaper stack decays; `encounter.processPostTick`; run energy,
   defeats (`onNpcDefeated`), a timed protection prayer expires, dead NPCs
   are removed;
8. the tick's events are flushed: `engine.getLastTickEvents()` returns them.

The same list is written above `runTick` in `SimulationEngine.js`, with one
above `runNpcTurn` for an NPC's turn.

Player inputs between ticks go through `engine.injectAction(action)`; the
action types (`attackTarget`, `protectionPrayer`, `equipFromInventory`,
`specialAttackToggle`, `encounterCommand`, ...) are the ones stored in
replays. Most are queued for the next tick (seventeen of the twenty-five
types; `equipmentSlotClick` and `encounterCommand` have queues of their
own). Nine act at once: `castMarkOfDarkness`, `castDeathCharge`, `castThrall`,
`ctrlClick`, `swapInventory`, `attackStyleChange`, `selectedSpellChange`,
`setBossHp` and `applyBossHpPreset`.

### Randomness

Everything is seeded. The engine takes `combatSeed` and derives
`combatRandom`; each encounter keeps its own seeds (`getSeeds()`,
`reset(seeds)`): Yama `encounterSeed`, `fireballSeed`, `voidFlareSeed`,
`firstRangeMageType`; the Inferno `runSeed`; Sol Heredit and Zebak
`encounterSeed`. A replay is the bootstrap (`engine.getEngineRunConfig()`: loadout,
mechanics, seeds) plus the inputs of every tick; `rebuildEngineAtReplayFrame`
replays them. `Math.random` is called in three places only: to pick a seed
when none is given (each encounter's constructor does, so the registry's
`create` always draws one), for Yama's default start tile, and for the new
combat seed of a restart. None of them runs during a tick. It also stands
as a fallback where a caller could leave the random function out
(`CombatSystem`'s constructor, `resolveRolledDamage` in `damage.js`, three
places of `playerAttack/launch.js`); the engine always passes its seeded
function, so none of the fallbacks is reached.

`tools/determinism/` holds scripted fights and the digest of the engine's
state after every tick of each; `test/test-determinism.mjs` fails when any of
them changes. Run `node tools/determinism/harness.mjs` after every change to
the engine or an encounter.

## Engine and encounter

An encounter registers itself: `client/encounters/registry.js` takes every
`encounter.js` of a directory beside it and `presentations.js` every
`presentation.js`, with Vite's glob import, so no list is written by hand
(`docs/ADDING-AN-ENCOUNTER.md` is the guide to adding one;
`tools/determinism/import-glob.mjs` writes the glob out for Node). An
encounter has

- a definition, the `definition` of its `encounter.js`, in
  `registeredEncounterDefinitions` (`client/encounters/registry.js`), in the
  order of the modules' `order`: `{ kind, factory(options), descriptor, controls,
  enableIntro?, variantFactories?, variantControls?, retiredEntries?,
  countdownMovement? }`. `factory` returns the encounter object. The
  descriptor holds what the interface needs before a fight exists: display
  name, map square, player start, how to build the arena collision
  (`collision: { mode: "auto", seed, dynamicLocs? }`), variants or modifiers,
  the victory text. `controls` lists the mechanics toggles, debug commands
  and boss hitpoint presets.
- a presentation: `{ kind, sceneBuilder(context), renderConfig?, audio?,
  defaultCamera, presentation? }`. The scene classes are in `rendering.js`,
  so a presentation written in a module is a function that is handed the
  base scene and returns the entry, the `presentation` of the encounter's
  `presentation.js`; `presentationBuilders`
  (`client/encounters/presentations.js`) is those functions.
  `rendering.js` calls each when it is loaded and puts the results in front
  of the four presentations it still holds itself (Yama, the lobby, Sol
  Heredit, the Inferno) in its list `KV`, from which it fills the scene
  builder registry `de`, the audio layers and the cameras.

The engine's `encounterDefinitions` (`client/engine/encounterKinds.js`: a
kind's variant kinds and route slug) are not a third list: they are read off
the definitions when the module is loaded.

### What the engine calls on an encounter

Always (the encounter must have them):

| Member | When |
|---|---|
| `kind` | identification, replays |
| `reset(seeds?)`, `getSeeds()` | new run, restart, replay rebuild |
| `getDefaultMechanicsConfig()` | merged under the player's mechanics settings |
| `getDefaultPlayerStart(mechanics)` | when no start tile is given |
| `getIntroConfig(mechanics)` | if the intro is enabled; `null` for none |
| `getArenaConfig()` | when the cache has not provided an arena for the kind |
| `createNpcs(startTile)` | start of a run |
| `resolveHazards(context, mechanics)` | every tick, before the NPCs; returns damage to apply |
| `processPostTick(context, mechanics)` | every tick, after the player; returns damage to apply |
| `getOutcome()` | `{ phase: "active" \| "resolving" \| "victory", ... }` |
| `getSnapshot({ tick, mechanics, world })` | what the scene draws: `{ kind, state, visuals }` |
| `getNpcDamageSourceLabel(npcId)` | damage log |

If present:

| Member | When |
|---|---|
| `getNpcDefinitions()` | the encounter's NPC behaviours (see below) |
| `getEngineRules()` | rule overrides (see below) |
| `refineArenaConfig(arena)` | lets the encounter alter the arena (Inferno pillars, Zebak rocks) |
| `configureRunStart(mechanics, runStartContext)` | at tick 0, whenever the mechanics change |
| `runStartMechanicsKeys` | mechanics that stay fixed once a run has started |
| `prepareNpcBand(context, mechanics)`, `completeNpcBand(context, mechanics)` | around the NPC turns |
| `removeNpcIfDue(npc, context, mechanics)` | before an NPC's turn |
| `moveNpc(npc, context, mechanics)` | replaces the definition's movement |
| `resolveNpcLocalEffects(npc, context, mechanics)` | after an NPC moved |
| `processNpcTick(npc, context, mechanics)` | an NPC's turn: nothing, or `{ npcAttacks?, environmentalDamages }` (the engine iterates `environmentalDamages` without a default) |
| `onPlayerAttackStarted(attack, context)`, `onPlayerAttackResolved(hit, context)` | the player's attack |
| `onNpcDefeated(defeat, context, completionOwnership)` | an NPC reached 0 hitpoints |
| `executeCommand(command, commandContext, mechanics)` | a debug action of the encounter |
| `acceptsInput(input)` | encounter-specific input (Sol Heredit's grapple) |
| `approachRange(npcId, attackRange)` | how close to walk to a target (Zebak's jugs) |
| `moveDisplacedPlayer(player, targetTile, place, step, applyHit)` | the encounter moves the player (Zebak's waves) |
| `syncBossHp(hp, { world })`, `enterBossHpPhase(hp, context)` | the boss hitpoint controls |
| `planPracticeRestart(command, mechanics, { playerPos })`, `planRestartStart(mechanics, { playerPos })` | restarts |

`getEngineRules()` returns an object the engine reads during combat. All
members are optional: `onTickStart`, `playerInputLocked`,
`modifyPlayerCombatParams`, `validateAttack`, `multiCombat`,
`incomingDamageMultiplier`, `outgoingDamageMultiplier`, `specialAttacks`,
`playerMinimumHit`, `playerAlwaysAccurate`, `consumePlayerGuaranteedMaxHit`, `playerMaxHpReduction`,
`prayerDrain`, `prayerRestrictions`, `itemRestrictions`,
`monsterStatOverrides`, `onPlayerDamageTaken`, `isTombsOfAmascut`,
`playerDamageOnNpc`. The last, `(damage, { attacker, target, attack }) =>
damage`, decides a player's hit on one of the encounter's NPCs as it lands
(the Doom of Mokhaiotl's larvae and shield); `isDemonbaneAttack(attack)` of
`engine/playerAttack/formula.js` tells a demonbane weapon or spell. An NPC
whose `formulaStats.alwaysAccuratePlayerHit` is true is hit by every attack.
Two rules are asked as a player's attack is planned, with the rules
context and `{ style, target }` (`style` is "melee", "range" or "magic"):
`playerMinimumHit(maximumRolledDamage, context, attack)` returns the least
the hit does, and `playerAlwaysAccurate(context, attack)` makes it sure to
hit when it returns true (the Leviathan's weak spot and its pathfinder).
Two more are asked with `(target, tick)` as a player is about to attack:
`playerAttackOnCooldown`, while the weapon cools down, returns undefined (no
attack) or `{ keepCooldown }`; `playerAttackKeepsReady`, with a weapon that is
ready, makes the attack start no cooldown when it returns true.

`isPlayerAttackProtected(style, target, { tick, player, world })`, asked for
each hit of a player's attack as it is launched, makes the hit do nothing
when it returns true (a boss praying against the style); the DPS projection
asks it too and shows zero. The tick context's `deactivateAllPrayers()` turns
every prayer of the player off.

`getNpcDefinitions()` returns a set of per-NPC behaviours (class
`NpcDefinitionRegistry`, built from definitions made with
`defineNpc({ id, ... })`). The engine calls `assertDefinitionMatches(npc)`
(when an NPC is spawned), `move`, `attackTimer`, `notifyDamageResolved`,
`notifyDeathStarted`, `notifyDeathAnimation`, `releaseOnDeathAnimation`,
`notifyDefeated`, `notifyDespawn`.

### What an encounter gets from the engine

The encounter never holds the engine. It is handed context objects:

- the tick context (`resolveHazards`, `processPostTick`, NPC hooks): `tick`,
  `playerPos`, `world`, `tickEvents`, `inputs`, `npcMovements`, `logEvent`,
  `spawnNpc`, `despawnNpc`, `queueNpcHit`, `grantNextAttackSpeedup`,
  `delayNextAttack`, `setProtectionPrayer`, `disableProtectionPrayersUntil`,
  `teleportPlayer`,
  `getPlayerWeaponState`, `attackObject`;
- the NPC definition context: `tick`, `world`, `tickEvents`, `random`,
  `decisions`, `spawnNpc`, `despawnNpc`, `queueNpcHit`, `logEvent`,
  `setProtectionPrayer`, `disableProtectionPrayersUntil`;
- the rules context: `tick`, `player`, `world`;
- the command and run-start contexts: `world`, `spawnNpc`, `despawnNpc`
  (and `tick`, `playerPos` for commands, `placePlayer` at the run's start).

`world` is the `WorldState`: `tick`, `actors` (a Map by id; the player is
`"player"`), `pendingHits`, `areaEffects`, `groundItems`, `occupancy`, and the
lookups `getPlayer()` (player), `getNpc(id)` (NPC by id), `getNpcs()` (all NPCs).
`tickEvents.emit(event)` adds an event for the renderer and the audio layer.
Shared rules (accuracy and damage rolls, projectiles, line of sight, the
current arena) are functions of the rule modules: see "Shared rules".

## Shared rules

What the engine and the encounters share was in `rendering.js`; it is now in
the first nine modules of the engine table above (what the engine uses too)
and in `client/encounters/shared/` (what only the encounters use). The
eleven rule modules after them hold the rules over the weapon and
ammunition tables, the player's rules and starting state, the replay limits
and the log event types, which the interface in `rendering.js`, `Grid.js`
and `application.js` uses as well. A module of `client/encounters/shared/`
only imports modules above it in this table, and the rule modules of
`client/engine/`.

The directories are not strictly "engine below, encounters above": the
engine takes two things from `client/encounters/shared/`.
`SimulationEngine.js` imports `NpcDefinitionRegistry` (the empty registry of
an encounter without NPC definitions), and `npcRetaliation.js` imports
`scheduleNextActionTick` from `npcHelpers.js`, a three-line function that
seven modules of the Inferno use too. Both stay where the encounters
look for them; neither module imports `rendering.js`, so the order of
evaluation is not at stake.

| Module | Lines | Contents | Uses |
|---|---|---|---|
| `npcAttack.js` | 190 | `rollNpcAttack(options)`: accuracy and damage of an NPC's attack from its plan, with labelled seeded decisions, as the hit the engine queues; `isNpcInAttackRange`, `getDistanceFromNpcCentre` | engine: attackRange, decisions, combatFormulas, projectiles |
| `npcMovement.js` | 321 | can a footprint step to a neighbouring tile of the arena (`canFootprintStepInArena`: the collision masks per direction); the default NPC movement `getNpcPursuitMoves` (one step toward a tile next to the target, or out from under it) | npcAttack; engine: arena, collision, npcState, decisions, attackRange, occupancy |
| `npcDefinitions.js` | 275 | `defineNpc({ id, ... })` and `NpcDefinitionRegistry`, through which the engine reaches an NPC's `move`, `attackTimer` and the death notifications; the registry's `tick`, `postTick` and `resolveLocalEffects` are called by the encounters, not by the engine | npcMovement; engine: npcState |
| `npcRoutes.js` | 289 | `findNpcRoute` (breadth-first search in a 128 x 128 window, to a tile or to melee range, with the closest approach as fallback), `getBossPursuitMoves` (this tick's steps of a boss along such a route) | npcMovement |
| `npcHelpers.js` | 72 | small things every encounter does: `healNpc`, `faceActorToward`, `scheduleNextActionTick`, the visual of an NPC's projectile, the outcome `{ phase: "active" }` | npcAttack; engine: npcState, projectiles |
| `buildScene.js` | 22 | `buildScene(Scene, renderConfig, context)`: the scene builder of an encounter that draws nothing of its own, or the set-up of a scene that extends the base scene. It is handed the scene class (the classes are in `rendering.js`) and makes the four calls every scene builder makes. A module of its own because `presentations.js` imports every presentation, and a presentation must not import that module back | nothing |

- An NPC's death is a record on the actor (`npcState.js`): `recordNpcDeath`
  makes it `pending` with a kill tick and a process tick, the engine starts it
  (`markNpcDeathStarted`, then the definition's `onDeathStarted`), and with
  the death policy `"queued"` the death animation waits three ticks after the
  NPC's last step. `startScriptedNpcDeath` is the encounter's own way to kill
  an NPC at once; `reviveNpc` clears the record and counts a new life.
- Decisions: an NPC definition draws randomness through `context.decisions`
  (`decisions.js`), each call with a key that names its site
  (`"npc.attack.accuracy"`, `"npc.movement.overlap_escape"`). The engine's
  own `createRandomDecisions` ignores the key and draws from one stream;
  the key is there for a caller that gives the engine a decisions factory
  of its own (the constructor option `combatDecisions`).
- Attack range: `isFootprintInAttackRange` takes two footprints and
  `{ attackRange, checkCollision, meleeReach }`. Melee reach is cardinal
  unless the attacker says `"diagonal"`. With `checkCollision`, range 1
  needs a pair of facing tiles with no wall between them, and a longer
  range or diagonal reach needs line of sight (`hasLineOfSight`, the game's
  fixed-point walk over the collision map).

## Data tables

`client/data/` holds the tables the engine reads. They were the bulk of
`rendering.js` (175,400 of its 240,000 lines). The rule for the directory:

- A module of `client/data/` is one table of game data (ids, names,
  numbers) with the lookups that answer from it. It holds no rule of
  combat. A rule that reads a table (which ammunition fits a weapon, how
  fast a style attacks, how long a projectile flies) is in `client/engine/`
  (`ammunition.js`, `weapons.js`, `monsterStats.js`, `equipmentStats.js`).
- A data module imports only other data modules, `vendor.js` (Zod) and a
  rule module of the engine that itself imports nothing. It never imports
  `rendering.js`, so it can be imported from anywhere and is evaluated in
  full before its importer runs. One does the third: `weaponCategories.js`
  takes `defaultSpellbook` from `client/engine/playerState.js`.
- The tables are JavaScript modules, not JSON. A statement can be moved
  out of the chunk and proved identical character for character
  (`tools/split-chunk.mjs --extract --verify`); a conversion to JSON cannot
  be proved that way. And several tables are not plain data: two are parsed
  with Zod when the module loads, the special attacks share entries by
  reference (which the determinism digests see), and the item variants are
  written inside the loop that reads them.
- An entry is data: its keys are not renamed and its text is not
  reformatted. Short keys such as `atk` and `str` in the monster table are
  part of the data's format. The equipment list is generated from the wiki
  by a script that is not in this repository (its six hand-added entries
  say so and name `sync-osrs-data.ts`); an item's bonuses come from the
  game cache, not from this list.

| Module | Lines | Contents | Imports | Read by |
|---|---|---|---|---|
| `itemVariants.js` | 841 | the list of `{ baseId, variantIds }` (the variants of an item and the item the rules treat them as) and `getBaseItemId`: an item's base id, or the id itself | | six engine modules and four of `playerAttack/`; `weaponCategories.js`, `specialAttackDefinitions.js` |
| `spotAnimIds.js` | 57 | `spotAnimIds`: spot animation ids by their name in the cache | | `SimulationEngine.js`, `specialAttackDefinitions.js`, `yama/voidFlareSpotAnim.js`, the scenes |
| `monsters.js` | 138,911 | the monster table (per entry the NPC type ids, name, version, size, levels, offensive and defensive bonuses, attributes, immunities), the Maps `monsterByNpcTypeId` and `monsterByNpcTypeIdAndVersion`, `getMonsterName` | | `monsterStats.js` |
| `combatSpells.js` | 467 | `combatSpells` (name, spellbook, element, max hit, secondary effect), parsed with Zod when the module loads; the fixed hit delays and the multi-target spells by name; `getSpellDefinition`, and for the interface `getCombatSpellsOfSpellbook`, `isSupportedCombatSpell`, `getSpellIconName` | Zod | `supplies.js`, `playerAttack/launch.js`, `plan.js`; `weaponCategories.js` |
| `equipment.js` | 33,650 | every wearable item (`ids`, name, slot, category, version: 32,000 lines), parsed with Zod when the module loads; the canonical id of each variant (1,400 lines); `getEquipmentDefinition`, `getCanonicalEquipmentId`, and for the interface `getEquipmentDefinitions`, `getEquipmentVariantIds`, `getItemName`, `getInventoryActions` | Zod | `ammunition.js`, `specialAttacks.js`, `playerAttack/launch.js`, `profiles.js`, `projection.js` |
| `weaponCategories.js` | 849 | `weaponCategoryDefinitions` (the styles of each of the 23 categories: name, attack type, combat style, icon), the category of about a hundred weapons, the spell a staff casts by itself; `getWeaponCategory`, `getWeaponCategoryOrUnarmed`, `getWeaponCategoryDefinition`, `getDefaultAttackStyleIndex`, `getActiveSpell` | itemVariants, combatSpells; `defaultSpellbook` of `engine/playerState.js` | `combatFormulas.js`, `weapons.js`, `SimulationEngine.js`, `playerAttack/launch.js`, `planPlayerAttack.js`, `projection.js`; `sol-heredit/modifiers.js` |
| `specialAttackDefinitions.js` | 586 | the special attack of a weapon by its id (energy cost, animation, graphic, effects), `getSpecialAttackDefinition`, `hasSpecialAttack` | itemVariants, spotAnimIds | `SimulationEngine.js`, `specialAttacks.js`, `playerAttack/launch.js`, `planPlayerAttack.js`, `profiles.js` |

- Two tables map an item to a main id, and they are not the same table:
  `getBaseItemId` (item variants) is what the rules ask before they look a
  weapon up in a category, special attack or timing table;
  `getCanonicalEquipmentId` (equipment) is used in three places of the
  engine. A table keyed by weapon id is only ever asked for base
  ids: an entry under a variant's id is never found.
- A weapon's category for the rules comes from `weaponCategories.js`, not
  from the `category` the equipment list carries; a weapon that is not in
  it fights as `unarmed`.
- `rendering.js` imports all seven modules for its scenes and menus and
  still exports their names for `Grid.js` and `application.js`.

## Utilities

`client/util/` holds what every layer uses and is neither a rule of the
game nor game data. The rule for the directory:

- A module of `client/util/` imports nothing: no chunk, no module of the
  engine, the data or an encounter, not `vendor.js`. So anything may import
  it, the engine and the data modules included, and it is evaluated in full
  before its importer runs.
- It knows nothing of the game: no item, no NPC, no tick. What knows the
  game belongs in `client/engine/` (a rule), `client/data/` (a table) or
  an encounter's directory.
- It may use the browser where it says so. The engine itself has no
  rendering and no DOM; the logger writes to the console and reads the URL,
  which is why it is here and not in `client/engine/`.

| Module | Lines | Contents | Read by |
|---|---|---|---|
| `logger.js` | 230 | `logger`, one object for the whole client, made when the module loads: `error`, `warn`, `info`, `debug`, `trace` with a category (`logger.warn("Replay", ...)`), a level and category filters (`setLevel`, `isEnabled`; the URL parameters `logLevel` and `logCategories`, read once by `readUrlParams`), the last 30 lines as breadcrumbs, an error sink, and `init()`, which puts the commands `__log` on `window`. `LogLevel` (NONE to TRACE) | `CombatSystem.js`, `SimulationEngine.js`, `replay.js`, `yama/fireballs.js`; the chunks through `rendering.js` |
| `packHsl.js` | 16 | `packHsl(hue, saturation, lightness)`: the cache's 16-bit colour (six bits of hue, three of saturation, seven of lightness; the saturation is halved for each of four steps of high lightness) | `SimulationEngine.js` (the colour of one outline), the renderer |

- The logger reads `window` inside `try` when it is made, and `init()` is
  called by the application. In Node (the determinism harness) there is no
  `window`: the logger works and reads no URL.
- Nothing in this repository reads the breadcrumbs or sets the error sink;
  `getLevel`, `setErrorSink`, `getBreadcrumbs` and `clearBreadcrumbs` have
  no caller in the client (the determinism scenario
  `shared/logger-and-colour` calls them).
- `rendering.js` imports both modules and still exports `logger`,
  `LogLevel` and `packHsl` for `Grid.js`, `application.js` and `player.js`.

## The encounters

Every monster and boss is an NPC definition made with
`defineNpc({ id, ... })` and collected in an `NpcDefinitionRegistry` (both in
`client/encounters/shared/npcDefinitions.js`); the encounter classes hold the
fight-wide state.

**The registry** – `client/encounters/registry.js`. The table
`registeredEncounterDefinitions` (one definition per encounter: the lobby,
Yama with its five contract variants, Sol Heredit, the Inferno, and the two
of `client/toa/`, Zebak and the nexus), the lookups over it
(`getEncounterControls`, `isIntroEnabledForKind`, `hasCountdownMovement`,
`resolveKindOrRetiredEntry`, which turns the retired kind `zuk` into the
Inferno at wave 69) and `encounterRegistry`: `register(kind, factory,
descriptor?)`, `create(kind, options)`, `getRegisteredKinds()`,
`isRegistered(kind)`, `getDescriptor(kind)` and
`getDescriptorOfKindOrVariant(kind)`. The module registers every definition
when it is loaded, a variant kind with its factory and without a
descriptor. It imports the encounter classes and their controls, the rules
it hands Zebak (five modules of the engine, three of the encounters), and no
chunk: the top of the module says what a definition holds.

**Lobby** – `client/encounters/lobby/LobbyEncounter.js`. No boss; its arena
is made by hand (a disc of walkable tiles around the centre, minus eight
obstacles on a ring, the three lobby NPCs and the gateways) and built once.
The three NPCs are the table `lobbyNpcs` in `lobbyNpcs.js` (actor id, NPC
type, tile, facing), which the lobby's scene in `rendering.js` reads too.
It takes Sol Heredit's NPC type id from `sol-heredit/constants.js`: the one
import between two encounter directories.

**Yama, phase 3** – `client/encounters/yama/`. A module only imports modules
above it in this table, the shared rules, the data modules and the logger
(`fireballs.js`). The first four are what the encounter shares with its
scene, which `rendering.js` imports.

| Module | Lines | Contents |
|---|---|---|
| `cacheArena.js` | 7 | the arena the cache loader built from the map (`setArenaConfigFromCache`), which `getArenaConfig` uses (without it the arena is empty) |
| `sceneConstants.js` | 20 | Yama's tile, the sealed rows of the arena, the two spawn commands, the death cause `"detonated"` |
| `fireballGeometry.js` | 264 | the phase of a fireball at a tick, the three tiles of its impact line and the tiles of its explosion, per angle; when the bursts of a cycle start |
| `shadowWaves.js` | 128 | `getYamaWaveTiles(tick, ...)`: the tiles of the shadow waves, from the pattern's period, deltas and speed, with seeded random offsets |
| `constants.js` | 31 | NPC type ids, void flare spawn tiles, the player's start area, Yama's lines on defeat, `mixSeed` |
| `voidFlareSpotAnim.js` | 3 | `voidFlareImpactSpotAnimId`: the spot animation of a void flare's hit on the player, read from `spotAnimIds` of `client/data/` when the module loads |
| `beatClock.js` | 44 | `getYamaBeatInfo(tick, attackPattern)`: is this tick a beat, which one, is it a fireball or void flare beat; `getNextYamaBeatTick` |
| `fireballBursts.js` | 107 | the schedule of the bursts: which fireballs are in the air at a tick (`getScheduledFireballs`), the angle of each fireball of a burst, the ids of the scheduled fireballs, the perfect-dodge tiles. Was `fireballWaves.js`; it never held a wave |
| `contracts.js` | 361 | the default attack pattern and numbers, the five contracts (`divineSeveranceContract` ... `glyphicAttenuationContract`) with their engine rules, `yamaContractVariants` for the menu |
| `controls.js` | 137 | `buildYamaControls(contract)`: mechanics toggles, debug actions and debug flags. Yama has no boss hitpoint presets. `presetsKey` of a contract's menu entry (`contracts.js`) is something else: it names the loadout presets the interface keeps for the variant |
| `voidFlares.js` | 300 | the void flare NPC (`voidFlareNpcDefinition`) and `VoidFlareCoordinator`, which decides how many are owed and where they spawn |
| `boss.js` | 334 | Yama's NPC definition (`yamaNpcDefinition`), his attack policy, the attack he queues and its accuracy roll |
| `fireballs.js` | 345 | `FireballRuntime`: bursts, impact and explosion damage, the perfect dodge, what the scene draws |
| `YamaEncounter.js` | 717 | the encounter class: state and seeds, the tick hooks, shadow waves, commands, the arena |

- The fight runs on a clock: a beat every 7 ticks, ten beats to a cycle
  (`getYamaBeatInfo`). The pattern per beat is `defaultYamaAttackPattern`, or
  the contract's own.
- Yama's attacks: in the post-tick of a beat he queues a melee if the
  player is adjacent, otherwise (and not on a snap fireball beat) magic or
  ranged, and launches it in his next turn; magic and ranged have a 3-tick
  windup. `yamaAttackPolicy` decides melee or not. The style that is queued
  alternates from a seeded opening style by a count of the magic and ranged
  attacks queued so far (`queueAlternatingAttack` in `boss.js`); the style
  the policy computes from the beat is not used.
- The order of the hooks within a tick, with what each does for this
  fight, is written at the top of `YamaEncounter.js`; Yama's own timeline
  (queue, launch, windup, impact) above `yamaNpcDefinition` in `boss.js`.
- A melee that Yama plans has two effects outside `boss.js`, in the same
  post-tick: the beat's fireball burst is cancelled
  (`FireballRuntime.processPostTick`) and one void flare becomes owed
  (`VoidFlareCoordinator.processPostTick`). The flag is `didPlanMelee`.
- Fireballs: bursts of three on beats 0, 3 and 7; damage on the line, then on
  the blob; the perfect dodge (`resolveFireballHazards` in `fireballs.js`,
  which `FireballRuntime.resolveHazards` calls). A fireball lives
  `fireballLifetimeTicks`, 5: three falling, one of impact, one of explosion.
- Shadow waves: `YamaEncounter.resolveHazards` asks `isPlayerOnYamaWave`; the
  tiles the scene draws come from `getYamaWaveTiles` in `shadowWaves.js`, the
  same lines listed for the whole arena.
- Void flares: `VoidFlareCoordinator.processPostTick` decides how many are
  owed; the flare explodes after 25 ticks, hurts the player and heals Yama.
- Contracts are configurations that change numbers and add engine rules
  (`getEngineRules` hands the contract's `engineRules` to the engine).
- State: `state.run`, `state.fireballs`, `state.voidFlares`,
  `state.lifecycle`, made by `createYamaEncounterState` from the seeds.
- Some names are data and say less than they should: the determinism
  digests cover the whole encounter object (every field of the class and of
  its runtime objects, each actor's state, the snapshot, the events), and
  the scenes read the snapshot and the events. So `state.run.openingStyleSeed`
  (not a seed: "magic" or "range"), `state.fireballs.startPositions` (impact
  centres), the snapshot's `phaseIndex` (a fireball's id) and
  `ticksIntoPhase` (its age) and the event `wave_activated` (every tick, not
  once per wave) keep their names; each has a comment where it is written.

**Sol Heredit** – `client/encounters/sol-heredit/`. A module only imports
modules above it in this table, the shared rules and the data modules.

| Module | Lines | Contents |
|---|---|---|
| `constants.js` | 226 | arena bounds, start tiles, timings and damages of the triple attack, NPC type ids, animation and spot animation ids, message colours; `isSolArenaTile`, `emitColosseumVisual`. Imports nothing: the scene in `rendering.js` reads these tables too |
| `boundaryLocs.js` | 41 | `solBoundaryLocs`: the 48 placements of the arena's boundary, twelve along each side. The registry hands them to the arena's collision as `dynamicLocs`; the scene in `rendering.js` draws them. Imports nothing |
| `phases.js` | 46 | `solPhases` (90, 75, 50, 25, 10 % of hitpoints, with taunts), `getSolPhaseForHp`, `isSolEnragePhase` |
| `controls.js` | 139 | `buildSolHereditControls()`: mechanics toggles, debug actions, hitpoint presets |
| `modifiers.js` | 269 | the modifier list and its menu order, the setup notes, `SolModifierState` (the rules of doom, frailty, myopia, blasphemy as engine rules), the schema of the encounter's options |
| `actors.js` | 167 | `createColosseumActor(kind, id, position)`: the actor record of Sol, a beam crystal, an orb, a bee swarm, the totem |
| `bossAttacks.js` | 333 | the tiles a spear or a shield hits, the attack scheduler (`scheduleSolAttack`, `scheduleSolSpecialAttack`) |
| `grapple.js` | 186 | grapple targets and taunts, the defending click, `resolveSolGrapple` |
| `boss.js` | 249 | `solNpcDefinition` (pursuit; landing spear, shield and triple hits; the eager-prayer rule), `tryLaunchSolAttack` |
| `lightBeams.js` | 291 | the beam crystals on the arena edge and `LightBeamRuntime` (charge, fire, hit) |
| `moltenSand.js` | 96 | `MoltenSand`: strikes, burning tiles, pools |
| `minions.js` | 516 | the quartet's warbander (`warbanderNpcDefinition`) and the bees (`beeSwarmNpcDefinition`), with their routes |
| `solarflare.js` | 141 | the orbs: `CornerRoute`, `solarflareNpcDefinition`, their damage |
| `modifierEffects.js` | 429 | `SolModifierEffects`: spawns and drives orbs, bees, the warbander and the healing totem, and the volatility blast when Sol dies |
| `SolHereditEncounter.js` | 753 | the encounter class |

- The order of the hooks within a tick is written at the top of
  `SolHereditEncounter.js`. Sol's own turn is not `processNpcTick` (only the
  warbander acts there): it is `completeNpcBand`, a fixed sequence that ends
  with the launch of his next attack.
- Phases by hitpoints: `solPhases`, advanced one at a time by
  `SolHereditEncounter.startPhaseTransition` when Sol is idle (taunt, a sand
  strike, a new crystal).
- The boss: `scheduleSolAttack` picks the next attack (spear, shield, triple,
  grapple), `tryLaunchSolAttack` launches it, the definition's
  `resolveLocalEffects` lands it 3 ticks later; movement is
  `getBossPursuitMoves` on the path search `findNpcRoute`, both in
  `client/encounters/shared/npcRoutes.js`.
- Where an attack lands is in `bossAttacks.js` under its own name:
  `getSpearAttackTiles` with `getDiagonalSpearAttackTiles`,
  `getShieldAttackTiles`, the direction (`getSolAttackDirection`,
  `getDirectionFromCentre`); so are the choice of the next attack
  (`getSpecialAttackChance`, `getNextAttackVariant`,
  `getRegularAttackIntervalTicks`) and the three phase tests
  (`areSpecialAttacksUnlocked`, `isGrappleUnlocked`, `isLongTriplePhase`).
- Grapple: the answer is a click on a worn-equipment slot, which reaches the
  encounter through `acceptsInput`. An undefended grapple is resolved
  `grappleWindowTicks` (4) after it starts, a defended one on the tick of
  the click (`resolvePendingGrapple`).
- Modifiers: `SolModifierState` holds their rules and state,
  `SolModifierEffects` their actors.
- As in Yama's directory, the fields of the classes, the state of an actor
  and the snapshot are covered by the determinism digests and keep their
  names where they say little (`grappleReadyTick`, `rawEnrageArmTick`,
  `pools` against `burning`, `spawned`, `totemDue`, the role's
  `attackPhase`); each has a comment.

**The waves of the Colosseum** – `client/encounters/colosseum/`, kind
`colosseum`: the first encounter added without a chunk, through the three
lists. Its scene is the default one; `docs/COLOSSEUM.md` has its sources and
everything inferred. It imports Sol Heredit's modules for the warband, the
modifiers' actors and the rules of four modifiers.

| Module | Lines | Contents |
|---|---|---|
| `constants.js` | 239 | tiles, tick counts, the six monsters (`colosseumMonsters`), Minimus, spot animation ids; what each source is called in a comment |
| `waves.js` | 163 | which monsters a wave has, where they are placed, the reinforcements; one random stream per wave and purpose |
| `controls.js` | 83 | the set-up's start wave and "Minimus offers modifiers"; the seven toggles of the overlays |
| `modifiers.js` | 190 | the fourteen modifiers with the game's texts, Glory and sprites; which three are offered before a wave |
| `modifierEffects.js` | 273 | `WaveModifierEffects`: bee swarms, the orb, the totem, explosions, molten sand |
| `waveMonster.js` | 103 | a monster's actor, its walk, when it may attack, Relentless |
| `shaman.js`, `jaguar.js`, `javelin.js`, `manticore.js`, `shockwave.js`, `minotaur.js` | 72, 40, 97, 219, 52, 111 | one NPC definition each |
| `visuals.js` | 60 | turns the `colosseum_visual` events of Sol's definitions into the default scene's `inferno_visual` |
| `ColosseumEncounter.js` | 625 | the encounter class and its definition: Minimus, the offer, the countdown, the wave, the reinforcements, the completion, the victory |
| `intermission.js` | 335 | the game's interface 865, in which a modifier is chosen, as elements over the page |
| `overlays.js`, `losLinks.js` | 224, 45 | what two RuneLite plugins show: panels over the page, tiles and lines handed to the scene, links to the LoS tool |
| `presentation.js` | 117 | the render config, the molten sand, the scene that brings the interface and the overlays in step every frame |
| `audio.js` | 84 | the sounds the game's server sends for the javelin colossus (another session's work) |

**The Inferno** – `client/encounters/inferno/`. A module only imports
modules above it in this table, the shared rules and the data modules. One
exception: `waves.js` and `spawnLayout.js` import each other (a layout is
validated against the wave's monsters, and a wave's spawns are built from a
layout); both use the other only inside functions.

| Module | Lines | Contents |
|---|---|---|
| `collisionFlags.js` | 5 | the collision masks of a pillar and of an obstacle, made from `CollisionFlag` |
| `events.js` | 64 | `emitInfernoVisual`, `emitInfernoNpcAttack` (turns the actor to its target and emits two events: the attack's animation and projectiles as an `inferno_visual`, and a `zuk_attack`), `emitZukAttack`; the scenes read these events |
| `constants.js` | 131 | NPC type ids, arena bounds, the map square, start tiles, the nine spawn tiles, the tick offsets and strings of the wave-69 intro. Imports nothing: the scene in `rendering.js` reads these tables too |
| `actors.js` | 208 | the actor record of each monster kind and variant (`createInfernoActor`) |
| `monsterHelpers.js` | 138 | what the monsters' definitions share: labelled random picks, attack reach, the hit and death events, the current target |
| `pillars.js` | 189 | the three pillars (`infernoPillars`), their NPC definitions, and the arena with their collision (`buildArenaConfigWithPillars`) |
| `waves.js` | 553 | the table of the 68 waves (`getInfernoWaveComposition`), the Jad waves, the seeded spawn layout of a wave (`buildInfernoWaveSpawns`) |
| `spawnLayout.js` | 157 | a spawn layout chosen in the menu: `validateInfernoSpawnLayout`, its text form (`"62:blmrgg---"`), the monsters of a wave that take a spawn tile |
| `startTile.js` | 90 | a start tile chosen in the menu: `validateInfernoStartTile` (in the arena, not under a standing pillar, open floor), tile text, which waves can be started at or pinned |
| `spawnCommandType.js` | 27 | `getInfernoSpawnCommandType(encounterSnapshot)`: which of the two spawn commands the menu offers for the wave on screen ("reroll-wave" when the wave's layout was chosen in the menu or the wave is pinned, "keep-spawns" when it can be pinned and is not), and `isInfernoSnapshot` |
| `controls.js` | 284 | mechanics keys, `getInfernoSetup(mechanics)` (start wave, pillars, layout), `buildInfernoControls()` |
| `bat.js`, `blob.js`, `meleer.js`, `nibbler.js`, `mager.js`, `ranger.js`, `jad.js` | 63 – 603 | one NPC definition per monster: the blob with its three children, the meleer with its dig, the mager with its resurrection, Jad with his healers |
| `waveMonsters.js` | 281 | creating a wave's monsters by species (`waveMonsterFactories`), removing dead ones, the blob's split |
| `zuk.js` | 296 | `zukNpcDefinition` and the shield (`zukShieldNpcDefinition`, its patrol) |
| `zukSetClock.js` | 117 | `ZukSetClock`: when the ranger and mager sets spawn |
| `zukHealers.js` | 296 | `zukHealerNpcDefinition` and `ZukSparks`, their area attacks |
| `zukFight.js` | 601 | `ZukFight`, the controller that is created for wave 69 |
| `InfernoEncounter.js` | 1,142 | the encounter class |

- The order of the hooks within a tick is written at the top of
  `InfernoEncounter.js`. Every monster's turn goes to its own definition; the
  constructor registers them through `registerWaveMonsters`,
  `registerWaveNpcs` and `registerZukNpcs`. `InfernoEncounter.js` also
  imports Zod from `vendor.js`, for the schema of its seeds.
- A monster's actor is made in `waveMonsters.js`, one function per species
  (`createNibblerActor` ... `createMeleerActor`, chosen by
  `createWaveMonsterActor`). `createInfernoActor` takes hitpoints and combat
  stats from the monster table by NPC type id; a monster's module may set
  its max hit, and the pillars have hitpoints and stats of their own in
  `pillars.js`.
- The event types say "zuk" for every monster (`zuk_attack`, `zuk_hit`,
  `zuk_death`, `zuk_jad_cue`), and the functions that emit them are named
  after the types (`emitZukAttack`, ...). The types are data the scenes
  read.
- Waves: `configureRunStart` reads the setup from the mechanics
  (`getInfernoSetup`); `processPostTick` starts a wave
  (`InfernoEncounter.beginWave`: layout `buildInfernoWaveSpawns`, spawns
  `spawnCombatant`) and detects its end (`completeWaveIfCleared`). Decisions
  come from labelled, seeded streams.
- Pillars: a standing pillar is an untargetable NPC that nibblers damage;
  `InfernoEncounter.collapsePillar` collapses it and changes the arena.
- Zuk: `ZukFight` is created for wave 69 and owns Zuk, the shield, the set
  clock, Jad below 480 hitpoints and the healers below 240
  (`zukJadHpThreshold`, `zukHealersHpThreshold` in `zuk.js`). The phases of
  the set clock and its numbers are explained at the top of
  `zukSetClock.js`. The boss hitpoint presets go through `syncBossHp` and
  `enterBossHpPhase`.

**Zebak** – `client/toa/zebak/`: `native.js` (the encounter class and the
presentation), `phases.js` (Great Roar, Tidal Waves, enrage, blood clouds,
acid), `rules.js`, `timing.js`, `special-layouts.js`. It reaches the shared
rules only through what `rendering.js` passes to `zebakDefinition`: `stats`,
`seedRandom`, `walkable`, `makeCollision`, `solidFlag`, `rollAttack`,
`showAttack`, `projectile`, `animate`, `startNpcDeath`.

## From a route to a running fight

1. `application.js` splits the path (`xke`) and maps the slug to a kind with
   `Gfe`, a table built from the engine's `encounterDefinitions`
   (`/yama` → `yama_p3`; a retired slug such as `/zuk` maps to its
   successor with mechanics, through `resolveKindOrRetiredEntry` of
   `client/encounters/registry.js`). The hook `Ake` keeps the URL and
   the scene state in step.
2. `enterEncounter(kind)` (`ii` in the encounter manager hook) builds the
   engine with `createSimulationEngine({ encounterConfig: { kind, mechanics,
   options }, stats, inventory, equipment, combatSupplies, ... })`, which asks
   the registry for the encounter (`encounterRegistry.create(kind, options)`:
   the factory of the kind's definition runs), constructs
   `SimulationEngine` and applies the loadout. None of this needs a chunk:
   `client/engine/createSimulationEngine.js` and what it imports are modules.
   The scene state becomes
   `loading`, then `encounter` once the scene is ready.
3. The same hook asks the cache for the arena
   (`cacheManager.ld({ mapX, mapY, seedX, seedY, ... })`: flood fill from the
   seed tile over the map's collision), registers it for the kind (`oe`) and
   tells the engine to adopt it (`engine.reapplyArenaConfig()`).
4. `Grid.js` builds the scene: `de.create(kind, { cacheManager,
   eventAudioPlayer, frameSoundTracker, encounterRenderConfig })` calls the
   presentation's `sceneBuilder`. It throws for a kind that has no
   presentation ("No scene builder registered for encounter kind").
5. The simulation hook (`mse` in `Grid.js`) owns the engine. When it gets a
   new engine it applies the loadout, applies the pre-pot (`applyPrepot`) and starts a
   recording (`engine.getEngineRunConfig()`). Every 600 ms it calls `engine.advanceTick(clickedTile)`,
   then `getState()` and `getLastTickEvents()`, records the frame, publishes the state to
   React (which feeds the scene) and the events to subscribers (audio,
   overlays).
6. Restart: `engine.reset(startTile, { encounter: { kind, seeds } }?,
   runMechanics)`, then the loadout again.

A new encounter needs: a directory under `client/encounters/` whose
`encounter.js` exports its `definition` and whose `presentation.js` exports
its `presentation`. The registry and `presentations.js` find both; neither
is a chunk, and neither is edited. The
route's title and description come from the descriptor when `application.js`
has no search-engine entry for the kind (`Qfe`; `buildDescriptorSeoEntry`
is the fallback, and it marks the page `noindex`). Default loadouts (`_le`
in `application.js`) are optional: a kind without them starts with nothing
worn. `docs/ADDING-AN-ENCOUNTER.md` is the guide, with what still needs a
chunk; `test/fixtures/training-ground/` is an encounter added that way,
which only the tests register.

## The import cycle

There was one between `rendering.js` and the encounter modules. It is gone
since the logger and the last two things of the scenes and menus moved out
of `rendering.js`. The section stays, because the rule that kept the cycle
working is the rule that keeps it away.

The graph has one direction now:

- No module of `client/engine/`, `client/encounters/`, `client/data/` and
  `client/util/` imports `rendering.js` or another chunk. The last one that
  did was `createSimulationEngine.js`, for `encounterRegistry`; the registry
  is `client/encounters/registry.js` now. `replay.js` imports
  `createSimulationEngine.js`, and nothing else in those directories imports
  either of the two.
- `rendering.js` imports the encounter modules (for its scenes), the
  registry (to pass it on), the twenty rule modules of `client/engine/`,
  `client/encounters/shared/`, the data modules, the utilities, and the
  modules of `client/toa/`, `client/lobby/` and `client/dt2/`. None of them
  imports `rendering.js`, `createSimulationEngine.js` or `replay.js`, so
  nothing `rendering.js` imports leads back to it.
- Whoever imports an encounter module, a rule module, a data module or a
  utility gets it evaluated in full first. An encounter module can call
  `defineNpc({ ... })` or read `CollisionFlag`, `Prayer` or `spotAnimIds`
  while it is loaded, and `yama/encounter.js` reads `yamaContractVariants`
  and calls `buildYamaControls()` while it builds Yama's definition.

The check is `node tools/check-import-graph.mjs`. It lists every import of
a chunk by one of the 115 modules (none) and
every cycle among them (one: `inferno/waves.js` and
`inferno/spawnLayout.js`, which use each other inside functions only), and
fails on any other.

To keep it so:

- Do not import `rendering.js`, `Grid.js` or `application.js` from a module
  of the engine, the data, the utilities or an encounter. If a module needs
  something that is still in the chunk, move that thing out first
  (`tools/split-chunk.mjs --extract` refuses a module whose module-level
  code would read the chunk, and prints what a move would drag along).
- There is no exception left. `encounterRegistry` was one until the
  definitions it is filled from turned out to need nothing of the scenes:
  the factories, descriptors and controls are in the encounter modules, and
  what draws an encounter is a second list, the presentations. That list
  stays in the chunk, with the scene classes it reads; the presentations
  that are written in modules reach it the other way round, as functions
  the chunk calls (`client/encounters/presentations.js`), so no module has
  to import the chunk for them either.
- A module that did import `rendering.js` back would be in a cycle again,
  and then the old condition holds for it: its module-level code (what runs
  when the module is loaded, outside any function) must not read a variable
  of `rendering.js`, which would still be `undefined`; everything inside
  functions runs later and may. The test is the harness run with that
  module loaded first (`LOAD_FIRST=client/engine/<module>.js node --import
  ./tools/determinism/load-first.mjs tools/determinism/harness.mjs`).
  `tools/repoint-imports.mjs` refuses to point an import at a module whose
  module-level code reads `rendering.js`.

How the cycle was taken apart, in the order it happened: the encounters
moved out with their own tables (Sol Heredit's NPC, animation and colour
tables went into `sol-heredit/constants.js`, which imports nothing; the
Inferno's NPC ids and pillar table the same way); then the rules they share
with the engine, which no longer needed the chunk once `CollisionFlag` and
the arena had modules of their own; then the data tables, which freed the
three rule modules that had taken lookups from the chunk inside functions
(`combatFormulas.js`, `equipmentStats.js`, `monsterStats.js`) and Yama's
`voidFlareImpactSpotAnimId`, which reads the spot animation ids when it is
defined; and last the logger (whose class had to lose the chunk's
define-field helper first, because the logger is made when its module
loads), the colour packing, `getInfernoSpawnCommandType` and `lobbyNpcs`.

## Plan for the split

Target layout:

```
client/engine/             the engine, and the rules it shares with the
                           encounters (done)
client/data/               the data tables the engine reads, with their
                           lookups (done)
client/util/               the logger and the colour packing: neither a
                           rule nor data, used by every layer (done)
client/encounters/shared/  what several encounters use and the engine does
                           not: the NPC definition framework, NPC attack
                           rolls, pursuit and the route search (done)
client/encounters/registry.js    the encounter definitions and the registry
                           the engine asks for an encounter (done)
client/encounters/lobby/   done
client/encounters/yama/    done
client/encounters/sol-heredit/   done
client/encounters/inferno/ done
client/toa/zebak/          as today
```

Done: the engine chunk cleaned in place (string tables, define-field helper,
local names, member names) and split; the lobby, Yama, Sol Heredit and the
Inferno moved out of `rendering.js` and cleaned the same way; then what they
share with each other and with the engine, and what Yama and the Inferno
share with their own scenes; then every name the engine imports from
`rendering.js` was named there (no one-letter import alias is left in
`client/engine/`), and the player's rules the engine shares with the
interface moved (prayers, mechanics defaults, retaliation, damage, equipment
bonuses, monster stats), and after them the player's starting state, the
replay limits and the log event types, which had a seam and no table; and
last the data tables themselves (item variants, spot animation ids,
monsters, combat spells, equipment, weapon categories, special attacks) with
the rules over them (ammunition, weapons); and at the end the logger and
the colour packing (`client/util/`), with the last two things an encounter
module took from the chunk; and then the encounter registry with the
definitions it is filled from (`client/encounters/registry.js`), which was
the last thing the engine imported from `rendering.js`. No module of the
engine and no encounter module imports `rendering.js`.
`simulationEngineFactory.js` and `rendering.js` keep
exporting what other files import until those importers are updated. Each
commit either moves code or changes it, and the determinism digests must not
change.

How an encounter is moved: `tools/plans/<kind>-extract.json` lists, per new
module, the top-level names that go there; `node tools/split-chunk.mjs
client/assets/rendering.js <plan> --extract` moves those statements, makes
`rendering.js` import them back and export what the modules use, and
`--extract --verify <commit>` proves that nothing but import and export lines
changed. Then the same tools as for the engine, applied to the directory:
`replace-define-field.mjs` (and `replace-static-defines.mjs` for a class with
static values), `rename-bindings.mjs` (with `--locals` for parameters and
locals) and `rename-members.mjs`, each with a names file in `tools/names/`.
Last, `tools/repoint-imports.mjs` makes the other modules import the moved
code from its module instead of through `rendering.js`.

### What the bundler wrapped

The moves and the renames left every statement as the bundler made it.
Three of its shapes stood in the way of reading the code:

- a function called at once where a named function belongs:
  `x = (function (a, b) { ... })(p, q)`, an inlined helper;
- a comma sequence with temporaries, `((a = p), (b = q), f(a, b))`, and
  `var a; var b;` after the `return` that uses them: an inlined helper whose
  parameters became temporaries;
- a side effect in the last operand of a boolean chain:
  `return ok && !(tick < due) && (despawn(), true);`.

In `client/encounters/yama/`, `sol-heredit/` and `inferno/` they are gone:
79 functions named, one wrapper removed, 25 places rewritten by hand. What
is left there is five functions called at once that only throw, each the
`default:` of a switch that no determinism scenario can reach.

In the engine they are gone wherever a determinism scenario runs the lines:
125 functions named in `client/engine/` (74), `client/engine/playerAttack/`
(42), `client/encounters/shared/` (7) and `client/data/` (2), and 52 exact
text replacements by hand. Three compiled enums (`Prayer`, `LogEventType`,
`LogLevel`), each an object filled by a function called at once, are object
literals. The lobby's `getArenaConfig`, whose whole body was one function
called at once, lost that wrapper. No comma sequence and no `var` without a
value is left in the modules. What is left of the first shape, each for its
reason:

- Seven functions called at once on lines no scenario runs, because no
  fight in the client can reach them. `consumables.js` (the venom value
  turned into a poison value) runs only for a player whose
  `poisonState.poisonVarp` is 1,000,000 or more, and nothing in the client
  puts it there: the three things that poison the player (Yama's melee,
  Sol Heredit's bees, Zebak's acid) hand the engine severities of 100, 5
  and 2. Venom on the player has readers (the engine's pulse, the
  antipoison, the interface's orb) and no writer. The six of
  `playerAttack/` (`planPlayerAttack.js`, the roll of a plan with a shared
  accuracy; `projection.js`, two; `roll.js`, three) belong to kinds of
  attack plan that are read and never built. A scenario for either would
  pin code no player can run.
- `spells.js`: an arrow function called at once that builds
  `COMBINATION_RUNES_BY_RUNE` when the module loads. It is an initializer as
  one writes it by hand; no named function belongs there.
- Five in the three encounters that only throw (above).

A line no scenario runs is not restructured: the harness is what sees a
wrong rewrite. Four scenarios were written first, each in its own commit,
so that such lines run: `engine/ground-item-pickup`,
`yama/elysian-spirit-shield`, `engine/special-attack-wrong-target` and
`engine/area-attack-several-targets`. The last one made the engine's last
comma sequence run, in `collectAreaTargetsAround` of
`playerAttack/launch.js`, where an area attack collects the monsters within
a tile of its target. One part of that line still runs in no scenario, the
`break` for an attack that finds as many targets as it may hit (nine for a
barrage; no wave has more than six nibblers). For that part the function's
text before and after the rewrite was run side by side on generated
inputs: a script's output where the harness cannot look.

`tools/name-called-functions.mjs` does the first shape. The call stays where
it was with the same arguments, and `function name(a, b) { ... }` is declared
at module level, so nothing is evaluated earlier or later than before. It
refuses a function that uses `this` or `arguments` of its own (those of a
method or of an ordinary function nested in it are that one's) or closes
over a local, and after the rewrite it puts every declaration back where it
is called and requires the syntax tree it started from. `--census` lists the sites;
`--unwrap` removes a wrapper that only repeats the parameters of the
function around it, when the call is the only statement of that function
(a wrapper that stands in a branch of an `if` or a `switch` is named
instead). The names are in `tools/names/*-called-functions.json`, each with
its evidence; the few functions named by hand are in
`readability-hand-names.json` and `engine-hand-names.json`.

The other two shapes are rewritten by hand, by exact text replacement, and
only where a determinism scenario runs the lines. What kept the rewrites
from changing behaviour:

- A temporary becomes a `const` where it was first assigned only if nothing
  reads it before. Otherwise the sequence becomes a function again, called
  where the sequence stood with what the temporaries were assigned, in the
  same order.
- A boolean chain becomes early returns without flipping a comparison:
  `!(a < b)` is not `a >= b` when one side is `NaN` or `undefined`. The
  negated terms are joined with `||` under one negation. For the same reason
  the remaining `!(tick < x)` stay as they are.
- Every path returns what it returned: `false`, not `undefined`.

What a name may be changed to is limited by the determinism digests. They
cover the whole encounter object: every field of the encounter class and of
its runtime objects, the state of each actor, the snapshot and the events.
Those keys are data, as the keys of a table are; where one misleads it has a
comment beside it. A function, a method, a parameter, a local, and a key of
an object that lives for one call can be renamed.

### What is left in rendering.js for the engine

Nothing. The last name was `encounterRegistry`, which
`createSimulationEngine.js` asks for the encounter of a kind. It was held
back by one table of the chunk that the definitions read, the placements of
Sol Heredit's arena boundary (now `sol-heredit/boundaryLocs.js`), and by the
chunk's define-field helper in the registry's class. The presentations
(scene builders, render configs, menu art) are a separate list and stay:
moving them would move the scene classes, and those reach half of the
chunk (the scene compositor alone 473 statements and 32,000 lines, the
renderer among them). The chunk takes the presentations written in modules
from `client/encounters/presentations.js` instead of naming them.

So an engine can be built from a kind without a chunk:
`createSimulationEngine({ encounterConfig: { kind, mechanics }, ... })` of
`client/engine/createSimulationEngine.js`, or `new SimulationEngine({
encounter, ... })` with an encounter object of one's own. In Node that needs
the harness's module hooks and a global `self` (for `vendor.js`).
Engines built from five kinds the first way and run for 60 ticks load 128
client modules (the registry lists every encounter, so all of them are
loaded) and no chunk but `vendor.js`; a fight of Yama built the second way
loads 71.

Everything else is out too: the rules the engine shares with the encounters and
the interface, the data tables (see "Data tables"), the logger and the
colour packing (see "Utilities"). The encounter modules take nothing from
`rendering.js` either. What `rendering.js` still holds of tables belongs to
the scenes: the animations of each weapon, the projectile of each kind of
ammunition, spell and projectile visuals.
