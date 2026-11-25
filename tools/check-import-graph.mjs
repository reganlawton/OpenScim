// Checks the two rules of docs/ARCHITECTURE.md ("The import cycle") for the
// modules under client/engine, client/encounters, client/data and
// client/util:
//
//   1. None of them imports a chunk of client/assets/ (vendor.js excepted).
//      The last one that did, createSimulationEngine.js, takes the encounter
//      registry from client/encounters/registry.js now.
//   2. They import each other without a cycle, except inferno/waves.js and
//      inferno/spawnLayout.js, which use each other inside functions only.
//
//   node tools/check-import-graph.mjs [root]      (root defaults to ".")
//
// Exits 1 when either rule is broken, and says by which import.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { parse } from "@babel/parser";
import { importGlobFiles } from "./determinism/import-glob.mjs";

const root = (process.argv[2] ?? ".").replace(/\\/g, "/");
const allowedChunkImports = new Set(); // none is allowed any more
const allowedCycles = new Set(["client/encounters/inferno/spawnLayout.js <-> client/encounters/inferno/waves.js"]);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = posix.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : full.endsWith(".js") ? [full] : [];
});
const files = ["client/engine", "client/encounters", "client/data", "client/util"].map((dir) => posix.join(root, dir)).filter((dir) => existsSync(dir)).flatMap(walk);
const short = (file) => (root === "." ? file : file.slice(root.length + 1));
const graph = new Map(), chunkImports = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const sources = parse(text, { sourceType: "module" }).program.body
    .filter((statement) => (statement.type === "ImportDeclaration" || statement.type === "ExportNamedDeclaration" || statement.type === "ExportAllDeclaration") && statement.source)
    .map((statement) => statement.source.value)
    // The registry finds the encounters with a glob import: the files it stands for are imports too.
    .concat(importGlobFiles(text, posix.dirname(file)));
  const targets = sources.map((source) => (source.startsWith("/") ? posix.join(root, "client", source) : /^\.\.?\//.test(source) ? posix.join(posix.dirname(file), source) : null)).filter(Boolean);
  graph.set(file, targets.filter((target) => files.includes(target)));
  for (const target of targets) if (short(target).startsWith("client/assets/") && !target.endsWith("/vendor.js")) chunkImports.push(`${short(file)} -> ${short(target)}`);
}

// Tarjan's strongly connected components.
let index = 0;
const stack = [], indices = new Map(), low = new Map(), onStack = new Set(), cycles = [];
const visit = (node) => {
  indices.set(node, index); low.set(node, index); index++;
  stack.push(node); onStack.add(node);
  for (const next of graph.get(node)) {
    if (!indices.has(next)) { visit(next); low.set(node, Math.min(low.get(node), low.get(next))); }
    else if (onStack.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
  }
  if (low.get(node) === indices.get(node)) {
    const component = [];
    let member;
    do { member = stack.pop(); onStack.delete(member); component.push(member); } while (member !== node);
    if (component.length > 1 || graph.get(node).includes(node)) cycles.push(component.map(short).sort().join(" <-> "));
  }
};
for (const file of files) if (!indices.has(file)) visit(file);

const badChunkImports = chunkImports.filter((entry) => !allowedChunkImports.has(entry));
const badCycles = cycles.filter((cycle) => !allowedCycles.has(cycle));
console.log(`${files.length} modules, ${[...graph.values()].reduce((sum, list) => sum + list.length, 0)} imports among them; ${chunkImports.length} ${chunkImports.length === 1 ? "import" : "imports"} of a chunk, ${cycles.length} ${cycles.length === 1 ? "cycle" : "cycles"}`);
for (const entry of chunkImports) console.log(`  ${allowedChunkImports.has(entry) ? "known" : "NEW  "} chunk import: ${entry}`);
for (const cycle of cycles) console.log(`  ${allowedCycles.has(cycle) ? "known" : "NEW  "} cycle: ${cycle}`);
if (badChunkImports.length || badCycles.length) {
  console.error("The import graph broke a rule of docs/ARCHITECTURE.md, \"The import cycle\".");
  process.exit(1);
}
