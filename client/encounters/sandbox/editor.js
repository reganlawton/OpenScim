// The sandbox's editor: the one place to build and play a scenario, a panel
// over the page: a start screen and three steps.
//   Start        the one box that loads a code, a link, JSON or a file; go on
//                with the scenario, a new one, or the examples. The menus
//                and the lobby's gateway open the editor here
//                (menuImport.js, sandboxEntryKind).
//   1 Arena      the scenario's name and mode, the examples, the library
//                (scenarios/) and the saved scenarios, and the arena.
//                Another arena is another route (/sandbox/<arena>): the
//                application enters it (bridge.js) and the editor opens
//                again at step 2.
//   2 Monsters   a map of the arena's walkable tiles. Monsters and boulders
//                (obstacles.js) are dragged from the list onto the map and
//                moved by dragging them; a monster is edited below the map.
//                In a free-for-all each monster shows its team's number, and
//                a right click gives it the next team; a right click on a
//                boulder takes it away. The player's starting tile is the "P"
//                marker, dragged the same way.
//   3 Gear & share   the scenario's gear (chosen in the application's setup
//                window), save in this browser, export a file, copy a share
//                code or a link.
// The top bar holds "Start encounter" (which then pauses and resumes the
// run: clock.js) and the editor's toggle. "Apply & restart", the editor's
// one primary action, applies the scenario: the run restarts with it and,
// as every run of the sandbox, waits for "Start encounter". When a run
// ends, the top bar says how: who won a free-for-all; the victory screen
// has a "Sandbox editor" button that opens the panel over it.
//
// Every change is applied to the active scenario (activeScenario.js) at
// once, so that a reload keeps it; the fight on screen changes only when it
// is restarted. Like the Colosseum's dialog (colosseum/intermission.js) the
// panel is plain elements of the page, not one of the application's panels.
import { getRegisteredArenaConfig } from "../../engine/arena.js";
import { getActiveScenario, setActiveScenario, takeAgreedLinkGear } from "./activeScenario.js";
import { getSandboxArena, getSandboxArenaOfKind, sandboxArenas, sandboxKind, sandboxVariantKind } from "./arenas.js";
import { getSandboxNpcEntry, sandboxNpcCatalog } from "./catalog.js";
import { sandboxExamples } from "./examples.js";
import { libraryScenarios } from "./scenarios/index.js";
import { requestApp } from "./bridge.js";
import { editorReopenKey as reopenKey } from "./menuImport.js";
import {
  createEmptyScenario,
  encodeShareCode,
  importScenarioText,
  maxScenarioNpcs,
  maxScenarioObstacles,
  normalizeScenario,
  obstacleSize,
  playerTeam,
  scenarioToJson,
} from "./scenario.js";
import { obstacleTiles } from "./obstacles.js";
import { deleteSavedScenario, listSavedScenarios, saveScenario } from "./storage.js";
import { sandboxClock, startSandbox, toggleSandboxPause } from "./clock.js";
import { isHostedVisit } from "./visit.js";

const style = `
.sbx-hud { position: fixed; top: 8px; right: 232px; z-index: 40; display: flex; gap: 6px; }
.sbx-countdown { position: fixed; top: 32%; left: 50%; transform: translate(-50%, -50%); z-index: 39; pointer-events: none;
  font: 64px "RuneScape Bold 12", sans-serif; color: var(--color-heading, #ff981f); text-shadow: 2px 2px 0 #000, 0 0 12px rgb(0 0 0 / 0.8); }
.sbx-countdown[hidden] { display: none; }
.sbx-front .sbx-hud, .sbx-front .sbx-panel { z-index: 100001; }
.sbx-start-lead { margin: 10px 0 4px; font-size: 13px; }
.sbx-hud .sbx-start { box-shadow: 0 0 0 2px var(--color-primary, #ff981f); }
.sbx-result { align-self: center; padding: 3px 8px; font: 13px "RuneScape Bold 12", sans-serif; color: var(--color-heading, #ff981f);
  background: var(--color-bg-solid, #1e1812); border: 1px solid var(--color-primary, #ff981f); border-radius: 3px; }
.sbx-result[hidden] { display: none; }
.sbx-panel { position: fixed; top: 48px; right: 12px; z-index: 40; width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 64px);
  display: flex; flex-direction: column; color: var(--color-text-body, #e6dcc8); background: var(--color-bg-solid, #1e1812);
  border: 1px solid var(--modal-card-border, var(--color-border, #5d5245)); border-radius: var(--modal-radius, 6px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.5); font: 14px/18px "RuneScape Plain 12", sans-serif; }
.sbx-panel[hidden] { display: none; }
.sbx-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; }
.sbx-head h2 { flex: 1; margin: 0; font: 16px "RuneScape Bold 12", sans-serif; color: var(--color-heading, #ff981f); }
.sbx-steps { display: flex; gap: 4px; padding: 8px 12px; }
.sbx-steps button { flex: 1; }
.sbx-steps button[aria-current="step"] { outline: 1px solid var(--color-primary, #ff981f); }
.sbx-body { overflow: auto; padding: 0 12px 8px; }
.sbx-foot { display: flex; gap: 8px; padding: 8px 12px 12px; border-top: 1px solid var(--color-border, #5d5245); }
.sbx-foot .sbx-grow { flex: 1; }
.sbx-panel h3 { margin: 12px 0 6px; font: 13px "RuneScape Bold 12", sans-serif; color: var(--color-text-muted, #b8a98f); text-transform: uppercase; letter-spacing: 0.04em; }
.sbx-panel label { display: grid; gap: 2px; font-size: 12px; color: var(--color-text-muted, #b8a98f); }
.sbx-panel input, .sbx-panel select, .sbx-panel textarea { font: inherit; color: var(--color-text-body, #e6dcc8); background: var(--color-surface-inset, #14100c);
  border: 1px solid var(--color-border, #5d5245); border-radius: 3px; padding: 3px 6px; min-width: 0; }
.sbx-panel textarea { resize: vertical; min-height: 48px; }
.sbx-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: end; }
.sbx-row > label { flex: 1; }
.sbx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 6px; }
.sbx-card { display: grid; gap: 2px; text-align: left; padding: 6px 8px; cursor: pointer; color: inherit; font: inherit;
  background: var(--color-surface, #2a221a); border: 1px solid var(--color-border, #5d5245); border-radius: 4px; }
.sbx-card:hover { background: var(--color-surface-hover, #352b21); }
.sbx-card[aria-pressed="true"] { border-color: var(--color-primary, #ff981f); background: color-mix(in srgb, var(--color-primary, #ff981f) 15%, var(--color-surface, #2a221a)); }
.sbx-card b { font: 13px "RuneScape Bold 12", sans-serif; }
.sbx-card small { color: var(--color-text-dim, #8f826d); }
.sbx-list { display: grid; gap: 4px; }
.sbx-list .sbx-row { align-items: center; }
.sbx-list .sbx-row span { flex: 1; }
.sbx-map-wrap { position: relative; }
.sbx-map { display: block; width: 100%; touch-action: none; cursor: crosshair; border: 1px solid var(--color-border, #5d5245); border-radius: 3px; }
.sbx-palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 4px; max-height: 172px; overflow: auto; }
.sbx-chip { display: flex; align-items: center; gap: 6px; padding: 3px 6px; cursor: grab; user-select: none; touch-action: none; font-size: 12px;
  background: var(--color-surface, #2a221a); border: 1px solid var(--color-border, #5d5245); border-radius: 3px; }
.sbx-chip:hover { background: var(--color-surface-hover, #352b21); }
.sbx-chip i { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.sbx-chip--player i { background: var(--color-spawn-player, #2ec4ff); }
.sbx-note { margin: 6px 0; font-size: 12px; color: var(--color-text-dim, #8f826d); }
.sbx-status { min-height: 18px; font-size: 12px; color: var(--color-success, #5fd35f); }
.sbx-status.is-error { color: var(--color-error, #ff5a4f); }
.sbx-ghost { position: fixed; z-index: 41; pointer-events: none; padding: 2px 6px; font-size: 12px; border-radius: 3px;
  background: var(--color-bg-solid, #1e1812); border: 1px solid var(--color-primary, #ff981f); }
`;

