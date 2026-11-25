// The sounds of the waves that the game's server sends: the rules answer the
// events of the shaman and the javelin colossus and no others, and every
// sound they name is in the trimmed cache's list. A sound that is not in it throws nothing: it
// is silent (docs/ADDING-AN-ENCOUNTER.md, section 7).
import assert from "node:assert/strict";
import { colosseumAudio } from "../client/encounters/colosseum/audio.js";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";

const { hit_applied: hit, zuk_attack: attack } = colosseumAudio.rules;
const pass = { kind: "pass" };

// A hit that hurts a monster is heard from its middle tile.
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "colosseum_javelin_4", targetPosition: [27, 40], damage: 12 }), {
  kind: "play",
  sound: { id: 8353, range: 10, position: [28, 41], channel: "area" },
});
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "colosseum_javelin_4", targetPosition: [27, 40], damage: 0 }), pass);
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "colosseum_shaman_3", targetPosition: [27, 40], damage: 12 }), {
  kind: "play",
  sound: { id: 513, range: 10, position: [27, 40], channel: "area" },
});
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "colosseum_manticore_5", targetPosition: [27, 40], damage: 1 }).sound, { id: 600, range: 10, position: [28, 41], channel: "area" });
for (const targetId of ["colosseum_jaguar_2", "colosseum_berserker_0", "colosseum_minimus", "zebak"]) assert.deepEqual(hit.resolve({ type: "hit_applied", targetId, targetPosition: [27, 40], damage: 12 }), pass);
assert.deepEqual(hit.resolve({ type: "hit_applied", targetId: "player", targetPosition: [27, 40], damage: 12 }), pass);

// A javelin thrown high: its fall, then its landing on the tile it was thrown at.
const thrown = { type: "zuk_attack", sourceId: "colosseum_javelin_4", targetPosition: [25, 40], launchTick: 100, impactTick: 106 };
assert.deepEqual(attack.resolve({ ...thrown, attack: "colosseum_javelin_high" }), {
  kind: "play",
  sound: [
    { id: 8356, delayCycles: 90, channel: "sfx" },
    { id: 8352, range: 15, delayCycles: 180, position: [25, 40], channel: "area" },
  ],
});
assert.deepEqual(attack.resolve({ ...thrown, attack: "zebak_magic", accurate: true }), pass);

// An attack whose accuracy roll succeeded is heard as its projectile arrives; one that failed is not.
for (const [kind, id, projectileArrivalCycles] of [
  ["colosseum_javelin_throw", 8348, 90],
  ["colosseum_shaman_spell", 8339, 103],
]) {
  const event = { ...thrown, attack: kind, projectileArrivalCycles };
  assert.deepEqual(attack.resolve({ ...event, accurate: true }), { kind: "play", sound: { id, delayCycles: projectileArrivalCycles, channel: "sfx" } });
  assert.deepEqual(attack.resolve({ ...event, accurate: false }), pass);
}
// The shockwave colossus's clap is heard as its projectile arrives, accurate or not.
for (const accurate of [true, false])
  assert.deepEqual(attack.resolve({ ...thrown, attack: "colosseum_shockwave_clap", accurate, projectileArrivalCycles: 116 }), { kind: "play", sound: { id: 5774, delayCycles: 116, channel: "sfx" } });

// The minotaur's heal has no rule: OBS, the game sends no sound with it.
assert.deepEqual(attack.resolve({ type: "zuk_attack", attack: "colosseum_minotaur_heal", targetId: "colosseum_manticore_4", targetPosition: [39, 36], launchTick: 79, impactTick: 79 }), pass);

const listed = new Set(readCacheGroups()[4]);
for (const [type, rule] of Object.entries(colosseumAudio.rules))
  for (const id of rule.preloadIds) assert.ok(listed.has(id), `sound ${id} of the ${type} rule is not under "4" in a list of tools/assets/cache-groups.mjs`);
assert.deepEqual(new Set(Object.values(colosseumAudio.rules).flatMap((rule) => rule.preloadIds)), new Set([513, 600, 5774, 8339, 8348, 8353, 8356, 8352]));

// The thralls' sounds (client/engine/thralls.js) are the player's in every fight (application.js), not the Colosseum's.
assert.equal(colosseumAudio.rules.spell_self_cast, undefined);
assert.equal(colosseumAudio.rules.thrall_despawned, undefined);
