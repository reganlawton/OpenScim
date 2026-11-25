// The Alchemical Hydra's rules as the recordings, the wiki and tsps have them
// (client/encounters/alchemical-hydra/), asserted on the determinism
// harness's scenarios (tools/determinism/scenarios/alchemical-hydra.mjs).
// Their digests say that nothing changed; this says what it is.
import assert from "node:assert/strict";
import { runScenario } from "../tools/determinism/harness.mjs";
import { scenarios } from "../tools/determinism/scenarios/alchemical-hydra.mjs";

const BOSS = "alchemical-hydra";
const spots = { magic: 1662, ranged: 1663, poison: 1644, caster: 1664, current: 1665, fire: 1668 };

// Runs a scenario and gives each tick: its tile, type and clips, the player's tile, the messages, the damage taken,
// the projectiles and graphics, the encounter's snapshot, and what the shield and the max hits are.
async function ticksOf(name) {
  const ticks = [];
  await runScenario(scenarios.find((scenario) => scenario.name === "alchemical-hydra/" + name), {
    onTick(tick, engine) {
      const events = engine.getLastTickEvents();
      const visuals = events.filter((event) => event.type === "inferno_visual");
      const boss = engine.worldState.getNpc(BOSS);
      const rules = engine.encounter.getEngineRules();
      ticks[tick] = {
        boss: [...boss.position], type: boss.npcTypeId, target: engine.player().attackTarget, hp: boss.vitals.hp,
        player: [...engine.player().position],
        playerLands: engine.worldState.pendingHits.some((hit) => hit.sourceId === "player" && hit.launchTick === tick && hit.accuracySucceeded),
        playerAttacked: events.some((event) => event.type === "attack_started" && event.sourceId === "player"),
        clips: visuals.flatMap((event) => event.animations.filter((a) => a.actorId === BOSS).map((a) => a.clipId)),
        projectiles: visuals.flatMap((event) => event.projectiles),
        graphics: visuals.flatMap((event) => event.graphics),
        messages: events.filter((event) => event.type === "game_message").map((event) => event.segments.map(({ text }) => text).join("")),
        overhead: events.filter((event) => event.type === "overhead_text").map((event) => [event.anchor.actorId, event.overheadText]),
        damage: engine.damageHistory.filter((hit) => hit.tick === tick).map(({ source, effectiveDamage }) => ({ source, effectiveDamage })),
        state: engine.getEncounterSnapshot().state,
        shieldShare: rules.playerDamageOnNpc(40, { target: boss }) / 40,
        maxHit: engine.encounter.maxHitOf("range").maxHit,
        drain: boss.debuffs?.defenceDrain ?? 0,
        outcome: engine.getEncounterOutcome().phase,
      };
    },
  });
  return ticks;
}
const attackClips = ["range", "magic", "special"];
const attacksOf = (ticks) => ticks.flatMap((tick, n) => (tick?.clips.some((clip) => attackClips.includes(clip)) ? [n] : []));
const clipTicks = (ticks, clip) => ticks.flatMap((tick, n) => (tick?.clips.includes(clip) ? [n] : []));
const messageTicks = (ticks, text) => ticks.flatMap((tick, n) => (tick?.messages.some((message) => message.includes(text)) ? [n] : []));
const damageOf = (ticks, source) => ticks.flatMap((tick, n) => (tick?.damage ?? []).filter((hit) => hit.source === source).map((hit) => ({ tick: n, ...hit })));
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const gap = ([px, py], [x, y]) => Math.max(x - px, 0, px - (x + 5), y - py, py - (y + 5));

