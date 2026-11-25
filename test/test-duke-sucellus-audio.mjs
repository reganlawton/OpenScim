// Duke Sucellus' sounds that the game's server sends (duke-sucellus/audio.js):
// the rules answer his events and no others, and every sound they name is in the
// trimmed cache's list. One that is not in it throws nothing: it is silent
// (docs/ADDING-AN-ENCOUNTER.md, section 7).
import assert from "node:assert/strict";
import { register } from "node:module";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";

// encounter.js imports what Node loads only through the harness's hooks.
register(new URL("../tools/determinism/node-hooks.mjs", import.meta.url).href);
for (const name of ["self", "window"]) globalThis[name] ??= globalThis;
const { dukeAudio } = await import("../client/encounters/duke-sucellus/audio.js");

const { inferno_visual: visual, hit_applied: hit } = dukeAudio.rules;
const pass = { kind: "pass" };
const play = (...sound) => ({ kind: "play", sound });
const everywhere = (id) => ({ id, channel: "sfx" });
const event = (fields) => ({ type: "inferno_visual", eventId: 1, tick: 9, animations: [], projectiles: [], graphics: [], ...fields });
const clip = (clipId, actorId = "duke-sucellus") => ({ animations: [{ actorId, clipId, delayCycles: 0 }] });
const projectile = (spotAnimId) => ({ spotAnimId, sourcePosition: [31.5, 52.5], target: { kind: "tile", position: [28, 50] } });
const graphic = (spotAnimId, x, y) => ({ spotAnimId, target: { kind: "tile", position: [x, y] }, height: 0, delayCycles: 0 });

assert.deepEqual(visual.resolve(event(clip("gaze"))), play(everywhere(7215)));
assert.deepEqual(visual.resolve(event({ gazeAvoided: true })), play(everywhere(168)));
assert.deepEqual(visual.resolve(event({ poisonFelt: true })), play(everywhere(7249)));
assert.deepEqual(visual.resolve(event(clip("melee"))), play({ id: 2707, range: 10, position: [31, 52], channel: "area" }));
assert.deepEqual(visual.resolve(event({ ...clip("gas"), projectiles: [projectile(2436)] })), play(everywhere(5002)));
// Two clouds at once, each from its vent.
assert.deepEqual(
  visual.resolve(event({ graphics: [graphic(2432, 28, 50), graphic(2432, 31, 46)] })),
  play({ id: 3052, range: 3, position: [28, 50], channel: "area" }, { id: 3052, range: 3, position: [31, 46], channel: "area" }),
);
for (const fields of [clip("wake"), clip("magic"), clip("gas"), clip("gaze", "zebak"), clip("melee", "vardorvis"), {}, { projectiles: [projectile(2434)] }, { graphics: [graphic(2431, 28, 50), graphic(2433, 28, 50)] }])
  assert.deepEqual(visual.resolve(event(fields)), pass, JSON.stringify(fields));
assert.deepEqual(visual.resolve({ type: "inferno_visual" }), pass);

// A hit that hurts him is heard from his middle tile.
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "duke-sucellus", damage: 1 }), play({ id: 7181, range: 10, position: [31, 55], channel: "area" }));
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "duke-sucellus", damage: 0 }), pass);
for (const targetId of ["player", "zebak", "vardorvis"]) assert.deepEqual(hit.resolve({ type: "hit_applied", targetId, damage: 12 }), pass);

const listed = new Set(readCacheGroups()[4]);
const ids = Object.values(dukeAudio.rules).flatMap((rule) => rule.preloadIds);
assert.deepEqual(new Set(ids), new Set([168, 2707, 3052, 5002, 7181, 7215, 7249]));
for (const id of ids) assert.ok(listed.has(id), `sound ${id} is not under "4" in a list of tools/assets/cache-groups.mjs`);
