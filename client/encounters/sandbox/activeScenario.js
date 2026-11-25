// The scenario the next sandbox run starts with: what the editor applied
// last. It is kept in the page's localStorage, so a reload or a later visit
// starts from it, and a share URL (#sbx=<code>) replaces it when the page
// is opened with one and the player agrees.
//
// The encounter reads it only when a run starts without seeds (a new run or
// a restart); the scenario then goes into the encounter's seeds, so a replay
// and a restart with the same seeds carry it with them and never read this
// again. In Node (the determinism harness) there is no page: nothing is
// stored and the harness hands its scenarios to the factory.
import { getSandboxArena } from "./arenas.js";
import { decodeShareCode, normalizeScenario } from "./scenario.js";

const activeKey = "openscim.sandbox.active";
let active = null;
let loaded = false;

function readStorage() {
  try {
    const json = globalThis.localStorage?.getItem(activeKey);
    return json ? normalizeScenario(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

// What the player is asked before a shared scenario replaces theirs.
export function describeSharedScenario(scenario) {
  const by = scenario.meta.author ? ` by ${scenario.meta.author}` : "";
  const monsters = scenario.npcs.length === 1 ? "1 monster" : `${scenario.npcs.length} monsters`;
  const boss = scenario.options.bossMechanics ? ", with the arena's boss" : "";
  return `Shared scenario: "${scenario.meta.name}"${by}, ${getSandboxArena(scenario.arena).name}, ${monsters}${boss}.`;
}

// A share URL: the code after #sbx= is taken once and always removed from
// the address, whether it loads or not, so that a reload does not meet it
// again. It replaces the player's scenario only when they agree, and its gear
// only when they agree to that too; a code that cannot be read says why.
function readShareUrl() {
  const location = globalThis.location;
  const match = /sbx=([\w.-]*)/.exec(location?.hash ?? "");
  if (!match) return null;
  try {
    globalThis.history?.replaceState(globalThis.history.state, "", location.pathname + location.search);
  } catch {
    // An address that cannot be changed: the prompts below still guard it.
  }
  let scenario;
  try {
    scenario = decodeShareCode(match[1]);
  } catch (error) {
    globalThis.alert?.(`This sandbox link could not be loaded: ${error.message}. Your scenario is unchanged.`);
    return null;
  }
  const ask = (message) => globalThis.confirm?.(message) === true;
  if (!ask(`${describeSharedScenario(scenario)}\n\nLoad it? It replaces the scenario you have open.`)) return null;
  useLinkGear = Boolean(scenario.gear) && ask(`Also use its gear ("${scenario.gear.name}")? It replaces your current loadout and restarts the run.`);
  return scenario;
}

// True once, after a share URL brought a scenario whose gear the player
// agreed to: the editor then sets it (editor.js), which a URL cannot do by itself.
let useLinkGear = false;
let arrivedByLink = false;
export function takeAgreedLinkGear() {
  const arrived = arrivedByLink && useLinkGear;
  arrivedByLink = false;
  useLinkGear = false;
  return arrived;
}

export function getActiveScenario() {
  if (!loaded) {
    loaded = true;
    const shared = readShareUrl();
    if (shared) {
      setActiveScenario(shared);
      arrivedByLink = true;
    } else active = readStorage();
  }
  return active;
}

export function setActiveScenario(scenario) {
  active = normalizeScenario(scenario);
  loaded = true;
  try {
    globalThis.localStorage?.setItem(activeKey, JSON.stringify(active));
  } catch {
    // Storage may be full or blocked; the scenario still holds for this page.
  }
  return active;
}
