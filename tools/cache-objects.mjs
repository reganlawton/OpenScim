#!/usr/bin/env node
// Looks up map objects, NPCs and spot animations in the full OpenRS2 cache
// that `npm run assets` keeps in .cache/assets. Used to find the objects of a
// room and the cache groups the trimmed cache needs for a map square, an
// object, an NPC, an animation or a spot animation (the lists of
// tools/assets/cache-groups.mjs).
//
//   node tools/cache-objects.mjs map 14160              objects of a map square, with a floor plan (region = x << 8 | y)
//   node tools/cache-objects.mjs info 46150 46172       object definitions, by id range
//   node tools/cache-objects.mjs info name:brazier      ... by name (regular expression)
//   node tools/cache-objects.mjs info model:45369       ... by model id
//   node tools/cache-objects.mjs where 46743 47991      map squares that place these objects
//   node tools/cache-objects.mjs deps 14160 loc:46168   groups these map squares and objects need that the lists lack
//   node tools/cache-objects.mjs deps --add --to duke-sucellus 14160
//                                                       ... and add them to that encounter's list, the file
//                                                       tools/assets/cache-groups/duke-sucellus.json, which is made if it
//                                                       is not there; then run: npm run assets -- --force. With --to, a
//                                                       group counts as listed when the base list or that file has it
//   node tools/cache-objects.mjs deps npc:12811 seq:10859 spot:1459
//                                                       ... the same for an NPC (its models, the animations it stands, walks and
//                                                       runs with, the NPCs it can turn into), an animation and a spot
//                                                       animation (its model and animation). For these three the sounds of the
//                                                       animations' frames are needed too
//   node tools/cache-objects.mjs deps --add --to duke-sucellus sound:3052 group:7:41097
//                                                       ... a sound that an audio rule plays (it is in no definition), and
//                                                       a group by index and id, as the browser's console names a missing
//                                                       one ("Empty container 7:41097")
//   node tools/cache-objects.mjs npc 12811 12817         NPC definitions: name, size, models, animations
//   node tools/cache-objects.mjs spot 1459               spot animation definitions: model, animation
import fs from "node:fs/promises";
import path from "node:path";
import { unpack, unzipCache } from "./assets/cache.mjs";
import { baseFile, formatGroups, groupsDirectory, groupsName, mergeGroups, readGroupFiles } from "./assets/cache-groups.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const [command, ...args] = process.argv.slice(2);
// `deps --add` writes the list of one encounter, the one `--to` names; never the base list, which every encounter shares.
const to = args.includes("--to") ? (args[args.indexOf("--to") + 1] ?? "") : undefined;
if (command === "deps" && (to === undefined ? args.includes("--add") : !groupsName.test(to))) {
  console.error('deps --add needs the encounter whose list it writes: --to <name> (lower case letters, digits, "-"), for tools/assets/cache-groups/<name>.json');
  process.exit(1);
}
const cache = await unzipCache(await fs.readFile(path.join(repo, ".cache/assets/openrs2-2762-disk.zip")));

class Reader {
  constructor(bytes) { this.b = bytes; this.o = 0; }
  u8() { return this.b[this.o++]; }
  u16() { const v = this.b.readUInt16BE(this.o); this.o += 2; return v; }
  u24() { const v = this.b.readUIntBE(this.o, 3); this.o += 3; return v; }
  i32() { const v = this.b.readInt32BE(this.o); this.o += 4; return v; }
  smart() { return this.b[this.o] < 128 ? this.u8() : this.u16() - 32768; }
  bigSmart() { return this.b.readInt8(this.o) < 0 ? this.i32() & 0x7fffffff : this.u16(); }
  extendedSmart() { let total = 0, v = this.smart(); while (v === 32767) { total += 32767; v = this.smart(); } return total + v; }
  string() { const start = this.o; while (this.b[this.o] !== 0) this.o++; return this.b.toString("latin1", start, this.o++); }
  // A count byte followed by that many entries of `size` bytes.
  skipList(size) { const n = this.u8(); this.o += n * size; }
}

