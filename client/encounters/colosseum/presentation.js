// What draws the waves of the Colosseum: the default scene, with what it has
// to load, the molten sand, and the dialog in which a modifier is chosen.
// Sol Heredit's fight has a scene of its own in client/assets/rendering.js;
// the waves do without it (visuals.js says how the warband's attacks reach
// the default scene).
import { buildScene } from "../shared/buildScene.js";
import { colosseumAudio } from "./audio.js";
import { colosseumSeqIds, colosseumSpotAnimIds, healingTotemNpcTypeId, warbandArcherNpcTypeId, warbandBerserkerNpcTypeId, warbandSeerNpcTypeId } from "../sol-heredit/constants.js";
import { colosseumKind, colosseumMapSquare, colosseumMonsters, colosseumWaveSpotAnimIds, minimus, moltenSandLocId, modifierNpcTypeIds } from "./constants.js";
import { setOfferSoundPlayer, syncOfferDialog } from "./intermission.js";
import { explosionSpotAnimIds } from "./modifierEffects.js";
import { getOverlaySetting, overlayKeys } from "./controls.js";
import { syncOverlays, withOverlayMarkers } from "./overlays.js";
import { thrallSpells } from "../../engine/thralls.js";

const warbandSeqIds = colosseumSeqIds.warband;
// The width of every health bar of the waves, in the scene's measure, in
// which 40 is the game's ordinary bar: 30 pixels, or the 40 of RuneLite's
// high detail sprite. OBS: the game gave a bar 30 wide (RuneLite's health
// scale) to the warband, the serpent shaman, the jaguar warrior, the javelin
// colossus and the manticore, of every size. The scene would go by size
// (60 for two tiles, 80 for three). inferred: the shockwave colossus, the
// minotaur and the modifiers' actors are the same.
const healthBarWidth = 40;
// The identity: a map object is placed by its tile, not by a matrix.
const identityMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// The molten sand of the modifiers Reentry and Volatility: the game's own
// object on every tile the encounter's snapshot names (`state.sand`), drawn
// as Zebak's acid is (client/toa/zebak/phases.js).
const sandScene = () => ({
  consumeEvents() {},
  update({ state }) {
    return (state.encounter.state.sand ?? []).map(([x, y]) => {
      const id = `colosseum-sand-${x}-${y}`;
      return {
        id,
        meshId: id,
        materialId: "osrs-npc",
        modelMatrix: identityMatrix,
        lifecycle: { kind: "sync" },
        classification: "groundDecal",
        data: { kind: "loc", locId: moltenSandLocId, modelType: 10, rotation: 0, localX: x, localY: y, level: 0, seqId: -1 },
      };
    });
  },
});

