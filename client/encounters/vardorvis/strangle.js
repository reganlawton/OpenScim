// The strangle's overlay: interface 833 as the game builds it (OBS: its
// widgets as the Vardorvis Observer wrote them down, four strangles).
//
//   833:2  model 48284, the dark background, over the whole game view
//   833:4  model 48281, the tendrils, over the whole game view, above the rest
//   833:5  a box of 240 x 144 in the middle of the view, holding
//   833:6-11 the spores: model 48285, 48 x 48, at the places the encounter
//          drew (strangle.js has none of its own), "Destroy" on a click
//
// CACHE (scripts 1816 to 1826, which open and run it): no spore is turned:
// each is the model seen from straight ahead at zoom 1400. A layer clips
// what it holds, a model widget does not clip its own model: a spore's
// spikes reach past its 48 x 48, over its neighbours, up to the box's edge.
// It is clicked on its 48 x 48. It fades in (1820) and its idle starts when
// it is in.
//
// All three are models, zoom 220 for the two that fill the view and 1400 for
// a spore, each with its animations for coming, staying and going (CACHE:
// ui_vardorvis_qte_background_*, ui_vardorvis_qte_tentacles_*,
// ui_vardorvis_qte_spore_*). The application draws them with
// widgetModelView, which draws an interface's model as the game client does.
//
// A click on a spore is a command of the encounter, queued for the tick and
// recorded for a replay (Grid.js listens for "vardorvis-command").
//
// The game opens 833 on the game view (RSPSApp's recordings: on 161:1), and
// the side panel, the chatbox and the orbs stay over it: a head's gaze can be
// prayed against while held (OBS). So the overlay is a layer of the view
// (shared/viewLayer.js), not of the page.
import { gameView, mountOnView, viewPageScale } from "../shared/viewLayer.js";

export const vardorvisCommandEvent = "vardorvis-command";
// Over the head's hull (highlights.js), as RuneLite draws its highlights under the game's interfaces.
const overlayZIndex = 2;

// CACHE (interface 833): the two that fill the view are orthographic, with a
// reference size of 512 x 512; a spore is in perspective. OBS: in a 1920 x
// 1080 screenshot of the game the spiral's innermost loop is 1.77 times as
// tall and 1.53 as wide as ours drawn at 512 (a different frame of its
// animation, perhaps); 1.65, the mean, is taken: 512 / 1.65 = 310.
const orthoBaseHeight = 310;
// The two scale with the view's height (widgetModelView: height over
// baseHeight), the box of spores does not: in a short view (Fixed's 334) the
// innermost loop closes over the spores. Measured in the browser over every
// frame of the tendrils' spawn and idle: the open middle clears the spores'
// whole area (every cell, its jitter, 48 x 48) up to 0.578 times that scale.
// So it is never less than 1.82, which leaves them 5% of room: inferred, the
// game's own rule for a short view is not known.
const minOrthoScale = 1.82;
const interfaceModels = {
  background: { modelId: 48284, zoom: 220, orthographic: true, baseHeight: orthoBaseHeight, seqs: { spawn: 10370, idle: 10371, despawn: 10372 } },
  tendrils: { modelId: 48281, zoom: 220, orthographic: true, baseHeight: orthoBaseHeight, seqs: { spawn: 10367, idle: 10368, despawn: 10369 } },
  spore: { modelId: 48285, zoom: 1400, orthographic: false, seqs: { spawn: 10373, idle: 10374, despawn: 10375 } },
};
export const strangleModelIds = Object.values(interfaceModels).map((model) => model.modelId);
export const strangleSeqIds = Object.values(interfaceModels).flatMap((model) => Object.values(model.seqs));
const box = { width: 240, height: 144 }; // OBS
const sporeSize = 48; // OBS
// How much of the model round its 48 x 48 a spore's canvas draws. Measured
// in the browser over its idle: its spikes reach up to 12 past the sides and
// 17 below. The box clips what reaches past it.
const sporeReach = 24;
// CACHE (script 1820): a shown spore starts at transparency 255 and loses 15
// a client cycle (20 ms); at 0 its idle (10374) starts.
const sporeFadeInMs = (255 / 15) * 20;
// OBS: a spore that is destroyed fades out as it plays its going animation
// (opacity 15 and 150 of 255 seen during it); then it is hidden.
const sporeFadeMs = 600;
export const sporeClickSound = 7104; // OBS: on every click on a spore
// How long a clicked spore waits for the fight to take the click: two ticks and a little.
const clickConfirmMs = 1400;


