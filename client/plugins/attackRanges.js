// The plugin Attack Ranges: the tiles the player's weapon reaches and he can
// see, the NPCs that stand on them, and "drag protection" for those that do
// not. Rebuilt from the RuneLite plugin of that name
// (github.com/tylerwgrass/attack-ranges, BSD 2-Clause, "Copyright (c) 2024,
// tylerwgrass"), from its options, their defaults and what it draws as
// .scratch/colo-attack-ranges-notes.md describes them; no code of it is
// here. PLUGIN below is that description.
//
// What is the application's own: the reach is the engine's
// (SimulationEngine.getPlayerAttackRange), with the rules of the encounter,
// so it is what the fight uses (Myopia included), and not the plugin's table
// of weapons; the defaults of four colours and of the display mode are the
// user's. The application's Plugins panel (application.js) draws the
// options, its settings keep them (Grid.js), the scenes draw what
// getAttackRangeOverlay returns (rendering.js), and the menu of an NPC asks
// isAttackDragProtected (Grid.js).
import { hasLineOfSight } from "../engine/attackRange.js";
import { getArenaCollisionMap } from "../engine/arena.js";
import { getActiveSpell, getWeaponCategory } from "../data/weaponCategories.js";

const enableStates = [
  { value: "ON", label: "On" },
  { value: "OFF", label: "Off" },
  { value: "INSTANCES_ONLY", label: "Instances only" },
  { value: "HOTKEY_MODE", label: "Hotkey mode" },
];

/** The options in the order of the plugin's panel: { key, label, section, type, default, info, choices?, min?, max? }. */
export const attackRangesOptions = [
  { key: "playerEnableState", label: "Display Overlay", section: "Options", type: "select", choices: enableStates, default: "ON", info: "When the overlay will be shown" },
  { key: "npcHighlightEnableState", label: "Highlight NPCs", section: "Options", type: "select", choices: enableStates, default: "OFF", info: "When to highlight NPCs that can be targeted" },
  { key: "displayHotkey", label: "Display Hotkey", section: "Options", type: "hotkey", default: "", info: "Hotkey to press to display the overlay" },
  {
    key: "displayHotkeyMode",
    label: "Hotkey Mode",
    section: "Options",
    type: "select",
    choices: [
      { value: "TOGGLE", label: "Toggle" },
      { value: "HOLD", label: "Hold" },
    ],
    default: "TOGGLE",
    info: "Whether the hotkey is toggle or hold to display the overlay",
  },
  { key: "allowListedWeapons", label: "Rendered weapons", section: "Options", type: "text", default: "", info: "List of items you want displayed. Supports wildcards. Example: Trident*, rune crossbow" },
  { key: "showManualCasting", label: "Display manual casting", section: "Options", type: "boolean", default: false, info: "Display cast range for weapons when not auto casting" },
  { key: "showMeleeWeapons", label: "Display melee", section: "Options", type: "boolean", default: false, info: "Display the range with melee weapons" },
  { key: "showSpecialAttack", label: "Display special attack", section: "Options", type: "boolean", default: true, info: "Display ranges for special attacks, such as Dinh's Bulwark" },
  { key: "dragProtection", label: "Enable drag protection", section: "Options", type: "boolean", default: false, info: "Hides the Attack option on NPCs not in attack range" },
  {
    key: "displayMode",
    label: "Display Mode",
    section: "Styles",
    type: "select",
    choices: [
      { value: "TILES", label: "Tiles" },
      { value: "BORDER", label: "Border" },
      { value: "EDGE_TILES", label: "Edge tiles" },
    ],
    default: "BORDER",
    info: "How the attack range is displayed",
  },
  // PLUGIN: 86, 234, 103 at alpha 102.
  { key: "rangeBorderColor", label: "Border Color", section: "Styles", type: "color", default: "6656EA67", info: "The color of the your attack range border" },
  // The user's default; the plugin's is black at alpha 50.
  { key: "rangeFillColor", label: "Fill Color", section: "Styles", type: "color", default: "07000000", info: "The inner color of the your attack range section" },
  { key: "borderSize", label: "Border Size", section: "Styles", type: "number", min: 1, max: 10, default: 1, info: "Thickness of your attack range border" },
  { key: "npcHighlightOutlineColor", label: "NPC Outline Color", section: "Styles", type: "color", default: "9000FFFF", info: "The outline color of targetable NPCs" },
  { key: "npcHighlightFillColor", label: "NPC Fill Color", section: "Styles", type: "color", default: "4400FFFF", info: "The inner color of highlighted NPCs" },
  { key: "npcHighlightOutlineThickness", label: "NPC Outline Thickness", section: "Styles", type: "number", min: 1, max: 10, default: 3, info: "Thickness of the highlighted NPCs outline" },
];

