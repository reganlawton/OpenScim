#!/usr/bin/env node
// Fetches the game media and cache that git does not track (see README) from
// public upstreams, verifying every file by sha256 (or, for images decoded
// from the cache, by a hash of their pixels).
//
//   node tools/fetch-assets.mjs [--out client] [--cache .cache/assets] [--check] [--force]
//
// tools/assets/manifest.json     every untracked media file: sha256 or pixels, source (null = no upstream),
//                                and for a file with no upstream the recipe of a stand-in (standIn,
//                                tools/assets/standins.mjs), written where the file is absent
// tools/assets/cache-groups.json groups kept in the trimmed client/osrs-cache/disk.zip, with those of
//                                tools/assets/cache-groups/*.json (tools/assets/cache-groups.mjs)
import fs from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { SECTOR, container, unpack, unzipCache } from "./assets/cache.mjs";
import { readCacheGroups } from "./assets/cache-groups.mjs";
import { trimmedCacheStatus } from "./assets/trimmed-cache.mjs";
import { decodePng, decodeSprites, encodePng, onCanvas, pixelHash } from "./assets/sprites.mjs";
import { isStandIn, makeStandIn } from "./assets/standins.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const { values: opt } = parseArgs({
  options: {
    out: { type: "string", default: path.join(repo, "client") },
    cache: { type: "string", default: path.join(repo, ".cache", "assets") },
    check: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});
const out = path.resolve(opt.out);
const UA = "OpenScim-fetch-assets/0.1 (tools/fetch-assets.mjs; Node " + process.version + ")";
const CONCURRENCY = 4;

// OpenRS2 archive metadata for the cache this client was built against.
const OPENRS2 = {
  id: 2762,
  url: "https://archive.openrs2.org/caches/runescape/2762/disk.zip",
  sha256: "95980055d29f43f35fe7337488ae34e083f0f79c410e0a80ca51cc572ddfe380",
  timestamp: "2026-11-11T11:45:06.321160Z",
  builds: [{ major: 242, minor: null }],
};
const COMPRESSION = ["none", "bzip2", "gzip"];

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const manifest = await readJson(path.join(repo, "tools/assets/manifest.json"));
const cacheGroups = readCacheGroups();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readIfExists = (file) => fs.readFile(file).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));

async function pool(items, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
}

async function request(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA } });
      if (response.ok) return response;
      // 4xx will not get better by asking again (429 excepted).
      if (attempt >= 3 || (response.status < 500 && response.status !== 429))
        throw new Error("HTTP " + response.status + " for " + url);
    } catch (error) {
      if (attempt >= 3 || /^HTTP 4/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

// Downloads into the cache directory once; later runs reuse the file.
async function cached(name, url) {
  const file = path.join(opt.cache, name);
  if (!existsSync(file)) {
    await fs.mkdir(opt.cache, { recursive: true });
    console.log("downloading " + url);
    const response = await request(url);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file + ".part"));
    await fs.rename(file + ".part", file);
  }
  return file;
}

async function writeFile(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".part", bytes);
  await fs.rename(file + ".part", file);
}

// ---------------------------------------------------------------- dat2/idx

let fullCache;
function openFullCache() {
  return (fullCache ??= (async () => {
    const file = await cached("openrs2-" + OPENRS2.id + "-disk.zip", OPENRS2.url);
    const bytes = await fs.readFile(file);
    if (sha256(bytes) !== OPENRS2.sha256)
      throw new Error(file + " does not match the expected sha256; delete it and run again");
    console.log("reading full cache " + file);
    return { bytes: bytes.length, ...(await unzipCache(bytes)) };
  })());
}

