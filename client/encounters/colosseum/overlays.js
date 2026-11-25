// What the RuneLite plugin Fortis Colosseum shows, rebuilt for the waves by
// the Colosseum's own module, because the application's plugins are written
// into its bundles one by one (Attack Ranges is one of those:
// client/plugins/attackRanges.js). Each part is switched by a mechanics toggle of the
// group "aid" (controls.js), which the game panel lists under its assists.
//
// Fortis Colosseum (github.com/LlemonDuck/fortis-colosseum, BSD 2-Clause,
// "Copyright (c) 2022, LlemonDuck"), as .scratch/colo-plugin-notes.md
// describes it; PLUGIN below is that description:
//   - the waves overlay: the monsters of the current and of the next wave
//   - the modifiers overlay: a picture of each active modifier with its level
//   - the names on the selector (intermission.js draws them)
//   - the Volatility reminder: here the tiles a monster died on are marked
//     for 5 ticks, where the plugin draws Volatility's picture over them
//   - the splits: the duration of each completed wave and the total
//   - the LoS links (losLinks.js)
// and one of its own, the true tile of the Solarflare orb.
// Its loot and LiveSplit parts have nothing here to attach to, and the bee
// swarms' line of the waves overlay, off by default there, is left out.
//
// No code of the plugin is here. The panels are plain elements over the
// page, as the interface of intermission.js is: they are not the
// application's own overlays and cannot be dragged.
import { lastWave } from "./constants.js";
import { getOverlaySetting, overlayKeys } from "./controls.js";
import { getGamePanelScale } from "./intermission.js";
import { getInterfaceModifier } from "./modifiers.js";
import { getWaveMonsterKinds, getWaveReinforcementKinds, isColosseumWave } from "./waves.js";

// PLUGIN: its "colloquial" names, the default.
const names = { warband: "Fremmy", shaman: "Mage", jaguar: "Melee", javelin: "Ranger", manticore: "Lion", shockwave: "Shocker", minotaur: "Minotaur" };
// PLUGIN: a wave's title is orange and its spawns white. inferred: the colour of the reinforcements' lines, which the description does not give.
const colors = { title: "#ff981f", spawn: "#ffffff", reinforcement: "#ffff00" };
// inferred: the colour of the tiles of the Volatility reminder.
const reminderMarker = { color: "#FF981F", opacity: 1 };
// inferred: the colour of the Solarflare orb's true tile, chosen to stand
// apart from fire, molten sand and the cyan and yellow A and B tiles of the
// preset "Colosseum Tiles".
const orbMarker = { color: "#FF3333", opacity: 1 };
const secondsPerTick = 0.6;

const style = `
.colosseum-hud { position: fixed; z-index: 40; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; pointer-events: none;
  font-family: "RuneScape Plain 12", sans-serif; font-size: 16px; line-height: 15px; color: #fff; text-shadow: 1px 1px 0 #000; }
.colosseum-hud.left { left: 8px; top: 44px; }
.colosseum-hud.right { right: 260px; top: 8px; align-items: flex-end; }
.colosseum-hud .panel { background: rgb(70 61 50 / 0.61); border: 1px solid rgb(90 82 69); padding: 4px 6px; min-width: 110px; }
.colosseum-hud .row { display: flex; justify-content: space-between; gap: 12px; }
.colosseum-hud a { color: #9fdfff; pointer-events: auto; }
.colosseum-hud .icons { display: flex; gap: 4px; padding: 0; border: 0; background: none; min-width: 0; pointer-events: auto; }
.colosseum-hud .icon { position: relative; width: 38px; height: 38px; background: rgb(70 61 50 / 0.61) center no-repeat; border: 1px solid rgb(90 82 69); image-rendering: pixelated; }
.colosseum-hud .icon span { position: absolute; right: 2px; bottom: 0; font-family: "RuneScape Small", sans-serif; }
`;

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
// OBS: a wave's duration is its ticks in seconds, rounded to the nearest.
const toSeconds = (ticks) => Math.round(ticks * secondsPerTick);
const formatSeconds = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const countLines = (kinds, color) =>
  [...new Set(kinds)].map((kind) => `<div style="color:${color}">${kinds.filter((other) => other === kind).length}x ${names[kind]}</div>`).join("");

// PLUGIN: the warband counts four with Quartet, and the shockwave colossus two with Dynamic Duo. Wave 12 shows only itself.
function wavePanel(wave, modifiers) {
  if (wave === lastWave + 1) {
    return `<div class="panel"><div style="color:${colors.title}">Wave ${wave}</div><div>Sol Heredit</div></div>`;
  }
  if (!isColosseumWave(wave)) {
    return "";
  }
  const spawns = [...Array(modifiers.quartet ? 4 : 3).fill("warband"), ...getWaveMonsterKinds(wave).flatMap((kind) => (kind === "shockwave" && modifiers.dynamicduo ? [kind, kind] : [kind]))];
  return `<div class="panel"><div style="color:${colors.title}">Wave ${wave}</div>${countLines(spawns, colors.spawn)}${countLines(getWaveReinforcementKinds(wave), colors.reinforcement)}</div>`;
}

