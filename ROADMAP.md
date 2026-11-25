# Roadmap: from scraped bundles to a contributable project

State on 2026-11-21. Sizes: S = hours, M = days, L = weeks.

## Where we are

- This repository (`E:\Projects\OpenScim`) is the working tree. The scrape and
  deobfuscation workspace stays in `E:\Projects\Scim` as a read-only reference
  and backup; nothing there is edited or deleted.
- `client/` is the single source of truth and the web root. It is the beta
  client as served on 2026-11-20, deobfuscated by script, then edited by
  hand: 10 JS chunks (8.8 MB), 4 CSS. There is no original source, no build,
  no backend.
- The deobfuscation generators were deliberately left behind in `Scim`, so
  nothing here can regenerate over the hand edits (the Zebak registration
  lives in 5 of the chunks).
- Code written for this project: `client/toa/zebak/*.js` (13 modules) and the
  25 scripts in `test/`.
- `tools/serve.py` serves `client/` and downloads missing sprites and sounds
  from `https://beta.scim.gg` on demand.

## Phase 0 — Legal and provenance (S)

- [x] `LICENSE-MIT`, `LICENSE-APACHE`, `.gitignore`, `git init`.
- [ ] Decide what replaces the Jagex assets (Phase 3). Until then no public
      push that includes them. `.gitignore` already excludes them.
- [ ] Per-pack check of `client/assets/ui/packs/*` (browntown, duckscape,
      toblite, vanilla): which are community-made, by whom, under what terms.

## Phase 1 — One source of truth (S–M)

- [x] New working tree with one copy of the client (`client/`), tests in
      `test/`, tools in `tools/`, docs in `docs/`.
- [x] Generators, duplicate trees and debug scripts left out.
- [x] `package.json` with `serve` and `test` scripts.
- [x] First commit.
- [x] Standalone Zebak prototype page removed, with three.js and the data
      files only it used.

## Phase 2 — Build and run (M)

- [x] Vite: `npm run dev`, `npm run build`, `npm run preview`.
- [x] Build hashes stripped from chunk names.
- [x] Copied library code replaced by npm packages: React 19.2.4, JSZip
      3.10.1, pako, gl-matrix, PicoGL.js 0.17.9, Zod 4.4.3, driver.js. `client/assets/vendor.js` is now a short file that
      re-exports them under readable names.
- [x] Python dev server removed.
- [x] Host allowlist and old-browser fallbacks removed
      (`hostGuard.js` is now `deployment.js`).
- [ ] driver.js is the one library whose original version is unknown; the
      current 1.x is installed. Check the onboarding tour by hand.
- [ ] Rename chunks to roles (`player` is the cache loader, `Grid` the UI
      framework) and drop `rolldown-runtime.js` plus the leftover preload
      helper in `rendering.js`.
- [x] The site is branded OpenScim.dev (titles, canonical and Open Graph
      URLs, manifest, privacy and terms pages, Discord invite).
- [ ] `bzip2-module.js` / `bzip2.wasm` are a build of `@foxglove/wasm-bz2`;
      depend on the npm package instead of the copied files.
- [ ] Move runtime media to a Vite `public/` directory (the build currently
      copies it with an extension filter).

## Phase 3 — Assets (M)

- [x] Nothing in the project requests beta.scim.gg any more.
- [x] `npm run assets` (`tools/fetch-assets.mjs`): downloads OpenRS2 cache
      2762, builds the trimmed `client/osrs-cache/disk.zip` from the group
      lists in `tools/assets/cache-groups.json` and
      `tools/assets/cache-groups/` (one file per encounter added since), and
      fetches every media file
      that has a proven source, checking each against
      `tools/assets/manifest.json` (SHA-256, or a hash of the pixels for
      images the fetcher encodes itself). 2057 of 2119 files are covered.