async function buildTrimmedCache() {
  const full = await openFullCache();
  const sectors = [Buffer.alloc(SECTOR)]; // sector 0 is never referenced
  const zip = new JSZip();
  const date = new Date(Date.UTC(1980, 0, 1)); // fixed, so rebuilds are reproducible
  const compressions = new Set();
  let count = 0;
  for (const [archiveKey, groups] of Object.entries(cacheGroups)) {
    const archive = Number(archiveKey);
    const idx = Buffer.alloc((await full.load("idx" + archive)).length);
    for (const group of groups) {
      const data = await full.group(archive, group);
      if (!data) throw new Error("full cache has no archive " + archive + " group " + group);
      compressions.add(data[0]);
      idx.writeUIntBE(data.length, group * 6, 3);
      idx.writeUIntBE(sectors.length, group * 6 + 3, 3);
      const header = group > 0xffff ? 10 : 8;
      const room = SECTOR - header;
      for (let at = 0, chunk = 0; at < data.length; at += room, chunk++) {
        const sector = Buffer.alloc(SECTOR);
        if (header === 10) sector.writeUInt32BE(group);
        else sector.writeUInt16BE(group);
        sector.writeUInt16BE(chunk, header - 6);
        sector.writeUIntBE(at + room < data.length ? sectors.length + 1 : 0, header - 4, 3);
        sector[header - 1] = archive;
        data.copy(sector, header, at, at + room);
        sectors.push(sector);
      }
      count++;
    }
    zip.file("main_file_cache.idx" + archive, idx, { date });
  }
  zip.file("main_file_cache.dat2", Buffer.concat(sectors), { date });
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const dir = path.join(out, "osrs-cache");
  await writeFile(path.join(dir, "disk.zip"), bytes);
  await writeFile(path.join(dir, "keys.json"), "[]\n");
  // The client validates id/scope/game/language/environment/timestamp/builds,
  // checks disk.zip against diskZipSha256, and only starts its bzip2 decoder
  // when containerCompressions is absent or lists "bzip2".
  const info = {
    id: OPENRS2.id,
    scope: "runescape",
    game: "oldschool",
    language: "en",
    environment: "live",
    timestamp: OPENRS2.timestamp,
    builds: OPENRS2.builds,
    size: bytes.length,
    fetchedAt: new Date().toISOString(),
    diskZipSha256: sha256(bytes),
    diskZipBytes: bytes.length,
    source: "https://archive.openrs2.org/caches/" + OPENRS2.id,
    trimmed: true,
    trimmedFromSha256: OPENRS2.sha256,
    trimmedFromBytes: full.bytes,
    containerCompressions: [...compressions].sort().map((id) => COMPRESSION[id] ?? "unknown-" + id),
  };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(info, null, 2) + "\n");
  return count + " groups, " + sectors.length + " sectors, disk.zip " + bytes.length + " bytes, sha256 " + info.diskZipSha256;
}

// ------------------------------------------------------------------- media

// Each source kind returns a function (rest of the "alias:rest" descriptor) -> bytes.
async function openSource(alias) {
  const source = manifest.sources[alias];
  if (!source) throw new Error("unknown source " + alias);
  if (source.raw) return async (rest) => Buffer.from(await (await request(source.raw + rest)).arrayBuffer());
  if (source.zip) {
    const tag = crypto.createHash("sha1").update(source.zip).digest("hex").slice(0, 8);
    const zip = await JSZip.loadAsync(await fs.readFile(await cached(alias + "-" + tag + ".zip", source.zip)));
    return async (rest) => {
      const entry = zip.file((source.prefix ?? "") + rest);
      if (!entry) throw new Error("not in " + source.zip + ": " + rest);
      return entry.async("nodebuffer");
    };
  }
  if (source.sprites) {
    const full = await openFullCache();
    // "a/g/f" is frame f of a sprite group, written as PNG; "a/g/f/canvas"
    // places it at its offset on the group's full canvas.
    return async (rest) => {
      const [archive, group, frame, canvas] = rest.split("/");
      const stored = await full.group(Number(archive), Number(group));
      const sprite = stored && decodeSprites(await unpack(stored))[frame];
      if (!sprite) throw new Error("full cache has no sprite " + rest);
      return encodePng(canvas ? onCanvas(sprite) : sprite);
    };
  }
  if (source.cache) {
    const full = await openFullCache();
    // "a/g" is one container; with pack:true, "a/g,a/g,..." is the
    // room-groups.bin layout: u8 archive, u32 group, u32 length, container.
    return async (rest) => {
      const parts = [];
      for (const id of rest.split(",")) {
        const [archive, group] = id.split("/").map(Number);
        const stored = await full.group(archive, group);
        if (!stored) throw new Error("full cache has no group " + id);
        const data = container(stored);
        if (source.pack) {
          const header = Buffer.alloc(9);
          header.writeUInt8(archive);
          header.writeUInt32BE(group, 1);
          header.writeUInt32BE(data.length, 5);
          parts.push(header);
        }
        parts.push(data);
      }
      return Buffer.concat(parts);
    };
  }
  throw new Error("source " + alias + " has no raw, zip or cache field");
}

// Right bytes, or for a "pixels" entry (a PNG this script encodes itself, so
// the bytes depend on the zlib version) the right picture.
function matches(file, bytes) {
  if (!file.pixels) return sha256(bytes) === file.sha256;
  try {
    return pixelHash(decodePng(bytes)) === file.pixels;
  } catch {
    return false;
  }
}

const tally = { present: [], fetched: [], differs: [], failed: [], missingNoSource: [], standIns: [], standInsWritten: [] };
const noUpstream = manifest.files.filter((file) => !file.source);
const wanted = [];

for (const file of manifest.files) {
  const bytes = await readIfExists(path.join(out, file.path));
  if (bytes && matches(file, bytes)) tally.present.push(file);
  else if (bytes && !file.source && file.standIn && isStandIn(bytes)) tally.standIns.push(file);
  else if (bytes && !(opt.force && file.source && !opt.check)) tally.differs.push(file);
  else if (!file.source) tally.missingNoSource.push(file);
  else wanted.push(file);
}

