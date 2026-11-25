// The choice of a modifier: the game's interface 865, which opens when
// Minimus offers three modifiers before a wave, rebuilt widget by widget. The
// presentation calls syncOfferDialog every frame with the offer of the
// encounter's snapshot; a choice goes back to the encounter as a command,
// through the window event that client/assets/Grid.js listens for while the
// encounter is the Colosseum's (it queues the command and records it for a
// replay).
//
// OBS is the recording's seventeen dumps of the interface (`node
// .scratch/obs-865-tree.mjs <log> <n>`): every rectangle, sprite, font,
// colour and text below is a widget's, and a rectangle is [x, y, width,
// height] within its parent as the dump has it. The sprites are the cache's,
// each on its canvas, under /assets/encounters/colosseum-interface/.
//
// As in the game the interface is not modal: the fight's panels stay usable
// behind it. A click on a tile sets the choice ("Set"), "Continue" confirms
// it, the cross closes the interface without a choice, and a click on
// Minimus opens it again.
//
// Drawn and without effect, because the waves here have no loot and no
// Glory: "Claim" (greyed, as the game greys it with nothing to claim), the
// tabs "Loot" and "Summary", the two loot boxes and their totals.

export const colosseumCommandEvent = "colosseum-command";
export const chooseModifierCommandType = "choose-modifier";
/** The command of a click on Minimus, which Grid.js sends for his option "Start-wave". */
export const talkToMinimusCommandType = "talk-to-minimus";

// OBS, the `sound` lines of the recording; CACHE names them. 2266
// (interface_select1) came on the client cycle of each of five "Set" clicks;
// 7986 (varl_audio_modifier_options_hover_02) with the pointer over the
// tiles, clicked or not; 8010 (varl_audio_modifier_continue_12) on the tick
// the interface closed after each of four "Continue" clicks, and not when it
// was closed without a choice.
const sounds = { set: 2266, hover: 7986, continued: 8010 };
let playSound = () => {};
/**
 * `play(soundId)` plays a sound of the cache at once. The presentation hands
 * it over: the application's audio engine is the scene's to reach.
 */
export function setOfferSoundPlayer(play) {
  playSound = play;
}

const windowSize = [480, 314];
const colors = { orange: "#ff981f", white: "#ffffff", disabled: "#9f9f9f", glory: "#0dc10d" };
// The fill behind a tile's frame: as it lies, under the pointer, and set.
const tileFills = { idle: "#726451", hover: "#b8a182", set: colors.orange };
// Fonts 494, 495 and 496 of the cache: p11_full, p12_full and b12_full.
const fonts = { 494: "RuneScape Plain 11", 495: "RuneScape Plain 12", 496: "RuneScape Bold 12" };
const tileSpacing = 82;
const activeIconSpacing = 46;
const defaultPane = {
  title: "Select a modifier",
  text: "Use the buttons below to select a modifier before continuing to the next wave.<br><br>Alternatively, you may end this run now and claim the loot you've earned so far.",
};

const style = `
.colosseum-offer { position: fixed; left: 50%; top: 12vh; width: ${windowSize[0]}px; height: ${windowSize[1]}px; margin-left: -${windowSize[0] / 2}px;
  z-index: 50; image-rendering: pixelated; user-select: none; }
.colosseum-offer div { position: absolute; box-sizing: border-box; }
.colosseum-offer .text { display: flex; align-items: center; justify-content: center; text-align: center; font-size: 16px; line-height: 13px;
  text-shadow: 1px 1px 0 #000; pointer-events: none; }
.colosseum-offer .text.top { align-items: flex-start; }
.colosseum-offer .text.bottom { align-items: flex-end; }
.colosseum-offer .box { background: rgb(0 0 0 / 0.22); box-shadow: inset 0 0 0 1px #0e0e0c, inset 0 0 0 2px #474745; }
.colosseum-offer [role="button"] { cursor: pointer; }
.colosseum-offer .button .hover, .colosseum-offer .button.disabled .hover { display: none; }
.colosseum-offer .button:not(.disabled):hover .hover { display: block; }
.colosseum-offer .button:not(.disabled):hover .normal { display: none; }
.colosseum-offer .button.disabled { cursor: default; }
.colosseum-offer .strip { overflow: hidden; }
`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}
const place = ([x, y, width, height]) => `left:${x}px;top:${y}px;width:${width}px;height:${height}px;`;
const layer = (rect, content, attributes = "") => `<div ${attributes} style="${place(rect)}">${content}</div>`;
const fill = (rect, color, attributes = "") => `<div ${attributes} style="${place(rect)}background:${color}"></div>`;
// A sprite fills its widget from the top left corner, repeated.
const sprite = (rect, id, attributes = "") => `<div ${attributes} style="${place(rect)}background-image:url(/assets/encounters/colosseum-interface/${id}.png)"></div>`;
// `content` is HTML: a widget's text may hold <br>.
const text = (rect, content, font, color, extra = "", lineHeight = null) =>
  `<div class="text ${extra}" style="${place(rect)}font-family:'${fonts[font]}';color:${color};${lineHeight ? `line-height:${lineHeight}px;` : ""}">${content}</div>`;
