// The four bosses of Desert Treasure II, the Forgotten Four. A boss has a
// fight when the registry has a definition of his kind
// (client/encounters/registry.js). The engine knows every kind either way
// (client/engine/encounterKinds.js reads this list for those without one),
// and the setup window shows a kind with no registered encounter, the
// awakened ones among them, as "Coming Soon".
//
// `element` is the ancient element of the quartz the boss drops. `colour` is
// its hue, saturation and lightness, each 0 to 255, as the renderer's colour
// packer takes them.
export const bosses = [
  { kind: "vardorvis", name: "Vardorvis", place: "The Stranglewood", element: "blood", colour: [0, 224, 96] },
  { kind: "duke_sucellus", name: "Duke Sucellus", place: "Ghorrock Prison", element: "ice", colour: [140, 208, 176] },
  { kind: "whisperer", name: "The Whisperer", place: "Lassar Undercity", element: "shadow", colour: [192, 192, 104] },
  { kind: "leviathan", name: "The Leviathan", place: "The Scar", element: "smoke", colour: [30, 40, 168] },
];

// Each boss has an awakened variant: a variant kind of the boss's kind, as
// Yama's contracts are variant kinds of "yama_p3".
export const awakenedKind = (kind) => kind + "_awakened";
// The pale violet of an awakened fight.
export const awakenedColour = [196, 144, 192];
