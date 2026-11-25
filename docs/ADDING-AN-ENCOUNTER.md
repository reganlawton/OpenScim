# Adding an encounter

An encounter is a fight: its rules, what is known of it before a fight
exists, and what draws it. You add one as files of its own: a directory
under `client/encounters/` registers itself, and there is no list to add a
line to. No file under `client/assets/` (the bundles) has to be edited, and
you do not have to read one.

The worked example is the fixture encounter of the tests,
`test/fixtures/training-ground/`: one monster that walks up to the player
and hits, a toggle, a debug action. It is 220 lines in two files. The tests
register it while they run (`test/fixtures/register.mjs` says how: it is
outside `client/`, where an encounter is found by itself); the site does
not have it. The code quoted below is the fixture's,
except where the text calls it a sketch. The import lines are shown as you
would write them for an encounter in `client/encounters/`.

Two encounters written this way ship with the client and are worth reading
when you need more than the fixture has: `client/toa/nexus.js` (a room
without a fight, 132 lines) and `client/toa/zebak/native.js` (a boss with
phases, projectiles, sounds and a scene of its own).

Before you start: `npm install` and `npm run assets` (README). The second
fetches the game cache and the media that git does not track; the harness
and the browser need them.

`docs/ARCHITECTURE.md`, "Engine and encounter", lists every member the
engine calls on an encounter and what it hands it. This guide says what to
write and where, in the order you do it.

## Words

- A **tile** is `[x, y]` within a map square, 0 to 63 each, counted from the
  south-west. An actor's `position` is the south-west tile of its footprint
  (`size` × `size` tiles).
- A **tick** is one step of the simulation, 0.6 seconds. Visuals are timed
  in **cycles**, 30 to a tick.
- A **kind** is the name an encounter goes by in the code (`"yama_p3"`,
  `"training_ground"`), by convention in lower case with `_`. The **slug**
  is its name in the address (`/training-ground/`).
- **NPC type ids**, **sequence ids** (animations), **spot animation ids**
  (effects) and **map squares** are the game cache's. The monster table
  `client/data/monsters.js` answers by NPC type id
  (`getMonsterHitpoints`, `getMonsterFormulaStats` of
  `client/engine/monsterStats.js`).

## 1. The files

A new directory `client/encounters/<name>/` with two modules:

- `encounter.js`: the encounter class and its definition (section 2 and 3);
- `presentation.js`: what draws it (section 5).

The two names are fixed: `client/encounters/registry.js` takes every
`encounter.js` of a directory beside it, and `presentations.js` every
`presentation.js`. That is the whole registration. Two pull requests that
each add a fight touch no file in common.

More modules as the fight grows (the original encounters have fourteen to
twenty-four each). Import the engine's rules and the shared helpers
relatively (`../../engine/monsterStats.js`, `../shared/npcAttack.js`). The
fixture lives outside `client/` and names them from the web root instead
(`"/engine/monsterStats.js"`), as the modules of `client/toa/` do.

Two rules hold for every module under `client/encounters/`, and
`node tools/check-import-graph.mjs` fails when one is broken:

- no import of `client/assets/rendering.js`, `Grid.js` or `application.js`;
- no import cycle. `registry.js` and `presentations.js` import your
  modules, so your modules must not import either of them back.

What you may import: `client/engine/`, `client/data/`, `client/util/`,
`client/encounters/shared/` (the default scene builder is there, section
5), and, for the events the default scene plays,
`client/encounters/inferno/events.js` (section 6). The other modules of
`client/encounters/inferno/` are the Inferno's own; copy what you need from
them instead of importing it.

## 2. The encounter object

The engine holds one encounter object per fight and calls it every tick.
The encounter never holds the engine: each call hands it a context
(`context.tick`, `context.world`, `context.tickEvents`, `context.spawnNpc`,
... ; the list is in ARCHITECTURE). `context.world` is the world state:
`getPlayer()`, `getNpc(id)`, `getNpcs()`, `actors`.

### Members the engine requires

The engine calls every one of these without a check: an encounter that
lacks one throws when the engine gets there.

| Member | The fixture's | What it is for |
|---|---|---|
| `kind` | `"training_ground"` | the encounter's name; the same string as in the two lists |
| `reset(seeds?)` | draws a seed, makes its random generator, sets the outcome to active | a new run. `seeds` is what `getSeeds()` returned when a run is repeated (a restart with the same seeds, a replay). Call it from the constructor |
| `getSeeds()` | `{ encounterSeed }` | everything random in the fight must follow from these, so that a replay repeats it |
| `getDefaultMechanicsConfig()` | `{ trainingGroundHardHits: false }` | the encounter's own settings and their defaults; the player's settings are laid over them |
| `getDefaultPlayerStart(mechanics)` | `[31, 37]` | the tile the player starts on. The descriptor's `playerStart` (section 3) is a second place for the same tile: keep them equal |
| `getIntroConfig(mechanics)` | `null` | an intro before the fight, or `null`. Only asked when the definition has `enableIntro: true` |
| `getArenaConfig()` | `{ bounds: null, collisionMap: null, walkableTiles: null }` | the arena until the application has built it from the map (section 3). An arena without geometry lets the player walk anywhere |
| `createNpcs(startTile)` | one actor | the NPCs at the start of a run |
| `resolveHazards(context, mechanics)` | `[]` | every tick, before the NPCs act: damage to apply to the player, as a list of `{ baseDamage, attackType, source, playerPosition }`. `baseDamage` is a number or `[least, most]`, rolled by the engine; `attackType` is `"melee"`, `"range"`, `"magic"` or `"typeless"` (no prayer answers it); `source` names what dealt it |
| `processPostTick(context, mechanics)` | turns "resolving" into "victory" | every tick, after the player has acted: again a list of damage |
| `getOutcome()` | `{ phase: "active" }`, later "resolving", then "victory" | the fight is over when the phase is `"victory"` |
| `getSnapshot({ tick, mechanics, world })` | `{ kind, state: { hardHits }, visuals: {} }` | what the interface and the scene are handed each tick besides the actors |
| `getNpcDamageSourceLabel(npcId)` | `"Sparring partner"` | the name in the damage log |

