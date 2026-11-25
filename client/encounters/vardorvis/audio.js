// The head's sounds that the game's server sends: as the head rises and
// screams, 3539 (a magic head: 277), and as its projectile lands, 4015,
// prayed against or not. Both are sound effects with no place, one of each
// for each projectile of a pair. OBS: RSPSApp's recordings (its
// docs/vardorvis.md, data/vardorvis.json and Head.Vardorvis.js). CACHE names
// them tob_sotetseg_attack_ranged, abyssal_death and
// tob_sotetseg_ricochet_player_hit. Rules as in docs/ADDING-AN-ENCOUNTER.md,
// section 5, `audio`; their ids are under "4" in tools/assets/cache-groups/vardorvis.json.
//
// The sounds on the frames of the head's scream (10348: 7143, 7120, 7074)
// are the cache's, and the scene plays them as area sounds: nothing here.
//
// The rise's event (raiseHead) names a scream graphic per projectile, a tick
// apart, and the projectiles with their arrival: the landing is played from
// it, as Zebak's impact sound is from his attack (toa/zebak/native.js).
// ponytail: the game sends no landing once he or the player has died; here
// it still sounds, unless the scene is gone.
import { spots } from "./encounter.js";

const screamSoundIds = new Map([
  [spots.headScream, 3539],
  [spots.headScreamMagic, 277],
]);
const headProjectileIds = new Set([spots.headProjectile, spots.headProjectileMagic]);
const landSoundId = 4015;
const pass = { kind: "pass" };

export const vardorvisAudio = {
  layerName: "vardorvis",
  rules: {
    inferno_visual: {
      preloadIds: [...screamSoundIds.values(), landSoundId],
      resolve(event) {
        const screams = (event.graphics ?? []).filter((cue) => screamSoundIds.has(cue.spotAnimId));
        if (screams.length === 0) return pass;
        const landings = (event.projectiles ?? []).filter((cue) => headProjectileIds.has(cue.spotAnimId));
        return {
          kind: "play",
          sound: [
            ...screams.map((cue) => ({ id: screamSoundIds.get(cue.spotAnimId), delayCycles: cue.delayCycles, channel: "sfx" })),
            ...landings.map((cue) => ({ id: landSoundId, delayCycles: cue.endDelayCycles, channel: "sfx" })),
          ],
        };
      },
    },
  },
};
