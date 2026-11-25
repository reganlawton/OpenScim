// The arenas a sandbox scenario can be played in: the rooms of the other
// encounters, without their fights. Each is a variant kind of the sandbox
// (registry.js: variantFactories, variantDescriptors), with a descriptor of
// its own (its map square and how its collision is built) and a
// presentation of its own (presentation.js), as the Doom of Mokhaiotl's
// deeper room is.
//
// Every entry:
//   id            the name a scenario file uses, and the route's second part
//                 (/sandbox/<id>); never change one
//   name          what the menus show
//   mapSquare, mapSquareOffsets?, playerStart, collision   as in the
//                 encounter's own descriptor, from its module
//   locRender     the levels of map objects the scene draws
//   camera        { yaw, pitch, zoom } on entering, from the encounter's
//                 presentation
//   hostKind      the encounter whose boss can be fought here with all its
//                 mechanics (encounter.js); the scene is then that encounter's
//   refineArena?  what the encounter makes of the arena the map gives
//                 (Duke's asylum adds its ice), with or without its boss
//   arenaConfig?  with collision "custom": the arena itself, not read from
//                 the map (the Leviathan's bridge)
// The arena of the lobby is left out: its floor and walls are drawn by its
// own scene (in client/assets/rendering.js), which the sandbox cannot use.
import { solMapSquare, solPlayerStart } from "../sol-heredit/constants.js";
import { solBoundaryLocs } from "../sol-heredit/boundaryLocs.js";
import { colosseumPlayerStart } from "../colosseum/constants.js";
import { infernoMapSquare, infernoMapSquareOffsets, infernoPlayerStart, infernoExcludedStaticLocIds } from "../inferno/constants.js";
import { vardorvisMapSquare } from "../vardorvis/encounter.js";
import { arenaSeed as dukeArenaSeed, dukeMapSquare, dukeRoomArena, playerStart as dukePlayerStart } from "../duke-sucellus/encounter.js";
import { leviathanFloorArena, leviathanMapSquare, playerStart as leviathanPlayerStart } from "../leviathan/encounter.js";

export const sandboxKind = "sandbox";
export const sandboxVariantKind = (arenaId) => (arenaId === sandboxArenas[0].id ? sandboxKind : `${sandboxKind}_${arenaId}`);

