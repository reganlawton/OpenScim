// The client's decoder (rendering.js) reads every version 3 model of the
// trimmed cache: a model of that version ends with a byte (ten more follow
// when it is not 0), a byte that tells whether a depth bias follows, the bias
// of every face if it does, and a 26-byte trailer. The bias was once read
// without its flag, two bytes early: models without one threw ("Buffer
// overflow") or took their trailer for it. No browser.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { unpack, unzipCache } from "../tools/assets/cache.mjs";
import { readCacheGroups } from "../tools/assets/cache-groups.mjs";
import { cacheZip, loadEnvironment } from "../tools/determinism/harness.mjs";

test("every version 3 model of the trimmed cache decodes, its face bias too", { skip: !existsSync(cacheZip) && `${cacheZip} is missing (npm run assets)` }, async () => {
  const { rendering } = await loadEnvironment();
  const cache = await unzipCache(readFileSync(cacheZip));
  const count = { textured: 0, biased: 0 };
  for (const id of readCacheGroups()[7]) {
    const stored = await cache.group(7, id);
    if (!stored) continue;
    const bytes = await unpack(stored);
    if (bytes.at(-1) !== 0xfd || bytes.at(-2) !== 0xff) continue; // another version
    const model = rendering.wm.decode(new Int8Array(bytes));
    if (!model.faceBias) continue;
    count.textured++;
    // Without a bias the model is as long as its other parts: its last byte before the trailer is the flag, 0, as is
    // the byte before it unless ten more follow; with one, the bias ends where the trailer starts.
    const end = bytes.length - 26;
    const flag = bytes[end - 1 - model.faceCount];
    const biased = flag === 1 && [...model.faceBias].every((bias, face) => bias === ((bytes[end - model.faceCount + face] - 1) << 24) >> 24);
    if (biased) count.biased++;
    else assert.ok([...model.faceBias].every((bias) => bias === -1), `model ${id}: a bias without its flag`);
  }
  // On main 53 models of the lists have textures mapped by vertices, 21 of them a bias.
  assert.ok(count.textured >= 53 && count.biased >= 21, JSON.stringify(count));
});
