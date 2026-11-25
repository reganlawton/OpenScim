# OpenScim

An Old School RuneScape combat simulator. Licensed MIT or Apache 2.0 at your option
(`LICENSE-MIT`, `LICENSE-APACHE`).

Not covered by that licence: the game cache, sprites, models, sounds and fonts
of Old School RuneScape, which belong to Jagex Ltd. They are not in this
repository; `npm run assets` fetches them. This project is not affiliated with
or endorsed by Jagex Ltd. Third-party code: `client/bzip2-module.js` is
@foxglove/wasm-bz2 (MIT License, Copyright (c) Foxglove Technologies), which
wraps bzip2 (Copyright (c) Julian Seward); the npm dependencies carry their
own licences.

The client code was reconstructed from the published beta bundles, so most of
it still has short machine names. See `ROADMAP.md` for the plan.

## Run

Requires Node 22+ and, for the tests, Chrome.

```sh
npm install
npm run assets       # game cache and media from public sources (about 230 MB download, once)
npm run dev          # http://127.0.0.1:5173/
```

Encounters: `/` (menu), `/yama/`, `/inferno/`, `/sol-heredit/`, `/zebak/`, `/sandbox/` (a fight of your own: `docs/SANDBOX.md`).
`/toa/` is the Tombs of Amascut nexus, also reached through the gateway in the lobby.
The lobby's Desert Treasure II gate opens a chooser for its four bosses: Vardorvis (`/vardorvis/`), Duke Sucellus (`/duke-sucellus/`) and the Leviathan (`/leviathan/`, its post-quest fight) have fights, the Whisperer is not built yet ("Coming Soon").
The waves of the Fortis Colosseum are at `/colosseum/`, the Doom of Mokhaiotl at `/doom-of-mokhaiotl/`, Araxxor at `/araxxor/`, the Alchemical Hydra at `/alchemical-hydra/`.

`npm run build` writes a static site to `dist/`; `npm run preview` serves it.

Game media is not in this repository. `npm run assets` downloads the game
cache from OpenRS2, decodes the interface sprites it holds, and fetches the
other images from RuneLite and the RuneLite resource-pack repositories.
Sound effects are not files: the client synthesizes them from the cache
(`client/audio/soundEffects.js`). 62 images have no public source yet; the
command lists them, and `ROADMAP.md`, phase 3, says what they are. Where one
is absent the command writes a stand-in made from what is public (the cache
sprite it was recoloured from, a recoloured RuneLite bar, an item icon, or an
empty picture; `tools/assets/standins.mjs`), so that the client shows no
broken image. An original put back from a backup is never replaced.

After pulling a change to `tools/assets/cache-groups.json` or to a file of
`tools/assets/cache-groups/` (one per encounter), run `npm run assets`: it
rebuilds a trimmed cache that lacks a listed group (`--force` is needed only
to replace a `disk.zip` it did not build). `npm run build` fails on a trimmed
cache that lacks a listed group, since the scenes that need the group would
load to a black screen.

## Test

```sh
npm test                                  # everything, one file at a time (about 7 minutes)
npm test -- test/test-zebak-tide.mjs      # a single script
```

`npm test` starts its own server on port 8791.

`test/test-sound-synth.mjs` compares the sound synthesizer with the 392
recordings the project used to ship. They are not in the repository; set
`SOUND_REFERENCE` to a zip or directory of `<id>.ogg` files (default:
`OpenScim-assets-backup.zip` next to the repository). Without them that
comparison is skipped.

Set `CHROME_PATH` if Chrome is not in `C:/Program Files/Google/Chrome/Application/`.

## Layout