// The file ids of every group of an archive, from its reference table.
const tables = new Map();
async function table(archive) {
  if (tables.has(archive)) return tables.get(archive);
  const r = new Reader(await unpack(await cache.group(255, archive)));
  const protocol = r.u8();
  if (protocol >= 6) r.o += 4;
  const flags = r.u8();
  const number = () => (protocol >= 7 ? r.bigSmart() : r.u16());
  const count = number();
  const ids = [];
  for (let i = 0, id = 0; i < count; i++) ids.push((id += number()));
  if (flags & 1) r.o += 4 * count; // names
  r.o += 4 * count; // checksums
  if (flags & 8) r.o += 4 * count;
  if (flags & 2) r.o += 64 * count;
  if (flags & 4) r.o += 8 * count;
  r.o += 4 * count; // versions
  const fileCounts = ids.map(() => number());
  const files = new Map();
  ids.forEach((id, i) => {
    const list = [];
    for (let k = 0, file = 0; k < fileCounts[i]; k++) list.push((file += number()));
    files.set(id, list);
  });
  tables.set(archive, files);
  return files;
}

// The files of a group, by file id; null when the cache has no such group.
async function groupFiles(archive, group) {
  const ids = (await table(archive)).get(group);
  const stored = ids && (await cache.group(archive, group));
  if (!stored) return null;
  const data = await unpack(stored);
  if (ids.length === 1) return new Map([[ids[0], data]]);
  const chunks = data[data.length - 1];
  const r = new Reader(data);
  r.o = data.length - 1 - chunks * ids.length * 4;
  const parts = ids.map(() => []);
  let offset = 0;
  for (let chunk = 0; chunk < chunks; chunk++) {
    let size = 0;
    for (let i = 0; i < ids.length; i++) {
      size += r.i32();
      parts[i].push(data.subarray(offset, offset + size));
      offset += size;
    }
  }
  return new Map(ids.map((id, i) => [id, Buffer.concat(parts[i])]));
}

// Opcodes as in the client's object decoder (rendering.js, "LocType").
function decodeObject(bytes) {
  const r = new Reader(bytes);
  const d = { name: "null", sizeX: 1, sizeY: 1, actions: [], models: [], seqs: [], states: [] };
  for (;;) {
    const op = r.u8();
    if (op === 0) break;
    if (op === 1 || op === 6) { const n = r.u8(); for (let i = 0; i < n; i++) { d.models.push(op === 1 ? r.u16() : r.i32()); r.u8(); } }
    else if (op === 5 || op === 7) { const n = r.u8(); for (let i = 0; i < n; i++) d.models.push(op === 5 ? r.u16() : r.i32()); }
    else if (op === 2) d.name = r.string();
    else if (op === 14) d.sizeX = r.u8();
    else if (op === 15) d.sizeY = r.u8();
    else if ([19, 28, 29, 39, 69, 75, 81, 91, 95, 96, 104, 178].includes(op)) r.o += 1;
    else if ([17, 18, 21, 22, 23, 25, 27, 62, 64, 73, 74, 88, 89, 90, 94, 103, 105, 168, 169, 177, 189, 190, 191].includes(op)) {}
    else if (op === 24) d.seqs.push(r.u16());
    else if ((op >= 30 && op < 39) || (op >= 150 && op < 155)) d.actions.push(r.string());
    else if (op === 40 || op === 41) r.skipList(4);
    else if ([44, 45, 60, 61, 65, 66, 67, 68, 70, 71, 72, 82, 107, 167].includes(op)) r.o += 2;
    else if (op === 77 || op === 92 || op === 97 || op === 98) {
      // The object shows one of several others, chosen by a game variable.
      const next = () => (op >= 97 ? r.u24() : r.u16());
      r.o += 4;
      if (op === 92 || op === 98) d.states.push(next());
      const n = r.u8();
      for (let i = 0; i <= n; i++) d.states.push(next());
    }
    else if (op === 78) r.o += 4;
    else if (op === 79) { r.o += 6; r.skipList(2); }
    else if (op === 93) r.o += 6;
    else if (op === 100) { r.o += 2; r.string(); }
    else if (op === 101) { r.o += 13; r.string(); }
    else if (op === 102) { r.o += 15; r.string(); }
    else if (op === 106) { const n = r.u8(); for (let i = 0; i < n; i++) { d.seqs.push(r.u16()); r.u8(); } }
    else if (op === 160) r.skipList(2);
    else if (op === 163) r.o += 4;
    else if (op === 170 || op === 171) r.smart();
    else if (op === 173) r.o += 4;
    else if (op === 249) { const n = r.u8(); for (let i = 0; i < n; i++) { const text = r.u8(); r.u24(); if (text) r.string(); else r.i32(); } }
    else throw new Error("unknown object opcode " + op);
  }
  d.actions = d.actions.filter((action) => action && action.toLowerCase() !== "hidden");
  d.seqs = d.seqs.filter((seq) => seq !== 65535);
  d.states = [...new Set(d.states.filter((id) => id !== 65535 && id !== 0xffffff))];
  return d;
}

