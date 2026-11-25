// Scenarios for the engine itself: weapons, special attacks, spells,
// consumables, prayers, inventory and movement. Most use Yama with every
// mechanic switched off as a training dummy, so that only the player acts.
import {
  attack, boss, castOn, equip, independent, item, magicGear, meleeGear, nearestNpc, offensive, protect, rangedGear, special,
  toggleRun, unequip, use,
} from "./common.mjs";

const dummy = { yamaMageRange: false, yamaMelee: false, waves: false, fireballs: false, voidFlares: false };
const rune = { fire: 554, water: 555, air: 556, earth: 557, mind: 558, body: 559, death: 560, nature: 561, chaos: 562, law: 563, cosmic: 564, blood: 565, soul: 566, wrath: 21880 };

/** Every `period` ticks from `first`: calls step(index, tick) for index 0, 1, 2, ... while index < count. */
function eachPeriod(tick, first, period, count, step) {
  const index = (tick - first) / period;
  if (Number.isInteger(index) && index >= 0 && index < count) step(index, tick);
}

/**
 * Wields the weapons in the inventory one after another, `period` ticks each:
 * attack, then a special attack, then (melee) the other attack styles.
 */
function weaponTour(period, { ammo = {} } = {}) {
  return (tick, api) => {
    if (tick === 1) attack(api, boss(api).id);
    const slots = api.player().inventory.length;
    eachPeriod(tick, 2, period, slots, (index) => {
      const held = api.player().inventory[index];
      if (!held || ammo[held.id] === null) return;
      equip(api, index, "weapon");
      attack(api, boss(api).id);
    });
    // Ammunition for the weapon that was just wielded sits in a known slot.
    eachPeriod(tick, 3, period, slots, () => {
      const need = ammo[api.player().equipment.weapon];
      if (need === undefined) return;
      const slot = api.player().inventory.findIndex((entry) => entry?.id === need);
      if (slot >= 0) api.act({ type: "equipAmmoFromInventory", inventoryIndex: slot, itemId: need });
    });
    // The attack was refused while the wrong ammunition was in; order it again.
    eachPeriod(tick, 4, period, slots, () => attack(api, boss(api).id));
    eachPeriod(tick, 2 + Math.floor(period / 2), period, slots, () => special(api));
    eachPeriod(tick, period, period, slots, (index) => api.act({ type: "attackStyleChange", index: index % 4 }));
  };
}

const meleeWeapons = [
  27690 /* Voidwaker */, 13652 /* Dragon claws */, 29577 /* Burning claws */, 11802 /* Armadyl godsword */,
  11804 /* Bandos godsword */, 11806 /* Saradomin godsword */, 11808 /* Zamorak godsword */, 4151 /* Abyssal whip */,
  12006 /* Abyssal tentacle */, 5698 /* Dragon dagger */, 13271 /* Abyssal dagger */, 13576 /* Dragon warhammer */,
  21003 /* Elder maul */, 22325 /* Scythe of Vitur */, 28338 /* Soulreaper axe */, 28997 /* Dual macuahuitl */,
  4587 /* Dragon scimitar */, 23987 /* Crystal halberd */, 29796 /* Noxious halberd */, 4153 /* Granite maul */,
  11838 /* Saradomin sword */, 27287 /* Keris partisan of corruption */, 25981 /* Keris partisan of breaching */,
  27291 /* Keris partisan of the sun */, 26219 /* Osmumten's fang */,
];

const rangedWeapons = [
  12926 /* Toxic blowpipe */, 26374 /* Zaryte crossbow */, 21944 /* Ruby dragon bolts (e) */, 11785 /* Armadyl crossbow */,
  21946 /* Diamond dragon bolts (e) */, 11235 /* Dark bow */, 11212 /* Dragon arrow */, 12788 /* Magic shortbow (i) */,
  19481 /* Heavy ballista */, 19484 /* Dragon javelin */, 25865 /* Bow of Faerdhinen */, 27610 /* Venator bow */,
  11959 /* Black chinchompa */, 27655 /* Webweaver bow */, 22804 /* Dragon knife */, 29000 /* Eclipse atlatl */,
  28991 /* Atlatl dart */, 28922 /* Tonalztics of Ralos */, 20997 /* Twisted bow */,
];
const rangedAmmo = {
  26374: 21944, 11785: 21946, 11235: 11212, 12788: 11212, 19481: 19484, 27610: 11212, 29000: 28991, 20997: 11212,
  // ammunition itself is not wielded as a weapon
  21944: null, 21946: null, 11212: null, 19484: null, 28991: null,
};

const magicWeapons = [
  22323 /* Sanguinesti staff */, 11907 /* Trident of the seas */, 12899 /* Trident of the swamp */, 27665 /* Accursed sceptre */,
  24424 /* Volatile nightmare staff */, 24425 /* Eldritch nightmare staff */, 24423 /* Harmonised nightmare staff */,
  31113 /* Eye of Ayak */, 30634 /* Twinflame staff */, 11998 /* Smoke battlestaff */, 21006 /* Kodai wand */, 27275 /* Tumeken's shadow */,
];

const spells = {
  standard: [
    "Wind Strike", "Fire Bolt", "Crumble Undead", "Water Blast", "Iban Blast", "Magic Dart", "Saradomin Strike", "Claws of Guthix",
    "Flames of Zamorak", "Earth Wave", "Wind Surge", "Water Surge", "Earth Surge", "Fire Surge",
  ],
  ancient: [
    "Smoke Rush", "Shadow Rush", "Blood Rush", "Ice Rush", "Smoke Burst", "Shadow Burst", "Blood Burst", "Ice Burst",
    "Smoke Blitz", "Shadow Blitz", "Blood Blitz", "Ice Blitz", "Smoke Barrage", "Shadow Barrage", "Blood Barrage", "Ice Barrage",
  ],
  arceuus: ["Ghostly Grasp", "Inferior Demonbane", "Skeletal Grasp", "Superior Demonbane", "Undead Grasp", "Dark Demonbane"],
};
const allRunes = Object.values(rune);

/** Casts each spell of a book on the boss by hand, six ticks apart, then leaves the last one on autocast. */
function spellTour(book) {
  return (tick, api) => {
    eachPeriod(tick, 1, 6, spells[book].length, (index) => castOn(api, boss(api).id, spells[book][index]));
    if (tick === 6 * spells[book].length + 2) {
      api.act({ type: "selectedSpellChange", spellName: spells[book].at(-1) });
      attack(api, boss(api).id);
    }
    if (book === "arceuus" && tick === 40) api.act({ type: "castMarkOfDarkness" });
    if (book === "arceuus" && tick === 44) api.act({ type: "castDeathCharge" });
    if (book === "arceuus" && tick === 50) api.act({ type: "castDeathCharge" }); // still on cooldown
  };
}

/** Stages of engine/gear-effects: the pieces put on at each stage, as [item id, equipment slot]. */
const gearStages = [
  [[8839, "body"], [8840, "legs"], [8842, "hands"], [11665, "head"], [29589, "weapon"]], // void melee, Emberlight
  [[11664, "head"], [29591, "weapon"]], // void ranger, Scorching bow
  [[11663, "head"], [29594, "weapon"]], // void mage, Purging staff
  [[13072, "body"], [13073, "legs"], [19675, "weapon"]], // elite void, Arclight
  [[24419, "head"], [24420, "body"], [24421, "legs"], [24417, "weapon"]], // Inquisitor's armour and mace
  [[23971, "head"], [23975, "body"], [23979, "legs"], [25865, "weapon"]], // crystal armour, Bow of Faerdhinen
  [[4716, "head"], [4720, "body"], [4722, "legs"], [4718, "weapon"]], // Dharok's set at low hitpoints
  [[12018, "amulet"]], // Salve amulet (ei)
  [[11865, "head"]], // Slayer helmet (i)
  [[22978, "weapon"]], // Dragon hunter lance
  [[21012, "weapon"]], // Dragon hunter crossbow
];