/** The settings as the plugin starts: { key: default } of every option. */
export const attackRangesDefaults = Object.fromEntries(attackRangesOptions.map((option) => [option.key, option.default]));

const isArgb = (value) => typeof value === "string" && /^[0-9a-fA-F]{8}$/.test(value);
const isValid = (option, value) =>
  option.type === "boolean"
    ? typeof value === "boolean"
    : option.type === "select"
      ? option.choices.some((choice) => choice.value === value)
      : option.type === "color"
        ? isArgb(value)
        : option.type === "number"
          ? Number.isInteger(value) && value >= option.min && value <= option.max
          : typeof value === "string";

/** Settings as they were stored, with every option that is missing or not valid at its default. */
export function readAttackRangesSettings(stored) {
  const value = stored && typeof stored === "object" ? stored : {};
  return Object.fromEntries(attackRangesOptions.map((option) => [option.key, isValid(option, value[option.key]) ? value[option.key] : option.default]));
}

/** "AARRGGBB" as { color: "#RRGGBB", alpha: 0..1 }. */
export function parseArgb(argb) {
  return { color: `#${argb.slice(2).toUpperCase()}`, alpha: parseInt(argb.slice(0, 2), 16) / 255 };
}

/** PLUGIN: a comma list of item names, `*` any text, case not minded; an empty list allows every weapon. */
export function isAllowListedWeapon(itemName, allowList) {
  const patterns = allowList
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  if (patterns.length === 0) {
    return true;
  }
  if (!itemName) {
    return false;
  }
  return patterns.some((pattern) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i").test(itemName));
}

// PLUGIN "Instances only": the Fight Caves, the Inferno, the Gauntlet and
// the Fortis Colosseum. Of those the application has the Inferno and the
// Colosseum, each as two kinds.
const instanceKinds = new Set(["inferno", "zuk", "sol_heredit", "colosseum"]);
// PLUGIN: a staff or a wand casts from 10 tiles; Dinh's bulwark's special
// reaches 5 (1 and 4 more).
const manualCastRange = 10;
const bulwarkSpecialRange = 5;

/**
 * The reach the plugin shows for the player, or 0 when it shows none.
 * `range` is the engine's; `player` the engine's player.
 */
export function resolveShownRange(range, player, settings) {
  const weaponId = player?.equipment?.weapon ?? null;
  const category = weaponId === null ? null : getWeaponCategory(weaponId);
  if (category === "bulwark") {
    return settings.showSpecialAttack ? bulwarkSpecialRange : range;
  }
  // A staff that is not autocasting fights in melee: the engine's reach is 1.
  if (category === "staff" && range <= 1) {
    const autocasting = getActiveSpell({
      weaponId,
      selectedStyleIndex: player.selectedAttackStyleIndex,
      selectedSpell: player.combatSupplies?.selectedSpell,
      spellbook: player.combatSupplies?.spellbook,
    });
    return autocasting || settings.showManualCasting ? manualCastRange : 0;
  }
  return range;
}

function isShown(enableState, encounterKind, hotkeyOn) {
  return enableState === "ON" || (enableState === "INSTANCES_ONLY" && instanceKinds.has(encounterKind)) || (enableState === "HOTKEY_MODE" && hotkeyOn);
}

// The tiles within `range` of `[x, y]` that the player sees from there
// (PLUGIN: the square round him, a tile counting when it is his own or in his
// line of sight), as "x,y".
function getTilesInRange([playerX, playerY], range) {
  const tiles = new Set();
  for (let x = playerX - range; x <= playerX + range; x++) {
    for (let y = playerY - range; y <= playerY + range; y++) {
      if ((x === playerX && y === playerY) || hasLineOfSight(playerX, playerY, x, y)) {
        tiles.add(`${x},${y}`);
      }
    }
  }
  return tiles;
}

/**
 * What the display mode draws of `tiles`: { fillTiles, outlineTiles, lines }.
 * A line runs along the south side of its tile ("horizontal") or its west
 * side ("vertical"). PLUGIN: Border fills every tile and draws the edges
 * whose neighbour is not one; Tiles fills and outlines every tile; Edge
 * tiles fills and outlines those with a neighbour north, south, east or west
 * that is not one.
 */
export function layOutRange(tiles, displayMode) {
  const has = (x, y) => tiles.has(`${x},${y}`);
  const all = [...tiles].map((tile) => tile.split(",").map(Number));
  if (displayMode === "TILES") {
    return { fillTiles: all, outlineTiles: all, lines: [] };
  }
  if (displayMode === "EDGE_TILES") {
    const edge = all.filter(([x, y]) => !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1));
    return { fillTiles: edge, outlineTiles: edge, lines: [] };
  }
  const lines = [];
  for (const [x, y] of all) {
    if (!has(x, y - 1)) lines.push({ x, y, orientation: "horizontal" });
    if (!has(x, y + 1)) lines.push({ x, y: y + 1, orientation: "horizontal" });
    if (!has(x - 1, y)) lines.push({ x, y, orientation: "vertical" });
    if (!has(x + 1, y)) lines.push({ x: x + 1, y, orientation: "vertical" });
  }
  return { fillTiles: all, outlineTiles: [], lines };
}

