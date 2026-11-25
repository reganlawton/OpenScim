// Araxxor's rules as the recorded kills, the wiki and tsps have them, asserted
// on the determinism harness's scenarios (tools/determinism/scenarios/araxxor.mjs).
// Their digests say that nothing changed; this says what it is.
import assert from "node:assert/strict";
import { runScenario } from "../tools/determinism/harness.mjs";
import { scenarios } from "../tools/determinism/scenarios/araxxor.mjs";

// Runs a scenario and gives each tick: his and the player's tiles, the clips that started, the acid, the messages ...
async function ticksOf(name, change = {}) {
  const ticks = [];
  await runScenario({ ...scenarios.find((scenario) => scenario.name === "araxxor/" + name), ...change }, {
    onTick(tick, engine) {
      const events = engine.getLastTickEvents(), { state } = engine.getEncounterSnapshot();
      const npcs = engine.worldState.getNpcs();
      const boss = engine.worldState.getNpc("araxxor");
      ticks[tick] = {
        boss: [...boss.position], bossTarget: boss.combat.targetId, player: [...engine.player().position], enraged: state.enraged, enragedBody: state.enragedBody, outcome: engine.getEncounterOutcome().phase,
        clips: events.filter((event) => event.type === "inferno_visual").flatMap((event) => event.animations.map(({ actorId, clipId }) => actorId + " " + clipId)),
        pools: state.pools.map(String), ids: npcs.map((npc) => npc.id),
        messages: events.filter((event) => event.type === "game_message").map((event) => event.segments.map(({ text }) => text).join("")),
        hits: events.filter((event) => event.type === "hit_applied").map(({ targetId, damage, attackKind }) => ({ targetId, damage, attackKind })),
        damage: engine.damageHistory.filter((hit) => hit.tick === tick).map(({ source, effectiveDamage }) => ({ source, effectiveDamage })),
        cleaves: state.cleaves, blobs: events.filter((event) => event.type === "inferno_visual").flatMap((event) => event.projectiles ?? []).filter(({ spotAnimId }) => spotAnimId === 2924),
        defenceDrain: boss.debuffs?.defenceDrain ?? 0, hp: boss.vitals.hp,
        npcs: new Map(npcs.map((npc) => [npc.id, { position: [...npc.position], alive: npc.alive, npcTypeId: npc.npcTypeId, deathAnimationTick: npc.deathAnimationTick }])),
      };
    },
  });
  return ticks;
}
const first = (ticks, clip, from = 0) => ticks.findIndex((tick, n) => n >= from && tick?.clips.includes(clip));
const all = (ticks, clip) => ticks.flatMap((tick, n) => (tick?.clips.includes(clip) ? [n] : []));
const newPools = (ticks, n) => ticks[n].pools.filter((tile) => !ticks[n - 1].pools.includes(tile)).sort();

