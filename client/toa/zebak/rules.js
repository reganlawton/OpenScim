export const invocationPoints = Object.freeze({
  blood: 15,
  spray: 10,
  clouds: 5,
  upset: 15,
});
export function configure(options = {}) {
  const flags = {
    ...options,
    spray: !!options.blood && !!options.spray,
    clouds: !!options.blood && !!options.clouds,
  };
  const path = Number(options.path ?? 0),
    other = Number(options.other ?? 0);
  if (
    !Number.isInteger(path) ||
    path < 0 ||
    path > 6 ||
    !Number.isInteger(other) ||
    other < 0 ||
    other % 5 !== 0
  )
    throw Error("Invalid raid or path level");
  const raid =
    other + (options.quiet === true ? 20 : 0) +
    Object.entries(invocationPoints).reduce(
      (sum, [key, points]) => sum + (flags[key] ? points : 0),
      0,
    );
  const tier = Math.min(2, Math.floor(path / 2));
  return {
    raid,
    path,
    blood: !!flags.blood,
    spray: flags.spray,
    clouds: flags.clouds,
    upset: !!flags.upset,
    period: 7 - tier,
    enragePeriod: 4 - tier,
    gap: 3 - tier,
    acidWidth: flags.upset ? 5 : 3,
    jugWidth: flags.upset ? 3 : 5,
    cloudCount: flags.blood ? (flags.clouds ? 3 : 1) : 0,
  };
}
export const thresholds = [85, 70, 55, 40];
function pathStatPercent(path) {
  return path === 0 ? 100 : 103 + 5 * path;
}
export function soloZebakHitpoints(raid, path) {
  const raidPercent = 100 + Math.floor(raid * 4 / 10);
  const raidHp = Math.floor(580 * raidPercent / 100);
  const pathHp = Math.floor(raidHp * pathStatPercent(path) / 100);
  return Math.floor((pathHp + 5) / 10) * 10;
}
export function zebakAutoMaxHit(melee, raid, path) {
  const base = melee ? 38 : 16;
  const raidHit = Math.floor(base * (250 + Math.min(375, raid)) / 250);
  return Math.floor(raidHit * pathStatPercent(path) / 100);
}
export function scaleToaAccuracyRoll(roll, raid = 0) {
  return raid ? Math.floor(roll * (250 + raid) / 250) : roll;
}
// The Tombs scale a monster's damage by 0.4% a raid level (zebakAutoMaxHit above does the same for his spit).
// OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz): at raid level 370 the Tidal Waves' 6-10 hit 14-19.
export function scaleToaDamage(damage, raid = 0) {
  return Math.floor(damage * (250 + Math.min(375, raid)) / 250);
}