export const sandboxArenas = [
  {
    id: "colosseum",
    name: "Fortis Colosseum",
    mapSquare: solMapSquare,
    playerStart: [...colosseumPlayerStart],
    collision: { mode: "auto", seed: [...colosseumPlayerStart] },
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 270, pitch: -60, zoom: 300 }, // inferred: looking along the arena from the player's start
  },
  {
    id: "sol_heredit",
    hostKind: "sol_heredit",
    name: "Sol Heredit's arena",
    mapSquare: solMapSquare,
    playerStart: [...solPlayerStart],
    collision: { mode: "auto", seed: [...solPlayerStart], dynamicLocs: solBoundaryLocs },
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 180, pitch: -55, zoom: 320 }, // inferred: Sol's own scene takes over with his boss
  },
  {
    id: "inferno",
    name: "The Inferno (no pillars)",
    mapSquare: infernoMapSquare,
    mapSquareOffsets: infernoMapSquareOffsets,
    playerStart: [...infernoPlayerStart],
    // The pillars are the Inferno's NPCs; without them the floor is open.
    collision: { mode: "auto", seed: [...infernoPlayerStart], excludedStaticLocIds: infernoExcludedStaticLocIds },
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 180, pitch: -55, zoom: 360 }, // inferred: the whole open floor in view
  },
  {
    id: "yama",
    hostKind: "yama_p3",
    name: "Yama's room",
    mapSquare: { x: 23, y: 157 }, // registry.js
    // inferred: the middle of Yama's own start square (yama/constants.js,
    // yamaPlayerStartMin/Max [29, 35] to [33, 39]), which he picks at random.
    playerStart: [31, 37],
    // inferred: a floor tile in front of Yama, from which the room's floor is reached.
    collision: { mode: "auto", seed: [32, 30] },
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 180, pitch: -55, zoom: 300 }, // the fixture's (test/fixtures/training-ground)
  },
  {
    id: "zebak",
    hostKind: "zebak",
    name: "Zebak's room (ToA)",
    mapSquare: { x: 61, y: 84 }, // toa/zebak/native.js
    playerStart: [29, 32], // toa/zebak/native.js (start)
    collision: { mode: "auto", seed: [29, 32] }, // as toa/zebak/native.js seeds it
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 90, pitch: -40, zoom: 240 }, // toa/zebak/native.js (defaultCamera)
  },
  {
    id: "vardorvis",
    hostKind: "vardorvis",
    name: "Vardorvis' clearing",
    mapSquare: vardorvisMapSquare,
    playerStart: [40, 24], // vardorvis/encounter.js (playerStart)
    collision: { mode: "auto", seed: [40, 24] }, // as vardorvis/encounter.js seeds it
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 180, pitch: -45, zoom: 320 }, // vardorvis/presentation.js (defaultCamera)
  },
  {
    id: "doom",
    hostKind: "doom_of_mokhaiotl",
    name: "Doom of Mokhaiotl, delve 1",
    mapSquare: { x: 20, y: 149 }, // doom-of-mokhaiotl/encounter.js
    playerStart: [31, 28], // doom-of-mokhaiotl/encounter.js (playerStart)
    collision: { mode: "auto", seed: [31, 28] }, // as doom-of-mokhaiotl/encounter.js seeds it
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 0, pitch: -45, zoom: 330 }, // doom-of-mokhaiotl/presentation.js (defaultCamera)
  },
  {
    id: "doom_deep",
    hostKind: "doom_of_mokhaiotl_deep",
    name: "Doom of Mokhaiotl, deeper room",
    mapSquare: { x: 53, y: 100 }, // doom-of-mokhaiotl/encounter.js
    playerStart: [31, 28], // doom-of-mokhaiotl/encounter.js (playerStart, both rooms)
    collision: { mode: "auto", seed: [31, 28] }, // as doom-of-mokhaiotl/encounter.js seeds it
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 0, pitch: -45, zoom: 330 }, // doom-of-mokhaiotl/presentation.js (defaultCamera)
  },
  {
    id: "duke",
    hostKind: "duke_sucellus",
    name: "Duke Sucellus' asylum",
    mapSquare: dukeMapSquare,
    playerStart: [...dukePlayerStart], // duke-sucellus/encounter.js
    collision: { mode: "auto", seed: [...dukeArenaSeed] }, // as duke-sucellus/encounter.js seeds it
    refineArena: dukeRoomArena,
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 0, pitch: -40, zoom: 240 }, // duke-sucellus/presentation.js (defaultCamera)
  },
  {
    id: "leviathan",
    hostKind: "leviathan",
    name: "The Leviathan's Scar",
    mapSquare: leviathanMapSquare,
    playerStart: [...leviathanPlayerStart], // leviathan/encounter.js
    collision: { mode: "custom" }, // leviathan/encounter.js: the bridge is not level 0
    arenaConfig: leviathanFloorArena,
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 270, pitch: -45, zoom: 330 }, // leviathan/presentation.js (defaultCamera)
  },
  {
    id: "toa_nexus",
    name: "Tombs of Amascut nexus",
    mapSquare: { x: 55, y: 80 }, // toa/nexus.js
    playerStart: [31, 26], // toa/nexus.js (start)
    collision: { mode: "auto", seed: [31, 26] }, // as toa/nexus.js seeds it
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 0, pitch: -50, zoom: 330 }, // toa/nexus.js (defaultCamera)
  },
];

const arenaById = new Map(sandboxArenas.map((arena) => [arena.id, arena]));
export const getSandboxArena = (id) => arenaById.get(id) ?? sandboxArenas[0];
export const isSandboxArenaId = (id) => arenaById.has(id);
export const getSandboxArenaOfKind = (kind) => sandboxArenas.find((arena) => sandboxVariantKind(arena.id) === kind) ?? sandboxArenas[0];