let tools = null; // { widgetModelView, npcModelLoader, animationSystem, playSound }
let shown = null;

/** What the overlay needs from the application: handed over by the presentation and the scene. */
export function setStrangleTools(next) {
  tools = { ...tools, ...next };
}

// How big a pixel of the game's interface is on the page, across and down.
// The chatbox's bar of tabs is 519 x 23 of them in every layout (Grid.js), so
// its size on the page is the scale however the application applies it: the
// UI scale of the resizable layouts, the Fixed layout's multiple, Fit, and
// Stretch to Window (which scales across and down differently).
function interfaceScale() {
  const bar = document.querySelector(".chatbox__controls")?.getBoundingClientRect();
  if (bar && bar.width > 0 && bar.height > 0) return { x: bar.width / 519, y: bar.height / 23 };
  return { x: 1, y: 1 };
}

// A layer that plays spawn, then idle; and despawn when it is told to go.
function layer(view) {
  let seq = "spawn";
  let startMs = performance.now();
  view.setSequence(interfaceModels[view.kind].seqs.spawn); // a kept view may hold the last strangle's
  return {
    view,
    play(name) {
      seq = name;
      startMs = performance.now();
      view.setSequence(interfaceModels[view.kind].seqs[name]);
    },
    draw(now) {
      if (seq === "spawn" && now - startMs >= view.cycleMs) this.play("idle");
      // Spawn and despawn play once: hold their last frame.
      view.draw(seq === "idle" ? now - startMs : Math.min(now - startMs, view.cycleMs - 20));
    },
  };
}

// The overlay's three WebGL views (widgetModelView), kept from one strangle
// to the next and made before the first, at a moment of idle: making them
// (a context each, its shaders, the lit model) is what stalled the frame the
// overlay opened on, Firefox's above all. Made anew only when the view's size
// or the interface's scale has changed; gone with the scene.
let views = null; // { key, background, tendrils, spore }, each { canvas, view }
let preparing = 0;

// The overlay's size and scale in the view as it is now, or null without one.
function measure() {
  const viewport = gameView();
  if (!viewport) return null;
  const rect = viewport.getBoundingClientRect();
  const scale = interfaceScale();
  const page = viewPageScale(viewport);
  const width = Math.round(rect.width / scale.x), height = Math.round(rect.height / scale.y);
  // A transform does not reach a canvas's own pixels: they are sized for it.
  const dpr = (window.devicePixelRatio || 1) * Math.max(scale.x, scale.y);
  return { scale, page, width, height, dpr, key: `${width}x${height}@${dpr}` };
}

