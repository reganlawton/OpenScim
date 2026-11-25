// tools/assets/trimmed-cache.mjs: which trimmed caches fetch-assets rebuilds
// unasked and `npm run build` refuses. A two-group cache made here, so no game
// data is needed.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { SECTOR } from "../tools/assets/cache.mjs";
import { trimmedCacheStatus } from "../tools/assets/trimmed-cache.mjs";

// Archive 7 with group 0 and group 2, each one sector holding a 1-byte uncompressed container.
const sectors = [Buffer.alloc(SECTOR)];
const idx = Buffer.alloc(3 * 6);
for (const group of [0, 2]) {
  const data = Buffer.from([0, 0, 0, 0, 1, 0x42]);
  const sector = Buffer.alloc(SECTOR);
  sector.writeUInt16BE(group);
  sector[7] = 7;
  data.copy(sector, 8);
  idx.writeUIntBE(data.length, group * 6, 3);
  idx.writeUIntBE(sectors.length, group * 6 + 3, 3);
  sectors.push(sector);
}
const zip = new JSZip();
zip.file("main_file_cache.idx7", idx);
zip.file("main_file_cache.dat2", Buffer.concat(sectors));
const bytes = await zip.generateAsync({ type: "nodebuffer" });

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openscim-trimmed-cache-"));
try {
  assert.deepEqual(await trimmedCacheStatus(dir, { 7: [0] }), { state: "missing" });

  await fs.writeFile(path.join(dir, "disk.zip"), bytes);
  assert.equal((await trimmedCacheStatus(dir, { 7: [0] })).state, "foreign", "no manifest.json: not built by fetch-assets");

  const diskZipSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ diskZipSha256 }));
  assert.deepEqual(await trimmedCacheStatus(dir, { 7: [0, 2] }), { state: "ok" });

  // A list that grew after the cache was built: group 1 of 7 and all of archive 22.
  const stale = await trimmedCacheStatus(dir, { 7: [0, 1, 2], 22: [590] });
  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.absent, [[7, 1], [22, 590]]);
  assert.match(stale.message, /2 listed groups are missing \(7:1, 22:590\)/);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
console.log("trimmed cache: missing, foreign, ok and stale told apart");
