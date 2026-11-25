import assert from "node:assert/strict";
import {ZebakPhases} from "../client/toa/zebak/phases.js";
import {specialDrops} from "../client/toa/zebak/special-layouts.js";

const key = p => p.join(",");
const arena = new Set();
// Consecutive columns x=22..38 of the 296-tile native bridge-aware collision map.
const bounds = [[28,36],[25,39],[25,40],[24,41],[24,42],[24,42],[23,41],[22,42],
  [22,42],[23,41],[23,41],[23,42],[23,41],[23,40],[24,40],[25,39],[26,37]];
for (const [column,[lo,hi]] of bounds.entries())
  for (let y = lo; y <= hi; y++) arena.add(key([22+column,y]));
assert.equal(arena.size,296);

function canWashShelter(drops, acid, radius) {
  const positions = kind => drops.filter(drop => drop.kind === kind).map(drop => drop.position);
  const rocks = new Set(positions("rock").map(key));
  const shelter = positions("rock").flatMap(([x,y]) => [1,2,3].map(depth => [x+depth,y]))
    .filter(tile => arena.has(key(tile)) && !rocks.has(key(tile)));
  const washes = ([x,y]) => shelter.some(([sx,sy]) => Math.max(Math.abs(sx-x),Math.abs(sy-y)) <= radius);
  for (const [jx,jy] of positions("jug")) {
    if (washes([jx,jy])) return true;
    for (const dx of [-1,0,1]) for (const dy of [-1,0,1]) {
      if (!dx && !dy) continue;
      // Either Push or Pull can start this roll from a neighboring clean tile.
      const stance = [-1,1].map(sign => key([jx+sign*dx,jy+sign*dy]));
      if (!stance.some(k => arena.has(k) && !rocks.has(k) && !acid.has(k))) continue;
      for (let steps = 1; steps <= 6; steps++) {
        const tile = [jx+steps*dx,jy+steps*dy];
        if (!arena.has(key(tile))) break;
        if (washes(tile)) return true;
        if (rocks.has(key(tile))) break;
      }
    }
  }
  return false;
}

const seen = [new Set(),new Set()];
for (let seed = 0; seed < 192; seed++) {
  let state = seed * 12289 + 1;
  const random = () => ((state = (Math.imul(state,1664525)+1013904223) >>> 0) / 2**32);
  for (const iteration of [0,1]) {
    const drops = specialDrops("roar",iteration,random,arena);
    assert.equal(new Set(drops.map(d => key(d.position))).size,drops.length);
    assert.ok(drops.every(drop => arena.has(key(drop.position))));
    const rocks = drops.filter(d => d.kind === "rock");
    seen[iteration].add(rocks.map(d => key(d.position)).join("/"));
    assert.equal(drops.filter(d => d.kind === "jug").length,7);
    assert.ok(rocks.every(d => iteration === 0 ? d.position[0] <= 25 : d.position[0] >= 29));
    for (const [acidWidth,waterRadius] of [[3,2],[5,1]]) {
      const phases = new ZebakPhases(random, () => arena, () => {});
      const pools = new Set(), spread = new Map();
      for (const drop of drops.filter(d => d.kind === "acid")) {
        pools.add(key(drop.position));
        if (drop.spread) phases.scatter(drop.position,acidWidth,spread);
      }
      for (const [k] of spread) pools.add(k);
      assert.ok(canWashShelter(drops,pools,waterRadius),`no solve for seed ${seed}, roar ${iteration}, width ${acidWidth}`);
    }
  }
}
assert.deepEqual(seen.map(set => set.size),[3,2]);
// If every allowed spatter lands, all other RNG outcomes can only leave
// more approach tiles clear. Verify the full carpet as well as sampled fights.
for (const iteration of [0,1]) for (const sample of [0,0.4,0.99]) {
  const drops = specialDrops("roar",iteration,() => sample,arena);
  const phases = new ZebakPhases(() => 0, () => arena, () => {});
  const acid = new Set(), spread = new Map();
  for (const drop of drops.filter(d => d.kind === "acid")) {
    acid.add(key(drop.position));
    if (drop.spread) phases.scatter(drop.position,5,spread);
  }
  for (const [k] of spread) acid.add(k);
  assert.ok(canWashShelter(drops,acid,1));
}
for (const sample of [0,0.99]) {
  const drops = specialDrops("waves",0,() => sample,arena);
  assert.equal(drops.filter(d => d.kind === "jug").length,5);
  assert.ok(drops.every(d => d.kind !== "rock"));
  assert.equal(new Set(drops.map(d => key(d.position))).size,drops.length);
  // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 150, 302 and 422): the waves' five jugs fall on
  // (26,32), (27,32), (30,25), (31,26) and (33,38).
  assert.deepEqual(drops.filter(d => d.kind === "jug").map(d => key(d.position)), ["26,32","27,32","30,25","31,26","33,38"]);
}
// OBS (same recording, ticks 150, 302, 363, 422, 545): rocks fly as 2172, jugs as 2173, a pool that spreads
// as 1555 and a single pool as 2194.
for (const [kind, iteration] of [["roar",0],["roar",1],["waves",0]]) for (const sample of [0,0.4,0.99]) {
  const drops = specialDrops(kind,iteration,() => sample,arena);
  for (const drop of drops) {
    const flies = drop.kind === "rock" ? 2172 : drop.kind === "jug" ? 2173 : drop.spread ? 1555 : 2194;
    assert.equal(drop.spotAnimId, flies);
  }
  assert.ok(drops.some(d => d.spotAnimId === 1555) && drops.some(d => d.spotAnimId === 2194));
}
console.log("All five roar layouts had jug solves across 768 default/Upset Stomach samples; both wave layouts placed five jugs.");