const canvasOf = (w, h, css) => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:absolute;width:${w}px;height:${h}px;pointer-events:none;${css}`;
  return canvas;
};

function viewsFor({ width, height, dpr, key }) {
  if (views?.key === key) return views;
  disposeViews();
  const viewOf = (kind, canvas, w, h) => {
    const model = interfaceModels[kind];
    const baseHeight = model.orthographic ? Math.min(model.baseHeight, h / minOrthoScale) : h;
    const view = tools.widgetModelView({ canvas, width: w, height: h, dpr, npcModelLoader: tools.npcModelLoader, animationSystem: tools.animationSystem, modelId: model.modelId, seqId: model.seqs.spawn, zoom: model.zoom, orthographic: model.orthographic, baseHeight });
    view.kind = kind;
    return { canvas, view };
  };
  const drawnSize = sporeSize + 2 * sporeReach;
  views = {
    key,
    background: viewOf("background", canvasOf(width, height, "left:0;top:0;"), width, height),
    tendrils: viewOf("tendrils", canvasOf(width, height, "left:0;top:0;"), width, height),
    // One view draws every spore; each spore's own canvas takes a copy of its frame.
    spore: viewOf("spore", document.createElement("canvas"), drawnSize, drawnSize),
  };
  return views;
}

function disposeViews() {
  if (!views) return;
  for (const kind of ["background", "tendrils", "spore"]) views[kind].view.dispose();
  views = null;
}

const toolsReady = () => Boolean(tools?.widgetModelView && tools.npcModelLoader && tools.animationSystem);

// Makes the views at the browser's next idle moment, once there is a view to measure.
function prepare() {
  if (views || preparing || !toolsReady()) return;
  const run = () => {
    preparing = 0;
    const size = measure();
    if (size && toolsReady() && !shown) viewsFor(size);
  };
  preparing = typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 500);
}

function cancelPrepare() {
  if (!preparing) return;
  if (typeof cancelIdleCallback === "function") cancelIdleCallback(preparing);
  else clearTimeout(preparing);
  preparing = 0;
}

function open(strangle) {
  if (!toolsReady()) return null;
  const size = measure();
  if (!size) return null;
  const { width, height, scale, page, dpr } = size;
  cancelPrepare();
  const kept = viewsFor(size);
  // Laid out in the interface's pixels and scaled onto the view, as the game
  // draws it. The view's own scale on the page (a layout that scales its
  // frame) is already applied to the overlay as a child of it.
  const element = document.createElement("div");
  element.className = "vardorvis-strangle";
  Object.assign(element.style, { width: width + "px", height: height + "px", transform: `scale(${scale.x / page.x},${scale.y / page.y})`, transformOrigin: "0 0" });
  const boxElement = document.createElement("div");
  boxElement.style.cssText = `position:absolute;left:${Math.round((width - box.width) / 2)}px;top:${Math.round((height - box.height) / 2)}px;width:${box.width}px;height:${box.height}px;overflow:hidden;`;
  element.append(kept.background.canvas, boxElement, kept.tendrils.canvas);
  const layers = [layer(kept.background.view), layer(kept.tendrils.view)];
  // A kept canvas still holds the last strangle's last frame: this one's first, before it shows.
  for (const each of layers) each.draw(performance.now());
  const sporeGl = kept.spore.canvas;
  const sporeView = kept.spore.view;
  const drawnSize = sporeSize + 2 * sporeReach;
  const spores = strangle.spores.map((spore, index) => {
    // The 48 x 48 that is clicked, and the model drawn round it. The game
    // draws 833:6 to 833:11 in turn: spore N is 12 - N, so the first is on top.
    const target = document.createElement("div");
    target.style.cssText = `position:absolute;left:${spore.x}px;top:${spore.y}px;width:${sporeSize}px;height:${sporeSize}px;cursor:pointer;opacity:0;z-index:${strangle.spores.length - index};`;
    target.title = "Destroy";
    const canvas = canvasOf(drawnSize, drawnSize, `left:${-sporeReach}px;top:${-sporeReach}px;`);
    canvas.width = Math.round(drawnSize * dpr);
    canvas.height = Math.round(drawnSize * dpr);
    target.append(canvas);
    // The fight takes the click on its next tick. The spore goes at once, so
    // that a click shows when it is made; one that the fight does not take
    // (the strangle was already over) brings it back (syncStrangle).
    target.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const spore = shown?.spores[index];
      if (!spore || spore.goneMs !== null) return;
      const now = performance.now();
      Object.assign(spore, { seq: "despawn", startMs: now, goneMs: now, clickedMs: now });
      tools.playSound?.(sporeClickSound);
      window.dispatchEvent(new CustomEvent(vardorvisCommandEvent, { detail: { encounter: "vardorvis", type: "destroy-spore", spore: index } }));
    });
    boxElement.append(target);
    return { target, canvas, seq: "spawn", startMs: performance.now(), goneMs: null, clickedMs: null };
  });
  mountOnView(element, overlayZIndex);
  const state = { element, layers, sporeView, spores, closing: false, frame: 0 };
  const tick = () => {
    if (shown !== state) return;
    const now = performance.now();
    for (const each of layers) each.draw(now);
    // The spores that show one frame (all of them, as they come and stay
    // together) take it from one drawing of the view.
    let drawn = null;
    for (const spore of spores) {
      if (spore.goneMs !== null && now - spore.goneMs > sporeFadeMs) {
        spore.target.style.display = "none";
        continue;
      }
      if (spore.seq === "spawn") spore.target.style.opacity = String(Math.min(1, (now - spore.startMs) / sporeFadeInMs));
      if (spore.seq === "spawn" && now - spore.startMs >= sporeFadeInMs) Object.assign(spore, { seq: "idle", startMs: now });
      const elapsed = spore.seq === "idle" ? now - spore.startMs : Math.min(now - spore.startMs, sporeView.cycleMs - 20);
      if (spore.seq + ":" + Math.round(elapsed) !== drawn) {
        sporeView.setSequence(interfaceModels.spore.seqs[spore.seq]);
        sporeView.draw(elapsed);
        drawn = spore.seq + ":" + Math.round(elapsed);
      }
      const context = spore.canvas.getContext("2d");
      context.clearRect(0, 0, spore.canvas.width, spore.canvas.height);
      context.drawImage(sporeGl, 0, 0, spore.canvas.width, spore.canvas.height);
      if (spore.goneMs !== null) spore.target.style.opacity = String(Math.max(0, 1 - (now - spore.goneMs) / sporeFadeMs));
    }
    state.frame = requestAnimationFrame(tick);
  };
  state.frame = requestAnimationFrame(tick);
  return state;
}

// The overlay goes; its views are kept for the next strangle.
function close() {
  if (!shown) return;
  cancelAnimationFrame(shown.frame);
  shown.element.remove();
  shown = null;
}

/** The overlay and its views go: the scene is going. */
export function disposeStrangle() {
  close();
  cancelPrepare();
  disposeViews();
}

/**
 * Brings the overlay in step with the encounter's snapshot, every frame.
 * `strangle` is the snapshot's (null when there is none), `tick` the
 * simulation's. Open from the hold to a tick after the player is let go.
 */
export function syncStrangle(strangle, tick) {
  const open_ = strangle && tick >= strangle.holdTick && (strangle.endTick === null || tick <= strangle.endTick + 1);
  if (!open_) {
    close();
    prepare();
    return;
  }
  if (shown && shown.holdTick !== strangle.holdTick) close();
  if (!shown) {
    shown = open(strangle);
    if (!shown) return;
    shown.holdTick = strangle.holdTick;
  }
  const now = performance.now();
  strangle.spores.forEach((spore, index) => {
    const mine = shown.spores[index];
    if (spore.destroyedTick !== null) {
      if (mine.goneMs === null) Object.assign(mine, { seq: "despawn", startMs: now, goneMs: now });
      mine.clickedMs = null;
    } else if (mine.clickedMs !== null && now - mine.clickedMs > clickConfirmMs) {
      // Not taken: the spore is back, to be clicked again.
      Object.assign(mine, { seq: "idle", startMs: now, goneMs: null, clickedMs: null });
      mine.target.style.display = "";
      mine.target.style.opacity = "1";
    }
  });
  if (strangle.endTick !== null && !shown.closing) {
    shown.closing = true;
    for (const each of shown.layers) each.play("despawn");
  }
}