// Opcodes as in the client's animation decoder (rendering.js, "SeqType"), for cache revision 226 and later.
function decodeAnimation(bytes) {
  const r = new Reader(bytes);
  const d = { frames: [], skeletal: -1, sounds: [] };
  for (;;) {
    const op = r.u8();
    if (op === 0) break;
    if (op === 1) {
      const n = r.u16();
      r.o += n * 2;
      const low = [];
      for (let i = 0; i < n; i++) low.push(r.u16());
      for (let i = 0; i < n; i++) d.frames.push(low[i] + r.u16() * 65536);
    }
    else if (op === 2 || op === 6 || op === 7) r.o += 2;
    else if (op === 3 || op === 17) r.skipList(1);
    else if (op === 4) {}
    else if ([5, 8, 9, 10, 11, 16].includes(op)) r.o += 1;
    else if (op === 12) r.skipList(4);
    else if (op === 13) d.skeletal = r.i32();
    else if (op === 14) { const n = r.u16(); for (let i = 0; i < n; i++) { r.o += 2; d.sounds.push(r.u16()); r.o += 4; } }
    else if (op === 15) r.o += 4;
    else if (op === 18) r.string();
    else if (op === 20) r.o += 5;
    else throw new Error("unknown animation opcode " + op);
  }
  return d;
}

// Opcodes as in the client's NPC decoder (rendering.js, "NpcType"), for Old School.
function decodeNpc(bytes) {
  const r = new Reader(bytes);
  const d = { name: "null", size: 1, models: [], seqs: [], transforms: [] };
  for (;;) {
    const op = r.u8();
    if (op === 0) break;
    if (op === 1) { const n = r.u8(); for (let i = 0; i < n; i++) d.models.push(r.u16()); }
    else if (op === 61) { const n = r.u8(); for (let i = 0; i < n; i++) d.models.push(r.i32()); }
    else if (op === 2) d.name = r.string();
    else if (op === 3 || (op >= 30 && op < 35) || (op >= 150 && op < 155)) r.string();
    else if (op === 12) d.size = r.u8();
    else if ([13, 14, 15, 16, 114, 116].includes(op)) d.seqs.push(r.u16());
    else if (op === 17 || op === 115 || op === 117) for (let i = 0; i < 4; i++) d.seqs.push(r.u16());
    else if (op === 40 || op === 41) r.skipList(4);
    else if (op === 60 || op === 160) r.skipList(2);
    else if (op === 62) r.skipList(4);
    // The client does not know opcode 130 and reads on from the next byte; every
    // NPC that has it (the Maggot King, 15742) decodes to its last byte that way.
    else if ([93, 99, 107, 109, 111, 112, 122, 123, 130, 141, 143, 145, 158, 159, 161, 162].includes(op)) {}
    else if ([100, 101, 119, 125, 128, 140, 163, 165, 168].includes(op)) r.o += 1;
    else if ([18, 44, 45, 95, 97, 98, 103, 124, 127, 137, 138, 139, 142, 144, 146].includes(op) || (op >= 74 && op <= 79) || (op >= 170 && op < 176)) r.o += 2;
    else if (op === 135 || op === 136) r.o += 3;
    else if (op === 113 || op === 155 || op === 164) r.o += 4;
    else if (op === 134) r.o += 9;
    else if (op === 102) {
      // One head icon per set bit: a sprite group and an index in it.
      for (let bits = r.u8(); bits !== 0; bits >>= 1) if (bits & 1) { r.bigSmart(); r.smart(); }
    }
    else if (op === 106 || op === 118) {
      // The NPC shows one of several others, chosen by a game variable.
      r.o += 4;
      if (op === 118) d.transforms.push(r.u16());
      const n = r.u8();
      for (let i = 0; i <= n; i++) d.transforms.push(r.u16());
    }
    else if (op === 121) r.skipList(4);
    else if (op === 249) { const n = r.u8(); for (let i = 0; i < n; i++) { const text = r.u8(); r.u24(); if (text) r.string(); else r.i32(); } }
    else throw new Error("unknown NPC opcode " + op);
  }
  d.seqs = [...new Set(d.seqs.filter((seq) => seq !== 65535))];
  d.transforms = [...new Set(d.transforms.filter((id) => id !== 65535))];
  return d;
}

