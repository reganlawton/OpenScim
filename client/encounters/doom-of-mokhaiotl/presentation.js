// What draws the Doom of Mokhaiotl: the default scene, with the sequences of
// the boss and his room's NPCs, the spot animations of his attacks, and the
// acid pools and rocks as map objects (from the encounter's snapshot). The
// ids are the game cache's (RuneLite's gameval names: DOM_*, VFX_*).
import { buildScene } from "../shared/buildScene.js";
import { doomKind, doomMapSquare, doomDeepKind, doomDeepMapSquare, bossActorId } from "./encounter.js";
import { npcTypeIds, seqIds, spotAnims, locIds, bossStart, bossSize } from "./delves.js";

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
const roomObjects = () => ({
  consumeEvents() {},
  update({ state }) {
    const room = state.encounter.state;
    return [...(room.acid ?? []).map((tile) => loc("doom-acid", locIds.acid, tile)), ...(room.rocks ?? []).map((tile) => loc("doom-rock", locIds.rock, tile))];
  },
});

const larva = (npcTypeId) => ({ npcTypeId, idleSeqId: seqIds.larvaCrawl, walkSeqId: seqIds.larvaCrawl, attackClips: { spawn: seqIds.larvaSpawn }, deathSeqId: seqIds.larvaDeath });

const renderConfig = {
  terrainMapSquare: doomMapSquare,
  primaryNpc: { actorId: bossActorId, npcTypeId: npcTypeIds.doom, basePosition: bossStart, size: bossSize, deathSeqId: seqIds.despawn },
  createSceneObjectController: roomObjects,
  spotAnimIds: [...new Set(Object.values(spotAnims).flatMap((value) => (typeof value === "number" ? [value] : Object.values(value))))],
  preloadNpcTypes: [
    {
      npcTypeId: npcTypeIds.doom,
      idleSeqId: seqIds.idle,
      attackClips: {
        orb: seqIds.orb, rockThrow: seqIds.rockThrow, tongue: seqIds.tongue, emerge: seqIds.emerge,
        beamCharge: seqIds.beamCharge, beamLoop: seqIds.beamLoop, beamCancel: seqIds.beamCancel, beamFire: seqIds.beamFire,
        areaCharge: seqIds.areaCharge, areaLoop: seqIds.areaLoop, areaSlam: seqIds.areaSlam, areaReturn: seqIds.areaReturn,
      },
      deathSeqId: seqIds.despawn,
      bossDeathAnimationEnabled: true,
    },
    larva(npcTypeIds.larva),
    larva(npcTypeIds.rangedLarva),
    larva(npcTypeIds.magicLarva),
    larva(npcTypeIds.meleeLarva),
    { npcTypeId: npcTypeIds.volatileEarth, idleSeqId: seqIds.earthIdle, attackClips: { spawn: seqIds.earthSpawn, death: seqIds.earthDeath }, deathSeqId: seqIds.earthPop },
    { npcTypeId: npcTypeIds.earthenShield, idleSeqId: seqIds.shieldIdle, walkSeqId: seqIds.shieldIdle, attackClips: { spawn: seqIds.shieldSpawn }, deathSeqId: seqIds.shieldDeath },
  ],
};

export const doomPresentation = (BaseScene) => ({
  kind: doomKind,
  renderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context),
  defaultCamera: { yaw: 0, pitch: -45, zoom: 330 },
  presentation: {
    title: "Doom of Mokhaiotl",
    tagline: "Ruins of Mokhaiotl",
    blurb: "Delves 1 to 8. Orbs, rocks, larvae, shockwaves, acid and the demonic shield.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Doom_of_Mokhaiotl",
    portrait: { npcTypeId: npcTypeIds.doom, framing: { yaw: -30, pitch: -12, focusHeight: 0.6, span: 0.7 } },
  },
});

// Delves 2 to 8: the same, drawn on the deeper room's map square.
const deepRenderConfig = { ...renderConfig, terrainMapSquare: doomDeepMapSquare };
export const doomDeepPresentation = (BaseScene) => ({
  ...doomPresentation(BaseScene),
  kind: doomDeepKind,
  renderConfig: deepRenderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, deepRenderConfig, context),
});
// How presentations.js finds them. The deeper room's after the Doom's own: its kind takes this one.
export const presentations = [doomPresentation, doomDeepPresentation];
