// The plugin Projectile Override (client/plugins/projectileOverride.js) without a
// scene: which spot animation a projectile is drawn with for a choice of
// boss, Random, the region-bound bosses and the stored settings.
import assert from "node:assert/strict";
import {
  bosses,
  projectileOverrideOptions,
  projectileOverrideDefaults,
  readProjectileOverrideSettings,
  buildProjectileOverrides,
  overrideProjectile,
  updateProjectileOverride,
  projectileOverrideTargets,
} from "../client/plugins/projectileOverride.js";

const stateOf = (settings, regionId = null) => ({ enabled: true, overrides: buildProjectileOverrides({ ...projectileOverrideDefaults, ...settings }), regionId });

// Every boss is an option, at Default; nothing is drawn differently.
assert.equal(projectileOverrideOptions.length, 27);
assert.ok(projectileOverrideOptions.every((option) => option.default === "DEFAULT" && option.type === "select"));
assert.equal(buildProjectileOverrides(projectileOverrideDefaults).size, 0);
for (const id of [2520, 2521, 1380, 1378, 2181]) assert.equal(overrideProjectile(id, "a", stateOf({})), id);

// Vardorvis drawn as Zulrah: his magic head as Zulrah's magic, his ranged as Zulrah's ranged.
const asZulrah = stateOf({ vardorvis: "zulrah" });
assert.equal(overrideProjectile(2520, "a", asZulrah), 1046);
assert.equal(overrideProjectile(2521, "a", asZulrah), 1044);
// Others are left alone; switched off, nothing is overridden.
assert.equal(overrideProjectile(1380, "a", asZulrah), 1380);
assert.equal(overrideProjectile(2521, "a", { ...asZulrah, enabled: false }), 2521);

// Every one of a boss's ids of a style is drawn as the other boss's first of it.
const zebakAsInferno = stateOf({ zebak: "inferno" });
for (const id of [2187, 2188, 2189, 2190]) assert.equal(overrideProjectile(id, "a", zebakAsInferno), 1378);
assert.equal(overrideProjectile(2181, "a", zebakAsInferno), 1380);

// A style the other boss has none of is left as it is: Doom's melee as Zulrah's.
const doomAsZulrah = stateOf({ dom: "zulrah" });
assert.equal(overrideProjectile(3378, "a", doomAsZulrah), 3378);
assert.equal(overrideProjectile(3379, "a", doomAsZulrah), 1046);
// Melee where both have it: Doom's as the Leviathan's.
assert.equal(overrideProjectile(3378, "a", stateOf({ dom: "leviathan" })), 2488);

// No chain: Inferno as Zebak and Zebak as Zulrah draws the Inferno's as Zebak's.
const chain = stateOf({ inferno: "zebak", zebak: "zulrah" });
assert.equal(overrideProjectile(1380, "a", chain), 2181);
assert.equal(overrideProjectile(2181, "a", chain), 1046);
// A boss drawn as itself has no override.
assert.equal(buildProjectileOverrides({ vardorvis: "vardorvis" }).size, 0);

// Random: one of every boss's projectiles of the style, the same one for the same flight.
const random = stateOf({ vardorvis: "RANDOM" });
const magicPool = new Set(bosses.flatMap((boss) => (boss.magic?.length ? [boss.magic[0]] : [])));
const picks = new Set();
for (let n = 0; n < 200; n++) {
  const pick = overrideProjectile(2520, "flight-" + n, random);
  assert.ok(magicPool.has(pick), `${pick} is not a magic projectile`);
  assert.equal(overrideProjectile(2520, "flight-" + n, random), pick);
  picks.add(pick);
}
assert.ok(picks.size > 10, "Random picks from the whole pool");
const rangedPool = new Set(bosses.flatMap((boss) => (boss.ranged?.length ? [boss.ranged[0]] : [])));
assert.ok(rangedPool.has(overrideProjectile(2521, "flight-1", random)));

// The Dagannoth Kings' and the Maggot King's ids are shared: only in their regions.
assert.equal(overrideProjectile(162, "a", stateOf({ dks: "zulrah" })), 162);
assert.equal(overrideProjectile(162, "a", stateOf({ dks: "zulrah" }, 11588)), 1046);
assert.equal(overrideProjectile(1555, "a", stateOf({ "maggot-king": "zulrah" }, 11645)), 1044);
// Drawing another boss as one of them is not bound to a region.
assert.equal(overrideProjectile(2521, "a", stateOf({ vardorvis: "dks" })), 475);

// Stored settings: unknown values and keys fall back, known ones are kept.
assert.deepEqual(readProjectileOverrideSettings(null), projectileOverrideDefaults);
const read = readProjectileOverrideSettings({ vardorvis: "zulrah", zulrah: "nobody", olm: 3, extra: "x" });
assert.equal(read.vardorvis, "zulrah");
assert.equal(read.zulrah, "DEFAULT");
assert.equal(read.olm, "DEFAULT");
assert.equal(read.extra, undefined);

// The application's state: what overrideProjectile reads by default.
updateProjectileOverride({ enabled: true, settings: { vardorvis: "olm" } });
assert.equal(overrideProjectile(2521), 1343);
updateProjectileOverride({ enabled: false, settings: { vardorvis: "olm" } });
assert.equal(overrideProjectile(2521), 2521);

// What it can draw: each boss's first projectile of each style (test-projectile-override-scene.mjs loads them all).
assert.equal(projectileOverrideTargets.length, new Set(bosses.flatMap((boss) => ["magic", "ranged", "melee"].flatMap((style) => (boss[style]?.length ? [boss[style][0]] : [])))).size);
console.log("Projectile Override draws a boss's projectiles as another's, Random and region rules included");
