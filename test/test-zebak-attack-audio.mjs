import assert from "node:assert/strict";
import {chromium} from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 850}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.soundIds = new WeakMap();
    window.audioStarts = [];
    window.spitFlights = new Map();
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(when, ...args) {
      const result = start.call(this, when, ...args);
      const id = soundIds.get(this.buffer);
      if (id) audioStarts.push({id, when, context: this.context, duration: this.buffer.duration});
      return result;
    };
  });
  for (const [file, marker, extra] of [
    ["engine/SimulationEngine.js", "this.encounter = options.encounter;",
      "if (this.encounter.kind === 'zebak') window.testEngine = this;"],
    ["application.js", "this.bufferCache.set(h2, h8);",
      "window.soundIds.set(h8, h2);"],
    ["rendering.js", "const { position: position, velocity: velocity } = t.motion;",
      `if (spotAnimId >= 2176 && spotAnimId <= 2179) {
        let flight = window.spitFlights.get(instanceId);
        if (!flight) {
          flight = {id: spotAnimId, samples: []};
          window.spitFlights.set(instanceId, flight);
        }
        flight.samples.push({f:(a.cycle-startCycle)/(endCycleExclusive-startCycle), ...position});
      }`],
  ]) {
    await page.route("**/" + file + "*", async route => {
      const response = await route.fetch({maxRetries: 3});
      const source = await response.text();
      assert.ok(source.includes(marker));
      await route.fulfill({response, body: source.replace(marker, marker + extra)});
    });
  }
  await page.goto("http://127.0.0.1:8791/zebak/");
  await page.waitForFunction(() => document.body.innerText.includes("580/580"));
  await page.mouse.click(640, 425);
  for (const enraged of [false, true]) {
    for (const path of [0, 3, 4]) {
      for (const magic of [false, true]) {
        await page.evaluate(({enraged, path, magic}) => {
          const engine = window.testEngine;
          engine.setMechanicsConfig({...engine.mechanicsConfig, infiniteHealth:true});
          engine.encounter.configureRunStart({...engine.mechanicsConfig, path});
          engine.encounter.random = () => magic ? 0.2 : 0.8;
          if (enraged && !engine.encounter.phases.enraged) engine.setBossHp(140);
          engine.encounter.attackTick = engine.worldState.tick + 1;
          window.audioStarts.length = 0;
          window.spitFlights.clear();
        }, {enraged, path, magic});
        const ids = magic ? [5823, 5878, 5884] : [5819, 5896, 5884];
        const expected = path >= 4 ? [0, 1.8, 3] : [0, 2.4, 4.2];
        const played = await page.waitForFunction(({enraged, ids, expected}) => {
          if (testEngine.encounter.phases.enraged !== enraged) return false;
          const opener = audioStarts.find(cue => cue.id === ids[0]);
          if (!opener) return false;
          const offsets = [];
          for (const [i, id] of ids.entries()) {
            const due = opener.when + expected[i];
            const cue = audioStarts.find(start => start.id === id && start.duration > 0 &&
              Math.abs(start.when - due) < 0.13 && start.context.state === "running" &&
              start.context.currentTime >= start.when);
            if (!cue) return false;
            offsets.push(Math.round((cue.when - opener.when) * 1000));
          }
          return offsets;
        }, {enraged, ids, expected});
        console.log("path", path, enraged ? "enraged" : "normal", magic ? "magic" : "ranged",
          ids, await played.jsonValue());
        await played.dispose();
        // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 618-705): at path levels 0-3 the enraged pots are the normal ones.
        const enragedPot = enraged && path >= 4;
        const primaryId = magic ? (enragedPot ? 2177 : 2176) : (enragedPot ? 2179 : 2178);
        const trajectory = await page.evaluate(id => [...spitFlights.values()]
          .find(flight => flight.id === id && flight.samples[0].f < 0.15 && flight.samples.at(-1).f > 0.85)
          ?.samples, primaryId);
        assert.ok(trajectory?.length >= 5, "Expected a rendered outbound flight from jaw to burst");
        const first = trajectory[0], last = trajectory.at(-1);
        const span = last.f - first.f;
        const range = Math.hypot(last.x - first.x, last.y - first.y) / span;
        const bend = Math.max(...trajectory.map(s => Math.abs(s.z - first.z -
          (last.z - first.z) * (s.f - first.f) / span)));
        // OBS (same recording, every spit): from the tile 7 east of his south-west tile to the one 15 east, 8 tiles.
        if (path < 4) assert.ok(range > 7.5 && range < 8.5, "Jaw tile to centerline burst distance in tiles");
        else assert.ok(range > 6 && range < 7.5, "Jaw to centerline burst distance in tiles");
        assert.ok(last.z > first.z + 1.3, "The first leg rises from the mouth");
        assert.ok(bend > (enraged ? 0.25 : 0.45) && bend < 1,
          "Midflight lift above the release-to-burst line");
        console.log("Rendered outbound range, rise and curvature (tiles)",
          [range, (last.z-first.z)/span, bend].map(n => n.toFixed(2)));
      }
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
