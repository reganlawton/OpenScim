import { buildScene } from "../shared/buildScene.js";
import { kind, mapSquare, bossId, bossStart, npcTypeId, protectionForms, arena,
  prayerTileMarkersKey, prayerTileMarkerColorKeys, tornadoTileMarkerColorKey } from "./encounter.js";

// WIKI: the final phase has eight floor-safe tiles, two centered three tiles
// in from each wall. The coordinates follow this encounter's 12x12 arena.
const middleX = [Math.floor((arena.minX + arena.maxX) / 2), Math.ceil((arena.minX + arena.maxX) / 2)];
const middleY = [Math.floor((arena.minY + arena.maxY) / 2), Math.ceil((arena.minY + arena.maxY) / 2)];
export const finalPhaseSafeTiles = [
  ...[arena.minY + 2, arena.maxY - 2].flatMap(y => middleX.map(x => [x, y])),
  ...[arena.minX + 2, arena.maxX - 2].flatMap(x => middleY.map(y => [x, y])),
];

export function withFinalPhaseSafeMarkers(input) {
  const encounterState = input.simulationState?.encounter?.state;
  const mechanicsConfig = input.simulationState?.mechanicsConfig ?? {};
  const tornadoColor = mechanicsConfig[tornadoTileMarkerColorKey] ?? "#ffffff";
  const tornadoMarkers = (encounterState?.tornadoes ?? []).map(({ position }) => ({
    x: position[0], y: position[1], color: tornadoColor, opacity: 0.8, label: "Tornado",
  }));
  const protectionColorKey = prayerTileMarkerColorKeys[encounterState?.protection];
  const protectionColor = protectionColorKey && (mechanicsConfig[protectionColorKey] ??
    ({ range: "#00ff00", magic: "#0000ff", melee: "#ff0000" })[encounterState.protection]);
  const [bossX, bossY] = input.simulationState?.npcs?.find(({ id }) => id === bossId)?.position ?? bossStart;
  const protectionLineMarkers = mechanicsConfig[prayerTileMarkersKey] && protectionColor
    ? [
      ...Array.from({ length: 5 }, (_, offset) => ({ x: bossX + offset, y: bossY, orientation: "horizontal" })),
      ...Array.from({ length: 5 }, (_, offset) => ({ x: bossX + offset, y: bossY + 5, orientation: "horizontal" })),
      ...Array.from({ length: 5 }, (_, offset) => ({ x: bossX, y: bossY + offset, orientation: "vertical" })),
      ...Array.from({ length: 5 }, (_, offset) => ({ x: bossX + 5, y: bossY + offset, orientation: "vertical" })),
    ].map(marker => ({ ...marker, color: protectionColor, opacity: 1 }))
    : [];
  if (encounterState?.phase !== 2 && tornadoMarkers.length === 0 && protectionLineMarkers.length === 0) return input;
  const options = input.options ?? {};
  return { ...input, options: { ...options, showTileMarkers: true,
      ...(protectionLineMarkers.length > 0 ? { showLineMarkers: true } : {}) },
    tileMarkers: [
      ...(options.showTileMarkers ? (input.tileMarkers ?? []) : []),
      ...tornadoMarkers,
      ...(encounterState?.phase === 2 ? finalPhaseSafeTiles.map(([x, y]) => ({ x, y, color: "#39d8b8", opacity: 0.65, label: "Safe" })) : []),
    ],
    lineMarkers: [
      ...(options.showLineMarkers ? (input.lineMarkers ?? []) : []),
      ...protectionLineMarkers,
    ] };
}

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// CACHE: corrupted staff graphics; inferred cast trajectory from the local
// Gauntlet controller. The bow uses CACHE crystal arrow 249 and hit graphic
// 250, with ordinary ranged timing (its impact use remains provisional).
const staffVisual = { attackAnimation: 1167, castSpotanim: 1722, castSpotanimHeight: 92,
  projectileId: 1723, projectileStartHeight: 43, projectileEndHeight: 31,
  projectileSlope: 15, projectileStartDelay: 23, hitSpotanim: 1724,
  hitSpotanimHeight: 60, sourceName: "Corrupted staff" };
