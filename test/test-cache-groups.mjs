// The lists of the trimmed cache's groups (tools/assets/cache-groups.mjs): the
// base and one file per encounter. Needs no game cache, so GitHub Actions runs it.
import assert from "node:assert/strict";
import path from "node:path";
import { baseFile, formatGroups, groupsName, mergeGroups, readCacheGroups, readGroupFiles } from "../tools/assets/cache-groups.mjs";

// What any list holds, each id once, indices and ids ascending, whatever the order of the lists.
const one = { 7: [5, 3], 0: [9] }, other = { 22: [1], 7: [3, 4] };
assert.deepEqual(Object.entries(mergeGroups([one, other])), [["0", [9]], ["7", [3, 4, 5]], ["22", [1]]]);
assert.deepEqual(mergeGroups([other, one]), mergeGroups([one, other]));
assert.equal(formatGroups(one), '{\n"0":[9],\n"7":[3,5]\n}\n');

// readGroupFiles has read every file and refused one that is not { "<index>": [ids] }.
const files = readGroupFiles();
assert.equal(files[0].file, baseFile);
const base = files[0].groups;
for (const { file, groups } of files) {
  const name = path.basename(file, ".json");
  // As `deps --add` writes it: a hand-made file out of order would diff badly the next time it is written.
  assert.deepEqual(groups, mergeGroups([groups]), `${file}: indices and ids ascending, each id once`);
  if (file === baseFile) continue;
  assert.match(name, groupsName, `${file}: the name of an encounter's list is lower case letters, digits and "-"`);
  // Beyond the base: an id the base has is noise here. Two encounters may share one.
  for (const [index, ids] of Object.entries(groups))
    for (const id of ids) assert.ok(!base[index]?.includes(id), `${file}: ${index}/${id} is in the base list already`);
}

// The trimmed cache holds every listed group and no other.
const all = readCacheGroups();
const pairs = (groups) => Object.entries(groups).flatMap(([index, ids]) => ids.map((id) => index + "/" + id));
assert.deepEqual(new Set(pairs(all)), new Set(files.flatMap(({ groups }) => pairs(groups))));
assert.equal(pairs(all).length, new Set(pairs(all)).size);
if (files.length === 1) assert.deepEqual(all, base);
console.log(`${files.length - 1} encounter lists beside the base; ${pairs(all).length} groups in the trimmed cache`);
