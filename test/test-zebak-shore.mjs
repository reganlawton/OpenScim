import assert from "node:assert/strict";
import {chromium} from "playwright-core";

const browser = await chromium.launch({
  executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args:["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({viewport:{width:1360,height:900}});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const [file, marker, probe] of [
    ["engine/SimulationEngine.js", "this.encounter = options.encounter;",
      "if (this.encounter.kind === 'zebak') window.engine = this;"],
    ["native.js", "scene.setEncounterRenderConfig(renderConfig);", "window.scene = scene;"],
    ["application.js", "this.bufferCache.set(h2, h8);", "window.soundIds.set(h8,h2);"],
  ]) {
    await page.route("**/" + file + "*", async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes(marker));
      await route.fulfill({response,body:source.replace(marker, marker + probe)});
    });
  }
  await page.addInitScript(() => {
    window.soundIds = new WeakMap();
    window.starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, ...args) {
      const result = start.call(this,when,...args);
      const id = soundIds.get(this.buffer);
      if (id === 5882 || id === 5843 || id === 1678) starts.push({id,when,context:this.context});
      return result;
    };
  });
  for (const direction of [1,-1]) {
    await page.goto("http://127.0.0.1:8791/zebak/");
    await page.waitForFunction(() => document.body.innerText.includes("580/580"));
    await page.mouse.click(640,425);
    await page.evaluate(direction => {
      engine.setMechanicsConfig({...engine.mechanicsConfig,infiniteHealth:true});
      engine.encounter.phases.count.waves = direction > 0 ? 0 : 1;
      engine.encounter.phases.next = "waves";
      engine.setBossHp(492);
    },direction);
    const visual = await page.waitForFunction(() => {
      const effects = [...scene.spotAnimRenderer.activeInstances.values()].filter(fx => fx.spotAnimId === 68);
      const front = engine.encounter.phases.waveFronts[0];
      const age = front && scene.primaryCycle - front.startTick * 30;
      return effects.length === 7 && front && age >= 6 && age < 20 &&
        [...scene.spotAnimRenderer.visibleParts.keys()].some(key => key.startsWith("spotanim-68-frame-")) &&
        {tick:engine.worldState.tick,start:front.startTick,direction:front.direction};
    },null,{polling:"raf"});
    const frame = await visual.jsonValue();
    assert.equal(frame.tick,frame.start);
    assert.equal(frame.direction,direction);
    if (direction === 1) {
      await page.screenshot({path:"evidence/zebak-shore-splash.png"});
    }
    const played = await page.waitForFunction(() => {
      const rocks = starts.find(s => s.id === 5882);
      // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 155, 307, 427): 1678 with the sweep, 5843 200 cycles on.
      const splash = starts.find(s => s.id === 5843 && s.context.state === "running" && s.context.currentTime >= s.when);
      const thud = starts.find(s => s.id === 1678);
      return rocks && thud && splash && Math.abs(thud.when - rocks.when) < 0.08 && (splash.when - rocks.when);
    });
    assert.ok(Math.abs(await played.jsonValue() - 4) < 0.08);
    console.log("Shore", direction, "showed seven splash effects on the first crest and played the impact at four seconds.");
  }
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
}