### Members the engine calls if they are there

The fixture has five of them:

```js
  getNpcDefinitions() {
    return this.definitions;
  }
  // At tick 0, whenever the mechanics change.
  configureRunStart(mechanics) {
    this.hardHits = mechanics[hardHitsKey] === true;
  }
  // An NPC's turn, after it has moved.
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
  }
  onNpcDefeated(defeat, context, completionOwnership) {
    if (defeat.npcId !== partnerActorId || completionOwnership !== "encounter-owned") return;
    this.outcome = { phase: "resolving", decisiveTick: defeat.tick, completionTick: defeat.tick + ticksFromDefeatToVictory, primaryActorId: partnerActorId, completionActorIds: [partnerActorId] };
  }
  // A debug action of the controls below. Returns the tick events to emit
  // (none here) when the command was run, and nothing when it was not.
  executeCommand(command, context) {
    if (command.type !== healPartnerCommand.type) return null;
    const partner = context.world.getNpc(partnerActorId);
    if (!partner?.alive) return null;
    partner.vitals = { ...partner.vitals, hp: partner.vitals.maxHp };
    return { gameEvents: [] };
  }
```

`completionOwnership` says who declares the run complete:
`"encounter-owned"` is the encounter itself; the tutorial takes it over for
its lessons, and then the encounter must leave the outcome alone. An
outcome that is no longer active carries the tick of the kill
(`decisiveTick`), the tick on which it becomes a victory (`completionTick`)
and the actor it is about (`primaryActorId`, `completionActorIds`), as the
outcomes of the other encounters do; the scene times a boss's death by
them. The hook is called once for every NPC that is defeated
(`defeat.npcId`, `defeat.tick`), and not at all once the player is dead.
With several monsters, count the defeats yourself and set the outcome on
the last; without a boss, `primaryActorId` can name the one that fell
last. `completionActorIds` is what the victory screen sums the damage
over: name every monster of the run there, not the last one alone.

The others (`getEngineRules`, `refineArenaConfig`, `moveNpc`,
`prepareNpcBand`, `completeNpcBand`, `onPlayerAttackStarted`,
`acceptsInput`, `syncBossHp`, the restart plans and more) are in
ARCHITECTURE's second table, each with the moment it is called.
`getEngineRules()` is where an encounter changes the rules of combat itself
(damage multipliers, prayer drain, forbidden items, which attacks are
valid).

### An NPC

An NPC is a plain object in the world. The fixture's `createNpcs` shows the
fields: `id`, `kind: "npc"`, `role`, `npcTypeId`, `archetypeId`, `size`,
`alive`, `position`, `previousPosition`, `facing`, `history`, `vitals`
(`hp`, `maxHp`), `formulaStats` (from the monster table) and `combat`
(`attackSpeed`, `attackRange`, `attackStyle`, `nextActionTick`, `targetId`,
`lastAttackTick`, `animations`).

- `role: "boss"` marks the one NPC the interface treats as the fight's
  primary NPC (without a boss it is the first NPC); the engine keeps a boss
  in the world after its death. Any other
  NPC is removed ten ticks after it died, and the default scene plays its
  death by itself. The fixture's monster is a `"minion"` for that reason. A
  boss's death needs more in the render config (`primaryNpc`,
  `bossDeathAnimationEnabled`): Zebak's has both.
- A dead NPC that is still in the world blocks the others as it did alive.
  With several monsters, take each out yourself when its death has played:
  `context.despawnNpc(id)` in `processPostTick` (the Colosseum's
  `removeDeadMonsters` counts the ticks from `npc.death.killTick`, or from
  `npc.deathAnimationTick` where the NPC has one). An NPC whose definition
  has `deathPolicy: "queued"` still takes its turn on the tick it is
  killed, and its death animation starts later, on that
  `deathAnimationTick`.
- `combat.targetId` and `combat.attackRange` drive the default movement.
- `combat.attackStyle` is `"melee"`, `"range"`, `"magic"` or `"typeless"`,
  and `combat.attackSpeed` the ticks between attacks: the engine falls back
  on both for an attack that does not say. `combat.nextActionTick` is yours:
  the fixture's `tick` waits for it and sets it again
  (`scheduleNextActionTick`).
- `facing` is an angle in 2048ths of a turn. `history` is an empty Map the
  engine fills. `combat.animations` may be all `null` with the default
  scene: the sequences are in the render config (section 5).
- The ids and sizes you can use without fetching anything are in section 7.

Its behaviour is an NPC definition (`defineNpc` of
`client/encounters/shared/npcDefinitions.js`): a set of hooks, all
optional. The fixture defines one, `tick`:

```js
const partnerDefinition = defineNpc({
  id: "training-ground-sparring-partner",
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (context.tick < actor.combat.nextActionTick || !player.alive) return idle;
    if (!isNpcInAttackRange(actor, player, actor.combat.attackRange)) return idle;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: player,
      plan: {
        formulaStyle: "melee_slash",
        damageType: "melee",
        attackKind: "melee_slash",
        maxHit: config.maxHit(),
        impactDelayTicks: 0,
        sourceDeathPolicy: "cancel-before-impact",
      },
      random: context.random,
    });
    // Null when the attacker has no formula stats: an NPC type the monster table lacks.
    if (!npcAttack) throw new TypeError(`Missing formula stats for ${actor.id}`);
    // The scene plays the clip "attack" of the monster's render config.
    emitInfernoNpcAttack(context, { actor, target: player, clipId: "attack", kind: "training_ground_melee", impactDelayTicks: 0 });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, attackSpeedTicks);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});
```

