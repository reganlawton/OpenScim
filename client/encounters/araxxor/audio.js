// The sounds of the fight that are in no animation. The game's server sends
// each of them, so here they are rules, keyed by the type of a tick event
// (docs/ADDING-AN-ENCOUNTER.md, section 5, `audio`). The layers of all
// encounters hear every event: a rule answers `pass` to what is not its own.
// The sounds of the frames of his animations, the eggs' and the araxytes' are
// in the cache with them, and the scene plays those.
//
// Sources as in encounter.js. Plain OBS has only sounds without a place, as
// loud wherever the player stands; the two with a place are OBS (tsps). k1's
// sounds start at t 186. OBS: none of these is sent with the cleave, the drip's
// throw, the enrage, a hatching, the Ruptura's blast, a hit of the acid or his
// death (tsps has none for the cleave and the enrage either).
import { spots } from "./encounter.js";

const everywhere = (id, delayCycles = 0) => ({ id, ...(delayCycles ? { delayCycles } : {}), channel: "sfx" });

const attackSounds = {
  araxxor_melee: everywhere(9413, 40), // OBS: 39 of 39 bites from k1 188 on; OBS (tsps)
  araxxor_magic: everywhere(9479, 120), // OBS k1 218; OBS (tsps)
  araxxor_range: everywhere(9470, 120), // OBS (tsps)
  araxxor_ball: everywhere(9488), // OBS: 3 of 3 throws (k2 35, 77, 119); OBS (tsps)
};
const burstSound = everywhere(9470, 30); // OBS: 3 of 3 as the ball throws its blobs (k2 41, 83, 125)
const dripSound = everywhere(9401); // OBS: 3 of 3 as the drip starts (k1 210, 252, 294)
const recoilSound = everywhere(5196); // OBS: 9 of 9 hits the Mirrorback throws back, a 0 too (k1 277, 281, 285; k2 60 to 84)
const spitSound = { id: 9378, delayCycles: 25, range: 5, channel: "area" }; // OBS (tsps): on the player's tile
const splatSound = { id: 4135, range: 2, channel: "area" }; // OBS (tsps): on the blob's tile as it lands

const play = (sounds) => (sounds.length > 0 ? { kind: "play", sound: sounds } : { kind: "pass" });

export const araxxorAudio = {
  layerName: "araxxor",
  rules: {
    zuk_attack: {
      preloadIds: [...new Set(Object.values(attackSounds).map(({ id }) => id)), spitSound.id],
      resolve({ attack, targetPosition }) {
        if (attack === "araxyte_acidic") return play([{ ...spitSound, position: [...targetPosition] }]);
        return play(Object.hasOwn(attackSounds, attack) ? [attackSounds[attack]] : []);
      },
    },
    inferno_visual: {
      preloadIds: [burstSound.id, dripSound.id, recoilSound.id, splatSound.id],
      resolve({ ballBurst, dripStarts, mirrorbackRecoil, graphics = [] }) {
        return play([
          ...(ballBurst ? [burstSound] : []),
          ...(dripStarts ? [dripSound] : []),
          ...(mirrorbackRecoil ? [recoilSound] : []),
          ...graphics.filter(({ spotAnimId }) => spotAnimId === spots.splat).map(({ target, delayCycles }) => ({ ...splatSound, delayCycles, position: [...target.position] })),
        ]);
      },
    },
  },
};
