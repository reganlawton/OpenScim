// The sandbox scenario: what a file, a share code and the encounter's seeds
// hold. A scenario is plain JSON:
//
//   {
//     "format": "openscim-sandbox",
//     "version": 1,
//     "meta": { "name": "...", "author": "...", "description": "..." },
//     "arena": "colosseum",                 an id of arenas.js
//     "mode": "versus",                     "versus" or "ffa"
//     "options": {
//       "playerStart": [23, 36],            or null: the arena's own
//       "ffaIncludesPlayer": true,          ffa: may the NPCs attack the player
//       "bossMechanics": false              the arena's boss, with all its
//                                           mechanics (arenas.js, hostKind)
//     },
//     "gear": {                             optional: the loadout the scenario
//       "name": "Max ranged",               is played with (equipment slot to
//       "equipment": { "weapon": 20997 },   item id, the 28 inventory slots,
//       "inventory": [{ "id": 6685 }, null], the supplies: ammunition, spellbook,
//       "supplies": { "equippedAmmo": { "id": 11212 } }   rune pouch...), as
//     },                                    the application keeps a loadout
//     "npcs": [
//       { "id": "npc-1", "npc": "inferno.meleer", "position": [30, 40],
//         "hp": 75, "maxHit": 20, "attackSpeed": 4, "team": "red",
//         "levels": { "attack": 210, "strength": 290, "defence": 120, "ranged": 220, "magic": 120 } }
//     ]
//   }
//
// Only `npc` and `position` are required of an NPC; the others override the
// catalog's entry and the monster table. `team` counts in "ffa" only: NPCs
// of one team do not fight each other, and the team "player" fights on the
// player's side. A newer version must keep reading the files of an older
// one: `normalizeScenario` is where an old version would be brought up.
//
// A share code is the scenario compressed: "OSB1." and the deflated JSON in
// base64url, short enough for a URL (#sbx=<code>), as the replays' codes are.
// Nothing in this module draws a random number or reads the page.
import { pako } from "../../assets/vendor.js";
import { parseCombatSupplies } from "../../engine/supplies.js";
import { getSandboxNpcEntry } from "./catalog.js";
import { isSandboxArenaId, sandboxArenas } from "./arenas.js";

export const scenarioFormat = "openscim-sandbox";
export const scenarioVersion = 1;
export const sandboxModes = ["versus", "ffa"];
export const maxScenarioNpcs = 40;
export const playerTeam = "player";
const shareCodePrefix = "OSB1.";
// A share code's limits. The largest scenario (40 NPCs with every field, the
// gear and the longest texts) is about 13 KB of JSON and 1,200 characters of
// code; a code past these is refused before it is decoded, and its JSON is
// not inflated past 64 KB, so that a crafted code cannot exhaust the tab.
export const maxShareCodeLength = 16384;
export const maxScenarioJsonBytes = 65536;

export class ScenarioError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScenarioError";
  }
}

const text = (value, max, fallback = "") => (typeof value === "string" ? value.slice(0, max) : fallback);
const integer = (value, min, max) => (Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max ? value : undefined);
const tile = (value) => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const x = integer(value[0], 0, 255), y = integer(value[1], 0, 255);
  return x === undefined || y === undefined ? undefined : [x, y];
};
const levelNames = ["attack", "strength", "defence", "ranged", "magic"];