- `partnerDefinition.createActor(baseActor, state)` makes the actor: the
  plain object plus the definition's mark and a `state` of your own (the
  fixture's is `{}`).
- `partnerDefinition.register(config)` gives the entry for the
  encounter's `NpcDefinitionRegistry`, which `getNpcDefinitions()` returns.
  `config` is whatever the hooks should be handed back as `config`.
- **Movement**: a definition without a `move` hook walks its NPC towards
  `combat.targetId` until it is within `combat.attackRange`
  (`getNpcPursuitMoves` of `shared/npcMovement.js`). `move: false` keeps it
  still. A `move` hook, `({ actor, context, config }) => [...]`, returns the
  steps itself: a list of `{ npcId, path: [tile, ...] }`, empty for no
  move; it can call `getNpcPursuitMoves(actor, context)` for the default.
  The engine asks the definitions for the movement unless the encounter
  has `moveNpc`.
- **Its turn**: the engine calls the encounter's `processNpcTick(npc,
  context)`, and the encounter passes it on to the definition's `tick` with
  its own random generator. What comes back is `{ environmentalDamages,
  npcAttacks? }`; the engine launches the attacks. Several hits in one
  turn (the Colosseum's jaguar claws three times) are several attacks in
  `npcAttacks`, the later ones with `isContinuation: true` added, so that
  the attack is announced once.
- **Reaching the encounter from a hook**: `config` is the way. The
  Colosseum registers each of its monsters with one object, `{ modifiers:
  () => this.modifiers, throwHigh: (javelin) =>
  this.highJavelins.push(javelin) }`: the javelin colossus's `tick` calls
  `config.throwHigh(...)` to hand the encounter a javelin that lands some
  ticks later (in `resolveHazards`), and every monster asks
  `config.modifiers()` for the modifiers of the run as they are now.
- **An attack** is rolled by `rollNpcAttack` (`shared/npcAttack.js`) from a
  plan. It returns the attack for the engine to launch, or `null` when the
  attacker has no `formulaStats` (an NPC type the monster table lacks: give
  such an NPC `formulaStats` and hitpoints of your own). The plan:

  | Field | Values |
  |---|---|
  | `formulaStyle` | what the accuracy and max hit formulas use: `"melee_stab"`, `"melee_slash"`, `"melee_crush"`, `"ranged"`, `"magic"` |
  | `damageType` | which protection prayer answers it: `"melee"`, `"range"`, `"magic"` (note `"range"` here, `"ranged"` above) |
  | `attackKind` | the kind of the hit in the events it causes (`hit_applied.attackKind`); the encounters use `"melee_crush"`, `"melee_slash"`, `"melee_stab"`, `"range_arrow"`, `"magic_fire"`, `"typeless"` |
  | `impactDelayTicks` | ticks from the attack to the hit; 0 for melee |
  | `projectile` | instead of `impactDelayTicks`: a projectile's timing, `{ delay, lengthAdjustment, stepMultiplier, progress }`, from which the delay follows by the distance |
  | `maxHit` | optional; without it the attacker's stats decide |
  | `sourceDeathPolicy` | `"cancel-before-impact"` drops the hit when the attacker has died before it lands, `"persist"` lets it land |
  | `prayerCheckAt` | optional: `"launch"` (the default) or `"impact"`, the moment the player's prayer counts |
  | `windupTicks`, `alwaysHits` | optional: ticks added before the delay; a hit that cannot miss |

  For a ranged attack, the Inferno's bat (`client/encounters/inferno/bat.js`)
  has a projectile: `{ spotAnimId, timing, slope, startHeight, endHeight }`.
  Give `plan.projectile` its `timing`, and the event its picture,
  `buildNpcProjectileVisual(attacker, target, projectile)` of
  `shared/npcHelpers.js`, in the `projectiles` of the attack's event
  (section 6). `bat.js` itself leans on the Inferno's helpers; copy the
  projectile, not the imports.
- **What the player sees of it** is a tick event (section 6).

Draw every random number from a generator seeded by your seeds
(`createSeededRandom` of `client/engine/random.js`) or from the context's
(`context.random` inside a definition's hooks). `Math.random()` is only for
drawing a seed in `reset`.

## 3. The definition

What is registered for a kind. Export it from `encounter.js` as
`definition`:

```js
export const definition = {
  kind: trainingGroundKind,
  factory: () => new TrainingGroundEncounter(),
  descriptor: {
    kind: trainingGroundKind,
    displayName: "Training Ground",
    description: "A test fixture: one sparring partner in Yama's arena.",
    mapSquare: trainingGroundMapSquare,
    playerStart,
    loadsMapLocs: true,
    // The arena is the tiles that can be walked to from `seed`.
    collision: { mode: "auto", seed: playerStart },
    victory: { title: "VICTORY", narrative: "SPARRING PARTNER DEFEATED", accent: "gold" },
  },
  controls: {
    defaultMechanicsConfig: { [hardHitsKey]: false },
    mechanicsToggles: [{ key: hardHitsKey, label: "Hard hits", setup: true }],
    debugActions: [{ command: healPartnerCommand, label: "Heal the sparring partner" }],
  },
};
```

The registry finds it there. A module with several kinds of its own exports
`definitions`, a list, instead (`client/encounters/tombs-of-amascut/`).

The encounter picker shows the encounters in the order of the registry's
list. To choose your place in it, export a number:

```js
export const order = 80;
```

Lower is earlier. Those that ship have 10 to 70, and the Inferno 100, so 80
stands just before the Inferno; two encounters with the same number go by
the name of their directory. Without an `order` yours comes after all that
have one.

The header of `registry.js` describes every key of a definition, the
optional ones included (`slug`, `enableIntro`, variants, retired names).

**`factory(options)`** returns a new encounter object.

**`descriptor`** is what the application knows of the encounter before a
fight exists. The engine reads none of it.

| Field | Needed | What the application does with it |
|---|---|---|
| `kind` | yes | must equal the definition's kind; the registry refuses another |
| `displayName`, `description` | yes | the encounter picker, the quick search, titles; the page's title and text when there is no entry for search engines (section 4) |
| `mapSquare: { x, y }` | yes, unless `collision.mode` is `"custom"` | the map square whose terrain is drawn and whose collision makes the arena |
| `playerStart` | yes, unless `collision.seed` is given or the mode is `"custom"` | the tile the arena is built from when `collision` names no `seed`. The engine does not read it: it asks the encounter's `getDefaultPlayerStart` |
| `collision` | no | `{ mode: "auto", seed }`: the arena is every tile that can be walked to from the tile `seed` (or from `playerStart`), over the map's collision. The application has the cache loader build it, registers it for the kind and tells the engine to take it. `dynamicLocs` adds objects that are not on the map, `excludedStaticLocIds` leaves some out. `{ mode: "custom" }`: no arena is built, and the engine runs on the encounter's own `getArenaConfig()` (the lobby does that) |
| `loadsMapLocs` | no | `true`: the map's objects (walls, rocks, scenery) are loaded and drawn |
| `mapSquareOffsets` | no | further map squares around the first (the Inferno's arena spans five) |
| `victory` | no | `{ title, narrative, accent, eyebrow? }`: the text of the victory screen; `accent` is `"gold"` or `"blood"`. Without it a won fight shows no victory screen |
| `isWorkInProgress` | no | a "Beta" badge in the menus |
| `variants`, `variantLabel`, `modifiers`, `setupNotes` | no | Yama's contracts and Sol Heredit's modifiers; see their definitions |
| `loadouts` | no | the default loadouts, by a key of your choosing: `{ max: { name: "Max (Scythe)", equipment: { head: 30750, weapon: 22325 }, inventory: [13652, 23685, null, 3024], supplies: { ... } } }`. `equipment` is item ids by slot (`head`, `cape`, `amulet`, `weapon`, `body`, `shield`, `legs`, `hands`, `boots`, `ring`), `inventory` up to 28 item ids with `null` for an empty slot, `supplies` the ammunition, rune pouch, blowpipe, spell and spellbook as `parseCombatSupplies` of `client/engine/supplies.js` reads them (rune ids are `RUNE_ITEM_IDS` of `client/engine/spells.js`). The first is what a player starts with; "No Equipment" is added. Without `loadouts` the player starts with nothing worn. When they grow, keep them in a `loadouts.js` beside the encounter |
| `seo` | no | the route's texts for search engines: `{ title, description, h1?, intro?, keywords?, noindex? }`. With it the encounter is listed on the home page and its route indexed, unless it says `noindex: true`. Without it the page's title and description are the display name and the description, and the route is not indexed |
| `tileMarkerPresets` | no | tile markers the player can switch on: `[{ id, name, description, link?, defaultActive?, markers: [[x, y, "#AARRGGBB", label?], ...] }]`. `id` is unique among all encounters; a marker's colour is RuneLite's, alpha first, as its ground marker plugin exports it |

**`controls`** is what the menus offer:

- `defaultMechanicsConfig`: the same defaults as
  `getDefaultMechanicsConfig()`.
- `mechanicsToggles`: one entry per setting, `{ key, label }`. `setup: true`
  puts it in the set-up of a run; `choices: [{ value, label }]` makes it a
  choice instead of a switch (Zebak's path level). The value arrives in the
  `mechanics` every hook is handed; the fixture reads it in
  `configureRunStart`. Two toggles are added to every encounter by the
  registry: Infinite Health and Infinite Special Attack. A key the
  encounter lists in its member `runStartMechanicsKeys` (the Colosseum's
  start wave) keeps the value it had when the run started: a change in the
  menu, or `engine.setMechanicsConfig` in a browser test, applies from the
  next run. A test that needs another value restarts the run:
  `engine.reset(undefined, undefined, { key: value })`.
- `debugActions`: `{ command, label }`. `command` is an object of your own
  design with `encounter: <your kind>`; a click hands it to the encounter's
  `executeCommand(command, context, mechanics)` at the start of the next
  tick. The context of a command has `tick`, `playerPos`, `world`,
  `spawnNpc` and `despawnNpc`.

## 4. The kind and the route

There is nothing to write. The engine's table of kinds
(`client/engine/encounterKinds.js`) is read off the registry: a kind with a
definition has a route, and its variant kinds are the keys of the
definition's `variantFactories`.

The **slug**, the address of the route, is the kind with `-` for `_`:
`training_ground` is at `/training-ground/`. A definition that wants another
says so (`slug: "yama"` for the kind `yama_p3`), and `slug: null` is an
encounter without a route (the lobby).

That is all a route needs. The page's title is the descriptor's display
name ("Training Ground | OpenScim.dev"), its description the descriptor's, and
the page asks search engines not to index it. Texts written for search
engines are the descriptor's `seo` (section 3).

Once a kind is in the registry it is offered in the encounter picker and
the quick search, under its display name.

## 5. The presentation

What draws the encounter. The scene classes are in the bundle
`rendering.js`, so a presentation cannot import its base scene. It is a
function that is handed it:

```js
import { buildScene } from "../shared/buildScene.js";
import { trainingGroundKind, trainingGroundMapSquare, partnerNpcTypeId } from "./encounter.js";