- [x] Item icons that are not local load from RuneLite's public icon host.
- [x] Sound effects are synthesized in the browser from cache index 4
      (`client/audio/soundEffects.js`, a port of the game client's
      synthesizer). The 392 `.ogg` files are gone. The trimmed cache carries
      399 effects, which adds 176 KB to `disk.zip`. An effect that is not
      listed under `"4"` in one of those lists is silent: add its id
      (`node tools/cache-objects.mjs deps --add --to <name> sound:<id>`) and
      rebuild with `npm run assets -- --force`. All of index 4 would add
      about 20 MB.
- [x] 144 interface images are decoded from cache sprites (index 8) by the
      fetcher. `tools/assets/match-sprites.mjs` finds such matches; only
      pixel-equal ones count.
- [x] Stand-ins for the 62 below (`tools/assets/standins.mjs`, the
      `standIn` recipe of each manifest entry): written where a file is
      absent, marked with a PNG text chunk so the fetcher tells them from
      originals. Hitsplats, overheads, staff icons and the click markers
      are the cache sprites, the health bars RuneLite's default bars
      (darkened behind), the soulreaper axe orb the item's icon; the
      encounter pictures, mobile and reset buttons are empty pictures and
      the site images a plain colour. The click markers are PNG (an
      animated PNG for the cursor) under their `.webp` names.
- [ ] 62 images have no source and exist only in working copies and backups:
      - 16 are cache sprites that were altered. Overhead prayers magic, melee
        and missiles are sprites 440/2, 440/0 and 440/1 with colours off by
        up to 7 per channel. Hitsplats damage, poison, heal, burn and block
        are 1359, 1360, 1629, 4767 and 1358 recoloured. `staff_spell.png` is
        780 recoloured and `staff_spell_defensive.png` puts a shield next to
        it. `hitsplat-doom-skull.png` and `minimap_orb_soulreaper_axe_icon.png`
        match nothing. The four click animations are sprite 299 frame for
        frame, but WebP, which the fetcher cannot write; PNG sheets would
        make them reproducible. Using the exact sprites for the others
        changes their look slightly.
      - 10 health bars (`dark_back_*`, `yellow_front_*`): recolours of the
        RuneLite 2010-style bars the `default_*` files come from.
      - 12 encounter pictures: Sol Heredit, Yama and TzKal-Zuk (full and
        head), five purifying sigil pieces, and the Inferno arena map.
      - 18 interface images the original site drew for itself: nine mobile
        buttons in `pack-vanilla/mobile/`, the reset-kill-count button in two
        states for each of four packs, and one toblite panel edge.
      - 6 site images: `favicon.png`, `og-image.png` and four `icons/*`.
        They are the original site's branding and need replacing anyway.

## Phase 4 — Tests and CI (M)

- [x] `npm test` starts its own server (port 8791, production React).
- [x] Tests for the engine without a browser: `tools/determinism/` runs
      the engine in Node with the real cache, 114 scripted fights (engine,
      Yama, Inferno, Sol Heredit, Zebak, the Colosseum, Vardorvis, the Doom
      of Mokhaiotl, and two of the fixture encounter of `test/fixtures/`)
      and 25 scenarios that call code no
      fight reaches (the shared rules' refusals and error paths, the menus'
      setup helpers, the player's rules and starting state, the replay
      limits, the lookups over the data tables, the prayer projection,
      movement without an arena, the logger, the encounter registry), and
      `test/test-determinism.mjs` compares a digest of the whole engine
      after every tick, or of what the calls answered, with the recorded
      ones. The scenarios run 85 % or more of the bytes of every engine
      module except `playerAttack/roll.js` (70 %) and
      `playerAttack/projection.js` (77 %). The rest there cannot be reached
      by a fight today: six damage, gate and accuracy kinds have a consumer
      and no producer in any client file, and the keris critical needs a
      kalphite or scabarite target, which no encounter has. Write a fight
      for it when one does. The harness proves that a change does not
      alter behaviour; it does not assert what the behaviour should be.