const consumables = [
  7510 /* Dwarven rock cake */, 385 /* Shark: the engine has no entry for it, nothing happens */, 3144 /* Cooked karambwan */, 13441 /* Anglerfish */, 29143 /* Cooked moonlight antelope */,
  6685 /* Saradomin brew(4) */, 3024 /* Super restore(4) */, 2434 /* Prayer potion(4) */, 2444 /* Ranging potion(4) */,
  12695 /* Super combat potion(4) */, 23685 /* Divine super combat potion(4) */, 23733 /* Divine ranging potion(4) */,
  22461 /* Bastion potion(4) */, 27629 /* Forgotten brew(4) */, 27641 /* Saturated heart */, 12625 /* Stamina potion(4) */,
  31638 /* Extended stamina potion(4) */, 31614 /* Extreme energy potion(4) */, 4417 /* Guthix rest(4) */, 5952 /* Antidote++(4) */,
  10925 /* Sanfew serum(4) */, 29183 /* Snowy knight mix (2) */, 30125 /* Prayer regeneration potion(4) */, 30875 /* Surge potion(4) */,
  31650 /* Armadyl brew(4) */, 22081 /* Locator orb */, 12701 /* Super combat potion(1) */, 229 /* Vial */,
];

/** Weapons of engine/special-attack-effects: their special attacks leave an effect on the target. */
const effectWeapons = [
  11804 /* Bandos godsword */, 13576 /* Dragon warhammer */, 29589 /* Emberlight */, 12006 /* Abyssal tentacle */, 29577 /* Burning claws */,
  29591 /* Scorching bow */,
];

/** Weapons of engine/slayer-helmet-profiles: one for each kind of attack profile, two with a special of their own, the atlatl and its darts. */
const helmetWeapons = [
  22325 /* Scythe of Vitur */, 28997 /* Dual macuahuitl */, 13652 /* Dragon claws */, 27690 /* Voidwaker */, 20997 /* Twisted bow */,
  29591 /* Scorching bow */, 25865 /* Bow of Faerdhinen */, 13263 /* Abyssal bludgeon */, 29594 /* Purging staff */, 29000 /* Eclipse atlatl */,
  28991 /* Atlatl dart */,
];

/**
 * Kinds of engine/encounterKinds.js that had an encounter when this list was written; the scenario below shows their
 * entries and no others. None that is waiting for its fight: its entry changes when the fight is added, and that
 * must not change a digest of the engine's.
 */
const kindsOfTheTable = ["zebak", "toa_nexus", "vardorvis", "yama_p3", "lobby", "sol_heredit", "inferno"];
/** The functions of the engine chunk that the interface calls directly, on fixed arguments. */
function exportedHelpers(engine, objTypeLoader) {
  const pouch = { kind: "divine", slots: [{ id: rune.fire }, null, { id: rune.blood }, { id: 4699 /* Lava rune */ }] };
  const supplies = engine.parseCombatSupplies({
    equippedAmmo: { id: item.dragonArrow }, quiverAmmo: { id: 0 }, runePouch: pouch, blowpipe: { ammo: { id: item.dragonDart } },
    selectedSpell: "Ice Barrage", spellbook: "ancient",
  });
  const caster = { equipment: { weapon: item.kodaiWand, shield: 20714 }, inventory: [{ id: rune.death }, { id: rune.blood }, null], runePouch: pouch, magicLevel: 80 };
  const prayers = { protection: "ProtectMagic", offensive: null, independent: ["Preserve"], quickPrayersActive: false };
  const bootstrap = {
    bootstrap: {
      version: 14, startPosition: [30, 37], baseStats: { attack: { current: 99, max: 99 } }, enableIntro: false, mechanicsConfig: {},
      inventory: [], equipment: {}, combatSupplies: {}, attackStylePerCategory: {}, prepotApplied: false, combatSeed: 5,
    },
  };
  return {
    supplies,
    parsedGarbage: [engine.parseCombatSupplies(null), engine.parseCombatSupplies({ runePouch: { kind: "odd", slots: [] }, spellbook: "none", selectedSpell: "Fire Surge" })],
    clone: engine.cloneCombatSupplies(supplies),
    equal: [
      engine.areCombatSuppliesEqual(supplies, engine.cloneCombatSupplies(supplies)),
      engine.areCombatSuppliesEqual(supplies, engine.createEmptyCombatSupplies()),
      engine.areCombatSuppliesEqual(supplies, { ...supplies, runePouch: engine.withRunePouchSlot(supplies.runePouch, 1, { id: rune.soul }) }),
    ],
    standardPouch: engine.withRunePouchSlot({ kind: "standard", slots: [null, null, null] }, 2, { id: rune.air }),
    inventory: [engine.createEmptyInventory().length, engine.normalizeInventory([{ id: 1, extra: true }, null, { id: 2 }])],
    stackable: [item.dragonArrow, item.shark].map((id) => [engine.isItemStackable(id, 1, objTypeLoader), engine.isItemStackable(id, 5, null)]),
    kinds: {
      // The entries of a fixed list of kinds, in the order of that list, so that neither a new encounter nor the
      // order of the registry changes the digest.
      definitions: kindsOfTheTable.map((kind) => engine.encounterDefinitions.find((definition) => definition.kind === kind)),
      retired: engine.retiredEncounterKindEntries,
      resolved: ["zuk", "inferno", "yama_p3_glyphic", "nonsense"].map((kind) => [engine.resolveRetiredEncounterKind(kind), engine.resolveBaseEncounterKind(kind), engine.isEncounterKind(kind)]),
      consolidated: engine.consolidateRetiredEncounterKinds({ zuk: 2, inferno: 3, yama_p3: 1 }, (kept = 0, retired) => kept + retired),
      untouched: engine.consolidateRetiredEncounterKinds({ yama_p3: 1 }, (kept) => kept),
    },
    runes: {
      ids: [engine.RUNE_ITEM_IDS, engine.COMBINATION_RUNE_ITEM_IDS],
      available: allRunes.map((id) => engine.hasRuneAvailable(id, caster)),
      perSpell: Object.values(spells).flat().map((spell) => [spell, engine.getSpellRuneTypes(spell), engine.canCastSpell(spell, caster), engine.hasMagicLevelForSpell(spell, 60)]),
      named: [engine.DEATH_CHARGE_SPELL, engine.MARK_OF_DARKNESS_SPELL, engine.getSpellRuneTypes("No Such Spell"), engine.canCastSpell("No Such Spell", caster)],
    },
    soulreaper: [engine.getSoulreaperStacksForWeapon(item.soulreaperAxe, 3), engine.getSoulreaperStacksForWeapon(item.soulreaperAxe), engine.getSoulreaperStacksForWeapon(item.scytheOfVitur, 3)],
    prayers: [
      engine.applyPrayerActions(prayers, [{ type: "protection", prayer: "ProtectMelee" }, { type: "offensive", prayer: "Piety" }, { type: "independent", prayer: "Preserve" }], true),
      engine.applyPrayerActions(prayers, [{ type: "quickPrayers", selections: ["ProtectRange", "Rigour"] }], true),
      engine.applyPrayerActions(prayers, [{ type: "offensive", prayer: "Rigour" }], false),
    ],
    bootstraps: [
      engine.parseEngineBootstrap(bootstrap),
      engine.parseEngineBootstrap(null),
      engine.parseEngineBootstrap({ bootstrap: { ...bootstrap.bootstrap, version: 13 } }),
      engine.parseEngineBootstrap({ bootstrap: { ...bootstrap.bootstrap, inventory: Array(29).fill(null) } }),
      engine.parseEngineBootstrap({ bootstrap: { ...bootstrap.bootstrap, combatSeed: -1 } }),
    ],
    consumables: engine.consumableDefinitionByItemId,
  };
}

