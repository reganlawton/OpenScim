// An encounter's rule isPlayerAttackProtected makes a player's hit do nothing
// (a boss praying against its style). Without the rule, or while it says no,
// nothing changes. The engine's deactivateAllPrayers turns every prayer of the
// player off. A fight of the harness (the Leviathan, a bow), no browser.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { cacheZip, runScenario } from "../tools/determinism/harness.mjs";
import { attack, boss, offensive, protect, rangedGear } from "../tools/determinism/scenarios/common.mjs";

// The boss's hitpoints after 40 ticks of attacks; `rule` goes on the encounter's rules before the first tick.
async function fight(rule) {
  const asked = [];
  let hp;
  let full;
  await runScenario({
    name: "player-attack-protected",
    kind: "leviathan",
    seed: 3,
    ticks: 40,
    mechanics: { infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) {
        full = boss(api).vitals.hp;
        if (rule) {
          api.engine.getEncounterRules().isPlayerAttackProtected = (style, target, context) => {
            asked.push([style, target.id, typeof context.tick]);
            return rule();
          };
        }
      }
      if (api.player().attackTarget !== "leviathan") attack(api, "leviathan");
      hp = boss(api).vitals.hp;
    },
  });
  return { hp, full, asked };
}

const skip = !existsSync(cacheZip) && `${cacheZip} is missing (npm run assets)`;

test("isPlayerAttackProtected: a protected hit does nothing; no rule, or no, changes nothing", { skip }, async () => {
  const plain = await fight();
  assert.ok(plain.hp < plain.full, `the bow damages the boss: ${plain.hp} of ${plain.full}`);

  const no = await fight(() => false);
  assert.equal(no.hp, plain.hp);
  assert.ok(no.asked.length > 0);
  assert.ok(no.asked.every(([style, id, tick]) => style === "range" && id === "leviathan" && tick === "number"), JSON.stringify(no.asked[0]));

  const yes = await fight(() => true);
  assert.equal(yes.hp, yes.full);
});

test("deactivateAllPrayers turns every prayer of the player off", { skip }, async () => {
  let before;
  let after;
  await runScenario({
    name: "deactivate-all-prayers",
    kind: "leviathan",
    seed: 3,
    ticks: 6,
    mechanics: { infiniteHealth: true, infinitePrayer: true },
    ...rangedGear,
    script(tick, api) {
      const prayers = () => [api.player().activePrayer, api.player().offensivePrayer];
      if (tick === 1) {
        protect(api, "ProtectRange");
        offensive(api, "rigour");
      }
      if (tick === 4) {
        before = prayers();
        api.engine.deactivateAllPrayers(tick);
        after = prayers();
      }
    },
  });
  assert.ok(before.every(Boolean), JSON.stringify(before));
  assert.deepEqual(after, [null, null]);
});
