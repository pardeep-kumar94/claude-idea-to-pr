---
name: feature
description: Runs a feature end to end — grill, prototype, spec, tickets, build with TDD, code review, PR — resuming wherever the feature stands and stopping at each decision that belongs to the user, while keeping the Feature Line board current. Use when the user says /feature, wants to start or continue building a feature, asks what's next on a feature, or wants its board status updated.
---

# Feature

`/feature <idea>` starts a feature. `/feature` alone continues the one in progress. The order is fixed; nobody has to remember it.

## Stages

| # | Stage key | Run | Done when | Stop for the user |
|---|---|---|---|---|
| 1 | `grill` | `/grill-with-docs` | user confirms shared understanding | each round's answers |
| 2 | `prototype` | `/prototype` | variant chosen, prototype on a `prototype/*` branch | picking the variant |
| 3 | `spec` | `/to-spec` | spec issue published | seam check |
| 4 | `tickets` | `/to-tickets` | sub-issues of the spec exist | approving the breakdown |
| 5 | `build` | `/implement` with `/tdd`, one ticket at a time in blocking order | every ticket has a commit that closes it | — |
| 6 | `review` | `/code-review` | findings fixed or explicitly accepted | which findings to fix |
| 7 | `pr` | `/pr` (body starts `Implements #<spec>`), then push and open the PR | PR merged | before any push; the merge |

Skip `prototype` (mark it `skipped`) when the feature has no UI. Never skip anything else without the user saying so.

**Running the stage skills.** Invoke every stage's skill yourself with the Skill tool, and follow it rather than copying its steps by hand. If one refuses model invocation (its `disable-model-invocation` flag came back, e.g. after an update), set that stage to `waiting` with `waitingOnYou` set to `Type /<skill> in Claude Code to …`, tell the user the exact command, and stop. The next `/feature` run picks up after it.

## Every run

1. **Setup.** If `docs/agents/` is missing, run `/setup-matt-pocock-skills` first.
2. **Find the feature.** Get this folder's project with `board.mjs project`, then list that project's open features on the board (see [BOARD.md](BOARD.md)): those whose `pr` stage isn't `done`. Features from other projects never count here. An idea was given → resume the open feature it matches, otherwise create a new one (even if others are open). No idea and one open → resume it. Several open → ask which. None and no idea → ask what to build.
3. **Record this session.** Once the feature is found or created, run `board.mjs session <id>` from the project folder. It notes this Claude Code session and folder on the feature, so the board can lead back here.
4. **Trust GitHub over the board.** With a spec issue, run `scripts/github-state.sh <spec-number>` and reconcile: ticket states, PR state, merge. Fix the board if it disagrees.
5. **Run the first stage that isn't `done` or `skipped`.** Mark it `active` on the board before starting.
6. **At each stop for the user:** set the stage to `waiting` and `waitingOnYou` to one plain sentence naming what you need, then ask in the conversation. On their answer, clear `waitingOnYou` and set it back to `active`.
7. **Record details as they happen.** Whenever a stage settles something, such as a grilling round being answered, a glossary entry or ADR written, a variant chosen, a seam agreed or tickets published, add or replace that stage's detail block right away (see **Stage details** in [BOARD.md](BOARD.md)). These blocks are what the user sees when they tap the stage.
8. **When a stage finishes:** set it `done` with a short `note` (e.g. `"6 tickets, #2–#7"`), add one `log` line, record links (spec, PR, prototype branch), and go straight on to the next stage, invoking its skill in the same run. Only the stops in the table pause the line.

## Rules

- **Never push, open a PR, create issues, or comment on GitHub without the user's go-ahead in this conversation**, even when the next stage needs it. The board saying "waiting" is not approval. For `spec` and `tickets`, the seam check and the breakdown approval are that go-ahead: publish only after the user says yes.
- During `build`, after every ticket: update that ticket's chip and `tests` with the real `pnpm test` (or the project's test command) counts. Never write numbers you didn't just see.
- Write the board only through `scripts/board.mjs`. It stamps every time itself; never type a time by hand (the one exception is `tests.at`, which comes from `date -u +%Y-%m-%dT%H:%M:%SZ`).
- The first time `/feature` runs in a conversation, tell the user they can watch the board with `node ~/.claude/skills/feature/scripts/board.mjs open`.
- If a board write fails, carry on with the feature and tell the user once. The board is a mirror, not the source of truth.
- Use the project's `GLOSSARY.md` terms in board notes and log lines.

## Example

> **User:** /feature password reset
>
> No open feature for this repo on the board. Creates `TestRepoBasicLogin--password-reset` with `grill` active, then runs `/grill-with-docs`. After round 1's questions, the board shows `grill` waiting: *"Answer grilling round 1 (6 questions) in Claude Code."* Once the user answers, a "Round 1" `qa` block with their answers goes on the `grill` stage, and tapping Grill on the board shows it.
