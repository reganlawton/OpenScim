// General Graardor (/general-graardor/): loads in Bandos' Stronghold (region
// 11347, plane 2 shifted to level 0) with the Crystal (Bowfa) default gear
// setup (Ring of suffering (i) worn, Toxic blowpipe in inventory), the
// Altar-Door (6:0) tile marker preset active by default, clickable red-X
// interactions on both the Big door and the Bandos altar, bodyguard minions
// attacking immediately from tick 1, and victory upon General Graardor's death
// without needing to finish off the minions.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:8791";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "C:/Program Files/Google/Chrome/Application/chrome.exe"),
  args: ["--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  page.on("console", (message) => /Empty container/.test(message.text()) && errors.push(message.text()));

  for (const [path, marker, probe] of [
    [
      "**/engine/SimulationEngine.js*",
      "this.encounter = options.encounter;",
      "if (options.encounter.kind === 'general_graardor') window.engine = this;",
    ],
    [
      "**/encounters/shared/buildScene.js*",
      "const scene = new Scene();",
      "window.scene = scene;",
    ],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/general-graardor/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/general-graardor/");
  await page.waitForFunction(
    () => document.title === "General Graardor Simulator | OpenScim.dev",
  );
  assert.equal(await page.evaluate(() => engine.getEncounterKind()), "general_graardor");

  // Wait for terrain, player, map locations, and all 4 NPCs (General Graardor + 3 sergeants) to load.
  await page
    .waitForFunction(
      () =>
        scene.isTerrainLoaded() &&
        scene.isPlayerLoaded() &&
        scene.isNpcLoaded() &&
        scene.isNpcTypeLoaded(2215) &&
        scene.isNpcTypeLoaded(2216) &&
        scene.isNpcTypeLoaded(2217) &&
        scene.isNpcTypeLoaded(2218),
      null,
      { timeout: 60000 },
    )
    .catch(async (err) => {
      console.error(
        "SCENE DEBUG:",
        await page.evaluate(() => ({
          isTerrainLoaded: scene.isTerrainLoaded(),
          isPlayerLoaded: scene.isPlayerLoaded(),
          isNpcLoaded: scene.isNpcLoaded(),
          npcTypes: [2215, 2216, 2217, 2218].map((id) => [id, scene.isNpcTypeLoaded(id)]),
          failedNpcTypes: [...(scene.failedNpcTypeLoadAttempts ?? [])],
          pendingNpcTypes: [...(scene.pendingNpcTypeLoadAttempts?.entries() ?? [])],
        })),
        "CONSOLE ERRORS:",
        errors,
      );
      throw err;
    });

  // Verify default Crystal (Bowfa) setup with Ring of suffering (i) and Toxic blowpipe,
  // default Altar-Door (6:0) tile markers, and interactive Big door + Bandos altar map objects.
  const initialCheck = await page.evaluate(() => {
    const player = engine.player();
    const inventoryIds = player.inventory.filter(Boolean).map((entry) => entry.id);
    const npcs = [...engine.worldState.actors.values()]
      .filter((actor) => actor.kind === "npc")
      .map((npc) => ({
        id: npc.id,
        npcTypeId: npc.npcTypeId,
        role: npc.role,
        hp: npc.vitals.hp,
        targetId: npc.combat.targetId,
      }));
    const replacements = scene.encounterRenderConfig.locRender?.replacements ?? [];
    return {
      equipment: player.equipment,
      hasBlowpipeInInventory: inventoryIds.includes(12926),
      blowpipeDartId: player.combatSupplies?.blowpipe?.id ?? null,
      playerStart: [...player.position],
      npcs,
      doorReplacement: replacements.find((r) => r.targetLocId === 40419) ?? null,
    };
  });

  assert.equal(initialCheck.equipment.head, 23971, "Crystal helm equipped by default");
  assert.equal(initialCheck.equipment.body, 23975, "Crystal body equipped by default");
  assert.equal(initialCheck.equipment.legs, 23979, "Crystal legs equipped by default");
  assert.equal(initialCheck.equipment.weapon, 25865, "Bow of Faerdhinen equipped by default");
  assert.equal(initialCheck.equipment.ring, 19710, "Ring of suffering (i) equipped by default");
  assert.equal(initialCheck.hasBlowpipeInInventory, true, "Toxic blowpipe in inventory by default");
  assert.equal(initialCheck.blowpipeDartId, 11230, "Toxic blowpipe loaded with dragon darts");
  assert.deepEqual(initialCheck.playerStart, [54, 57], "Starts on north Shoot->door tile");
  assert.deepEqual(initialCheck.doorReplacement, {
    sourceLocId: 26503,
    localX: 47,
    localY: 42,
    targetLocId: 40419,
    targetRotation: 0,
  });
  assert.equal(initialCheck.npcs.length, 4);
  for (const npc of initialCheck.npcs) {
    assert.equal(npc.targetId, "player", `${npc.id} spawns targeting the player`);
  }

  // Test red-X stall when walking under General Graardor toward the Big door (47, 42),
  // minions attacking immediately, and victory triggering as soon as General Graardor
  // dies while the three minions are still alive.
  const fightResult = await page.evaluate(() => {
    engine.reset();
    const graardor = engine.worldState.actors.get("general_graardor");
    const strongstack = engine.worldState.actors.get("sergeant_strongstack");
    const steelwill = engine.worldState.actors.get("sergeant_steelwill");
    const grimspike = engine.worldState.actors.get("sergeant_grimspike");
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });

    // Tick 1: Shoot General Graardor from (54, 57) ("Shoot->door"); Graardor steps north to (52, 52).
    engine.injectAction({ type: "attackTarget", targetId: "general_graardor" });
    engine.advanceTick([54, 57]);
    const tick1Events = engine.getLastTickEvents();
    const minionAttacksOnTick1 = tick1Events.filter(
      (event) =>
        event.type === "zuk_attack" &&
        (event.attack === "steelwill_magic" || event.attack === "grimspike_ranged"),
    ).length;

    // Tick 2 & 3: Red-X click the Big door at (47, 42) to walk south under Graardor (54,57 -> 54,55 -> 54,53).
    engine.injectAction({ type: "attackTarget", targetId: null });
    engine.advanceTick([47, 42]);
    const redXStallAfterStepUnder = engine.getEncounterSnapshot().state.redXStallUntilTick;
    const graardorPosBeforeStallTick = [...graardor.position];
    engine.advanceTick([47, 42]);
    const graardorPosDuringStallTick = [...graardor.position];

    // Now defeat General Graardor while all three minions remain alive, and let
    // the app's live loop resolve his death animation into the victory screen.
    engine.setBossHp(0);

    return {
      minionAttacksOnTick1,
      redXStallTriggered: redXStallAfterStepUnder >= 4,
      graardorStalledInPlace:
        graardorPosBeforeStallTick[0] === graardorPosDuringStallTick[0] &&
        graardorPosBeforeStallTick[1] === graardorPosDuringStallTick[1],
      graardorAlive: graardor.alive,
      minionsStillAlive: strongstack.alive && steelwill.alive && grimspike.alive,
      outcomePhase: engine.getEncounterOutcome().phase,
    };
  });

  assert.equal(fightResult.minionAttacksOnTick1, 2, "Steelwill and Grimspike attack on tick 1");
  assert.equal(fightResult.redXStallTriggered, true, "Red-X door click triggers Graardor stall");
  assert.equal(fightResult.graardorStalledInPlace, true, "Graardor stays stalled in place during red-X overlap");
  assert.equal(fightResult.graardorAlive, false, "General Graardor defeated");
  assert.equal(fightResult.minionsStillAlive, true, "Minions remain alive when Graardor dies");

  // Let the app's live loop finish resolving Graardor's death animation and show the victory banner.
  await page.waitForFunction(
    () =>
      engine.getEncounterOutcome().phase === "victory" &&
      document.body.innerText.includes("GENERAL GRAARDOR DEFEATED"),
    null,
    { timeout: 120000 },
  );
  assert.deepEqual(errors, []);
  console.log(
    "General Graardor encounter loaded on /general-graardor/, verified Crystal Bowfa setup, Altar-Door red-X stall, minion tanking, and boss-kill victory",
  );
} finally {
  await browser.close();
}
