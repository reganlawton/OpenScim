// The fight stands still while the Plugins panel is open, and runs again once
// the panel is closed. In the lobby there is no fight to hold.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:8791";
const TICK_MS = 600; // WIKI: a game tick is 0.6 s
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.route("**/engine/SimulationEngine.js*", async (route) => {
    const marker = "this.encounter = options.encounter;";
    const response = await route.fetch();
    const body = await response.text();
    assert.ok(body.includes(marker));
    await route.fulfill({ response, body: body.replace(marker, marker + "if (options.encounter.kind === 'zebak') window.engine = this;") });
  });

  await page.goto(origin + "/zebak/");
  await page.waitForFunction(() => window.engine, null, { timeout: 60000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 60000 });
  const tick = () => page.evaluate(() => engine.getState().currentTick);
  const runs = (from) => page.waitForFunction((since) => engine.getState().currentTick >= since + 2, from, { timeout: 60000 });
  await runs(await tick());

  // Open: one tick already under way may still land, then none for five more.
  await page.click('[data-tutorial="plugins-button"]');
  await page.waitForSelector(".plugins-overlay.open");
  await page.waitForTimeout(TICK_MS);
  const held = await tick();
  await page.waitForTimeout(5 * TICK_MS);
  assert.equal(await tick(), held, "the fight ticked with the Plugins panel open");

  await page.click('.plugins-overlay button[aria-label="Close plugins"]');
  await page.waitForSelector(".plugins-overlay.open", { state: "detached" });
  await runs(held);

  // The same button toggles: open holds again, a second press lets it run.
  await page.click('[data-tutorial="plugins-button"]');
  await page.waitForSelector(".plugins-overlay.open");
  await page.waitForTimeout(TICK_MS);
  const heldAgain = await tick();
  await page.waitForTimeout(5 * TICK_MS);
  assert.equal(await tick(), heldAgain, "the fight ticked with the Plugins panel open again");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".plugins-overlay.open", { state: "detached" });
  await runs(heldAgain);

  assert.deepEqual(errors, []);
  console.log("Plugins panel: the fight holds while it is open and runs once it is closed");
} finally {
  await browser.close();
}
