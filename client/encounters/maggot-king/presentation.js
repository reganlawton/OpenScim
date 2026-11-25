// What draws the Maggot King: the default scene, with his sequences and his
// larvae's, the spot animations of his attacks, and the bile and carrion on
// the floor as the map objects the game uses for them (from the encounter's
// snapshot). The ids are the game cache's (ids.js).
import { buildScene } from "../shared/buildScene.js";
import { maggotKingKind, maggotKingMapSquare, bossActorId } from "./encounter.js";
import { npcTypeIds, seqIds, spotAnims, locIds, bossStart, bossSize } from "./ids.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const loc = (prefix, locId, [x, y]) => ({
  id: `${prefix}-${x}-${y}`,
  meshId: `${prefix}-${x}-${y}`,
  materialId: "osrs-npc",
  modelMatrix: identity,
  lifecycle: { kind: "sync" },
  classification: "groundDecal",
  data: { kind: "loc", locId, modelType: 10, rotation: (x * 7 + y) % 4, localX: x, localY: y, level: 0, seqId: -1 },
});
const floorObjects = () => ({
  consumeEvents() {},
  update({ state }) {
    const lair = state.encounter.state;
    return [
      ...(lair.poisonBile ?? []).map((tile) => loc("maggot-poison", locIds.poisonBile, tile)),
      ...(lair.stickyBile ?? []).map((tile) => loc("maggot-sticky", locIds.stickyBile, tile)),
      ...(lair.carrion ?? []).map((tile) => loc("maggot-carrion", locIds.carrion, tile)),
    ];
  },
});

const renderConfig = {
  terrainMapSquare: maggotKingMapSquare,
  primaryNpc: { actorId: bossActorId, npcTypeId: npcTypeIds.king, basePosition: bossStart, size: bossSize, deathSeqId: seqIds.death },
  createSceneObjectController: floorObjects,
  spotAnimIds: [...new Set(Object.values(spotAnims))],
  preloadNpcTypes: [
    {
      npcTypeId: npcTypeIds.king,
      idleSeqId: seqIds.idle,
      walkSeqId: seqIds.walk,
      attackClips: { range: seqIds.ranged, magic: seqIds.magic, screech: seqIds.screech, slam: seqIds.slam },
      deathSeqId: seqIds.death,
      bossDeathAnimationEnabled: true,
    },
    {
      npcTypeId: npcTypeIds.larva,
      idleSeqId: seqIds.larvaIdle,
      walkSeqId: seqIds.larvaWalk,
      attackClips: { flight: seqIds.larvaFlight, death: seqIds.larvaDeath },
      deathSeqId: seqIds.larvaDeath,
    },
  ],
};

export const presentation = (BaseScene) => ({
  kind: maggotKingKind,
  renderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context),
  // He is north of the floor: the camera looks north, over the player's shoulder.
  defaultCamera: { yaw: 0, pitch: -40, zoom: 380 },
  presentation: {
    title: "Maggot King",
    tagline: "Vampyrium",
    blurb: "Spits, screeches, bile and carrion, larvae, and head slams once he is close.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Maggot_King",
    portrait: { npcTypeId: npcTypeIds.king, framing: { yaw: -30, pitch: -12, focusHeight: 0.6, span: 0.7 } },
  },
});
