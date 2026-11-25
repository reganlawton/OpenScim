// A layer of an encounter's own over the game view and under the game's
// interface, as the game draws an interface it opens on the view: the side
// panel, the chatbox and the orbs stay on top of it and can still be clicked
// (Vardorvis' strangle, interface 833, is one; his head's hull another).
//
// The view is `.scene-viewport` (Grid.js), a stacking context of its own at
// z-index 0; the interface is its sibling at z-index 20. A child of the view
// is under the interface in every layout, and moves and scales with the view
// (Fixed, Fit, Stretch to Window). An element appended to <body> is over all
// of it. The view's own listeners are on its canvas, which is not an ancestor
// of the layer: what the layer does not take reaches none of them.

// The view found last: asked for every frame, it is looked up again only once
// the application has taken it off the page (it makes the view anew).
let cachedView = null;

/** The game view, or null when there is none. */
export function gameView() {
  if (!cachedView?.isConnected) cachedView = document.querySelector(".scene-viewport");
  return cachedView;
}

/** Puts `element` on the view, `zIndex` above its canvas, unless it is already there. Returns the view, or null. */
export function mountOnView(element, zIndex) {
  const view = gameView();
  if (!view) return null;
  if (element.parentElement === view && element.style.zIndex === String(zIndex)) return view;
  element.style.position = "absolute";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = String(zIndex);
  if (element.parentElement !== view) view.append(element);
  return view;
}

/**
 * How many pixels of the page a pixel of the view is, across and down: 1 but
 * where a layout scales the frame round the view.
 */
export function viewPageScale(view) {
  const rect = view.getBoundingClientRect();
  return { x: view.offsetWidth > 0 ? rect.width / view.offsetWidth : 1, y: view.offsetHeight > 0 ? rect.height / view.offsetHeight : 1 };
}
