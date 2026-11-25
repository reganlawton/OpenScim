// An encounter that no file under client/ knows loads on a route, is drawn
// and can be fought. The fixture is test/fixtures/training-ground/; the page
// gets it the way a contributor adds an encounter, as two lines in two
// modules (test/fixtures/register.mjs), put in while the modules are served.
// Without those lines the site does not have it.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { serveFixture } from "./fixtures/register.mjs";

const origin = "http://127.0.0.1:8791";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});

try {
  // The site as it ships: the fixture's route leads to the lobby.
  const plain = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  await plain.goto(origin + "/training-ground/");
  await plain.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  await plain.waitForFunction(() => location.pathname === "/");
  assert.ok(!(await plain.locator("body").innerText()).includes("Training Ground"), "the fixture is not on the site");
  await plain.close();

  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  await serveFixture(page);
  // Two probes: the engine of the fixture's fight, and the scene as the
  // default scene builder made it.
  // Two more, into the application's tables that an encounter's descriptor
  // fills: its tile-marker presets and the What's New entries.
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'training_ground') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
    ["**/assets/application.js*", "var eve = \"Check your gear, then press Start.\";", "window.tilePresetsOf = Qbe; window.whatsNew = Ibe;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  // The route: the kind with "-" for "_" (engine/encounterKinds.js), and a page title from
  // the descriptor's `seo`: application.js has no entry for the kind.
  await page.goto(origin + "/training-ground/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/training-ground/");
  await page.waitForFunction(() => document.title === "Training Ground Simulator | OpenScim.dev");
  assert.equal(await page.evaluate(() => engine.getEncounterKind()), "training_ground");

  // The scene: terrain, the player and the monster are loaded, and the
  // monster has a render instance where the simulation has it.
  await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcLoaded() && scene.npcInstanceManager.instanceRegistry.has("sparring-partner"), null, { timeout: 60000 });
  const drawn = await page.evaluate(() => ({
    sceneClass: Object.getPrototypeOf(scene).constructor.name,
    renderConfigNpcTypes: scene.encounterRenderConfig.preloadNpcTypes.map((type) => type.npcTypeId),
    npcTypeLoaded: scene.isNpcTypeLoaded(7697),
    hitTest: scene.getAllNpcHitTestData().map((entry) => entry.actorId),
    hitpoints: engine.worldState.actors.get("sparring-partner").vitals,
  }));
  // The partner, and the player's greater thralls, which the scene of every
  // fight loads: ghost, skeleton, zombie (client/engine/thralls.js).
  assert.deepEqual(drawn, { sceneClass: "InfernoScene", renderConfigNpcTypes: [7697, 10880, 10883, 10886], npcTypeLoaded: true, hitTest: ["sparring-partner"], hitpoints: { hp: 75, maxHp: 75 } });

  // What the descriptor gives the menus. Its tile-marker preset, as the application keeps one; and the What's New
  // entries: the files of client/whats-new/ before the entries of their date that application.js lists.
  const menus = await page.evaluate(() => ({ presets: tilePresetsOf("training_ground"), news: whatsNew.map((entry) => entry.id), dated: whatsNew.filter((entry) => entry.date).map((entry) => entry.date) }));
  assert.deepEqual(menus.presets, [{ id: "training_ground_ring", name: "Sparring ring", description: "Where the partner starts", encounterKind: "training_ground", markers: [{ x: 30, y: 30, color: "#14D74F", opacity: 1, label: "Partner" }, { x: 31, y: 30, color: "#D81414", opacity: 0.5 }] }]);
  const newsFiles = readdirSync(new URL("../client/whats-new/", import.meta.url)).map((name) => name.replace(/\.js$/, "")); // ids, which begin with the date
  const before = newsFiles.filter((id) => id >= "2026-11-24").sort((a, b) => b.slice(0, 10).localeCompare(a.slice(0, 10)) || a.localeCompare(b));
  assert.ok(before.includes("2026-11-24-colosseum"));
  assert.deepEqual(menus.news.slice(0, before.length + 1), [...before, "2026-11-24-zebak"]);
  assert.deepEqual(menus.dated, [...menus.dated].sort().reverse(), "What's New is newest first");

  // A fight, ticked from here until the monster is nearly dead: it walks up
  // and hits, and the debug action of the fixture's controls reaches the
  // encounter. The player starts with the first loadout of the descriptor.
  const fight = await page.evaluate(() => {
    const partner = engine.worldState.actors.get("sparring-partner");
    const start = [...partner.position];
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    engine.injectAction({ type: "attackTarget", targetId: "sparring-partner" });
    let attacks = 0, walked = false, healedTo = null;
    for (let tick = 0; tick < 600 && partner.alive && !(healedTo !== null && partner.vitals.hp <= 12); tick++) {
      if (partner.vitals.hp < 40 && healedTo === null) {
        engine.executeEncounterCommand({ encounter: "training_ground", type: "heal-partner" });
        healedTo = partner.vitals.hp;
      }
      engine.advanceTick(engine.player().position);
      walked ||= partner.position[0] !== start[0] || partner.position[1] !== start[1];
      attacks += engine.getLastTickEvents().filter((event) => event.type === "zuk_attack" && event.attack === "training_ground_melee").length;
    }
    return { walked, attacked: attacks > 0, healedTo, alive: partner.alive, nearlyDead: partner.vitals.hp <= 12, worn: engine.player().equipment, carried: engine.player().inventory.slice(0, 4).map((item) => item?.id ?? null) };
  });
  assert.deepEqual(fight, { walked: true, attacked: true, healedTo: 75, alive: true, nearlyDead: true, worn: { cape: 22109 }, carried: [6685, null, 6685, null] });
  // The application's own tick loop ends the fight. The scene plays the
  // monster's death, and the interface shows the victory text of the
  // fixture's descriptor.
  await page.waitForFunction(() => scene.npcInstanceManager.dyingInstances.has("sparring-partner"), null, { timeout: 120000 });
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("SPARRING PARTNER DEFEATED"), null, { timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log("The fixture encounter loaded on /training-ground/, was drawn by the default scene, fought and was won");
} finally {
  await browser.close();
}
