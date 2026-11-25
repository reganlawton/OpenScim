export const cyclesPerTick = 30;
// The first visible pot/rock and arrival are frame estimates. Cache sound matches
// place redirects and impacts at ticks 4/7 on paths 0 and 3, and 3/5 on path 4.
// Baseline https://youtu.be/93wKYCaXfmo?t=196, path 3 https://youtu.be/0-T2gOVfTkI?t=1265,
// path 4 https://youtu.be/mwKeq1tP05Y?t=544.
// Each mouth is sampled from the animated head at release. X/Y are relative
// to the southwest tile; height is above terrain in cache units (128 per tile).
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, path level 0, all 77 spits, e.g. ticks 112-120, 229-237 and 618-626): the
// pot leaves the tile 7 east and 4 north of his south-west tile 60 cycles after the animation starts, 200 high,
// rises on slope 30 to 700 above the tile 15 east, bursts there at 120 cycles (the graphic at 750) and comes
// down on slope 127 to 90 on the player at 210 cycles. The hitsplat is 8 ticks after the animation starts.
const standardSpit = {
  clipId: "standardSpit", releaseFrame: 66,
  release: 60, split: 120, arrival: 210, impactTicks: 8,
  mouth: {x: 7.5, y: 4.5, height: 200},
  burstHeight: 700, burstGraphicHeight: 750, endHeight: 90, slopes: [30, 127],
  enragedProjectiles: false,
};
const fastSpit = {
  clipId: "fastSpit", releaseFrame: 66,
  release: 56, split: 85, arrival: 142, impactTicks: 5,
  mouth: {x: 8.58, y: 4.54, height: 309},
  // Frame estimates from footage of path level 4 (see above); no recording of it yet.
  burstHeight: 560, burstGraphicHeight: 560, endHeight: 64, slopes: [null, 0],
  enragedProjectiles: true,
};
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the 22 enraged spits of ticks 618-705, path level 0): enraged he spits with
// the same animation (9624, tail 9625), the same pots (2176, 2178) and the same flight as before.
const standardEnragedSpit = {...standardSpit, clipId: "standardEnragedSpit"};
const fastEnragedSpit = {...fastSpit, clipId: "fastEnragedSpit", releaseFrame: 32,
  release: 32, mouth: {x: 8.49, y: 4.54, height: 315}};
export function spitClips(normalSequence, enragedSequence) {
  const clip = (seqId, timing) => ({seqId, releaseFrame: timing.releaseFrame, releaseCycle: timing.release});
  return {
    standardSpit: clip(normalSequence, standardSpit),
    fastSpit: clip(normalSequence, fastSpit),
    standardEnragedSpit: clip(normalSequence, standardEnragedSpit),
    fastEnragedSpit: clip(enragedSequence, fastEnragedSpit),
  };
}
export function spitTiming(path, enraged = false) {
  if (path >= 4) return enraged ? fastEnragedSpit : fastSpit;
  return enraged ? standardEnragedSpit : standardSpit;
}

// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the specials that start on ticks 299 and 543): the spit is animated one tick
// after the special starts and the vomit is heard then; the rocks, jugs and acid leave his mouth a tick later
// and all land together, 6 ticks after the start. A blood spell cast as the special starts puts the sound,
// the flight and the landing one tick later (the specials of ticks 147, 360 and 419: `delayedByBlood`).
export const specialThrow = { animation: 30, sound: 30, release: 60, acidLandingTick: 6, solidLandingTick: 6, delayedByBlood: 1 };
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, every throw, e.g. tick 150): thrown from 250 high to the ground on slope 35.
export const specialThrowArc = { startHeight: 250, endHeight: 0, slope: 35 };

// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the roars of ticks 394 and 572, their specials starting on 360 and 543): the
// roar is animated 34 ticks after a first roar's special starts and 29 after a second's, as below. Then:
// dust on its 3rd, 5th and 7th tick, each tile 1 cycle later per tile of distance from the tile before his
// jaw; 50 on every boulder and the jugs broken on its 4th, 6th and 8th; his next spit on its 11th.
export const roarTicks = { dust: [3, 5, 7], damage: [4, 6, 8], over: 11, dustOrigin: [22, 32] };
// OBS (same roars; spits at ticks 371 and 554): his first spit after a roar's special is 11 ticks after its start.
export const roarSpecialRecovery = 11;
// Ticks from the start of the special spit to the start of the roar animation.
// Measured from 5908 (+30 cycles) and 5836 (+20 cycles) in the recordings above.
// The second baseline roar is inferred from the five-tick difference on paths 3 and 4.
const firstRoarByAttackPeriod = {7: 34, 6: 31, 5: 29};
export function roarWindupTick(attackPeriod = 7, secondRoar = false) {
  const firstRoar = firstRoarByAttackPeriod[attackPeriod];
  return firstRoar - (secondRoar ? 5 : 0);
}

// The cycles after the animation starts at which the pot's burst and its impact are heard.
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, every spit): 120 and 210 at path level 0, where the hit is 8 ticks on.
// The faster spit keeps its estimate from footage.
export function spitSoundCycles(impactTicks) {
  return impactTicks === standardSpit.impactTicks
    ? { redirect: standardSpit.split, impact: standardSpit.arrival }
    : { redirect: (impactTicks + 1) / 2 * cyclesPerTick, impact: impactTicks * cyclesPerTick };
}
