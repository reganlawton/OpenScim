import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {zebakDefinition} from "../client/toa/zebak/native.js";

for (const path of [0, 2, 3, 4, 6]) {
  const launches = [], impacts = [], clouds = [], barrages = [];
  const encounter = zebakDefinition({
    seedRandom: () => () => 0.2, animate() {}, stats: () => ({}),
    projectile: () => ({}), rollAttack: () => ({}),
    showAttack(context, cue) {
      launches.push(context.tick);
      impacts.push(context.tick + cue.impactDelayTicks);
      assert.equal(cue.kind, "zebak_magic");
    },
  }).factory();
  encounter.configureRunStart({blood:true, path});
  const [boss] = encounter.createNpcs();
  const player = {position:[29,32],alive:true};
  const context = {world:{actors:new Map([["zebak",boss],["player",player]])},playerPos:player.position};
  encounter.phases.enraged = true;
  encounter.bloodEvery = 8; // as after a cast made while enraged
  encounter.phases.summonClouds = context => clouds.push(context.tick);
  const period = encounter.settings.enragePeriod;
  const firstRecovery = encounter.settings.period;
  // Crossing the threshold on an already due shot must preserve that shot.
  encounter.attackTick = 10;
  for (let tick = 10; tick <= 10 + firstRecovery + 35 * period; tick++) {
    context.tick = tick;
    if (encounter.resolveHazards(context).some(hit=>hit.source==="Blood Barrage")) barrages.push(tick);
    encounter.processNpcTick(boss, context);
  }
  assert.deepEqual(launches,[10,...Array.from({length:36},(_,i)=>10+firstRecovery+i*period)]);
  assert.deepEqual(clouds,[launches[7]+3,launches[31]+3]);
  assert.deepEqual(barrages,[launches[15]+3,launches[23]+3]);
  // The spit lands 8 ticks on at path levels 0-3 (OBS, 20261125-160410-Tombs-of-Amascut.jsonl.gz) and 5 above.
  const lead = path < 2 ? 1 : path < 4 ? 2 : 0;
  assert.ok(barrages.every(tick=>impacts.includes(tick+lead)));
  assert.equal(encounter.pendingBarrages.size,0);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({viewport:{width:1280,height:850}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.barrageEvents = [];
    window.soundStarts = [];
    window.soundIds = new WeakMap();
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      const id = window.soundIds.get(this.buffer);
      if (id === 106 || id === 102) window.soundStarts.push({id, tick:window.engine.worldState.tick});
      return start.apply(this,args);
    };
    window.barrageModels = new Set();
  });
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*","this.encounter = options.encounter;","if(options.encounter.kind==='zebak') window.engine=this;"],
    ["**/toa/zebak/native.js*","scene.setEncounterRenderConfig(renderConfig);","window.scene=scene;"],
    ["**/application.js*","this.bufferCache.set(h2, h8);","window.soundIds.set(h8,h2);"],
    ["**/rendering.js*",'upsert(e) {\n    const a = e.instanceId ?? "spotanim-" + ny++;', 'if(e.spotAnimId===377) window.barrageModels.add(e.instanceId);'],
  ]) {
    await page.route(path, async route => {
      const res=await route.fetch();
      const body=(await res.text()).replaceAll("\r\n","\n");
      assert.ok(body.includes(marker), marker);
      let source = body.replace(marker,marker+probe);
      if (path.includes("rendering.")) {
        const motion = "const { position: position, velocity: velocity } = t.motion;";
        assert.ok(source.includes(motion));
        source = source.replace(motion,motion + `
          if(window.checkEnrage && !window.firstEnragePose && [2176,2178].includes(spotAnimId)) {
            window.firstEnragePose = window.scene.getPlayingSequenceFrames().map(p=>p.seqId);
          }`);
      }
      await route.fulfill({response:res,body:source});
    });
  }
  await page.goto("http://127.0.0.1:8791/zebak/");
  await page.waitForFunction(() => document.body.innerText.includes("580/580"));
  await page.getByText(/Did you know\?/).first().waitFor({state:"hidden",timeout:45000});
  await page.waitForTimeout(300);
  await page.mouse.click(640,425);
  await page.waitForFunction(() => engine.worldState.tick > 0);
  await page.evaluate(() => {
    const enc = engine.encounter;
    enc.configureRunStart({blood:true});
    enc.random=() => 0.9;
    enc.autoCount=5;
    enc.bloodSpellIndex=1;
    enc.attackTick=0;
    const emit = enc.phases.emit;
    enc.phases.emit = (events,event) => {
      if(event.graphics.some(cue => cue.spotAnimId===377))
        window.barrageEvents.push({tick:engine.worldState.tick,graphics:event.graphics,animations:event.animations});
      emit(events,event);
    };
  });
  await page.waitForFunction(() => window.barrageModels.size>=2);
  await page.waitForTimeout(180);
  await page.screenshot({path:"evidence/zebak-barrage-hands.png",clip:{x:380,y:135,width:520,height:215}});
  await page.waitForFunction(() => window.barrageModels.size===3 && window.soundStarts.some(s=>s.id===102));
  const {events,sounds} = await page.evaluate(() => ({events:window.barrageEvents,sounds:window.soundStarts}));
  assert.equal(events.length,2);
  const [cast,hit]=events;
  assert.deepEqual(cast.animations,[]);
  assert.equal(new Set(cast.graphics.map(g=>g.target.position.join(","))).size,2);
  assert.ok(cast.graphics.every(g=>g.spotAnimId===377 && g.delayCycles===0 && g.target.kind==="tile"));
  assert.equal(hit.graphics[0].target.actorId,"player");
  assert.equal(hit.tick-cast.tick,3);
  assert.deepEqual(sounds,[{id:102,tick:hit.tick}]);
  await page.evaluate(() => {
    window.checkEnrage = true;
    engine.encounter.attackTick = engine.worldState.tick + 1;
    engine.setBossHp(140);
  });
  await page.waitForFunction(() => window.firstEnragePose);
  const pose = await page.evaluate(() => window.firstEnragePose);
  // OBS (20261125-160410-Tombs-of-Amascut.jsonl.gz, ticks 618-705): enraged at path level 0 he spits the
  // normal pots (2176, 2178) with the normal animation, head 9624 and tail 9625.
  assert.ok(pose.includes(9624) && pose.includes(9625) && !pose.includes(9626) && !pose.includes(9628), JSON.stringify(pose));
  assert.deepEqual(errors,[]);
  console.log("Both claw graphics and the player impact rendered. Web Audio started the recorded impact cue once on the damage tick.",sounds);
} finally {
  await browser.close();
}
