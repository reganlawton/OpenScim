// What tools/sandbox-catalog.mjs does, as a function a test can call with
// encounters of its own: from the presentations' render configs, the NPCs
// that belong in the sandbox's catalog and are not there yet.
//
// discoverSandboxNpcs({ presentations, curatedIds, exclusions, monsterOf, nameOf, groupOf, skipKinds })
//   presentations  [{ kind, renderConfig: { preloadNpcTypes } }]
//   curatedIds     the NPC type ids the curated catalog holds
//   exclusions     { npcTypeId: reason }
//   monsterOf(id)  the monster table's entry (client/data/monsters.js)
//   nameOf(id), groupOf(kind)   for the editor's list
//   skipKinds(kind)             true for presentations not to read
// Returns { entries, report }: the catalog entries to add, and one line per
// NPC type found saying where it went.

/** The style a monster's levels and bonuses favour (inferred). */
export function styleOfMonster(monster) {
  const levels = monster.levels ?? {};
  const offensive = monster.offensive ?? {};
  const scores = {
    melee: (levels.attack ?? 0) + (levels.strength ?? 0) + (offensive.attack ?? 0) + (offensive.strength ?? 0),
    range: (levels.ranged ?? 0) * 2 + (offensive.ranged ?? 0) + (offensive.rangedStrength ?? 0),
    magic: (levels.magic ?? 0) * 2 + (offensive.magic ?? 0) + (offensive.magicDamage ?? 0),
  };
  return Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];
}

export function discoverSandboxNpcs({ presentations, curatedIds, exclusions, monsterOf, nameOf, groupOf, skipKinds = () => false }) {
  const found = new Map();
  for (const presentation of presentations) {
    if (skipKinds(presentation.kind)) continue;
    for (const npcType of presentation.renderConfig?.preloadNpcTypes ?? []) {
      if (!found.has(npcType.npcTypeId)) found.set(npcType.npcTypeId, { kind: presentation.kind, npcType });
    }
  }
  const entries = [];
  const report = [];
  for (const [npcTypeId, { kind, npcType }] of [...found].sort(([a], [b]) => a - b)) {
    const monster = monsterOf(npcTypeId);
    const clips = Object.keys(npcType.attackClips ?? {});
    let fate;
    if (curatedIds.has(npcTypeId)) fate = "curated";
    else if (exclusions[npcTypeId]) fate = "excluded: " + exclusions[npcTypeId];
    else if (!monster?.levels?.hitpoints) fate = "skipped: no stats in the monster table";
    else if (clips.length === 0) fate = "skipped: no attack clip in its render config";
    else {
      fate = "discovered";
      const style = styleOfMonster(monster);
      entries.push({
        id: `auto.${kind}.${npcTypeId}`,
        name: nameOf(npcTypeId) ?? `NPC ${npcTypeId}`,
        group: groupOf(kind) ?? kind,
        npcTypeId,
        size: monster.size ?? 1,
        attackSpeed: monster.attackSpeed ?? 4,
        attacks: [{ style, range: style === "melee" ? 1 : 10, clip: clips.includes("attack") ? "attack" : clips[0] }],
        ...(npcType.idleSeqId === undefined ? {} : { idleSeqId: npcType.idleSeqId }),
        ...(npcType.walkSeqId === undefined ? {} : { walkSeqId: npcType.walkSeqId }),
        ...(npcType.deathSeqId === undefined ? {} : { deathSeqId: npcType.deathSeqId }),
        clips: npcType.attackClips,
        source: kind,
      });
    }
    report.push(`${String(npcTypeId).padStart(6)}  ${kind.padEnd(26)} ${(nameOf(npcTypeId) ?? "?").padEnd(28)} ${fate}`);
  }
  return { entries, report };
}
