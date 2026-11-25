// Vite's glob import, for Node. client/encounters/registry.js and
// presentations.js find the encounters with
//
//   import.meta.glob("./*/encounter.js", { eager: true })
//
// which Vite turns into one import per file and an object of the modules by
// their paths ("./yama/encounter.js"), in the browser and in the build. Node
// has no such function: the module hooks (node-hooks.mjs) rewrite the call the
// same way, and tools/check-import-graph.mjs asks which files it stands for.
//
// Only that one form is known, a file of a fixed name in each directory beside
// the module, loaded at once. Any other call is refused here instead of being
// read differently from Vite.
import { existsSync, readdirSync, statSync } from "node:fs";

const globCall = /import\.meta\.glob\("\.\/\*\/([\w.-]+\.js)", \{ eager: true \}\)/g;

/** The files a module's glob imports stand for, as "./<directory>/<file>", by name; `directory` is the module's own. */
export function importGlobFiles(source, directory) {
  return [...source.matchAll(globCall)].flatMap(([, file]) =>
    readdirSync(directory).sort().filter((name) => statSync(`${directory}/${name}`).isDirectory() && existsSync(`${directory}/${name}/${file}`)).map((name) => `./${name}/${file}`),
  );
}

/** The source with every glob import written out. The imports go in front of the first line, so that no line moves. */
export function expandImportGlobs(source, directory) {
  let imports = "";
  let count = 0;
  const expanded = source.replace(globCall, (call) => {
    const entries = importGlobFiles(call, directory).map((path) => {
      const name = `__glob_${count++}`;
      imports += `import * as ${name} from ${JSON.stringify(path)}; `;
      return `${JSON.stringify(path)}: ${name}`;
    });
    return `({ ${entries.join(", ")} })`;
  });
  if (/import\.meta\.glob\(/.test(expanded)) throw new Error('a glob import that Node cannot read: only import.meta.glob("./*/<file>.js", { eager: true }) is known (tools/determinism/import-glob.mjs)');
  return imports + expanded;
}