// An NPC the plugin counts: one with an action besides Examine. Here every
// living NPC but those of the role "npc" (a lobby's, Minimus), which are
// talked to.
const isAttackable = (npc) => npc.alive !== false && npc.role !== "npc";
const isOnAnyTile = (npc, tiles) => {
  const size = npc.size ?? 1;
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      if (tiles.has(`${npc.position[0] + dx},${npc.position[1] + dy}`)) {
        return true;
      }
    }
  }
  return false;
};

// The tiles of the last call and what they were worked out from: the tile,
// the reach, the collision map, and the flags of every tile line of sight
// can cross from there (the square of the reach, and one tile round it).
// The flags are compared each call, since the fights change the map in place
// (pillars, barriers, hazards).
let tilesCache = null;
const sameCollisionWindow = (cache, collisionMap) => {
  if (cache.collisionMap !== collisionMap) {
    return false;
  }
  if (!collisionMap) {
    return true;
  }
  const { x, y, reach, flags } = cache;
  let i = 0;
  for (let dx = -reach - 1; dx <= reach + 1; dx++) {
    for (let dy = -reach - 1; dy <= reach + 1; dy++) {
      if (collisionMap.getFlag(x + dx, y + dy) !== flags[i++]) {
        return false;
      }
    }
  }
  return true;
};
function getTilesInRangeCached([x, y], reach) {
  const collisionMap = getArenaCollisionMap();
  if (tilesCache && tilesCache.x === x && tilesCache.y === y && tilesCache.reach === reach && sameCollisionWindow(tilesCache, collisionMap)) {
    return tilesCache.tiles;
  }
  let flags = null;
  if (collisionMap) {
    flags = new Int32Array((2 * reach + 3) ** 2);
    let i = 0;
    for (let dx = -reach - 1; dx <= reach + 1; dx++) {
      for (let dy = -reach - 1; dy <= reach + 1; dy++) {
        flags[i++] = collisionMap.getFlag(x + dx, y + dy);
      }
    }
  }
  tilesCache = { x, y, reach, collisionMap, flags, tiles: getTilesInRange([x, y], reach) };
  return tilesCache.tiles;
}

// The layout of the last tiles and display mode.
let layoutCache = null;
function layOutRangeCached(tiles, displayMode) {
  if (layoutCache?.tiles !== tiles || layoutCache.displayMode !== displayMode) {
    layoutCache = { tiles, displayMode, layout: layOutRange(tiles, displayMode) };
  }
  return layoutCache.layout;
}
const noRange = { fillTiles: [], outlineTiles: [], lines: [] };

const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

let overlay = null;
// The last overlay made, kept while nothing is drawn, so that one drawn again
// unchanged is the same object (the scenes key what they build on it).
let lastOverlay = null;
let dragProtectedIds = new Set();

/**
 * Works out what the plugin shows this tick and keeps it for the scenes and
 * the menus. `enabled`: the plugin's switch; `settings`: its options;
 * `encounterKind`; `hotkeyOn`; `playerTile`; `range`: the engine's reach;
 * `player`: the engine's player; `weaponName`: the name of the weapon he
 * wields, for the allow list; `npcs`: the published NPCs ({ id, role,
 * alive, position, size }). Returns the overlay, or null when nothing is
 * drawn.
 */