const cacheState = await trimmedCacheStatus(path.join(out, "osrs-cache"), cacheGroups);
let cacheStatus = cacheState.state === "ok" ? "ok" : cacheState.message ?? cacheState.state;
let cacheLine = cacheStatus === "ok" ? "already present" : cacheStatus;

if (!opt.check) {
  // A stale one (built here before a list of groups changed) is rebuilt
  // unasked: it comes from the pinned OpenRS2 cache and the lists alone, and
  // kept, it shows a black screen where a scene needs what it lacks. Only a
  // disk.zip that is not one of ours waits for --force.
  if (cacheState.state === "missing" || cacheState.state === "stale" || (cacheState.state !== "ok" && opt.force)) {
    cacheLine = (cacheState.state === "stale" ? "rebuilt, " + cacheState.message + ": " : "built: ") + (await buildTrimmedCache());
    cacheStatus = "ok";
  } else if (cacheStatus !== "ok") cacheLine += " (kept; pass --force to rebuild)";

  const bySource = Map.groupBy(wanted, (file) => file.source.split(":")[0]);
  const jobs = [];
  for (const [alias, files] of bySource) {
    let source;
    for (const file of files)
      jobs.push(async () => {
        try {
          const bytes = await (await (source ??= openSource(alias)))(file.source.slice(alias.length + 1));
          if (!matches(file, bytes)) throw new Error((file.pixels ? "pixel" : "sha256") + " mismatch from " + file.source);
          await writeFile(path.join(out, file.path), bytes);
          tally.fetched.push(file);
        } catch (error) {
          tally.failed.push({ ...file, error: error.message });
        }
      });
  }
  await pool(jobs, (job) => job());

  // The files no upstream has: a stand-in where the file is absent (an
  // original put back from a backup is never replaced).
  const sources = new Map();
  const openCached = (alias) => sources.get(alias) ?? sources.set(alias, openSource(alias)).get(alias);
  for (const file of tally.missingNoSource.filter((candidate) => candidate.standIn)) {
    try {
      await writeFile(path.join(out, file.path), await makeStandIn(file.standIn, { tree: out, fullCache: openFullCache, openSource: openCached }));
      tally.standInsWritten.push(file);
    } catch (error) {
      tally.failed.push({ ...file, error: "stand-in " + file.standIn + ": " + error.message });
    }
  }
  tally.missingNoSource = tally.missingNoSource.filter((file) => !tally.standInsWritten.includes(file));
  tally.standIns.push(...tally.standInsWritten);
}

// ----------------------------------------------------------------- summary

const byKey = (files, key) => [...Map.groupBy(files, key)].sort(([a], [b]) => a.localeCompare(b));
const alias = (file) => file.source.split(":")[0];
const names = (files) => {
  const list = files.map((file) => path.posix.basename(file.path));
  return list.length > 12 ? list.slice(0, 12).join(" ") + " ... (+" + (list.length - 12) + " more)" : list.join(" ");
};

console.log("\n== " + (opt.check ? "check" : "fetch") + " " + out);
console.log("osrs-cache: " + cacheLine);
console.log("media files in manifest: " + manifest.files.length);
console.log("  already present, hash ok: " + tally.present.length);
if (!opt.check) {
  console.log("  fetched and verified:     " + tally.fetched.length);
  for (const [key, files] of byKey(tally.fetched, alias)) console.log("    " + key + ": " + files.length);
} else {
  console.log("  missing, has upstream:    " + wanted.length);
}
console.log("  missing, no upstream:     " + tally.missingNoSource.length);
console.log("  stand-ins in their place: " + tally.standIns.length + (tally.standInsWritten.length ? " (" + tally.standInsWritten.length + " written now)" : "") + " (not the originals: tools/assets/standins.mjs)");
console.log("  present but hash differs: " + tally.differs.length + (tally.differs.length && !opt.check ? " (kept; --force replaces those that have an upstream)" : ""));
for (const file of tally.differs) console.log("    " + file.path);
if (tally.failed.length) {
  console.log("  FAILED: " + tally.failed.length);
  for (const file of tally.failed) console.log("    " + file.path + ": " + file.error);
}

const absent = new Set(tally.missingNoSource);
console.log("\nfiles with no upstream (" + noUpstream.length + "; absent from this tree: " + absent.size + "), by directory:");
for (const [dir, files] of byKey(noUpstream, (file) => path.posix.dirname(file.path))) {
  const gone = files.filter((file) => absent.has(file)).length;
  console.log("  " + dir + "/  " + files.length + (gone ? " (" + gone + " absent)" : ""));
  console.log("    " + names(files));
}
console.log("  full list: entries with \"source\":null in tools/assets/manifest.json");

// A fresh clone always lacks the no-upstream files, so only --check treats an
// incomplete tree as failure; a fetch fails when something that has an
// upstream could not be reproduced.
const incomplete = cacheStatus !== "ok" || tally.differs.length || tally.missingNoSource.length || tally.standIns.length || wanted.length;
process.exitCode = tally.failed.length || (opt.check && incomplete) ? 1 : 0;
