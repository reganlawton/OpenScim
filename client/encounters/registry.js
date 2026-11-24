import { zebakDefinition } from "/toa/zebak/native.js";
import { nexusDefinition } from "/toa/nexus.js";
import { doomDefinition } from "./doom-of-mokhaiotl/encounter.js";
import { LobbyEncounter } from "./lobby/LobbyEncounter.js";
import {
  divineSeveranceContract,
  forfeitBreathContract,
  sensoryCloudingContract,
  bloodiedBlowsContract,
  glyphicAttenuationContract,
  yamaContractVariants,
} from "./yama/contracts.js";
import { buildYamaControls } from "./yama/controls.js";
import { YamaEncounter } from "./yama/YamaEncounter.js";
import { solPlayerStart, solMapSquare } from "./sol-heredit/constants.js";
import { buildSolHereditControls } from "./sol-heredit/controls.js";
import { solHereditModifiers, solHereditSetupNotes, solHereditOptionsSchema } from "./sol-heredit/modifiers.js";
import { SolHereditEncounter } from "./sol-heredit/SolHereditEncounter.js";
import { infernoMapSquare, infernoMapSquareOffsets, infernoExcludedStaticLocIds, infernoPlayerStart } from "./inferno/constants.js";
import { infernoPillarDynamicLocs } from "./inferno/pillars.js";
import { infernoStartWaveKey, getInfernoSetup, buildInfernoControls } from "./inferno/controls.js";
import { InfernoEncounter } from "./inferno/InfernoEncounter.js";
import { getArenaWalkableTiles } from "../engine/arena.js";
import { CollisionFlag, createCollisionMap } from "../engine/collision.js";
import { createSeededRandom } from "../engine/random.js";
import { startScriptedNpcDeath } from "../engine/npcState.js";
import { rollNpcAttack } from "./shared/npcAttack.js";
import { buildNpcProjectileVisual } from "./shared/npcHelpers.js";
import { emitInfernoVisual, emitInfernoNpcAttack } from "./inferno/events.js";
import { getMonsterFormulaStats } from "../engine/monsterStats.js";
import { solBoundaryLocs } from "./sol-heredit/boundaryLocs.js";
import { colosseumDefinition } from "./colosseum/ColosseumEncounter.js";
import { vardorvisDefinition } from "./vardorvis/encounter.js";
import { zulrahDefinition } from "./zulrah/encounter.js";
// The encounters the client can run, and the registry the engine asks for
// the encounter of a kind (engine/createSimulationEngine.js calls
// encounterRegistry.create). This module imports no chunk.
//
// One definition per encounter. Its keys:
//   kind               the name the encounter goes by ("yama_p3", "inferno")
//   factory(options)   makes the encounter object; `options` is what
//                      encounterRegistry.create was given
//   descriptor         what is known of the encounter before a fight exists:
//                      display name, map square, the player's start tile,
//                      how the arena's collision is built, variants or
//                      modifiers, the victory text
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
// The first two definitions come from client/toa/; Zebak's is built from the
// rules handed to it here.
//
// engine/encounterKinds.js lists the kinds a second time, with their variant
// kinds, route slugs and retired kinds, and four kinds that have no
// definition here. The presentations (what draws an encounter) are a third
// list: presentations.js beside this module has those that are written in
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
var registeredEncounterDefinitions = [
  zebakDefinition({makeCollision:createCollisionMap,solidFlag:CollisionFlag.OBJECT,walkable:getArenaWalkableTiles,stats:getMonsterFormulaStats, seedRandom:createSeededRandom, rollAttack:rollNpcAttack, showAttack:emitInfernoNpcAttack, projectile:buildNpcProjectileVisual, animate:emitInfernoVisual, startNpcDeath:startScriptedNpcDeath}),
  nexusDefinition,
  doomDefinition,
  {
    kind: "yama_p3",
    factory: () => new YamaEncounter(),
    enableIntro: true,
    descriptor: {
      kind: "yama_p3",
      displayName: "Yama - Phase 3",
      description: "The Yama boss encounter",
      mapSquare: {
        x: 23,
        y: 157,
      },
      playerStart: [31, 37],
      loadsMapLocs: true,
      variants: yamaContractVariants,
      variantLabel: "Contract",
      collision: {
        mode: "auto",
        seed: [32, 30],
      },
      victory: {
        eyebrow: "Triumphant",
        title: "VICTORY",
        narrative: "YAMA DEFEATED",
        accent: "blood",
      },
    },
    variantFactories: {
      yama_p3_divine: () => new YamaEncounter(divineSeveranceContract),
      yama_p3_forfeit_breath: () => new YamaEncounter(forfeitBreathContract),
      yama_p3_sensory: () => new YamaEncounter(sensoryCloudingContract),
      yama_p3_bloodied: () => new YamaEncounter(bloodiedBlowsContract),
      yama_p3_glyphic: () => new YamaEncounter(glyphicAttenuationContract),
    },
    controls: buildYamaControls(),
    variantControls: {
      yama_p3_divine: buildYamaControls(divineSeveranceContract),
      yama_p3_forfeit_breath: buildYamaControls(forfeitBreathContract),
      yama_p3_sensory: buildYamaControls(sensoryCloudingContract),
      yama_p3_bloodied: buildYamaControls(bloodiedBlowsContract),
      yama_p3_glyphic: buildYamaControls(glyphicAttenuationContract),
    },
  },
  {
    kind: "lobby",
    factory: () => new LobbyEncounter(),
    descriptor: {
      kind: "lobby",
      displayName: "Lobby",
      description: "Prifddinas lobby area",
      mapSquare: {
        x: 25,
        y: 73,
      },
      playerStart: [31, 25],
      collision: {
        mode: "custom",
      },
    },
    controls: {
      defaultMechanicsConfig: {
        infiniteHealth: false,
      },
      mechanicsToggles: [],
      debugActions: [],
    },
  },
  {
    kind: "sol_heredit",
    factory: function (options) {
      const parsedOptions = solHereditOptionsSchema.parse(options ?? {});
      return new SolHereditEncounter(undefined, parsedOptions.modifiers);
    },
    descriptor: {
      kind: "sol_heredit",
      displayName: "Sol Heredit",
      description: "The final wave of the Fortis Colosseum.",
      mapSquare: solMapSquare,
      playerStart: [...solPlayerStart],
      modifiers: solHereditModifiers,
      setupNotes: solHereditSetupNotes,
      defaultModifierSelection: {
        blasphemy: 3,
      },
      loadsMapLocs: true,
      isWorkInProgress: true,
      collision: {
        mode: "auto",
        seed: [...solPlayerStart],
        dynamicLocs: solBoundaryLocs,
      },
      victory: {
        eyebrow: "Triumphant",
        title: "VICTORY",
        narrative: "SOL HEREDIT DEFEATED",
        accent: "gold",
      },
    },
    controls: buildSolHereditControls(),
  },
  colosseumDefinition,
  vardorvisDefinition,
  {
    kind: "inferno",
    factory: function (options) {
      const optionKeys = Object.keys(options ?? {});
      if (optionKeys.length > 0) {
        throw new TypeError(
          `Encounter 'inferno' accepts no constructor options; got: ${optionKeys.join(", ")}`,
        );
      }
      return new InfernoEncounter();
    },
    enableIntro: true,
    descriptor: {
      kind: "inferno",
      displayName: "The Inferno",
      description:
        "Start from any wave. Each cleared wave leads straight into the next, through to TzKal-Zuk at wave 69.",
      mapSquare: infernoMapSquare,
      mapSquareOffsets: infernoMapSquareOffsets,
      playerStart: [...infernoPlayerStart],
      loadsMapLocs: true,
      isWorkInProgress: true,
      collision: {
        mode: "auto",
        seed: [...infernoPlayerStart],
        dynamicLocs: infernoPillarDynamicLocs,
        excludedStaticLocIds: infernoExcludedStaticLocIds,
      },
      victory: {
        eyebrow: "Triumphant",
        title: "VICTORY",
        narrative: "TZKAL-ZUK DEFEATED",
        accent: "gold",
      },
    },
    controls: buildInfernoControls(),
    retiredEntries: {
      zuk: {
        [infernoStartWaveKey]: "69",
      },
    },
    countdownMovement: (mechanics) => getInfernoSetup(mechanics).startWave !== 69,
  },
  zulrahDefinition,
];
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
export { registeredEncounterDefinitions, getDefinitionKinds, controlsByKind, getEncounterControls, isIntroEnabledForKind, hasCountdownMovement, resolveKindOrRetiredEntry, encounterRegistry };
