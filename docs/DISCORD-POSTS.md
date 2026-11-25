# Posts in the Discord's #bosses

Every fight being built has a post in the `#bosses` channel of the
[Discord](https://discord.gg/openscim) (`CONTRIBUTING.md`, "Before you start a
fight"). Progress, logs and bugs of that fight go in it. These are the
templates of the Discord's `#start-here`, word for word; when one of them
changes, change the other.

An agent gives the filled-in template to its user in a code block, to be
pasted. It does not post.

## A boss's post

Its first message, edited as things change:

```text
**Builder:**
**Helping:**
**Building:** normal / awakened / which phases
**Branch or draft PR:**
**Shared files changed:** none yet

**Works**
-

**Missing or wrong**
-

**Logs needed**
-

**Sources:** wiki page, log file names
```

- Every line and section of the template, in its order, the empty ones too,
  and none of your own. A change to the engine goes under "Shared files
  changed".
- The sections' titles are bold (`**Works**`), not headings (`## Works`).
- Lists are flat: one `-` a line, nothing nested.
- A link is its address in angle brackets (`<https://...>`), so that Discord
  shows no preview of it; not `[text](https://...)`.
- File names are in backticks, without their directory where the name is
  enough. `registry.js`, `presentations.js`, `encounterKinds.js` and the
  digests change with every boss: "the usual lists" will do.
- "Works" is what has been seen to work. "Missing or wrong" is what is known
  not to. What nobody knows is under "Logs needed", as what a log would settle.
- "Sources" names the wiki page and each log file by its name, or says that
  there is no log yet.
- 2000 characters at most: Discord takes no longer message.
- The status (`Up for grabs`, `In progress`, `In review`, `Live`) is the post's
  tag and is not written in it.

## A log

In the boss's post, with the `.jsonl.gz` attached to the same message. A log is
never put in a pull request.

```text
**Log:** boss and version, kill / death / left
**Shows:** what's worth looking at, and roughly when
**Gear:**
**Plugin:** Outside / Encounter Recorder, and its version
**Alone in it:** yes / no
```

## A bug

In the boss's post. If it is on the live site, open a GitHub issue too.

```text
**Where:** boss, phase, live site or which branch
**What happens:**
**What should happen:**
**Proof:** log file name, clip or wiki link
**How to make it happen:**
```
