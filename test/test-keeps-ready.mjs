// An encounter's rule playerAttackKeepsReady lets an attack with a weapon
// that is ready start no cooldown: it attacks again on its next tick. Without
// the rule, or while it says no, and while the weapon cools down, nothing
// changes. A fight of the harness (the Leviathan, a 5-tick bow), no browser.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { cacheZip, runScenario } from "../tools/determinism/harness.mjs";
import { attack, rangedGear } from "../tools/determinism/scenarios/common.mjs";

// The ticks the player attacks on; `rule` goes on the encounter's rules before the first tick.
async function attackTicks(rule) {
  const ticks = [];
  const asked = [];
  await runScenario(
    {
      name: "keeps-ready",
      kind: "leviathan",
      seed: 3,
      ticks: 40,
      mechanics: { infiniteHealth: true, infinitePrayer: true },
      ...rangedGear,
      script(tick, api) {
        if (tick === 1 && rule) {
          api.engine.getEncounterRules().playerAttackKeepsReady = (target, at) => {
            asked.push([target.id, at]);
            return rule(ticks.length);
          };
        }
        if (api.player().attackTarget !== "leviathan") attack(api, "leviathan");
      },
    },
    { onTick: (tick, engine) => engine.getLastTickEvents().some((event) => event.type === "attack_started" && event.sourceId === "player") && ticks.push(tick) },
  );
  return { ticks, asked };
}
const gaps = (ticks) => ticks.slice(1).map((tick, n) => tick - ticks[n]);

test("playerAttackKeepsReady: a ready weapon's attack starts no cooldown", { skip: !existsSync(cacheZip) && `${cacheZip} is missing (npm run assets)` }, async () => {
  const plain = (await attackTicks()).ticks;
  assert.ok(plain.length >= 5, plain.join());
  const speed = gaps(plain)[0];
  assert.ok(speed > 1 && gaps(plain).every((gap) => gap === speed), plain.join());

  // A rule that always says no changes nothing; it is asked only on the ticks of the attacks, with the weapon ready.
  const no = await attackTicks(() => false);
  assert.deepEqual(no.ticks, plain);
  assert.deepEqual(no.asked, plain.map((tick) => ["leviathan", tick]));

  // The second attack keeps the weapon ready: the third comes on the next tick, and starts the cooldown.
  const second = (await attackTicks((before) => before === 1)).ticks;
  assert.deepEqual(gaps(second).slice(0, 4), [speed, 1, speed, speed]);
});
