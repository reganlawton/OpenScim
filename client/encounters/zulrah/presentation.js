// Zulrah presentation: loads Zulrah's Shrine terrain, Zulrah forms, Snakelings, safe-tile markers, and coach overlay.
import { buildScene } from "../shared/buildScene.js";
import {
  zulrahActorId,
  zulrahCenterStart,
  zulrahKind,
  zulrahMapSquare,
  zulrahMapSquareOffsets,
  zulrahNpcIds,
  zulrahSeqIds,
  zulrahSpotIds,
  zulrahTrainingOverlayKey,
} from "./encounter.js";

const zulrahClips = {
  shoot: zulrahSeqIds.shoot,
  submerge: zulrahSeqIds.submerge,
  emerge: zulrahSeqIds.emerge,
  meleeFocus: zulrahSeqIds.meleeFocus,
  meleeAttack: zulrahSeqIds.meleeAttack,
};

const renderConfig = {
  terrainMapSquare: zulrahMapSquare,
  mapSquareOffsets: zulrahMapSquareOffsets,
  locRender: { bounds: null, levels: [0, 1] },
  primaryNpc: {
    actorId: zulrahActorId,
    npcTypeId: zulrahNpcIds.serpentine,
    basePosition: zulrahCenterStart,
    size: 5,
    deathSeqId: zulrahSeqIds.submerge,
  },
  spotAnimIds: [
    zulrahSpotIds.rangedProjectile,
    zulrahSpotIds.toxicCloud,
    zulrahSpotIds.magicProjectile,
    zulrahSpotIds.snakelingSpawn,
  ],
  preloadNpcTypes: [
    {
      npcTypeId: zulrahNpcIds.serpentine,
      idleSeqId: zulrahSeqIds.idle,
      attackClips: zulrahClips,
      deathSeqId: zulrahSeqIds.submerge,
      bossDeathAnimationEnabled: true,
    },
    {
      npcTypeId: zulrahNpcIds.magma,
      idleSeqId: zulrahSeqIds.idle,
      attackClips: zulrahClips,
      deathSeqId: zulrahSeqIds.submerge,
      bossDeathAnimationEnabled: true,
    },
    {
      npcTypeId: zulrahNpcIds.tanzanite,
      idleSeqId: zulrahSeqIds.idle,
      attackClips: zulrahClips,
      deathSeqId: zulrahSeqIds.submerge,
      bossDeathAnimationEnabled: true,
    },
    {
      npcTypeId: zulrahNpcIds.snakelingMelee,
      idleSeqId: 2405,
      attackClips: { attack: 2414 },
      deathSeqId: 2407,
    },
    {
      npcTypeId: zulrahNpcIds.snakelingMagic,
      idleSeqId: 2405,
      attackClips: { attack: 2414 },
      deathSeqId: 2407,
    },
  ],
};

const FORM_COLORS = {
  serpentine: "#4ade80",
  magma: "#f87171",
  tanzanite: "#60a5fa",
};

const FORM_LABELS = {
  serpentine: "Serpentine (Range)",
  magma: "Magma (Melee)",
  tanzanite: "Tanzanite (Mage)",
};

let coachElement = null;

function removeCoachOverlay() {
  coachElement?.remove();
  coachElement = null;
}

function syncCoachOverlay(state, enabled) {
  if (!enabled || !state) {
    removeCoachOverlay();
    return;
  }
  const viewport = document.querySelector(".scene-viewport");
  if (!viewport) return;

  if (!coachElement || !viewport.contains(coachElement)) {
    removeCoachOverlay();
    coachElement = document.createElement("div");
    coachElement.style.cssText =
      "position:absolute;top:12px;left:12px;z-index:20;pointer-events:none;" +
      "background:rgba(12,14,18,0.82);border:1px solid rgba(255,255,255,0.14);" +
      "border-radius:8px;padding:8px 12px;color:#e5e7eb;font:12px/1.45 system-ui,sans-serif;" +
      "max-width:340px;backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    viewport.appendChild(coachElement);
  }

  const formColor = FORM_COLORS[state.form] ?? "#e5e7eb";
  const nextColor = FORM_COLORS[state.nextForm] ?? "#9ca3af";
  const formLabel = FORM_LABELS[state.form] ?? state.form;
  const nextLabel = FORM_LABELS[state.nextForm] ?? state.nextForm;

  coachElement.replaceChildren();

  const header = document.createElement("div");
  header.style.cssText = "font-weight:600;margin-bottom:2px;";
  header.textContent = `Rotation ${state.rotation} · Phase ${state.phaseIndex + 1}/${state.phaseCount} · `;
  const formSpan = document.createElement("span");
  formSpan.style.color = formColor;
  formSpan.textContent = formLabel;
  header.appendChild(formSpan);

  if (state.phaseState === "submerging" || state.phaseState === "emerging" || state.pendingClouds?.length) {
    const statusSpan = document.createElement("span");
    statusSpan.style.marginLeft = "6px";
    statusSpan.style.fontSize = "11px";
    if (state.phaseState === "submerging") {
      statusSpan.style.color = "#fbbf24";
      statusSpan.textContent = "(Diving...)";
    } else if (state.phaseState === "emerging") {
      statusSpan.style.color = "#38bdf8";
      statusSpan.textContent = "(Surfacing...)";
    } else {
      statusSpan.style.color = "#a3e635";
      statusSpan.textContent = "(Venom incoming!)";
    }
    header.appendChild(statusSpan);
  }

  const hint = document.createElement("div");
  hint.style.cssText = "color:#f3f4f6;margin-bottom:4px;";
  hint.textContent = state.meleeTargetTile
    ? "DODGE! Step 2 tiles off the red tile!"
    : (state.hint ?? "");

  const nextRow = document.createElement("div");
  nextRow.style.cssText = "font-size:11px;color:#9ca3af;";
  nextRow.textContent = "Next: ";
  const nextSpan = document.createElement("span");
  nextSpan.style.color = nextColor;
  nextSpan.textContent = nextLabel;
  nextRow.appendChild(nextSpan);

  coachElement.append(header, hint, nextRow);
}

