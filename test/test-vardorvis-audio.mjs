// The head's sounds that the game's server sends (client/encounters/vardorvis/audio.js):
// a scream as the head rises and a landing as its projectile arrives, for each
// projectile of a pair; no other visual of the fight answers, and every sound is
// in the trimmed cache's list (docs/ADDING-AN-ENCOUNTER.md, section 7).
import assert from "node:assert/strict";
import { register } from "node:module";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";

// The rules take the head's ids from the encounter, which reaches the engine's
// web-root imports: the determinism harness's hooks let Node load them.
register("../tools/determinism/node-hooks.mjs", import.meta.url);
globalThis.self ??= globalThis;
const { vardorvisAudio } = await import("../client/encounters/vardorvis/audio.js");

const { inferno_visual: visual } = vardorvisAudio.rules;
const pass = { kind: "pass" };
const tile = { kind: "tile", position: [40, 27] };
const toPlayer = { kind: "actor", actorId: "player" };
// As raiseHead emits it: a scream graphic and a projectile per style, the second a tick later.
const rise = (styles) => ({
  type: "inferno_visual",
  animations: [{ actorId: "vardorvis-head-1", clipId: "scream", delayCycles: 0 }],
  projectiles: styles.map((style, n) => ({ spotAnimId: style === "magic" ? 2520 : 2521, target: toPlayer, startDelayCycles: 15 + 30 * n, endDelayCycles: 90 + 30 * n })),
  graphics: styles.map((style, n) => ({ spotAnimId: style === "magic" ? 2549 : 2550, target: tile, height: 0, delayCycles: 30 * n })),
});

// The post-quest head: ranged, its scream at once and its landing three ticks later.
assert.deepEqual(visual.resolve(rise(["range"])), {
  kind: "play",
  sound: [
    { id: 3539, delayCycles: 0, channel: "sfx" },
    { id: 4015, delayCycles: 90, channel: "sfx" },
  ],
});
// The awakened pair, magic first: each projectile its own scream and landing, a tick apart.
assert.deepEqual(visual.resolve(rise(["magic", "range"])), {
  kind: "play",
  sound: [
    { id: 277, delayCycles: 0, channel: "sfx" },
    { id: 3539, delayCycles: 30, channel: "sfx" },
    { id: 4015, delayCycles: 90, channel: "sfx" },
    { id: 4015, delayCycles: 120, channel: "sfx" },
  ],
});

// The rest of the fight's visuals are not the head's: cracks, spikes, his slash, the barrier.
for (const graphics of [
  [{ spotAnimId: 2510, target: tile, height: 4, delayCycles: 3 }],
  [{ spotAnimId: 2512, target: tile, height: 0, delayCycles: 0 }],
  [{ spotAnimId: 2516, target: tile, height: 0, delayCycles: 30 }],
  [],
])
  assert.deepEqual(visual.resolve({ type: "inferno_visual", animations: [{ actorId: "vardorvis", clipId: "attack", delayCycles: 0 }], projectiles: [], graphics }), pass);
// Nor another fight's projectile of the same kind of event (Zebak's special throw).
assert.deepEqual(visual.resolve({ type: "inferno_visual", animations: [], projectiles: [{ spotAnimId: 2173, target: toPlayer, startDelayCycles: 0, endDelayCycles: 60 }], graphics: [] }), pass);

const listed = new Set(readCacheGroups()[4]);
for (const id of visual.preloadIds) assert.ok(listed.has(id), `sound ${id} is not under "4" in a list of tools/assets/cache-groups.mjs`);
assert.deepEqual(new Set(visual.preloadIds), new Set([3539, 277, 4015]));
console.log("Vardorvis' head screams and lands with the sounds the game sends");
