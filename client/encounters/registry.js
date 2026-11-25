import { buildSandboxDefinition } from "./sandbox/encounter.js";
// The encounters the client can run, and the registry the engine asks for
// the encounter of a kind (engine/createSimulationEngine.js calls
// encounterRegistry.create). This module imports no chunk.
//
// One definition per encounter. Its keys:
//   kind               the name the encounter goes by ("yama_p3", "inferno")
//   slug               optional: the address of its route, when that is not
//                      the kind with "-" for "_" ("yama" for "yama_p3");
//                      `null` for an encounter without a route (the lobby)
//   factory(options)   makes the encounter object; `options` is what
//                      encounterRegistry.create was given
//   descriptor         what is known of the encounter before a fight exists:
//                      display name, map square, the player's start tile,
//                      how the arena's collision is built, variants or
//                      modifiers, the victory text
//                      Three optional fields of it are the menus' own,
//                      read by assets/application.js, so that an encounter
//                      needs no entry in a table of that chunk:
//                        loadouts           { key: { name, equipment: { slot:
//                                           item id }, inventory: [item id or
//                                           null, ...], supplies? } }: the
//                                           default loadouts, the first being
//                                           the one a player starts with
//                        seo                { title, description, h1?, intro?,
//                                           keywords?, noindex? }: the route's
//                                           texts for search engines
//                        tileMarkerPresets  [{ id, name, description, link?,
//                                           defaultActive?, markers: [[x, y,
//                                           "#AARRGGBB", label?], ...] }]
//   controls           what its menus offer: defaultMechanicsConfig,
//                      mechanicsToggles, debugActions; some have more
//   enableIntro        optional; isIntroEnabledForKind answers from it
//   variantFactories,  optional: further kinds, each with a factory and
//   variantControls    controls of its own. They are registered without a
//                      descriptor (Yama's contracts)
//   variantDescriptors optional: a variant kind's own descriptor, found by
//                      getDescriptorOfKindOrVariant only (the Doom's deeper
//                      room on another map square); its kind stays the base's
//   retiredEntries     optional: names that are kinds no more, each with the
//                      mechanics it stands for (resolveKindOrRetiredEntry)
//   countdownMovement  optional; hasCountdownMovement answers from it
// A definition is written beside its encounter, in the encounter.js of its
// directory, and found here: see the list below.
//
// engine/encounterKinds.js reads its table of kinds (variant kinds, route
// slugs, retired kinds) off this list: a kind is written here and nowhere
// else. The presentations (what draws an encounter) are found the same way:
// presentations.js beside this module has those that are written in
// modules, the chunk rendering.js its own four.
//
// The engine reads no descriptor. The application does, in the hook that
// prepares an encounter (assets/application.js; prepareArena in
// tools/determinism/harness.mjs does the same): unless `collision.mode` is
// "custom", it has the cache loader build the arena of the kind from
// `mapSquare` and `mapSquareOffsets`, handing it the tile `collision.seed`
// (or `playerStart` when there is none), `collision.dynamicLocs` as extra
// locs and `collision.excludedStaticLocIds`; it registers that arena for
// the kind (registerArenaConfig of engine/arena.js) and tells the engine to
// take it (reapplyArenaConfig). Until an arena is registered for the kind,
// and always with "custom", the engine runs on the encounter's own
// getArenaConfig().
// An encounter registers itself: every ./<directory>/encounter.js beside this
// module is found here, so a new encounter edits no list. (The call below is
// Vite's glob import; tools/determinism/import-glob.mjs writes it out for
// Node.) Such a module exports
//   definition   its definition; or `definitions`, a list of them (the Tombs
//                of Amascut have two)
//   order        optional, a number: where it stands in this list, which is
//                the order of the encounter picker. Lower is earlier; without
//                one it comes after all that have one, and equal ones go by
//                the name of the directory
// The sandbox's encounter.js is found too and is no such module: it is left
// out here and its definition added last, below.
const foundModules = import.meta.glob("./*/encounter.js", { eager: true });
const encounterModules = Object.entries(foundModules);
const directoryOf = (path) => path.split("/")[1];
const orderedModules = encounterModules
  .filter(([path]) => directoryOf(path) !== "sandbox")
  .sort(([pathA, a], [pathB, b]) => (a.order ?? Infinity) - (b.order ?? Infinity) || (pathA < pathB ? -1 : 1));