| Path | Contents |
|---|---|
| `client/` | The web root. `assets/*.js` are the application chunks; `assets/vendor.js` re-exports the npm libraries. |
| `client/engine/` | The simulation engine as modules: `SimulationEngine.js`, `CombatSystem.js`, `WorldState.js`, the player's attack (`playerAttack/`), consumables, prayers, spells, movement, replay rebuild; and the rules it shares with the encounters and the interface: the current arena, collision flags, attack range and line of sight, NPC state, the combat formulas, prayers, equipment bonuses, monster stats, the player's starting state, the replay limits, and the rules over the weapon and ammunition tables. `docs/ARCHITECTURE.md` lists the modules. None of them imports a chunk: `createSimulationEngine.js` takes the encounter registry from `client/encounters/registry.js`, so an engine can be built from the kind of an encounter with the modules alone. `assets/simulationEngineFactory.js` only re-exports the engine. |
| `client/data/` | The data tables the engine reads, each a module with the lookups that answer from it: monsters, equipment, weapon categories, item variants, special attack definitions, combat spells, spot animation ids. Seven modules, 175,000 lines, moved out of `assets/rendering.js`. No rule of combat lives here; `docs/ARCHITECTURE.md` ("Data tables") has the rule for the directory. |
| `client/util/` | What every layer uses and is neither a rule of the game nor game data: the logger (`logger.js`) and the cache's colour packing (`packHsl.js`). Two modules that import nothing. |
| `client/encounters/` | The encounters, one directory each: `lobby/`, `yama/`, `sol-heredit/` and `inferno/`, the original ones, moved out of `assets/rendering.js` and cleaned (their scenes are still in the chunk); `colosseum/`, `doom-of-mokhaiotl/`, `vardorvis/` and `leviathan/`, written for this project as modules. Beside them `shared/` for what several of them use (NPC definitions, NPC attack rolls, pursuit, the route search, the default scene builder), and `registry.js`, which finds every encounter by the `encounter.js` of its directory (its kind, the factory of its encounter object, its descriptor, its controls) and holds the registry the engine asks for the encounter of a kind, and `presentations.js`, which finds what draws the encounters that are written in modules the same way. `tombs-of-amascut/` only registers the fights of `client/toa/`. No module here imports a chunk. A new encounter is a directory here, with no list and no chunk to edit: `docs/ADDING-AN-ENCOUNTER.md`. `docs/ARCHITECTURE.md` lists the modules and the rule their imports follow. |
| `client/toa/` | Tombs of Amascut, written for this project: the lobby gateway (`gateway.js`), the nexus room (`nexus.js`), their shader (`shader.js`). |
| `client/toa/zebak/` | Zebak encounter modules (written for this project). |
| `client/lobby/` | What the lobby's gateways share (`gateway.js`) and the list of them (`gateways.js`). |
| `client/dt2/` | Desert Treasure II: the lobby gateway (`gateway.js`), its shader (`shader.js`), the four bosses (`bosses.js`) and their chooser (`chooser.js`). |
| `client/audio/` | Sound-effect synthesizer (written for this project). |
| `test/` | Test scripts: plain Node asserts, most drive a browser against the test server. `test-determinism.mjs` runs the engine in Node and compares a digest of every tick with the files of `determinism-digests/`, one per scripted fight. `fixtures/training-ground/` is a small encounter that only the tests register (`fixtures/register.mjs`): the proof that one can be added without editing a chunk, and the worked example of the guide. |
| `tools/` | Asset fetcher (`fetch-assets.mjs`, `assets/`), test runner, Zebak extraction pipeline. `determinism/` is the engine harness (scripted fights without a browser). The `rename-*`, `inline-string-tables`, `replace-define-field`, `replace-static-defines`, `name-called-functions`, `split-chunk` and `repoint-imports` scripts are the transforms that clean the deobfuscated chunks and move their code into modules; `names/` records every rename with its evidence, `plans/` what moved where. `check-import-graph.mjs` fails when a module of the engine, the data, the utilities or an encounter imports a chunk or joins an import cycle; `check-test-markers.mjs` when a source line a test matches is lost. |
| `docs/` | `ARCHITECTURE.md` (what lives in which file, the engine and encounter interface, how a route becomes a fight), `ADDING-AN-ENCOUNTER.md` (what to write and where to add an encounter, and what still needs a chunk), encounter notes and open accuracy questions. |
| `evidence/` | Test screenshots and downloaded cache groups (not tracked). |

Game media and cache data are not tracked in git (see `.gitignore`).
