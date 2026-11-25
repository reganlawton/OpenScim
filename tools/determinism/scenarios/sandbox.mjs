// The sandbox (client/encounters/sandbox/): its two modes, and each example
// scenario for a few ticks, so that a change of an example, of the catalog
// or of an arena shows here.
import { attack, nearestNpc, rangedGear } from "./common.mjs";

// The player shoots the nearest NPC accepted whenever he has no target.
const shootNearest = (accept) => (tick, api) => {
  if (api.player().attackTarget) return;
  const npc = nearestNpc(api, accept);
  if (npc) attack(api, npc.id);
};
const allies = new Set(["sol", "vardorvis"]);

const versus = {
  format: "openscim-sandbox",
  version: 1,
  meta: { name: "Harness: versus" },
  arena: "yama",
  mode: "versus",
  npcs: [
    { id: "nib-1", npc: "inferno.nibbler", position: [29, 30] },
    { id: "nib-2", npc: "inferno.nibbler", position: [33, 30] },
    { id: "bat", npc: "inferno.bat", position: [31, 27], hp: 30, maxHit: 5 },
    { id: "shaman", npc: "colosseum.shaman", position: [25, 33], hp: 40, levels: { magic: 50 } },
  ],
};

// Two NPCs per host arena, on tiles of its floor away from the boss.
const hostedArenas = [
  { arena: "sol_heredit", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [28, 30] }, { id: "archer", npc: "warband.archer", position: [37, 30] }] },
  { arena: "yama", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [26, 33] }, { id: "bat", npc: "inferno.bat", position: [35, 33] }] },
  { arena: "zebak", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [27, 36] }, { id: "shaman", npc: "colosseum.shaman", position: [33, 36] }] },
  { arena: "vardorvis", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [36, 22] }, { id: "jaguar", npc: "colosseum.jaguar", position: [44, 22] }] },
  { arena: "doom", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [26, 26] }, { id: "seer", npc: "warband.seer", position: [36, 26] }] },
  { arena: "doom_deep", npcs: [{ id: "nib", npc: "inferno.nibbler", position: [26, 27] }, { id: "seer", npc: "warband.seer", position: [36, 27] }] },
];

// The sandbox's modules reach vendor.js, which Node loads only through the
// harness's module hooks: the list is made once those are in.
export async function scenarios() {
  const { sandboxExamples } = await import("../../../client/encounters/sandbox/examples.js");
  const { sandboxVariantKind } = await import("../../../client/encounters/sandbox/arenas.js");
  const { sandboxNpcCatalog } = await import("../../../client/encounters/sandbox/catalog.js");
  const example = (key) => sandboxExamples.find((entry) => entry.key === key).scenario;
  return [
    {
      // Four NPCs walk up and attack; the player shoots them one by one and the run is won.
      name: "sandbox/versus-kill",
      kind: sandboxVariantKind("yama"),
      seed: 21,
      ticks: 90,
      options: { scenario: versus },
      ...rangedGear,
      script: shootNearest(),
    },
    {
      // Two teams of bosses, the player left out: they fight until one team is left.
      name: "sandbox/ffa-spectator",
      kind: sandboxVariantKind("colosseum"),
      seed: 5,
      ticks: 2500,
      options: { scenario: example("clash-of-titans") },
    },
    {
      // Teams: Sol Heredit and Vardorvis on the player's side against three bosses; the player helps.
      name: "sandbox/ffa-allies",
      kind: sandboxVariantKind("colosseum"),
      seed: 9,
      ticks: 2500,
      mechanics: { infiniteHealth: true },
      options: { scenario: example("champions-stand") },
      ...rangedGear,
      script: shootNearest((npc) => !allies.has(npc.id)),
    },
    // Each arena's boss as the host, with two of the sandbox's NPCs beside it;
    // the player shoots whatever is nearest.
    ...hostedArenas.map(({ arena, npcs }) => ({
      name: `sandbox/host/${arena}`,
      kind: sandboxVariantKind(arena),
      seed: 17,
      ticks: 80,
      mechanics: { infiniteHealth: true },
      options: { scenario: { arena, mode: "versus", meta: { name: "Harness: host" }, options: { bossMechanics: true }, npcs } },
      ...rangedGear,
      script: shootNearest(),
    })),
    // Each monster of the catalog, curated or discovered (tools/sandbox-catalog.mjs),
    // alone against the player: a new one needs its digests recorded.
    ...sandboxNpcCatalog.map((entry) => ({
      name: `sandbox/catalog/${entry.id}`,
      kind: sandboxVariantKind("colosseum"),
      seed: 4,
      ticks: 24,
      mechanics: { infiniteHealth: true },
      options: { scenario: { arena: "colosseum", mode: "versus", meta: { name: "Harness: catalog" }, npcs: [{ id: "probe", npc: entry.id, position: [27, 35] }] } },
    })),
    // Each example loads and its NPCs set off.
    ...sandboxExamples.map(({ key, scenario }) => ({
      name: `sandbox/example/${key}`,
      kind: sandboxVariantKind(scenario.arena),
      seed: 3,
      ticks: 12,
      mechanics: { infiniteHealth: true },
      options: { scenario },
    })),
  ];
}
