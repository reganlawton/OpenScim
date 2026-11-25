// The groups kept in the trimmed client/osrs-cache/disk.zip, as
// { "<cache index>": [group ids] }. They are listed in several files, and the
// trimmed cache holds what any of them lists:
//
//   tools/assets/cache-groups.json         the base: what the encounters needed
//                                          when the list was split. Nothing
//                                          writes it any more
//   tools/assets/cache-groups/<name>.json  what one encounter added since needs
//                                          beyond the base, in the same shape.
//                                          `node tools/cache-objects.mjs deps
//                                          --add --to <name>` writes it
//
// So an encounter lists its groups in a file of its own, and two pull requests
// never edit the same list. Two encounters may list the same group: each file
// is whole without the others, and deleting an encounter deletes its file.
// Nothing here needs the game cache (test/test-cache-groups.mjs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const baseFile = path.join(import.meta.dirname, "cache-groups.json");
export const groupsDirectory = path.join(import.meta.dirname, "cache-groups");
/** The name of an encounter's file, without ".json". */
export const groupsName = /^[a-z0-9][a-z0-9-]*$/;

function readGroups(file) {
  const groups = JSON.parse(readFileSync(file, "utf8"));
  for (const [index, ids] of Object.entries(groups))
    if (!/^\d+$/.test(index) || !Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id >= 0))
      throw new Error(file + ': "' + index + '" must be a cache index with a list of group ids');
  return groups;
}

/** Every list with its file: the base first, then the encounters' by name. */
export function readGroupFiles() {
  const names = existsSync(groupsDirectory) ? readdirSync(groupsDirectory).filter((name) => name.endsWith(".json")).sort() : [];
  return [baseFile, ...names.map((name) => path.join(groupsDirectory, name))].map((file) => ({ file, groups: readGroups(file) }));
}

/** What any of the lists holds: indices and ids ascending, each id once. The same cache whatever the order of the lists. */
export function mergeGroups(lists) {
  const merged = new Map();
  for (const groups of lists)
    for (const [index, ids] of Object.entries(groups)) merged.set(Number(index), new Set([...(merged.get(Number(index)) ?? []), ...ids]));
  return Object.fromEntries([...merged].sort(([a], [b]) => a - b).map(([index, ids]) => [index, [...ids].sort((a, b) => a - b)]));
}

/** The groups of the trimmed cache. */
export const readCacheGroups = () => mergeGroups(readGroupFiles().map(({ groups }) => groups));

/** A list as its file holds it: one index a line. */
export const formatGroups = (groups) =>
  "{\n" + Object.entries(mergeGroups([groups])).map(([index, ids]) => JSON.stringify(index) + ":" + JSON.stringify(ids)).join(",\n") + "\n}\n";