const box = (rect) => `<div class="box" style="${place(rect)}"></div>`;
// The eight sprites of a frame four pixels thick, from `first`: the corners
// (top left, top right, bottom left, bottom right), then the top, bottom,
// left and right edges. 3524 is the frame of what is open, 3540 of what lies.
const stoneFrame = (width, height, first) =>
  sprite([4, 0, width - 8, 4], first + 4) +
  sprite([4, height - 4, width - 8, 4], first + 5) +
  sprite([0, 4, 4, height - 8], first + 6) +
  sprite([width - 4, 4, 4, height - 8], first + 7) +
  sprite([0, 0, 4, 4], first) +
  sprite([width - 4, 0, 4, 4], first + 1) +
  sprite([0, height - 4, 4, 4], first + 2) +
  sprite([width - 4, height - 4, 4, 4], first + 3);
// The eight sprites of a button's frame, nine pixels thick, from `first`:
// the corners, then the left, top, right and bottom edges. 913 as it lies,
// 921 under the pointer.
const buttonFrame = (width, height, first) =>
  sprite([0, 0, 9, 9], first) +
  sprite([width - 9, 0, 9, 9], first + 1) +
  sprite([0, height - 9, 9, 9], first + 2) +
  sprite([width - 9, height - 9, 9, 9], first + 3) +
  sprite([0, 9, 9, height - 18], first + 4) +
  sprite([9, 0, width - 18, 9], first + 5) +
  sprite([width - 9, 9, 9, height - 18], first + 6) +
  sprite([9, height - 9, width - 18, 9], first + 7);
const button = (rect, label, action, enabled) => {
  const [, , width, height] = rect;
  return layer(
    rect,
    `<div class="hover" style="${place([1, 1, width - 2, height - 2])}background:rgb(48 32 28 / 0.22)"></div>` +
      layer([0, 0, width, height], buttonFrame(width, height, 913), 'class="normal"') +
      layer([0, 0, width, height], buttonFrame(width, height, 921), 'class="hover"') +
      text([0, 0, width, height], label, 495, enabled ? colors.orange : colors.disabled, "label"),
    `class="button${enabled ? "" : " disabled"}" role="button" tabindex="0" data-action="${action}"`,
  );
};
// One of the two columns: its heading, the box of its loot with the loot's worth, and its button below.
const column = (x, heading, buttonHtml, totalHtml = "") =>
  layer([x, 39, 102, 228], totalHtml + text([0, 0, 102, 18], heading, 495, colors.orange, "top") + box([0, 22, 102, 125]) + text([0, 128, 102, 18], "0 GP", 494, colors.white) + buttonHtml);
// A tab that is not open, its frame starting at `x`.
const closedTab = (x, label) =>
  fill([x + 1, 1, 76, 29], tileFills.idle) +
  sprite([x + 2, 4, 74, 25], 897) +
  sprite([x, 4, 4, 25], 3546) +
  sprite([x + 4, 0, 70, 4], 3544) +
  sprite([x + 74, 4, 4, 25], 3547) +
  sprite([x, 0, 4, 4], 3540) +
  sprite([x + 74, 0, 4, 4], 3541) +
  text([x + 8, 4, 62, 25], label, 495, colors.orange);