const bowVisual = { attackAnimation: 426, castSpotanim: -1, castSpotanimHeight: 96,
  projectileId: 249, projectileStartHeight: 163, projectileEndHeight: 146,
  projectileSlope: 15, projectileStartDelay: 41, hitSpotanim: 250, hitSpotanimHeight: 144 };
const weaponVisuals = Object.fromEntries([0, 1, 2].flatMap(offset => [
  [23852 + offset, staffVisual], [23855 + offset, bowVisual], // TABLE: corrupted weapon IDs by tier
]));
const floorScene = (eventAudioPlayer) => ({
  playedEvents: new Set(),
  consumeEvents(events) {
    for (const event of events ?? []) {
      if (event.type !== "inferno_visual" || this.playedEvents.has(event.eventId)) continue;
      this.playedEvents.add(event.eventId);
      if (event.animations?.some(animation => animation.actorId === bossId &&
        (animation.clipId === "switchMagic" || animation.clipId === "switchRange")))
        eventAudioPlayer?.engine?.play(4454, { channel: "sfx" }, "hunllef-style-switch"); // WIKI: sote_hunleff_change
      if (event.animations?.some(animation => animation.actorId === bossId && animation.clipId === "tornado"))
        eventAudioPlayer?.engine?.play(4161, { channel: "sfx" }, "hunllef-tornado-summon"); // inferred: sote_hunleff_attack2 is a candidate for the special attack; confirm against a live capture
      if (event.projectiles?.some(projectile => projectile.spotAnimId === 1714))
        eventAudioPlayer?.engine?.play(134, { channel: "sfx" }, "hunllef-prayer-disable"); // WIKI: prayer-disabling sound
    }
  },
  update({ state }) {
    return (state.encounter.state.floor ?? []).map(({ x, y, state: floorState }) => {
      const id = `hunllef-floor-${x}-${y}`;
      return { id, meshId: `${id}-${floorState}`, materialId: "osrs-npc", modelMatrix: identity,
        lifecycle: { kind: "sync" }, classification: "groundDecal", style: { zOffset: 0.02, cullFace: "none" },
        data: { kind: "loc", locId: floorState === "warning" ? 36047 : 36048,
          modelType: 22, rotation: 0, localX: x, localY: y, level: 0, seqId: -1 } }; // CACHE: crimson warning, orange damage
    });
  },
});

const renderConfig = {
  terrainMapSquare: mapSquare,
  locRender: { bounds: null, levels: [0, 1, 2, 3] }, // CACHE: template exists on planes 0-3
  createSceneObjectController: floorScene,
  primaryNpc: { actorId: bossId, npcTypeId, basePosition: bossStart, size: 5, deathSeqId: 8421 }, // CACHE: Hunllef death part A
  preloadNpcTypes: [...Object.values(protectionForms).map(npcTypeId => ({ npcTypeId, idleSeqId: 8417,
    walkSeqId: 8416, deathSeqId: 8421, bossDeathAnimationEnabled: true,
    attackClips: { attack: 8419, tornado: 8418, stomp: 8420,
      switchMagic: 8754, switchRange: 8755 } })),
    { npcTypeId: 9039, attackClips: {} }], // CACHE: Hunllef sequences and corrupted tornado NPC
  spotAnimIds: [1722, 1723, 1724, 249, 250, 1712, 1708, 1714, 1710, 1716, 1718], // CACHE: weapons and Hunllef projectiles
};
export const corruptedHunllefPresentation = BaseScene => ({
  kind, renderConfig, weaponVisuals,
  sceneBuilder(context) {
    class HunllefScene extends BaseScene {
      build(input, ...rest) { return super.build(withFinalPhaseSafeMarkers(input), ...rest); }
    }
    const resolvedConfig = { ...(context?.encounterRenderConfig ?? renderConfig),
      createSceneObjectController: () => floorScene(context?.eventAudioPlayer) };
    return buildScene(HunllefScene, resolvedConfig, { ...context, encounterRenderConfig: resolvedConfig });
  },
  defaultCamera: { yaw: 180, pitch: -55, zoom: 260 },
  presentation: { title: "Corrupted Hunllef", tagline: "The Corrupted Gauntlet", wikiUrl: "https://oldschool.runescape.wiki/w/Corrupted_Hunllef" },
});
export { corruptedHunllefPresentation as presentation };
