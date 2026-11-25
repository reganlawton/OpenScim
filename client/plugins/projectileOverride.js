// The plugin Projectile Override: a boss's projectiles drawn as another boss's,
// for players who cannot tell some apart by colour or shape. Visual only.
// Rebuilt from the RuneLite plugin of that name
// (github.com/Loze-Put/projectile-override, BSD 2-Clause, "Copyright (c) 2021,
// Loze-Put"), version 1.0.9 (commit efafd94): its options, their defaults and
// its table of each boss's projectiles; no code of it is here. The ids in
// `bosses` are the game's spot animations, as that table has them.
//
// What it does, as the plugin does it (PLUGIN below):
// - Each boss has an option: Default (as the game draws it), Random, or the
//   name of a boss. A projectile of one of the boss's ids is drawn as the
//   chosen boss's projectile of the same style: magic, ranged or melee. A
//   boss with no projectile of that style leaves it as it is.
// - Random takes, for each projectile, one of every boss's projectiles of
//   its style. Here the pick is made from the projectile's own id (its
//   flight), not from Math.random: one flight keeps its pick, in a replay too.
// - A projectile already overridden is not overridden again, so Boss A as B
//   and B as C draws A as B.
// - The Dagannoth Kings' and the Maggot King's ids are shared with other
//   monsters: the plugin overrides them only in those bosses' map regions.
//   No fight of OpenScim's is in them (`regionId` stays null), so they are
//   never overridden here; they can still be chosen as the projectile drawn.
//
// What is the application's own: every projectile is drawn by one runtime
// (rendering.js, "sP"), for the NPCs' and the player's alike, which asks
// overrideProjectile for the spot animation to draw when a flight starts, and
// loads it when it is not loaded yet; the Plugins panel (application.js)
// draws the options and its settings keep them (Grid.js).

const STYLES = ["magic", "ranged", "melee"];

// PLUGIN: the bosses in its order, each { key, label, name, info, magic,
// ranged, melee, regions? }. `name` is what the boss is called in the list of
// choices; `label` what its option is called. The first id of a style is the
// one drawn when another boss is drawn as this one.
export const bosses = [
  { key: "akkha", label: "Akkha", name: "Akkha", info: "Projectile override for Akkha", magic: [2253], ranged: [2255] },
  { key: "cerberus", label: "Cerberus", name: "Cerberus", info: "Projectile override for Cerberus", magic: [1242], ranged: [1245] },
  { key: "dks", label: "DKS", name: "DKS", info: "Projectile override for the Dagganoth Kings", magic: [162], ranged: [475], regions: [11588, 11589] },
  { key: "demonic-gorilla", label: "Demonic Gorilla", name: "Demonic Gorilla", info: "Projectile override for demonic gorillas", magic: [1304], ranged: [1302] },
  { key: "dom", label: "Doom", name: "Doom", info: "Projectile override for Doom of Mokhaiotl", magic: [3379], ranged: [3380], melee: [3378] },
  { key: "dom-rocks", label: "Doom rocks", name: "Doom rocks", info: "Projectile override for Doom of Mokhaiotl rocks", magic: [3385], ranged: [3384] },
  { key: "hueycoatl", label: "Hueycoatl", name: "Hueycoatl", info: "Projectile override for Hueycoatl", magic: [2975], ranged: [2972], melee: [2969] },
  { key: "hunllefnormal", label: "Hunllef", name: "Hunllef", info: "Projectile override for normal Hunllef", magic: [1707], ranged: [1711] },
  { key: "hunllefcorrupted", label: "Hunllef (Corrupted)", name: "Hunllef (c)", info: "Projectile override for corrupted Hunllef", magic: [1708], ranged: [1712] },
  // PLUGIN: its key is spelt so.
  { key: "hdyra", label: "Hydra", name: "Hydra", info: "Projectile override for Alchemical Hydra and smaller hydras", magic: [1662], ranged: [1663] },
  { key: "inferno", label: "Inferno", name: "Inferno", info: "Projectile override for the blobs in the Inferno", magic: [1380], ranged: [1378] },
  { key: "kalphite-queen", label: "Kalphite Queen", name: "Kalphite Queen", info: "Projectile override for the Kalphite Queen", magic: [280], ranged: [288] },
  { key: "kree-arra", label: "Kree Arra", name: "Kree Arra", info: "Projectile override for Kree Arra", magic: [1200], ranged: [1199] },
  { key: "leviathan", label: "Leviathan", name: "Leviathan", info: "Projectile override for Leviathan", magic: [2489], ranged: [2487], melee: [2488] },
  { key: "maggot-king", label: "Maggot King", name: "Maggot King", info: "Projectile override for Maggot King", magic: [3445], ranged: [1555], regions: [11645] },
  { key: "manticore", label: "Manticore", name: "Manticore", info: "Projectile override for Manticores within the Fortis Colosseum", magic: [2681], ranged: [2683], melee: [2685] },
  { key: "olm", label: "Olm", name: "Olm", info: "Projectile override for Olm in the Chambers of Xeric", magic: [1341], ranged: [1343], melee: [1345] },
  { key: "scurrius", label: "Scurrius", name: "Scurrius", info: "Projectile override for Scurrius", magic: [2640], ranged: [2642] },
  { key: "sotetseg", label: "Sotetseg", name: "Sotetseg", info: "Projectile override for Sotetseg in the Theatre of Blood", magic: [1606], ranged: [1607] },
  { key: "tormented-demon", label: "Tormented Demon", name: "Tormented Demon", info: "Projectile override for Tormented Demons within the Ancient Guthixian Temple", magic: [2853], ranged: [2857] },
  { key: "vardorvis", label: "Vardorvis", name: "Vardorvis", info: "Projectile override for Vardorvis", magic: [2520], ranged: [2521] },
  { key: "wardens", label: "Wardens", name: "Wardens", info: "Projectile override for Wardens in the Tombs of Amascut", magic: [2224], ranged: [2241] },
  { key: "wardens-divine", label: "Wardens divine", name: "Wardens divine", info: "Projectile override for the divine projectiles of the Wardens in the Tombs of Amascut", magic: [2208], ranged: [2206], melee: [2204] },
  { key: "whisperer", label: "Whisperer", name: "Whisperer", info: "Projectile override for the Whisperer", magic: [2445], ranged: [2444] },
  { key: "zebak", label: "Zebak", name: "Zebak", info: "Projectile override for regular Zebak attacks", magic: [2181], ranged: [2187, 2188, 2189, 2190] },
  { key: "zebak-rocks", label: "Zebak rocks", name: "Zebak rocks", info: "Projectile override for the rocks and jugs attacks of Zebak", magic: [2176, 2177], ranged: [2178, 2179] },
  { key: "zulrah", label: "Zulrah", name: "Zulrah", info: "Projectile override for Zulrah", magic: [1046], ranged: [1044] },
];

