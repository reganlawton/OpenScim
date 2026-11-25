# Contributing to OpenScim

Thanks for helping. OpenScim is a browser-based Old School RuneScape combat
simulator, licensed MIT or Apache 2.0 at your option. By contributing you
agree your work is released under the same terms.

## Setup

Requires Node 22+ and, for the tests, Chrome.

```sh
git clone https://github.com/realkadera/OpenScim.git
cd OpenScim
npm install
npm run assets   # game cache and media, about 230 MB, once
npm run dev      # http://127.0.0.1:5173/
```

Read `README.md`, then `docs/ARCHITECTURE.md`. `AGENTS.md` holds the full
rules and known pitfalls.

## Where to help

- **New fights**: check that nobody is building it (below), then follow
  `docs/ADDING-AN-ENCOUNTER.md`.
- **Readability**: most of the client was reconstructed from published
  bundles and still has short machine names. Renames and cleanup are welcome,
  as long as behaviour stays the same.
- **Missing images**: 62 images have no public source yet; `ROADMAP.md`,
  phase 3, lists them.
- **Accuracy**: a mechanic that differs from the real game. Open an issue with
  a recording or clip if you have one.

The wider plan is in `ROADMAP.md`.

## Before you start a fight

Every fight being built has a post in the `#bosses` channel of the
[Discord](https://discord.gg/openscim):

- **No post**: nobody is on it. Make one, tag it `In progress`, and link a
  draft pull request within 3 days.
- **`Up for grabs`**: say in the post that you are taking it.
- **`In progress` or `In review`**: taken. Ask in the post how you can help.

Not on Discord? Check the open pull requests, then open a draft of your own
early so that others can see it.

## Before you open a pull request

```sh
node tools/determinism/harness.mjs   # every scenario "ok"
node tools/check-import-graph.mjs    # exit 0
node tools/check-test-markers.mjs    # 0 lost
npm test                             # all files pass, about 7 minutes
npm run build
```

If a scenario of an encounter you did not touch turns `DIFFERENT`, your change
broke it; fix the change, do not re-record the digest. Record only your own:
`node tools/determinism/harness.mjs --update --only <yourkind>/`.

## Yours and shared

Two people building two fights should not have to edit the same file.

- **Yours**: your fight's directory under `client/encounters/`, its tests,
  its scenario file and its digests. To change another fight's directory,
  ask its author in the pull request.
- **Shared**: everything else, above all `client/engine/`,
  `client/assets/` and `client/encounters/shared/`.

A change to how shared code behaves goes in a pull request of its own,
merged before the fight that needs it, with every scenario "ok": it reaches
every fight, and is reviewed for that. A fight's pull request may carry a
hook or a field that is new, optional and changes nothing for the other
fights, as a commit of its own, named under "Shared files" in the pull
request.

If your fight needs a bundle to know something about it (its map square, an
NPC id, its kind), do not write that into the bundle. Open an issue titled
"Seam: what you need": the bundle should read it from your encounter.

## Stacked branches

Pull requests are squash-merged, so a branch built on another open pull
request conflicts with `main` once that one is merged. Avoid it where you
can. Where you cannot, say "Built on #N" in the pull request, and when #N
is merged:

```sh
git fetch origin
git rebase --onto origin/main <last commit of #N on your branch> <your branch>
git push --force-with-lease
```

## Rules

- **Never commit game data**: cache files, models, sprites, sounds, fonts,
  recordings. They belong to Jagex Ltd. `.gitignore` covers them; do not
  force-add.
- Every game number in code names its source in a comment: `WIKI`, `OBS`
  (recorded from the game), `CACHE`, `TABLE` (`client/data/monsters.js`) or
  `inferred`. Recorded game behaviour wins over the wiki.
- Randomness only from the seeded generators in `client/engine/random.js`.
- Avoid editing `client/assets/`. If your feature needs it, say so in the PR
  and keep the edit minimal ("Yours and shared" above).
- Modules under `client/encounters/` must not import `client/assets/` chunks
  or create import cycles.
- Existing encounters must not change behaviour unless that is the point of
  the PR.
- One kind of change per commit.

## Questions

Ask in the [Discord](https://discord.gg/openscim) or open an issue.
