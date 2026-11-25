// What lies on the player's floor: bile from his spits and slams, and the
// carrion his screeches throw in. One thing a tile: whatever lands on a tile
// takes the place of what lay there (OBS: a spit's bile over carrion, a
// fragment of carrion over bile, sticky over poisonous, in every case).
//
// Bile stays until the player steps on it, which uses it up, or something
// lands on it (WIKI, OBS). Carrion stays until a larva eats it or something
// lands on it.
import { key, unkey } from "./ids.js";

// OBS: the poison hitsplat as the player steps in (1 to 4, five times
// recorded); WIKI: it poisons for 8 at first, and erodes poison immunity.
const poisonContactDamage = [1, 4];
const poisonSeverity = 40; // 8 a hit (ceil(40 / 5)), the engine's poison scale
// inferred: how much immunity a step takes, in the poison counter's steps of
// 30 ticks (tsps: 45 seconds).
const immunityEroded = 2;
// WIKI: minor damage, drained from Attack, Strength or Defence; OBS 3 and 4 (4, 3, 4, kill 690 too);
// tsps 2 to 4.
const stickyDamage = [2, 4];
const drainedStats = ["attack", "strength", "defence"];

export class Floor {
  constructor(encounter) {
    this.encounter = encounter;
    this.tiles = new Map(); // key -> "poison" | "sticky" | "carrion"
  }
  reset() {
    this.tiles.clear();
  }
  place(tile, what) {
    this.tiles.set(key(tile), what);
  }
  has(tile, what) {
    return this.tiles.get(key(tile)) === what;
  }
  // A larva eats the carrion it stands on: true when there was some.
  eat(tile) {
    if (!this.has(tile, "carrion")) return false;
    this.tiles.delete(key(tile));
    return true;
  }
  carrionInRow(y) {
    return [...this.tiles].filter(([tile, what]) => what === "carrion" && unkey(tile)[1] === y).map(([tile]) => unkey(tile)[0]);
  }
  // After the player has moved: bile underfoot is used up, bile that lands
  // under him too (inferred: the recordings' player always stepped away first).
  // Returns the damage it does.
  step(player, context) {
    const what = this.tiles.get(key(player.position));
    if (what !== "poison" && what !== "sticky") return [];
    this.tiles.delete(key(player.position));
    return what === "poison" ? this.poison(player, context) : this.sticky(player, context);
  }
  poison(player, context) {
    const varp = player.poisonState?.poisonVarp ?? 0;
    const hit = { baseDamage: poisonContactDamage, attackType: "typeless", source: "Poisonous bile", hitsplatType: "poison", playerPosition: [...player.position] };
    if (varp >= 0) return [{ ...hit, applyPoison: poisonSeverity }];
    // OBS: the message, as a player with an antipoison steps in.
    player.poisonState = { ...player.poisonState, poisonVarp: Math.min(0, varp + immunityEroded) };
    message(context, "The poison erodes your immunity!");
    return [hit];
  }
  sticky(player, context) {
    const random = this.encounter.random;
    const damage = stickyDamage[0] + Math.floor(random() * (stickyDamage[1] - stickyDamage[0] + 1));
    // WIKI: drains the stat by the damage it does (inferred: one of the three at random).
    const stat = drainedStats[Math.floor(random() * drainedStats.length)];
    const level = player.stats?.[stat];
    if (level) player.stats = { ...player.stats, [stat]: { ...level, current: Math.max(0, level.current - damage) } };
    // OBS: the message. WIKI: the next attack comes a tick later. OBS: stepped
    // in with the weapon ready, the player attacked on the next tick (kill 690).
    message(context, "The sticky acid hampers your ability to attack!");
    context.delayNextAttack(player.id, 1);
    return [{ baseDamage: damage, attackType: "typeless", source: "Sticky bile", playerPosition: [...player.position] }];
  }
  // What the scene draws (presentation.js).
  snapshot() {
    const of = (what) => [...this.tiles].filter(([, kind]) => kind === what).map(([tile]) => unkey(tile));
    return { poisonBile: of("poison"), stickyBile: of("sticky"), carrion: of("carrion") };
  }
}

function message(context, text) {
  context.tickEvents.emit({ type: "game_message", kind: "game", segments: [{ text }] });
}