// Opcodes as in the client's spot animation decoder (rendering.js, "SpotAnimType").
function decodeSpotAnimation(bytes) {
  const r = new Reader(bytes);
  const d = { model: -1, seq: -1 };
  for (;;) {
    const op = r.u8();
    if (op === 0) break;
    if (op === 1) d.model = r.u16();
    else if (op === 3) d.model = r.i32();
    else if (op === 2) d.seq = r.u16();
    else if (op === 4 || op === 5 || op === 6) r.o += 2;
    else if (op === 7 || op === 8) r.o += 1;
    else if (op === 9) r.string();
    // The client does not know opcode 10 and reads on from the next byte; the
    // definitions that have it (1460, the impact of Water Surge) decode to the
    // end that way.
    else if (op === 10) {}
    else if (op === 40 || op === 41) r.skipList(4);
    else throw new Error("unknown spot animation opcode " + op);
  }
  return d;
}

const objects = await groupFiles(2, 6);
const object = (id) => (objects.has(id) ? decodeObject(objects.get(id)) : null);

// The objects placed on a map square: { id, x, y, level, type, rotation }.
async function placed(region) {
  const files = await groupFiles(5, region);
  if (!files) throw new Error("the cache has no map square " + region);
  const r = new Reader(files.get(1));
  const list = [];
  for (let id = -1, step = r.extendedSmart(); step !== 0; step = r.extendedSmart()) {
    id += step;
    for (let position = 0, move = r.smart(); move !== 0; move = r.smart()) {
      position += move - 1;
      const attributes = r.u8();
      list.push({ id, x: (position >> 6) & 63, y: position & 63, level: position >> 12, type: attributes >> 2, rotation: attributes & 3 });
    }
  }
  return { list, terrain: files.get(0) };
}

function describe(id) {
  const d = object(id);
  return [
    id, JSON.stringify(d.name), d.sizeX + "x" + d.sizeY,
    d.actions.length ? "[" + d.actions.join("|") + "]" : "",
    "models:" + d.models.join(","),
    d.seqs.length ? "anim:" + d.seqs.join(",") : "",
    d.states.length ? "states:" + d.states.join(",") : "",
  ].filter(Boolean).join(" ");
}