function isTileInClouds(tile, clouds) {
  if (!tile || !clouds?.length) return false;
  const [tx, ty] = tile;
  return clouds.some(([cx, cy]) => Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) <= 1);
}

function pickSafeTile(candidates, activeClouds, pendingClouds) {
  if (!candidates?.length) return null;
  const clear = candidates.find(
    (tile) => !isTileInClouds(tile, activeClouds) && !isTileInClouds(tile, pendingClouds),
  );
  if (clear) return clear;
  const notActive = candidates.find((tile) => !isTileInClouds(tile, activeClouds));
  return notActive ?? candidates[0];
}

function buildZulrahMarkers(input) {
  const state = input.simulationState?.encounter?.state;
  const mechanicsConfig = input.simulationState?.mechanicsConfig;
  const showGuide = mechanicsConfig?.[zulrahTrainingOverlayKey] ?? true;

  syncCoachOverlay(state, showGuide);

  if (!state) return input;
  const markers = [];

  if (showGuide) {
    const standTile = pickSafeTile(state.safeTiles, state.activeClouds, state.pendingClouds);
    const nextTile = pickSafeTile(state.nextSafeTiles, state.activeClouds, null);
    if (standTile) {
      markers.push({ x: standTile[0], y: standTile[1], color: "#22C55E", opacity: 0.34, label: "Stand" });
    }
    if (nextTile && (!standTile || nextTile[0] !== standTile[0] || nextTile[1] !== standTile[1])) {
      markers.push({ x: nextTile[0], y: nextTile[1], color: "#38BDF8", opacity: 0.22, label: "Move Next" });
    }
  }

  if (state.meleeTargetTile) {
    const [x, y] = state.meleeTargetTile;
    markers.push({ x, y, color: "#EF4444", opacity: 0.45, label: "DODGE!" });
  }

  const seenPendingTiles = new Set();
  for (const [cx, cy] of state.pendingClouds ?? []) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const x = cx + dx;
        const y = cy + dy;
        const key = `${x},${y}`;
        if (seenPendingTiles.has(key)) continue;
        seenPendingTiles.add(key);
        markers.push({
          x,
          y,
          color: "#F59E0B",
          opacity: 0.34,
          label: dx === 0 && dy === 0 ? "Venom" : "",
        });
      }
    }
  }

  const seenCloudTiles = new Set();
  for (const [cx, cy] of state.activeClouds ?? []) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const x = cx + dx;
        const y = cy + dy;
        const key = `${x},${y}`;
        if (seenCloudTiles.has(key)) continue;
        seenCloudTiles.add(key);
        markers.push({ x, y, color: "#84CC16", opacity: 0.3, label: "" });
      }
    }
  }

  if (markers.length === 0) return input;
  const options = input.options ?? {};
  return {
    ...input,
    options: { ...options, showTileMarkers: true },
    tileMarkers: [...(options.showTileMarkers ? (input.tileMarkers ?? []) : []), ...markers],
  };
}

export const zulrahPresentation = (BaseScene) => ({
  kind: zulrahKind,
  renderConfig,
  sceneBuilder(context) {
    class ZulrahScene extends BaseScene {
      build(input, camera, ...rest) {
        return super.build(buildZulrahMarkers(input), camera, ...rest);
      }

      dispose(...rest) {
        removeCoachOverlay();
        return super.dispose?.(...rest);
      }
    }
    return buildScene(ZulrahScene, renderConfig, context);
  },
  defaultCamera: { yaw: 180, pitch: -45, zoom: 420 },
});