const renderConfig = {
  terrainMapSquare: trainingGroundMapSquare,
  spotAnimIds: [],
  preloadNpcTypes: [{ npcTypeId: partnerNpcTypeId, idleSeqId: 7595, attackClips: { attack: 7597 }, deathSeqId: 7599 }],
};

export const presentation = (BaseScene) => ({
  kind: trainingGroundKind,
  renderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context),
  defaultCamera: { yaw: 180, pitch: -55, zoom: 260 },
});
```

Export it from `presentation.js` as `presentation`: `presentations.js`
finds it there. An encounter with several exports `presentations`, a list
(the Doom's two rooms).

`rendering.js` calls every function that was found once, with the base
scene class and the renderer's colour packing (`packHsl`, also importable
from `client/util/packHsl.js`). A kind without a presentation cannot be
entered: the interface throws "No scene builder registered for encounter
kind". The presentations are in the order of the encounters (`order`,
section 3), which is also the order of the audio layers.

The keys of what the function returns (the header of `presentations.js`
has them too):

- `kind`: the definition's kind. Its variant kinds get the same
  presentation.
- `renderConfig`: what the scene loads and draws.
  - `terrainMapSquare`: the map square of the terrain; the descriptor's
    `mapSquare` when left out.
  - `preloadNpcTypes`: one entry per NPC type that can appear, `{ npcTypeId,
    idleSeqId, attackClips, deathSeqId }`. `attackClips` maps a clip id of
    your choosing to a sequence id; the encounter names the clip in a
    visual event (section 6). Despite its name it holds every clip an event
    may name, not attacks alone: the waves of the Colosseum have `spawn`,
    `heal` and `charge` there. The walk sequence is the NPC type's own,
    from the cache; `walkSeqId` in the entry replaces it. `deathDurationMs`
    is how long a dead NPC stays drawn (the length of its death sequence
    when left out).
  - `spotAnimIds`: the spot animations the fight uses, a projectile's
    among them, so that they are loaded before they are needed (the
    Inferno's list has its bat's 1382).
  - `primaryNpc`, `locRender`, `createSceneObjectController`: for a boss
    with a death sequence of its own, for the levels of map objects to
    draw, and for objects the encounter itself places and moves. Zebak's
    render config uses all three. `locRender` is `{ bounds, levels }`:
    without it only the map objects of level 0 are drawn, and an arena
    whose walls stand on the levels above looks open
    (`client/encounters/colosseum/presentation.js` asks for levels 0 to 2,
    with `bounds: null` for the whole map square).
- `sceneBuilder(context)`: makes the scene of one visit (section 6).
- `defaultCamera`: `{ yaw, pitch, zoom? }` when the encounter is entered.
  The camera is aimed at the player. Without a `zoom` the interface takes
  512; without a camera at all, yaw 180 and pitch -22.5. Start from the camera of an encounter in the same arena (the
  presentations of `client/toa/`, the fixture) and adjust it in the
  browser. `setupCameras` gives others for certain mechanics values (the
  Inferno's in `rendering.js` is the one example).
- `audio`: `{ layerName, rules }`, an audio layer of the encounter's own.
  `rules` is keyed by the type of a tick event; a rule has `preloadIds` and
  `resolve(event)`, which returns `{ kind: "play", sound }` or `{ kind:
  "pass" }`. Zebak's presentation is the example. A sound that belongs to
  no tick event (the click of an interface) is played at once by the audio
  engine the scene builder can reach: `context.eventAudioPlayer.engine.play(
  soundId, { channel: "sfx" }, tag)`. The Colosseum's presentation hands
  that to its interface (`colosseum/intermission.js`).
- `presentation`: the menus' texts and art, `{ title, tagline, blurb,
  setupContext, heroArt, thumb, wikiUrl, portrait }`, all optional. Without
  it the picker shows the descriptor's display name and its first letter.

## 6. The scene

### When the default is enough

`buildScene(BaseScene, renderConfig, context)` makes a scene that draws,
without a line of your own:

- the terrain and, with `loadsMapLocs`, the objects of the map square;
- the player;
- every NPC of the simulation, as the model of its `npcTypeId`, in the idle
  sequence of its entry in `preloadNpcTypes`, where the simulation has it;
  when it dies, its death sequence (for an NPC that is not the boss);
- what the encounter emits as **visual events**.

The interface lays hitsplats and health bars over it.

A visual event is a tick event of type `"inferno_visual"` (the name is
historical: the base scene is the Inferno's, and the helpers that emit
these events are in `client/encounters/inferno/events.js`). A sketch of
one:

```js
emitInfernoVisual(context.tickEvents, {
  animations: [{ actorId, clipId, delayCycles: 0 }],   // clipId: a key of attackClips
  projectiles: [...],                                  // buildNpcProjectileVisual of shared/npcHelpers.js
  graphics: [{ spotAnimId, target: { kind: "tile", position }, height, delayCycles }],
});
```

`emitInfernoNpcAttack(context, { actor, target, clipId, kind,
impactDelayTicks, projectiles? })`, which the fixture calls, turns the
attacker to its target, emits such an event with the one animation, and
emits a second event, `"zuk_attack"`, which audio rules can answer. `kind`
is a name of your own for the attack (the fixture's is
`"training_ground_melee"`); it is the `attack` of that second event, which
is how an audio rule tells attacks apart (Zebak's rule for `zuk_attack`
does).

An encounter whose monsters only stand, walk, attack, shoot and die, and
whose effects are spot animations, needs nothing more.

An NPC definition you import from another encounter may show what it does
as events of another type, which the default scene does not play. Sol
Heredit's definitions emit `"colosseum_visual"` events, which only his own
scene in `rendering.js` plays: an encounter that reuses his Fremennik
warband on the default scene sees the warband walk and hit without an
animation or a projectile, and nothing in the console says why.
`client/encounters/colosseum/visuals.js` wraps a definition's registration
so that each such event reaches the engine as an `"inferno_visual"` one. It
translates only what the definition's hooks emit: what another encounter's
own class emits (the effects of Sol's modifiers) has to be emitted anew.

### When it is not

Extend the base scene inside `sceneBuilder`, and set it up with the same
helper (a sketch after the nexus, whose scene adds light beams):

```js
  sceneBuilder(context) {
    class NexusScene extends BaseScene {
      build(input, a, b) {
        const queue = super.build(input, a, b);
        ...
        return queue;
      }
    }
    return buildScene(NexusScene, renderConfig, context);
  },