{
  // It attacks on the tick the player comes in, then every 6 ticks; three of a style, its special as the fourth attack
  // and then every tenth, the heads swaying 3 ticks after each third. It walks to 4 tiles of the player and stays,
  // over no vent: shielded all along, taking a quarter of each hit.
  const ticks = await ticksOf("standing");
  const attacks = attacksOf(ticks);
  assert.equal(attacks[0], 1);
  assert.ok(attacks.every((tick, n) => n === 0 || tick - attacks[n - 1] === 6), attacks.join());
  const kinds = attacks.map((tick) => ticks[tick].clips.find((clip) => attackClips.includes(clip)));
  assert.deepEqual(kinds.flatMap((kind, n) => (kind === "special" ? [n + 1] : [])), [4, 14]);
  const styles = kinds.filter((kind) => kind !== "special");
  for (let n = 0; n + 3 <= styles.length; n += 3) {
    assert.ok(styles[n] === styles[n + 1] && styles[n] === styles[n + 2], styles.join());
    if (n + 3 < styles.length) assert.notEqual(styles[n + 3], styles[n]);
  }
  const thirds = attacks.filter((tick, n) => kinds[n] !== "special").filter((tick, n) => n % 3 === 2);
  assert.deepEqual(clipTicks(ticks, "switch"), thirds.map((tick) => tick + 3));
  // Two heads a serpentine attack, each flight ending 40 + 5 cycles a tile from its south-west tile.
  const first = ticks[attacks[1]];
  const shots = first.projectiles.filter((p) => p.spotAnimId === spots.magic || p.spotAnimId === spots.ranged);
  assert.equal(shots.length, 2);
  assert.ok(shots.every((p) => p.startDelayCycles === 30 && p.endDelayCycles === 40 + 5 * Math.max(Math.abs(first.player[0] - first.boss[0]), Math.abs(first.player[1] - first.boss[1]))));
  assert.deepEqual(ticks[130].boss, [16, 21]);
  assert.equal(gap(ticks[130].player, ticks[130].boss), 4);
  assert.ok(ticks.slice(1).every((tick) => tick.state.shielded && tick.shieldShare === 0.25));
  assert.deepEqual([...messageTicks(ticks, "neutralise"), ...messageTicks(ticks, "empowering")], []);

  // "partially absorb your attack" on the tick of each of the player's attacks that lands, not of one that misses.
  const landing = ticks.flatMap((tick, n) => (tick?.playerAttacked && tick.playerLands ? [n] : []));
  const missing = ticks.flatMap((tick, n) => (tick?.playerAttacked && !tick.playerLands ? [n] : []));
  assert.ok(landing.length >= 5 && missing.length >= 1, landing.length + " land, " + missing.length + " miss");
  assert.deepEqual(messageTicks(ticks, "partially absorb"), landing);

  // The poison: five blobs, the first on the player's tile, landing 3 ticks later; the 3 x 3 splash hurts (up to 7),
  // and the aimed blob's pool under the player hurts 2 to 7 on each of the 13 ticks from the one after the landing.
  const special = attacks[3];
  const blobs = ticks[special].projectiles.filter((p) => p.spotAnimId === spots.poison);
  assert.equal(blobs.length, 5);
  assert.deepEqual(blobs[0].target.position, ticks[special].player);
  assert.ok(ticks[special].state.poisonIncoming.every((blob) => blob.landsAt === special + 3));
  const splash = damageOf(ticks, "Poison").filter((hit) => hit.tick < special + 10);
  assert.ok(splash.length >= 1 && splash.every((hit) => hit.tick === special + 3 && hit.effectiveDamage <= 7), JSON.stringify(splash));
  const pool = damageOf(ticks, "Poison pool").filter((hit) => hit.tick < special + 20);
  assert.deepEqual(pool.map((hit) => hit.tick), Array.from({ length: 13 }, (_, n) => special + 4 + n));
  assert.ok(pool.every((hit) => hit.effectiveDamage >= 2 && hit.effectiveDamage <= 7));
}
{
  // The vents erupt every 8 ticks for 5. Two ticks after an eruption with the green vent under the serpentine form,
  // it is empowered (its max hit 17 becomes 26); with the red one, its shield goes, once, and so does the empowerment.
  const ticks = await ticksOf("vents");
  const erupting = ticks.map((tick) => tick?.state.erupting);
  const starts = erupting.flatMap((on, n) => (on && !erupting[n - 1] ? [n] : []));
  assert.ok(starts.every((tick, n) => n === 0 || tick - starts[n - 1] === 8) && starts.every((tick) => erupting.slice(tick, tick + 5).every(Boolean) && !erupting[tick + 5]));
  const covers = (tick, [vx, vy]) => gap([vx, vy], ticks[tick].boss) === 0;
  const empowered = messageTicks(ticks, "empowering");
  const weakened = messageTicks(ticks, "neutralise");
  assert.ok(empowered.every((tick) => starts.includes(tick - 2)), empowered.join());
  const green = empowered.filter((tick) => ticks[tick].state.phase === "serpentine");
  assert.ok(green.length >= 1 && green.every((tick) => covers(tick, [27, 32])), green.join());
  assert.equal(ticks[green[0]].maxHit, 26);
  assert.equal(weakened.length, 1);
  assert.ok(starts.includes(weakened[0] - 2) && covers(weakened[0], [27, 23]) && weakened[0] > green.at(-1));
  const after = ticks[weakened[0]];
  assert.deepEqual([after.state.shielded, after.state.empowered, after.shieldShare, after.maxHit], [false, false, 1, 17]);
  // It roars, once, over its heads.
  assert.deepEqual(ticks.flatMap((tick, n) => (tick?.overhead ?? []).map((text) => [n, ...text])), [[weakened[0], BOSS, "Roaaaaaaaaaaar!"]]);
  // The red vent still under it, the electric form is empowered by it at its next eruption.
  const red = empowered.filter((tick) => ticks[tick].state.phase === "electric");
  assert.ok(red.length >= 1 && red.every((tick) => covers(tick, [27, 23]) && ticks[tick].maxHit === 52), red.join());
}
{
  // Its poison outlives it: blobs in the air as it dies land and splash, and their pools hurt to the end of the fight.
  const ticks = await ticksOf("poison-after-death");
  const dead = ticks.findIndex((tick) => tick?.hp === 0);
  const thrown = ticks.findIndex((tick) => tick?.projectiles.some((p) => p.spotAnimId === spots.poison));
  assert.ok(thrown > 0 && dead > thrown && dead <= thrown + 3, thrown + " " + dead);
  assert.deepEqual(damageOf(ticks, "Poison").map((hit) => hit.tick), [thrown + 3]);
  const won = ticks.findIndex((tick) => tick?.outcome === "victory");
  assert.equal(won, dead + 10);
  const pool = damageOf(ticks, "Poison pool").map((hit) => hit.tick);
  assert.deepEqual(pool, Array.from({ length: Math.min(13, won - thrown - 3) }, (_, n) => thrown + 4 + n));
}
{
  // A Bandos godsword's special on its shield drains its Defence by the hit before the shield takes three quarters of it.
  const ticks = await ticksOf("drain");
  const drains = ticks.flatMap((tick, n) => (n > 1 && tick.drain > ticks[n - 1].drain ? [{ drained: tick.drain - ticks[n - 1].drain, dealt: ticks[n - 1].hp - tick.hp }] : []));
  assert.ok(drains.length >= 1);
  for (const { drained, dealt } of drains) assert.ok(drained > 4 && dealt === Math.floor(drained / 4), JSON.stringify(drains));
}
{
  // The electric form's fourth attack: a ball onto the middle, and 3 ticks later four currents, one from each
  // quadrant's block, out a tick apart. A current steps a tile a tick towards the player; one that reaches him hits for
  // 8 to 17 and binds him: he clicks away on that tick and first moves 3 ticks later.
  const ticks = await ticksOf("lightning");
  const special = clipTicks(ticks, "special")[0];
  assert.equal(attacksOf(ticks).indexOf(special), 3);
  const caster = ticks[special].projectiles.find((p) => p.spotAnimId === spots.caster);
  assert.deepEqual(caster.target.position, [23, 27]);
  const spread = ticks[special + 3].projectiles.filter((p) => p.spotAnimId === spots.current);
  assert.deepEqual(spread.map((p) => [p.startDelayCycles, p.endDelayCycles]), [[15, 30], [45, 60], [75, 90], [105, 120]]);
  assert.deepEqual([1, 2, 3, 4].map((n) => ticks[special + 3 + n].state.currents.length), [1, 2, 3, 4]);
  const firstCurrent = [ticks[special + 4].state.currents[0], ticks[special + 5].state.currents[0]];
  assert.ok(Math.max(Math.abs(firstCurrent[0][0] - firstCurrent[1][0]), Math.abs(firstCurrent[0][1] - firstCurrent[1][1])) === 1);
  const [hit] = damageOf(ticks, "Lightning");
  assert.ok(hit.effectiveDamage >= 8 && hit.effectiveDamage <= 17);
  assert.deepEqual(messageTicks(ticks, "paralyzes"), [hit.tick]);
  assert.ok([1, 2].every((n) => same(ticks[hit.tick + n].player, ticks[hit.tick].player)));
  assert.ok(!same(ticks[hit.tick + 3].player, ticks[hit.tick].player));
  assert.equal(ticks[hit.tick + 1].state.currents.length, ticks[hit.tick].state.currents.length);
}
{
  // The flame form's fourth attack: it walks back to the middle, diagonally; turns solid as it arrives; stuns the
  // player a tick later (he clicks away and moves 7 ticks after it); breathes a wall north of him, then west (he is
  // north-west of its middle), then the tracking fire, 3 ticks apart; attacks again 12 ticks after the last. The
  // tracking fire catches him: 9 to 17, then a burn of 5 every 5 ticks, five times.
  const ticks = await ticksOf("fire");
  const special = ticks.findIndex((tick) => tick?.state.fireSpecial?.stage === "walk");
  assert.equal(attacksOf(ticks).filter((tick) => tick < special).length, 3);
  assert.ok(!ticks[special].clips.includes("special"));
  const arrived = ticks.findIndex((tick, n) => n > special && tick.state.blocked.length === 36);
  assert.deepEqual(ticks[arrived].boss, [20, 25]);
  assert.ok(ticks.slice(special + 1, arrived + 1).every((tick, n) => n === 0 || gap(tick.boss, ticks[special + n].boss) <= 1));
  assert.deepEqual(messageTicks(ticks, "stuns you"), [arrived + 1]);
  assert.ok(ticks.slice(arrived + 1, arrived + 8).every((tick) => same(tick.player, ticks[arrived + 1].player)));
  assert.ok(!same(ticks[arrived + 8].player, ticks[arrived + 1].player));
  assert.deepEqual(clipTicks(ticks, "special"), [arrived + 3, arrived + 6, arrived + 9]);
  const walls = [3, 6].map((n) => ticks[arrived + n].graphics.filter((g) => g.spotAnimId === spots.fire).map((g) => g.target.position));
  assert.ok(walls[0].length === 32 && walls[0].every(([x, y]) => x >= 21 && x <= 24 && y >= 31 && y <= 38), JSON.stringify(walls[0]));
  assert.ok(walls[1].length === 32 && walls[1].every(([x, y]) => x >= 12 && x <= 19 && y >= 26 && y <= 29), JSON.stringify(walls[1]));
  // The tracking fire starts off its north-west corner, and follows him from that tick.
  const tracking = ticks[arrived + 9].graphics.filter((g) => g.spotAnimId === spots.fire);
  assert.deepEqual([tracking[0].target.position, tracking[0].delayCycles], [[19, 31], 45]);
  assert.equal(attacksOf(ticks).find((tick) => tick > arrived + 9), arrived + 21);
  const [scorch] = damageOf(ticks, "Fire");
  assert.ok(scorch.effectiveDamage >= 9 && scorch.effectiveDamage <= 17);
  assert.deepEqual(damageOf(ticks, "Burn").map((hit) => [hit.tick - scorch.tick, hit.effectiveDamage]), [[5, 5], [10, 5], [15, 5], [20, 5], [25, 5]]);
  assert.deepEqual(messageTicks(ticks, "burn clears up"), [scorch.tick + 25]);
}
{
  // Under it as it comes back to the middle, the player is pushed out that tick, past its edge; while its blockers
  // stand he walks round them, never onto them.
  const ticks = await ticksOf("push-out");
  const arrived = ticks.findIndex((tick, n) => n > 1 && tick.state.blocked.length === 36);
  assert.equal(gap(ticks[arrived - 1].player, [20, 25]), 0);
  assert.equal(gap(ticks[arrived].player, [20, 25]), 1);
  const blocked = ticks[arrived].state.blocked.map(String);
  assert.ok(ticks.slice(arrived).every((tick) => !blocked.includes(String(tick.player))));
  assert.deepEqual(ticks.at(-1).player, [30, 22]);
}
{
  // Its forms, one after the other: the head falls (the change's own NPC type, its clip, and it cannot be attacked),
  // 2 ticks to the electric form, 1 to the flame form, 2 to the enraged one ("becomes enraged!"); a first attack 6
  // ticks after a new form (4 enraged). Shielded again but for the enraged form, which attacks every 4 ticks, the
  // style changing every attack, and throws one blob while the flame phase's fires stand.
  const ticks = await ticksOf("phases");
  const outs = clipTicks(ticks, "phaseOut");
  const ins = clipTicks(ticks, "phaseIn");
  assert.deepEqual(ins.map((tick, n) => tick - outs[n]), [2, 1, 2]);
  assert.deepEqual(outs.map((tick) => ticks[tick].type), [8616, 8617, 8618]);
  assert.deepEqual(ins.map((tick) => ticks[tick].type), [8619, 8620, 8621]);
  // As it changes the player's target is gone, quietly; a click on it is refused with the game's message, the target
  // dropped again and no attack made; from the new form's tick a click stands.
  const refused = outs.flatMap((tick, n) => Array.from({ length: ins[n] - tick - 1 }, (_, k) => tick + 1 + k));
  assert.ok(refused.length >= 2);
  assert.deepEqual(messageTicks(ticks, "as it changes form"), refused);
  assert.ok(outs.every((tick, n) => ticks.slice(tick, ins[n]).every((t) => t.target === null && !t.playerAttacked)));
  assert.ok(ins.every((tick) => ticks[tick].target === BOSS));
  assert.deepEqual(messageTicks(ticks, "becomes enraged"), [ins[2]]);
  assert.deepEqual(ins.map((tick) => ticks[tick].state.nextAttackAt - tick), [6, 6, 4]);
  assert.deepEqual(ins.slice(1).map((tick) => attacksOf(ticks).find((attack) => attack > tick) - tick), [6, 4]);
  assert.deepEqual(ins.map((tick) => ticks[tick].state.shielded), [true, true, false]);
  const enraged = attacksOf(ticks).filter((tick) => tick > ins[2]);
  assert.ok(enraged.every((tick, n) => n === 0 || tick - enraged[n - 1] === 4));
  const special = enraged[3];
  assert.ok(ticks[special].clips.includes("special") && ticks[special].state.blocked.length === 36);
  assert.equal(ticks[special].projectiles.filter((p) => p.spotAnimId === spots.poison).length, 1);
}
{
  // Enraged, the style changes every attack; at 0 hitpoints it takes its last form 3 ticks later (8622, its clip) and the
  // fight is won 7 ticks after that.
  const ticks = await ticksOf("enraged");
  const kinds = attacksOf(ticks).map((tick) => ticks[tick].clips.find((clip) => attackClips.includes(clip))).filter((kind) => kind !== "special");
  assert.ok(kinds.every((kind, n) => n === 0 || kind !== kinds[n - 1]), kinds.join());
  const dead = ticks.findIndex((tick) => tick?.hp === 0);
  assert.equal(ticks.findIndex((tick) => tick?.outcome === "victory"), dead + 10);
  assert.deepEqual(clipTicks(ticks, "finalDeath"), [dead + 3]);
  assert.ok(ticks.every((tick, n) => (tick.type === 8622) === (n >= dead + 3)));
}
{
  // The whole fight: each of the three shields taken by its own vent, and won.
  const ticks = await ticksOf("kill");
  assert.equal(messageTicks(ticks, "neutralise").length, 3);
  assert.deepEqual(clipTicks(ticks, "phaseIn").map((tick) => ticks[tick].state.phase), ["electric", "flame", "enraged"]);
  assert.equal(ticks.at(-1).outcome, "victory");
}
console.log("The Alchemical Hydra's attacks, vents, phases, poison, lightning and fire are as recorded");