function buildWindow(offer, showNames) {
  const frame =
    sprite([1, 1, 478, 312], 297) +
    text([6, 6, 468, 24], escapeHtml(offer.title), 496, colors.orange) +
    sprite([0, 0, 25, 30], 310) +
    sprite([455, 0, 25, 30], 311) +
    sprite([0, 284, 25, 30], 312) +
    sprite([455, 284, 25, 30], 313) +
    sprite([-15, 30, 36, 254], 172) +
    sprite([459, 30, 36, 254], 315) +
    sprite([25, -15, 430, 36], 314) +
    sprite([25, 293, 430, 36], 173) +
    sprite([5, 14, 470, 26], 2546) +
    sprite([451, 6, 26, 23], 535, 'role="button" tabindex="0" data-action="close" title="Close"');
  const tabs =
    fill([1, 1, 76, 29], tileFills.idle) +
    sprite([2, 4, 74, 28], 297) +
    sprite([0, 4, 4, 28], 3530) +
    sprite([4, 0, 70, 4], 3528) +
    sprite([74, 4, 4, 25], 3531) +
    sprite([0, 0, 4, 4], 3524) +
    sprite([74, 0, 4, 4], 3525) +
    text([8, 4, 62, 25], "Modifiers", 495, colors.orange) +
    closedTab(81, "Loot") +
    closedTab(162, "Summary");
  const active =
    offer.active.length === 0
      ? text([0, 0, 218, 41], "You have no modifiers yet.", 495, colors.orange)
      : offer.active
          .map(
            (modifier, index) =>
              sprite([activeIconSpacing * index - 10, -11, 64, 64], modifier.spriteId) +
              layer([activeIconSpacing * index + 2, 0, 40, 40], "", `role="button" tabindex="0" data-active="${index}" title="${escapeHtml(modifier.label)}"`),
          )
          .join("");
  const scrollbar =
    sprite([16, 0, 190, 16], 4538) +
    sprite([16, 0, 190, 16], 4536) +
    sprite([16, 0, 5, 16], 4537) +
    sprite([201, 0, 5, 16], 4535) +
    sprite([0, 0, 16, 16], 4533, 'role="button" data-scroll="-1"') +
    sprite([206, 0, 16, 16], 4534, 'role="button" data-scroll="1"');
  const modifiers =
    layer([0, 28, 240, 162], fill([1, 1, 238, 160], tileFills.idle) + sprite([4, 4, 232, 154], 297) + stoneFrame(240, 162, 3524)) +
    layer([0, 0, 240, 32], tabs) +
    layer([9, 38, 222, 60], box([0, 0, 222, 45]) + layer([0, 44, 222, 16], scrollbar) + layer([2, 2, 218, 41], active, 'class="strip"')) +
    layer([8, 104, 224, 78], "", 'class="pane"');
  const tiles = offer.options
    .map((option, index) =>
      layer(
        [tileSpacing * index, 0, 76, 65],
        fill([1, 1, 74, 63], tileFills.idle, 'class="fill"') +
          sprite([4, 4, 68, 57], 897) +
          stoneFrame(76, 65, 3540) +
          sprite([6, 0, 64, 64], option.backgroundSpriteId) +
          sprite([6, 0, 64, 64], option.spriteId) +
          // The RuneLite plugin Fortis Colosseum adds the name: white, in the plain 11 font, at the bottom (OBS had it on).
          (showNames ? text([0, 0, 76, 65], escapeHtml(option.label), 494, colors.white, "bottom") : ""),
        `role="button" tabindex="0" data-option="${index}" title="${escapeHtml(option.label)}"`,
      ),
    )
    .join("");
  return (
    frame +
    layer(
      [6, 35, 468, 273],
      column(6, "Last wave:", button([0, 186, 102, 42], "Claim", "claim", false), text([0, 154, 102, 26], "Total:<br>0 GP", 494, colors.white, "", 14)) +
        column(360, "Next wave:", button([0, 186, 102, 42], "Continue", "continue", false)) +
        layer([114, 6, 240, 190], modifiers) +
        layer([114, 202, 240, 65], tiles),
    )
  );
}

// The lower half of the "Modifiers" tab: what the tile under the pointer or
// the tile that is set would bring, or how to choose.
const paneHtml = (modifier) =>
  modifier
    ? text([0, 0, 224, 20], escapeHtml(modifier.label), 496, colors.orange) +
      text([0, 9, 224, 60], escapeHtml(modifier.text), 495, colors.orange) +
      text([0, 58, 224, 20], `+${modifier.glory} Glory per wave`, 494, colors.glory, "bottom")
    : text([0, 0, 224, 20], defaultPane.title, 496, colors.orange) + text([0, 20, 224, 58], defaultPane.text, 494, colors.orange, "", 11);

let dialog = null;
let shownRequestId = null;
let shownNames = false;
// A "Continue" went to the encounter: the interface closes when it has taken the choice.
let continued = false;