{
  // He attacks from where he stands as the tick begins, and steps in the same tick, straight.
  const ticks = await ticksOf("magic-and-step");
  const shot = ticks.findIndex((tick) => tick?.clips.some((clip) => ["araxxor magic", "araxxor ranged"].includes(clip)));
  assert.equal(shot, 55);
  assert.deepEqual([ticks[54].boss, ticks[55].boss], [[47, 22], [47, 23]]);
  assert.ok(!ticks[55].clips.includes("araxxor attack"));
}
{
  // The ball: from his edge in one of eight directions; at a player at 51,29 north, from 50,28.
  const ticks = await ticksOf("ball-north");
  const thrown = first(ticks, "araxxor ball");
  const path = [2, 3, 4, 5, 6, 7].map((n) => ticks[thrown + n].npcs.get("acid-ball-1")?.position.join());
  assert.deepEqual(path, ["49,27", "49,29", "49,31", "49,33", "49,34", "49,34"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => ticks[thrown + n].bossTarget), [null, null, null, null, "player"]);
}
{
  // The Mirrorback: no share for its first two ticks, then a fifth on the tick of the hit and half of that
  // back, rounded down; killed, it goes 3 ticks later, its death animation the tick after the hit.
  const ticks = await ticksOf("mirrorback");
  const hatched = ticks.findIndex((tick) => tick?.ids.includes("araxyte-0"));
  let shares = 0;
  for (let n = hatched; n < ticks.length; n++) {
    const taken = ticks[n].hits.find((hit) => hit.targetId === "araxxor" && hit.attackKind !== "typeless")?.damage ?? 0;
    const share = ticks[n].hits.find((hit) => hit.targetId === "araxyte-0" && hit.attackKind === "typeless")?.damage ?? 0;
    const recoil = ticks[n].damage.find((hit) => /reflection/.test(hit.source))?.effectiveDamage;
    if (n < hatched + 3) assert.equal(share, 0);
    else if (share > 0) {
      shares++;
      assert.equal(share, Math.floor((taken + share) / 5));
      assert.equal(recoil, Math.floor(share / 2));
    }
  }
  assert.ok(shares > 1);
  const killed = ticks.findIndex((tick, n) => n > hatched && tick.npcs.get("araxyte-0")?.alive === false);
  assert.equal(ticks[killed].npcs.get("araxyte-0").deathAnimationTick, killed + 1);
  assert.deepEqual([2, 3].map((n) => ticks[killed + n].ids.includes("araxyte-0")), [true, false]);
}
{
  // Off his corner, 2 tiles away: one pool. After the cleave he stands for 2 ticks, then comes.
  const ticks = await ticksOf("cleave-off-corner");
  const cleave = first(ticks, "araxxor cleave");
  assert.deepEqual([ticks[cleave - 1].boss, ticks[cleave - 1].player], [[47, 22], [45, 30]]);
  assert.deepEqual(newPools(ticks, cleave + 2), ["45,30"]);
  assert.deepEqual([0, 1, 2, 3].map((n) => ticks[cleave + n].boss.join()), ["47,22", "47,22", "47,22", "46,23"]);
}
{
  // The boots: a shot that would have hurt is negated, at most one in 8 ticks, with the message as he shoots;
  // a cleave, at most one in 20, with the message 2 ticks after the swing.
  const message = "Your Aranea boots let you avoid the spider-based attack.";
  const ticks = await ticksOf("aranea-boots");
  const said = ticks.flatMap((tick, n) => (tick?.messages.includes(message) ? [n] : []));
  const enraged = ticks.findIndex((tick) => tick?.enraged);
  const shots = said.filter((n) => n < enraged), cleaves = said.filter((n) => n >= enraged);
  assert.ok(shots.length > 1 && cleaves.length > 1, `${shots} / ${cleaves}`);
  const shotTicks = all(ticks, "araxxor ranged"), cleaveTicks = all(ticks, "araxxor cleave");
  shots.forEach((n, i) => {
    assert.ok(shotTicks.includes(n));
    if (i) assert.ok(n - shots[i - 1] >= 8);
    assert.deepEqual(ticks[n + 3].hits.filter((hit) => hit.attackKind === "range_arrow").map((hit) => hit.damage), [0]);
  });
  cleaves.forEach((n, i) => {
    assert.ok(cleaveTicks.includes(n - 2));
    if (i) assert.ok(n - cleaves[i - 1] >= 20);
    assert.ok(!ticks[n - 1].damage.some((hit) => /cleave/.test(hit.source)));
  });
  // Without them none is, and some hurt.
  const worn = scenarios.find(({ name }) => name === "araxxor/aranea-boots").equipment;
  const bare = await ticksOf("aranea-boots", { equipment: { ...worn, boots: undefined } });
  assert.ok(!bare.some((tick) => tick?.messages.includes(message)));
  assert.ok(bare.some((tick) => tick?.damage.some((hit) => /cleave/.test(hit.source) && hit.effectiveDamage > 0)));
}
{
  // His Defence goes down by 45 levels and no further, enraged too.
  const ticks = await ticksOf("defence-drain");
  const drains = ticks.map((tick) => tick.defenceDrain), enraged = ticks.findIndex((tick) => tick.enraged);
  assert.ok(Math.max(...drains.slice(0, enraged)) === 45, `${drains}`);
  assert.equal(Math.max(...drains), 45);
}
{
  // His death: the acid with the killing hit, his animation the tick after; the araxytes die with it and go 2
  // ticks later, the eggs crumble a tick after it and go 2 after that; won 5 ticks after it.
  const ticks = await ticksOf("enrage-and-kill");
  const killed = ticks.findIndex((tick) => tick?.hp === 0), animation = ticks[killed].npcs.get("araxxor").deathAnimationTick;
  const eggs = ticks[killed].ids.filter((id) => id.startsWith("araxxor-egg")), araxytes = ticks[killed].ids.filter((id) => id.startsWith("araxyte-"));
  assert.ok(eggs.length > 0 && araxytes.length > 0);
  assert.equal(animation, killed + 1);
  assert.deepEqual(ticks[killed].pools, []);
  assert.ok(ticks[animation].clips.some((clip) => /^araxyte-\d (explode|death)$/.test(clip)));
  for (const egg of eggs) assert.ok(ticks[animation + 1].clips.includes(egg + " crumble"));
  const here = (n, ids) => ticks[n].ids.filter((id) => ids.includes(id)).length;
  assert.deepEqual([1, 2].map((n) => here(animation + n, araxytes)), [araxytes.length, 0]);
  assert.deepEqual([2, 3].map((n) => here(animation + n, eggs)), [eggs.length, 0]);
  assert.deepEqual([4, 5].map((n) => ticks[animation + n].outcome), ["resolving", "victory"]);
  // As it is won he is his corpse, 3 x 3 in his middle.
  const { npcTypeId, position } = ticks[animation + 5].npcs.get("araxxor-corpse");
  assert.deepEqual([npcTypeId, position], [13669, ticks[killed].boss.map((tile) => tile + 2)]);
}
{
  // Under him as the special falls due: a bite, and the special the next attack.
  const ticks = await ticksOf("under-him");
  const spray = first(ticks, "araxxor spray"), bites = all(ticks, "araxxor attack");
  assert.deepEqual([bites.slice(0, 7), spray], [[7, 13, 19, 25, 31, 37, 43], 49]);
  assert.deepEqual([ticks[42].player, ticks[42].boss], [[51, 27], [47, 22]]);
  // The spray: nine different tiles of the 5 x 5 one step on from the player, away from him, none under him.
  const { blobs } = ticks[spray], [px, py] = ticks[spray - 1].player, [bx, by] = ticks[spray - 1].boss;
  const on = [px + Math.sign(px - bx - 3), py + Math.sign(py - by - 3)];
  assert.equal(new Set(blobs.map(({ target }) => String(target.position))).size, 9);
  for (const { target: { position: [x, y] }, endDelayCycles } of blobs) {
    assert.ok(Math.abs(x - on[0]) <= 2 && Math.abs(y - on[1]) <= 2 && !(x >= bx && x < bx + 7 && y >= by && y < by + 7), `${x},${y}`);
    assert.equal(endDelayCycles, 90 + 10 * Math.max(Math.abs(x - bx - 3), Math.abs(y - by - 3)));
  }
}
{
  // Off his corner: one step, so that the player is beside one of his sides.
  const ticks = await ticksOf("corner-step");
  assert.deepEqual([ticks[9].boss, ticks[9].player, ticks[10].boss, ticks[12].boss], [[47, 22], [46, 29], [46, 22], [46, 22]]);
}
{
  // The ball to the east: it hurts the player it lands on, and rolls to the wall; the blobs land on open tiles only.
  const ticks = await ticksOf("ball-east");
  const thrown = first(ticks, "araxxor ball");
  const path = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => ticks[thrown + n].npcs.get("acid-ball-1")?.position.join());
  assert.deepEqual(path, ["52,24", "54,24", "56,24", "58,24", "60,24", "62,24", "63,24", "63,24"]);
  const balls = ticks.flatMap((tick, n) => (tick?.damage ?? []).filter(({ source }) => /ball/.test(source)).map(({ effectiveDamage }) => [n, effectiveDamage]));
  assert.equal(balls.length, 1);
  assert.equal(balls[0][0], thrown + 2);
  assert.ok(balls[0][1] >= 14 && balls[0][1] <= 18);
  for (const seed of [1, 2, 3, 4]) {
    const { pools } = (await ticksOf("ball-east", { seed })).at(-1);
    assert.ok(pools.every((tile) => Number(tile.split(",")[0]) < 64) && !pools.includes("63,26") && !pools.includes("62,27"), `64,x is past the lair's edge, 63,26 and 62,27 are rocks: ${pools}`);
  }
}
{
  // Not at 255, but below; the first cleave 5 ticks after it, his body 2; an egg that hatches enraged, and the next 38 ticks later.
  const ticks = await ticksOf("enraged-hatching");
  const enraged = first(ticks, "araxxor enrage");
  assert.deepEqual([ticks[enraged - 1].hp, ticks[enraged].hp, first(ticks, "araxxor cleave")], [255, 254, enraged + 5]);
  assert.deepEqual([1, 2].map((n) => ticks[enraged + n].enragedBody), [false, true]);
  assert.deepEqual([first(ticks, "araxyte-0 hatch"), first(ticks, "araxyte-1 hatch")], [22, 60]);
}
{
  // The cleave hurts whoever ends the tick after the swing in its line, for 25 to 38; he cuts himself 2 ticks after it
  // when a hit of the player's lands on him then, and has his target back, else 3.
  const ticks = await ticksOf("step-under");
  const seen = { hit: 0, dodged: 0, two: 0, three: 0 };
  for (const swing of all(ticks, "araxxor cleave").filter((n) => n + 3 < ticks.length)) {
    const { tiles } = ticks[swing].cleaves.at(-1), hit = ticks[swing + 1].damage.filter(({ source }) => /cleave/.test(source));
    const inLine = tiles.some((tile) => String(tile) === String(ticks[swing + 1].player));
    assert.equal(hit.length, inLine ? 1 : 0, `cleave of ${swing}`);
    if (inLine) assert.ok(hit[0].effectiveDamage >= 25 && hit[0].effectiveDamage <= 38);
    seen[inLine ? "hit" : "dodged"]++;
    const own = (n) => ticks[n].hits.some(({ targetId, attackKind }) => targetId === "araxxor" && attackKind !== "typeless");
    const cut = (n) => ticks[n].hits.some(({ targetId, attackKind, damage }) => targetId === "araxxor" && attackKind === "typeless" && damage >= 8 && damage <= 12);
    const after = own(swing + 2) ? 2 : 3;
    seen[after === 2 ? "two" : "three"]++;
    if (String(tiles[1]) !== String(ticks[swing - 1].player)) assert.fail("aimed at the player");
    const [x, y] = ticks[swing].boss, [px, py] = tiles[1], under = px >= x && px < x + 7 && py >= y && py < y + 7;
    assert.deepEqual([2, 3].map((n) => cut(swing + n)), under ? [after === 2, after === 3] : [false, false], `cut of ${swing}`);
    assert.deepEqual([1, 2, 3].map((n) => ticks[swing + n].bossTarget), [null, after === 2 ? "player" : null, "player"], `target of ${swing}`);
  }
  assert.ok(Object.values(seen).every((count) => count > 0), JSON.stringify(seen));
}
{
  // An araxyte on the tile he struck at takes the blow 2 ticks after the swing.
  const ticks = await ticksOf("cleave-araxyte");
  const swing = first(ticks, "araxxor cleave"), [x, y] = ticks[swing - 1].player, [mx, my] = ticks[swing + 1].npcs.get("araxyte-0").position;
  assert.ok(x >= mx && x <= mx + 1 && y >= my && y <= my + 1);
  const blow = ticks[swing + 2].hits.find(({ targetId }) => targetId === "araxyte-0");
  assert.ok(blow?.damage >= 25 && blow.damage <= 38);
}
{
  // The drip: the pool of a tick he stood still is made up for as the next drip starts.
  const ticks = await ticksOf("drip-owed");
  const [one, two] = all(ticks, "araxxor drip");
  assert.deepEqual([5, 6, 7, 8, 9, 10].map((n) => newPools(ticks, one + n).length), [1, 0, 1, 1, 1, 1]);
  assert.deepEqual(newPools(ticks, two + 5), [ticks[one + 10].player, ticks[two + 4].player].map(String).sort());
}
{
  // The Acidic: no spit before the sixth tick after it hatched, none on the tick it begins under the player, 7 at most.
  const ticks = await ticksOf("acidic-near");
  const hatched = first(ticks, "araxyte-0 hatch"), spits = all(ticks, "araxyte-0 attack");
  assert.deepEqual([spits[0] - hatched, ticks[hatched + 5].npcs.get("araxyte-0").position], [6, [58, 14]]);
  const under = (n) => {
    const [x, y] = ticks[n - 1].npcs.get("araxyte-0").position, [px, py] = ticks[n - 1].player;
    return px >= x && px <= x + 1 && py >= y && py <= y + 1;
  };
  assert.ok(spits.length > 2 && !spits.some(under), `${spits}`);
  assert.ok(ticks.some((tick, n) => n > 40 && n % 6 === 4 && under(n)), "it begins a tick it would spit on under him");
  const dealt = [...(await ticksOf("green-eggs")), ...ticks].flatMap((tick) => tick.damage.filter(({ source }) => source === "Acidic Araxyte").map(({ effectiveDamage }) => effectiveDamage));
  assert.ok(dealt.length > 10 && Math.max(...dealt) <= 7, `${dealt}`);
}
{
  // He does not step on the two ticks after he comes up.
  const ticks = await ticksOf("from-range");
  assert.deepEqual([1, 2, 3].map((n) => ticks[n].boss.join()), ["47,22", "47,22", "47,22"]);
  assert.notEqual(ticks[4].boss.join(), "47,22");
}
{
  // His own cut kills him: his death, and with it what follows it, on its tick.
  const ticks = await ticksOf("cut-to-death");
  const killed = ticks.findIndex((tick) => tick?.hp === 0);
  assert.equal(killed, first(ticks, "araxxor cleave") + 3);
  assert.equal(ticks[killed].npcs.get("araxxor").deathAnimationTick, killed);
  assert.ok(ticks[killed + 1].clips.includes("araxxor-egg-0 crumble"));
  assert.deepEqual([4, 5].map((n) => ticks[killed + n].outcome), ["resolving", "victory"]);
}
console.log("Araxxor's rules are as recorded");
process.exit(0);
