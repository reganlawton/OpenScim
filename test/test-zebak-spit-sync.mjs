import assert from "node:assert/strict";
import {chromium} from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({viewport: {width: 1000, height: 740}});
  await page.addInitScript(() => {
    window.sampleSpit = (clip, sample, position, velocity) => {
      const shot = window.shot;
      if (!shot || clip.startCycle < shot.after) return;
      const age = sample.cycle - clip.startCycle;
      if (clip.spotAnimId === shot.intact && !shot.jaw && age < 4) {
        const head = scene.npcInstanceManager.instanceRegistry.get("primary-npc");
        const pose = head.animController.Fw();
        if (pose.seqId !== shot.sequence) return;
        const vertex = i => {
          const m = head.currentModelMatrix;
          return [0,1,2].map(j => m[j]*head.posedVerticesX[i] + m[4+j]*head.posedVerticesY[i] +
            m[8+j]*head.posedVerticesZ[i] + m[12+j]);
        };
        shot.jaw = {frame: pose.currentFrameIndex, age, upper: vertex(980), lower: vertex(173),
          source: [sample.source.worldX, sample.source.worldY,
            (sample.source.heightOffset - sample.source.resolvedOsrsZ) / 128]};
        shot.split = clip.endCycleExclusive;
      }
      if (clip.spotAnimId !== shot.fragment || Math.abs(clip.startCycle - shot.split) > 1 || !shot.jaw) return;
      const fraction = age / (clip.endCycleExclusive - clip.startCycle);
      if (!shot.moved && fraction > 0.15 && fraction < 0.4) {
        shot.moved = [sample.target.worldX, sample.target.worldY];
        queueMicrotask(() => engine.teleportPlayer([32,35], engine.player().facing));
      }
      if (fraction > 0.94) {
        const remaining = clip.endCycleExclusive - sample.cycle;
        shot.endpoint = [position.x + remaining * velocity.x, position.y + remaining * velocity.y];
        shot.finalTarget = [sample.target.worldX, sample.target.worldY];
      }
    };
  });
  for (const [pattern, marker, extra] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if(options.encounter.kind==='zebak') window.engine=this;"],
    ["**/toa/zebak/native.js*", "scene.setEncounterRenderConfig(renderConfig);", "window.scene=scene;"],
    ["**/rendering.js*", "const { position: position, velocity: velocity } = t.motion;",
      "window.sampleSpit(this.config,a,position,velocity);"],
  ]) await page.route(pattern, async route => {
    const response = await route.fetch({maxRetries:3});
    const body = await response.text();
    assert.ok(body.includes(marker));
    await route.fulfill({response, body:body.replace(marker,marker+extra)});
  });
  await page.goto("http://127.0.0.1:8791/zebak/");
  await page.waitForFunction(() => document.body.innerText.includes("580/580"));
  await page.mouse.click(500,370);
  await page.waitForFunction(() => engine.worldState.tick > 0);
  for (const enrage of [false,true]) for (const path of [0,4]) {
    const magic = path === 4;
    await page.evaluate(({enrage,path,magic}) => {
      engine.setMechanicsConfig({...engine.mechanicsConfig,infiniteHealth:true});
      engine.teleportPlayer([28,30],engine.player().facing);
      const enc = engine.encounter;
      enc.configureRunStart({path});
      enc.random = () => magic ? 0.2 : 0.8;
      if (enrage && !enc.phases.enraged) engine.setBossHp(100);
      window.shot = {
        // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 618-705): at path level 0 the enraged
        // spit is the normal animation and pot; the ranged pot's one piece is 2187 (e.g. tick 116).
        intact: magic ? (enrage && path >= 4 ? 2177 : 2176) : (enrage && path >= 4 ? 2179 : 2178),
        fragment: magic ? 2181 : 2187, sequence: enrage && path >= 4 ? 9626 : 9624,
        after: (engine.worldState.tick + 4) * 30,
      };
    },{enrage,path,magic});
    await page.waitForFunction(() => shot.endpoint && shot.moved, null, {timeout: 20000});
    const {jaw,moved,endpoint,finalTarget} = await page.evaluate(() => shot);
    const [x,y,z] = jaw.source;
    assert.ok(Math.abs(jaw.frame - (enrage && path >= 4 ? 32 : 66)) <= 6, JSON.stringify(jaw));
    if (path >= 4) {
      assert.ok(jaw.upper[2] - jaw.lower[2] > 0.7 && z > jaw.lower[2] && z < jaw.upper[2], JSON.stringify(jaw));
      assert.ok(Math.hypot(x-(jaw.upper[0]+jaw.lower[0])/2, y-(jaw.upper[1]+jaw.lower[1])/2) < 0.7);
    } else {
      // OBS (same recording, all 77 spits): the pot starts over the tile 7 east and 4 north of his south-west tile.
      assert.ok(Math.hypot(x - 21.5, y - 32.5) < 0.05, JSON.stringify(jaw));
    }
    assert.deepEqual(moved,[28.5,30.5]);
    assert.deepEqual(finalTarget,[32.5,35.5]);
    assert.ok(Math.hypot(endpoint[0]-32.5,endpoint[1]-35.5) < 0.05, JSON.stringify(endpoint));
    console.log({path,enrage,releaseFrame:jaw.frame,range:Math.hypot(29.5-x,32.5-y).toFixed(2),endpoint});
  }
} finally {
  await browser.close();
}