if (command === "info") {
  const [first, second] = args;
  if (first?.startsWith("name:") || first?.startsWith("model:")) {
    const byName = first.startsWith("name:") && new RegExp(first.slice(5), "i");
    const models = first.startsWith("model:") && first.slice(6).split(",").map(Number);
    for (const id of objects.keys()) {
      let d;
      try { d = object(id); } catch { continue; }
      if (byName ? byName.test(d.name) : d.models.some((model) => models.includes(model))) console.log(describe(id));
    }
  } else {
    for (let id = Number(first); id <= Number(second ?? first); id++) if (objects.has(id)) console.log(describe(id));
  }
} else if (command === "npc" || command === "spot") {
  const files = await groupFiles(2, command === "npc" ? 9 : 13);
  for (const id of args.map(Number)) console.log(id, files.has(id) ? JSON.stringify((command === "npc" ? decodeNpc : decodeSpotAnimation)(files.get(id))) : "not in the cache");
} else if (command === "map") {
  for (const region of args.map(Number)) {
    const { list, terrain } = await placed(region);
    console.log("map square " + (region >> 8) + "," + (region & 255) + " (region " + region + "): " + list.length + " objects");
    const byId = Map.groupBy(list, (loc) => loc.id);
    for (const id of [...byId.keys()].sort((a, b) => a - b)) {
      const at = byId.get(id);
      const where = at.slice(0, 6).map((loc) => "(" + loc.x + "," + loc.y + " level " + loc.level + " type " + loc.type + " rotation " + loc.rotation + ")");
      console.log(describe(id) + " x" + at.length + " " + where.join(" ") + (at.length > 6 ? " ..." : ""));
    }
    // Floor plan of level 0, north at the top.
    const r = new Reader(terrain);
    const plan = Array.from({ length: 64 }, () => new Array(64).fill(" "));
    for (let level = 0; level < 4; level++)
      for (let x = 0; x < 64; x++)
        for (let y = 0; y < 64; y++)
          for (;;) {
            const attribute = r.u16();
            if (attribute === 0) break;
            if (attribute === 1) { r.u8(); break; }
            if (attribute <= 49) r.u16();
            if (level === 0 && (attribute <= 49 || attribute > 81)) plan[x][y] = ".";
          }
    for (const loc of list) {
      if (loc.level !== 0 || loc.type === 22) continue;
      const d = object(loc.id);
      const wide = loc.type >= 9 ? (loc.rotation & 1 ? d.sizeY : d.sizeX) : 1;
      const deep = loc.type >= 9 ? (loc.rotation & 1 ? d.sizeX : d.sizeY) : 1;
      const mark = d.actions.length ? "@" : loc.type < 9 ? "#" : "o";
      for (let x = loc.x; x < Math.min(64, loc.x + wide); x++)
        for (let y = loc.y; y < Math.min(64, loc.y + deep); y++) if (plan[x][y] !== "@") plan[x][y] = mark;
    }
    console.log("level 0: @ object with an action, # wall, o other object, . floor");
    for (let y = 63; y >= 0; y--) console.log(String(y).padStart(2) + " " + plan.map((column) => column[y]).join(""));
    console.log("   " + Array.from({ length: 64 }, (_, x) => x % 10).join(""));
  }
} else if (command === "where") {
  const ids = new Set(args.map(Number));
  for (const region of (await table(5)).keys()) {
    let list;
    try { ({ list } = await placed(region)); } catch { continue; }
    const found = list.filter((loc) => ids.has(loc.id));
    if (found.length) console.log("region " + region + " (" + (region >> 8) + "," + (region & 255) + "): " + found.map((loc) => loc.id + "@" + loc.x + "," + loc.y + " level " + loc.level + " rotation " + loc.rotation).join(" "));
  }
} else if (command === "deps") {
  const add = args.includes("--add");
  const need = new Set();
  const ids = new Set();
  const seqs = new Set();
  // The animations whose frames' sounds are needed too: those of an NPC, an
  // animation or a spot animation that was asked for.
  const soundSeqs = new Set();
  const npcs = [];
  const addSeq = (seq) => { if (seq >= 0) { seqs.add(seq); soundSeqs.add(seq); } };
  for (const arg of args.filter((a, index) => a !== "--add" && a !== "--to" && args[index - 1] !== "--to")) {
    if (arg.startsWith("sound:") || arg.startsWith("group:")) {
      // Named outright: checked here, since nothing below reads it.
      const pair = arg.startsWith("sound:") ? "4/" + arg.slice(6) : arg.slice(6).replace(":", "/");
      if (!/^\d+\/\d+$/.test(pair) || !(await cache.group(...pair.split("/").map(Number)))) throw new Error("the cache has no group for " + arg);
      need.add(pair);
    }
    else if (arg.startsWith("loc:")) ids.add(Number(arg.slice(4)));
    else if (arg.startsWith("npc:")) npcs.push(Number(arg.slice(4)));
    else if (arg.startsWith("seq:")) addSeq(Number(arg.slice(4)));
    else if (arg.startsWith("spot:")) {
      const file = (await groupFiles(2, 13)).get(Number(arg.slice(5)));
      if (!file) throw new Error("the cache has no spot animation " + arg.slice(5));
      const d = decodeSpotAnimation(file);
      if (d.model >= 0) need.add("7/" + d.model);
      addSeq(d.seq);
    }
    else {
      need.add("5/" + arg);
      for (const loc of (await placed(Number(arg))).list) ids.add(loc.id);
    }
  }
  // An NPC that turns into others brings those along.
  for (let i = 0; i < npcs.length; i++) {
    const file = (await groupFiles(2, 9)).get(npcs[i]);
    if (!file) throw new Error("the cache has no NPC " + npcs[i]);
    const d = decodeNpc(file);
    for (const model of d.models) need.add("7/" + model);
    d.seqs.forEach(addSeq);
    for (const id of d.transforms) if (!npcs.includes(id)) npcs.push(id);
  }
  const visit = (id) => {
    if (!objects.has(id)) return;
    const d = object(id);
    for (const model of d.models) need.add("7/" + model);
    for (const seq of d.seqs) seqs.add(seq);
    return d.states;
  };
  for (const id of ids) for (const state of visit(id) ?? []) visit(state);
  const animations = await groupFiles(2, 12);
  for (const seq of seqs) {
    if (!animations.has(seq)) continue;
    const d = decodeAnimation(animations.get(seq));
    if (soundSeqs.has(seq)) for (const sound of d.sounds) need.add("4/" + sound);
    for (const group of new Set(d.frames.map((frame) => frame >>> 16))) {
      need.add("0/" + group);
      // Each frame names the skeleton it moves.
      for (const frame of (await groupFiles(0, group))?.values() ?? []) need.add("1/" + frame.readUInt16BE(0));
    }
    if (d.skeletal >= 0) {
      need.add("22/" + (d.skeletal >>> 16));
      const file = (await groupFiles(22, d.skeletal >>> 16))?.get(d.skeletal & 65535);
      if (file) need.add("1/" + file.readUInt16BE(1));
    }
  }
  // With --to, what the base list and that encounter's own lack: what another encounter lists does not count, so that
  // each list is whole without the others. Without it, what no list has.
  const ownFile = to === undefined ? null : path.join(groupsDirectory, to + ".json");
  const lists = readGroupFiles();
  const listed = mergeGroups(lists.filter(({ file }) => !ownFile || file === baseFile || file === ownFile).map(({ groups }) => groups));
  const missing = [...need].map((pair) => pair.split("/").map(Number)).filter(([archive, group]) => !listed[archive]?.includes(group));
  let bytes = 0;
  for (const [archive, group] of missing) bytes += (await cache.group(archive, group))?.length ?? 0;
  console.log(need.size + " groups needed, " + missing.length + " not in " + (ownFile ? "the base list or that of " + to : "any list") + " (" + bytes + " bytes): " + missing.map((pair) => pair.join("/")).join(" "));
  if (add && missing.length) {
    const own = lists.find(({ file }) => file === ownFile)?.groups ?? {};
    for (const [archive, group] of missing) (own[archive] ??= []).push(group);
    await fs.mkdir(groupsDirectory, { recursive: true });
    await fs.writeFile(ownFile, formatGroups(own));
    console.log("added to tools/assets/cache-groups/" + to + ".json; rebuild with: npm run assets -- --force");
  }
} else {
  console.log("usage: node tools/cache-objects.mjs map <region>... | info <id> [to] | info name:<regex> | info model:<id,...> | where <id>... | deps [--add --to <name>] <region | loc:id | npc:id | seq:id | spot:id | sound:id | group:index:id>... | npc <id>... | spot <id>...");
  process.exitCode = 1;
}