// The colour of a monster on the map: its team in "ffa", else its catalog group.
const palette = ["#e0533d", "#3d8fe0", "#e0b83d", "#5fc45f", "#b05fe0", "#e07d3d", "#3dd0c4", "#e05fa8"];
const colourOf = (key) => {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
};
const abbreviation = (name) => name.replace(/\(.*\)/, "").trim().split(/[\s-]+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase();

const ui = {
  root: null,
  toggle: null,
  panel: null,
  body: null,
  status: null,
  kind: null,
  arena: null,
  step: 1,
  draft: null,
  savedId: null,
  selectedId: null,
  tiles: null,
  tilesSource: null,
  tilesFor: null,
  bounds: null,
  canvas: null,
  drag: null,
  hover: null,
};

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}
const button = (text, onclick, variant = "default", attributes = {}) =>
  el("button", { class: `osrs-btn osrs-btn--${variant}`, type: "button", text, onclick, ...attributes });
const field = (labelText, input) => el("label", {}, [labelText, input]);

function setStatus(message, isError = false) {
  if (!ui.status) return;
  ui.status.textContent = message;
  ui.status.classList.toggle("is-error", isError);
}

// --- the draft ---------------------------------------------------------------
function commit(render = true) {
  try {
    ui.draft = setActiveScenario(ui.draft);
  } catch (error) {
    setStatus(error.message, true);
  }
  if (render) renderBody();
  else drawMap();
}
const draftNpc = (id) => ui.draft.npcs.find((npc) => npc.id === id);
const playerStartOf = (scenario) => scenario.options.playerStart ?? getSandboxArena(scenario.arena).playerStart;
const isDraftInThisArena = () => ui.draft.arena === ui.arena.id;

function loadDraft(scenario, savedId = null) {
  ui.draft = normalizeScenario(scenario);
  ui.savedId = savedId;
  ui.selectedId = null;
  if (!isDraftInThisArena()) {
    goToArena(ui.draft.arena, 2);
    return;
  }
  commit(false);
  showStep(2);
  setStatus(`Loaded "${ui.draft.meta.name}". Press Apply & restart to load it.`);
}

// The step the editor opens at when it is made again: after the application
// enters another arena (or the same one, for the other scene), and after a
// page load (presentation.js reloads when a run wants the other scene).
function reopenAt(step) {
  try {
    globalThis.sessionStorage?.setItem(reopenKey, String(step));
  } catch {
    // The editor simply opens at step 1.
  }
}

// Another arena is another route, which the application enters (bridge.js)
// without loading the page again; the editor reopens there.
function goToArena(arenaId, step) {
  ui.draft = setActiveScenario({ ...ui.draft, arena: arenaId });
  reopenAt(step);
  requestApp("enter", { encounterKind: sandboxVariantKind(arenaId) }).catch(() =>
    // An application that cannot take it: the route, by a page load.
    globalThis.location.assign(`/${sandboxKind}/${arenaId.replace(/_/g, "-")}`),
  );
}

// The application's own restart ("Restart Simulation", Ctrl+R, or the
// practice footer's "Restart fight"), as its button does it; a reload when
// none is on screen.
function restartFight() {
  const candidates = [...document.querySelectorAll("button")].filter((node) => {
    const label = (node.getAttribute("aria-label") ?? node.textContent ?? "").trim();
    return /^Restart( fight| Simulation|$)/.test(label) && node.offsetParent !== null && !ui.root.contains(node);
  });
  if (candidates.length > 0) candidates[0].click();
  else globalThis.location.reload();
}

// The scenario's gear goes to the application's loadout of the sandbox
// (bridge.js); the application then enters the arena with it, which
// restarts the run, and the promise settles once it has.
const loadoutOf = (gear) => ({ equipment: gear.equipment, inventory: gear.inventory, supplies: gear.supplies });
const applyGear = (gear, encounterKind) => requestApp("apply-loadout", { loadout: loadoutOf(gear), encounterKind });

