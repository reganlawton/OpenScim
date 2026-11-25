// The fixture encounter of test/fixtures/training-ground/: an encounter that
// no file under client/ knows. The harness's module hooks register it in the
// two lists a contributor adds a line to (test/fixtures/register.mjs), and
// these fights reach it the way every fight is reached: by its kind, through
// the encounter registry.
//
// The arena is Yama's. The sparring partner (4 x 4 tiles, 75 hitpoints)
// starts at 30,29 and walks to the player, who starts at 31,37; it hits
// every four ticks, for up to 8, or up to 20 with the toggle "Hard hits".
import { attack, command, item, protect, rangedGear } from "./common.mjs";

const KIND = "training_ground";
const PARTNER = "sparring-partner";

export const scenarios = [
  {
    // The player shoots until the partner is dead; three ticks later the fight is won.
    name: "fixture/kill",
    kind: KIND,
    seed: 12,
    ticks: 60,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) attack(api, PARTNER);
    },
  },
  {
    // The toggle, the debug action, a prayer. The player walks into melee with
    // a weapon and no armour and takes the hard hits (3, 15 and 6 by tick 16;
    // without the toggle none is over 8), then prays against them from tick
    // 21. On tick 19 the debug action heals the partner, which is at 41 of 75.
    name: "fixture/hard-hits-and-heal",
    kind: KIND,
    seed: 7,
    ticks: 80,
    mechanics: { trainingGroundHardHits: true },
    equipment: { weapon: item.osmumtensFang },
    script(tick, api) {
      if (tick === 1) attack(api, PARTNER);
      if (tick === 19) command(api, { encounter: KIND, type: "heal-partner" });
      if (tick === 21) protect(api, "ProtectMelee");
    },
  },
];
