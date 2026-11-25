# AGENTS.md

OpenScim is a browser-based Old School RuneScape combat simulator. Read
README.md, then docs/ARCHITECTURE.md. To add a fight, follow
docs/ADDING-AN-ENCOUNTER.md.

## Layout

- client/engine/          the simulation: ticks, combat, players, NPCs
- client/encounters/      one directory per fight; shared/ for common NPC code
- client/toa/, client/dt2/  Tombs of Amascut and Desert Treasure II
- client/assets/          the large bundles: renderer and React UI
                          (rendering.js, Grid.js, application.js, ...)
- tools/determinism/      the harness: scripted fights, digest per tick
- test/                   browser and Node tests (test/test-*.mjs)

## Setup

    npm install
    npm run assets        # game cache and media; not in git (Jagex-owned)

## Verify every change

    node tools/determinism/harness.mjs     # every scenario "ok"
    node tools/check-import-graph.mjs      # exit 0, 0 imports of a chunk
    node tools/check-test-markers.mjs      # 0 lost
    npm test                               # all files pass, about 7 minutes
    npm run build

A scenario of another encounter that turns "DIFFERENT" is a bug you caused,
not a digest to re-record. Record only your own:
`node tools/determinism/harness.mjs --update --only <yourkind>/`.

## Rules

- Never commit game data: cache files, models, sprites, sounds, fonts,
  recordings. .gitignore covers them; do not force-add.
- Avoid editing client/assets/. If a feature needs it, say so and keep the
  edit minimal; docs/ADDING-AN-ENCOUNTER.md section 9 lists what still does.
- Modules under client/encounters/ must not import client/assets/ chunks,
  and must not create import cycles.
- Every game number in code names its source in a comment: WIKI (the OSRS
  wiki), OBS (recorded from the game), CACHE, TABLE (client/data/monsters.js),
  or "inferred". Recorded game behaviour wins over the wiki and simulators.
- A post for the Discord (a boss's post, a log, a bug) is the template in
  docs/DISCORD-POSTS.md, filled in as it says there.
- Randomness only from seeded generators (client/engine/random.js);
  Math.random only to draw a seed.
- One kind of change per commit; stage explicit paths.
- Behaviour of existing encounters must not change unless that is the task.
- A fight's pull request edits the fight's own files: its directory, tests,
  scenario file and digests. A change to how client/engine/, client/assets/
  or client/encounters/shared/ behaves is a pull request of its own, first.
  Only a new, optional hook or field that changes nothing for other fights
  may come with the fight, as its own commit (CONTRIBUTING.md, "Yours and
  shared"). Never write a fight's map square, NPC ids or kind into a bundle:
  propose a seam in an issue.
- A pull request follows .github/pull_request_template.md, every heading.
- A branch built on another open pull request says "Built on #N"; after #N
  is squash-merged, rebase with `git rebase --onto origin/main <last commit
  of #N> <branch>`.
- A new boss gets its equipment and inventory setups before it is pushed:
  its descriptor's `loadouts` (docs/ADDING-AN-ENCOUNTER.md, section 3),
  from the Equipment section of its wiki strategies page, for example
  https://oldschool.runescape.wiki/w/The_Leviathan/Strategies. Where the
  client lacks the page's item, use the next best and say so in a comment.

## Pitfalls

- npm test uses port 8791; a second run at the same time fails at once.
- Only test/test-*.mjs are tests; helpers under test/ must not match that.
- In a browser test, ticking inside page.evaluate shows nothing on screen:
  tick to the moment you need, then let the app's own loop run.
- encounter.executeCommand returns { gameEvents } or nothing, not a boolean.
- An NPC with role "boss" gets no death animation from the default scene.
- Missing cache group: the browser console names it ("Empty container
  <index>:<group>"). Add it to your encounter's own list,
  tools/assets/cache-groups/<name>.json, with `node tools/cache-objects.mjs
  deps --add --to <name> npc:<id> seq:<id> spot:<id>` (or
  `group:<index>:<group>`, `sound:<id>`), then `npm run assets -- --force`.
  Do not edit tools/assets/cache-groups.json.
- Monsters in this engine do not path around obstacles unless coded to; a
  scripted fight must stand where the straight walk is free.
