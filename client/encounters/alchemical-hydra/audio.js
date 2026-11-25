// The sounds of the fight that are in no animation. The game's server sends
// each of them, so here they are rules, keyed by the type of a tick event
// (docs/ADDING-AN-ENCOUNTER.md, section 5, `audio`). The layers of all
// encounters hear every event: a rule answers `pass` to what is not its own.
// The sounds of the frames of its sequences are in the cache with them, and
// the scene plays those.
//
// OBS (tsps), as in encounter.js: each sound's id, delay and range.
const attackSounds = {
  alchemical_hydra_magic: 4083, // on the player's tile as it lands, range 1
  alchemical_hydra_range: 4120,
};

const play = (sounds) => (sounds.length > 0 ? { kind: "play", sound: sounds } : { kind: "pass" });
// What the encounter attaches to its visual events (encounter.js, `visual`):
// { id, delayCycles?, range?, position? }, a sound on a tile when it has a position.
const sound = ({ id, delayCycles = 0, range, position }) =>
  position ? { id, delayCycles, range: range ?? 1, position: [...position], channel: "area" } : { id, delayCycles, channel: "sfx" };

export const alchemicalHydraAudio = {
  layerName: "alchemical_hydra",
  rules: {
    zuk_attack: {
      preloadIds: Object.values(attackSounds),
      resolve({ attack, targetPosition, projectileArrivalCycles }) {
        if (!Object.hasOwn(attackSounds, attack)) return { kind: "pass" };
        return play([{ id: attackSounds[attack], delayCycles: projectileArrivalCycles ?? 0, range: 1, position: [...targetPosition], channel: "area" }]);
      },
    },
    inferno_visual: {
      // The switch, the roar, the vents, the death; the poison's, the currents' and the fires'.
      preloadIds: [4106, 4076, 4078, 4080, 4135, 3944, 3887, 4099, 4133],
      resolve({ hydraSounds }) {
        return play((hydraSounds ?? []).map(sound));
      },
    },
  },
};