function normalizeNpc(npc, index, takenIds) {
  if (!npc || typeof npc !== "object") throw new ScenarioError(`NPC ${index + 1} is not an object`);
  if (!getSandboxNpcEntry(npc.npc)) throw new ScenarioError(`NPC ${index + 1}: unknown NPC "${npc.npc}"`);
  const position = tile(npc.position);
  if (!position) throw new ScenarioError(`NPC ${index + 1}: position must be [x, y] with whole numbers from 0 to 255`);
  let id = text(npc.id, 32).replace(/[^\w-]/g, "");
  if (!id || takenIds.has(id)) {
    let n = index + 1;
    while (takenIds.has(`npc-${n}`)) n++;
    id = `npc-${n}`;
  }
  takenIds.add(id);
  const result = { id, npc: npc.npc, position };
  const hp = integer(npc.hp, 1, 100000);
  if (hp !== undefined) result.hp = hp;
  const maxHit = integer(npc.maxHit, 0, 1000);
  if (maxHit !== undefined) result.maxHit = maxHit;
  const attackSpeed = integer(npc.attackSpeed, 1, 50);
  if (attackSpeed !== undefined) result.attackSpeed = attackSpeed;
  const team = text(npc.team, 20).trim();
  if (team) result.team = team;
  if (npc.levels && typeof npc.levels === "object") {
    const levels = {};
    for (const name of levelNames) {
      const level = integer(npc.levels[name], 0, 5000);
      if (level !== undefined) levels[name] = level;
    }
    if (Object.keys(levels).length > 0) result.levels = levels;
  }
  return result;
}

const equipmentSlots = ["head", "cape", "amulet", "weapon", "body", "shield", "legs", "hands", "boots", "ring"];
const itemId = (value) => integer(value, 1, 100000);
// Supplies keep only what the application reads of a loadout's supplies
// (engine/supplies.js: ammunition, quiver, rune pouch, blowpipe, spell,
// spellbook), each parsed as it parses them; anything else is dropped.
function normalizeSupplies(supplies) {
  if (!supplies || typeof supplies !== "object" || Array.isArray(supplies)) return {};
  const parsed = parseCombatSupplies(supplies);
  const result = {};
  for (const key of ["equippedAmmo", "quiverAmmo", "blowpipe"]) {
    const id = itemId(parsed[key]?.id);
    if (id !== undefined) result[key] = { id };
  }
  if (parsed.runePouch) {
    result.runePouch = { kind: parsed.runePouch.kind, slots: parsed.runePouch.slots.map((slot) => (itemId(slot?.id) === undefined ? null : { id: slot.id })) };
  }
  if (supplies.spellbook !== undefined) result.spellbook = parsed.spellbook;
  if (parsed.selectedSpell) result.selectedSpell = parsed.selectedSpell;
  return result;
}

function normalizeGear(gear) {
  if (gear === undefined || gear === null) return undefined;
  if (typeof gear !== "object" || Array.isArray(gear)) throw new ScenarioError("gear must be an object");
  const equipment = {};
  for (const slot of equipmentSlots) {
    const id = itemId(gear.equipment?.[slot]);
    if (id !== undefined) equipment[slot] = id;
  }
  const slots = Array.isArray(gear.inventory) ? gear.inventory.slice(0, 28) : [];
  const inventory = Array.from({ length: 28 }, (_, index) => {
    const item = slots[index];
    const id = itemId(item?.id);
    if (id === undefined) return null;
    const quantity = integer(item.quantity, 1, 2147483647);
    return quantity === undefined || quantity === 1 ? { id } : { id, quantity };
  });
  return { name: text(gear.name, 40).trim() || "Scenario gear", equipment, inventory, supplies: normalizeSupplies(gear.supplies) };
}

/** A scenario in its current version, every value checked; throws ScenarioError. */
export function normalizeScenario(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ScenarioError("A scenario is a JSON object");
  if (input.format !== undefined && input.format !== scenarioFormat) throw new ScenarioError(`Not a sandbox scenario (format "${input.format}")`);
  const version = input.version ?? scenarioVersion;
  if (!Number.isInteger(version) || version < 1) throw new ScenarioError("Unknown scenario version");
  if (version > scenarioVersion) throw new ScenarioError(`The scenario is of version ${version}; this client reads up to ${scenarioVersion}`);
  if (!isSandboxArenaId(input.arena)) throw new ScenarioError(`Unknown arena "${input.arena}"`);
  const mode = sandboxModes.includes(input.mode) ? input.mode : "versus";
  const npcs = Array.isArray(input.npcs) ? input.npcs : [];
  if (npcs.length > maxScenarioNpcs) throw new ScenarioError(`At most ${maxScenarioNpcs} NPCs`);
  const takenIds = new Set();
  const meta = input.meta ?? {};
  const options = input.options ?? {};
  const playerStart = tile(options.playerStart) ?? null;
  return {
    format: scenarioFormat,
    version: scenarioVersion,
    meta: {
      name: text(meta.name, 80, "Untitled").trim() || "Untitled",
      author: text(meta.author, 40).trim(),
      description: text(meta.description, 500),
    },
    arena: input.arena,
    mode,
    options: { playerStart, ffaIncludesPlayer: options.ffaIncludesPlayer !== false, bossMechanics: options.bossMechanics === true },
    ...(input.gear ? { gear: normalizeGear(input.gear) } : {}),
    npcs: npcs.map((npc, index) => normalizeNpc(npc, index, takenIds)),
  };
}