```

(The nexus and Zebak make the four calls themselves and hand the scene
their own render config. `buildScene` hands it
`context.encounterRenderConfig`, which is your render config with the
descriptor's map square put in where yours names none: use `buildScene`.)
The members of the scene that have names, and are meant to be called or
overridden:

| Member | Use |
|---|---|
| `build(input, ...)` | override: returns the queue of draw commands for the state it is handed (`input.simulationState`, `input.options`). The nexus appends its light beams to `queue.commands` |
| `syncNpcInstances(npcs, hidden, state, paused)` | override: brings the drawn NPCs in step with the simulation's. Zebak's scene moves its clouds here, after `super` |
| `getPlayingSequenceFrames()` | override: the sequences that are playing, for the sounds of their frames. Zebak's scene takes the position off one of them |
| `setTerrainHeightsAndBounds(map, bounds)` | override: the terrain heights the actors stand on. Zebak's scene raises a bridge |
| `getNpcRenderInstanceId(actorId)` | the id an actor is drawn under (the primary NPC has one of its own) |
| `isNpcTypeLoaded(npcTypeId)`, `loadNpcType(...)` | the models |
| `npcInstanceManager` | the drawn NPCs: `instanceRegistry` (a Map by render instance id), `removeInstance(id)`, `setInstancePositionAndFacing(id, position, size, facingAngle)` |
| `terrainHeights`, `primaryCycle`, `encounterRenderConfig` | fields: the height of every tile, the cycle being drawn, the render config |
| `setEncounterRenderConfig`, `setEventAudioPlayer`, `setFrameSoundTracker`, `setGroundItemLoaderSource` | the four calls of `buildScene` |

Map objects that the encounter places itself go through
`renderConfig.createSceneObjectController`: a function that returns an
object with `consumeEvents()` and `update({ state, interpolatedTick })`,
which returns what to draw. `acidScene` in `client/toa/zebak/phases.js` is
the one example: it draws Zebak's acid from the encounter's snapshot
(`state.encounter.state`), which is how `getSnapshot` reaches a scene.

The base scene has about a hundred further methods whose names are still
the bundle's two or three letters. If you need one, it has to be read in
`rendering.js` (class `SceneCompositor` and its subclass `InfernoScene`)
and should be named there first: section 9.

### An interface or an overlay of the encounter's own

The application's own plugins and panels are written into the bundles one
by one (the table in section 9). What a module can do without them, as the
Colosseum's waves do (`client/encounters/colosseum/`):

- **Draw over the page.** A scene that extends the base scene overrides
  `build(input, ...rest)`, which is called every frame, and brings plain
  elements of its own in step with `input.simulationState`: its
  `encounter.state` is the encounter's snapshot, its `mechanicsConfig` the
  mechanics. `intermission.js` draws the game's interface in which a
  modifier is chosen this way, `overlays.js` its panels. Such an element is
  not one of the application's overlays: it cannot be dragged, and it takes
  the UI scale only if it asks for it (`getGamePanelScale`).
- **Send a choice back.** Not by calling the encounter: by a command, so
  that it is queued for the tick and recorded for a replay. That needs a
  listener in `Grid.js` (the Colosseum's `colosseum-command` is a copy of
  Zebak's) and an entry in the replay's schema: a bundle edit.
- **Switch it.** A mechanics toggle with `group: "aid"` is listed under the
  game panel's assists, is kept per encounter, and reaches the scene as
  `input.simulationState.mechanicsConfig[key]`. (`controls.debugFlags` are
  listed in the Plugins panel under "Debug Overlays", reach the scene as
  `input.options.encounterDebugFlags`, and are not kept.)
- **Mark tiles.** `build` may hand the base scene more markers than it was
  given: `input.tileMarkers`, each `{ x, y, color: "#RRGGBB", opacity,
  label }`, and `input.lineMarkers`, each with `orientation: "horizontal"`
  (along the south side of the tile) or `"vertical"` (along its west side).
  They are drawn only with `input.options.showTileMarkers` and
  `showLineMarkers`: when you set those, leave the player's own markers out
  if he had them hidden (`withOverlayMarkers` of `overlays.js`).

## 7. The game cache

The client runs on a trimmed copy of the game cache (`client/osrs-cache/`,
made by `npm run assets`). It holds what the existing encounters need. Your
map square, your NPCs' models and animations, your spot animations and
sounds must be in it. What yours adds is listed in a file of its own,
`tools/assets/cache-groups/<name>.json` (`<name>` as your directory:
lower case, digits, `-`), which the command below writes. Nobody edits the
list the existing encounters share, `tools/assets/cache-groups.json`, so two
encounters being added never meet in a file; the trimmed cache holds what
any of the lists has (`tools/assets/cache-groups.mjs`).

- `node tools/cache-objects.mjs deps <region>` lists the cache groups a map
  square and its objects need that no list has; `deps --add --to <name>
  <region>` puts them into your file. The region of a map square is
  `x << 8 | y`. Then `npm run assets -- --force` rebuilds the cache.
- `node tools/cache-objects.mjs deps --add --to <name> npc:<id> seq:<id>
  spot:<id>` does the same for an NPC type (its models, the sequences it
  stands, walks and runs with), a sequence and a spot animation, each with
  the sounds of its frames. Name every sequence your render config names:
  an attack or a death is not in the NPC's own definition.
- The cache loader throws `Empty container <index>:<group>` for a model or
  an animation that is still missing: the browser's console names the
  index and the group, and `deps --add --to <name> group:<index>:<group>`
  adds it. A missing sound throws nothing: it is silent. `deps` finds the
  sounds of an animation's frames only: a sound an `audio` rule plays is in
  no definition, and `deps --add --to <name> sound:<id>` adds it
  (`test/test-colosseum-audio.mjs` checks the Colosseum's).
- With `--to`, a group counts as listed when the shared list or your file
  has it, whatever other encounters' files hold: yours stays whole when
  theirs change. `node test/test-cache-groups.mjs` checks every file and
  needs no cache.

`node tools/cache-objects.mjs npc <id>...` and `spot <id>...` print a
definition from the full cache: an NPC's name, size, models and its own
stand and walk sequences (the `idleSeqId` of a render config), a spot
animation's model and sequence. The other ids (the sequences of an attack
and a death, spot animations, sounds) are the game's and are not looked up
anywhere in this repository: they come from a cache viewer or the
community's id lists. The monster table has a monster's name, size and
combat stats by NPC type id, not its animations.

The fixture borrows everything from what is there: Yama's map square and a
monster of the Inferno. To try things out before you fetch anything, the
same is open to you:

- the map squares of the descriptors in `client/encounters/registry.js`
  (Yama's is `{ x: 23, y: 157 }`, with the player's start at `[31, 37]`;
  the floor of his room is roughly x 19 to 43, y 21 to 38). To see where
  an arena can be walked, once the kind is in the registry, save this as a
  file in the repository's root and run it with `node`; it prints the
  walkable tiles as `"x,y"`:

  ```js
  import { loadEnvironment } from "./tools/determinism/harness.mjs";
  const kind = "training_ground";
  const { prepareArena, rendering } = await loadEnvironment();
  await prepareArena(kind);
  console.log(rendering.getRegisteredArenaConfig(kind).walkableTiles);
  process.exit(0);
  ```

- the monsters of the Inferno's waves, whose models and sequences the
  trimmed cache has. Their NPC type ids and sizes are in
  `client/encounters/inferno/actors.js`; their sequence ids are in the
  Inferno's render config, which is in `rendering.js`, so here they are:

  | Monster | NPC type | Size | Idle | Attack | Death |
  |---|---|---|---|---|---|
  | Jal-Nib (nibbler) | 7691 | 1 | 7573 | 7574 | 7576 |
  | Jal-MejRah (bat) | 7692 | 2 | 7577 | 7578 | 7580 |
  | Jal-Ak (blob) | 7693 | 3 | 7586 | 7582 melee, 7583 ranged, 7581 magic | 7584 |
  | Jal-ImKot (meleer) | 7697 | 4 | 7595 | 7597 | 7599 |

  The bat's projectile is spot animation 1382
  (`client/encounters/inferno/bat.js` has its timing). How fast and from
  how far each of them attacks in the Inferno is in
  `client/encounters/inferno/waveMonsters.js`; in your encounter it is
  yours to choose.

## 8. The tests to run

1. **A fight without a browser.** The determinism harness runs scripted
   fights in Node and digests the engine's state at every tick. Add a file
   `tools/determinism/scenarios/<name>.mjs` that exports `scenarios`: the
   harness runs every file of that directory, and there is no list to add
   it to. Its digests are recorded as files of their own,
   `test/determinism-digests/<scenario name>.json`. The
   fixture's file, `scenarios/fixture.mjs`, is two fights in forty lines;
   the top of `scenarios/common.mjs` says what a scenario holds, and the
   file has the gear and the inputs a script can give.

   Name your scenarios `<name>/...`, as the fixture's are `fixture/kill` and
   `fixture/hard-hits-and-heal`: `--only` takes every scenario whose name
   contains the text.

   ```
   node tools/determinism/harness.mjs --trace <scenario name>     one line per tick
   node tools/determinism/harness.mjs --file <name>               only the scenarios of your file
   node tools/determinism/harness.mjs --update --only <name>/     record the digests of your scenarios
   node tools/determinism/harness.mjs                             all scenarios: every one "ok"
   ```

   Record only your own scenarios. If a scenario of another encounter comes
   out "DIFFERENT", your change reached into it: that is a bug to find, not
   a digest to record.

   A scenario with `pure: () => value` instead of a script runs no fight:
   the harness digests what the function returns (the Colosseum's
   `colosseum/spawn-allocation` checks its spawn tables that way). Its
   file may import a client module directly, as Node sees it, only when
   that module and everything it imports use relative imports.

   Three things about a script that the fixture's two do not show:
   - what `api` offers is the object `api` in `harness.mjs` (`act`,
     `moveTo`, `mechanics`, `npcs`, `player`, ...), each with a comment;
   - a script keeps no state of its own between ticks: it decides from the
     tick number and from what `api.npcs()` and `api.player()` show, so
     that a scenario gives the same digests when it is run twice;
   - a script that fights several monsters picks the next one and clicks it
     when it is not yet `api.player().attackTarget`. `targets` and
     `attackOnce` at the top of `scenarios/inferno.mjs` show how; a monster
     that is dying has a `death` record before it stops being `alive`.

   The harness reaches an encounter through the registry alone. It runs a
   fight that has no `presentation.js`, or one that exports nothing under
   the name `presentation`: that is only proved in the browser.
2. `node tools/check-import-graph.mjs`: your modules import no bundle and
   are in no import cycle (section 1).
3. **The route in a browser.** `npm run dev`, then
   `http://127.0.0.1:5173/<slug>/`. A browser test on the pattern of
   `test/test-fixture-encounter.mjs` (it loads the route, waits for the
   scene, fights, waits for the victory screen) keeps it working.
