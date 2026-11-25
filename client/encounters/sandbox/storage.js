// The scenarios the player saved, in the page's localStorage. A list of
// { id, savedAt, scenario }, newest first. The editor (editor.js) is its one
// user; nothing of the fight reads it.
//
// An entry this client cannot read (saved by a newer version, or naming a
// catalog id since renamed) is not listed, but it is kept as it was: saving
// or deleting another entry writes it back unchanged, never drops it.
import { normalizeScenario } from "./scenario.js";

const savedKey = "openscim.sandbox.saved";
export const maxSavedScenarios = 100;

function readRaw() {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(savedKey) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const entryId = (entry) => (entry && typeof entry === "object" ? String(entry.id) : undefined);

function load(entry) {
  try {
    return { id: String(entry.id), savedAt: Number(entry.savedAt) || 0, scenario: normalizeScenario(entry.scenario) };
  } catch {
    return null;
  }
}
// The newest entries are kept when the list is full; unreadable ones count too.
function writeAll(list) {
  globalThis.localStorage?.setItem(savedKey, JSON.stringify(list.slice(0, maxSavedScenarios)));
}

export const listSavedScenarios = () => readRaw().map(load).filter(Boolean);

/** Saves under `id`, or as a new entry; returns the entry's id. Throws when storage refuses. */
export function saveScenario(scenario, id) {
  const raw = readRaw();
  const newId = id && raw.some((entry) => entryId(entry) === id) ? id : `s${Date.now().toString(36)}`;
  const entry = { id: newId, savedAt: Date.now(), scenario: normalizeScenario(scenario) };
  writeAll([entry, ...raw.filter((other) => entryId(other) !== newId)]);
  return newId;
}

export function deleteSavedScenario(id) {
  writeAll(readRaw().filter((entry) => entryId(entry) !== id));
}
