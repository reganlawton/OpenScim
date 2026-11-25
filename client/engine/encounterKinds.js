// The table of encounter kinds: for each kind its variant kinds, the slug of
// its route and the names it once went by. It is not written here: it is read
// off the registered definitions (encounters/registry.js), so an encounter is
// in it as soon as it has a definition, and in the order of that list.
//
//   kind           the definition's kind
//   variantKinds   the keys of its variantFactories; for a boss of Desert
//                  Treasure II also his awakened variant, written or not
//   slug           the address of its route ("/sol-heredit/"): the kind with
//                  "-" for "_", unless the definition has a `slug` of its own
//                  (`null` for a kind without a route: the lobby)
//   registered     true: it has an encounter. Only such a kind gets a route
//   retiredKinds   the keys of its retiredEntries, each with the slug of its
//                  old route; absent when there are none
//
// After them, the fights that are announced and not built: the bosses of
// Desert Treasure II without a definition (dt2/bosses.js), each with its
// awakened variant and `registered: false`. A boss's entry here gives way to
// his definition's when his fight is added.
import { registeredEncounterDefinitions, getDefinitionKinds } from "../encounters/registry.js";
import { bosses, awakenedKind } from "../dt2/bosses.js";
var slugOfKind = (kind) => kind.replace(/_/g, "-");
// A boss may get his fight before his awakened one: that stays an announced kind, without an encounter of its own.
var awakenedKindsOf = (kind) => (bosses.some((boss) => boss.kind === kind) ? [awakenedKind(kind)] : []);
var encounterDefinitions = [
  ...registeredEncounterDefinitions.map((definition) => {
    const retiredKinds = Object.keys(definition.retiredEntries ?? {}).map((kind) => ({ kind, slug: slugOfKind(kind) }));
    return {
      kind: definition.kind,
      variantKinds: [...new Set([...getDefinitionKinds(definition).slice(1), ...awakenedKindsOf(definition.kind)])],
      slug: definition.slug === undefined ? slugOfKind(definition.kind) : definition.slug,
      registered: true,
      ...(retiredKinds.length > 0 ? { retiredKinds } : {}),
    };
  }),
  ...bosses
    .filter((boss) => !registeredEncounterDefinitions.some((definition) => definition.kind === boss.kind))
    .map((boss) => ({ kind: boss.kind, variantKinds: [awakenedKind(boss.kind)], slug: slugOfKind(boss.kind), registered: false })),
];
var encounterDefinitionByKind = new Map(
  encounterDefinitions.flatMap((encounterDefinition) => [encounterDefinition.kind, ...encounterDefinition.variantKinds].map((kind) => [kind, encounterDefinition])),
);
var encounterKindByRetiredKind = new Map(
  encounterDefinitions.flatMap((encounterDefinition) => (encounterDefinition.retiredKinds ?? []).map((retired) => [retired.kind, encounterDefinition.kind])),
);
var retiredEncounterKindEntries = encounterDefinitions.flatMap((encounterDefinition) =>
  (encounterDefinition.retiredKinds ?? []).map((retired) => ({
    retired: retired,
    kind: encounterDefinition.kind,
  })),
);
function resolveRetiredEncounterKind(encounterKind) {
  return encounterKindByRetiredKind.get(encounterKind) ?? encounterKind;
}
function consolidateRetiredEncounterKinds(valuesByEncounterKind, mergeValues) {
  const mergedByEncounterKind = {
    ...valuesByEncounterKind,
  };
  let consolidated = false;
  for (const { retired: retired, kind: kind } of retiredEncounterKindEntries) {
    const retiredValue = mergedByEncounterKind[retired.kind];
    if (undefined !== retiredValue) {
      mergedByEncounterKind[kind] = mergeValues(mergedByEncounterKind[kind], retiredValue);
      delete mergedByEncounterKind[retired.kind];
      consolidated = true;
    }
  }
  return {
    map: mergedByEncounterKind,
    consolidated: consolidated,
  };
}
function resolveBaseEncounterKind(encounterKind) {
  const currentKind = resolveRetiredEncounterKind(encounterKind);
  return encounterDefinitionByKind.get(currentKind)?.kind ?? currentKind;
}
function isEncounterKind(candidateKind) {
  return "string" == typeof candidateKind && encounterDefinitionByKind.has(candidateKind);
}
export {
  encounterDefinitions,
  retiredEncounterKindEntries,
  resolveRetiredEncounterKind,
  consolidateRetiredEncounterKinds,
  resolveBaseEncounterKind,
  isEncounterKind,
};
