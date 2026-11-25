// What draws the Leviathan: the default scene, with what it has to load. Its
// model and sequences, the pathfinder's, the orbs and the rocks are the game
// cache's (encounter.js names each). The rocks that have fallen are the loc
// they leave in the game, drawn from the fight's snapshot. The arena is a
// bridge (encounter.js): the actors stand on its level, as Zebak's do on his.
import { buildScene } from "../shared/buildScene.js";
import { bossStart, ids, leviathanKind, leviathanMapSquare, seqs, spots } from "./encounter.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// The rubble (loc 47590), turned as the rock that left it fell (OBS).
const rubbleScene = () => ({
  consumeEvents() {},
  update({ state }) {
    return (state.encounter?.state?.rubble ?? []).map(([x, y, rotation]) => {
      const id = `leviathan-rubble-${x}-${y}`;
      return {
        id, meshId: id, materialId: "osrs-npc", modelMatrix: identity, lifecycle: { kind: "sync" }, classification: "sceneMesh",
        data: { kind: "loc", locId: ids.rubble, modelType: 10, rotation, localX: x, localY: y, level: 0, seqId: -1 },
      };
    });
  },
});

const renderConfig = {
  terrainMapSquare: leviathanMapSquare,
  // The arena's walls and the Scar's rocks stand on levels 0 and 1 (CACHE).
  locRender: { bounds: null, levels: [0, 1] },
  primaryNpc: { actorId: "leviathan", npcTypeId: ids.boss, basePosition: bossStart, size: 7, deathSeqId: seqs.death },
  preloadNpcTypes: [
    {
      npcTypeId: ids.boss, idleSeqId: seqs.idle, walkSeqId: seqs.idle, deathSeqId: seqs.death, bossDeathAnimationEnabled: true,
      attackClips: {
        spawn: seqs.spawn, orbStart: seqs.orbStart, orbLoop: seqs.orbLoop, orbSingle: seqs.orbSingle, roar: seqs.roar, bite: seqs.bite,
        stunned: seqs.stunned, lightning: seqs.lightning, lightningLoop: seqs.lightningLoop, lightningEnd: seqs.lightningEnd,
        spit: seqs.spit, spitLoop: seqs.spitLoop, blast: seqs.blast,
      },
    },
    { npcTypeId: ids.pathfinder, idleSeqId: seqs.pathfinderIdle, walkSeqId: seqs.pathfinderIdle, attackClips: { spawn: seqs.pathfinderSpawn } },
  ],
  spotAnimIds: [...new Set(Object.values(spots).flatMap((value) => (typeof value === "number" ? [value] : Object.values(value))))],
  createSceneObjectController: rubbleScene,
};

// A scene whose actors, rocks and ground effects stand on the raised surface
// where the cache marks a bridge (tile render flag 2 of level 1): the fight's,
// and the sandbox's on the Scar (sandbox/presentation.js).
export const onTheBridge = (BaseScene) =>
  class extends BaseScene {
    setTerrainHeightsAndBounds(map, bounds) {
      const heights = map.tileHeights[0].map((column, x) => column.map((height, y) => (map.tileRenderFlags[1]?.[x]?.[y] & 2 ? map.tileHeights[1][x][y] : height)));
      return super.setTerrainHeightsAndBounds({ ...map, tileHeights: [heights, ...map.tileHeights.slice(1)] }, bounds);
    }
  };

export const leviathanPresentation = (BaseScene) => ({
  kind: leviathanKind,
  renderConfig,
  sceneBuilder(context) {
    return buildScene(onTheBridge(BaseScene), renderConfig, context);
  },
  // The player comes in west of the pool and looks east at it (inferred: to be
  // set in the browser).
  defaultCamera: { yaw: 270, pitch: -45, zoom: 330 },
  presentation: {
    title: "The Leviathan",
    tagline: "Desert Treasure II",
    setupContext: "The Scar",
    blurb: "Pray against its volleys of orbs and step out from under the rocks of its roars. Stun it with a shadow spell and hit its back for its specials; once enraged, keep to the pathfinder.",
    wikiUrl: "https://oldschool.runescape.wiki/w/The_Leviathan/Strategies",
    portrait: { npcTypeId: ids.boss, framing: { yaw: -20, pitch: -10, focusHeight: 0.5, span: 0.85 } },
  },
});
// How presentations.js finds it.
export { leviathanPresentation as presentation };