async function play() {
  ui.draft = setActiveScenario(ui.draft);
  if (!isDraftInThisArena()) {
    goToArena(ui.draft.arena, 2);
    return;
  }
  // The boss's scene or the sandbox's is chosen as a visit starts
  // (presentation.js): entering the arena again starts one. The scene on
  // screen is the running scenario's (visit.js); the draft says the next.
  const sceneChanges = Boolean(ui.arena.hostKind && ui.draft.options.bossMechanics) !== ui.hostedVisit;
  // Entering the arena makes the editor again: it reopens where it was.
  if (sceneChanges || ui.draft.gear) reopenAt(ui.step);
  try {
    if (ui.draft.gear) await applyGear(ui.draft.gear, ui.kind);
    else if (sceneChanges) await requestApp("enter", { encounterKind: ui.kind });
    else restartFight();
    setStatus("Restarted with the scenario. Press Start encounter.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

// --- the map -----------------------------------------------------------------
function refreshTiles() {
  // The arena's own (the Leviathan's bridge), or the map's as it refines it
  // (Duke's ice), as the run's (encounter.js, refineArenaConfig); made again
  // only when the arena or the map's changes.
  const registered = getRegisteredArenaConfig(sandboxKind);
  if (ui.tilesFor?.arena !== ui.arena || ui.tilesFor?.registered !== registered) {
    const own = ui.arena.arenaConfig?.() ?? (registered && (ui.arena.refineArena?.(registered) ?? registered));
    ui.tilesFor = { arena: ui.arena, registered, walkableTiles: own?.walkableTiles ?? null };
  }
  const source = ui.tilesFor.walkableTiles;
  if (source === ui.tilesSource) return false;
  ui.tilesSource = source;
  if (!source || source.size === 0) {
    ui.tiles = null;
    const [x, y] = ui.arena.playerStart;
    ui.bounds = { minX: x - 15, maxX: x + 15, minY: y - 15, maxY: y + 15 };
    return true;
  }
  ui.tiles = source;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of source) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  ui.bounds = { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
  return true;
}
const isWalkable = (x, y) => (ui.tiles ? ui.tiles.has(`${x},${y}`) : true);
const columns = () => ui.bounds.maxX - ui.bounds.minX + 1;
const rows = () => ui.bounds.maxY - ui.bounds.minY + 1;
const tilePixels = () => ui.canvas.width / columns();

function tileAtPointer(event) {
  const rect = ui.canvas.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return null;
  const x = ui.bounds.minX + Math.floor(((event.clientX - rect.left) / rect.width) * columns());
  const y = ui.bounds.maxY - Math.floor(((event.clientY - rect.top) / rect.height) * rows());
  return [x, y];
}
const footprintTiles = ([x, y], size) => Array.from({ length: size * size }, (_, i) => [x + (i % size), y + Math.floor(i / size)]);
const covers = (position, size, [x, y]) => x >= position[0] && x < position[0] + size && y >= position[1] && y < position[1] + size;

// Can a footprint (or the player, size 1) stand there: walkable, and on no one else.
const obstacleId = (index) => `rock:${index}`;
function obstacleAt(tile) {
  const obstacles = ui.draft.obstacles ?? [];
  for (let index = obstacles.length - 1; index >= 0; index--) if (covers(obstacles[index], obstacleSize, tile)) return index;
  return -1;
}
function canPlace(position, size, ignoreId) {
  const tiles = footprintTiles(position, size);
  if (!tiles.every(([x, y]) => isWalkable(x, y))) return false;
  const obstacles = ui.draft.obstacles ?? [];
  for (let index = 0; index < obstacles.length; index++) {
    if (obstacleId(index) === ignoreId) continue;
    if (tiles.some((tile) => covers(obstacles[index], obstacleSize, tile))) return false;
  }
  for (const npc of ui.draft.npcs) {
    if (npc.id === ignoreId) continue;
    const otherSize = getSandboxNpcEntry(npc.npc).size;
    if (tiles.some((tile) => covers(npc.position, otherSize, tile))) return false;
  }
  if (ignoreId !== playerTeam && tiles.some((tile) => covers(playerStartOf(ui.draft), 1, tile))) return false;
  if (bossesOnMap().some((boss) => tiles.some((tile) => covers(boss.position, boss.size, tile)))) return false;
  return true;
}

function npcAt(tile) {
  for (let i = ui.draft.npcs.length - 1; i >= 0; i--) {
    const npc = ui.draft.npcs[i];
    if (covers(npc.position, getSandboxNpcEntry(npc.npc).size, tile)) return npc;
  }
  return null;
}
// The teams a right click goes through in a free-for-all: none (each for
// itself), 1 to 4, and the player's side.
const teamCycle = [undefined, "1", "2", "3", "4", playerTeam];
const teamColours = { 1: "#e0533d", 2: "#3d8fe0", 3: "#5fc45f", 4: "#e0b83d", [playerTeam]: "#2ec4ff" };
const teamLabel = (team) => (team === playerTeam ? "A" : team === undefined ? "" : String(team).slice(0, 2));
const npcColour = (npc) =>
  ui.draft.mode === "ffa" ? teamColours[npc.team] ?? colourOf(npc.team ?? npc.id) : colourOf(getSandboxNpcEntry(npc.npc).group);
function cycleTeam(npc) {
  const next = teamCycle[(teamCycle.indexOf(npc.team) + 1) % teamCycle.length];
  if (next === undefined) delete npc.team;
  else npc.team = next;
  setStatus(`${getSandboxNpcEntry(npc.npc).name}: ${next === undefined ? "no team (fights everyone)" : next === playerTeam ? "on your side" : `team ${next}`}.`);
  commit();
}

// The arena's boss, with its mechanics on: where its NPCs start, from the
// run's snapshot (encounter.js, bosses) when the run is of this arena. It is
// drawn on the map, cannot be moved, and its team (free-for-all) goes round
// with a right click, as a monster's does.
function bossesOnMap() {
  const sandbox = ui.simulationState?.encounter?.sandbox;
  if (!ui.draft.options.bossMechanics || !getSandboxArena(ui.draft.arena).hostKind || sandbox?.arena !== ui.draft.arena) return [];
  return sandbox.bosses ?? [];
}
const bossAt = (tile) => bossesOnMap().find((boss) => covers(boss.position, boss.size, tile)) ?? null;
function cycleBossTeam(boss) {
  const { bossTeam, ...rest } = ui.draft.options;
  const next = teamCycle[(teamCycle.indexOf(bossTeam) + 1) % teamCycle.length];
  ui.draft.options = next === undefined ? rest : { ...rest, bossTeam: next };
  setStatus(`${boss.name}: ${next === undefined ? "a team of its own" : next === playerTeam ? "on your side" : `team ${next}`}.`);
  commit();
}

function cssColour(name, fallback) {
  const value = getComputedStyle(ui.panel).getPropertyValue(name).trim();
  return value || fallback;
}

function drawMap() {
  const canvas = ui.canvas;
  if (!canvas || !canvas.isConnected) return;
  const width = canvas.clientWidth || 400;
  const ratio = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round((width * ratio * rows()) / columns());
  const size = tilePixels();
  const g = canvas.getContext("2d");
  const toPixel = (x, y) => [(x - ui.bounds.minX) * size, (ui.bounds.maxY - y) * size];
  g.fillStyle = cssColour("--color-surface-inset", "#14100c");
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = cssColour("--color-surface-hover", "#4a3d2e");
  for (let x = ui.bounds.minX; x <= ui.bounds.maxX; x++) {
    for (let y = ui.bounds.minY; y <= ui.bounds.maxY; y++) {
      if (!isWalkable(x, y)) continue;
      const [px, py] = toPixel(x, y);
      g.fillRect(px + 0.5, py + 0.5, size - 1, size - 1);
    }
  }
  const font = Math.max(9, Math.round(size * 0.7));
  g.textAlign = "center";
  g.textBaseline = "middle";
  (ui.draft.obstacles ?? []).forEach((position, index) => {
    if (ui.drag?.id === obstacleId(index) && ui.drag.moved) return;
    const [px, py] = toPixel(position[0], position[1] + obstacleSize - 1);
    // A boulder grey, a low obstacle (a jug) the colour of clay.
    g.fillStyle = position[2] === "low" ? "#b07a48" : "#6b6157";
    g.fillRect(px + 1, py + 1, obstacleSize * size - 2, obstacleSize * size - 2);
    g.strokeStyle = "#2a241e";
    g.lineWidth = 1.5 * ratio;
    g.strokeRect(px + 1, py + 1, obstacleSize * size - 2, obstacleSize * size - 2);
  });
  // The boss: dashed, as it is not the scenario's to move.
  for (const boss of bossesOnMap()) {
    const [px, py] = toPixel(boss.position[0], boss.position[1] + boss.size - 1);
    const team = ui.draft.options.bossTeam;
    const colour = ui.draft.mode === "ffa" && team !== undefined ? teamColours[team] ?? colourOf(team) : "#c23b2e";
    const side = boss.size * size - 2;
    g.fillStyle = colour + "44";
    g.fillRect(px + 1, py + 1, side, side);
    g.setLineDash([4 * ratio, 3 * ratio]);
    g.strokeStyle = colour;
    g.lineWidth = 2 * ratio;
    g.strokeRect(px + 1, py + 1, side, side);
    g.setLineDash([]);
    g.fillStyle = "#ffffff";
    g.font = `${font}px "RuneScape Bold 12", sans-serif`;
    g.fillText(abbreviation(boss.name), px + (boss.size * size) / 2, py + (boss.size * size) / 2);
    const label = ui.draft.mode === "ffa" ? (team === undefined ? "B" : teamLabel(team)) : "";
    if (label) {
      const badgeFont = Math.round(font * 1.4);
      const badge = Math.round(badgeFont * 1.3);
      g.fillStyle = "#000000dd";
      g.fillRect(px - badge / 3, py - badge / 3, badge, badge);
      g.strokeStyle = colour;
      g.lineWidth = 1.5 * ratio;
      g.strokeRect(px - badge / 3, py - badge / 3, badge, badge);
      g.fillStyle = colour;
      g.font = `${badgeFont}px "RuneScape Bold 12", sans-serif`;
      g.fillText(label, px - badge / 3 + badge / 2, py - badge / 3 + badge / 2);
    }
  }
  for (const npc of ui.draft.npcs) {
    if (ui.drag?.id === npc.id && ui.drag.moved) continue;
    const entry = getSandboxNpcEntry(npc.npc);
    const [px, py] = toPixel(npc.position[0], npc.position[1] + entry.size - 1);
    const colour = npcColour(npc);
    g.fillStyle = colour + "55";
    g.fillRect(px + 1, py + 1, entry.size * size - 2, entry.size * size - 2);
    g.strokeStyle = npc.id === ui.selectedId ? "#ffffff" : colour;
    g.lineWidth = npc.id === ui.selectedId ? 2.5 * ratio : 1.5 * ratio;
    g.strokeRect(px + 1, py + 1, entry.size * size - 2, entry.size * size - 2);
    g.fillStyle = "#ffffff";
    g.font = `${font}px "RuneScape Bold 12", sans-serif`;
    g.fillText(abbreviation(entry.name), px + (entry.size * size) / 2, py + (entry.size * size) / 2);
    // Its team, in a free-for-all: a number in the corner (A: the player's side).
    const label = ui.draft.mode === "ffa" ? teamLabel(npc.team) : "";
    if (label) {
      const badgeFont = Math.round(font * 1.4);
      const badge = Math.round(badgeFont * 1.3);
      g.fillStyle = "#000000dd";
      g.fillRect(px - badge / 3, py - badge / 3, badge, badge);
      g.strokeStyle = teamColours[npc.team] ?? "#ffffff";
      g.lineWidth = 1.5 * ratio;
      g.strokeRect(px - badge / 3, py - badge / 3, badge, badge);
      g.fillStyle = teamColours[npc.team] ?? "#ffffff";
      g.font = `${badgeFont}px "RuneScape Bold 12", sans-serif`;
      g.fillText(label, px - badge / 3 + badge / 2, py - badge / 3 + badge / 2);
    }
  }
  if (!(ui.drag?.id === playerTeam && ui.drag.moved)) {
    const [px, py] = toPixel(...playerStartOf(ui.draft));
    g.fillStyle = cssColour("--color-spawn-player", "#2ec4ff");
    g.fillRect(px + 1, py + 1, size - 2, size - 2);
    g.fillStyle = "#000000";
    g.font = `${font}px "RuneScape Bold 12", sans-serif`;
    g.fillText("P", px + size / 2, py + size / 2);
  }
  if (ui.drag?.moved && ui.hover) {
    const position = [ui.hover[0] - ui.drag.offset[0], ui.hover[1] - ui.drag.offset[1]];
    const ok = canPlace(position, ui.drag.size, ui.drag.id);
    const [px, py] = toPixel(position[0], position[1] + ui.drag.size - 1);
    g.fillStyle = ok ? "rgba(95, 211, 95, 0.45)" : "rgba(255, 90, 79, 0.45)";
    g.fillRect(px, py, ui.drag.size * size, ui.drag.size * size);
  }
}

// One drag, from the list or from the map: { id, entryId?, size, offset, moved }.
// `id` is an NPC's, or "player" for the start tile, or null for a new monster.
function startDrag(event, drag) {
  event.preventDefault();
  ui.drag = { ...drag, startX: event.clientX, startY: event.clientY, moved: drag.id === null };
  const ghost = el("div", { class: "sbx-ghost", text: drag.label });
  ui.drag.ghost = ghost;
  document.body.append(ghost);
  const move = (moveEvent) => {
    if (!ui.drag) return;
    if (Math.hypot(moveEvent.clientX - ui.drag.startX, moveEvent.clientY - ui.drag.startY) > 3) ui.drag.moved = true;
    ghost.style.left = `${moveEvent.clientX + 12}px`;
    ghost.style.top = `${moveEvent.clientY + 12}px`;
    ghost.style.display = ui.drag.moved ? "" : "none";
    ui.hover = tileAtPointer(moveEvent);
    drawMap();
  };
  const end = (endEvent) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    ghost.remove();
    const current = ui.drag;
    ui.drag = null;
    const tile = endEvent.type === "pointerup" ? tileAtPointer(endEvent) : null;
    ui.hover = null;
    if (current.moved && tile) drop(current, [tile[0] - current.offset[0], tile[1] - current.offset[1]]);
    else drawMap();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  move(event);
}

function drop(drag, position) {
  if (!canPlace(position, drag.size, drag.id)) {
    setStatus("That tile is blocked or taken.", true);
    drawMap();
    return;
  }
  if (drag.id === playerTeam) {
    ui.draft.options = { ...ui.draft.options, playerStart: position };
    setStatus(`Player starts at ${position.join(", ")}.`);
  } else if (drag.id?.startsWith("rock:")) {
    const index = Number(drag.id.slice(5));
    ui.draft.obstacles[index] = [...position, ...ui.draft.obstacles[index].slice(2)];
  } else if (drag.obstacle) {
    const obstacles = ui.draft.obstacles ?? [];
    if (obstacles.length >= maxScenarioObstacles) {
      setStatus(`At most ${maxScenarioObstacles} boulders.`, true);
      drawMap();
      return;
    }
    ui.draft.obstacles = [...obstacles, drag.low ? [...position, "low"] : position];
    setStatus(`Placed ${drag.low ? "a jug" : "a boulder"}. Right-click it to take it away.`);
  } else if (drag.id) {
    draftNpc(drag.id).position = position;
    ui.selectedId = drag.id;
  } else {
    if (ui.draft.npcs.length >= maxScenarioNpcs) {
      setStatus(`At most ${maxScenarioNpcs} monsters.`, true);
      drawMap();
      return;
    }
    const taken = new Set(ui.draft.npcs.map((npc) => npc.id));
    const base = drag.entryId.split(".").pop().replace(/_/g, "-");
    let n = 1;
    while (taken.has(`${base}-${n}`)) n++;
    const npc = { id: `${base}-${n}`, npc: drag.entryId, position };
    ui.draft.npcs.push(npc);
    ui.selectedId = npc.id;
    setStatus(`Placed ${getSandboxNpcEntry(drag.entryId).name}.`);
  }
  commit();
}

// A right click: the next team for a monster or the boss (free-for-all), or a boulder away.
function onMapContextMenu(event) {
  event.preventDefault();
  const tile = tileAtPointer(event);
  if (!tile) return;
  const npc = npcAt(tile);
  if (npc) {
    if (ui.draft.mode !== "ffa") {
      setStatus("Teams count in Free for all (step 1).", true);
      return;
    }
    cycleTeam(npc);
    return;
  }
  const boss = bossAt(tile);
  if (boss) {
    if (ui.draft.mode !== "ffa") {
      setStatus("Teams count in Free for all (step 1).", true);
      return;
    }
    cycleBossTeam(boss);
    return;
  }
  const rock = obstacleAt(tile);
  if (rock >= 0) {
    ui.draft.obstacles = ui.draft.obstacles.filter((_, index) => index !== rock);
    if (ui.draft.obstacles.length === 0) delete ui.draft.obstacles;
    setStatus("Took it away.");
    commit();
  }
}

function onMapPointerDown(event) {
  // The right button is the context menu's (onMapContextMenu).
  if (event.button === 2) return;
  const tile = tileAtPointer(event);
  if (!tile) return;
  const start = playerStartOf(ui.draft);
  if (tile[0] === start[0] && tile[1] === start[1]) {
    startDrag(event, { id: playerTeam, size: 1, offset: [0, 0], label: "Player start" });
    return;
  }
  const npc = npcAt(tile);
  const boss = npc ? null : bossAt(tile);
  if (boss) {
    setStatus(`${boss.name} starts here, where its own fight puts it; it cannot be moved.${ui.draft.mode === "ffa" ? " Right click: its team." : ""}`);
    return;
  }
  const rock = npc ? -1 : obstacleAt(tile);
  if (rock >= 0) {
    const position = ui.draft.obstacles[rock];
    startDrag(event, { id: obstacleId(rock), size: obstacleSize, offset: [tile[0] - position[0], tile[1] - position[1]], label: "Boulder" });
    return;
  }
  if (!npc) {
    if (ui.selectedId) {
      ui.selectedId = null;
      renderBody();
    }
    return;
  }
  const entry = getSandboxNpcEntry(npc.npc);
  if (ui.selectedId !== npc.id) {
    ui.selectedId = npc.id;
    renderBody();
  }
  startDrag(event, { id: npc.id, size: entry.size, offset: [tile[0] - npc.position[0], tile[1] - npc.position[1]], label: entry.name });
}

// --- the steps ---------------------------------------------------------------
function stepArena() {
  const draft = ui.draft;
  const nodes = [];
  nodes.push(el("h3", { text: "Scenario" }));
  const name = el("input", { value: draft.meta.name, maxlength: 80, oninput: (event) => { draft.meta.name = event.target.value; commit(false); } });
  const author = el("input", { value: draft.meta.author, maxlength: 40, oninput: (event) => { draft.meta.author = event.target.value; commit(false); } });
  const description = el("textarea", { maxlength: 500, oninput: (event) => { draft.meta.description = event.target.value; commit(false); } });
  description.value = draft.meta.description;
  nodes.push(el("div", { class: "sbx-row" }, [field("Name", name), field("Author", author)]));
  nodes.push(field("Description", description));

  nodes.push(el("h3", { text: "Arena" }));
  nodes.push(el("div", { class: "sbx-grid" }, sandboxArenas.map((arena) =>
    el("button", {
      class: "sbx-card", type: "button", "aria-pressed": String(arena.id === draft.arena),
      onclick: () => {
        if (arena.id === ui.arena.id) {
          draft.arena = arena.id;
          commit();
          showStep(2);
        } else goToArena(arena.id, 2);
      },
    }, [el("b", { text: arena.name }), el("small", { text: arena.id === ui.arena.id ? "You are here" : "Go there" })]),
  )));

  nodes.push(el("h3", { text: "Mode" }));
  const modeCard = (mode, title, text) =>
    el("button", { class: "sbx-card", type: "button", "aria-pressed": String(draft.mode === mode), onclick: () => { draft.mode = mode; commit(); } },
      [el("b", { text: title }), el("small", { text })]);
  nodes.push(el("div", { class: "sbx-grid" }, [
    modeCard("versus", "All against you", "Every monster attacks the player."),
    modeCard("ffa", "Free for all", "Monsters fight each other too. Last standing wins."),
  ]));
  if (draft.mode === "ffa") {
    const box = el("input", { type: "checkbox", onchange: (event) => { draft.options = { ...draft.options, ffaIncludesPlayer: event.target.checked }; commit(); } });
    box.checked = draft.options.ffaIncludesPlayer;
    nodes.push(el("label", { class: "sbx-row" }, [box, "Monsters may attack the player (off: you only watch)"]));
    nodes.push(el("p", { class: "sbx-note", text: `Give monsters a team in step 2 to make sides; the team "${playerTeam}" fights for you.` }));
  }

  const arena = getSandboxArena(draft.arena);
  if (arena.hostKind) {
    nodes.push(el("h3", { text: "Boss" }));
    const box = el("input", { type: "checkbox", onchange: (event) => { draft.options = { ...draft.options, bossMechanics: event.target.checked }; commit(); } });
    box.checked = draft.options.bossMechanics;
    nodes.push(el("label", { class: "sbx-row" }, [box, "Fight this arena's boss with all its mechanics"]));
    nodes.push(el("p", { class: "sbx-note", text: "The boss starts where its own fight puts it, with its own attacks, phases and hazards; your monsters fight beside it. The run is won when both are beaten." }));
    if (draft.mode === "ffa" && draft.options.bossMechanics) {
      const team = el("input", {
        value: draft.options.bossTeam ?? "", maxlength: 20, placeholder: "its own", list: "sbx-boss-teams",
        onchange: (event) => {
          const { bossTeam, ...rest } = draft.options;
          const value = event.target.value.trim();
          draft.options = value ? { ...rest, bossTeam: value } : rest;
          commit();
        },
      });
      const teams = el("datalist", { id: "sbx-boss-teams" }, ["1", "2", "3", "4", playerTeam].map((value) => el("option", { value })));
      nodes.push(el("div", { class: "sbx-row" }, [field("Boss team", team), teams]));
      nodes.push(el("p", { class: "sbx-note", text: `In a free for all the boss fights the monsters of the other teams with its own mechanics, the nearest first; with the team "${playerTeam}" it fights for you.` }));
    }
  }

  // The examples of the mode chosen above.
  const shown = sandboxExamples.filter(({ scenario }) => scenario.mode === draft.mode);
  nodes.push(el("h3", { text: `Examples · ${draft.mode === "ffa" ? "Free for all" : "All against you"} (${shown.length})` }));
  nodes.push(el("div", { class: "sbx-grid" }, shown.map(({ scenario }) =>
    el("button", { class: "sbx-card", type: "button", title: scenario.meta.description, onclick: () => loadDraft(scenario) }, [
      el("b", { text: scenario.meta.name }),
      el("small", { text: `${getSandboxArena(scenario.arena).name} · ${scenario.npcs.length} monsters${scenario.obstacles ? ` · ${scenario.obstacles.length} rocks` : ""}` }),
    ]),
  )));

  if (libraryScenarios.length > 0) {
    nodes.push(el("h3", { text: "Library" }));
    nodes.push(el("p", { class: "sbx-note", text: "Scenarios players added to OpenScim (client/encounters/sandbox/scenarios/)." }));
    nodes.push(el("div", { class: "sbx-grid" }, libraryScenarios.map(({ scenario }) =>
      el("button", { class: "sbx-card", type: "button", title: scenario.meta.description, onclick: () => loadDraft(scenario) }, [
        el("b", { text: scenario.meta.name }),
        el("small", { text: `${scenario.meta.author ? `by ${scenario.meta.author} · ` : ""}${getSandboxArena(scenario.arena).name} · ${scenario.npcs.length}` }),
      ]),
    )));
  }

  const saved = listSavedScenarios();
  nodes.push(el("h3", { text: "Saved in this browser" }));
  nodes.push(saved.length === 0
    ? el("p", { class: "sbx-note", text: "Nothing saved yet: step 3 saves." })
    : el("div", { class: "sbx-list" }, saved.map((entry) => el("div", { class: "sbx-row" }, [
        el("span", { text: `${entry.scenario.meta.name} (${getSandboxArena(entry.scenario.arena).name})` }),
        button("Load", () => loadDraft(entry.scenario, entry.id), "default", { class: "osrs-btn osrs-btn--small" }),
        button("Delete", () => { deleteSavedScenario(entry.id); renderBody(); }, "ghost", { class: "osrs-btn osrs-btn--ghost osrs-btn--small" }),
      ]))));
  nodes.push(el("div", { class: "sbx-row" }, [button("New empty scenario", () => loadDraft(createEmptyScenario(ui.arena.id)), "ghost")]));
  return nodes;
}

function stepMonsters() {
  const draft = ui.draft;
  const nodes = [];
  if (!isDraftInThisArena()) {
    nodes.push(el("p", { class: "sbx-note", text: `This scenario is set in ${getSandboxArena(draft.arena).name}.` }));
    nodes.push(button(`Go to ${getSandboxArena(draft.arena).name}`, () => goToArena(draft.arena, 2)));
    return nodes;
  }
  nodes.push(el("p", { class: "sbx-note", text: draft.mode === "ffa"
    ? "Drag a monster, a rock or the player (P) onto the map; drag to move, click to edit. Right-click a monster for its next team (the number; A is your side), a rock to take it away."
    : "Drag a monster, a rock or the player (P) onto the map; drag to move, click to edit. Right-click a rock to take it away." }));
  ui.canvas = el("canvas", { class: "sbx-map", onpointerdown: onMapPointerDown, oncontextmenu: onMapContextMenu });
  nodes.push(el("div", { class: "sbx-map-wrap" }, ui.canvas));
  if (!ui.tiles) nodes.push(el("p", { class: "sbx-note", text: "The arena's tiles are still loading; every tile is shown as open." }));

  nodes.push(el("h3", { text: "Drag onto the map" }));
  const chips = [el("div", {
    class: "sbx-chip sbx-chip--player",
    onpointerdown: (event) => startDrag(event, { id: playerTeam, size: 1, offset: [0, 0], label: "Player start" }),
  }, [el("i"), "Player start"]),
  el("div", {
    class: "sbx-chip", title: "A boulder: blocks the way and the line of sight. Several make a wall.",
    onpointerdown: (event) => startDrag(event, { id: null, obstacle: true, size: obstacleSize, offset: [0, 0], label: "Boulder" }),
  }, [el("i", { style: "background: #6b6157" }), "Boulder (obstacle)"]),
  el("div", {
    class: "sbx-chip", title: "A jug: blocks the way, but attacks from afar pass over it, as over a table.",
    onpointerdown: (event) => startDrag(event, { id: null, obstacle: true, low: true, size: obstacleSize, offset: [0, 0], label: "Jug" }),
  }, [el("i", { style: "background: #b07a48" }), "Jug (low obstacle)"])];
  for (const entry of sandboxNpcCatalog) {
    chips.push(el("div", {
      class: "sbx-chip", title: `${entry.group} · ${entry.size}×${entry.size}`,
      onpointerdown: (event) => startDrag(event, { id: null, entryId: entry.id, size: entry.size, offset: [Math.floor((entry.size - 1) / 2), Math.floor((entry.size - 1) / 2)], label: entry.name }),
    }, [el("i", { style: `background: ${colourOf(entry.group)}` }), entry.name]));
  }
  nodes.push(el("div", { class: "sbx-palette" }, chips));

  nodes.push(el("h3", { text: `Placed (${draft.npcs.length}/${maxScenarioNpcs})` }));
  nodes.push(draft.npcs.length === 0
    ? el("p", { class: "sbx-note", text: "No monsters yet." })
    : el("div", { class: "sbx-palette" }, draft.npcs.map((npc) => el("div", {
        class: "sbx-chip", style: npc.id === ui.selectedId ? "border-color: var(--color-primary, #ff981f)" : "",
        onclick: () => { ui.selectedId = npc.id; renderBody(); },
      }, [el("i", { style: `background: ${npcColour(npc)}` }), `${getSandboxNpcEntry(npc.npc).name}${npc.team ? ` [${npc.team}]` : ""}`]))));

  const selected = ui.selectedId ? draftNpc(ui.selectedId) : null;
  if (selected) nodes.push(...npcProperties(selected));
  queueMicrotask(drawMap);
  return nodes;
}

function npcProperties(npc) {
  const entry = getSandboxNpcEntry(npc.npc);
  const nodes = [el("h3", { text: `Selected: ${entry.name}` })];
  const numberInput = (key, placeholder, min, max) => {
    const input = el("input", { type: "number", min, max, placeholder, value: npc[key] ?? "" });
    input.addEventListener("change", () => {
      const value = input.value === "" ? undefined : Math.round(Number(input.value));
      if (value === undefined || !Number.isFinite(value)) delete npc[key];
      else npc[key] = Math.min(max, Math.max(min, value));
      commit();
    });
    return input;
  };
  const type = el("select", {}, sandboxNpcCatalog.map((candidate) => el("option", { value: candidate.id, text: candidate.name, selected: candidate.id === npc.npc })));
  type.addEventListener("change", () => {
    const size = getSandboxNpcEntry(type.value).size;
    const previous = npc.npc;
    npc.npc = type.value;
    if (!canPlace(npc.position, size, npc.id)) {
      npc.npc = previous;
      setStatus("It does not fit there; move it first.", true);
    }
    commit();
  });
  const position = (axis) => {
    const input = el("input", { type: "number", min: 0, max: 255, value: npc.position[axis] });
    input.addEventListener("change", () => {
      const next = [...npc.position];
      next[axis] = Math.round(Number(input.value));
      if (canPlace(next, entry.size, npc.id)) npc.position = next;
      else setStatus("That tile is blocked or taken.", true);
      commit();
    });
    return input;
  };
  const team = el("input", { value: npc.team ?? "", maxlength: 20, placeholder: "none", list: "sbx-teams" });
  team.addEventListener("change", () => {
    const value = team.value.trim();
    if (value) npc.team = value;
    else delete npc.team;
    commit();
  });
  const teams = el("datalist", { id: "sbx-teams" }, [playerTeam, "red", "blue", "green", ...new Set(ui.draft.npcs.map((other) => other.team).filter(Boolean))]
    .filter((value, index, all) => all.indexOf(value) === index).map((value) => el("option", { value })));
  nodes.push(field("Monster", type));
  nodes.push(el("div", { class: "sbx-row" }, [field("X", position(0)), field("Y", position(1)), field("Team (FFA)", team), teams]));
  nodes.push(el("div", { class: "sbx-row" }, [
    field("Hitpoints", numberInput("hp", "table", 1, 100000)),
    field("Max hit", numberInput("maxHit", entry.attacks[0].maxHit ?? "formula", 0, 1000)),
    field("Attack speed", numberInput("attackSpeed", entry.attackSpeed, 1, 50)),
  ]));
  const levelInputs = ["attack", "strength", "defence", "ranged", "magic"].map((level) => {
    const input = el("input", { type: "number", min: 0, max: 5000, placeholder: "table", value: npc.levels?.[level] ?? "" });
    input.addEventListener("change", () => {
      const levels = { ...npc.levels };
      if (input.value === "") delete levels[level];
      else levels[level] = Math.min(5000, Math.max(0, Math.round(Number(input.value))));
      if (Object.keys(levels).length > 0) npc.levels = levels;
      else delete npc.levels;
      commit();
    });
    return field(level[0].toUpperCase() + level.slice(1, 3), input);
  });
  nodes.push(el("div", { class: "sbx-row" }, levelInputs));
  nodes.push(el("div", { class: "sbx-row" }, [
    button("Duplicate", () => duplicate(npc)),
    button("Remove", () => {
      ui.draft.npcs = ui.draft.npcs.filter((other) => other.id !== npc.id);
      ui.selectedId = null;
      commit();
    }, "danger"),
  ]));
  return nodes;
}

// A copy on the nearest free spot around the original.
function duplicate(npc) {
  const size = getSandboxNpcEntry(npc.npc).size;
  for (let radius = 1; radius < 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const position = [npc.position[0] + dx * size, npc.position[1] + dy * size];
        if (!canPlace(position, size, null)) continue;
        const taken = new Set(ui.draft.npcs.map((other) => other.id));
        let n = 2;
        while (taken.has(`${npc.id}-${n}`)) n++;
        const copy = { ...structuredClone(npc), id: `${npc.id}-${n}`.slice(0, 32), position };
        ui.draft.npcs.push(copy);
        ui.selectedId = copy.id;
        commit();
        return;
      }
    }
  }
  setStatus("No free spot nearby.", true);
}

function gearSection() {
  const gear = ui.draft.gear;
  const items = gear ? Object.keys(gear.equipment).length + gear.inventory.filter(Boolean).length : 0;
  return [
    el("h3", { text: "Gear" }),
    el("p", { class: "sbx-note", text: gear
      ? `"${gear.name}": ${Object.keys(gear.equipment).length} worn, ${gear.inventory.filter(Boolean).length} in the inventory. Set when you press Apply & restart, and saved, exported and shared with the scenario.`
      : "None: the scenario is played with whatever you wear. Choose a loadout, then keep it here." }),
    el("div", { class: "sbx-row" }, [
      // The application's setup window for this arena: loadout and presets;
      // its Start Encounter restarts the run with them.
      button("Choose gear…", () => {
        // The setup window is the application's: the panel goes back behind it.
        ui.root.classList.remove("sbx-front");
        requestApp("open-setup", {
          encounterKind: ui.kind, displayName: "Sandbox",
          description: `Your loadout for ${ui.arena.name}. Start Encounter restarts the run with it; "Use my current gear" in the editor keeps it in the scenario.`,
        }).catch((error) => setStatus(error.message, true));
      }),
      button(gear ? "Replace with my current gear" : "Use my current gear", async () => {
        let loadout;
        try {
          loadout = await requestApp("get-loadout");
        } catch (error) {
          setStatus(error.message, true);
          return;
        }
        try {
          ui.draft = normalizeScenario({ ...ui.draft, gear: { name: gear?.name ?? "Scenario gear", ...loadout } });
          commit();
          setStatus("The scenario keeps your current gear.");
        } catch (error) {
          setStatus(error.message, true);
        }
      }),
      gear ? button("Remove gear", () => {
        const { gear: removed, ...rest } = ui.draft;
        ui.draft = normalizeScenario(rest);
        commit();
      }, "ghost") : null,
    ]),
    items > 0 && gear ? el("label", {}, ["Gear name", el("input", { value: gear.name, maxlength: 40, onchange: (event) => { ui.draft.gear = { ...ui.draft.gear, name: event.target.value }; commit(); } })]) : null,
  ];
}

function stepShare() {
  const nodes = [...gearSection()];
  nodes.push(el("h3", { text: "Save" }));
  nodes.push(el("div", { class: "sbx-row" }, [
    button(ui.savedId ? "Save" : "Save in this browser", () => {
      try {
        ui.savedId = saveScenario(ui.draft, ui.savedId);
        setStatus(`Saved "${ui.draft.meta.name}".`);
      } catch (error) {
        setStatus(`Could not save: ${error.message}`, true);
      }
    }),
    ui.savedId ? button("Save as new", () => {
      try {
        ui.savedId = saveScenario(ui.draft);
        setStatus(`Saved a copy of "${ui.draft.meta.name}".`);
      } catch (error) {
        setStatus(`Could not save: ${error.message}`, true);
      }
    }, "ghost") : null,
  ]));
  nodes.push(el("div", { class: "sbx-row" }, [
    button("Export .json", () => {
      const blob = new Blob([scenarioToJson(ui.draft)], { type: "application/json" });
      const link = el("a", { href: URL.createObjectURL(blob), download: `${ui.draft.meta.name.replace(/[^\w-]+/g, "-").toLowerCase() || "scenario"}.sandbox.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }),
  ]));
  nodes.push(el("h3", { text: "Share" }));
  const code = encodeShareCode(ui.draft);
  const link = `${globalThis.location.origin}/${sandboxKind}/${ui.draft.arena.replace(/_/g, "-")}#sbx=${code}`;
  const copy = (value, what) => {
    navigator.clipboard?.writeText(value).then(() => setStatus(`${what} copied.`), () => setStatus("The clipboard is blocked; copy it by hand.", true));
  };
  const codeBox = el("textarea", { readonly: true, rows: 3 });
  codeBox.value = code;
  nodes.push(codeBox);
  nodes.push(el("div", { class: "sbx-row" }, [button("Copy code", () => copy(code, "Code")), button("Copy link", () => copy(link, "Link"), "ghost")]));
  nodes.push(el("p", { class: "sbx-note", text: `${code.length} characters. Anyone who opens the link gets this scenario.` }));
  return nodes;
}

// The start screen: the one import (a code, a link or JSON pasted, or a
// file read into it), then where to go on from.
function stepStart() {
  const nodes = [el("p", { class: "sbx-start-lead", text: "Build a fight of your own, or load one someone shared." })];
  nodes.push(el("h3", { text: "Load a scenario" }));
  const paste = el("textarea", { rows: 3, placeholder: "A code (OSB1...), a link (.../#sbx=...) or a scenario's JSON" });
  const importText = (value) => {
    try {
      loadDraft(importScenarioText(value));
    } catch (error) {
      setStatus(error.message, true);
    }
  };
  const fileInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    paste.value = await file.text();
    importText(paste.value);
  });
  nodes.push(paste);
  nodes.push(el("div", { class: "sbx-row" }, [button("Load", () => importText(paste.value)), button("From a file…", () => fileInput.click(), "ghost"), fileInput]));
  nodes.push(el("h3", { text: "Or" }));
  const card = (title, text, onclick) => el("button", { class: "sbx-card", type: "button", onclick }, [el("b", { text: title }), el("small", { text })]);
  nodes.push(el("div", { class: "sbx-grid" }, [
    card("Go on", `"${ui.draft.meta.name}" · ${getSandboxArena(ui.draft.arena).name}`, () => (isDraftInThisArena() ? showStep(2) : goToArena(ui.draft.arena, 2))),
    card("New scenario", `An empty one in ${ui.arena.name}`, () => loadDraft(createEmptyScenario(ui.arena.id))),
    card("Examples", "Ten against you, ten free-for-alls", () => showStep(1)),
  ]));
  return nodes;
}

// Step 0 is the start screen; 1 to 3 are numbered.
const steps = [
  { title: "Start", render: stepStart },
  { title: "1 Arena", render: stepArena },
  { title: "2 Monsters", render: stepMonsters },
  { title: "3 Gear & share", render: stepShare },
];

function renderBody() {
  if (!ui.body) return;
  const scroll = ui.body.scrollTop;
  ui.canvas = null;
  ui.body.replaceChildren(...steps[ui.step].render());
  ui.body.scrollTop = scroll;
  ui.stepButtons.forEach((node, index) => node.setAttribute("aria-current", index === ui.step ? "step" : "false"));
}
function showStep(step) {
  ui.step = step;
  ui.body.scrollTop = 0;
  renderBody();
}

// --- the panel's life ----------------------------------------------------------
function create(kind) {
  if (!document.getElementById("sbx-style")) document.head.append(el("style", { id: "sbx-style", text: style }));
  ui.kind = kind;
  ui.arena = getSandboxArenaOfKind(kind);
  ui.tilesSource = undefined;
  refreshTiles();
  const active = getActiveScenario();
  ui.draft = active ?? createEmptyScenario(ui.arena.id);
  if (!active) ui.draft = setActiveScenario(ui.draft);
  ui.selectedId = null;
  ui.hostedVisit = isHostedVisit(ui.arena);
  ui.status = el("div", { class: "sbx-status", role: "status" });
  ui.body = el("div", { class: "sbx-body" });
  ui.stepButtons = steps.map((step, index) => button(step.title, () => showStep(index), "ghost"));
  ui.panel = el("section", { class: "sbx-panel", "aria-label": "Sandbox editor", hidden: true }, [
    el("div", { class: "sbx-head" }, [el("h2", { text: `Sandbox · ${ui.arena.name}` }), button("Close", () => setOpen(false), "ghost")]),
    el("div", { class: "sbx-steps" }, ui.stepButtons),
    ui.body,
    el("div", { class: "sbx-foot" }, [
      el("div", { class: "sbx-grow" }, ui.status),
      button("Back", () => showStep(Math.max(0, ui.step - 1)), "ghost"),
      button("Next", () => showStep(Math.min(steps.length - 1, ui.step + 1)), "ghost"),
      button("Apply & restart", play, "primary"),
    ]),
  ]);
  ui.toggle = button("Sandbox editor", () => setOpen(ui.panel.hidden), "default");
  ui.clockButton = button("Start encounter", () => {
    if (sandboxClock.state === "waiting") startSandbox();
    else toggleSandboxPause();
    syncClockButton();
  }, "primary");
  ui.result = el("span", { class: "sbx-result", role: "status", hidden: true });
  ui.countdown = el("div", { class: "sbx-countdown", "aria-live": "polite", hidden: true });
  ui.root = el("div", { class: "sbx-root" }, [el("div", { class: "sbx-hud" }, [ui.clockButton, ui.toggle, ui.result]), ui.countdown, ui.panel]);
  // Keys typed in the panel are the panel's, not the game's hotkeys.
  for (const type of ["keydown", "keyup", "keypress", "wheel"]) ui.root.addEventListener(type, (event) => event.stopPropagation());
  document.body.append(ui.root);
  // The victory screen's "Sandbox editor" (assets/application.js): the panel
  // opens over it, in front of everything until it is closed.
  ui.onOpenRequest = () => {
    ui.root.classList.add("sbx-front");
    setOpen(true);
  };
  globalThis.addEventListener("sandbox-open-editor", ui.onOpenRequest);
  let reopenStep = null;
  try {
    const stored = globalThis.sessionStorage?.getItem(reopenKey);
    globalThis.sessionStorage?.removeItem(reopenKey);
    const step = stored === null || stored === undefined ? NaN : Number(stored);
    reopenStep = Number.isInteger(step) && step >= 0 && step < steps.length ? step : null;
  } catch {
    reopenStep = null;
  }
  ui.step = reopenStep ?? 1;
  renderBody();
  // A share link brought the scenario and the player agreed to its gear: it
  // goes on now, and the run starts again with it.
  if (takeAgreedLinkGear() && ui.draft.gear && isDraftInThisArena()) applyGear(ui.draft.gear, ui.kind).catch((error) => setStatus(error.message, true));
  // Open when the editor sent the page here, when there is nothing to fight,
  // and when the scenario is for another arena (the fight here is empty).
  setOpen(reopenStep !== null || ui.draft.npcs.length === 0 || !isDraftInThisArena());
}

function setOpen(open) {
  ui.panel.hidden = !open;
  if (!open) ui.root.classList.remove("sbx-front");
  ui.toggle.textContent = open ? "Hide sandbox editor" : "Sandbox editor";
  if (open) renderBody();
}

const clockLabels = { waiting: "Start encounter", running: "Pause", paused: "Resume" };
function syncClockButton() {
  if (!ui.clockButton || ui.clockState === sandboxClock.state) return;
  ui.clockState = sandboxClock.state;
  ui.clockButton.textContent = clockLabels[sandboxClock.state];
  ui.clockButton.classList.toggle("sbx-start", sandboxClock.state !== "running");
}

// How a run ended, in the top bar (the encounter's snapshot, encounter.js).
// With the player in it ("versus", or a free-for-all that includes him):
// "You died" when he dies (the run's outcome stays "active": the
// application shows his death), else, once it is won, "Every monster is
// down" or "You win". With the player left out of a free-for-all: the
// winner, or that no one is left standing.
function syncResult(simulationState) {
  const sandbox = simulationState?.encounter?.sandbox;
  const phase = simulationState?.encounterOutcome?.phase;
  let text = "";
  if (sandbox) {
    const playerIsIn = sandbox.mode !== "ffa" || sandbox.ffaIncludesPlayer !== false;
    if (playerIsIn) {
      if (simulationState.isAlive === false) text = "You died";
      else if (phase && phase !== "active") text = sandbox.mode === "ffa" ? "You win" : "Every monster is down";
    } else if (phase && phase !== "active") {
      text = sandbox.winner ? `Winner: ${sandbox.winner}` : "No one is left standing";
    }
  }
  if (ui.result.textContent !== text) ui.result.textContent = text;
  ui.result.hidden = text === "";
}

// The sandbox's own countdown (encounter.js, countdownUntil): the ticks left
// before the monsters act, then "Fight!" for a tick.
function syncCountdown(simulationState) {
  const until = simulationState?.encounter?.sandbox?.countdownUntil ?? 0;
  const tick = simulationState?.currentTick ?? 0;
  let text = "";
  if (sandboxClock.state !== "waiting" && until > 0) {
    if (tick < until) text = String(until - tick);
    else if (tick === until) text = "Fight!";
  }
  if (ui.countdown.textContent !== text) ui.countdown.textContent = text;
  ui.countdown.hidden = text === "";
}

export function syncSandboxEditor(kind, simulationState) {
  if (typeof document === "undefined") return;
  if (ui.root && ui.kind !== kind) closeSandboxEditor();
  if (!ui.root) create(kind);
  // The arena is built from the cache after the scene: the map follows when it is there.
  if (refreshTiles() && ui.step === 2 && !ui.panel.hidden) renderBody();
  ui.simulationState = simulationState;
  // The map shows the boss once the run that has it is there.
  const bosses = JSON.stringify(bossesOnMap());
  if (bosses !== ui.bossesDrawn) {
    ui.bossesDrawn = bosses;
    if (ui.step === 2 && !ui.panel.hidden) drawMap();
  }
  syncClockButton();
  syncResult(simulationState);
  syncCountdown(simulationState);
}

export function closeSandboxEditor() {
  if (ui.onOpenRequest) globalThis.removeEventListener("sandbox-open-editor", ui.onOpenRequest);
  ui.drag?.ghost?.remove();
  ui.root?.remove();
  Object.assign(ui, { root: null, onOpenRequest: null, toggle: null, result: null, countdown: null, clockButton: null, clockState: null, panel: null, body: null, status: null, kind: null, canvas: null, drag: null });
}