/**
 * The player's movement while the engine knows no floor (engine/playerMovement.js, the branches without path search).
 * The application registers an encounter's arena when the cache has loaded its map; an engine made before that, or
 * whose map never loads, has only what the encounter itself knows: nothing for Zebak, so every tile counts as floor,
 * and bare bounds for the Inferno, so none does.
 */
function movementWithoutArena(engineModule, objTypeLoader, registry, controlsOf, rendering) {
  const unknown = { bounds: null, walkableTiles: null, collisionMap: null };
  /** Runs `run` on an engine of `kind` made while no arena is registered for it, then puts back what was registered and the arena in force. */
  const beforeTheArena = (kind, seeds, run) => {
    const registered = rendering.getRegisteredArenaConfig(kind);
    const inForce = { bounds: rendering.getArenaBounds(), walkableTiles: rendering.getArenaWalkableTiles(), collisionMap: rendering.getArenaCollisionMap() };
    const inForceDefault = rendering.getArenaDefaultWalkable();
    rendering.registerArenaConfig(kind, unknown);
    try {
      const engine = engineModule.createSimulationEngine({
        encounterConfig: { kind, mechanics: { infiniteHealth: true } }, objTypeLoader, combatSeed: 1,
        inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
      });
      // The encounter drew its seeds from Math.random, which nothing pins here: start the run again on fixed ones.
      const recording = engine.getEngineRunConfig();
      engine.reset(undefined, { ...recording, encounter: { kind: recording.encounter.kind, seeds } });
      return run(engine);
    } finally {
      rendering.registerArenaConfig(kind, registered ?? unknown); // there is no way to take a registration away; one without geometry counts as none
      rendering.setArenaConfig(inForce, inForceDefault);
    }
  };
  /** Before the first tick the player may walk to a start tile: one step towards the tile at `offset` from where he stands. */
  const stepBy = (engine, [dx, dy]) => {
    const [x, y] = engine.player().position;
    const step = engine.prepareStartPosition([x + dx, y + dy]);
    return step && { offset: [dx, dy].join(), tiles: step.stepTiles.map((tile) => tile.join()).join(" "), isRunning: step.isRunning };
  };
  // Running: every shape of the way to a tile up to 2, up to 4 and more than 4 tiles off; then the same tile again.
  const runOffsets = [[1, 0], [-2, -2], [2, 1], [-1, 2], [3, 0], [0, -4], [4, 1], [3, 2], [-2, 3], [4, 2], [3, 3], [-4, -3], [-4, 4], [7, 2], [-1, 6], [6, 5], [-5, -6], [5, 5], [0, 0]];
  const walkOffsets = [[3, 1], [-1, -1], [0, 5], [-6, 0]];

  const open = beforeTheArena("zebak", { encounterSeed: 1 }, (engine) => {
    const running = runOffsets.map((offset) => stepBy(engine, offset));
    engine.injectAction({ type: "runToggle" }); // queued until the first tick; the start-tile walk already heeds it
    const walking = walkOffsets.map((offset) => stepBy(engine, offset));
    engine.injectAction({ type: "runToggle" });
    engine.finalizeStartPosition();
    // The run itself. Zebak fills x 14-22, y 28-36 and, with no collision known, can be walked into. Unarmed, the
    // player goes for the nearest tile beside him: from beyond a corner, and from inside him by the nearest edge.
    const clicks = {
      1: "zebak", // from the north-east, beyond his corner
      10: [18, 29], 15: "zebak", // inside, nearest his south edge
      18: [16, 32], 22: "zebak", // nearest his west edge
      25: [20, 33], 30: "zebak", // nearest his east edge
      33: [18, 35], 37: "zebak", // nearest his north edge
      40: [10, 24], 48: "zebak", // from the south-west, beyond the opposite corner
    };
    let target = null;
    const positions = [engine.player().position.join()];
    for (let tick = 1; tick <= 52; tick++) {
      const click = clicks[tick];
      if (click) engine.injectAction({ type: "attackTarget", targetId: Array.isArray(click) ? null : click });
      if (click) target = Array.isArray(click) ? click : null;
      engine.advanceTick(target ?? engine.getState().playerPosition);
      positions.push(engine.player().position.join());
    }
    return { running, walking, positions: positions.join(" ") };
  });
  const closed = beforeTheArena("inferno", { runSeed: 1 }, (engine) => {
    const running = stepBy(engine, [4, 0]);
    engine.injectAction({ type: "runToggle" });
    return { running, walking: stepBy(engine, [0, -3]), position: engine.player().position.join() };
  });
  return { open, closed };
}

/**
 * What the pending prayer inputs will do (engine/prayerProjection.js), asked between the inputs and the tick, as the
 * prayer panel asks. In the lobby, where nothing else happens, with a Prayer level of 1: one point, gone after a few
 * ticks of Protect from Melee. Then prayers are queued behind and in front of a drink: a prayer potion restores
 * points for the prayers queued after it, a Saradomin brew does not, and a second potion in the same tick waits for
 * the first one's delay.
 */
