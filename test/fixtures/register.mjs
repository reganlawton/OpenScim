// How the fixture encounter is registered. A real encounter is found by its
// directory: client/encounters/registry.js and presentations.js take every
// encounter.js and presentation.js beside them (docs/ADDING-AN-ENCOUNTER.md).
// The fixture is outside client/, so that the site never has it; its two
// modules are added to what those two found, when the module is loaded. The
// determinism harness does that through its module hooks
// (tools/determinism/node-hooks.mjs), a browser test through the requests of
// its page (serveFixture below). From there on the fixture is registered,
// ordered and checked as every encounter is.
//
// Each entry: the client module, a line of it that occurs once, what that
// line becomes, and the import the new line needs. The import goes to the
// end of the module, so the modules it loads are evaluated in the order
// they always were.
import { readFileSync } from "node:fs";

/** Where the fixture's modules are served from, and where they are on disk. */
export const fixtureUrlPrefix = "/test-fixtures/";
export const fixtureDirectory = new URL("./", import.meta.url);

export const registrations = [
  {
    module: "encounters/registry.js",
    find: "const encounterModules = Object.entries(foundModules);",
    replace: 'const encounterModules = Object.entries({ ...foundModules, "./training-ground/encounter.js": trainingGroundEncounter });',
    importLine: 'import * as trainingGroundEncounter from "/test-fixtures/training-ground/encounter.js";',
  },
  {
    module: "encounters/presentations.js",
    find: "const presentationModules = Object.entries(foundModules);",
    replace: 'const presentationModules = Object.entries({ ...foundModules, "./training-ground/presentation.js": trainingGroundPresentation });',
    importLine: 'import * as trainingGroundPresentation from "/test-fixtures/training-ground/presentation.js";',
  },
];

/** The source of a client module with the fixture registered; `path` is relative to client/. Other modules come back as they are. */
export function registerFixture(path, source) {
  const registration = registrations.find((entry) => path === entry.module);
  if (!registration) return source;
  if (source.split(registration.find).length !== 2) throw new Error(`${path}: expected once: ${registration.find}`);
  return source.replace(registration.find, registration.replace) + (registration.importLine ? "\n" + registration.importLine + "\n" : "");
}

/** For a Playwright page: serves the fixture's modules and registers the fixture in the two client modules as they are served. */
export async function serveFixture(page) {
  await page.route("**" + fixtureUrlPrefix + "**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(path.slice(fixtureUrlPrefix.length), fixtureDirectory);
    return route.fulfill({ contentType: "text/javascript", body: readFileSync(file, "utf8") });
  });
  for (const { module } of registrations) {
    await page.route("**/" + module + "*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: registerFixture(module, await response.text()) });
    });
  }
}
