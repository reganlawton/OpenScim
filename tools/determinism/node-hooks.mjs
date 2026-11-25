// Module hooks that let Node import the client chunks as they are served.
// Registered by harness.mjs. Nothing here changes what the game code does;
// one thing is added to it: the fixture encounter of test/fixtures/, which
// the harness registers the way a contributor registers an encounter.
//
//   "/toa/zebak/native.js"   web-root imports resolve under client/
//   "*.css"                  stylesheet imports become empty modules
//   "@foxglove/wasm-bz2/..." the bzip2 decoder's Node branch asks for the npm
//                            package; give it the copy the browser loads
//   "/test-fixtures/..."     the fixture's modules, from test/fixtures/
//   two client modules       get the fixture's lines when they are loaded
//                            (test/fixtures/register.mjs says which)
//   import.meta.glob(...)    Vite's glob import, by which the registry finds
//                            the encounters, is written out (import-glob.mjs)
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixtureDirectory, fixtureUrlPrefix, registerFixture } from "../../test/fixtures/register.mjs";
import { expandImportGlobs } from "./import-glob.mjs";

const clientRoot = pathToFileURL(process.cwd() + "/client/").href;
const bzip2 = "determinism:bzip2";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@foxglove/wasm-bz2/wasm/module.js") return { url: bzip2, shortCircuit: true };
  if (specifier.startsWith(fixtureUrlPrefix)) return nextResolve(new URL(specifier.slice(fixtureUrlPrefix.length), fixtureDirectory).href, context);
  if (specifier.startsWith("/")) return nextResolve(clientRoot + specifier.slice(1), context);
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
  if (url.startsWith(clientRoot)) {
    const loaded = await nextLoad(url, context);
    if (loaded.source === undefined || loaded.source === null) return loaded;
    const source = String(loaded.source);
    const registered = expandImportGlobs(registerFixture(url.slice(clientRoot.length), source), dirname(fileURLToPath(url)));
    return registered === source ? loaded : { ...loaded, source: registered };
  }
  if (url !== bzip2) return nextLoad(url, context);
  // client/bzip2-module.js is a CommonJS script; run it with a module object
  // and hand the factory the wasm bytes, as the browser branch does.
  const root = JSON.stringify(clientRoot);
  return {
    format: "module",
    shortCircuit: true,
    source: `
      import { readFileSync } from "node:fs";
      const module = { exports: {} };
      new Function("module", "exports", "require", "__filename", "__dirname", readFileSync(new URL("bzip2-module.js", ${root}), "utf8"))(
        module, module.exports, () => "", "bzip2-module.js", ".");
      export default () => module.exports({ wasmBinary: readFileSync(new URL("bzip2.wasm", ${root})) });`,
  };
}