export function createEmptyScenario(arena = sandboxArenas[0].id) {
  return normalizeScenario({ arena, mode: "versus", meta: { name: "New scenario" }, npcs: [] });
}

/** Parses a scenario file's text. */
export function parseScenarioJson(json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new ScenarioError(`Not valid JSON: ${error.message}`);
  }
  return normalizeScenario(value);
}

export const scenarioToJson = (scenario) => JSON.stringify(normalizeScenario(scenario), null, 2);

// base64url of bytes, and back, without the page's btoa where Node lacks it.
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function toBase64Url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let c = 0; c < chars; c++) out += base64Alphabet[(n >> (18 - c * 6)) & 63];
  }
  return out;
}
function fromBase64Url(textValue) {
  const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of textValue) {
    const value = base64Alphabet.indexOf(char);
    if (value < 0) throw new ScenarioError("The share code has a character that does not belong in it");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

/** "OSB1." and the scenario deflated, in base64url. */
export function encodeShareCode(scenario) {
  const json = JSON.stringify(normalizeScenario(scenario));
  return shareCodePrefix + toBase64Url(pako.deflateRaw(new TextEncoder().encode(json)));
}

// Inflates chunk by chunk and stops past maxScenarioJsonBytes.
function inflateLimited(bytes) {
  const inflator = new pako.Inflate({ raw: true, chunkSize: 16384 });
  const chunks = [];
  let total = 0;
  // Thrown out of push(): the inflation stops at the chunk that goes past.
  inflator.onData = (chunk) => {
    total += chunk.length;
    if (total > maxScenarioJsonBytes) throw new ScenarioError("The share code holds more than a scenario can");
    chunks.push(chunk);
  };
  inflator.push(bytes, true);
  if (inflator.err || !inflator.ended) throw new ScenarioError("The share code is damaged");
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function decodeShareCode(code) {
  const trimmed = String(code ?? "").trim();
  if (!trimmed.startsWith(shareCodePrefix)) throw new ScenarioError(`A share code starts with "${shareCodePrefix}"`);
  if (trimmed.length > maxShareCodeLength) throw new ScenarioError("The share code is too long to be a scenario");
  let json;
  try {
    json = new TextDecoder().decode(inflateLimited(fromBase64Url(trimmed.slice(shareCodePrefix.length))));
  } catch (error) {
    if (error instanceof ScenarioError) throw error;
    throw new ScenarioError("The share code is damaged");
  }
  return parseScenarioJson(json);
}

/**
 * Accepts a scenario's JSON, a share code, or a URL that carries one
 * (#sbx=...), told apart by the first character: "{" is JSON (whatever its
 * texts mention), "OSB" a code, anything else is searched for a link.
 */
export function importScenarioText(input) {
  const trimmed = String(input ?? "").trim();
  if (trimmed.startsWith("{")) return parseScenarioJson(trimmed);
  if (trimmed.startsWith("OSB")) return decodeShareCode(trimmed);
  const fromUrl = /[#&?]sbx=([\w.-]+)/.exec(trimmed);
  if (fromUrl) return decodeShareCode(fromUrl[1]);
  throw new ScenarioError("Paste a scenario's JSON, a share code (OSB1.…) or a link with #sbx=");
}
