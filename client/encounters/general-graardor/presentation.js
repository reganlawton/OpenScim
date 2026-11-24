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
  // Camera yaw is in degrees: face north so the west entry wall does not hide the Standard start.
  defaultCamera: { yaw: 0, pitch: -45, zoom: 512 },
  presentation: {
    title: "General Graardor",
    tagline: "Bandos' Stronghold — Standard entry, Altar-Door red-X & 6:0 ranged kiting.",
    blurb:
      "General Graardor and his three bodyguards — Sergeant Strongstack, Sergeant Steelwill, and Sergeant Grimspike — attack together in Bandos' Stronghold. Practice standard door entry, the central Altar-Door red-X route, or the separate 6:0 ranged kiting route around the room.",
    setupContext:
      "Standard starts at the west Big door by default. Altar-Door starts on the southern red Shoot->altar tile with General Graardor aligned on the central lane. 6:0 starts on the southeast start marker with normal room spawns. Choose the matching Altar-Door or 6:0 preset in Tile Markers. Door and altar red-X interactions stall General Graardor while you are underneath him. Defeating General Graardor completes the fight.",
    wikiUrl: "https://oldschool.runescape.wiki/w/General_Graardor/Strategies",
  },
});
