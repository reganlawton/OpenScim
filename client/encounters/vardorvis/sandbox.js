// Vardorvis in the sandbox (client/encounters/sandbox/): his catalog entry,
// in the format sandbox/catalog.js describes. His own fight never reads
// this file.
import { ids, seqs } from "./encounter.js";

export const vardorvisSandboxEntries = [
  {
    id: "vardorvis", name: "Vardorvis", group: "Bosses", npcTypeId: ids.boss, size: 2, attackSpeed: 5, // WIKI
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 35 }], // inferred: TABLE gives him strength 0
    // encounter.js: he heals half, rounded down, of what his hits deal (WIKI).
    healsFromDamage: 0.5,
    idleSeqId: seqs.idle, walkSeqId: seqs.walk, deathSeqId: seqs.death, clips: { attack: seqs.melee },
  },
];
