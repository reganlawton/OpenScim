// Duke Sucellus loads on his route, is drawn from the trimmed cache (his
// asylum and his model), sleeps until he is clicked on, gazes with the eye in
// his mouth and the overlay on the screen, spits gas, and dies into the
// victory screen.
// The mechanics themselves are digested by the determinism harness
// (tools/determinism/scenarios/duke-sucellus.mjs).
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
  // A model or an animation missing from the trimmed cache is logged, not thrown.
  page.on("console", (message) => message.text().includes("Empty container") && errors.push(message.text()));
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'duke_sucellus') window.engine = this;"],
    ["**/encounters/shared/buildScene.js*", "const scene = new Scene();", "window.scene = scene;"],
  ]) {
    await page.route(path, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({ response, body: body.replace(marker, marker + probe) });
    });
  }

  await page.goto(origin + "/duke-sucellus/");
  await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  assert.equal(new URL(page.url()).pathname, "/duke-sucellus/");
  await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcLoaded() && scene.npcInstanceManager.instanceRegistry.size > 0, null, { timeout: 60000 });
  await page.waitForFunction(() => scene.isNpcTypeLoaded(12191) && scene.isNpcTypeLoaded(12167), null, { timeout: 60000 });

  // The pillars' fades into black are drawn in front of the stone they share a
  // plane with: the plain pillar (48738) and the one with salt (48751).
  await page.waitForFunction(() => scene.isLocsLoaded(), null, { timeout: 60000 });
  const raised = await page.evaluate(() => {
    const { loader } = scene.locRenderer.recipe;
    return [48738, 48751, 47013].map((modelId) => {
      const model = loader.modelLoader.getModel(modelId);
      return Array.from({ length: model.faceCount }, (_, face) => face).filter((face) => model.faceBias[face] === 1).length;
    });
  });
  assert.deepEqual(raised, [314, 314, 0]);

  // Clicked on once from where the player starts, they run up to him and he is
  // roused as they get there; a staff and a thrall, which reach him from afar, do
  // not hurt him asleep. He wakes two ticks after, can be attacked from the next
  // and attacks at the fifth.
  const loaded = async () => {
    await page.waitForFunction(() => window.engine && window.scene, null, { timeout: 60000 });
    await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
    await page.waitForFunction(() => scene.isTerrainLoaded() && scene.isPlayerLoaded() && scene.isNpcTypeLoaded(12191) && scene.isNpcTypeLoaded(12167), null, { timeout: 60000 });
  };
  const rouse = (weapon) => page.evaluate((weapon) => {
    const player = engine.player(), duke = engine.worldState.getNpc("duke-sucellus");
    const wakeTick = () => engine.getEncounterSnapshot().state.wakeTick;
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    player.equipment.weapon = weapon;
    delete player.equipment.shield;
    player.thrall = { id: "thrall", spellName: "Resurrect Greater Skeleton", npcTypeId: 10883, size: 1, position: [31, 47], previousPosition: [31, 47], facing: 0, spawnTick: 0, expiresTick: 100000, nextAttackTick: 0 };
    const from = player.position.join(), began = engine.worldState.tick;
    let roused = null, tile = null, hp = null, attacked = null, struck = null;
    for (let tick = 0; tick < 25; tick++) {
      if (tick === 0 || roused !== null) engine.queueAttackTarget("duke-sucellus");
      engine.advanceTick(player.position);
      const now = engine.worldState.tick;
      if (roused === null && wakeTick() !== null) [roused, tile] = [now, player.position.join()];
      if (now === wakeTick()) hp = duke.vitals.hp;
      if (attacked === null && engine.getPlayerAttackCooldown(player.id, now) > 0) attacked = now - roused;
      if (struck === null && engine.encounter.slams.length > 0) struck = now - roused;
    }
    return { from, ran: roused - began, tile, wakes: wakeTick() - roused, hp, attacked, struck };
  }, weapon);
  for (const weapon of [22325, 27275]) { // a scythe, a Tumeken's shadow
    assert.deepEqual(await rouse(weapon), { from: "31,40", ran: 6, tile: "31,51", wakes: 2, hp: 485, attacked: 3, struck: 7 }, `with weapon ${weapon}`);
    await page.reload();
    await loaded();
  }

  // A click that is taken back on the way leaves him asleep, the player walking
  // on to the row before him and to a diagonal.
  const left = await page.evaluate(() => {
    const player = engine.player();
    const walk = (position, ticks) => {
      for (let tick = 0; tick < ticks; tick++) engine.advanceTick(position);
      return player.position.join() + " " + engine.getEncounterSnapshot().state.wakeTick;
    };
    engine.queueAttackTarget("duke-sucellus");
    const before = walk(player.position, 3);
    engine.queueAttackTarget(null);
    const at = walk([31, 51], 10), diagonal = walk([27, 51], 10);
    return { before, at, diagonal };
  });
  assert.deepEqual(left, { before: "31,46 null", at: "31,51 null", diagonal: "27,51 null" });
  await page.reload();
  await loaded();

  // Asleep, however long the player stays, and drawn as the sleeping type.
  const drawnType = () => page.evaluate(() => [...scene.npcInstanceManager.instanceRegistry.values()].find((npc) => [12167, 12191].includes(npc.npcTypeId)).npcTypeId);
  const asleep = await page.evaluate(() => {
    for (let tick = 0; tick < 30; tick++) engine.advanceTick(engine.player().position);
    return { wakeTick: engine.getEncounterSnapshot().state.wakeTick, hp: engine.player().vitals.hp };
  });
  assert.deepEqual(asleep, { wakeTick: null, hp: 99 });
  assert.equal(await drawnType(), 12167);

  // A click on the middle of his body has the player run up to him and wake him,
  // with the sounds the game's server sends (audio.js): of the poison, and of the
  // icicles once he attacks.
  await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    const { engine: sounds } = scene.eventAudioPlayer, { play } = sounds;
    window.played = new Set();
    sounds.play = function (id, ...rest) {
      played.add(id);
      return play.call(this, id, ...rest);
    };
  });
  await page.mouse.click(640, 180);
  await page.waitForFunction(() => engine.getEncounterSnapshot().state.wakeTick !== null, null, { timeout: 20000 });
  assert.equal(await page.evaluate(() => engine.player().position.join()), "31,51");
  await page.waitForFunction(() => [...scene.npcInstanceManager.instanceRegistry.values()].some((npc) => npc.npcTypeId === 12191), null, { timeout: 20000 });
  await page.waitForFunction(() => [7249, 2707].every((id) => played.has(id)), null, { timeout: 20000 });

  // His eye (the faces of labels 94 to 108), which every animation hides but
  // the gaze: 253 is the most an animation hides a face.
  const eye = await page.evaluate(() => {
    const { modelAdapter } = [...scene.npcInstanceManager.instanceRegistry.values()].find((npc) => npc.npcTypeId === 12191);
    const { model } = modelAdapter;
    const faces = Array.from({ length: 15 }, (_, n) => [...(model.faceLabels[94 + n] ?? [])]).flat();
    const hidden = (clip, tick) => {
      modelAdapter.resetPose();
      modelAdapter.applySkeletal(clip.seq, clip.skeletalStart + tick);
      return faces.filter((face) => (model.faceAlphas[face] & 255) === 253).length;
    };
    const { idle, attackClips } = scene.npcInstanceManager.typeRegistry.get(12191).animationSet;
    return { faces: faces.length, idle: hidden(idle, 0), melee: hidden(attackClips.melee, 45), gaze: hidden(attackClips.gaze, 90) };
  });
  assert.deepEqual(eye, { faces: 442, idle: 442, melee: 442, gaze: 0 });

  // The overlay of his gaze, which the player stands in: ticked to just before
  // the gaze, which the application's own loop starts, with its sound, and draws,
  // coming and going with it.
  const due = await page.evaluate(() => {
    for (let tick = 0; tick < 100; tick++) {
      if (engine.encounter.autos === 5 && engine.worldState.getNpc("duke-sucellus").combat.nextActionTick - engine.worldState.tick <= 2) return !engine.getEncounterSnapshot().state.gaze;
      engine.advanceTick(engine.player().position);
    }
    return false;
  });
  assert.equal(due, true);
  await page.waitForFunction(() => document.querySelector(".scene-viewport > .duke-sight"), null, { timeout: 30000 });
  // The tint comes all the way and is gone before the eye is, whose lens is
  // some 104 pixels across (290 units at 512 / 1399) in a view 605 high.
  const overlay = await page.evaluate(() => new Promise((resolve) => {
    const tints = [];
    let lens = 0;
    const copy = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const step = () => {
      const element = document.querySelector(".duke-sight");
      if (!element && tints.length > 0) return resolve({ most: Math.max(...tints), last: tints.at(-1), lens, viewHeight: document.querySelector(".scene-viewport").clientHeight });
      if (element) {
        tints.push(Number(element.querySelector(".duke-sight__tint").style.opacity));
        const eye = element.querySelector("canvas");
        if (tints.at(-1) > 0.8 && eye.width > 0) {
          Object.assign(copy.canvas, { width: eye.width, height: eye.height });
          copy.drawImage(eye, 0, 0);
          const row = copy.getImageData(0, Math.round(eye.height / 2) - 4, eye.width, 1).data;
          let left = eye.width, right = 0;
          for (let x = Math.round(eye.width / 2) - 90; x < eye.width / 2 + 90; x++) if (row[x * 4 + 3] > 40) [left, right] = [Math.min(left, x), Math.max(right, x)];
          lens = Math.max(lens, ((right - left) * eye.clientWidth) / eye.width);
        }
      }
      requestAnimationFrame(step);
    };
    step();
  }));
  assert.equal(await page.evaluate(() => played.has(7215)), true, "the gaze is heard");
  assert.ok(overlay.most > 0.9, `the tint came to ${overlay.most}`);
  assert.equal(overlay.last, 0, "the tint goes before the eye");
  const lens = overlay.lens / (overlay.viewHeight / 605);
  assert.ok(lens > 94 && lens < 114, `the eye's lens is ${overlay.lens} across in a view ${overlay.viewHeight} high`);

  // As recorded (OBS 11/24 in encounter.js). The overlay is up for 6 ticks,
  // behind a pillar too; a gaze that finds the player hits 5 ticks in, and one
  // that does not says so at 4.
  const gazes = await page.evaluate(() => {
    const state = () => engine.getEncounterSnapshot().state;
    const through = (position) => {
      for (let tick = 0; tick < 10 && state().gaze; tick++) engine.advanceTick(position);
      for (let tick = 0; tick < 100 && !state().gaze; tick++) engine.advanceTick(position);
      const start = engine.worldState.tick, from = engine.damageHistory.length;
      let open = 0;
      const avoided = [];
      for (let tick = 0; tick < 8; tick++) {
        if (state().sight !== null) open++;
        if (engine.getLastTickEvents().some((event) => event.gazeAvoided)) avoided.push(tick);
        engine.advanceTick(position);
      }
      return { open, avoided, hits: engine.damageHistory.slice(from).filter((hit) => hit.source === "Duke Sucellus' gaze").map((hit) => hit.tick - start) };
    };
    engine.queueAttackTarget(null);
    return { before: through([31, 44]), behind: through([27, 51]) };
  });
  assert.deepEqual(gazes, { before: { open: 6, avoided: [], hits: [5] }, behind: { open: 6, avoided: [4], hits: [] } });

  // The slam lands on whoever is in the row before him by then, wherever they
  // were when he struck, and on no one on a diagonal.
  const slams = await page.evaluate(() => {
    const fight = (struck, then) => {
      let strikes = 0, landed = 0;
      for (let tick = 0; tick < 120; tick++) {
        const due = engine.encounter.slams.length;
        engine.advanceTick(struck);
        if (engine.encounter.slams.length === due) continue;
        const from = engine.damageHistory.length;
        engine.advanceTick(then);
        engine.advanceTick(then);
        strikes++;
        if (engine.damageHistory.slice(from).some((hit) => hit.source === "Duke Sucellus' slam")) landed++;
      }
      return strikes < 5 ? "too few strikes: " + strikes : landed === strikes ? "all" : landed === 0 ? "none" : landed + " of " + strikes;
    };
    const diagonal = [27, 51], row = [28, 51];
    return { row: fight(row, row), intoRow: fight(diagonal, row), outOfRow: fight(row, diagonal), diagonal: fight(diagonal, diagonal) };
  });
  assert.deepEqual(slams, { row: "all", intoRow: "all", outOfRow: "none", diagonal: "none" });

  // Enraged at 126 hitpoints and not at 130, and the gas that is out for 16
  // ticks, 14 once he is.
  const enrage = await page.evaluate(() => {
    const fight = (hp) => {
      engine.setBossHp(hp);
      const strikes = [], lives = new Set();
      for (let tick = 0; tick < 120; tick++) {
        const due = engine.encounter.slams.length;
        engine.advanceTick([27, 51]);
        if (engine.encounter.slams.length > due) strikes.push(engine.worldState.tick);
        for (const cloud of engine.getEncounterSnapshot().state.gas) if (tick > 40) lives.add(cloud.endTick - cloud.riseTick);
      }
      return { attackTicks: Math.min(...strikes.slice(1).map((tick, n) => tick - strikes[n]).slice(2)), lives: [...lives].sort() };
    };
    return { 485: fight(485), 130: fight(130), 126: fight(126) };
  });
  // Below half his hitpoints a second spit comes 3 ticks later, at the same vent
  // for a player who has not moved, and its gas goes a tick later.
  assert.deepEqual(enrage, { 485: { attackTicks: 5, lives: [16] }, 130: { attackTicks: 5, lives: [16, 17] }, 126: { attackTicks: 4, lives: [14, 15] } });

  // A gaze that finds the player hits for 85 to 101.
  const gazeHits = await page.evaluate(() => {
    const from = engine.damageHistory.length;
    for (let tick = 0; tick < 500; tick++) engine.advanceTick([31, 44]);
    return engine.damageHistory.slice(from).filter((hit) => hit.source === "Duke Sucellus' gaze").map((hit) => hit.effectiveDamage);
  });
  assert.ok(gazeHits.length >= 8, `${gazeHits.length} gazes hit`);
  assert.ok(gazeHits.every((hit) => hit >= 85 && hit <= 101), `gazes hit for ${gazeHits}`);

  // Below half his hitpoints, the player standing in the room: ticked until
  // he has gazed and spat gas at a vent.
  const seen = await page.evaluate(() => {
    engine.setMechanicsConfig({ ...engine.mechanicsConfig, infiniteHealth: true });
    engine.setBossHp(200);
    const seen = { gaze: false, gas: false };
    for (let tick = 0; tick < 150 && !(seen.gaze && seen.gas); tick++) {
      engine.advanceTick(engine.player().position);
      const state = engine.getEncounterSnapshot().state;
      if (state.gaze) seen.gaze = true;
      if (state.gas.length) seen.gas = true;
    }
    return seen;
  });
  assert.deepEqual(seen, { gaze: true, gas: true });

  // Killed; the application's own loop plays his death and ends the fight.
  await page.evaluate(() => engine.setBossHp(0));
  await page.waitForFunction(() => engine.getEncounterOutcome().phase === "victory" && document.body.innerText.includes("DUKE SUCELLUS DEFEATED"), null, { timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log("Duke Sucellus loaded on /duke-sucellus/, was drawn, slept until the player was beside him, gazed with his overlay, spat gas and was won");
} finally {
  await browser.close();
}
