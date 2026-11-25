// An entry of the What's New window. Every file of this directory is one
// (assets/application.js finds them), so announcing something is a new file
// here and no edit to a list. The file's name is the entry's `id`: its date
// and a word or two. `category` is one of Encounters, Combat, Training,
// Plugins, Interface. The window shows the newest date first; among the
// entries of one date, those of this directory by id, above the older ones
// that are still listed in application.js.
export default {
  date: "2026-11-24",
  id: "2026-11-24-colosseum",
  category: "Encounters",
  title: "Fortis Colosseum",
  impact:
    "All Colosseum waves are in, with modifiers, a waves overlay, a line-of-sight simulator and an in-game Colosseum helper plugin.",
};
