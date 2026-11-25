import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const b = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 850 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.stack));
  p.on("console", (m) => {
    if (/Empty container|Failed to load sound|Bzip2Unavailable/.test(m.text()))
      console.log(m.text().slice(0, 160));
  });
  await p.addInitScript(() => {
    window.testEffects = new Set();
    window.testSounds = new Set();
    window.testRoarSources = [];
    window.testSoundIds = new WeakMap();
  });
  for (const [file, from, to] of [
    ["native.js", "scene.setEncounterRenderConfig(renderConfig);", "scene.setEncounterRenderConfig(renderConfig);window.testScene=scene;"],
    [
      "engine/SimulationEngine.js",
      "this.encounter = options.encounter;",
      "this.encounter = options.encounter;if(this.encounter.kind==='zebak')window.testEngine=this;",
    ],
    [
      "rendering.js",
      'upsert(e) {\n    const a = e.instanceId ?? "spotanim-"',
      'upsert(e) {\n    window.testEffects.add(e.spotAnimId); const a = e.instanceId ?? "spotanim-"',
    ],
    [
      "application.js",
      "this.aN(\n      {\n        buffer: h8,",
      "window.testSounds.add(h2);this.aN(\n      {\n        buffer: h8,",
    ],
  ])
    await p.route("**/" + file + "*", async (r) => {
      const res = await r.fetch(),
        body = (await res.text()).replaceAll("\r\n", "\n");
      assert.ok(body.includes(from));
      await r.fulfill({ response: res, body: body.replace(from, to)
        .replace("const { x: n, y: s } = QK(current61, e.clientX, e.clientY);", `const { x: n, y: s } = QK(current61, e.clientX, e.clientY);
          window.projectTestTile = tile => { const pos = Dt.current.tileToScreen(tile); return eq(current61,pos.x,pos.y); };`)
        .replace("this.bufferCache.set(h2, h8);", "this.bufferCache.set(h2, h8);window.testSoundIds.set(h8,h2);")
        .replace("h6.start(h3, h2.offset);", `h6.start(h3, h2.offset);
          const soundId = window.testSoundIds.get(h6.buffer);
          if ([5860,5836,5845,5904,5838,5851,5829,5881,5888,5863].includes(soundId))
            window.testRoarSources.push({id:soundId, when:h3, gain:h7.gain.value, channel:h2.channel});`) });
    });
  await p.goto("http://127.0.0.1:8791/zebak/");
  await p.waitForFunction(() => document.body.innerText.includes("580/580"));
  await p.waitForTimeout(2100);
  await p.mouse.click(640, 425);
  const collision = await p.evaluate(async () => {
    let c = new (await import("/assets/player.js")).CacheManager();
    await c.Ad();
    const a = await c.ld({ mapX: 61, mapY: 84, seedX: 29, seedY: 32 });
    return [
      a.walkableTiles.size,
      ...[
        [29, 32],
        [24, 36],
        [19, 36],
        [22, 42],
        [24, 23],
      ].map((p) => a.walkableTiles.has(p.join(","))),
    ];
  });
  assert.deepEqual(collision, [296, true, true, false, false, false]);
  await p.waitForFunction(() => testSounds.has(5884) && ((testEffects.has(2185) && testSounds.has(5819) && testSounds.has(5896)) || (testEffects.has(2186) && testSounds.has(5823) && testSounds.has(5878))));
  const [effects, sounds] = await p.evaluate(() => [
    [...testEffects],
    [...testSounds],
  ]);
  assert.ok(effects.includes(2176) || effects.includes(2178), "missing launch");
  assert.ok(effects.includes(2185) || effects.includes(2186), "missing split");
  assert.ok(
    sounds.includes(5919) || sounds.includes(5862) || sounds.includes(5906),
    "missing animation audio",
  );
  console.log("rendered and played", effects, sounds);
  await p.evaluate(() => {
    const e = testEngine;
    e.setMechanicsConfig({ ...e.mechanicsConfig, infiniteHealth: true });
    e.encounter.phases.next = "roar";
    e.setBossHp(492);
    for (let i = 0; !e.encounter.phases.active && i < 12; i++)
      e.advanceTick(e.player().position);
  });
  await p.waitForFunction(() => testEngine.encounter.phases.of("jug").length === 7);
  await p.waitForFunction(() => [...testScene.sceneObjectRenderer.objects.values()].some(
    pool => [45572,45573,45576].includes(pool.spec.data?.locId) && pool.frameCommands.length > 0));
  const firstPhase = await p.evaluate(() => {
    const phases = testEngine.encounter.phases;
    return {start: phases.active.start, kind: phases.active.kind, dir: phases.active.direction,
      acid: phases.acid.size, jugs: phases.of("jug").length};
  });
  await p.waitForTimeout(350);
  await p.screenshot({ path: "evidence/zebak-roar-native.png" });
  const target = await p.evaluate(() => {
    const pos = testEngine.player().position;
    const distance = jug => Math.max(...jug.actor.position.map((v,i) => Math.abs(v-pos[i])));
    const [jug] = testEngine.encounter.phases.of("jug").sort((a,b) => distance(a) - distance(b));
    const matrix = testScene.npcInstanceManager.instanceRegistry.get(jug.actor.id).currentModelMatrix;
    return {...projectTestTile({x:matrix[12], y:matrix[13], level:matrix[14]+0.3}), position:jug.actor.position};
  });
  await p.mouse.click(target.clientX, target.clientY, { button: "right" });
  console.log(
    "jug menu",
    (await p.locator("body").innerText())
      .split("\n")
      .filter((x) => /Push|Pull|Hit Jug|Choose Option/.test(x))
      .slice(-8),
  );
  const box = await p.getByText("Hit", { exact: true }).last().boundingBox();
  const hitFrom = await p.evaluate(() => [...testEngine.player().position]);
  const acidAtJugs = await p.evaluate(() => {
    const phase = testEngine.encounter.phases;
    return phase.of("jug").map(({actor}) => {
      phase.depositAcid([...actor.position]);
      return [...actor.position];
    });
  });
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForFunction(
    () => testEngine.encounter.phases.of("jug").length === 6,
    {},
    { timeout: 5000 },
  );
  await p.waitForFunction(() => testEffects.has(2192) && testEffects.has(2193) && testEffects.has(95));
  assert.equal(await p.evaluate(() => testSounds.has(5865)), false);
  await p.waitForTimeout(300);
  await p.screenshot({
    path: "evidence/zebak-jug-water.png",
    clip: {x: 245, y: 235, width: 350, height: 300},
  });
  await p.waitForTimeout(700);
  assert.deepEqual(await p.evaluate(() => testEngine.player().position), hitFrom, "ranged jug hit moved the player");
  const remainingAcid = await p.evaluate(tiles => tiles.filter(tile => testEngine.encounter.phases.acid.has(tile.join(","))), acidAtJugs);
  const outsideSplash = acidAtJugs.filter(tile => tile.some((v,i) => Math.abs(v-target.position[i]) > 2));
  assert.deepEqual(remainingAcid, outsideSplash);
  const rollingJug = await p.evaluate(() => {
    const phases = testEngine.encounter.phases;
    const jug = phases.of("jug")[0];
    const rock = phases.of("rock")[0];
    jug.actor.position = [rock.actor.position[0] - 1, rock.actor.position[1]];
    jug.step = [1, 0];
    jug.remaining = 1;
    return jug.actor.id;
  });
  await p.waitForFunction(id => !testEngine.encounter.phases.actors.has(id), rollingJug);
  await p.waitForFunction(() => testEffects.has(2184) && testSounds.has(5829) && testSounds.has(5836) && testSounds.has(5838));
  await p.waitForFunction(() => {
    const phase = testEngine.encounter.phases.active;
    return phase?.kind === "roar" && testEngine.worldState.tick - phase.start >= 38;
  });
  await p.screenshot({path: "evidence/zebak-roar-dust.png"});
  await p.waitForFunction(() => [5829, 5881, 5888].every(id => testSounds.has(id)));
  assert.deepEqual(await p.evaluate(() => [5865, 5869].filter(id => testSounds.has(id))), []);
  const roarFrames = [[5860,16],[5836,20],[5845,32],[5904,69],[5838,70],
    [5851,79],[5829,90],[5881,150],[5888,210],[5863,260]];
  await p.waitForFunction(() => {
    const roar = testRoarSources.find(source => source.id === 5836);
    return roar && testRoarSources.some(source => source.id === 5863 && source.when > roar.when + 4);
  });
  const sources = await p.evaluate(() => testRoarSources);
  const start = sources.find(cue => cue.id === 5836).when - 0.4;
  for (const [id,frame] of roarFrames) {
    const cues = sources.filter(s => s.id === id && Math.abs(s.when - start - frame * 0.02) < 0.12);
    assert.equal(cues.length, 1, "Roar sound " + id + " must play once at frame " + frame);
    assert.equal(cues[0].gain, 1);
    assert.equal(cues[0].channel, "sfx");
  }
  const trace = await p.evaluate(firstPhase => {
    const e = window.testEngine;
    e.setMechanicsConfig({ ...e.mechanicsConfig, infiniteHealth: true });
    e.setBossHp(228);
    let jugsBeforeRoar;
    const rows = [firstPhase], roarDamage = [],
      seen = new Set([firstPhase.start]);
    for (let n = 0; n < 320; n++) {
      e.advanceTick(e.player().position);
      const enc = e.encounter,
        phase = enc.phases.active;
      if (phase?.secondRoar) {
        const age = e.worldState.tick - phase.start;
        if (age === 31) jugsBeforeRoar = enc.phases.of("jug").length;
        if ([33,34,35,37].includes(age)) {
          roarDamage.push({age, rocks: enc.phases.of("rock").map(r => r.actor.vitals.hp),
            brokenJugs: enc.phases.of("broken-jug").map(j => j.actor.vitals.hp),
            bursts: enc.phases.splashes.filter(splash => splash.tick === e.worldState.tick).length});
        }
      }
      if (phase && !seen.has(phase.start)) {
        seen.add(phase.start);
        rows.push({
          kind: phase.kind,
          dir: phase.direction,
          acid: enc.phases.acid.size,
          jugs: enc.phases.of("jug").length,
        });
      }
    }
    e.setBossHp(144);
    e.advanceTick(e.player().position);
    return {
      rows, roarDamage, jugsBeforeRoar,
      enrage: e.encounter.phases.enraged,
      queue: e.encounter.phases.queue,
    };
  }, firstPhase);
  const extra = await p.evaluate(async () => {
    const { ZebakPhases } = await import("/toa/zebak/phases.js");
    const phases = new ZebakPhases(
      () => 0,
      () => null,
      () => {},
    );
    phases.observe({ vitals: { hp: 400, maxHp: 580 } });
    const before = phases.queue.length;
    phases.observe({ vitals: { hp: 144, maxHp: 580 } });
    const e = testEngine,
      enc = e.encounter,
      player = e.player();
    for (let tick = 0; tick < 12; tick++) e.advanceTick([19, 36]);
    const blocked = player.position.join(",") !== "19,36";
    e.teleportPlayer([29, 32], player.facing);
    enc.configureRunStart({
      blood: true,
      clouds: true,
      spray: true,
      upset: true,
      path: "2",
    });
    const random = enc.random;
    enc.random = () => 0;
    enc.autoCount = 7;
    enc.bloodSpellIndex = 0;
    enc.attackTick = 0;
    e.advanceTick(player.position);
    for (let tick = 0; tick < 3; tick++) e.advanceTick(player.position);
    const clouds = enc.phases.of("cloud").length;
    enc.random = () => 0.9;
    enc.autoCount = 7;
    enc.bloodSpellIndex = 1;
    enc.attackTick = 0;
    e.advanceTick(player.position);
    const barrage = Math.min(...enc.pendingBarrages) - e.worldState.tick;
    let cloudMotion = false;
    for (let n = 0; n < barrage; n++) {
      e.advanceTick(player.position);
      cloudMotion ||= enc.phases.of("cloud").some(({actor}) =>
        actor.npcTypeId === 11743 && actor.size === 1 && actor.isMoving &&
        actor.combat.animations.walk === 8101 && actor.movementPath.length === 1);
    }
    enc.random = random;
    return {
      before,
      after: phases.queue.length,
      blocked,
      clouds,
      cloudMotion,
      barrage,
      resolved: enc.pendingBarrages.size === 0,
    };
  });
  assert.deepEqual(extra, {
    before: 2,
    after: 0,
    blocked: true,
    clouds: 3,
    cloudMotion: true,
    barrage: 3,
    resolved: true,
  });
  console.log(extra);
  console.log(JSON.stringify(trace));
  assert.ok(trace.jugsBeforeRoar >= 2);
  assert.deepEqual(trace.roarDamage, [
    // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, the roar animated on tick 572, 29 ticks after its
    // special started): 50 on the boulders and the jugs broken on ticks 576, 578 and 580, its 4th, 6th and 8th.
    {age:33, rocks:[100,100,100], brokenJugs:Array(trace.jugsBeforeRoar).fill(0), bursts:0},
    {age:34, rocks:[100,100,100], brokenJugs:[], bursts:trace.jugsBeforeRoar},
    {age:35, rocks:[50,50,50], brokenJugs:[], bursts:0},
    {age:37, rocks:[0,0,0], brokenJugs:[], bursts:0},
  ]);
  assert.equal(trace.rows.length, 4);
  assert.deepEqual(
    trace.rows.map((r) => r.kind),
    ["roar", "waves", "roar", "waves"],
  );
  assert.deepEqual(
    trace.rows.filter((x) => x.kind === "waves").map((x) => x.dir),
    [1, -1],
  );
  assert.ok(trace.enrage);
  assert.deepEqual(trace.queue, []);
  assert.deepEqual(errors, []);
} finally {
  await b.close();
}
