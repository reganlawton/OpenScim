// Positions are local tiles in map square (61,84), as recorded from the game.
const firstRoars = [
  {
    rocks: [[24,29], [25,30]],
    jugs: [[25,27], [27,26], [35,26], [35,31], [36,33], [34,37], [33,38]],
    spread: [[25,28], [25,33], [25,36], [27,29], [27,32], [27,35]],
    singles: [[25,26], [26,38], [30,36], [33,25], [32,34], [34,29], [34,32]],
  },
  {
    rocks: [[24,29], [24,34], [25,35]],
    jugs: [[25,27], [27,26], [32,30], [35,26], [35,31], [36,33], [34,38]],
    spread: [[25,29], [25,33], [26,36], [27,29], [27,35], [28,36]],
    singles: [[30,25], [32,26], [32,33], [31,38], [34,30], [33,38], [35,34]],
  },
  {
    rocks: [[24,32], [24,33]],
    jugs: [[25,27], [27,26], [32,30], [35,26], [35,31], [36,33], [34,38]],
    spread: [[25,32], [25,33], [26,31], [26,34], [27,33]],
    singles: [[29,26], [32,33], [33,36], [35,39], [36,32], [33,24]],
  },
];
const secondRoars = [
  {
    rocks: [[30,32], [30,34], [29,35]],
    jugs: [[27,31], [27,36], [28,38], [31,25], [33,26], [32,38], [36,33]],
    spread: [[30,28], [29,29], [30,31], [32,33], [31,36], [32,28], [32,35]],
    singles: [[25,27], [24,37], [25,38], [27,27], [31,39], [34,31], [35,31]],
  },
  {
    rocks: [[29,35], [29,33], [30,31]],
    jugs: [[27,31], [27,36], [28,38], [31,25], [33,26], [32,38], [36,33]],
    spread: [[30,34], [30,32], [31,30], [31,36], [32,33], [32,29]],
    singles: [[25,27], [24,37], [25,38], [27,27], [34,31], [31,39], [35,31]],
  },
];
const waveJugs = [[26,32], [27,32], [30,25], [31,26], [33,38]];
const waveSpreads = [
  [[25,28], [28,30], [27,38], [29,35], [31,32], [33,29], [34,35]],
  [[25,28], [28,29], [28,37], [31,32], [33,28], [34,35], [35,26]],
];
const waveSingles = [[25,41], [30,37], [32,26], [33,24], [35,29], [36,37]];

export function specialDrops(kind, iteration, random, walkable) {
  const choose = patterns => patterns[Math.floor(random() * patterns.length)];
  const layout = kind === "roar"
    ? choose(iteration === 0 ? firstRoars : secondRoars)
    : {rocks: [], jugs: waveJugs, spread: choose(waveSpreads), singles: waveSingles};
  const drops = [];
  const add = (kind, positions, spotAnimId, spread = false) => {
    for (const position of positions) {
      if (!walkable?.has(position.join(","))) continue;
      drops.push({kind, position: [...position], spotAnimId, spread});
    }
  };
  add("rock", layout.rocks, 2172);
  add("jug", layout.jugs, 2173);
  // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 150, 302, 363, 422, 545): a pool that spreads flies as 1555, a single pool as 2194.
  add("acid", layout.spread, 1555, true);
  add("acid", layout.singles, 2194);
  return drops;
}