// What the scene loads from the game cache. `attackClips` gives the sequence
// of each clip id a visual event may name for an NPC type: a monster's own
// module names its clips, the warband's definition "attack" and "defend",
// and the encounter "spawn" as a monster appears.
const renderConfig = {
  terrainMapSquare: colosseumMapSquare,
  // As in Sol Heredit's render config: the arena's walls and stands are on
  // the three lowest levels of the map square.
  locRender: { bounds: null, levels: [0, 1, 2] },
  createSceneObjectController: sandScene,
  spotAnimIds: [
    ...colosseumWaveSpotAnimIds,
    colosseumSpotAnimIds.warbandArrow,
    colosseumSpotAnimIds.warbandFireblast,
    colosseumSpotAnimIds.fireblastImpact,
    colosseumSpotAnimIds.totemProjectile,
    colosseumSpotAnimIds.totemImpact,
    ...Object.values(explosionSpotAnimIds),
    // The thralls' (client/engine/thralls.js): the cast on the player, the projectiles, the ghost's impact.
    ...Object.values(thrallSpells).flatMap((spell) => [spell.castSpotAnimId, spell.projectile?.spotAnimId, spell.impactSpotAnimId].filter((id) => id !== undefined)),
  ],
  preloadNpcTypes: [
    ...Object.values(colosseumMonsters).map((monster) => ({
      healthBarWidth,
      npcTypeId: monster.npcTypeId,
      idleSeqId: monster.idleSeqId,
      attackClips: monster.clips,
      deathSeqId: monster.deathSeqId,
    })),
    ...[
      [warbandBerserkerNpcTypeId, warbandSeqIds.berserker],
      [warbandArcherNpcTypeId, warbandSeqIds.archer],
      [warbandSeerNpcTypeId, warbandSeqIds.seer],
    ].map(([npcTypeId, seqIds]) => ({
      npcTypeId,
      healthBarWidth,
      idleSeqId: seqIds.idle,
      attackClips: { attack: seqIds.attack, defend: seqIds.defend, spawn: warbandSeqIds.spawn },
      deathSeqId: seqIds.death,
    })),
    { npcTypeId: minimus.npcTypeId, idleSeqId: minimus.idleSeqId, attackClips: { spawn: minimus.spawnSeqId } },
    // The modifiers' actors, with Sol Heredit's sequences for them.
    { npcTypeId: modifierNpcTypeIds.bees, healthBarWidth, idleSeqId: colosseumSeqIds.bees.idle, attackClips: { spawn: colosseumSeqIds.bees.spawn, attack: colosseumSeqIds.bees.attack }, deathSeqId: colosseumSeqIds.bees.despawn },
    { npcTypeId: healingTotemNpcTypeId, healthBarWidth, idleSeqId: colosseumSeqIds.totem.idle, attackClips: { attack: colosseumSeqIds.totem.attack } },
    { npcTypeId: modifierNpcTypeIds.solarflare, healthBarWidth, idleSeqId: colosseumSeqIds.solarflare.idle, attackClips: {} },
    // The player's thralls, which the engine hands the scene as NPCs.
    ...Object.values(thrallSpells).map((spell) => ({
      npcTypeId: spell.npcTypeId,
      idleSeqId: spell.idleSeqId,
      attackClips: { attack: spell.attackSeqId },
    })),
  ],
};

export const colosseumPresentation = (BaseScene) => ({
  kind: colosseumKind,
  renderConfig,
  sceneBuilder(context) {
    // Every frame the interface is brought in step with what Minimus offers
    // and the overlays with the run; what the overlays mark on the ground
    // goes to the scene with the frame's own markers.
    class ColosseumScene extends BaseScene {
      build(input, ...rest) {
        const simulationState = input.simulationState;
        syncOfferDialog(simulationState?.encounter?.state?.offer ?? null, getOverlaySetting(simulationState?.mechanicsConfig, overlayKeys.modifierNames) === true);
        syncOverlays(simulationState);
        return super.build(withOverlayMarkers(input), ...rest);
      }
      // The application drops a scene when the player goes elsewhere: the
      // interface and the panels, which are the page's and not the scene's,
      // go with it.
      dispose(...rest) {
        syncOfferDialog(null);
        syncOverlays(null);
        return super.dispose?.(...rest);
      }
    }
    // The interface's own sounds are played at once, not as a tick's events
    // are: by the audio engine that the player of those events holds.
    setOfferSoundPlayer((soundId) => context?.eventAudioPlayer?.engine?.play(soundId, { channel: "sfx" }, "colosseum-interface"));
    return buildScene(ColosseumScene, renderConfig, context);
  },
  // From the west wall looking east, where no pillar stands between the
  // camera and a player on the start tile. The pitch and the zoom were
  // chosen by looking.
  defaultCamera: { yaw: 270, pitch: -60, zoom: 300 },
  // The sounds the game's server sends; those of the animations' frames are the cache's.
  audio: colosseumAudio,
  presentation: {
    title: "Fortis Colosseum",
    tagline: "The waves before Sol Heredit",
    setupContext: "Waves",
    blurb: "Fight the waves of the Fortis Colosseum: the Fremennik warband at your sides, the monsters of the wave, and the reinforcements after 40 seconds. Minimus offers a modifier before every wave.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Fortis_Colosseum/Strategies",
  },
});
// How presentations.js finds it.
export { colosseumPresentation as presentation };
