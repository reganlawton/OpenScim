import assert from "node:assert/strict";
import {chromium} from "playwright-core";

const browser = await chromium.launch({
  executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args:["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.soundIds = new WeakMap();
    window.starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, ...args) {
      const result = start.call(this, when, ...args);
      starts.push({id:soundIds.get(this.buffer), when, context:this.context});
      return result;
    };
  });
  for (const [file, marker, probe] of [
    ["engine/SimulationEngine.js", "this.encounter = options.encounter;",
      "if (this.encounter.kind === 'zebak') window.engine = this;"],
    ["application.js", "this.bufferCache.set(h2, h8);", "soundIds.set(h8,h2);"],
  ]) {
    await page.route("**/" + file + "*", async route => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({response,body:body.replace(marker, marker + probe)});
    });
  }
  await page.goto("http://127.0.0.1:8791/zebak/");
  await page.waitForFunction(() => document.body.innerText.includes("580/580"));
  // The crossbow and longbow effects come from the cache; their waveforms are
  // checked in test-sound-synth.mjs.
  const assets = await page.evaluate(async () => {
    const {soundEffectResponse} = await import("/audio/soundEffects.js");
    const cache = window.testCache = new (await import("/assets/player.js")).CacheManager();
    await cache.Ad();
    return Promise.all([2695,2700].map(async id => {
      const response = await soundEffectResponse(cache, id);
      if (!response.ok) throw Error("Missing weapon sound " + id);
      return (await response.arrayBuffer()).byteLength - 44;
    }));
  });
  assert.deepEqual(assets, [22050, 18742]);
  const frameSounds = await page.evaluate(() => {
    const cache = window.testCache;
    return [2192,2193,2449,95].map(id => {
      const seq = cache.spotAnimTypeLoader.load(id).sequenceId;
      return [id,seq,seq >= 0 ? [...(cache.animationSystem.loadSeqType(seq)?.frameSounds ?? [])] : []];
    });
  });
  assert.deepEqual(frameSounds, [[2192,9644,[]],[2193,659,[]],[2449,10221,[]],[95,660,[]]]);
  // The click that lets the page play sound is a click on the ground too: the
  // player walks. Were it to reach the engine on the tick of the first Hit, it
  // would take the player off the jug, so the walk is let end first.
  const tickBeforeClick = await page.evaluate(() => engine.worldState.tick);
  await page.mouse.click(640,425);
  await page.waitForFunction(tick => engine.worldState.tick >= tick + 2 && !engine.player().isMoving, tickBeforeClick);
  for (const [weapon, expected] of [[20997,[2700]],[9185,[2695]],[27275,[6410,6412,1460]]]) {
    const id = await page.evaluate(weapon => {
      const player = engine.player();
      engine.encounter.attackTick = engine.worldState.tick + 1000;
      engine.setMechanicsConfig({...engine.mechanicsConfig,infiniteHealth:true});
      player.equipment.weapon = weapon;
      const position = [player.position[0]+4, player.position[1]];
      const jug = engine.encounter.phases.spawn(engine.buildNpcDefinitionContext(), "jug", 11735, position);
      starts.length = 0;
      window.dispatchEvent(new CustomEvent("zebak-jug", {
        detail:{encounter:"zebak", action:"Hit", id:jug.actor.id},
      }));
      return jug.actor.id;
    },weapon);
    await page.waitForFunction(id => !engine.worldState.actors.has(id),id);
    await page.waitForFunction(ids => ids.every(id => starts.some(s => s.id === id &&
      s.context.state === "running" && s.context.currentTime >= s.when)),expected);
    await page.waitForTimeout(250);
    const sounds = await page.evaluate(() => starts.map(({id, when}) => ({id,when})));
    const played = sounds.map(s => s.id);
    assert.deepEqual(played.sort((a,b) => a-b), [...expected].sort((a,b) => a-b),
      "Unexpected weapon, impact or shatter audio source");
    console.log("Weapon",weapon,"played",expected.join(", "),"through jug shatter");
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
