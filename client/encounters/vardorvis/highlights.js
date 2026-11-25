// What the Vardorvis fight marks by default, as the user's RuneLite does:
//
// - the true tiles of the axes, NPC 12225 (a tendril, before it throws) and
//   12227 (the axe, moving): an outline of #00FFFF, 2 wide, and a fill of
//   #00FFFF at 0x14 of 0xFF (RuneLite's "FF00FFFF" and "1400FFFF");
// - the hull of the head, NPC 12226, in the same two colours;
// - twelve marked tiles of the user's (RuneLite's Ground Markers, region 4405).
//
// The scene draws an NPC's `outline` on its true tile; the tile markers it
// draws when it is handed them; the hull is drawn here, on a canvas of its
// own over the game view, from the head's model as the scene projects it.
// RuneLite draws it above the scene and under the game's interfaces: the
// canvas is a layer of the view (shared/viewLayer.js), under the side panel
// and under the strangle's overlay (strangle.js).
import { packHsl } from "../../util/packHsl.js";
import { gameView, mountOnView, viewPageScale } from "../shared/viewLayer.js";

const highlight = { color: "#00FFFF", fillOpacity: 0x14 / 0xff, outlineWidth: 2 };
const trueTileNpcTypeIds = new Set([12225, 12227]);
const hullNpcTypeIds = new Set([12226]);
// RuneLite's markers, as the user gave them: regionX, regionY and an ARGB
// colour. They are the twelve tiles the axes never reach (WIKI: "one each in
// the cardinal four directions, and the two tiles in front of each pillar").
const groundMarkers = [
  [36, 26], [37, 28], [37, 24], [41, 31], [43, 30], [39, 30],
  [45, 28], [45, 24], [46, 26], [39, 22], [43, 22], [41, 21],
].map(([x, y]) => argbMarker(x, y, "#64FFFFFF"));
function argbMarker(x, y, argb) {
  return { x, y, color: "#" + argb.slice(3), opacity: parseInt(argb.slice(1, 3), 16) / 255, label: "" };
}

// "#RRGGBB" as the renderer's packed colour: hue, saturation and lightness of 0 to 255.
function packHex(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return packHsl(Math.round((((h * 60 + 360) % 360) / 360) * 255), Math.round(s * 255), Math.round(l * 255));
}
// The renderer's width of a true-tile line is 0.02 of a tile for each unit of RuneLite's width.
const outline = { color: packHex(highlight.color), style: "full", lineWidth: highlight.outlineWidth * 0.02 };

/** The input of the scene's build, with the outlines on the axes and the tile markers added. */
export function withHighlights(input) {
  const state = input.simulationState;
  if (!state?.npcs) return input;
  const fills = [];
  const npcs = state.npcs.map((npc) => {
    if (!npc.alive || !trueTileNpcTypeIds.has(npc.npcTypeId)) return npc;
    for (let dx = 0; dx < npc.size; dx++)
      for (let dy = 0; dy < npc.size; dy++) fills.push({ x: npc.position[0] + dx, y: npc.position[1] + dy, color: highlight.color, opacity: highlight.fillOpacity, label: "" });
    return { ...npc, outline };
  });
  const options = input.options ?? {};
  return {
    ...input,
    simulationState: { ...state, npcs },
    options: { ...options, showTileMarkers: true },
    // The player's own markers stay as he set them: shown only if he shows them.
    tileMarkers: [...(options.showTileMarkers ? (input.tileMarkers ?? []) : []), ...groundMarkers, ...fills],
  };
}

let hullCanvas = null;
const hullZIndex = 1; // over the view's canvas, under the strangle's overlay (2)

/** Draws the hull of every head on its canvas over the view; `scene` has drawn the frame with `camera`. */
export function drawHulls(scene, camera, npcs) {
  const viewport = gameView();
  const heads = (npcs ?? []).filter((npc) => npc.alive && hullNpcTypeIds.has(npc.npcTypeId));
  if (!viewport || !camera?.Hb || heads.length === 0) {
    if (hullCanvas) hullCanvas.style.display = "none";
    return;
  }
  if (!hullCanvas) {
    hullCanvas = document.createElement("canvas");
    hullCanvas.style.pointerEvents = "none";
  }
  // Again each frame: the application may have made the view anew.
  mountOnView(hullCanvas, hullZIndex);
  // In the view's own pixels; its canvas's are as many as it covers on the screen.
  const width = viewport.clientWidth, height = viewport.clientHeight;
  const dpr = (window.devicePixelRatio || 1) * viewPageScale(viewport).x;
  Object.assign(hullCanvas.style, { display: "block", width: width + "px", height: height + "px" });
  if (hullCanvas.width !== Math.round(width * dpr)) hullCanvas.width = Math.round(width * dpr);
  if (hullCanvas.height !== Math.round(height * dpr)) hullCanvas.height = Math.round(height * dpr);
  const context = hullCanvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const view = camera.Hb(), projection = camera.jb();
  const byInstance = new Map(scene.getAllNpcHitTestData().map((entry) => [entry.actorId, entry.hitTestData]));
  for (const head of heads) {
    const data = byInstance.get(scene.getNpcRenderInstanceId(head.id)) ?? byInstance.get(head.id);
    if (!data) continue;
    const points = projectVertices(data, view, projection, width, height);
    const hull = convexHull(points);
    if (hull.length < 3) continue;
    context.beginPath();
    hull.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.closePath();
    context.fillStyle = `rgba(0, 255, 255, ${highlight.fillOpacity})`;
    context.fill();
    context.lineWidth = highlight.outlineWidth;
    context.strokeStyle = highlight.color;
    context.stroke();
  }
}

export function removeHulls() {
  hullCanvas?.remove();
  hullCanvas = null;
}

// The model's vertices through its matrix, the camera's view and projection
// (column-major, as the hit test reads them), to pixels of the view.
function projectVertices({ verticesX, verticesY, verticesZ, verticesCount, modelMatrix: m }, v, p, width, height) {
  const points = [];
  const count = verticesCount ?? verticesX.length;
  for (let i = 0; i < count; i++) {
    const x = verticesX[i], y = verticesY[i], z = verticesZ[i];
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const ex = v[0] * wx + v[4] * wy + v[8] * wz + v[12];
    const ey = v[1] * wx + v[5] * wy + v[9] * wz + v[13];
    const ez = v[2] * wx + v[6] * wy + v[10] * wz + v[14];
    const ew = v[3] * wx + v[7] * wy + v[11] * wz + v[15];
    const cx = p[0] * ex + p[4] * ey + p[8] * ez + p[12] * ew;
    const cy = p[1] * ex + p[5] * ey + p[9] * ez + p[13] * ew;
    const cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15] * ew;
    if (cw <= 0) continue;
    points.push([((cx / cw + 1) / 2) * width, ((1 - cy / cw) / 2) * height]);
  }
  return points;
}

// Andrew's monotone chain.
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
