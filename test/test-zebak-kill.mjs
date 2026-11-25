import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack));
  await page.addInitScript(() => {
    window.jugCommands = [];
    window.addEventListener("zebak-jug", event => window.jugCommands.push(event.detail));
  });
  async function waitForJugHit(id) {
    await page.waitForFunction(id => {
      const jug = engine.worldState.actors.get(id);
      const splats = [...document.querySelectorAll('[data-role="hitsplat-text"]')].map(node => node.textContent);
      const widths = [...document.querySelectorAll('[data-healthbars] [data-role="fg-clip"]')].map(node => node.style.width);
      return jug?.vitals.hp === 0 && jug.vitals.maxHp === 5 &&
        splats.includes("5") && widths.includes("0px");
    }, id, {timeout: 5000});
  }
  for (const [path, marker, probe] of [
    ["**/engine/SimulationEngine.js*", "this.encounter = options.encounter;", "if (options.encounter.kind === 'zebak') window.engine = this;"],
    ["**/toa/zebak/native.js*", "scene.setEncounterRenderConfig(renderConfig);", "window.scene = scene;"],
    ["**/rendering.js*", "const { x: n, y: s } = QK(current61, e.clientX, e.clientY);",
      "window.projectTile = tile => {const point = Dt.current.tileToScreen(tile); return eq(current61, point.x, point.y);};"],
  ]) {
    await page.route(path, async route => {
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes(marker));
      await route.fulfill({response, body: body.replace(marker, marker + probe).replace(
        "    this.lastPlayerVisualCenter = [N[0] + 0.5, N[1] + 0.5];",
        "    if (shove && shove.tick === currentTick && interpolatedTick > currentTick && interpolatedTick < currentTick + 1) window.shoveFrame = {position:N, shove, facing:j, walking:G, running:$};\n    this.lastPlayerVisualCenter = [N[0] + 0.5, N[1] + 0.5];")});
    });
  }
  for (const action of ["Push", "Pull", "Wave"]) {
    const kind = action === "Wave" ? "waves" : "roar";
    await page.goto("http://127.0.0.1:8791/zebak/");
    await page.waitForFunction(() => document.body.innerText.includes("580/580"));
    await page.waitForTimeout(2500);
    let bossPoint;
    for (const y of [226,190,250,280,150,310]) {
      for (const x of [631,600,665,570,705,530,750]) {
        await page.mouse.move(x,y);
        if ((await page.locator("body").innerText()).includes("Attack Zebak")) {
          bossPoint = {x,y};
          break;
        }
      }
      if (bossPoint) break;
    }
    assert.ok(bossPoint, "could not pick Zebak on the arena");
    await page.waitForFunction(() => document.body.innerText.includes("Attack Zebak"));
    await page.evaluate(kind => {
      engine.setMechanicsConfig({...engine.mechanicsConfig, infiniteHealth:true});
      engine.encounter.phases.next = kind;
      window.jugGesturePlayed = false;
      const lookup = scene.createFirstAvailableSequence.bind(scene);
      scene.createFirstAvailableSequence = ids => {
        const sequence = lookup(ids);
        if (ids.includes(810) && sequence) window.jugGesturePlayed = true;
        return sequence;
      };
    }, kind);
    await page.mouse.click(bossPoint.x, bossPoint.y);
    await page.waitForFunction(() => engine.worldState.actors.get("zebak").vitals.hp < 580);
    const before = await page.evaluate(kind => {
      const phases = engine.encounter.phases;
      engine.teleportPlayer(engine.player().position,engine.player().facing);
      // The teleport clears the target, but a hit already in flight would still land: a Tumeken's
      // shadow hit of 71 or more takes Zebak from 390 past 55% and queues a third special.
      engine.worldState.pendingHits = engine.worldState.pendingHits.filter(hit => hit.sourceId !== "player");
      engine.setBossHp(390);
      for (let i = 0; i < 24; i++) {
        engine.advanceTick(engine.player().position);
        if (phases.of(kind === "waves" ? "wave" : "rock").length) break;
      }
      return [phases.active?.kind, phases.queue.length, phases.actors.size];
    }, kind);
    assert.equal(before[0], kind);
    assert.equal(before[1], 1);
    assert.ok(before[2] > 0);
    if (kind === "roar") {
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        window.jugAttacks = [];
        const emit = engine.tickEvents.emit.bind(engine.tickEvents);
        engine.tickEvents.emit = event => {
          if (event.type === "attack_started" && event.sourceId === "player" &&
              event.targetId.startsWith("zebak-jug-")) jugAttacks.push(event.targetId);
          return emit(event);
        };
      });
      const beforePush = await page.evaluate(() => Object.fromEntries(
        engine.encounter.phases.of("jug").map(({actor}) => [actor.id, [...actor.position]])
      ));
      const jugPoint = await page.evaluate(() => {
        const player = engine.player().position;
        const distance = ({actor}) => Math.max(...actor.position.map((v, i) => Math.abs(v - player[i])));
        const [jug] = engine.encounter.phases.of("jug").sort((a,b) => distance(a) - distance(b));
        const matrix = scene.npcInstanceManager.instanceRegistry.get(jug.actor.id).currentModelMatrix;
        return window.projectTile({x:matrix[12], y:matrix[13], level:matrix[14]+0.3});
      });
      if (action === "Pull") {
        await page.mouse.click(jugPoint.clientX, jugPoint.clientY, {button:"right"});
        const item = await page.getByText("Pull", {exact:true}).last().boundingBox();
        await page.mouse.click(item.x + item.width / 2, item.y + item.height / 2);
      } else await page.mouse.click(jugPoint.clientX, jugPoint.clientY);
      await page.waitForFunction(starts => engine.encounter.phases.of("jug").some(
        ({actor, step}) => step && actor.isMoving && actor.movementPath.length &&
          scene.npcInstanceManager.instanceRegistry.get(actor.id)?.npcTypeId === 11736 &&
          actor.position.some((value, i) => value !== starts[actor.id][i])
      ), beforePush, {timeout: 6500});
      assert.ok(await page.evaluate(() => window.jugGesturePlayed));
      assert.deepEqual(await page.evaluate(() => jugAttacks), [], action + " fired the equipped weapon");
      console.log(action, "rendered the rolling jug on its movement path");
      if (action === "Push") {
        const target = await page.evaluate(() => {
          const jug = engine.encounter.phases.of("jug").find(j => j.step);
          // Keep the moving jug on land for the bow's travel time.
          jug.step = [1,0];
          const matrix = scene.npcInstanceManager.instanceRegistry.get(jug.actor.id).currentModelMatrix;
          return {id:jug.actor.id, ...window.projectTile({x:matrix[12],y:matrix[13],level:matrix[14]+0.3}),
            player:[...engine.player().position]};
        });
        await page.mouse.click(target.clientX,target.clientY);
        await waitForJugHit(target.id);
        assert.deepEqual(await page.evaluate(() => jugAttacks), [target.id]);
        assert.ok(await page.evaluate(id => jugCommands.some(command => command.id === id && command.action === "Hit"), target.id));
        await page.waitForFunction(id => !engine.worldState.actors.has(id),target.id,{timeout:3000});
        assert.deepEqual(await page.evaluate(() => engine.player().position),target.player);
        console.log("Ranged Hit showed 5 and an empty bar on the jug from the firing tile");
      } else {
        const ids = await page.evaluate(() => {
          const phases = engine.encounter.phases;
          const jug = phases.of("jug").find(j => j.step);
          const shelter = phases.of("rock")[0];
          jug.actor.position = [shelter.actor.position[0] - 1, shelter.actor.position[1]];
          jug.step = [1,0];
          jug.remaining = 2;
          return {jug: jug.actor.id, shelter: shelter.actor.id};
        });
        await waitForJugHit(ids.jug);
        await page.screenshot({path: "evidence/zebak-jug-collision.png"});
        assert.equal(await page.evaluate(id => engine.worldState.actors.get(id).vitals.hp, ids.shelter), 150);
        console.log("Rock collision showed 5 and emptied the jug's bar while the shelter kept 150 HP");
      }
    } else {
      await page.waitForFunction(() => {
        const manager = scene.npcInstanceManager;
        return manager.typeRegistry.get(11738)?.animationSet.spawn?.seqId === 7878 &&
          [...manager.instanceRegistry.values()].some(model => model.npcTypeId === 11738 && model.spawnTick !== undefined);
      });
      const wave = await page.evaluate(() => {
        const phases = engine.encounter.phases;
        const player = engine.player();
        for (let tick = 0; tick < 14 && phases.of("wave")[0].actor.position[1] < 31; tick++)
          engine.advanceTick(player.position);
        const front = phases.of("wave").find(({actor}) => phases.land([actor.position[0],32]));
        const x = front.actor.position[0];
        phases.water = null;
        engine.teleportPlayer([x,32],player.facing);
        engine.setMechanicsConfig({...engine.mechanicsConfig,infiniteHealth:false});
        engine.encounter.attackTick = engine.worldState.tick + 100;
        phases.acid.clear();
        const historyStart = engine.damageHistory.length;
        // Stands a row ahead of the crest: it steps onto his tile, strikes on its next turn and
        // throws him 3 rows north.
        for (let i = 0; i < 14 && player.position[1] < 35; i++) engine.advanceTick(player.position);
        return {hits:engine.damageHistory.slice(historyStart).filter(h => h.source === "Tidal Wave"),
          position:player.position, previous:player.previousPosition, path:player.movementPath};
      });
      assert.equal(wave.hits.length,1);
      assert.ok(wave.hits[0].hpAfter < wave.hits[0].hpBefore);
      assert.equal(wave.position[1],35);
      assert.equal(wave.previous[1],32);
      assert.deepEqual(wave.path,[wave.position]);
      await page.waitForFunction(() => window.shoveFrame);
      const frame = await page.evaluate(() => window.shoveFrame);
      assert.equal(frame.facing, frame.shove.facing);
      assert.equal(frame.walking, false);
      assert.equal(frame.running, false);
      // OBS (20261125-195433-zebak-wave.jsonl.gz, ticks 149, 150, 156, 158): he is put on the throw's last tile
      // in the cycle of the hitsplat, not slid there: mid-tick he is drawn on it.
      assert.deepEqual(frame.position, frame.shove.to);
      assert.deepEqual(frame.shove.from, frame.shove.to);
      console.log("Wave put the player 3 tiles on at once, drawn there mid-tick with locked facing, without walking, and reduced HP");
      await page.evaluate(() => {
        const phases = engine.encounter.phases;
        for (let i = 0; i < 14 && phases.waveFronts.length < 3; i++) engine.advanceTick(engine.player().position);
      });
      await page.waitForFunction(() => {
        const fronts = engine.encounter.phases.waveFronts;
        const models = scene.npcInstanceManager.instanceRegistry;
        return fronts.length === 3 && fronts.every((front, i) => i === 0 || Math.abs(front.y - fronts[i-1].y) === 7) &&
          fronts.every(front => front.actors.every(({actor}) => actor.position[1] === front.y &&
            [11738, 11739].includes(models.get(actor.id)?.npcTypeId)));
      }, undefined, {timeout:5000});
      await page.screenshot({path: "evidence/zebak-tidal-fronts.png"});
      console.log("Three tidal rows simultaneously rendered their own wave NPCs seven tiles apart");
    }
    await page.evaluate(() => engine.setBossHp(144));
    await page.waitForFunction(() => scene.npcInstanceManager.instanceRegistry.get("primary-npc")?.npcTypeId === 11732);
    const after = await page.evaluate(() => {
      const phases = engine.encounter.phases;
      return {
        active: phases.active, queue: phases.queue, hazards: phases.actors.size,
        models: [...scene.npcInstanceManager.instanceRegistry.values()].map(model => model.npcTypeId).sort(),
      };
    });
    assert.deepEqual(after, {active:null, queue:[], hazards:0, models:[11731,11732]});
    await page.evaluate(() => engine.setBossHp(0));
    await page.waitForFunction(() => !engine.worldState.actors.has("zebak-tail"));
    assert.equal(await page.evaluate(() => engine.encounter.phases.acid.size), 0);
    assert.deepEqual(errors, []);
    console.log(kind, "passed queued transition, enrage model replacement and death cleanup");
  }
} finally {
  await browser.close();
}