function leftHtml(state, mechanics) {
  const mode = getOverlaySetting(mechanics, overlayKeys.waves);
  let html = "";
  if (mode === "current" || mode === "both") {
    html += wavePanel(state.wave, state.modifiers);
  }
  if (mode === "next" || mode === "both") {
    html += wavePanel(state.wave + 1, state.modifiers);
  }
  if (getOverlaySetting(mechanics, overlayKeys.losLinks)) {
    const links = [["Spawns", state.losLinks?.spawns], ["Reinforcements", state.losLinks?.reinforcements], ["Current", state.losLinks?.current]].filter(([, url]) => url);
    html += `<div class="panel"><div style="color:${colors.title}">LoS</div>${links.map(([label, url]) => `<div><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a></div>`).join("") || "<div>No wave yet</div>"}</div>`;
  }
  // PLUGIN: its "compact" style, 38 by 38 with the level in the small font
  // at the bottom right; it stands at the bottom left there, where the
  // application has its chat box.
  if (getOverlaySetting(mechanics, overlayKeys.modifiers) && Object.keys(state.modifiers).length > 0) {
    html += `<div class="panel icons">${Object.entries(state.modifiers)
      .map(([id, level]) => {
        const { label, spriteId } = getInterfaceModifier(id, level);
        return `<div class="icon" title="${escapeHtml(label)}" style="background-image:url(/assets/encounters/colosseum-interface/${spriteId}.png)"><span>${["", "I", "II", "III"][level]}</span></div>`;
      })
      .join("")}</div>`;
  }
  return html;
}

function rightHtml(state, mechanics) {
  if (!getOverlaySetting(mechanics, overlayKeys.splits)) {
    return "";
  }
  const splits = state.splits ?? [];
  // PLUGIN: the total is the sum of the durations as they are shown.
  const total = splits.reduce((sum, split) => sum + toSeconds(split.ticks), 0);
  return `<div class="panel"><div style="color:${colors.title}">Fortis Colosseum Splits</div>${splits
    .map((split) => `<div class="row"><span>Wave ${split.wave}</span><span>${formatSeconds(toSeconds(split.ticks))}</span></div>`)
    .join("")}<div class="row"><span>Total</span><span>${formatSeconds(total)}</span></div></div>`;
}

let panels = null;
let drawn = "";
// The panels' html, made again only for another snapshot or other toggles:
// the snapshot (ColosseumEncounter.getSnapshot) is a new object whenever it
// changes, and the scene is handed the same one frame after frame.
let made = { state: null, mechanics: null, html: null };

function removePanels() {
  panels?.forEach((panel) => panel.remove());
  panels = null;
  drawn = "";
  made = { state: null, mechanics: null, html: null };
}

/**
 * Brings the panels in step with `simulationState`, what the scene is handed
 * every frame: its `encounter.state` is the Colosseum's snapshot and its
 * `mechanicsConfig` holds the toggles.
 */
export function syncOverlays(simulationState) {
  const state = simulationState?.encounter?.state;
  const mechanics = simulationState?.mechanicsConfig;
  if (!state || !mechanics || state.wave === undefined) {
    removePanels();
    return;
  }
  if (made.state !== state || made.mechanics !== mechanics) {
    made = { state, mechanics, html: [leftHtml(state, mechanics), rightHtml(state, mechanics)] };
  }
  const html = made.html;
  const scale = getGamePanelScale();
  const key = html.join("\u0000") + scale;
  if (key === drawn) {
    return;
  }
  drawn = key;
  if (!panels) {
    const styleElement = document.createElement("style");
    styleElement.textContent = style;
    panels = [styleElement, ...["left", "right"].map((side) => Object.assign(document.createElement("div"), { className: `colosseum-hud ${side}` }))];
    document.body.append(...panels);
  }
  panels[1].innerHTML = html[0];
  panels[2].innerHTML = html[1];
  panels[1].style.zoom = panels[2].style.zoom = scale;
}

/**
 * The scene's input of a frame with what the overlays draw on the ground
 * added to its markers: the Volatility reminder and the Solarflare orb's
 * true tile, as tile markers. The scene
 * draws the player's own markers only when he has them shown; that stays so.
 */
export function withOverlayMarkers(input) {
  const state = input.simulationState?.encounter?.state;
  const mechanics = input.simulationState?.mechanicsConfig;
  if (!state || !mechanics) {
    return input;
  }
  const tiles = [
    ...(getOverlaySetting(mechanics, overlayKeys.volatilityReminder) && state.modifiers?.volatility
      ? (state.deaths ?? []).flatMap(({ position: [x, y], size }) =>
          Array.from({ length: size * size }, (unusedElement, index) => ({ x: x + (index % size), y: y + Math.floor(index / size), ...reminderMarker })),
        )
      : []),
    ...(getOverlaySetting(mechanics, overlayKeys.solarflareTrueTile) ? (state.orbTiles ?? []).map(([x, y]) => ({ x, y, ...orbMarker })) : []),
  ];
  if (tiles.length === 0) {
    return input;
  }
  const options = input.options ?? {};
  return {
    ...input,
    options: { ...options, showTileMarkers: true },
    tileMarkers: [...(options.showTileMarkers ? (input.tileMarkers ?? []) : []), ...tiles],
  };
}
