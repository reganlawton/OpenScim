// Sol Heredit: what the registry has of him (encounters/registry.js says what
// a definition holds).
import { solBoundaryLocs } from "./boundaryLocs.js";
import { solPlayerStart, solMapSquare } from "./constants.js";
import { buildSolHereditControls } from "./controls.js";
import { solHereditModifiers, solHereditSetupNotes, solHereditOptionsSchema } from "./modifiers.js";
import { SolHereditEncounter } from "./SolHereditEncounter.js";

export const definition = {
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
};
export const order = 50;