const choices = [
  { value: "DEFAULT", label: "Default" },
  { value: "RANDOM", label: "Random" },
  ...bosses.map((boss) => ({ value: boss.key, label: boss.name })),
];

/** The options in the order of the plugin's panel: { key, label, section, type, default, info, choices }. */
export const projectileOverrideOptions = bosses.map((boss) => ({ key: boss.key, label: boss.label, section: null, type: "select", choices, default: "DEFAULT", info: boss.info }));

/** The settings as the plugin starts: every boss at Default. */
export const projectileOverrideDefaults = Object.fromEntries(projectileOverrideOptions.map((option) => [option.key, option.default]));

/** Settings as they were stored, with every option that is missing or not valid at Default. */
export function readProjectileOverrideSettings(stored) {
  const value = stored && typeof stored === "object" ? stored : {};
  return Object.fromEntries(projectileOverrideOptions.map((option) => [option.key, choices.some((choice) => choice.value === value[option.key]) ? value[option.key] : option.default]));
}

// PLUGIN: what Random picks from, for each style: every boss's first projectile of it.
const randomPool = Object.fromEntries(STYLES.map((style) => [style, bosses.flatMap((boss) => (boss[style]?.length ? [boss[style][0]] : []))]));
const byKey = new Map(bosses.map((boss) => [boss.key, boss]));

/**
 * The overrides of `settings`: Map(source spot animation -> { target, style,
 * regions }), `target` a spot animation or "RANDOM". A boss at Default, or
 * drawn as itself, has none.
 */
export function buildProjectileOverrides(settings) {
  const overrides = new Map();
  for (const boss of bosses) {
    const choice = settings?.[boss.key] ?? "DEFAULT";
    if (choice === "DEFAULT") continue;
    const as = choice === "RANDOM" ? null : byKey.get(choice);
    if (choice !== "RANDOM" && !as) continue;
    for (const style of STYLES) {
      const target = as ? as[style]?.[0] : "RANDOM";
      if (target === undefined) continue;
      for (const source of boss[style] ?? []) if (source !== target) overrides.set(source, { target, style, regions: boss.regions ?? null });
    }
  }
  return overrides;
}

// FNV-1a of the flight's id: the same flight, the same pick.
function pickOf(pool, flightId) {
  let hash = 0x811c9dc5;
  for (const char of String(flightId)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return pool[hash % pool.length];
}

let current = { enabled: false, overrides: new Map(), regionId: null };

/** The plugin's state, from the application: whether it is on, its settings, and the map region the fight is in (null: none of the plugin's). */
export function updateProjectileOverride({ enabled, settings, regionId = null }) {
  current = { enabled: Boolean(enabled), overrides: enabled ? buildProjectileOverrides(settings) : new Map(), regionId };
}

/**
 * The spot animation to draw a projectile of `spotAnimId` with, for the
 * flight `flightId`: an override, or `spotAnimId` itself. Asked once, when the
 * flight starts, so an overridden projectile is not overridden again.
 */
export function overrideProjectile(spotAnimId, flightId, state = current) {
  if (!state.enabled) return spotAnimId;
  const override = state.overrides.get(spotAnimId);
  if (!override) return spotAnimId;
  if (override.regions && !override.regions.includes(state.regionId)) return spotAnimId;
  return override.target === "RANDOM" ? pickOf(randomPool[override.style], flightId) : override.target;
}

/** Every spot animation the plugin can draw a projectile as (they are in the trimmed cache: tools/assets/cache-groups/projectile-override.json). */
export const projectileOverrideTargets = [...new Set(STYLES.flatMap((style) => randomPool[style]))];
