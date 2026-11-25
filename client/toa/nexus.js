// Tombs of Amascut nexus: the room between the lobby and the path bosses.
// Terrain, objects and collision come from the cache (map square 55,80).
// Nothing fights here; the doors lead to the encounters.
import { toaMesh, toaShaderModes } from "./shader.js";

export const nexusKind = "toa_nexus";
const mapSquare = { x: 55, y: 80 };
// The middle of the room, looking north: the four paths lie ahead and to the sides.
const start = [31, 26];

// The doorways of the room. `tiles` is the footprint of the cache object as it
// stands: [x, y, width, height]. `object` is that object: [id, x, y, rotation].
// A path stays sealed until its boss exists: set `open` and the door shows its
// open state. A kind that is not registered opens the setup window as "Coming Soon".
export const nexusDoors = [
  { name: "Path of Crondis", boss: "Zebak", encounterKind: "zebak", open: true, tiles: [21, 35, 3, 3], object: [46161, 21, 35, 3], sealed: 46163 },
  { name: "Path of Scabaras", boss: "Kephri", encounterKind: "kephri", tiles: [39, 35, 3, 3], object: [46155, 39, 35, 0], sealed: 46157 },
  { name: "Path of Het", boss: "Akkha", encounterKind: "akkha", tiles: [19, 26, 2, 3], object: [46164, 19, 26, 3], sealed: 46166 },
  { name: "Path of Apmeken", boss: "Ba-Ba", encounterKind: "baba", tiles: [42, 26, 2, 3], object: [46158, 42, 26, 1], sealed: 46160 },
  // The cache places the sealed door here; its open state is object 46168.
  { name: "Tomb of the Wardens", boss: "The Wardens", encounterKind: "wardens", tiles: [28, 14, 7, 3] },
  { name: "Exit", exit: true, tiles: [29, 43, 5, 1] },
];

// A click on the door or on a tile next to it counts.
export const doorAt = ([x, y]) =>
  nexusDoors.find(({ tiles: [left, bottom, width, height] }) =>
    x >= left - 1 && x <= left + width && y >= bottom - 1 && y <= bottom + height);

const renderConfig = {
  terrainMapSquare: mapSquare,
  locRender: {
    bounds: null,
    levels: [0, 1],
    replacements: nexusDoors
      .filter((door) => door.sealed && !door.open)
      .map(({ object: [sourceLocId, localX, localY, targetRotation], sealed }) => ({
        sourceLocId, localX, localY, targetLocId: sealed, targetRotation,
      })),
  },
};

// A beam of light stands over each open door, like the one over the lobby's
// gateway. `heights[x][y]` is the terrain height in the game's units (128 a tile, negative up).
function doorBeams(heights, hsl) {
  const gold = hsl(32, 224, 150);
  const beams = toaMesh("toa-nexus-beams", 8, "read", [toaShaderModes.shaft, 0, 0, 0]);
  for (const { open, tiles: [left, bottom, width, height] } of nexusDoors) {
    if (!open) continue;
    const x = left + width / 2, y = bottom + height / 2, radius = 1.4;
    const ground = -heights[Math.floor(x)][Math.floor(y)] / 128;
    beams.sheet([x - radius, y], [x + radius, y], ground + 2.5, 14, gold, 0.55, 0);
    beams.sheet([x, y - radius], [x, y + radius], ground + 2.5, 14, gold, 0.55, 0);
  }
  return [beams.command()];
}

// `hsl(h, s, l)` packs a colour the way the renderer expects.
export const nexusPresentation = (BaseScene, hsl) => ({
  kind: nexusKind,
  renderConfig,
  sceneBuilder(context) {
    class NexusScene extends BaseScene {
      build(input, a, b) {
        const queue = super.build(input, a, b);
        if (input.options.renderMode !== "2d" && this.terrainHeights)
          queue.commands.push(...(this.beams ??= doorBeams(this.terrainHeights, hsl)));
        return queue;
      }
    }
    const scene = new NexusScene();
    scene.setEncounterRenderConfig(renderConfig);
    scene.setGroundItemLoaderSource(context.cacheManager);
    scene.setEventAudioPlayer(context.eventAudioPlayer);
    scene.setFrameSoundTracker(context.frameSoundTracker);
    return scene;
  },
  defaultCamera: { yaw: 0, pitch: -50, zoom: 330 },
});

class NexusEncounter {
  kind = nexusKind;
  reset() {}
  getSeeds() {
    return {};
  }
  getDefaultPlayerStart() {
    return [...start];
  }
  getDefaultMechanicsConfig() {
    return {};
  }
  getIntroConfig() {
    return null;
  }
  getArenaConfig() {
    return { bounds: null, collisionMap: null, walkableTiles: null };
  }
  getNpcDamageSourceLabel() {
    return "NpcAttack";
  }
  getOutcome() {
    return { phase: "active" };
  }
  getSnapshot() {
    return { kind: this.kind, state: {}, visuals: {} };
  }
  createNpcs() {
    return [];
  }
  resolveHazards() {
    return [];
  }
  processPostTick() {
    return [];
  }
}

export const nexusDefinition = {
  kind: nexusKind,
  slug: "toa",
  factory: () => new NexusEncounter(),
  descriptor: {
    kind: nexusKind,
    displayName: "Tombs of Amascut",
    description: "The nexus. Each door leads to a path boss.",
    playerStart: start,
    mapSquare,
    loadsMapLocs: true,
    collision: { mode: "auto", seed: start },
  },
  controls: { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] },
};