4. `npm test` (all tests, about seven minutes) and `npm run build`, then
   `npm run preview` and the route again: the bundled site orders modules
   differently from the unbundled one.

## 9. What the interface gives you, and what still needs a bundle

Without touching a bundle, an encounter gets:

- the route, the encounter picker and the quick search (sections 3 and 4);
- its default loadouts, its texts for search engines and its tile-marker
  presets, from the descriptor's `loadouts`, `seo` and `tileMarkerPresets`
  (section 3);
- an entry in the What's New window: a file of its own in
  `client/whats-new/`, as `2026-11-24-colosseum.js` there;
- the arena from the map, the terrain, the map's objects (section 3);
- clicks on the ground and on its NPCs: walking and attacking. An NPC the
  player must not attack is refused in the rule `validateAttack` of
  `getEngineRules()`, or has `untargetable: true`;
- the player's whole kit: prayers, inventory, equipment, special attacks,
  spells;
- its mechanics toggles in the menus, and its debug actions as buttons
  that reach `executeCommand`;
- clicks on an equipment slot, when it asks for them: the interface calls
  `acceptsInput({ kind: "equipmentSlotClick", slot })`, and a click the
  encounter accepts arrives as `context.inputs.equipmentSlotClicks` on the
  next tick (Sol Heredit's grapple);
- how close the player walks to a target (`approachRange`), and moving the
  player itself (`moveDisplacedPlayer`, `context.teleportPlayer`);
- restarts, replays of the player's inputs, the victory screen, the death
  screen;
- the default scene, visual events, an audio layer of its own (sections 5
  and 6).

What still needs an edit in a bundle, each with its reason:

| What | Where | Why |
|---|---|---|
| A click that means something other than "attack" or "walk here" (Zebak's jugs: push, pull) | `Grid.js`, the click handlers and the context menu | what a click on an NPC means is decided there, by actor id |
| A replay that contains one of your debug actions | `Grid.js`, the replay's schema | it lists the commands of each encounter by name; a command it does not know runs live, is recorded, and makes the replay invalid when it is loaded |
| An NPC in the lobby that leads to the encounter | `rendering.js`, the lobby's tables | which lobby NPC and which tile enter which kind is written there. A gateway is modules, not a bundle: `client/lobby/gateways.js` lists them, one module each (`client/toa/gateway.js`, `client/dt2/gateway.js`) |
| A set-up panel of the encounter's own or a "retry" button (the Inferno has both), tutorials, plugins scoped to an encounter | `Grid.js`, `application.js` | each is a table or a component keyed by kind |
| A scene that is not built on the Inferno's (Yama's and Sol Heredit's extend the compositor directly) | `rendering.js` | a presentation is handed one base class |
| A method of the base scene that has no name yet | `rendering.js` | about a hundred are left; `tools/rename-members.mjs` renames one everywhere it is used, with a names file in `tools/names/` (`scene-members.json` is the example) |
| A kind of visual event the scene does not know | `rendering.js` | a scene plays the event types its code was written for |
| Map data that the cache loader must change for one map square (Zebak's ground) | `player.js` | the loader has no seam for it; a map square that is only missing from the trimmed cache needs no such edit (section 7) |
| The sequence ids of the monsters the original encounters draw | `rendering.js`, their render configs | the scenes of the original encounters are in the bundle; section 7 copies four of the Inferno's |

## Checklist

Every step adds files of your own; none edits a list.

1. `client/encounters/<name>/encounter.js`: the class with the thirteen
   required members, the NPC definitions, and the definition, exported as
   `definition`. Its kind gives the route; `order` its place in the picker.
2. `client/encounters/<name>/presentation.js`: the render config and the
   presentation function, exported as `presentation`.
3. `tools/determinism/scenarios/<name>.mjs`, its digests recorded
   (`test/determinism-digests/<name>/`).
4. The harness, the import graph check, `npm test`, `npm run build`, the
   route in a browser.
5. The sandbox: `npm run sandbox:catalog` adds your monsters to its catalog
   (`client/encounters/sandbox/discovered.js`); `node
   test/test-sandbox-catalog.mjs` fights each, and `node
   tools/determinism/harness.mjs --update --only sandbox/catalog/` records
   their digests. A monster that is not one to place on its own goes to
   `sandboxCatalogExclusions` in `client/encounters/sandbox/catalog.js`
   with its reason (`docs/SANDBOX.md`, "New encounters' monsters").
6. For a boss, its equipment and inventory setups, before it is pushed: the
   descriptor's `loadouts` (section 3), from the Equipment section of its
   wiki strategies page (`<boss>/Strategies`, as
   https://oldschool.runescape.wiki/w/The_Leviathan/Strategies).
