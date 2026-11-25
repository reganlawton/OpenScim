// Does the visit to an arena fight its boss with all its mechanics, and so
// draw the boss's scene (presentation.js)? The run says: the scenario the
// encounter started with (its seeds', on a replay or a restart), which it
// notes here as it resets. Before any run of the arena has started, the
// active scenario says, as the encounter will read it.
import { getActiveScenario } from "./activeScenario.js";

const runningScenarios = new Map();

/** Called by the encounter as a run starts (encounter.js, reset). */
export function noteRunningScenario(arenaId, scenario) {
  runningScenarios.set(arenaId, scenario);
}

export function getRunningScenario(arenaId) {
  return runningScenarios.get(arenaId) ?? null;
}

export function isHostedVisit(arena) {
  const scenario = runningScenarios.get(arena.id) ?? getActiveScenario();
  return Boolean(arena.hostKind && scenario?.arena === arena.id && scenario.options.bossMechanics);
}
