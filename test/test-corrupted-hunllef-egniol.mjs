import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

await loadEnvironment();
const { getConsumableDefinition, applyConsumableEffects } = await import("../client/engine/consumables.js");

const doseIds = [23885, 23884, 23883, 23882]; // CACHE: Egniol potion (4) through (1)
const emptyVialId = 229; // CACHE: vial

test("Egniol doses restore prayer and run energy, apply stamina, and sip down", () => {
  for (let index = 0; index < doseIds.length; index++) {
    const itemId = doseIds[index];
    const consumable = getConsumableDefinition(itemId);
    assert.ok(consumable, `dose ${itemId} has a consumable definition`);
    assert.equal(consumable.consume.type, "replace");
    assert.equal(consumable.consume.withId, doseIds[index + 1] ?? emptyVialId);

    const playerState = {
      currentTick: 1,
      playerHP: 99,
      stats: { hitpoints: { current: 99 }, prayer: { current: 99, max: 99 } },
      prayerState: { points: 20, maxPoints: 99 },
      runEnergy: { energy: 1000 },
      activeEffects: [],
    };
    const result = applyConsumableEffects(consumable.effects, playerState);
    assert.equal(result.prayerState.points, 51, "restores prayer potion amount");
    assert.equal(result.runEnergy.energy, 5000, "restores 40% run energy");
    assert.deepEqual(result.activeEffects.map(({ type, ticksRemaining }) => [type, ticksRemaining]), [["stamina", 200]]);
  }
});
