// The Inferno: what the registry has of it (encounters/registry.js says what
// a definition holds). "zuk" was a kind of its own once: it is the Inferno
// started at wave 69.
import { infernoMapSquare, infernoMapSquareOffsets, infernoExcludedStaticLocIds, infernoPlayerStart } from "./constants.js";
import { infernoStartWaveKey, getInfernoSetup, buildInfernoControls } from "./controls.js";
import { InfernoEncounter } from "./InfernoEncounter.js";
import { infernoPillarDynamicLocs } from "./pillars.js";

export const definition = {
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
};
// Last of those that have a place: a new fight stands before the Inferno unless it says otherwise.
export const order = 100;