// The game draws its interfaces at one size, and the application draws the
// game's panels (the inventory, the minimap) at that size times the scale
// the player has set for them, as a `zoom` on each panel. The interface
// takes the same: the zoom of the first element that has one and is not one
// of the application's own overlays, which carry `--overlay-scale`.
//
// The overlays ask every frame. The panel found is kept and its zoom read
// again each time, so a change of the scale shows at once; the page is
// searched again when that panel has left it or lost its zoom, and else at
// most every `panelSearchMs`, for a panel that has come before it (or the
// first, when there was none).
const panelSearchMs = 250; // inferred: short enough not to be seen, long enough to cost nothing
let panel = null;
let panelSearchedAt = -Infinity;
export function getGamePanelScale() {
  const now = performance.now();
  if ((panel && (!panel.isConnected || !panel.style.zoom)) || now - panelSearchedAt >= panelSearchMs) {
    panelSearchedAt = now;
    panel =
      [...document.querySelectorAll('div[style*="zoom"]')].find(
        (element) => !element.style.getPropertyValue("--overlay-scale") && !element.closest(".colosseum-offer, .colosseum-hud"),
      ) ?? null;
  }
  return Number(panel?.style.zoom) || 1;
}

function buildDialog(offer, showNames) {
  const element = document.createElement("div");
  element.className = "colosseum-offer";
  element.style.zoom = getGamePanelScale();
  element.innerHTML = `<style>${style}</style>${buildWindow(offer, showNames)}`;
  // Which tile is set, which the pointer is over, and which active modifier's
  // details were asked for (inferred: they show until a tile takes over).
  const state = { set: null, hover: null, detail: null };
  const pane = element.querySelector(".pane");
  const continueButton = element.querySelector('[data-action="continue"]');
  const tiles = [...element.querySelectorAll("[data-option]")];
  const strip = element.querySelector(".strip");
  const draw = () => {
    tiles.forEach((tile, index) => {
      tile.querySelector(".fill").style.background = index === state.set ? tileFills.set : index === state.hover ? tileFills.hover : tileFills.idle;
    });
    pane.innerHTML = paneHtml(offer.options[state.hover ?? -1] ?? (state.detail !== null ? offer.active[state.detail] : null) ?? offer.options[state.set ?? -1]);
    continueButton.classList.toggle("disabled", state.set === null);
    continueButton.querySelector(".label").style.color = state.set === null ? colors.disabled : colors.orange;
  };
  tiles.forEach((tile, index) => {
    tile.addEventListener("mouseenter", () => {
      state.hover = index;
      playSound(sounds.hover);
      draw();
    });
    tile.addEventListener("mouseleave", () => {
      state.hover = null;
      draw();
    });
  });
  element.addEventListener("click", (event) => {
    const target = event.target.closest("[role=button]");
    if (!target) {
      return;
    }
    if (target.dataset.option !== undefined) {
      state.set = Number(target.dataset.option);
      state.detail = null;
      playSound(sounds.set);
    } else if (target.dataset.active !== undefined) {
      state.detail = Number(target.dataset.active);
    } else if (target.dataset.scroll !== undefined) {
      strip.scrollLeft += Number(target.dataset.scroll) * activeIconSpacing;
    } else if (target.dataset.action === "close") {
      closeDialog();
    } else if (target.dataset.action === "continue" && state.set !== null && !continued) {
      continued = true;
      window.dispatchEvent(new CustomEvent(colosseumCommandEvent, { detail: { encounter: "colosseum", type: chooseModifierCommandType, choice: state.set } }));
    }
    draw();
  });
  // Enter and the space bar click what has the focus.
  element.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[role=button]")) {
      event.preventDefault();
      event.target.click();
    }
  });
  // ponytail: the bar under the active modifiers is drawn whole and does not
  // follow; the wheel and its two arrows move the row. A thumb that follows
  // if a run ever holds more modifiers than the row shows at once is worth it.
  strip.addEventListener("wheel", (event) => {
    event.preventDefault();
    strip.scrollLeft += Math.sign(event.deltaY) * activeIconSpacing;
  });
  draw();
  return element;
}

function closeDialog() {
  dialog?.remove();
  dialog = null;
}

/**
 * Brings the interface in step with `offer`, the offer in the encounter's
 * snapshot: { requestId, wave, title, options: [{ label, text, glory,
 * spriteId, backgroundSpriteId }], active: [{ label, text, glory, spriteId
 * }] }, or null when none is open. A new `requestId` shows the interface
 * (again); the same one leaves an interface the player closed closed.
 * `showNames`: whether each tile carries its modifier's name (overlays.js).
 */
export function syncOfferDialog(offer, showNames = false) {
  if (!offer) {
    if (continued) {
      playSound(sounds.continued);
    }
    continued = false;
    closeDialog();
    shownRequestId = null;
    return;
  }
  if (offer.requestId === shownRequestId && showNames === shownNames) {
    return;
  }
  shownRequestId = offer.requestId;
  shownNames = showNames;
  continued = false;
  closeDialog();
  dialog = buildDialog(offer, showNames);
  document.body.append(dialog);
}
