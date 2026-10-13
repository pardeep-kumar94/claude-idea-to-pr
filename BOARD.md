# Feature Line board

A local page that lives in this skill: `board/index.html`. It covers every project the skill is used in. Open it with `node scripts/board.mjs open` from inside a project, and it opens on that project (paths here are relative to this skill's folder). It re-reads its data every few seconds, so it follows `/feature` live. Tapping a stage on the line opens what was decided there.

Each feature is one JSON file in `board/features/<id>.json`. Write the board **only** through `scripts/board.mjs`, never by editing the files: the script stamps `updatedAt` and log times itself, caps the log, and rebuilds the small files the page loads from `board/data/`:
- a list of projects and everything waiting on you;
- one summary file per project;
- one file per feature with its stage details.

The page only loads the project on screen, and a feature's details only when one of its stages is opened, so it stays fast however many features and projects pile up.

**Project:** a feature's `repo` field names its project: the git remote's `owner/name`, else the repo folder's name. Run `node scripts/board.mjs project` from the project folder to get it. `create` fills it in from the current folder when it's left out. Features in different folders of one repo share that repo's project.

```
node scripts/board.mjs project                              # this folder's project key
node scripts/board.mjs list --project <key> --open          # that project's features whose pr isn't done
node scripts/board.mjs get <id>
node scripts/board.mjs create <id> '<json>'                 # stages default to todo; logs "Feature started"
node scripts/board.mjs update <id> '<json>' [--log "<text>"] # deep merge: objects merge, arrays replace, null clears
node scripts/board.mjs detail <id> <stage> '<json>'         # add a detail block; same title replaces it
node scripts/board.mjs log <id> "<text>"
node scripts/board.mjs session <id>                         # record this Claude Code session and folder
node scripts/board.mjs open
```

`<json>` can be `@file.json` instead of inline text. Use a file for anything long, such as a doc block's `body`, so that quoting can't break it.

## Document

`id` = `<repo name>--<feature-slug>`, e.g. `TestRepoBasicLogin--password-reset`.

```json
{
  "title": "Password reset",
  "repo": "pardeep-kumar94/TestRepoBasicLogin",
  "color": "#2b7d52",
  "specIssue": 9,
  "prNumber": null,
  "stages": {
    "grill":     { "status": "done", "note": "3 rounds", "details": [ … ] },
    "prototype": { "status": "skipped", "note": "no UI" },
    "spec":      { "status": "active", "note": "" },
    "tickets":   { "status": "todo" },
    "build":     { "status": "todo" },
    "review":    { "status": "todo" },
    "pr":        { "status": "todo" }
  },
  "waitingOnYou": null,
  "tickets": [{ "number": 10, "title": "Request a reset link", "state": "open", "url": "https://github.com/…/issues/10" }],
  "tests": { "passed": 61, "failed": 0, "at": "<date -u>" },
  "links": { "Spec #9": "https://…", "PR #12": "https://…" },
  "log": [{ "at": "…", "text": "Spec #9 published" }]
}
```

- **`status`:** `todo`, `active`, `waiting` (needs the user), `done`, or `skipped`. Only one stage is `active` or `waiting` at a time.
- **Ticket `state`:**
  - `open`: not started.
  - `in-progress`: being built, or built with a closing commit but not merged.
  - `closed`: only once GitHub shows the issue closed.
- **`color`:** pick a new hex colour per feature, so features look different on the board. Its text must read clearly on white and on near-black.
- **`log`:** the page shows the newest 5 entries. The script keeps the newest 20.
- **Stage times:** the script stamps each stage's `startedAt` when it first becomes `active` or `waiting`, and its `finishedAt` when it becomes `done`. The page uses them to show how long each stage took. Don't write them yourself: just set statuses at the moment they really change.
- **Search:** every detail block is indexed for the page's search automatically. Nothing to do beyond recording details.
- **`sessions` and `cwd`:** written by `session`. The board uses them for its "Continue in Claude Code" button (a `claude-cli://open` link to `cwd` with `/feature` pre-filled) and a "Copy resume command" per session (`claude --resume <id>`).
- **`tests.at`:** the one time you write yourself. Take it from `date -u +%Y-%m-%dT%H:%M:%SZ`.
- **`waitingOnYou`:** one sentence saying what the user must do and where, e.g. "Pick a prototype variant at http://localhost:5180/…". Set it to `null` when nothing is pending.
- **When the PR merges:** set `pr` to `done`, set each merged ticket's state to `closed`, and set `waitingOnYou` to `null`. The feature then counts as shipped.

## Stage details

`stages.<stage>.details` is what the page shows when that stage is tapped: a list of blocks, each with a `title` and a `kind`. Add them with `detail`. A block with the same title is replaced, so a block can be updated as the stage goes on.

| kind | fields | use it for |
|---|---|---|
| `qa` | `items: [{ q, recommended, answer }]` | one block per grilling round, with the user's actual answer |
| `doc` | `path`, `body` (Markdown) | a snapshot of a file the stage wrote or changed: the glossary entries, an ADR |
| `list` | `items: [string \| { text, href, meta }]` | variants, issues, tickets, findings, commits |
| `note` | `body` | a short verdict or decision in prose |

Text in every field may use inline Markdown: `` `code` ``, `**bold**`, `_italic_`, `[text](https://…)`.

What each stage records:

- **grill:** a `qa` block per round. A `doc` block with the glossary entries added or changed, and one per ADR written. If no ADR was written, a `note` saying so and why.
- **prototype:** a `list` of the variants with the chosen one marked, a `note` with the verdict and anything it exposed, and a `list` with the branch and its commits.
- **spec:** a `list` with the spec issue, a `note` with the agreed seam, and a `list` of the key decisions.
- **tickets:** a `list` of the breakdown as proposed, then as published with each issue's link and its blockers.
- **build:** for each ticket, its closing commit and the test counts you just saw.
- **review:** a `list` of the findings, each marked fixed or accepted.
- **pr:** a `list` with the PR link and its state.
