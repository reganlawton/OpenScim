// What the menus offer for the waves of the Colosseum: the wave a run starts
// on, and whether Minimus offers a modifier before each wave. (The modifiers
// a run starts with are the descriptor's, ColosseumEncounter.js.)
import { firstWave, lastWave, colosseumMonsters } from "./constants.js";
import { canSpawnWave } from "./waves.js";

export const colosseumStartWaveKey = "colosseumStartWave";
export const colosseumModifierChoiceKey = "colosseumModifierChoice";
// The practice switches of the south spawns A and B (waves.js). The labels
// are the colloquial names of WIKI's table of enemies: Shaman, Ranger,
// Manti, Shocker ("Mager" is both the shaman's and the shocker's).
export const colosseumSouthKeys = { a: "colosseumSouthA", b: "colosseumSouthB" };
const southChoices = [
  { value: "random", label: "Random" },
  { value: "any", label: "Any monster" },
  { value: "shaman", label: "Shaman (serpent shaman)" },
  { value: "javelin", label: "Ranger (javelin colossus)" },
  { value: "manticore", label: "Manti (manticore)" },
  { value: "shockwave", label: "Shocker (shockwave colossus)" },
];
/** What the mechanics ask to stand on the south spawn `slot` ("a" or "b"): a value of southChoices, "random" for anything else. */
export function getSouthSpawnSetting(mechanics, slot) {
  const value = mechanics?.[colosseumSouthKeys[slot]];
  return southChoices.some((choice) => choice.value === value) ? value : "random";
}
// The practice of a wave (ColosseumEncounter.planPracticeRestart): the same
// wave again with the same spawns, or with new ones.
export const retryWaveCommandType = "retry-wave";
export const rerollWaveCommandType = "reroll-wave";
// The waves a run can start on: those whose monsters are all in
// colosseumMonsters.
const startWaves = Array.from({ length: lastWave - firstWave + 1 }, (unusedElement, index) => firstWave + index).filter((wave) =>
  canSpawnWave(wave, Object.keys(colosseumMonsters)),
);

// The switches of what two RuneLite plugins show, rebuilt for the waves
// (overlays.js says which and how): mechanics of the group "aid", which the
// game panel lists under its assists and keeps from run to run. `default` is
// the plugin's own default, but for the splits and the LoS links, which the
// plugins keep in a side panel that the application does not have.
export const overlayKeys = {
  waves: "colosseumWavesOverlay",
  modifiers: "colosseumModifiersOverlay",
  modifierNames: "colosseumModifierNames",
  volatilityReminder: "colosseumVolatilityReminder",
  splits: "colosseumSplitsOverlay",
  losLinks: "colosseumLosLinks",
  solarflareTrueTile: "colosseumSolarflareTrueTile",
};
const overlayToggles = [
  {
    key: overlayKeys.waves,
    label: "Waves Overlay",
    default: "both",
    choices: [
      { value: "off", label: "Off" },
      { value: "current", label: "Current" },
      { value: "next", label: "Next" },
      { value: "both", label: "Both" },
    ],
    info: "The monsters of the current and of the next wave, top left. (RuneLite plugin Fortis Colosseum.)",
  },
  { key: overlayKeys.modifiers, label: "Modifiers Overlay", default: true, info: "The active modifiers with their levels. (Fortis Colosseum.)" },
  { key: overlayKeys.modifierNames, label: "Modifier Names on Selector", default: true, info: "Each offered modifier's name under its picture in Minimus's interface. (Fortis Colosseum.)" },
  { key: overlayKeys.volatilityReminder, label: "Volatility Reminder", default: false, info: "Marks for 5 ticks where a monster died, while Volatility is active. (Fortis Colosseum.)" },
  { key: overlayKeys.splits, label: "Splits Overlay", default: false, info: "The duration of each completed wave and the total. (Fortis Colosseum.)" },
  { key: overlayKeys.losLinks, label: "LoS Links", default: false, info: "Links that open los.colosim.com with the wave's spawns, its reinforcements or the current positions. (Fortis Colosseum.)" },
  // Not the plugin's: the orb's model glides from tile to tile, so where it
  // is drawn is not where it hits (RuneLite's True Tile does the same for the
  // player).
  { key: overlayKeys.solarflareTrueTile, label: "Solarflare True Tile", default: false, info: "Marks the tile the Solarflare orb is really on. Its model glides between tiles, and it hits from this tile." },
].map((toggle) => ({ ...toggle, group: "aid" }));

/**
 * What a toggle of the overlays is set to in `mechanics`. A set of mechanics
 * that was saved before a toggle existed does not have it: then its default.
 */
export function getOverlaySetting(mechanics, key) {
  return mechanics?.[key] ?? overlayToggles.find((toggle) => toggle.key === key).default;
}

/** The wave the mechanics ask for; the first one when they name none that can be started on. */
export function getColosseumStartWave(mechanics) {
  const wave = Number(mechanics[colosseumStartWaveKey]);
  return startWaves.includes(wave) ? wave : startWaves[0];
}

export function buildColosseumControls() {
  return {
    defaultMechanicsConfig: {
      infiniteHealth: false,
      // A choice's value is a string, as the Inferno's start wave is.
      [colosseumStartWaveKey]: String(startWaves[0]),
      [colosseumModifierChoiceKey]: true,
      [colosseumSouthKeys.a]: "random",
      [colosseumSouthKeys.b]: "random",
      ...Object.fromEntries(overlayToggles.map((toggle) => [toggle.key, toggle.default])),
    },
    mechanicsToggles: [
      {
        key: colosseumStartWaveKey,
        label: "Start Wave",
        setup: true,
        choices: startWaves.map((wave) => ({ value: String(wave), label: String(wave) })),
        info: "The wave the run starts on. Applies from your next attempt.",
      },
      {
        key: colosseumModifierChoiceKey,
        label: "Minimus offers modifiers",
        setup: true,
        info: "As in the game: click Minimus to start, and choose one of three modifiers before every wave. Switched off, the waves follow each other by themselves with the modifiers of the set-up. Applies from your next attempt.",
      },
      {
        key: colosseumSouthKeys.a,
        label: "South spawn A (near)",
        setup: true,
        choices: southChoices,
        info: "Practice: what spawns on the near south spawn, the one the south A tile of Colosseum Tiles stands in. With B set too it is a double south, such as a Shaman or a Shocker (both called mager) in front on A with a Ranger behind on B, or a Manti on A or B with a Ranger or a mager. A monster the wave does not have is left to chance. Applies from your next attempt; Retry Wave and Random Spawns keep it.",
      },
      {
        key: colosseumSouthKeys.b,
        label: "South spawn B (far)",
        setup: true,
        choices: southChoices,
        info: "Practice: what spawns on the far south spawn, the one the south B tile of Colosseum Tiles stands in. Applies from your next attempt.",
      },
      ...overlayToggles.map(({ default: unusedDefault, ...toggle }) => toggle),
    ],
    // As the Inferno's: the wave being fought, again from where the player
    // stood as its monsters were placed, with its spawns or with new ones.
    debugActions: [
      { command: { encounter: "colosseum", type: retryWaveCommandType }, label: "Retry Wave" },
      { command: { encounter: "colosseum", type: rerollWaveCommandType }, label: "Random Spawns" },
    ],
  };
}
