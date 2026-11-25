// His sounds that are in no animation. The game's server sends them, so here
// they are rules, keyed by the type of a tick event
// (docs/ADDING-AN-ENCOUNTER.md, section 5, `audio`). The layers of all
// encounters hear every event: a rule answers `pass` to what is not its own.
// The sounds of the frames of his animations and of the gas (his roars, the
// eye, the slam, the smoke) are in the cache with them, and the scene plays
// those.
//
// OBS 11/24 as in encounter.js; CACHE names a sound in its table of names. Not
// recorded, so without a sound of their own here: a gaze that finds the player,
// the magic attack, a player the gas hurts.
import { bossActorId, bossSize, bossStart, spots } from "./encounter.js";

// With no place: as loud wherever the player stands.
// OBS 11/24: 11 of 11 gazes, as it starts. CACHE: dt2_duke_sight_attack_charge_01.
const gazeSoundId = 7215;
// OBS 11/24: 11 of 11, as the player is told they avoided it. CACHE: ice_barrage_impact.
const avoidedSoundId = 168;
// OBS 11/24: 18 of 18 spits of gas, with the spit. CACHE: akd_xamphur_magic_attack.
const spitSoundId = 5002;
// OBS 11/24: 4 of 4 vials, the tick after one is fed. CACHE: dt2_duke_poison_roar_04.
const poisonSoundId = 7249;

// Heard from a tile.
// OBS 11/24: 60 of 60 melee attacks, with the icicles, from the middle of the
// front of him. CACHE: throwingknife.
const iciclesSound = { id: 2707, range: 10, position: [bossStart[0] + 3, bossStart[1]], channel: "area" };
// OBS 11/24: 35 of 35 hits that hurt him, on the hitsplat's tick, from his middle
// tile, and none of 36 hits of 0. CACHE: dt2_duke_hit_impact_03.
const hurtSound = { id: 7181, range: 10, position: bossStart.map((at) => at + Math.floor(bossSize / 2)), channel: "area" };
// OBS 11/24: each time the cloud over a vent is drawn again, from the vent (98 of
// 98, on the tick and at the vent it is drawn at here). CACHE: cave_bubble_2.
const puffSound = { id: 3052, range: 3, channel: "area" };

const play = (sounds) => (sounds.length > 0 ? { kind: "play", sound: sounds } : { kind: "pass" });
const everywhere = (id) => ({ id, channel: "sfx" });

export const dukeAudio = {
  layerName: "dukeSucellus",
  rules: {
    inferno_visual: {
      preloadIds: [gazeSoundId, avoidedSoundId, spitSoundId, poisonSoundId, iciclesSound.id, puffSound.id],
      resolve({ gazeAvoided, poisonFelt, animations = [], projectiles = [], graphics = [] }) {
        const starts = (clip) => animations.some(({ actorId, clipId }) => actorId === bossActorId && clipId === clip);
        return play([
          ...(gazeAvoided ? [everywhere(avoidedSoundId)] : []),
          ...(poisonFelt ? [everywhere(poisonSoundId)] : []),
          ...(starts("gaze") ? [everywhere(gazeSoundId)] : []),
          ...(starts("melee") ? [iciclesSound] : []),
          ...(projectiles.some(({ spotAnimId }) => spotAnimId === spots.gasProjectile) ? [everywhere(spitSoundId)] : []),
          ...graphics.filter(({ spotAnimId }) => spotAnimId === spots.gasIdle).map(({ target }) => ({ ...puffSound, position: [...target.position] })),
        ]);
      },
    },
    hit_applied: {
      preloadIds: [hurtSound.id],
      resolve: ({ targetId, damage }) => play(targetId === bossActorId && damage > 0 ? [hurtSound] : []),
    },
  },
};
