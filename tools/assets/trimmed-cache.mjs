// Whether client/osrs-cache/disk.zip, the trimmed cache, holds what the lists
// of tools/assets/cache-groups.mjs name. Shared by tools/fetch-assets.mjs,
// which rebuilds a stale one, and vite.config.js, which will not build with one.
//
// A group the lists name and the trimmed cache lacks is an "Empty container
// <index>:<group>" in the browser, and a scene that needs it does not load (a
// black screen). The lists change with every encounter; a disk.zip built
// before a list changed lacks its groups until it is built again.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { unzipCache } from "./cache.mjs";

const readIfExists = (file) => fs.readFile(file).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));

/**
 * The state of the trimmed cache in `dir` (client/osrs-cache) against `groups`
 * ({ "<index>": [group ids] }, as readCacheGroups() returns them):
 *
 *   { state: "missing" }                   no disk.zip
 *   { state: "foreign", message }          disk.zip does not match its manifest.json: not one
 *                                          fetch-assets built, so not one to replace unasked
 *   { state: "stale", message, absent }    built by fetch-assets, but without groups the lists
 *                                          name now ([[index, group], ...])
 *   { state: "ok" }
 */
export async function trimmedCacheStatus(dir, groups) {
  const bytes = await readIfExists(path.join(dir, "disk.zip"));
  if (!bytes) return { state: "missing" };
  const info = JSON.parse((await readIfExists(path.join(dir, "manifest.json"))) ?? "{}");
  if (info.diskZipSha256 !== crypto.createHash("sha256").update(bytes).digest("hex"))
    return { state: "foreign", message: "disk.zip does not match manifest.json diskZipSha256" };
  const cache = await unzipCache(bytes);
  const absent = [];
  for (const [archive, ids] of Object.entries(groups))
    for (const group of ids) if (!(await cache.group(Number(archive), group))) absent.push([Number(archive), group]);
  if (!absent.length) return { state: "ok" };
  const named = absent.slice(0, 6).map(([archive, group]) => archive + ":" + group).join(", ");
  return {
    state: "stale",
    absent,
    message: absent.length + " listed group" + (absent.length === 1 ? " is" : "s are") + " missing (" + named + (absent.length > 6 ? ", ..." : "") + ")",
  };
}
