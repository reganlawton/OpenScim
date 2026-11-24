var encounterDefinitions = [
  {kind:"zebak",variantKinds:[],slug:"zebak",registered:true},
  {kind:"zulrah",variantKinds:[],slug:"zulrah",registered:true},
  {kind:"toa_nexus",variantKinds:[],slug:"toa",registered:true},
  {kind:"doom_of_mokhaiotl",variantKinds:["doom_of_mokhaiotl_deep"],slug:"doom-of-mokhaiotl",registered:true},
  // Desert Treasure II (client/dt2/bosses.js). Vardorvis is registered
  // (client/encounters/vardorvis/, his awakened variant with it); the
  // other three fights do not exist yet.
  {kind:"vardorvis",variantKinds:["vardorvis_awakened"],slug:"vardorvis",registered:true},
  {kind:"duke_sucellus",variantKinds:["duke_sucellus_awakened"],slug:"duke-sucellus",registered:false},
  {kind:"whisperer",variantKinds:["whisperer_awakened"],slug:"whisperer",registered:false},
  {kind:"leviathan",variantKinds:["leviathan_awakened"],slug:"leviathan",registered:false},
  {
    kind: "yama_p3",
    variantKinds: [
      "yama_p3_divine",
      "yama_p3_forfeit_breath",
      "yama_p3_sensory",
      "yama_p3_bloodied",
      "yama_p3_glyphic",
    ],
    slug: "yama",
    registered: true,
  },
  {
    kind: "lobby",
    variantKinds: [],
    slug: null,
    registered: true,
  },
  {
    kind: "sol_heredit",
    variantKinds: [],
    slug: "sol-heredit",
    registered: true,
  },
  {
    kind: "colosseum",
    variantKinds: [],
    slug: "colosseum",
    registered: true,
  },
  {
    kind: "inferno",
    variantKinds: [],
    slug: "inferno",
    registered: true,
    retiredKinds: [
      {
        kind: "zuk",
        slug: "zuk",
      },
    ],
  },
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
encounterDefinitions.filter((encounterDefinition) => encounterDefinition.registered).flatMap((encounterDefinition) => [encounterDefinition.kind, ...encounterDefinition.variantKinds]);
export {
  encounterDefinitions,
  retiredEncounterKindEntries,
  resolveRetiredEncounterKind,
  consolidateRetiredEncounterKinds,
  resolveBaseEncounterKind,
  isEncounterKind,
};
