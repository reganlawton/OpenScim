// A sandbox share link (#sbx=<code>, client/encounters/sandbox/activeScenario.js)
// replaces the player's scenario only when they agree, and its gear only when
// they agree to that too; the code leaves the address whether it loads or
// not, and one that cannot be read says so. Plain Node: the page's location,
// history, localStorage and dialogs are stand-ins.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

await loadEnvironment();
const { encodeShareCode } = await import("../client/encounters/sandbox/scenario.js");
const { sandboxExamples } = await import("../client/encounters/sandbox/examples.js");

const shared = sandboxExamples.find((entry) => entry.scenario.gear).scenario;
const mine = sandboxExamples.find((entry) => entry.scenario.meta.name !== shared.meta.name).scenario;

// Opens the page with `hash`, answering the dialogs with `answers` in turn.
let visit = 0;
async function open(hash, answers) {
  const store = new Map([["openscim.sandbox.active", JSON.stringify(mine)]]);
  const page = { hash, pathname: "/sandbox", search: "", asked: [], alerted: [] };
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  globalThis.location = page;
  globalThis.history = { state: null, replaceState: (_state, _title, url) => { page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : ""; } };
  globalThis.confirm = (message) => {
    page.asked.push(message);
    return answers.shift() ?? false;
  };
  globalThis.alert = (message) => page.alerted.push(message);
  // A fresh module per visit, as a page load is.
  const module = await import(`../client/encounters/sandbox/activeScenario.js?visit=${visit++}`);
  return { page, active: module.getActiveScenario(), gear: module.takeAgreedLinkGear() };
}
const link = `#sbx=${encodeShareCode(shared)}`;

// Declined: the player's scenario stays, and the code is gone from the address.
{
  const { page, active, gear } = await open(link, [false]);
  assert.equal(active.meta.name, mine.meta.name);
  assert.equal(page.hash, "");
  assert.equal(page.asked.length, 1);
  assert.match(page.asked[0], /^Shared scenario: ".+".*\d+ monsters?.*Load it\?/s);
  assert.equal(gear, false);
}
// Loaded, its gear declined.
{
  const { active, gear, page } = await open(link, [true, false]);
  assert.equal(active.meta.name, shared.meta.name);
  assert.equal(page.asked.length, 2);
  assert.match(page.asked[1], /Also use its gear/);
  assert.equal(gear, false);
}
// Loaded with its gear.
{
  const { active, gear } = await open(link, [true, true]);
  assert.equal(active.meta.name, shared.meta.name);
  assert.equal(gear, true);
}
// A damaged code: a message, the address cleared, the player's scenario kept.
{
  const { page, active } = await open("#sbx=OSB1.AAAA", []);
  assert.equal(active.meta.name, mine.meta.name);
  assert.equal(page.hash, "");
  assert.equal(page.asked.length, 0);
  assert.equal(page.alerted.length, 1);
  assert.match(page.alerted[0], /could not be loaded/);
}
console.log("sandbox share links: ok");
process.exit(0);