- [ ] Engine tests that assert game rules (max hits, prayer drain, timers)
      on top of that harness. Such a test no longer needs a chunk:
      `client/engine/SimulationEngine.js` and every encounter module load
      in Node without `rendering` (they need `vendor.js`, and a global
      `self` for one of its libraries). An engine built from
      `new SimulationEngine({ encounter: new YamaEncounter(...) })` ran a
      fight that way with 71 modules loaded.
- [ ] A smoke test: home page and each encounter load with zero console
      errors (`browser-equivalence.mjs` in the Scim workspace does most of this).
- [x] GitHub Actions (`.github/workflows/ci.yml`): no game data is tracked,
      install, import graph, test markers, build.
- [ ] The determinism harness and `npm test` in GitHub Actions. Both need
      the game assets, which must not reach GitHub (`ci.yml` says why), and
      `npm test` a browser as well. Until then they are run locally.
- [ ] Prettier is already a dependency; add a format check. ESLint later.

## Phase 5 — Backend (L)

Decision (2026-11-21): the backend is rebuilt from scratch. Routes the client
expects: `/api/auth/login`, `/api/replays` (read, write, mine),
`/api/osrs-stats`.

- [ ] Write down the API contract from the client code (request and response
      shapes are in the Zod schemas of the application chunk).
- [ ] Choose stack and hosting.
- [ ] Hiscores lookup, replays, accounts.
- [ ] Error reporting: production loads a Sentry chunk; make sure no DSN
      pointing at the original author's account survives.

## Phase 6 — Readability (L, ongoing)

This is the bulk of the real work and never fully ends.

Progress (2026-11-22):

- [x] `tools/rename-bindings.mjs`: scope-aware renaming of a chunk's
      top-level bindings; rewrites sibling chunks' imports; refuses any
      rename that collides or changes what the file refers to.
- [x] Chunks export under real names (no one-letter export aliases), and
      import locals take the exported name where it is free.
- [x] All top-level bindings named in `fullscreen`, `packThemes`, `player`
      (cache loader) and `simulationEngineFactory` (332 names; 3 are
      low-confidence guesses: `weapon31113SpecialProfile` and two others).
- [x] `docs/ARCHITECTURE.md`: the files, the engine and encounter
      interface, the route chain, and the plan for the split.
- [x] `simulationEngineFactory` cleaned in place, the determinism digests
      unchanged after every step: the obfuscator's string tables inlined,
      the define-field helper replaced by class fields, all 2,290
      parameters and locals named, all 203 minified methods of
      `CombatSystem`, `SimulationEngine`, `WorldState`, `TickEventBuffer`
      and `ReplayTakeoverWorkTracker` named in every file that calls them.
      `tools/names/` records each rename with its evidence or "inferred".
- [x] The engine split into 23 modules under `client/engine/`
      (`tools/split-chunk.mjs`, plan in `tools/plans/engine-split.json`):
      statements moved unchanged, no import cycle among the modules.
      `simulationEngineFactory` re-exports them.
- [x] The four original encounters moved out of `rendering` into
      `client/encounters/`: `lobby/` (1 module), `yama/` (9), `sol-heredit/`
      (14), `inferno/` (19), 12,136 lines together, with
      `tools/split-chunk.mjs --extract` (plans in `tools/plans/`), and
      cleaned the same way as the engine, the determinism digests unchanged
      after every step: 102 define-field calls replaced, 1,877 parameters
      and locals named, 480 top-level bindings named (107 of them in
      `rendering`, which the modules import), 88 methods named.
      `docs/ARCHITECTURE.md` has the module tables and the rule the import
      cycle between `rendering` and an encounter module follows.
