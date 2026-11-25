// The Freezing Gaze's overlay: interface 829 (CACHE: duke_sight), a tint and, on
// it, a great eye among tendrils and rays (duke_eye_model), over the whole game
// view and under the interface.
//
// The tint. CACHE: a rectangle (universe_rect0), hidden and white as the cache
// has it; the game shows it as something else. OBS (the wiki's clip "Duke
// Sucellus - melee flinching", 36 patches of it lined up with a frame without
// the gaze): one colour from the top of the view to its bottom, whose strength
// falls evenly from 0.36 to nothing, there at the gaze's height. A screenshot of
// another fight fits it.
//
// CACHE: model 48318, orthographic, zoom 1399, reference size 512 x 512. It
// fades in over 120 cycles (10216) and out over 64 by the same frames in
// reverse (10215), so the fade in is drawn both ways here: as far in as
// encounter.js, `sightStrength`, says.
// CACHE: the model is 1400 wide and its zoom 1399, so an orthographic model is
// drawn at 512 / zoom pixels of the interface to a unit. OBS (the clip and the
// screenshot): so it is in views about 560 and 650 high, give or take a tenth. A
// larger view has it larger (a player's account); that it goes by the view's
// height is inferred.
export const sightModelId = 48318;
export const sightSeqId = 10216;
const sightCycleMs = 20;
const zoom = 1399;
const viewHeightAtThatSize = 605; // between the two
const tint = { color: "61, 65, 155", top: 0.36 };

let tools = null; // { widgetModelView, npcModelLoader, animationSystem }
let shown = null; // { element, tintElement, view, viewport, width, height }

/** What the overlay needs from the application: handed over by the presentation and the scene. */
export function setSightTools(next) {
  tools = { ...tools, ...next };
}

function open() {
  const viewport = document.querySelector(".scene-viewport");
  if (!viewport || !tools?.widgetModelView || !tools.npcModelLoader || !tools.animationSystem) return null;
  const { clientWidth: width, clientHeight: height } = viewport;
  if (!width || !height) return null;
  const element = document.createElement("div");
  element.className = "duke-sight";
  element.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
  const tintElement = document.createElement("div");
  tintElement.className = "duke-sight__tint";
  tintElement.style.cssText = `position:absolute;inset:0;background:linear-gradient(rgba(${tint.color},${tint.top}),rgba(${tint.color},0));opacity:0;`;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;`;
  element.append(tintElement, canvas);
  viewport.append(element);
  // widgetModelView draws an orthographic model at zoom / 256 pixels to a
  // unit, times the height over baseHeight.
  const view = tools.widgetModelView({
    canvas, width, height, dpr: window.devicePixelRatio || 1, npcModelLoader: tools.npcModelLoader, animationSystem: tools.animationSystem,
    modelId: sightModelId, seqId: sightSeqId, zoom: (256 * 512) / zoom, orthographic: true, baseHeight: viewHeightAtThatSize,
  });
  return { element, tintElement, view, viewport, width, height };
}

function close() {
  shown?.view.dispose();
  shown?.element.remove();
  shown = null;
}

/**
 * Brings the overlay in step with the fight, every frame: `strength` is how
 * many cycles of its fade in the eye has come (0 to sightAppearCycles),
 * `tintStrength` how much of the tint there is (0 to 1).
 */
export function syncSight(strength, tintStrength = 0) {
  if (!(strength > 0)) return close();
  // A view of another size, or one that is gone, has it drawn anew.
  if (shown && (!shown.element.isConnected || shown.viewport.clientWidth !== shown.width || shown.viewport.clientHeight !== shown.height)) close();
  shown ??= open();
  if (!shown) return;
  shown.tintElement.style.opacity = String(tintStrength);
  // Its last frame, held: the animation starts over at its end.
  shown.view.draw(Math.min(strength * sightCycleMs, shown.view.cycleMs - sightCycleMs));
}
