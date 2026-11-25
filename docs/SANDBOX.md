# Sandbox

A fight of the player's own: an arena of another encounter, monsters of the
other encounters placed on it, optionally the arena's own boss with all its
mechanics, and one of two modes. Code: `client/encounters/sandbox/`.

Ways in: "Sandbox" in the encounter picker and the quick search (one entry;
the arena is chosen in the sandbox's editor, not in the menus), and the
gateway in the lobby, a dais ringed with coloured beams on the spoke between
Yama and his neighbour. None opens a setup window: each enters the arena of
the player's scenario with the editor open at its **start screen**
(`menuImport.js`, `sandboxEntryKind`, called by `handleConfigureEncounter`
and the picker's Enter in `assets/application.js`). Routes: `/sandbox/` and
`/sandbox/<arena>` (e.g. `/sandbox/inferno`).

## Using it

The editor is the one place to build and play a scenario. The top bar, on
the right beside the minimap, holds **Start encounter** and the **Sandbox
editor** button, which opens a panel: a start screen and three steps.

- **Start**: the one box that loads a scenario (a share code, a link, a
  scenario's JSON pasted, or a file), then where to go on: the scenario you
  have, a new one in this arena, or the examples.

1. **Arena**: the scenario's name, author and description; the arena (another
   arena is another route, which the application enters without loading the
   page; the editor reopens at step 2); the mode, and the ten examples of
   that mode; the library; the scenarios saved in this browser.
2. **Monsters**: a map of the arena's walkable tiles. Drag a monster from the
   list onto its starting tile, drag it on the map to move it, click it to
   edit its hitpoints, max hit, attack speed, levels and team, duplicate it or
   remove it. The blue **P** is the player's starting tile; drag it the same
   way. A footprint must stand on walkable tiles and on no one else. In a
   free-for-all each monster shows its team's number in a corner; a right
   click gives it the next team (none, 1 to 4, then **A**, the player's side).
   **Boulders** (obstacles) are dragged from the same list, one tile each,
   and a right click takes one away.
3. **Gear & share**: the scenario's gear ("Choose gear…" opens the
   application's setup window for the arena, with the presets of every
   fight; "Use my current gear" keeps what you wear in the scenario; "Remove
   gear"), save in this browser, export a `.json` file, copy a share code or
   a link.

When a run is won, the victory screen has a **Sandbox editor** button
(`assets/application.js`, for an encounter whose snapshot has `sandbox`): the
panel opens over it, in front of everything until it is closed.

A scenario with gear puts it on when it is applied, loaded from the setup
window or opened by link: the application sets the sandbox's loadout and,
in the render that holds it, enters the arena with it.

The editor reaches the application through `bridge.js`: one
`sandbox-request` window event (heard in `assets/application.js`) whose
listener takes each request at once and settles a promise when it is done
(the setup window open, the loadout read, the loadout set and the arena
entered, an arena entered). Nothing waits a guessed time.

**Apply & restart**, the editor's one primary action, restarts the run with
the scenario (the application's own restart; when the boss was switched on
or off, the application enters the arena again, because the scene is chosen
as a visit starts). Every change is kept at once as the
active scenario (localStorage), so a reload keeps it; the fight on screen
only changes on a restart. The scene follows the scenario of the run, not
the editor's: the encounter notes it as it resets (`visit.js`), and should a
run start that wants the other scene (a replay or a restart with the boss
set the other way), the page reloads into it.

Every run waits: nothing moves until **Start encounter** at the top of the
screen, which then becomes **Pause** / **Resume**. The application's tick
loop asks the encounter (`isPaused`, a seam in `assets/Grid.js`); the engine
never does, so replays, rebuilds and the determinism harness are untouched.

After Start the sandbox counts down itself (`options.countdownTicks`, 3 by
default; a scenario's JSON may set 0 to 10, the editor does not show it): the run ticks, so the player can walk, pray,
switch gear and drop things, while the scenario's monsters neither move nor
act and nobody can be attacked (`targetableFromTick`) until the count ends;
the number shows in the middle of the screen. The encounter tells the
application with `ownsCountdown()`, and the application's own start-of-fight
countdown, which would hold every tick, is left out (`assets/Grid.js`). With
the arena's boss the application's countdown holds the run as before, since
the boss's own clock starts at once.

## Obstacles

`obstacles` in a scenario are boulders, one tile each, at most 60
(`obstacles.js`). Each is drawn as Zebak's boulder (NPC 11737, whose model
the cache list now holds: `tools/assets/cache-groups.json`), never acts,
cannot be attacked, and its tile is flagged in the arena's collision as the
Inferno's pillars are (an object that also stops projectiles), through
`refineArenaConfig`, on the host's arena too. The player, the monsters'
pursuit and their route search walk around them; ranged and magic attacks
need a line past them.

## The arena's boss

Step 1 has "Fight this arena's boss with all its mechanics" in the arenas
that have one (`hostKind` in `arenas.js`): Sol Heredit's arena, Yama's room,
Zebak's room, Vardorvis' clearing, both rooms of the Doom of Mokhaiotl,
Duke Sucellus' asylum and the Leviathan's Scar (its bridge is the arena's
own, `arenaConfig`, and Duke's ice is added to the map's, `refineArena`,
with or without the boss).
The scenario's `options.bossMechanics` then makes the arena's own encounter
the sandbox's host (`encounter.js`): it is made by its own factory and runs
inside the sandbox with everything it has (attacks, phases, hazards, adds,
its engine rules, its debug actions and boss hitpoint controls in the
Practice panel), and its scene is the one the fight has
(`presentationOf(kind)`, a seam in `assets/rendering.js`, reaches the scenes
that live in the bundle). The scenario's monsters fight beside it. The run is won when the host's
fight is won and the scenario's monsters are beaten.

In "ffa" the host's NPCs are one team: their own ("boss"), or the one
`options.bossTeam` names (step 1, "Boss team"; `player` to fight for the
player, who then cannot attack it). The boss shows on step 2's map where its fight puts it
(the snapshot's `sandbox.bosses`), dashed: it cannot be moved, and a right
click gives it the next team. The boss fights the nearest enemy, a
monster or the player, with its own mechanics: each of the host's hooks that
acts is handed a world whose player is that enemy (`hostContext`), seen with
a player's fields in neutral and as the tile of its body nearest the boss
(`playerView`), and the host's NPCs that aimed at the player aim at it
(`aimHost`); its attacks are rolled with the
enemy's own stats, and what would land on the player's tile lands on it as a
hit of the boss (`strikeFocus`). With no enemy left it rests. Duke Sucellus
and Vardorvis, who wait for the player in their fights, start at once
(`wakeBoss`). The host's boss is then one of the teams for the victory, and
the host may not take away the scenario's own NPCs (the Doom clears his room
as he dies). "Two Suns" is the real Sol
Heredit and a second one of the sandbox's.

One host per arena, where its fight puts it: a boss's mechanics are written
for its own room and its own actor ids, so a second copy of a boss, or a
boss in another arena, is the sandbox's plain version (below). The host's
intro is left out (the sandbox's Start replaces it).

## Modes

- **versus** ("All against you"): every NPC attacks the player. Won when all are dead.
- **ffa** ("Free for all"): every NPC attacks its nearest enemy: the NPCs of
  other teams (an NPC without a team is a team of its own) and, unless
  "Monsters may attack the player" is off, the player. NPCs of the team
  `player` fight on the player's side. An NPC that is hit turns on its
  attacker if that is an enemy. Won when the player's side is the last
  standing; with the player left out, when one team of NPCs is left. The top
  bar names the winner: the snapshot's `sandbox.winner`, which every
  snapshot of the sandbox carries, a host's included.

NPC-on-NPC attacks are the engine's own (the Inferno's nibblers hit its
pillars the same way): `rollNpcAttack` rolls them with the monster table's
stats of both sides, and the hits land through the combat system as any
other.

## Limitations

- Every monster placed from the catalog has one behaviour (`brawler.js`):
  walk to the target (with the route search around obstacles), attack with
  whichever of its attacks reaches, wait its attack speed. A boss's full
  mechanics are those of the arena's host only (above). What the monsters do
  besides, from their own fights (`inferno/sandbox.js` and the rest name the
  numbers): below half his hitpoints JalTok-Jad calls five healers
  (`summons`), who walk to him and heal him 10 every 4 ticks until something
  hits them (`supports`); his melee comes every 4 ticks. TzKal-Zuk calls Jad
  (with three healers) below 40 % and his four healers below 20 %, who heal
  him 15 to 24 from where they stand and throw sparks at whoever hits them.
  A monster whose target is being healed goes for the healers first, one at
  a time. The blob attacks with a style the player's prayer does not cover
  (`readsPrayer`) and splits into its three children as it dies
  (`splitsInto`); the mager, one attack in ten, brings back a dead monster
  of its side at half its hitpoints (`revives`); the meleer digs when it has
  not attacked for 20 ticks and comes up beside its target (`digs`);
  Vardorvis heals half of what his hits deal (`healsFromDamage`), with a
  heal hitsplat. A boss from the
  catalog keeps its look and the shape of its attacks: JalTok-Jad winds up
  for three ticks and throws his three-part magic or his ranged boulder (the
  style to pray against shows in the animation, but he picks it at random),
  TzKal-Zuk does not move, the Doom throws his orbs, the jaguar claws three
  times at once (each hit with its hitsplat: `hits` in `catalog.js`). The
  Colosseum's monsters do what they do in its waves (`colosseum/sandbox.js`
  holds their numbers, from `colosseum/*.js`): the manticore chooses the
  order of its orbs once, charges for 10 ticks with the charge animation 6
  ticks before it throws and the three orbs appearing over it 5, 4 and 3
  ticks before, at 300, 400 and 500 high and in the order it will throw
  them, then throws one a tick, each drawing its impact on a target that
  does not pray against it (`chargedVolley`); every fifth attack of the
  javelin colossus is a javelin thrown high that comes down on the tile its
  target stood on 6 ticks later, 0 to 40 that no prayer stops
  (`everyNth` and a `special`); out of reach of its target the minotaur
  heals one of its side below 75 % within 7 tiles in sight, to full
  (`heal`). Their modifiers (Mantimayhem, Red Flag) and the manticores
  copying each other's order are their fight's only. Sol Heredit's
  regular attack is his own fight's (`solGroundAttack` in
  `sol-heredit/sandbox.js`, a `special` that `brawler.js` starts and
  `encounter.js` lands and draws, with `buildGroundAttackArea`): a spear or
  a shield at even odds, the first a spear, the variant alternating; the
  tiles from where he and his target stand three ticks after the telegraph,
  the stomp going out from his centre, the larger of two rolls of 0 to 44
  that no prayer stops, 7 or 6 ticks between attacks. His triple attack,
  grapple and phases, Yama's fireballs or Vardorvis' axes come only with
  the host.
- In a free-for-all a host boss's mechanics are aimed at one enemy at a
  time; its specials that strike the whole room (Sol's, Yama's) strike only
  that one.
- The catalog is the monsters whose models and sequences the trimmed cache
  already holds and whose stats are in the monster table
  (`client/data/monsters.js`). Its bosses: Sol Heredit, Yama, Vardorvis, the
  Doom of Mokhaiotl, JalTok-Jad and TzKal-Zuk. The Doom's larvae are left
  out (not in the table), and Zebak (a head and a tail of nine tiles) is
  only the host of his room. A monster's numbers that are not the table's
  are named with their source in its encounter's `sandbox.js`; several are
  "inferred".
- What an attack looks like is announced as an "inferno_visual" event
  (the default scene) and a "colosseum_visual" one (Sol Heredit's and
  Yama's scenes, which the hosts draw with; Yama's plays them, with their
  projectiles and graphics, since a seam in `assets/rendering.js`). Both
  scenes also load the spot animations of the sandbox's render config.
- Arenas: the lobby is left out (its floor and walls are drawn by its own
  scene in `rendering.js`). The Inferno's has no pillars.
- Yama from the catalog shows the effect on his target but no projectile
  (his own are drawn by his scene from his fight's events).
- The share code goes in the address (`#sbx=`); there is no server. A
  scenario of 40 monsters makes a code of about 800 characters.

## New encounters' monsters

Each encounter keeps its monsters' catalog entries in its own
`client/encounters/<encounter>/sandbox.js` (the Inferno, the Colosseum, Sol
Heredit, Vardorvis, the Doom, Yama), beside the ids, sequences and
projectiles they copy; `catalog.js` gathers them.

`test/test-sandbox-catalog.mjs` (part of `npm test`) keeps the catalog in
step with the encounters. It reads the render config of every presentation
and fails for each NPC an encounter draws that has stats in the monster
table and an attack clip, and that the catalog neither holds nor excludes
(`sandboxCatalogExclusions` in `catalog.js`, each with its reason); the
message lists every NPC found and where it stands
(`tools/sandbox/discover.mjs`). So a new encounter's monsters reach the
sandbox with the pull request that adds them: an entry in its
`sandbox.js`, or a reason to leave one out (Zebak, nine tiles of head and
tail, is the host of his room only). The same test fights every entry: it
must have stats, its clips, be loaded by the scene with every spot
animation its attacks use, and attack the player within 40 ticks.

The determinism harness has a scenario per entry (`sandbox/catalog/<id>`):
a new one needs its digests recorded
(`node tools/determinism/harness.mjs --update --only sandbox/catalog/`).

## Format

`scenario.js` holds the format, version 1, with its full description at the
top. In short:

```json
{
  "format": "openscim-sandbox",
  "version": 1,
  "meta": { "name": "Two Suns", "author": "OpenScim", "description": "..." },
  "arena": "sol_heredit",
  "mode": "versus",
  "options": { "playerStart": null, "ffaIncludesPlayer": true, "bossMechanics": true, "countdownTicks": 3 },
  "obstacles": [[30, 33], [31, 33], [32, 33]],
  "gear": {
    "name": "Max melee",
    "equipment": { "weapon": 26219, "shield": 22322, "head": 26382 },
    "inventory": [{ "id": 13652 }, { "id": 6685 }, null],
    "supplies": {}
  },
  "npcs": [
    { "id": "sol-west", "npc": "sol_heredit", "position": [27, 36] },
    { "id": "sol-east", "npc": "sol_heredit", "position": [34, 36], "hp": 750, "team": "red" }
  ]
}
```

`normalizeScenario` checks every value and is where a later version would
read an older one. Arena ids are in `arenas.js`, NPC ids in `catalog.js`;
neither may be renamed once shared. `gear.supplies` keeps only what the
application reads of a loadout's supplies (ammunition, quiver, rune pouch,
blowpipe, spell, spellbook), parsed as `engine/supplies.js` parses them. A
scenario NPC whose id is a host NPC's is renamed (`yama-2`), not left out.

A share code is `OSB1.` and the deflated JSON (pako, `deflateRaw`) in
base64url. The largest scenario is about 13 KB of JSON and 1,200 characters
of code; a code over 16K characters is refused before it is decoded, and its
JSON is not inflated past 64 KB, so that a crafted code cannot exhaust the
tab. The import box goes by the first character: `{` is JSON, `OSB` a code,
anything else is searched for a `#sbx=` link.

Opening a `#sbx=` link shows what it holds (name, author, arena, monsters)
and asks before it replaces the player's scenario, and again before its gear
replaces their loadout and restarts the run. The code leaves the address in
every case, and one that cannot be read says why. Saved scenarios this
client cannot read (from a newer version, or naming a renamed catalog id)
are not listed but are kept as they were.

Sharing through a server later needs no change of the format: store the JSON
or the code, and open `/sandbox/<arena>#sbx=<code>`.

## Determinism and replays

The scenario is part of the encounter's seeds (`getSeeds()` returns
`{ encounterSeed, scenario }`): a replay and a restart with the same seeds
play the scenario they were recorded with, whatever the editor holds later.
The editor's scenario is read only when a run starts without seeds. Target
choice is deterministic (last attacker, current target, nearest); the one
random choice, between attacks that reach, draws from the encounter's
seeded generator.