function prayerProjection(engineModule, objTypeLoader) {
  const level = (max) => ({ current: max, max });
  const held = [item.prayerPotion, item.saradominBrew, item.superRestore, item.shark, item.prayerPotion];
  const inventory = engineModule.createEmptyInventory();
  held.forEach((id, slot) => (inventory[slot] = { id }));
  const engine = engineModule.createSimulationEngine({
    encounterConfig: { kind: "lobby", mechanics: {} }, objTypeLoader, combatSeed: 1,
    stats: { attack: level(99), strength: level(99), defence: level(99), ranged: level(99), magic: level(99), prayer: level(1), hitpoints: level(99), agility: level(99) },
    inventory, equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  const prayers = () => {
    const player = engine.player();
    return [player.prayerState.points, player.activePrayer, player.offensivePrayer, player.independentPrayers.join(), player.inventory.slice(0, held.length).map((entry) => entry?.id ?? "-").join()].join(" | ");
  };
  const tick = () => engine.advanceTick(engine.getState().playerPosition);
  /** Queues the inputs, asks what they will do, then lets the tick do it. */
  const step = (label, ...actions) => {
    for (const action of actions) engine.injectAction(action);
    const projected = engine.projectPendingPrayers();
    tick();
    return { label, projected, after: prayers() };
  };
  const protect = (prayer) => ({ type: "protectionPrayer", prayer });
  const offensive = (prayer) => ({ type: "offensivePrayer", prayer });
  const use = (inventoryIndex) => ({ type: "itemAction", inventoryIndex, option: "default" });
  const untilEmpty = () => {
    let ticks = 0;
    while (engine.player().prayerState.points > 0 && ticks < 60) (tick(), ticks++);
    return { ticks, after: prayers() };
  };
  const steps = [];
  steps.push({ label: "start", after: prayers(), projected: engine.projectPendingPrayers() });
  steps.push(step("one point: the prayer goes on", protect("ProtectMelee")));
  steps.push({ label: "drained", ...untilEmpty() });
  steps.push(step("no points: refused", protect("ProtectMagic")));
  steps.push(step("no points, an empty slot and something that is not a consumable: still refused", use(20), use(3), protect("ProtectMagic")));
  steps.push(step("a brew restores no prayer; the potion behind it waits for the brew's delay", use(1), protect("ProtectMagic"), use(0), offensive("Piety")));
  for (let waited = 0; waited < 3; waited++) tick();
  steps.push(step("refused before the potion, accepted after it", protect("ProtectMagic"), use(0), offensive("Piety"), { type: "independentPrayer", prayer: "Preserve" }));
  steps.push({ label: "drained again", ...untilEmpty() });
  steps.push(step("quick prayers behind a super restore", use(2), { type: "quickPrayerToggle", selections: ["ProtectRange", "Rigour", "RapidHeal"] }));
  steps.push(step("with points: on at once, and the same prayer again turns it off", offensive("Augury"), protect("ProtectRange")));
  return steps;
}

export const scenarios = [
  { name: "engine/exported-helpers", pure: exportedHelpers },
  { name: "engine/movement-without-arena", pure: movementWithoutArena },
  { name: "engine/prayer-projection", pure: prayerProjection },
  {
    // The lobby encounter's members that no fight calls: the intro, the damage label, and writes to its hand-made collision map.
    name: "engine/lobby-encounter-surface",
    pure(engine, objTypeLoader) {
      const { encounter } = engine.createSimulationEngine({
        encounterConfig: { kind: "lobby", mechanics: {} }, objTypeLoader, combatSeed: 1,
        inventory: engine.createEmptyInventory(), equipment: {}, combatSupplies: engine.createEmptyCombatSupplies(), attackStylePerCategory: {},
      });
      const { collisionMap, bounds } = encounter.getArenaConfig();
      const bit = 1 << 30; // set on no tile, so clearing it leaves the arena (one object, shared with the other scenarios) as it was
      const writes = [[31, 25], [-1, 0], [64, 0], [0, 64]].map(([x, y]) => {
        const before = collisionMap.getFlag(x, y);
        collisionMap.flag(x, y, bit);
        const flagged = [collisionMap.getFlag(x, y), collisionMap.hasFlag(x, y, bit)];
        collisionMap.unflag(x, y, bit);
        return [before, flagged, collisionMap.getFlag(x, y)];
      });
      return { intro: encounter.getIntroConfig(), label: encounter.getNpcDamageSourceLabel(), seeds: encounter.getSeeds(), bounds, writes };
    },
  },
  {
    // Every melee weapon with a special attack profile: normal hit, special, each attack style; two-handed swaps unequip the defender.
    name: "engine/melee-weapons",
    kind: "yama_p3",
    seed: 11,
    ticks: 10 * meleeWeapons.length + 12,
    mechanics: { ...dummy, infiniteSpecialAttack: true },
    ...meleeGear,
    inventory: meleeWeapons,
    script(tick, api) {
      if (tick === 1) offensive(api, "Piety");
      weaponTour(10)(tick, api);
    },
  },
  {
    // Bows, crossbows with enchanted bolts, thrown weapons and the blowpipe; ammunition switched from the inventory.
    name: "engine/ranged-weapons",
    kind: "yama_p3",
    seed: 12,
    ticks: 12 * rangedWeapons.length + 12,
    mechanics: { ...dummy, infiniteSpecialAttack: true },
    ...rangedGear,
    supplies: { equippedAmmo: { id: item.dragonArrow }, blowpipe: { id: item.dragonDart } },
    inventory: rangedWeapons,
    script(tick, api) {
      if (tick === 1) offensive(api, "Rigour");
      weaponTour(12, { ammo: rangedAmmo })(tick, api);
    },
  },
  {
    // Powered staves and staff special attacks, with special attack energy that runs out.
    name: "engine/magic-weapons",
    kind: "yama_p3",
    seed: 13,
    ticks: 10 * magicWeapons.length + 12,
    mechanics: dummy,
    ...magicGear,
    supplies: { spellbook: "standard", selectedSpell: "Fire Surge", runePouch: { kind: "divine", slots: [{ id: rune.fire }, { id: rune.air }, { id: rune.wrath }, { id: rune.death }] } },
    inventory: magicWeapons,
    script(tick, api) {
      if (tick === 1) offensive(api, "Augury");
      weaponTour(10)(tick, api);
    },
  },
  ...Object.keys(spells).map((book, index) => ({
    // Each combat spell of the book cast by hand, then autocast; runes from the inventory and the rune pouch.
    name: `engine/spells-${book}`,
    kind: "yama_p3",
    seed: 20 + index,
    ticks: 6 * spells[book].length + 30,
    mechanics: dummy,
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: book, runePouch: { kind: "standard", slots: [{ id: rune.blood }, { id: rune.death }, { id: rune.soul }] } },
    inventory: [
      ...allRunes, 1409 /* Iban's staff */, 4170 /* Slayer's staff */, 2415 /* Saradomin staff */, 2416 /* Guthix staff */, 2417 /* Zamorak staff */,
      20714 /* Tome of fire */, 25574 /* Tome of water */,
    ],
    script(tick, api) {
      spellTour(book)(tick, api);
      // The staff each staff-bound spell needs, wielded just before its turn; the tomes for the surges.
      const before = (spell) => 6 * spells[book].indexOf(spell) - 1;
      if (book !== "standard") return;
      if (tick === before("Iban Blast")) equip(api, 14, "weapon");
      if (tick === before("Magic Dart")) equip(api, 15, "weapon");
      if (tick === before("Saradomin Strike")) equip(api, 16, "weapon");
      if (tick === before("Claws of Guthix")) equip(api, 17, "weapon");
      if (tick === before("Flames of Zamorak")) equip(api, 18, "weapon");
      if (tick === before("Water Surge")) equip(api, 20, "shield");
      if (tick === before("Fire Surge")) equip(api, 19, "shield");
    },
  })),
  {
    // Set effects and bonuses against the target's kind: void (three helms, elite), demonbane weapons against Yama,
    // inquisitor, crystal, Dharok, salve amulet, slayer helmet, dragon hunter weapons. Starts with nothing worn.
    name: "engine/gear-effects",
    kind: "yama_p3",
    seed: 30,
    ticks: 9 * gearStages.length + 10,
    mechanics: dummy,
    startHp: 20,
    supplies: { equippedAmmo: { id: item.dragonArrow } },
    inventory: gearStages.flatMap((stage) => stage.map(([id]) => id)),
    script(tick, api) {
      eachPeriod(tick, 1, 9, gearStages.length, (index) => {
        const first = gearStages.slice(0, index).reduce((count, stage) => count + stage.length, 0);
        gearStages[index].forEach(([, slot], offset) => equip(api, first + offset, slot));
        attack(api, boss(api).id);
      });
    },
  },
  {
    // Level 1 magic and prayer and an empty rune pouch: spells and prayers that the player may not use.
    name: "engine/requirements-not-met",
    kind: "yama_p3",
    seed: 24,
    ticks: 40,
    mechanics: dummy,
    stats: {
      attack: { current: 99, max: 99 }, strength: { current: 99, max: 99 }, defence: { current: 99, max: 99 }, ranged: { current: 99, max: 99 },
      magic: { current: 1, max: 1 }, prayer: { current: 1, max: 1 }, hitpoints: { current: 99, max: 99 }, agility: { current: 1, max: 1 },
    },
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: "ancient", selectedSpell: "Ice Barrage" },
    inventory: [rune.mind, rune.air],
    script(tick, api) {
      if (tick === 1) attack(api, boss(api).id);
      if (tick === 3) castOn(api, boss(api).id, "Ice Barrage");
      if (tick === 5) offensive(api, "Augury");
      if (tick === 6) protect(api, "ProtectMagic");
      if (tick === 8) castOn(api, boss(api).id, "Wind Strike"); // wrong spellbook
      if (tick === 10) special(api);
      if (tick === 12) api.act({ type: "castDeathCharge" });
    },
  },
  {
    // Food, combo food, every potion family, the rock cake and the locator orb, from 60 hitpoints; eating delays.
    name: "engine/consumables",
    kind: "yama_p3",
    seed: 25,
    ticks: 3 * consumables.length * 2 + 20,
    mechanics: dummy,
    startHp: 60,
    ...meleeGear,
    inventory: consumables,
    script(tick, api) {
      // One item every three ticks, twice around the inventory; a karambwan in the same tick as the anglerfish's turn.
      eachPeriod(tick, 2, 3, consumables.length * 2, (index) => use(api, index % consumables.length));
      if (tick === 11) use(api, 2);
      if (tick === 40) attack(api, boss(api).id);
    },
  },
  {
    // Each prayer on and off, quick prayers, prayer points running out, and run energy running out while walking laps.
    name: "engine/prayers-and-run",
    kind: "yama_p3",
    seed: 26,
    ticks: 420,
    mechanics: dummy,
    stats: {
      attack: { current: 99, max: 99 }, strength: { current: 99, max: 99 }, defence: { current: 99, max: 99 }, ranged: { current: 99, max: 99 },
      magic: { current: 99, max: 99 }, prayer: { current: 30, max: 99 }, hitpoints: { current: 99, max: 99 }, agility: { current: 40, max: 40 },
    },
    ...rangedGear,
    inventory: [item.prayerPotion, item.staminaPotion, item.superRestore],
    script(tick, api) {
      const protections = ["ProtectMagic", "ProtectRange", "ProtectMelee", "Redemption", "Redemption"];
      const offensives = ["Piety", "Rigour", "Augury", "Zeal", "EagleEye", "MysticMight", "Deadeye", "MysticVigour", "MysticVigour"];
      const independents = ["Preserve", "RapidRestore", "RapidHeal", "RapidHeal", "Preserve"];
      eachPeriod(tick, 1, 3, protections.length, (index) => protect(api, protections[index]));
      eachPeriod(tick, 2, 3, offensives.length, (index) => offensive(api, offensives[index]));
      eachPeriod(tick, 3, 3, independents.length, (index) => independent(api, independents[index]));
      if (tick === 30 || tick === 36 || tick === 260) api.act({ type: "quickPrayerToggle", selections: ["ProtectMagic", "Rigour", "Preserve"] });
      if (tick === 33) protect(api, "ProtectMelee"); // changes one prayer while quick prayers are on
      // Laps around the boss: the corners of the arena, running.
      const corners = [[20, 36], [42, 36], [42, 20], [20, 20]];
      eachPeriod(tick, 40, 12, 26, (index) => api.moveTo(...corners[index % corners.length]));
      if (tick === 100) toggleRun(api);
      if (tick === 110) toggleRun(api);
      if (tick === 200) api.act({ type: "ctrlClick", ctrlKey: true });
      if (tick === 215) api.act({ type: "ctrlClick", ctrlKey: false });
      if (tick === 300) use(api, 1); // stamina
      if (tick === 310) use(api, 0); // prayer potion at zero points
      if (tick === 320) protect(api, "ProtectMagic");
    },
  },
  {
    // Inventory handling: drop, pick up, swap, unequip, equipment slot clicks, a full inventory, attacking while moving.
    name: "engine/inventory-and-ground-items",
    kind: "yama_p3",
    seed: 27,
    ticks: 90,
    mechanics: dummy,
    ...meleeGear,
    inventory: [item.shark, item.scytheOfVitur, item.dragonClaws, item.superCombat, ...Array(24).fill(item.shark)],
    script(tick, api) {
      const groundItem = () => api.engine.getState().groundItems[0]?.id;
      if (tick === 1) {
        // Before the run starts the player may walk to another start tile.
        const [x, y] = api.player().position;
        api.prepareStart(x + 2, y - 1);
        api.prepareStart(x + 4, y - 1);
        api.finalizeStart();
      }
      if (tick === 2) api.act({ type: "dropItem", inventoryIndex: 0 });
      if (tick === 4) api.act({ type: "swapInventory", from: 1, to: 5 });
      if (tick === 6) unequip(api, "shield");
      if (tick === 8) equip(api, 5, "weapon"); // scythe: two-handed
      if (tick === 10) unequip(api, "weapon");
      if (tick === 12) api.moveTo(...api.player().position.map((value) => value + 3));
      if (tick === 16 && groundItem()) api.act({ type: "pickupGroundItem", groundItemId: groundItem() });
      if (tick === 24) api.act({ type: "equipmentSlotClick", slot: "weapon" });
      if (tick === 26) attack(api, boss(api).id); // unarmed
      if (tick === 34) equip(api, 2, "weapon");
      if (tick === 36) api.act({ type: "unequipAmmo" });
      if (tick === 40) api.act({ type: "dropItem", inventoryIndex: 3 });
      if (tick === 41) api.act({ type: "dropItem", inventoryIndex: 6 });
      if (tick === 44 && groundItem()) api.act({ type: "pickupGroundItem", groundItemId: groundItem() });
      if (tick === 50) api.act({ type: "setBossHp", hp: 200 });
      if (tick === 60) api.act({ type: "applyBossHpPreset", hp: 100 });
      if (tick === 70) api.moveTo(20, 36);
    },
  },
  {
    // Picking up what was dropped. The scenario above orders a pickup and never stands on the item's tile, so the
    // pickup itself never ran. Here: a single item taken where it was dropped; two runes that join on the ground and
    // then join the stack in the inventory; that stack dropped and taken into an empty slot; a ground item that does
    // not exist; an item the player walks back to; a pickup that an attack order cancels.
    name: "engine/ground-item-pickup",
    kind: "yama_p3",
    seed: 31,
    ticks: 60,
    mechanics: dummy,
    ...meleeGear,
    inventory: [item.shark, rune.fire, rune.fire, rune.fire, item.superCombat],
    script(tick, api) {
      const groundItem = () => api.engine.getState().groundItems[0];
      const pickUp = () => groundItem() && api.act({ type: "pickupGroundItem", groundItemId: groundItem().id });
      const drop = (inventoryIndex) => api.act({ type: "dropItem", inventoryIndex });
      if (tick === 2) drop(0); // the shark
      if (tick === 4) pickUp();
      if (tick === 6) drop(1); // a fire rune
      if (tick === 7) drop(2); // a second one, onto the first
      if (tick === 9) pickUp(); // both, into the stack of slot 3
      if (tick === 12) api.act({ type: "pickupGroundItem", groundItemId: 999 });
      if (tick === 14) drop(3); // the stack of three
      if (tick === 16) pickUp(); // into the first empty slot
      if (tick === 20) drop(4); // the super combat
      if (tick === 21) api.moveTo(...api.player().position.map((value) => value + 3));
      if (tick === 26) pickUp(); // ordered from three tiles away: nothing happens until the player stands on it
      if (tick === 28) api.moveTo(...groundItem().position);
      if (tick === 40) drop(0);
      if (tick === 41) api.moveTo(...api.player().position.map((value) => value - 2));
      if (tick === 45) pickUp();
      if (tick === 46) attack(api, boss(api).id); // the attack order cancels the pickup
      if (tick === 50) api.moveTo(...groundItem().position);
    },
  },
  {
    // A lost fight, then the restart button twice: once with the same encounter seeds, once with fresh ones.
    name: "engine/death-and-restart",
    kind: "yama_p3",
    seed: 28,
    ticks: 260,
    intro: true,
    ...rangedGear,
    inventory: [item.anglerfish, item.rangingPotion],
    script(tick, api) {
      if (tick === 3 || tick === 62 || tick === 152) api.skipIntro();
      if (tick === 4 || tick === 64) attack(api, boss(api).id);
      if (tick === 60) api.restart(api.engine.encounter.getSeeds()); // by now the player has died
      if (tick === 150) api.restart();
      if (tick === 154) use(api, 0);
    },
  },
  {
    // What the tutorial and the stats panel do to a running engine: new stats, a pause, a debug command run at once.
    name: "engine/tutorial-controls",
    kind: "yama_p3",
    seed: 33,
    ticks: 60,
    mechanics: { ...dummy, infiniteHealth: true },
    ...rangedGear,
    inventory: [item.twistedBow, item.dragonArrow, item.masoriMask, item.anglerfish, 4151 /* Abyssal whip */],
    script(tick, api) {
      const level = (current, max = current) => ({ current, max });
      if (tick === 1) attack(api, boss(api).id);
      if (tick === 8) api.setStats({ attack: level(60), strength: level(70), defence: level(40), ranged: level(75, 80), magic: level(50), prayer: level(43), hitpoints: level(70), agility: level(50) });
      if (tick === 12) api.commandNow({ encounter: "yama_p3", type: "spawn-fireball" });
      if (tick === 13) api.commandNow({ encounter: "sol_heredit", type: "strike-sand" }); // another encounter's: refused
      if (tick === 20) api.pause(true);
      if (tick === 26) api.pause(false);
      if (tick === 30) api.commandNow({ encounter: "yama_p3", type: "spawn-void-flare" });
    },
  },
  {
    // The lobby: no boss, its own hand-made arena. A walk, a prayer and an attack on whoever stands there.
    name: "engine/lobby-walk",
    kind: "lobby",
    seed: 32,
    ticks: 60,
    ...meleeGear,
    script(tick, api) {
      const [x, y] = api.player().position;
      if (tick === 1) api.moveTo(x + 6, y + 4);
      if (tick === 10) protect(api, "ProtectMelee");
      if (tick === 15) api.moveTo(x - 8, y - 6);
      if (tick === 30 && nearestNpc(api)) attack(api, nearestNpc(api).id);
      if (tick === 45) toggleRun(api);
      if (tick === 46) api.moveTo(31, 25);
    },
  },
  {
    // The boss dies while the application, not the encounter, owns the end of the run.
    name: "engine/externally-owned-completion",
    kind: "yama_p3",
    seed: 31,
    ticks: 30,
    completionOwnership: "external-owned",
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) attack(api, boss(api).id);
      if (tick === 6) api.act({ type: "setBossHp", hp: 0 });
    },
  },
  {
    // Several targets at once: Inferno wave 20 with barrages, chinchompas, the scythe and a venator bow.
    name: "engine/area-attacks",
    kind: "inferno",
    seed: 29,
    ticks: 200,
    mechanics: { infiniteHealth: true, infernoStartWave: "20" },
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: "ancient", selectedSpell: "Ice Barrage", equippedAmmo: { id: item.dragonArrow } },
    inventory: [rune.blood, rune.death, rune.water, rune.soul, 11959 /* Black chinchompa */, 27610 /* Venator bow */, item.scytheOfVitur],
    script(tick, api) {
      if (tick % 10 === 1) {
        const target = nearestNpc(api);
        if (target) attack(api, target.id);
      }
      if (tick === 60) equip(api, 4, "weapon");
      if (tick === 100) equip(api, 5, "weapon");
      if (tick === 140) equip(api, 6, "weapon");
    },
  },
  {
    // An area attack that finds more than one target. The six nibblers of Inferno wave 3 walk to one pillar and stand
    // on one tile there, so an Ice Barrage on one of them collects the others (collectAreaTargetsAround in
    // playerAttack/launch.js), and so does a black chinchompa on the three of wave 4. engine/area-attacks never has a
    // second monster within a tile of its target. Not run here: an area attack that finds as many targets as it may
    // hit (nine for a barrage, twelve for a black chinchompa), where the search stops early.
    name: "engine/area-attack-several-targets",
    kind: "inferno",
    seed: 34,
    ticks: 70,
    mechanics: { infiniteHealth: true, infernoStartWave: "3" },
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: "ancient", selectedSpell: "Ice Barrage" },
    inventory: [rune.blood, rune.death, rune.water, rune.soul, 11959 /* Black chinchompa */],
    script(tick, api) {
      const nibblers = api.npcs().filter((npc) => npc.archetypeId === "inferno_nibbler" && npc.death === undefined);
      if (tick === 40) equip(api, 4, "weapon");
      if (tick % 5 === 0 && nibblers.length > 0) attack(api, nibblers[0].id);
    },
  },
  {
    // A special attack that needs an attribute its target lacks. The scorching bow's special is for demons
    // (targetAttribute "demon" in the special attack table) and Sol Heredit is none: the special's definition is
    // dropped and the attack goes on as an ordinary one, with the special still switched on. No other scenario
    // turns a special on against a target without its attribute.
    name: "engine/special-attack-wrong-target",
    kind: "sol_heredit",
    seed: 33,
    ticks: 40,
    mechanics: { infiniteHealth: true },
    equipment: { ...rangedGear.equipment, weapon: 29591 /* Scorching bow */ },
    supplies: { equippedAmmo: { id: item.dragonArrow } },
    script(tick, api) {
      const target = nearestNpc(api);
      if (tick % 10 === 1 && target) attack(api, target.id);
      if (!api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // What special attacks leave on the target (engine/specialAttacks.js), each weapon for 25 ticks of nothing but specials so
    // that some land: the Bandos godsword's and the warhammer's Defence drains, Emberlight's weaken on a demon, the
    // tentacle's bind and poison roll (Yama is immune to poison), the burning claws' burn, the scorching bow's bind and burn
    // until a sixth burn at once is refused. Then the special attack bar clicked with nothing wielded.
    name: "engine/special-attack-effects",
    kind: "yama_p3",
    seed: 40,
    ticks: 25 * effectWeapons.length + 8,
    mechanics: { ...dummy, infiniteSpecialAttack: true },
    ...meleeGear,
    supplies: { equippedAmmo: { id: item.dragonArrow } },
    inventory: effectWeapons,
    script(tick, api) {
      if (tick === 1) offensive(api, "Piety");
      eachPeriod(tick, 1, 25, effectWeapons.length, (index) => (equip(api, index, "weapon"), attack(api, boss(api).id)));
      if (tick === 25 * effectWeapons.length + 1) unequip(api, "weapon");
      if (!api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // The Staff of the Dead's special, Power of Death: it takes the whole bar at once, halves Yama's melee hits while
    // the staff is held, is refused on an empty bar, and is lost with the first hit taken after the staff is put away.
    name: "engine/power-of-death",
    kind: "yama_p3",
    seed: 41,
    ticks: 45,
    mechanics: { ...dummy, yamaMelee: true },
    equipment: { ...meleeGear.equipment, weapon: 11791 /* Staff of the Dead */ },
    script(tick, api) {
      if (tick === 1) attack(api, boss(api).id);
      if (tick === 3 || tick === 20) special(api);
      if (tick === 30) unequip(api, "weapon");
    },
  },
  {
    // Inferno wave 20, whose monsters stand together and are not immune to everything. A venator bow's arrow bounces from
    // one nibbler to the next (a bounce rolls up to two thirds of the maximum; a seeking arrow's minimum hit is lowered
    // with it). On the ranger the tentacle's poison takes, Emberlight weakens less than it would a demon, and the
    // burning claws' burn is refused: a normal burn does nothing to an Inferno monster.
    name: "engine/ricochet-poison-burn-immunity",
    kind: "inferno",
    seed: 42,
    ticks: 82,
    mechanics: { infiniteHealth: true, infiniteSpecialAttack: true, infernoStartWave: "20" },
    equipment: { ...rangedGear.equipment, weapon: 27610 /* Venator bow */ },
    supplies: { equippedAmmo: { id: 33553 /* Seeking bronze arrow */ } },
    inventory: [12006 /* Abyssal tentacle */, 29589 /* Emberlight */, 29577 /* Burning claws */],
    script(tick, api) {
      const living = (kind) => api.npcs().filter((npc) => npc.archetypeId === "inferno_" + kind && npc.death === undefined);
      if (tick === 2 && living("nibbler").length) attack(api, living("nibbler")[0].id);
      eachPeriod(tick, 20, 18, 3, (index) => (equip(api, index, "weapon"), attack(api, living("ranger")[0].id)));
      if (tick >= 20 && !api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // The eclipse atlatl in the full Eclipse Moon set: a fifth of its accurate hits leave a strong burn. Then without
    // the helm: the set is asked about on every throw and is no longer whole.
    name: "engine/eclipse-set-burn",
    kind: "yama_p3",
    seed: 60,
    ticks: 50,
    mechanics: dummy,
    equipment: { ...rangedGear.equipment, weapon: 29000 /* Eclipse atlatl */, head: 29010, body: 29004, legs: 29007 /* Eclipse Moon helm, chestplate, tassets */ },
    supplies: { equippedAmmo: { id: 28991 /* Atlatl dart */ } },
    script(tick, api) {
      if (tick === 1) (offensive(api, "Rigour"), attack(api, boss(api).id));
      if (tick === 40) unequip(api, "head");
    },
  },
  {
    // Ruby dragon bolts (e): Blood Forfeit takes a fifth of the target's hitpoints (at most 100) and a tenth of the
    // player's own. With this seed the sixth shot does it (tick 26, landing on tick 29).
    name: "engine/ruby-bolt-blood-forfeit",
    kind: "yama_p3",
    seed: 44,
    ticks: 40,
    mechanics: dummy,
    equipment: { ...rangedGear.equipment, weapon: item.zaryteCrossbow },
    supplies: { equippedAmmo: { id: item.rubyDragonBoltsE } },
    script(tick, api) {
      if (tick === 1) (offensive(api, "Rigour"), attack(api, boss(api).id));
    },
  },
  {
    // Claw specials whose outcome is partly decided beforehand, in the Bloodied Blows contract at 10 hitpoints: every
    // hit of the player has a minimum there, and a void flare is never missed. Dragon claws on a flare, then on Yama;
    // burning claws on Yama.
    name: "engine/claw-specials-forced-outcomes",
    kind: "yama_p3_bloodied",
    seed: 45,
    ticks: 50,
    startHp: 10,
    mechanics: { ...dummy, infiniteHealth: true, infiniteSpecialAttack: true },
    equipment: { ...meleeGear.equipment, weapon: item.dragonClaws, shield: undefined },
    inventory: [item.burningClaws],
    script(tick, api) {
      const flare = api.npcs().find((npc) => npc.archetypeId === "voidflare" && npc.targetableFromTick <= tick);
      if (tick === 1) api.act({ type: "encounterCommand", command: { encounter: "yama_p3", type: "spawn-void-flare" } });
      if (tick === 30) equip(api, 0, "weapon");
      const target = flare ?? boss(api);
      if (api.player().attackTarget !== target.id) attack(api, target.id);
      if (!api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // An accurate hit that does no damage. In the Glyphic Attenuation contract damage is multiplied by 1 + 0.0155 per
    // point of prayer bonus; the Ruinous powers book has -1, and a hit of 1 (all a player of 1 Strength rolls, half
    // the time) is floored to 0. The warhammer's Defence drain needs damage, so the engine sorts the special's effects
    // into those that do and those that do not.
    name: "engine/accurate-hit-for-nothing",
    kind: "yama_p3_glyphic",
    seed: 48,
    ticks: 60,
    mechanics: { ...dummy, infiniteSpecialAttack: true },
    stats: {
      attack: { current: 99, max: 99 }, strength: { current: 1, max: 1 }, defence: { current: 99, max: 99 }, ranged: { current: 99, max: 99 },
      magic: { current: 99, max: 99 }, prayer: { current: 99, max: 99 }, hitpoints: { current: 99, max: 99 }, agility: { current: 99, max: 99 },
    },
    equipment: { weapon: 13576 /* Dragon warhammer */, shield: 28775 /* Ruinous powers */ },
    script(tick, api) {
      if (tick === 1) (offensive(api, "Piety"), attack(api, boss(api).id));
      if (!api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // Clicks the path search cannot serve: the corner of the map square, with no floor within ten tiles of it, and a
    // tile off the map square, beyond the grid the search keeps. The player stays where he is. Then two runs across
    // the arena with a ring of endurance on, which slows the drain of run energy.
    name: "engine/clicks-off-the-floor",
    kind: "yama_p3",
    seed: 46,
    ticks: 30,
    mechanics: dummy,
    equipment: { ...rangedGear.equipment, ring: 24736 /* Ring of endurance */ },
    script(tick, api) {
      if (tick === 1) api.moveTo(0, 63);
      if (tick === 4) api.moveTo(150, 30);
      if (tick === 7) api.moveTo(20, 36);
      if (tick === 18) api.moveTo(42, 20);
    },
  },
  {
    // Mark of Darkness cast again within its ten ticks of cooldown (refused), and once more after them.
    name: "engine/mark-of-darkness-cooldown",
    kind: "yama_p3",
    seed: 47,
    ticks: 16,
    mechanics: dummy,
    equipment: { ...magicGear.equipment, weapon: item.kodaiWand },
    supplies: { spellbook: "arceuus" },
    inventory: [rune.cosmic, rune.soul],
    script(tick, api) {
      if (tick === 2 || tick === 6 || tick === 14) api.act({ type: "castMarkOfDarkness" });
    },
  },
  {
    // A freeze on a target that resists it entirely: the Zamorak godsword's special lands on Sol Heredit and binds nothing.
    name: "engine/freeze-resisted",
    kind: "sol_heredit",
    seed: 49,
    ticks: 40,
    mechanics: { infiniteHealth: true, infiniteSpecialAttack: true },
    equipment: { ...meleeGear.equipment, weapon: 11808 /* Zamorak godsword */, shield: undefined },
    script(tick, api) {
      if (tick === 1) offensive(api, "Piety");
      if (boss(api) && api.player().attackTarget !== boss(api).id) attack(api, boss(api).id);
      if (!api.player().isSpecialAttackActive) special(api);
    },
  },
  {
    // A slayer helmet (i) on, which multiplies accuracy and maximum hit of every attack profile in its own way
    // (engine/playerAttack/profiles.js): several hits, a second hit that depends on the first, claw specials, a
    // special that cannot miss, bows (the scorching bow against a demon adds instead of multiplying, a crystal bow is
    // multiplied last), the eclipse atlatl (which takes the bonus as a melee weapon does). Among them two special
    // attacks whose profile no other fight builds: the abyssal bludgeon's and the purging staff's.
    name: "engine/slayer-helmet-profiles",
    kind: "yama_p3",
    seed: 51,
    ticks: 10 * helmetWeapons.length + 12,
    mechanics: { ...dummy, infiniteSpecialAttack: true },
    equipment: { ...meleeGear.equipment, head: 11865 /* Slayer helmet (i) */ },
    supplies: { equippedAmmo: { id: item.dragonArrow } },
    inventory: helmetWeapons,
    script: weaponTour(10, { ammo: { 29000: 28991, 28991: null } }),
  },
  {
    // Confliction gauntlets: after a spell or a charged staff has missed, the same attack on the same target rolls
    // its accuracy twice. The Sanguinesti staff, then Fire Surge from a kodai wand, each for 20 ticks, on the Yama of
    // Glyphic Attenuation, whom magic seldom hits. A miss stays pending until the same attack is made again, so the
    // spell gets its turn only because, with this seed, the staff's last cast lands.
    name: "engine/confliction-gauntlets",
    kind: "yama_p3_glyphic",
    seed: 55,
    ticks: 42,
    mechanics: dummy,
    equipment: { ...magicGear.equipment, weapon: 22323 /* Sanguinesti staff */, hands: 31106 /* Confliction gauntlets */ },
    supplies: { spellbook: "standard", selectedSpell: "Fire Surge", runePouch: { kind: "divine", slots: [{ id: rune.fire }, { id: rune.air }, { id: rune.wrath }, { id: rune.death }] } },
    inventory: [item.kodaiWand],
    script(tick, api) {
      if (tick === 1) attack(api, boss(api).id);
      if (tick === 21) equip(api, 0, "weapon");
      if (tick === 22) (api.act({ type: "attackStyleChange", index: 3 }), attack(api, boss(api).id)); // the wand's autocast style
    },
  },
  {
    // Inquisitor's armour, whose crush bonus is multiplied in after everything else, with the two crush weapons that
    // hit more than once (engine/playerAttack/profiles.js): the scythe on Jab, its one crush style, and the dual
    // macuahuitl, whose second hit depends on the first.
    name: "engine/inquisitor-multi-hit",
    kind: "yama_p3",
    seed: 61,
    ticks: 40,
    mechanics: dummy,
    equipment: { ...meleeGear.equipment, weapon: item.scytheOfVitur, shield: undefined, head: 24419, body: 24420, legs: 24421 /* Inquisitor's great helm, hauberk, plateskirt */ },
    inventory: [28997 /* Dual macuahuitl */],
    script(tick, api) {
      if (tick === 1) (offensive(api, "Piety"), api.act({ type: "attackStyleChange", index: 2 }), attack(api, boss(api).id));
      if (tick === 20) (equip(api, 0, "weapon"), attack(api, boss(api).id));
    },
  },
  {
    // The soulreaper axe's special before the first swing, with no stack built: the profile of an ordinary hit.
    name: "engine/soulreaper-special-without-stacks",
    kind: "yama_p3",
    seed: 62,
    ticks: 14,
    mechanics: dummy,
    equipment: { ...meleeGear.equipment, weapon: item.soulreaperAxe, shield: undefined },
    script(tick, api) {
      if (tick === 1) (special(api), attack(api, boss(api).id));
    },
  },
  {
    // Osmumten's fang on Slash: the damage is trimmed as on Stab, but the accuracy is rolled once, not twice.
    name: "engine/fang-on-slash",
    kind: "yama_p3",
    seed: 63,
    ticks: 20,
    mechanics: dummy,
    ...meleeGear,
    script(tick, api) {
      if (tick === 1) (api.act({ type: "attackStyleChange", index: 2 }), attack(api, boss(api).id));
    },
  },
  {
    // The Arkan blade: a slash sword (Chop, Slash, Lunge, Block) that attacks every 4 ticks. Its special attack, Flames of
    // Ralos, takes 30 % of the energy, raises accuracy and damage by half and burns the target when it deals damage.
    // Specials on ticks 6, 10 and 14: the first two hit and burn, the third deals nothing; a fourth is refused with 10 %
    // of the energy left. The two burns pulse together every 4 ticks, the last time on tick 47. From tick 40 he lunges.
    name: "engine/arkan-blade",
    kind: "yama_p3",
    seed: 64,
    ticks: 70,
    mechanics: dummy,
    equipment: { ...meleeGear.equipment, weapon: 30955 /* Arkan blade */ },
    script(tick, api) {
      if (tick === 1) (offensive(api, "Piety"), attack(api, boss(api).id));
      if ([3, 7, 11, 15].includes(tick)) special(api);
      if (tick === 40) api.act({ type: "attackStyleChange", index: 2 });
    },
  },
  {
    // The Eldritch nightmare staff's special attack, Invocate, at 70 prayer points of 70. Switched on and cast on tick
    // 1 from the start tile, without walking up (it reaches 10 tiles whatever the staff's attack style), for 55 % of
    // the energy; it lands on tick 4 for 23 and restores half of that, 11 prayer points, beyond the level. Then he
    // walks up and hits with the staff. A super restore on tick 9 leaves the 81 points as they are; a second special
    // on tick 14 is refused with 45 % of the energy left.
    name: "engine/eldritch-staff",
    kind: "yama_p3",
    seed: 65,
    ticks: 30,
    mechanics: dummy,
    stats: {
      attack: { current: 99, max: 99 }, strength: { current: 99, max: 99 }, defence: { current: 99, max: 99 }, ranged: { current: 99, max: 99 },
      magic: { current: 99, max: 99 }, prayer: { current: 70, max: 70 }, hitpoints: { current: 99, max: 99 }, agility: { current: 99, max: 99 },
    },
    equipment: { ...magicGear.equipment, weapon: 24425 /* Eldritch nightmare staff */ },
    inventory: [3024 /* Super restore(4) */],
    script(tick, api) {
      if (tick === 1) (special(api), attack(api, boss(api).id));
      if (tick === 9) use(api, 0);
      if (tick === 14) (special(api), attack(api, boss(api).id));
    },
  },
  {
    // The greater thralls (client/engine/thralls.js), on the Arceuus spellbook with the Book of the Dead worn and
    // fire, blood and aether runes (aether is a cosmic rune) in a divine rune pouch, at Magic 99 and 70 prayer
    // points. A ghost is raised on tick 1 for 6 points and follows the player to the boss, hitting it every 4 ticks
    // for 0 to 3. A skeleton on tick 10 is refused (16 ticks of cooldown); a zombie on tick 20 replaces the ghost.
    // The zombie, raised between ticks 19 and 20, returns to the grave on tick 118, 99 ticks on.
    name: "engine/thralls",
    kind: "yama_p3",
    seed: 66,
    ticks: 125,
    mechanics: dummy,
    stats: {
      attack: { current: 99, max: 99 }, strength: { current: 99, max: 99 }, defence: { current: 99, max: 99 }, ranged: { current: 99, max: 99 },
      magic: { current: 99, max: 99 }, prayer: { current: 70, max: 70 }, hitpoints: { current: 99, max: 99 }, agility: { current: 99, max: 99 },
    },
    equipment: { ...magicGear.equipment, weapon: 24425 /* Eldritch nightmare staff */, shield: 25818 /* Book of the Dead */ },
    inventory: [27281 /* Divine rune pouch */],
    supplies: {
      spellbook: "arceuus",
      runePouch: { kind: "divine", slots: [{ id: rune.fire }, { id: rune.blood }, { id: 30843 /* aether */ }, { id: rune.death }] },
    },
    script(tick, api) {
      if (tick === 1) (api.act({ type: "castThrall", spell: "Resurrect Greater Ghost" }), attack(api, boss(api).id));
      if (tick === 10) api.act({ type: "castThrall", spell: "Resurrect Greater Skeleton" });
      if (tick === 20) api.act({ type: "castThrall", spell: "Resurrect Greater Zombie" });
    },
  },
];
