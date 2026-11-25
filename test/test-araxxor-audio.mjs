// Araxxor's sounds that the game's server sends: the rules answer his events
// and no others, with the recorded sounds and delays, and every sound they
// name is in the trimmed cache's list. A sound that is not in it throws
// nothing: it is silent (docs/ADDING-AN-ENCOUNTER.md, section 7).
import assert from "node:assert/strict";
import { register } from "node:module";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";

// encounter.js imports what Node loads only through the harness's hooks.
register(new URL("../tools/determinism/node-hooks.mjs", import.meta.url).href);
for (const name of ["self", "window"]) globalThis[name] ??= globalThis;
const { araxxorAudio } = await import("../client/encounters/araxxor/audio.js");

const { zuk_attack: attack, inferno_visual: visual } = araxxorAudio.rules;
const pass = { kind: "pass" };
const none = { animations: [], projectiles: [], graphics: [] };

// His attacks, with no place; the Acidic's spit on the player's tile.
for (const [kind, id, delayCycles] of [["araxxor_melee", 9413, 40], ["araxxor_magic", 9479, 120], ["araxxor_range", 9470, 120]])
  assert.deepEqual(attack.resolve({ attack: kind, targetPosition: [53, 29] }), { kind: "play", sound: [{ id, delayCycles, channel: "sfx" }] });
assert.deepEqual(attack.resolve({ attack: "araxxor_ball", targetPosition: [53, 29] }), { kind: "play", sound: [{ id: 9488, channel: "sfx" }] });
assert.deepEqual(attack.resolve({ attack: "araxyte_acidic", targetPosition: [53, 29] }), { kind: "play", sound: [{ id: 9378, delayCycles: 25, range: 5, position: [53, 29], channel: "area" }] });
// What the game sends no sound with, and another encounter's attack.
for (const kind of ["araxxor_drip", "araxxor_spray", "araxxor_cleave", "araxyte_mirrorback", "zebak_magic", "constructor"])
  assert.deepEqual(attack.resolve({ attack: kind, targetPosition: [53, 29] }), pass);

// The ball's burst with the splats of its blobs, each heard as it lands; the drip's first tick; the Mirrorback's recoil.
const splat = (position, delayCycles) => ({ spotAnimId: 2923, target: { kind: "tile", position }, height: 0, delayCycles });
assert.deepEqual(visual.resolve({ ...none, graphics: [splat([58, 32], 110), splat([58, 34], 100)], ballBurst: true }), {
  kind: "play",
  sound: [
    { id: 9470, delayCycles: 30, channel: "sfx" },
    { id: 4135, range: 2, delayCycles: 110, position: [58, 32], channel: "area" },
    { id: 4135, range: 2, delayCycles: 100, position: [58, 34], channel: "area" },
  ],
});
const drip = { spotAnimId: 1626, target: { kind: "actor", actorId: "player" }, height: 0, delayCycles: 0 };
assert.deepEqual(visual.resolve({ ...none, graphics: [drip], dripStarts: true }), { kind: "play", sound: [{ id: 9401, channel: "sfx" }] });
assert.deepEqual(visual.resolve({ ...none, graphics: [drip] }), pass);
assert.deepEqual(visual.resolve({ ...none, mirrorbackRecoil: true }), { kind: "play", sound: [{ id: 5196, channel: "sfx" }] });
assert.deepEqual(visual.resolve(none), pass);

const listed = new Set(readCacheGroups()[4]);
for (const [type, rule] of Object.entries(araxxorAudio.rules))
  for (const id of rule.preloadIds) assert.ok(listed.has(id), `sound ${id} of the ${type} rule is not under "4" in a list of tools/assets/cache-groups.mjs`);
assert.deepEqual(new Set(Object.values(araxxorAudio.rules).flatMap((rule) => rule.preloadIds)), new Set([4135, 5196, 9378, 9401, 9413, 9470, 9479, 9488]));
