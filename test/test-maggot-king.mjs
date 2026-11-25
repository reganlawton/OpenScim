// The Maggot King loads on his route and is drawn from the trimmed cache (his
// lair's map square, him and his larvae); the bile of his spits and the
// carrion of his screeches are drawn where they lie; below a fifth his
// screech fills the room with larvae; he dies into the victory screen and
// takes the larvae and the floor's mess with him. The mechanics themselves
// are digested by the determinism harness
// (tools/determinism/scenarios/maggot-king.mjs).
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:8791";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  // A model, an animation or a map square missing from the trimmed cache is logged, not thrown.
  page.on("console", (message) => message.text().includes("Empty container") && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'maggot_king') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/maggot-king/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/maggot-king/");

  // The player starts in the first of his setups (loadouts.js, the wiki's strategies page): the Zaryte crossbow and
  // ruby dragon bolts (e) worn, the melee switch and the supplies in a full inventory.
  const setup = await page.evaluate(() => {
    const { equipment, inventory, combatSupplies: supplies } = engine.player();
    return { weapon: equipment.weapon, shield: equipment.shield, items: inventory.filter(Boolean).length, ammo: supplies.equippedAmmo.id, scythe: inventory[0]?.id };
  });
  assert.deepEqual(setup, { weapon: 26374, shield: 21000, items: 28, ammo: 21944, scythe: 22325 });

  // To his first spit's bile, then to the first screech's carrion (which may
  // cover every bile): each drawn as the loc the game uses on its tile.
  await page.evaluate(() => engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true }));
  const until = (what) =>
    page.evaluate((what) => {
      for (let tick = 0; tick < 80 && engine.getEncounterSnapshot().state[what].length === 0; tick++) engine.advanceTick(engine.player().position);
      const encounter = engine.getEncounterSnapshot();
      const drawn = scene.sceneObjectController.update({ state: { encounter }, interpolatedTick: engine.worldState.tick });
      const { poisonBile, stickyBile, carrion } = encounter.state;
      const lying = [...poisonBile, ...stickyBile, ...carrion];
      return {
        lies: encounter.state[what].length > 0,
        drawn: drawn.length === lying.length,
        locs: [...new Set(drawn.map((object) => object.data.locId))].sort(),
        tiles: drawn.every((object, n) => object.data.localX === lying[n][0] && object.data.localY === lying[n][1]),
      };
    }, what);
  assert.deepEqual(await until("poisonBile"), { lies: true, drawn: true, locs: [33423], tiles: true });
  const { locs, ...carrion } = await until("carrion");
  assert.deepEqual(carrion, { lies: true, drawn: true, tiles: true });
  assert.ok(locs.includes(33425) && locs.every((id) => id === 33423 || id === 33425), locs.join());

  // Below a fifth his next screech launches four larvae, two a side; they come down over the bones.
  const larvae = await page.evaluate(() => {
    engine.setBossHp(250);
    const count = () => engine.worldState.getNpcs().filter((npc) => npc.npcTypeId === 15743).length;
    for (let tick = 0; tick < 60 && count() < 4; tick++) engine.advanceTick(engine.player().position);
    return { larvae: count(), final: engine.getEncounterSnapshot().state.final };
  });
  assert.deepEqual(larvae, { larvae: 4, final: true });
  await page.waitForFunction(() => scene.isNpcTypeLoaded(15742) && scene.isNpcTypeLoaded(15743), null, { timeout: 60000 });

  // Killed; the application's own loop plays his death and ends the fight,
  // with the larvae and what lay on the floor gone.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("THE MAGGOT KING DEFEATED"), null, { timeout: 120000 });
  const cleared = await page.evaluate(() => {
    const { poisonBile, stickyBile, carrion } = engine.getEncounterSnapshot().state;
    return { lying: poisonBile.length + stickyBile.length + carrion.length, larvae: engine.worldState.getNpcs().filter((npc) => npc.npcTypeId === 15743 && npc.alive).length };
  });
  assert.deepEqual(cleared, { lying: 0, larvae: 0 });
  assert.deepEqual(errors, []);
  console.log("The Maggot King loaded on /maggot-king/, was drawn with his bile, carrion and larvae, and was won");
} finally {
  await browser.close();
}