// The encounters' directories in the order of the list: presentations.js puts what it finds in the same order.
var encounterDirectories = orderedModules.map(([path]) => directoryOf(path));
var registeredEncounterDefinitions = orderedModules.flatMap(([path, module]) => {
  const definitions = module.definitions ?? (module.definition ? [module.definition] : undefined);
  if (!definitions) throw new Error(`${path} exports neither \`definition\` nor \`definitions\``);
  return definitions;
});
// The sandbox runs the other encounters as the hosts of its arenas: it is
// handed their definitions.
registeredEncounterDefinitions.push(buildSandboxDefinition([...registeredEncounterDefinitions]));
function getDefinitionKinds(definition) {
  return [definition.kind, ...Object.keys(definition.variantFactories ?? {})];
}
var definitionByKind = new Map(registeredEncounterDefinitions.flatMap((definition) => getDefinitionKinds(definition).map((kind) => [kind, definition])));
function getDefinitionOfKind(kind) {
  return definitionByKind.get(kind);
}
var infiniteHealthToggle = {
  key: "infiniteHealth",
  label: "Infinite Health",
  group: "aid",
};
var infiniteSpecialAttackToggle = {
  key: "infiniteSpecialAttack",
  label: "Infinite Special Attack",
  group: "aid",
};
var controlsByKind = new Map(
  registeredEncounterDefinitions.flatMap((definition) =>
    getDefinitionKinds(definition).map((kind) => {
      const controls = definition.variantControls?.[kind] ?? definition.controls;
      return [
        kind,
        {
          ...controls,
          mechanicsToggles: [...controls.mechanicsToggles, infiniteHealthToggle, infiniteSpecialAttackToggle],
        },
      ];
    }),
  ),
);
function getEncounterControls(kind) {
  return controlsByKind.get(kind);
}
function isIntroEnabledForKind(kind) {
  return getDefinitionOfKind(kind)?.enableIntro === true;
}
function hasCountdownMovement(kind, mechanics) {
  return getDefinitionOfKind(kind)?.countdownMovement?.(mechanics) === true;
}
function resolveKindOrRetiredEntry(kind) {
  if (getDefinitionOfKind(kind)) {
    return {
      kind: kind,
      mechanics: {},
    };
  }
  for (const definition of registeredEncounterDefinitions) {
    const retiredMechanics = definition.retiredEntries?.[kind];
    if (retiredMechanics) {
      return {
        kind: definition.kind,
        mechanics: retiredMechanics,
      };
    }
  }
}
var DuplicateEncounterKindError = class extends Error {
  kind;
  constructor(kind) {
    super(`Duplicate encounter kind: '${kind}'`);
    this.kind = kind;
    this.name = "DuplicateEncounterKindError";
  }
};
var EncounterDescriptorKindMismatchError = class extends Error {
  kind;
  descriptorKind;
  constructor(kind, descriptorKind) {
    super(`Encounter '${kind}' has a mismatched descriptor kind '${descriptorKind}'`);
    this.kind = kind;
    this.descriptorKind = descriptorKind;
    this.name = "EncounterDescriptorKindMismatchError";
  }
};
// `factories` has every kind, the variant kinds among them; `descriptors`
// only the kinds registered with one. getDescriptor answers for those;
// getDescriptorOfKindOrVariant also finds, for a variant kind, the descriptor
// that lists it among its `variants`.
var variantDescriptors = new Map();
var encounterRegistry = new (class {
  factories = new Map();
  descriptors = new Map();
  register(kind, factory, descriptor) {
    if (this.factories.has(kind)) {
      throw new DuplicateEncounterKindError(kind);
    }
    if (descriptor && descriptor.kind !== kind) {
      throw new EncounterDescriptorKindMismatchError(kind, descriptor.kind);
    }
    this.factories.set(kind, factory);
    if (descriptor) {
      this.descriptors.set(kind, descriptor);
    }
  }
  create(kind, options) {
    const factory = this.factories.get(kind);
    if (!factory) {
      const registeredKinds = this.getRegisteredKinds();
      const registeredKindsText = registeredKinds.length > 0 ? registeredKinds.join(", ") : "(none)";
      throw new Error(`Unknown encounter kind: '${kind}'. Registered kinds: ${registeredKindsText}`);
    }
    return factory(options);
  }
  getRegisteredKinds() {
    return Array.from(this.factories.keys());
  }
  isRegistered(kind) {
    return this.factories.has(kind);
  }
  getDescriptor(kind) {
    return this.descriptors.get(kind);
  }
  getDescriptorOfKindOrVariant(kind) {
    const descriptor = this.descriptors.get(kind);
    if (descriptor) {
      return descriptor;
    }
    if (variantDescriptors.has(kind)) return variantDescriptors.get(kind);
    for (const descriptor of this.descriptors.values()) {
      if (descriptor.variants?.some((variant) => variant.encounterKind === kind)) {
        return descriptor;
      }
    }
  }
})();
for (const definition of registeredEncounterDefinitions) {
  encounterRegistry.register(definition.kind, definition.factory, definition.descriptor);
  for (const [variantKind, variantFactory] of Object.entries(definition.variantFactories ?? {})) {
    encounterRegistry.register(variantKind, variantFactory);
  }
}
for (const definition of registeredEncounterDefinitions) {
  for (const [variantKind, descriptor] of Object.entries(definition.variantDescriptors ?? {})) variantDescriptors.set(variantKind, descriptor);
}
export { registeredEncounterDefinitions, encounterDirectories, getDefinitionKinds, controlsByKind, getEncounterControls, isIntroEnabledForKind, hasCountdownMovement, resolveKindOrRetiredEntry, encounterRegistry };
