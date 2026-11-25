<!-- Keep the headings; write "None" where one does not apply. -->

## What

<!-- What this adds or changes, and for a fight: what works, what is inferred or missing. -->

## Sources

<!-- For game behaviour: the wiki pages, the recordings (how many, of what), the cache. -->

## Shared files

<!--
Every file changed outside what is yours: your fight's directory, its tests,
its scenario file and its digests. One line each, with the reason.

A change to how existing code in client/engine/, client/assets/ or
client/encounters/shared/ behaves belongs in a pull request of its own, merged
before this one: link it here. A hook or field that is new, optional and
changes nothing for the other fights may come with the fight, as a commit of
its own.
-->

## Built on

<!-- "main", or "#N" when this branch contains another open pull request's commits (CONTRIBUTING.md, "Stacked branches"). -->

## Checks

| Check | Result |
|---|---|
| `node tools/determinism/harness.mjs` | |
| `node tools/check-import-graph.mjs` | |
| `node tools/check-test-markers.mjs` | |
| `npm test` | |
| `npm run build` | |

<!-- Digests recorded: only your own (`--update --only <yours>/`). Say so if any other changed, and why. -->
