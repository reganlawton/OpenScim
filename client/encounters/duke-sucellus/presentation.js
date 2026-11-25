// What draws Duke Sucellus: the default scene, with what it has to load. His
// model and sequences, the vents' gas and his projectiles are the game
// cache's (encounter.js names each). The scene adds the gaze's eye to his
// model and draws him as the sleeping NPC type until he has woken; the gaze's
// overlay (sight.js) is brought in step with the fight every frame.
import { buildScene } from "../shared/buildScene.js";
import { dukeAudio } from "./audio.js";
import { bossStart, dukeKind, dukeMapSquare, ids, models, seqs, sightStrength, sightTint, spots, wakeAnimationTicks } from "./encounter.js";
import { setSightTools, syncSight } from "./sight.js";

// The two types share their model, so the one that wakes has the wake and the
// death of the other.
const typeClips = { deathSeqId: seqs.death, bossDeathAnimationEnabled: true };

const renderConfig = {
  terrainMapSquare: dukeMapSquare,
  // The asylum's walls and the extremities' corridors stand on levels 0 and 1 (CACHE).
  locRender: { bounds: null, levels: [0, 1] },
  primaryNpc: { actorId: "duke-sucellus", npcTypeId: ids.boss, basePosition: bossStart, size: 7, deathSeqId: seqs.death },
  preloadNpcTypes: [
    { npcTypeId: ids.asleep, idleSeqId: seqs.sleep, walkSeqId: seqs.sleep, ...typeClips, attackClips: { wake: seqs.wake } },
    {
      npcTypeId: ids.boss, idleSeqId: seqs.idle, walkSeqId: seqs.idle, ...typeClips,
      attackClips: { wake: seqs.wake, melee: seqs.melee, magic: seqs.magic, gas: seqs.gas, gaze: seqs.gaze },
    },
  ],
  spotAnimIds: [...new Set(Object.values(spots).flat())],
};

// `npcModelLoader` with the eye among the models of his awake type. A loader
// of its own, so that nothing else that loads him (his portrait) has it.
function withGazeEye(npcModelLoader) {
  return Object.create(npcModelLoader, {
    loadNpcType: {
      value(npcTypeId) {
        const type = npcModelLoader.loadNpcType(npcTypeId);
        if (!type || npcTypeId !== ids.boss) return type;
        return Object.assign(Object.create(Object.getPrototypeOf(type)), type, { modelIds: [...type.modelIds, models.gazeEye] });
      },
    },
  });
}

// CACHE: the pillars (locs 47513 and 47523) end in a black cap and fade into it
// down their sides, through black faces in the very planes of the stone's. The
// game draws those last, by their priority; drawn by depth they flicker with
// the stone, so they are drawn a little nearer (the models' `faceBias`).
const fadingPillars = new Set([48738, 48751]);
const black = 0;
function withFadesInFront(locModelLoader) {
  return Object.create(locModelLoader, {
    modelDataCache: { value: new Map() },
    modelLoader: {
      value: Object.create(locModelLoader.modelLoader, {
        getModel: {
          value(modelId) {
            const model = locModelLoader.modelLoader.getModel(modelId);
            if (!model) return model;
            // The map's objects are one mesh, which has the bias if all of them do; -1 is none.
            model.faceBias ??= new Int8Array(model.faceCount).fill(-1);
            if (fadingPillars.has(modelId)) for (let face = 0; face < model.faceCount; face++) if (model.faceColors[face] === black) model.faceBias[face] = 1;
            return model;
          },
        },
      }),
    },
  });
}

export const dukePresentation = (BaseScene, packHsl, { widgetModelView } = {}) => ({
  kind: dukeKind,
  renderConfig,
  sceneBuilder(context) {
    class DukeScene extends BaseScene {
      // The renderer hands the scene its loaders here; the overlay draws its model with them.
      loadNpcType(npcTypeId, npcModelLoader, animationSystem, ...rest) {
        setSightTools({ widgetModelView, npcModelLoader, animationSystem });
        return super.loadNpcType(npcTypeId, withGazeEye(npcModelLoader), animationSystem, ...rest);
      }
      build(input, ...rest) {
        const queue = super.build(input, ...rest);
        const sight = input.simulationState?.encounter?.state?.sight;
        syncSight(sightStrength(sight, this.primaryCycle), sightTint(sight, this.primaryCycle));
        return queue;
      }
      // The overlay is the page's, not the scene's: it goes when the scene does.
      dispose(...rest) {
        syncSight(0);
        return super.dispose?.(...rest);
      }
      loadLocs(locModelLoader, ...rest) {
        return super.loadLocs(withFadesInFront(locModelLoader), ...rest);
      }
      syncNpcInstances(npcs, hidden, state, ...rest) {
        // Asleep, or the wake sequence still playing on the sleeping type.
        const wakeTick = state?.encounter?.state?.wakeTick;
        const asleep = wakeTick === null || state?.currentTick < wakeTick + wakeAnimationTicks;
        const drawnNpcs = !asleep || !this.isNpcTypeLoaded(ids.asleep) ? npcs : npcs.map((npc) => (npc.npcTypeId === ids.boss ? { ...npc, npcTypeId: ids.asleep } : npc));
        // A drawn NPC keeps the type it was made with: when that changes, it is made again.
        for (const npc of drawnNpcs) {
          const id = this.getNpcRenderInstanceId(npc.id);
          const drawn = this.npcInstanceManager.instanceRegistry.get(id);
          if (drawn && drawn.npcTypeId !== npc.npcTypeId && this.isNpcTypeLoaded(npc.npcTypeId)) this.npcInstanceManager.removeInstance(id);
        }
        return super.syncNpcInstances(drawnNpcs, hidden, state, ...rest);
      }
    }
    return buildScene(DukeScene, renderConfig, context);
  },
  audio: dukeAudio,
  // He is north of the player and 7 tiles wide: from the south, looking north at him, further out than Vardorvis's.
  defaultCamera: { yaw: 0, pitch: -40, zoom: 240 },
  presentation: {
    title: "Duke Sucellus",
    tagline: "Desert Treasure II",
    setupContext: "Ghorrock Prison",
    blurb: "Icicles and a slam beside him, magic away from him. Hide behind a pillar from his gaze, and step out of the gas he spits at the vents.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Duke_Sucellus/Strategies",
    portrait: { npcTypeId: ids.boss, framing: { yaw: -20, pitch: -10, focusHeight: 0.55, span: 0.8 } },
  },
});
// How presentations.js finds it.
export { dukePresentation as presentation };
