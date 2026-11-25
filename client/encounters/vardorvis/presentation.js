// What draws Vardorvis: the default scene, with what it has to load, and the
// strangle's overlay (strangle.js) brought in step with the fight every frame;
// and the head's sounds that are in no animation (audio.js).
import { buildScene } from "../shared/buildScene.js";
import { bossStart, ids, seqs, spots, vardorvisKind, vardorvisMapSquare } from "./encounter.js";
import { disposeStrangle, setStrangleTools, syncStrangle } from "./strangle.js";
import { drawHulls, removeHulls, withHighlights } from "./highlights.js";
import { vardorvisAudio } from "./audio.js";

const renderConfig = {
  terrainMapSquare: vardorvisMapSquare,
  locRender: { bounds: null, levels: [0, 1] },
  primaryNpc: { actorId: "vardorvis", npcTypeId: ids.boss, basePosition: bossStart, size: 2, deathSeqId: seqs.death },
  preloadNpcTypes: [
    {
      npcTypeId: ids.boss, idleSeqId: seqs.idle, walkSeqId: seqs.walk, deathSeqId: seqs.death, bossDeathAnimationEnabled: true,
      attackClips: { attack: seqs.melee, dash: seqs.dash, strangleStart: seqs.strangleStart, strangleHold: seqs.strangleHold, strangleEnd: seqs.strangleEnd },
    },
    { npcTypeId: ids.tendril, idleSeqId: seqs.tendrilIdle, attackClips: { rise: seqs.tendrilRise, windup: seqs.tendrilWindup } },
    { npcTypeId: ids.axe, idleSeqId: seqs.axeSpin, walkSeqId: seqs.axeSpin, attackClips: {} },
    { npcTypeId: ids.head, idleSeqId: seqs.headScream, attackClips: { scream: seqs.headScream } },
  ],
  spotAnimIds: [...Object.values(spots), 2516, 2517, 2518],
};

export const vardorvisPresentation = (BaseScene, packHsl, { widgetModelView } = {}) => ({
  kind: vardorvisKind,
  renderConfig,
  sceneBuilder(context) {
    class VardorvisScene extends BaseScene {
      // The renderer hands the scene its loaders here; the overlay draws its models with them.
      loadNpcType(npcTypeId, npcModelLoader, animationSystem, ...rest) {
        setStrangleTools({ npcModelLoader, animationSystem });
        return super.loadNpcType(npcTypeId, npcModelLoader, animationSystem, ...rest);
      }
      // `camera` is the application's (the one its hit test projects with).
      build(input, camera, ...rest) {
        const simulationState = input.simulationState;
        syncStrangle(simulationState?.encounter?.state?.strangle ?? null, simulationState?.currentTick ?? 0);
        const queue = super.build(withHighlights(input), camera, ...rest);
        drawHulls(this, camera, simulationState?.npcs);
        return queue;
      }
      // The overlay is the page's, not the scene's: it goes when the scene does.
      dispose(...rest) {
        disposeStrangle();
        removeHulls();
        return super.dispose?.(...rest);
      }
    }
    setStrangleTools({ widgetModelView, playSound: (soundId) => context?.eventAudioPlayer?.engine?.play(soundId, { channel: "sfx" }, "vardorvis-strangle") });
    return buildScene(VardorvisScene, renderConfig, context);
  },
  audio: vardorvisAudio,
  defaultCamera: { yaw: 180, pitch: -45, zoom: 320 },
  presentation: {
    title: "Vardorvis",
    tagline: "Desert Treasure II",
    setupContext: "The Stranglewood",
    blurb: "Swinging axes, the head's gaze, darting spikes and the strangle. He heals on every hit.",
    wikiUrl: "https://oldschool.runescape.wiki/w/Vardorvis/Strategies",
    portrait: { npcTypeId: ids.boss, framing: { yaw: -30, pitch: -12, focusHeight: 0.6, span: 0.7 } },
  },
});
// How presentations.js finds it.
export { vardorvisPresentation as presentation };
