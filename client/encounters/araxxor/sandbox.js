// Araxxor's Acidic Araxyte in the sandbox (client/encounters/sandbox/): its
// catalog entry, in the format sandbox/catalog.js describes. Why Araxxor and
// his other araxytes are not in it: sandboxCatalogExclusions there. His own
// fight never reads this file.
import { ids, seqs } from "./encounter.js";

export const araxxorSandboxEntries = [
  {
    id: "araxxor.acidic", name: "Acidic Araxyte", group: "Araxxor", npcTypeId: ids.araxytes.acidic, size: 2, attackSpeed: 6, // TABLE
    attacks: [{ style: "range", range: 8, clip: "attack" }], // OBS: it walks up to 8 tiles; inferred: the hit's delay and strength, the table's
    idleSeqId: seqs.araxyteIdle, walkSeqId: seqs.araxyteWalk, deathSeqId: seqs.explode, clips: { attack: seqs.acidicAttack },
  },
];
