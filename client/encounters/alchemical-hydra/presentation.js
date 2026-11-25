// What draws the Alchemical Hydra: the default scene, with each of its forms
// and their sequences, the spot animations of its attacks and specials, and
// its vents erupting (the map's vents, drawn again with the eruption's
// sequence while it lasts, from the encounter's snapshot). The ids are the
// game cache's (ids.js).
import { buildScene } from "../shared/buildScene.js";
import { alchemicalHydraAudio } from "./audio.js";
import { alchemicalHydraKind, alchemicalHydraMapSquare, bossActorId } from "./encounter.js";
import { npcTypeIds, seqIds, spotAnims, ventLocIds, geyserSeqIds, vents, bossStart, bossSize } from "./ids.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// CACHE: a vent is a loc of shape 10, unturned, on its tile.
const geyser = (colour, [x, y], eruptedAt) => ({
  id: `hydra-geyser-${colour}-${eruptedAt}`,
  meshId: `hydra-geyser-${colour}`,
  materialId: "osrs-npc",
  modelMatrix: identity,
  lifecycle: { kind: "sync" },
  classification: "sceneMesh",
  data: { kind: "loc", locId: ventLocIds[colour], modelType: 10, rotation: 0, localX: x, localY: y, level: 0, seqId: geyserSeqIds.erupt, animationStartTick: eruptedAt },
});
const ventScene = () => ({
  consumeEvents() {},
  update({ state }) {
    const chamber = state.encounter?.state;
    if (!chamber?.erupting) return [];
    return Object.entries(vents).map(([colour, tile]) => geyser(colour, tile, chamber.eruptedAt));
  },
});

// A form that fights, phase 0 to 3; a form it passes through as a head falls (CACHE: those have no stand of their
// own: inferred, the stand of the form before).
const form = (npcTypeId, phase) => ({
  npcTypeId,
  idleSeqId: seqIds.idle[phase],
  walkSeqId: seqIds.walk[phase],
  deathSeqId: phase === 3 ? seqIds.death : seqIds.phaseOut[phase], // inferred: killed before the last form, it plays the fall of a head
  bossDeathAnimationEnabled: true,
  attackClips: {
    range: seqIds.ranged[phase],
    magic: seqIds.magic[phase],
    special: seqIds.special[phase],
    ...(phase < 3 ? { switch: seqIds.switch[phase] } : {}),
    ...(phase > 0 ? { phaseIn: seqIds.phaseIn[phase - 1] } : {}),
  },
});
const change = (npcTypeId, phase) => ({
  npcTypeId,
  idleSeqId: seqIds.idle[phase],
  walkSeqId: seqIds.walk[phase],
  deathSeqId: seqIds.phaseOut[phase],
  bossDeathAnimationEnabled: true,
  attackClips: { phaseOut: seqIds.phaseOut[phase] },
});

// Its last form. It only plays its death, and holds its last frame: as a stand that loops its frame step (CACHE: one
// frame), which a replay taken up in the middle shows too.
const lastForm = {
  npcTypeId: npcTypeIds.dead,
  idleSeqId: seqIds.finalDeath,
  idlePlayMode: "loopFrameStep",
  walkSeqId: seqIds.finalDeath,
  attackClips: { finalDeath: seqIds.finalDeath },
};

const renderConfig = {
  terrainMapSquare: alchemicalHydraMapSquare,
  primaryNpc: { actorId: bossActorId, npcTypeId: npcTypeIds.serpentine, basePosition: bossStart, size: bossSize, deathSeqId: seqIds.death },
  preloadNpcTypes: [
    form(npcTypeIds.serpentine, 0),
    change(npcTypeIds.toElectric, 0),
    form(npcTypeIds.electric, 1),
    change(npcTypeIds.toFlame, 1),
    form(npcTypeIds.flame, 2),
    change(npcTypeIds.toEnraged, 2),
    form(npcTypeIds.enraged, 3),
    lastForm,
  ],
  spotAnimIds: [...new Set(Object.values(spotAnims).flat())],
  createSceneObjectController: ventScene,
};

export const alchemicalHydraPresentation = (BaseScene) => ({
  kind: alchemicalHydraKind,
  renderConfig,
  // The scene draws an NPC as the type it was first drawn as: when the Hydra takes another form, the old one is taken
  // away and drawn again as the new. Dead, it is drawn dying as the type it died as (the scene's dying instances) until
  // it takes its last form; that one is handed to the scene as if it stood, for a dead boss gets no new type.
  sceneBuilder(context) {
    class HydraScene extends BaseScene {
      syncNpcInstances(npcs, ...rest) {
        const { instanceRegistry, dyingInstances } = this.npcInstanceManager;
        const lastFormLoaded = this.isNpcTypeLoaded(npcTypeIds.dead);
        const shown = npcs?.map((npc) => (!npc.alive && npc.npcTypeId === npcTypeIds.dead && lastFormLoaded ? { ...npc, alive: true } : npc));
        for (const npc of shown ?? []) {
          const id = this.getNpcRenderInstanceId(npc.id);
          const drawn = instanceRegistry.get(id) ?? dyingInstances.get(id)?.instance;
          if (drawn && drawn.npcTypeId !== npc.npcTypeId && this.isNpcTypeLoaded(npc.npcTypeId)) this.npcInstanceManager.removeInstance(id);
        }
        return super.syncNpcInstances(shown, ...rest);
      }
    }
    return buildScene(HydraScene, renderConfig, context);
  },
  audio: alchemicalHydraAudio,
  // The player comes in at the west door, south-west of it: looking north, neither the west wall nor the south one is
  // between him and the camera, and the Hydra is in view (inferred: set in the browser).
  defaultCamera: { yaw: 0, pitch: -55, zoom: 340 },
  presentation: {
    title: "Alchemical Hydra",
    tagline: "Karuulm Slayer Dungeon",
    setupContext: "The Alchemical Hydra's chamber",
    blurb: "Switch prayers every three attacks and lure it over the vent that breaks its shield. Dodge its poison, its lightning and its fire, then outlast its enrage.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Alchemical_Hydra/Strategies",
    portrait: { npcTypeId: npcTypeIds.serpentine, framing: { yaw: -30, pitch: -12, focusHeight: 0.55, span: 0.8 } },
  },
});
// How presentations.js finds it.
export { alchemicalHydraPresentation as presentation };
