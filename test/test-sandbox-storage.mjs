// The sandbox's saved scenarios (client/encounters/sandbox/storage.js): an
// entry this client cannot read (from a newer version, or naming a catalog id
// since renamed) is not listed, and saving or deleting another entry keeps it
// as it was. Plain Node with a stand-in localStorage.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

await loadEnvironment();
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
const { listSavedScenarios, saveScenario, deleteSavedScenario } = await import("../client/encounters/sandbox/storage.js");
const { sandboxExamples } = await import("../client/encounters/sandbox/examples.js");

const fromTheFuture = { id: "future", savedAt: 1, scenario: { ...sandboxExamples[0].scenario, version: 99 } };
const renamedNpc = { id: "renamed", savedAt: 2, scenario: { ...sandboxExamples[1].scenario, npcs: [{ npc: "no.longer.here", position: [1, 1] }] } };
store.set("openscim.sandbox.saved", JSON.stringify([fromTheFuture, renamedNpc]));

assert.deepEqual(listSavedScenarios(), []);
const id = saveScenario(sandboxExamples[2].scenario);
assert.deepEqual(listSavedScenarios().map((entry) => entry.id), [id]);
deleteSavedScenario(id);
const kept = JSON.parse(store.get("openscim.sandbox.saved"));
assert.deepEqual(kept, [fromTheFuture, renamedNpc]);
console.log("sandbox saved scenarios: ok");
process.exit(0);