- [x] What the encounters share moved out of `rendering` too
      (`tools/plans/shared-extract.json`, 15 modules, 2,560 lines): nine
      modules of rules the engine uses as well went to `client/engine/`
      (the current arena, `CollisionFlag`, attack range and line of sight,
      NPC state and the death record, decisions, occupancy, the combat
      formulas, projectiles), five to `client/encounters/shared/` (the NPC
      definition framework, NPC attack rolls, the default pursuit, the route
      search). Then what Yama and the Inferno share only with their scenes
      and menus (`tools/plans/leftovers-extract.json`, 7 modules, 700
      lines). Cleaned like the rest: 798 parameters and locals named, 92
      top-level bindings, 2 methods, 56 define-field calls replaced (43 of
      them `CollisionFlag`'s static values, `tools/replace-static-defines.mjs`).
      `tools/repoint-imports.mjs` then made the engine and the encounters
      import these modules directly: they no longer reach shared code
      through `rendering`. Eleven scenarios were added to the harness first,
      for the branches of this code that no fight runs.
- [ ] The encounters' scenes (renderer) stay in `rendering`, which still has
      1,113 define-field calls and 837 short
      method definitions. The scene classes a contributor meets have names
      (`SceneCompositor`, `InfernoScene`, `NpcInstanceManager`), and so
      have the eleven members a scene written in a module calls or
      overrides; 89 methods of the compositor and 11 of the Inferno's
      scene still have the bundle's letters.
- [x] Everything the engine imports from `rendering` has a name there
      (`tools/names/engine-imports-bindings.json`: 57 functions and tables,
      48 with evidence, 9 inferred), and the 88 one-letter import aliases of
      `client/engine/` are gone.
- [x] The player's rules the engine shares with the interface moved out of
      `rendering` (`tools/plans/engine-rules-extract.json`, 6 modules, 750
      lines, all in `client/engine/`): `Prayer` and the prayer tables, the
      mechanics defaults, an NPC's retaliation, the damage roll and the
      protection prayer's reduction, the equipment bonuses and the carried
      weight, the monster stat lookups. Cleaned like the rest (93 parameters
      and locals, 18 top-level bindings) and imported directly by the
      engine and the encounters. One scenario was added to the harness
      first, and fourteen afterwards for the engine modules the fights ran
      least. `client/engine/` was 38 modules then.
- [x] The player's starting state, the replay limits and the log event
      types moved out of `rendering` too (`tools/plans/player-state-extract.json`
      and `replay-limits-extract.json`, 3 modules, 290 lines, all in
      `client/engine/`, none of them importing anything): the spellbook and
      stat names, `createDefaultStats`, `cloneStats`, `resetStatsToMax`,
      `createCombatTimers` and the other records a run starts with;
      `ReplaySafetyError` with the limits and tests a replay is held to;
      `LogEventType`. Cleaned like the rest (24 parameters and locals, 17
      top-level bindings) and imported directly by the engine and the
      encounters. Two scenarios were added to the harness first.
      `client/engine/` was 41 modules then.
- [x] The data tables the engine reads moved out of `rendering`
      (`tools/plans/data-tables-extract.json`, 10 modules, 175,700 lines;
      `rendering` went from 240,242 to 64,580 lines). Seven tables with the
      lookups that answer from them are in a new directory, `client/data/`:
      item variants, spot animation ids, the monster table (138,911 lines),
      combat spells, equipment (33,650 lines), weapon categories, special
      attack definitions. They are JavaScript modules, not JSON: the move
      of a statement can be proved character for character, and several of
      them are parsed with Zod or share entries by reference. The rules
      over the small tables went to `client/engine/` (`ammunition.js`,
      `weapons.js`; 43 modules now), and Yama's last constant in the chunk
      to `client/encounters/yama/`. Cleaned like the rest (108 parameters
      and locals, 52 top-level bindings; no entry or key of a table
      changed) and imported directly by the engine and the encounters. One
      scenario was added to the harness first. `docs/ARCHITECTURE.md`
      ("Data tables") has the modules and the rule for the directory.
- [x] The logger and the renderer's colour packing moved out of
      `rendering` into a new directory, `client/util/`
      (`tools/plans/last-imports-extract.json`, 4 modules, 290 lines): what
      every layer uses and is neither a rule of the game nor game data, in
      modules that import nothing. The logger's class lost the chunk's
      define-field helper first (`tools/replace-define-field.mjs --lines`),
      because the logger is made when its module loads. With them went the
      last two things an encounter module took from the chunk
      (`getInfernoSpawnCommandType`, `lobbyNpcs`). Cleaned like the rest
      (39 parameters and locals, 6 top-level bindings, 9 methods). One
      scenario was added to the harness first.
- [x] The import cycle between `rendering` and the modules is gone. One
      module of `client/engine/`, `client/data/`, `client/util/` and
      `client/encounters/` still imported the chunk then:
      `createSimulationEngine.js`, for the encounter registry (it does
      not any more: see "The encounter registry is a module" below).
      `docs/ARCHITECTURE.md` ("The import cycle") says how to keep it so.
- [x] Closing audit of the refactor's goal (2026-11-22). In the 111
      modules and `simulationEngineFactory`: no string table, no
      define-field call, no declared name of one or two characters except
      `x`, `y`, `dx`, `dy` and `i`; the short property names left are
      words or data keys (`id`, `hp`, `op`, `to`, `ok`, `xp`, `at`,
      `tp`). The audit found one two-letter method still called from the
      engine, the item type's `Xh` in the cache loader, now
      `isWearable`. 65 of the 66 digests recorded before any change are
      identical today; the 66th was re-recorded once, for new entries of
      `encounterDefinitions`. 6,347 renames are recorded in
      `tools/names/`, 4,171 with evidence and 2,176 inferred.
- [x] From that audit: what the bundler wrapped is unwrapped in the three
      encounter directories (2026-11-22). A reader who was kept away from
      the chunks had named, for Yama, 20 function bodies still wrapped in
      a function called at once, 4 comma sequences with `var` after use,
      12 misleading names and 9 numbers without a name. In
      `client/encounters/yama/`, `sol-heredit/` and `inferno/`: 79 such
      functions have a name (`tools/name-called-functions.mjs`, which
      leaves the call and its arguments where they were and proves the
      result by putting every declaration back); one wrapper that only
      repeated its function's parameters is gone; 25 comma sequences,
      side effects inside conditions and temporaries were rewritten by
      hand, each read against the order of evaluation, by a second
      reader too; 11 names changed in Yama (`fireballWaves.js` is
      `fireballBursts.js`); 9 numbers have names; each encounter class
      says the order of its hooks within a tick. No determinism digest
      changed. `docs/ARCHITECTURE.md` ("What the bundler wrapped") has
      the rules that kept the hand rewrites from changing behaviour.
      Fresh readers afterwards: "mostly" for each of the three, with
      about half the obstacles (Yama 52 to 28, Sol Heredit 97 to 29, the
      Inferno 117 to 56). What they still list is not the bundler's:
      names the determinism digests cover (they have a comment instead),
      dead code, numbers of the game without a stated reason, menu texts
      that disagree with the rules, and what lives outside a directory
      (the engine's order of hooks, the scenes, the monster table).
- [x] The same for the engine (2026-11-22). In `client/engine/`,
      `client/engine/playerAttack/` and `client/encounters/shared/` (and
      the two lookups of `client/data/`): 125 functions the bundler called
      at once have a name, by `tools/name-called-functions.mjs` (74, 42, 7
      and 2; `SimulationEngine.js` and `playerAttack/plan.js` each alone
      in a commit, because tests patch their served source by exact
      line); 51 comma sequences, side effects inside conditions and
      temporaries declared after their use were rewritten by hand, each
      read against the order of evaluation by a second reader too; three
      compiled enums (`Prayer`, `LogEventType`, `LogLevel`) are object
      literals. A line no determinism scenario runs was not restructured;
      three scenarios were written first so that such lines run (107
      now). No determinism digest changed. In the 111 modules: functions
      called at once 145 to 14, comma sequences 19 to 1, `var` without a
      value 35 to 0. The order of one tick is written above `runTick` and
      an NPC's turn above `runNpcTurn`; 169 bare item ids have the item's
      name beside them, read from the game cache.
      Fresh readers, kept away from the chunks, before and after: "mostly"
      each time, with fewer obstacles: one tick (`SimulationEngine.js`,
      `CombatSystem.js`) 84 to 45, the player's attack 128 to 51, the rule
      modules 174 to 58, NPC and player movement with the replay rebuild
      74 to 33. What they still list is not the bundler's three shapes:
      negated comparisons and `!!`, the `default: return` of exhaustive
      switches, a call with an effect as a condition, names that say less
      than the code (`activePrayer` is the protection prayer), and what
      lives outside the modules (the encounters' hooks, the NPC record,
      the callers in the chunks).
- [x] The tail of those shapes (2026-11-22). The engine's last comma
      sequence, where an area attack collects the monsters within a tile
      of its target, was rewritten after a scenario made the line run
      (`engine/area-attack-several-targets`: the nibblers of an Inferno
      wave stand on one tile). The lobby's `getArenaConfig` lost the
      function that was its whole body, once
      `tools/name-called-functions.mjs` could tell the `this` of a nested
      method from the function's own. In the 113 modules now: functions
      called at once 13, comma sequences 0, `var` without a value 0. The
      thirteen stay, each for its reason (`docs/ARCHITECTURE.md`, "What
      the bundler wrapped"): seven stand on lines no fight in the client
      can reach (venom on the player has readers and no writer; six kinds
      of attack plan are read and never built), five only throw, in the
      `default:` of a switch, and one is the initializer of a table in
      `spells.js`, as one writes it by hand.
- [x] The encounter registry is a module (2026-11-22):
      `client/encounters/registry.js` holds the encounter definitions
      (kind, factory, descriptor, controls), the lookups over them and
      `encounterRegistry`, moved out of `rendering` with
      `tools/split-chunk.mjs --extract` and named (47 parameters and
      locals, 15 top-level bindings, 3 methods). Its class lost the
      chunk's define-field helper in place first, and the one table of the
      chunk the definitions read, the placements of Sol Heredit's arena
      boundary, moved to `sol-heredit/boundaryLocs.js`. A scenario for
      the registry's refusals and the lookups was added to the harness
      first (109 scenarios). With that, no module of `client/engine/`,
      `client/data/`, `client/util/` and `client/encounters/` (113
      modules) imports a chunk, and `tools/check-import-graph.mjs` allows
      none: an engine is built from the kind of an encounter without
      `rendering`. The presentations (what draws an encounter) are a
      second list and stay in the chunk.
      A fresh reader, kept away from the chunks, followed a kind to a
      running fight in the modules: "mostly". Where the kinds are listed,
      what is registered for one and how the engine gets its encounter
      can be read there. What cannot is the interface's side, which is
      23 of the reader's 45 obstacles: who builds and registers the arena
      of a kind, who calls `createSimulationEngine`, who ends the intro
      and calls `advanceTick`.
- [x] An encounter is added without editing a chunk (2026-11-23): files
      of its own and three lines in three modules, its definition
      (`client/encounters/registry.js`), its kind and route slug
      (`client/engine/encounterKinds.js`) and its presentation
      (`client/encounters/presentations.js`, new: the list of the
      presentations written in modules, which `rendering` calls with its
      base scene instead of naming them; `buildScene` of
      `client/encounters/shared/buildScene.js` is the scene builder of an
      encounter that draws nothing of its own).
      `application` takes a route's title and description from the
      descriptor when it has no search-engine entry for the kind, where it
      threw before. The members of the scene classes that a module's
      scene calls or overrides have names, renamed with
      `tools/rename-members.mjs`, which learnt that a member a subclass
      overrides is one member. Proved by adding one: the fixture
      encounter `test/fixtures/training-ground/`, which only the tests
      register, by the same three lines, put into the modules as they are
      loaded. Two determinism scenarios run it (111 scenarios; the 109
      older ones are unchanged with it registered) and a browser test
      loads its route, checks its scene, fights and wins (32 tests). The
      commit that adds it touches no file under `client/`. What still
      needs a chunk is listed in the guide, each with its reason: a click
      on an NPC that is not an attack, a replay of an encounter's debug
      actions, default loadouts, texts for search engines, a lobby NPC, a
      scene that is not built on the Inferno's, an unnamed method of the
      base scene.
- [x] Comments for what the last readers of the engine could not derive
      from a name (2026-11-22): the player's `activePrayer` is the
      protection prayer, `expectedHit` the whole attack's expected
      damage, `attackType` means two things, a `default:` that returns
      what was switched on is not a result, the search toward an NPC is
      the search toward a tile with another goal. Those names are fields
      of records the determinism digests cover, so they stay. The reader
      checked the comments clause by clause; six were corrected.
- [ ] `Grid` and `application` still import the engine through
      `simulationEngineFactory`, and everything else, under one-letter
      aliases.
- [ ] Local variables and parameters are still short in `Grid`,
      `application` and `rendering`.
- [ ] Top-level bindings still short: `Grid` (about 1,300), `application`
      (about 830), `rendering` (about 1,470).
- [x] `test/test-zebak-kill.mjs` no longer fails now and then (it did in 4
      of 13 full runs in one session and about one in six after): its line
      83 expects one special queued after Zebak is set to 390 hitpoints,
      and the player's hit already in flight, unseeded in the browser,
      could take him past the next threshold (55 %), which queued another.
      The test drops the player's pending hits before it sets the
      hitpoints.

- [ ] Split `rendering` (1.6 MB and 64,000 lines now; it was 5.2 MB): the
      data tables the engine reads are data modules in `client/data/`
      and the encounter definitions with the registry are
      `client/encounters/registry.js` (done, above). What remains is the
      renderer, the tables of the scenes (weapon animations, projectiles),
      the encounters' scenes and menus, and the presentations of the four
      original encounters. Moving the scenes means moving the renderer:
      the scene compositor alone reaches 473 top-level statements and
      32,000 lines of the chunk, the list of presentations 661 and 41,000.
- [ ] Split `application` (1.7 MB) and `grid` (1.5 MB) into one file per
      React component.
- [ ] Rename identifiers as files are touched (`vJ`, `wJ`, `SJ(bo)`), rather
      than in one pass. Rule for contributors: leave a file more readable
      than you found it.
- [x] Document the encounter registry (how Sol Heredit, Inferno and Zebak
      plug in) so new encounters do not require reading the bundles
      (2026-11-23): `docs/ADDING-AN-ENCOUNTER.md`, written from the fixture
      encounter. A fresh reader who was kept away from the bundles added
      a second encounter from it (two monsters of another type, one with a
      ranged attack and a projectile, a toggle, a debug action, two
      determinism scenarios that end in a victory) without opening one,
      and its route loaded in a browser with both monsters drawn. The
      reader found one real fault, an import the guide prescribed that
      made an import cycle (`buildScene` has a module of its own since),
      and 25 gaps, which the guide now fills. What it could not test
      without a browser is the scene; what a contributor still has to get
      from outside is the game's ids.
- [ ] The waves of the Fortis Colosseum (`client/encounters/colosseum/`):
      the first encounter added without a chunk.
      Waves 1 to 11 with their six monsters, the reinforcements, Minimus and
      his offer of three modifiers in the game's own interface, all fourteen
      modifiers, and what two RuneLite plugins show. Waves 1 to 4 follow a
      recording of the game; the monsters of
      waves 5 to 11 and most modifiers follow the wiki and a simulator, and
      `docs/COLOSSEUM.md` lists what is inferred and what a recording would
      settle. Open: that recording, the rewards, and a seam for plugins so
      that an encounter's overlays need no bundle and are the
      application's own.
- [ ] TypeScript: only after the split, and starting with the simulation
      engine where types pay off most.

## Phase 7 — Community (S)

- [x] `README.md`: what it is, how to run, build, test.
- [ ] `CONTRIBUTING.md`: the readability rule. Setup and the asset rule are in.
- [x] Tidy `docs/`: the deobfuscation history and the Zebak notes are gone
      (Zebak is complete).
- [ ] Issue templates for "bug" and "mechanic inaccuracy" (with a source link).
- [ ] Publish, deploy a build (GitHub Pages works: the client is static).

## Phase 8 — Content (L, ongoing)

New fights, each added as modules through the two lists
(`docs/ADDING-AN-ENCOUNTER.md`). Where the wiki and the game's cache leave
timing open, record it from the game itself.

- [ ] Desert Treasure II bosses, each with its awakened version. Vardorvis is
      in (`client/encounters/vardorvis/`); his awakened version follows the
      wiki, is inferred where the wiki is silent, and has not been recorded.
      Duke Sucellus is in (`client/encounters/duke-sucellus/`), from the
      wiki, RSPSApp's reading of rsprox recordings and three recordings of
      the normal fight; his awakened version has not been recorded, and its
      orb and bile are not in.
      The Leviathan's post-quest fight is in (`client/encounters/leviathan/`),
      from the wiki and RSPSApp's reading of rsprox recordings and videos;
      its lightning damage, the smoke's 59 or 60, the stun's 25%, the width of
      its weak spot and the rounding of its special's reduction wait for a
      recording, and its awakened version is not written. The Whisperer
      does not exist yet: its kind and its lobby entry are `client/dt2/`
      (`bosses.js`; the engine's table of kinds has it with
      `registered: false`).
- [ ] Doom of Mokhaiotl
      (https://oldschool.runescape.wiki/w/Doom_of_Mokhaiotl/Strategies).
      Delves 1 to 8 can be fought (`client/encounters/doom-of-mokhaiotl/`),
      their timings checked against 20 recorded runs (`delves.js`, OBS), with
      the burrow of delve 5 on, giant larvae and the Plugin Hub's Larva
      Tracker. Open, as its `encounter.js` says: the shield's own hitpoint
      bar, the acid's venom, sounds.
- [ ] Araxxor (https://oldschool.runescape.wiki/w/Araxxor/Strategies) can be
      fought (`client/encounters/araxxor/`), from 20 recorded fights and
      RSPSApp's reading of rsprox recordings. Open, as its `encounter.js`
      says: what the Ruptura's blast does to the player, the cleave through
      Protect from Melee and beside his corner, his ranged attack, his corpse's
      Harvest and Destroy, Vengeance.
- [ ] Nex (https://oldschool.runescape.wiki/w/Nex/Strategies).
- [ ] Tumeken's Warden, Tombs of Amascut
      (https://oldschool.runescape.wiki/w/Tumeken%27s_Warden), next to Zebak
      in `client/toa/`.
- [ ] Multiplayer: more than one player in a fight. The engine assumes one
      player actor (`WorldState.getPlayer()`, the actor id `"player"`), and so
      do the encounters, the replays and the interface; this is a change to
      all of them, and Nex and Tombs of Amascut are where it pays off first.

## Order and risk

Phases 0–2 are sequential and make the project usable by others. 3 and 4 can
run in parallel after that. 5 is a decision more than a task. 6 is where
contributors come in.

Largest risks:

1. 62 images have no source and are untracked (Phase 3). They exist only in
   local working copies and in `OpenScim-assets-backup.zip`, kept next to
   the repository, which also holds the 392 old sound recordings the
   comparison test reads. A fresh clone runs without those images.
2. The sound synthesizer is checked against recordings, not against the
   game client. Where the original site's recordings and the client's
   published code disagree (envelope timing), it follows the code; see the
   header of `test/test-sound-synth.mjs`.
3. Reconstructed code has no author to explain it. Behaviour differences
   against `Scim/beta/` are the only ground truth, so keep the comparison harness.