`tools/determinism/scenarios/sandbox.mjs` runs both modes, each host with
two of the sandbox's monsters, and each example.
`test/test-sandbox-scenario.mjs` checks the format, the codes and the
examples; `test/test-sandbox-examples.mjs` that each of the twenty, and each
scenario of the library, stands on walkable tiles, clear of the others, of
the host's NPCs and of the player. `test/test-sandbox-wiring.mjs` fails when
the engine calls a hook of an encounter that the sandbox neither implements
nor hands its host (`sandboxHostHooks` in `encounter.js`), and when
`engine/encounterKinds.js` does not list the arenas of `arenas.js`.

## The examples

Twenty, each with its gear (max ranged, melee or magic): ten against the
player and ten free-for-alls; step 1 shows those of the mode chosen. They
mix the Inferno's, the Colosseum's and the Stranglewood's monsters with the
bosses, and few use Sol Heredit or Yama, whose hitpoints make long fights.

- All against you: Inferno Rush, Colosseum Gauntlet, Jad Pincer,
  Stranglewood Ambush (Vardorvis as the host), Doom and Company (the Doom as
  the host), Boulder Maze, Zuk's Court, Jaws and Claws (Zebak as the host),
  Sol's Last Stand, The Hunt.
- Free for all: Inferno vs Colosseum, Battle Royale, Three Kingdoms,
  Bodyguards (allies on your side), Spells vs Arrows, King of the Hill,
  Titan Clash, Allies Against the Doom (the deeper room's host), Warband
  Civil War, Four Corners.

Six have boulders. The harness runs each for a few ticks, and three of them
further: Inferno vs Colosseum to its winner, Bodyguards with the player
shooting, Boulder Maze with the monsters walking around its walls.

## The library

`client/encounters/sandbox/scenarios/` holds scenarios that players submit
by pull request: one JSON file each, as the editor's "Export .json" writes
it, under a short name of its own, listed in that directory's `index.js`.
The editor offers them as the Library, next to the examples.
`test/test-sandbox-examples.mjs` checks that every file is listed and reads,
and places each as it places the examples. Share codes stay for casual
sharing; the library is reviewed, permanent and one click away.

## Files

| File | Contents |
|---|---|
| `arenas.js` | the arenas: map square, collision, start tile, camera; the variant kind of each |
| `catalog.js` | the monsters, gathered from each encounter's `sandbox.js`, and the exclusions |
| `scenario.js` | the format: `normalizeScenario`, JSON, share codes |
| `examples.js` | the twenty examples and their gear |
| `obstacles.js` | the boulders: their NPC, their collision |
| `brawler.js` | the NPC definition every sandbox NPC has |
| `encounter.js` | `SandboxEncounter`, the modes, the definition with its variants |
| `activeScenario.js` | the scenario the next run starts with (localStorage, `#sbx=` links) |
| `storage.js` | the saved scenarios (localStorage) |
| `presentation.js` | one presentation per arena; brings the editor in step every frame |
| `editor.js` | the editor panel, Start / Pause and the run's result |
| `bridge.js` | the editor's requests to the application, as promises |
| `scenarios/` | the library: one JSON scenario per file, and its `index.js` |
| `clock.js` | whether the run may tick: waiting for Start, running, paused |
| `visit.js` | whether a visit fights the host (and draws its scene) |
| `gateway.js` | the gateway in the lobby (`client/lobby/gateways.js` lists it) |

What needed `client/assets/`, each a few lines: the tick loop asks
`encounter.isPaused()` (`Grid.js`); `routeVariants` (variants with a route
and presets that the menus do not list) and the sandbox's presets, every
fight's, the way in from the menus and the gateway (`sandboxEntryKind`),
the victory screen's Sandbox editor button, and the `sandbox-request`
listener of `bridge.js` (`application.js`);
`presentationOf(kind)` handed to the presentations written in modules, and
Yama's scene playing other NPCs' "colosseum_visual" animations, projectiles
and graphics, cleared on a replay jump, a despawn and when the scene goes
(`rendering.js`).
