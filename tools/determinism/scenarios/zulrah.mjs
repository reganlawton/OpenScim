// Determinism scenarios for Zulrah: rotation phases, toxic clouds, snakelings, and Jad alternation.
import { attack, command, protect, rangedGear } from "./common.mjs";

const KIND = "zulrah";
const BOSS = "zulrah";

export const scenarios = [
  {
    name: "zulrah/rotation-1",
    kind: KIND,
    seed: 101,
    ticks: 110,
    mechanics: {
      zulrahRotation: "1",
      zulrahSnakelings: true,
      zulrahToxicClouds: true,
    },
    ...rangedGear,
    script(tick, api) {
      // Walk to NE pillar during opener, then attack Zulrah through Magma/Tanzanite/Serpentine.
      if (tick === 1) api.moveTo(32, 68);
      if (tick === 5) attack(api, BOSS);
      if (tick === 24) api.moveTo(33, 68); // Dodge Magma melee slam
      if (tick === 42) protect(api, "ProtectMagic"); // Tanzanite phase
      if (tick === 68) {
        protect(api, "ProtectRanged"); // Serpentine South phase
        api.moveTo(24, 62);
      }
      if (tick === 78) attack(api, BOSS);
    },
  },
  {
    name: "zulrah/jad-practice",
    kind: KIND,
    seed: 202,
    ticks: 60,
    mechanics: {
      zulrahRotation: "3",
      zulrahSnakelings: false,
      zulrahToxicClouds: false,
    },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.moveTo(32, 68);
      if (tick === 2) command(api, { encounter: KIND, type: "jump-to-jad" });
      if (tick === 3) {
        protect(api, "ProtectMagic");
        attack(api, BOSS);
      }
      // Rotation 3 Jad starts Magic then alternates Range/Magic every 4 ticks.
      if (tick === 6) protect(api, "ProtectRanged");
      if (tick === 10) protect(api, "ProtectMagic");
      if (tick === 14) protect(api, "ProtectRanged");
      if (tick === 18) protect(api, "ProtectMagic");
      if (tick === 22) protect(api, "ProtectRanged");
    },
  },
];
