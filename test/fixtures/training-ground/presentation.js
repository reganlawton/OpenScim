// What draws the fixture encounter: the default scene, with what it has to
// load. Registered by the tests only (register.mjs).
import { buildScene } from "/encounters/shared/buildScene.js";
import { trainingGroundKind, trainingGroundMapSquare, partnerNpcTypeId } from "./encounter.js";

// What the scene loads from the game cache. `attackClips` gives the animation
// of each clip id an "inferno_visual" tick event may name for this NPC type
// (the encounter emits one with clipId "attack" when the monster hits).
const renderConfig = {
  terrainMapSquare: trainingGroundMapSquare,
  spotAnimIds: [],
  preloadNpcTypes: [{ npcTypeId: partnerNpcTypeId, idleSeqId: 7595, attackClips: { attack: 7597 }, deathSeqId: 7599 }],
};

// `BaseScene` is the scene class rendering.js hands every presentation. The
// fixture draws nothing of its own, so it takes the class as it is.
export const presentation = (BaseScene) => ({
  kind: trainingGroundKind,
  renderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context),
  defaultCamera: { yaw: 180, pitch: -55, zoom: 260 },
});
