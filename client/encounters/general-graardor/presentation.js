import { buildScene } from "../shared/buildScene.js";
import {
  altarDoorGraardorStart,
  generalGraardorKind,
  generalGraardorMapSquare,
  graardorActorId,
  graardorNpcTypeId,
  grimspikeNpcTypeId,
  steelwillNpcTypeId,
  strongstackNpcTypeId,
} from "./encounter.js";

const renderConfig = {
  terrainMapSquare: generalGraardorMapSquare,
  locRender: {
    bounds: null,
    levels: [0, 1],
    replacements: [
      // CACHE: loc 26503 at (47, 42) and flanking doorway frame walls 26509/26511 at (47, 41..43) are replaced with 40419 ("Big door") so the entire 3-tile doorway has a red-X clickbox.
      {
        sourceLocId: 26503,
        localX: 47,
        localY: 42,
        targetLocId: 40419,
        targetRotation: 0,
      },
      {
        sourceLocId: 26511,
        localX: 47,
        localY: 41,
        targetLocId: 40419,
        targetRotation: 0,
      },
      {
        sourceLocId: 26509,
        localX: 47,
        localY: 43,
        targetLocId: 40419,
        targetRotation: 0,
      },
    ],
  },
  primaryNpc: {
    actorId: graardorActorId,
    npcTypeId: graardorNpcTypeId,
    basePosition: altarDoorGraardorStart, // inferred: General Graardor default spawn tile
    size: 4, // CACHE, TABLE: 4x4 footprint
    deathSeqId: 7020, // CACHE: General Graardor death sequence
  },
  spotAnimIds: [
    1202, // CACHE: General Graardor ranged shockwave projectile
    1203, // CACHE: General Graardor ranged impact graphic
    1216, // CACHE: Sergeant Steelwill magic cast graphic
    1217, // CACHE: Sergeant Steelwill magic projectile
    1220, // CACHE: Sergeant Grimspike ranged projectile
  ],
  preloadNpcTypes: [
    {
      npcTypeId: graardorNpcTypeId,
      idleSeqId: 7017, // CACHE
      walkSeqId: 7016, // CACHE
      deathSeqId: 7020, // CACHE
      bossDeathAnimationEnabled: true,
      attackClips: {
        melee: 7018, // CACHE: General Graardor melee punch
        ranged: 7021, // CACHE: General Graardor ranged ground slam
        defend: 7019, // CACHE: General Graardor defend
      },
    },
    {
      npcTypeId: strongstackNpcTypeId,
      idleSeqId: 6153, // CACHE
      walkSeqId: 6152, // CACHE
      deathSeqId: 6156, // CACHE
      attackClips: {
        attack: 6154, // CACHE: Sergeant Strongstack melee attack
        defend: 6155, // CACHE
      },
    },
    {
      npcTypeId: steelwillNpcTypeId,
      idleSeqId: 6153, // CACHE
      walkSeqId: 6152, // CACHE
      deathSeqId: 6156, // CACHE
      attackClips: {
        attack: 7071, // CACHE: Sergeant Steelwill magic attack
        defend: 6155, // CACHE
      },
    },
    {
      npcTypeId: grimspikeNpcTypeId,
      idleSeqId: 6153, // CACHE
      walkSeqId: 6152, // CACHE
      deathSeqId: 6156, // CACHE
      attackClips: {
        attack: 7073, // CACHE: Sergeant Grimspike ranged attack
        defend: 6155, // CACHE
      },
    },
  ],
};

export const generalGraardorPresentation = (BaseScene) => ({
  kind: generalGraardorKind,
  renderConfig,
  sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context),
  defaultCamera: { yaw: 1024, pitch: -45, zoom: 512 },
  presentation: {
    title: "General Graardor",
    tagline: "Bandos' Stronghold — 6:0 Altar-Door kiting, standard door entry & minion tanking.",
    blurb:
      "General Graardor and his three bodyguards — Sergeant Strongstack, Sergeant Steelwill, and Sergeant Grimspike — attack together in Bandos' Stronghold. Practice the 6:0 Altar-Door red-X cycle from the altar or start at the west Big door with General Graardor at his default spawn to practice entering the room and getting into cycle.",
    setupContext:
      "Choose between Altar-Door (6:0) or Standard (Door Entry) starting positions. Both the Big door on the west wall and the Bandos altar on the north wall can be red-X clicked to pass under General Graardor without being attacked. Defeating General Graardor completes the fight immediately.",
    wikiUrl: "https://oldschool.runescape.wiki/w/General_Graardor/Strategies",
  },
});