export function updateAttackRanges({ enabled, settings, encounterKind, hotkeyOn, playerTile, range, player, weaponName = "", npcs }) {
  overlay = null;
  dragProtectedIds = new Set();
  if (!enabled || !playerTile || !(range >= 1)) {
    return null;
  }
  const shownRange = resolveShownRange(range, player, settings);
  const allowed = isAllowListedWeapon(weaponName, settings.allowListedWeapons);
  // PLUGIN: nothing below 1; a reach of 1 only with "Display melee".
  const drawable = shownRange >= 1 && allowed && (settings.showMeleeWeapons || shownRange !== 1);
  // Drag protection asks of the reach the fight uses, whatever is drawn.
  const tile = [Math.round(playerTile[0]), Math.round(playerTile[1])];
  const tiles = getTilesInRangeCached(tile, Math.max(1, shownRange || range));
  const attackable = (npcs ?? []).filter(isAttackable);
  if (settings.dragProtection) {
    dragProtectedIds = new Set(attackable.filter((npc) => !isOnAnyTile(npc, tiles)).map((npc) => npc.id));
  }
  const showRange = drawable && isShown(settings.playerEnableState, encounterKind, hotkeyOn);
  const showNpcs = drawable && isShown(settings.npcHighlightEnableState, encounterKind, hotkeyOn);
  if (!showRange && !showNpcs) {
    return null;
  }
  const layout = showRange ? layOutRangeCached(tiles, settings.displayMode) : noRange;
  const npcIds = showNpcs ? attackable.filter((npc) => isOnAnyTile(npc, tiles)).map((npc) => npc.id) : [];
  const key = {
    layout,
    rangeBorderColor: settings.rangeBorderColor,
    rangeFillColor: settings.rangeFillColor,
    borderSize: settings.borderSize,
    npcHighlightOutlineColor: settings.npcHighlightOutlineColor,
    npcHighlightFillColor: settings.npcHighlightFillColor,
    npcOutlineThickness: settings.npcHighlightOutlineThickness,
  };
  // Nothing it is made of changed: the same overlay.
  if (lastOverlay && Object.entries(key).every(([name, value]) => lastOverlay.key[name] === value) && sameIds(lastOverlay.overlay.npcIds, npcIds)) {
    overlay = lastOverlay.overlay;
    return overlay;
  }
  overlay = {
    ...layout,
    border: parseArgb(settings.rangeBorderColor),
    fill: parseArgb(settings.rangeFillColor),
    borderSize: settings.borderSize,
    npcIds,
    npcOutline: parseArgb(settings.npcHighlightOutlineColor),
    npcFill: parseArgb(settings.npcHighlightFillColor),
    npcOutlineThickness: settings.npcHighlightOutlineThickness,
  };
  lastOverlay = { key, overlay };
  return overlay;
}

/** What the scenes draw: the last overlay updateAttackRanges made, or null. */
export function getAttackRangeOverlay() {
  return overlay;
}

/** Whether the menu of the NPC `actorId` puts Examine above Attack (drag protection). */
export function isAttackDragProtected(actorId) {
  return dragProtectedIds.has(actorId);
}

/** A key event as the text a hotkey is kept as: "Shift+F", "Ctrl+Alt+R", "F5". */
export function describeHotkey(event) {
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
    return "";
  }
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", key].filter(Boolean).join("+");
}

/**
 * Listens for the plugin's hotkey on `target` (the window): `onChange(on)`
 * with the state the hotkey mode gives. Not while the player types in a
 * field. Returns what stops the listening.
 */
export function listenForAttackRangesHotkey(target, getSettings, onChange) {
  let on = false;
  const typing = (event) => event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
  const matches = (event) => {
    const hotkey = getSettings().displayHotkey;
    return hotkey !== "" && describeHotkey(event) === hotkey;
  };
  const down = (event) => {
    if (event.repeat || typing(event) || !matches(event)) {
      return;
    }
    on = getSettings().displayHotkeyMode === "HOLD" ? true : !on;
    onChange(on);
  };
  const up = (event) => {
    // A key let go of ends a hold, whatever was let go of first.
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    if (getSettings().displayHotkeyMode !== "HOLD" || !on || key !== getSettings().displayHotkey.split("+").at(-1)) {
      return;
    }
    on = false;
    onChange(on);
  };
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  return () => {
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
  };
}
