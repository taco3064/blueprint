---
name: shape-ticket
description: Turn a stated direction into one GitHub issue deliver-ticket can build without re-deriving scope — investigate the current code and history, resolve through discussion every decision the code cannot answer on its own, and land a Goal / Implementation Plan / Acceptance Criteria draft that is true of `main` at the moment it is written. Use when the owner opens with a direction rather than a spec ("we should…", "there's a gap in…", "I want X to do Y"), when a discussion needs to become a ticket, or when an open issue's scope is still unsettled. NOT for implementing anything, not for opening a PR, and never for touching a ticket already handed to delivery.
---

# shape-ticket — one direction, one issue, grounded in what main actually contains

You own the discussion that turns a direction into a **decided** shape. **You do not own how it gets built** — that is [deliver-ticket](../deliver-ticket/SKILL.md)'s, and it starts from the issue you write, not from this conversation. Once the issue is filed, this skill's job is done. Reopening the same discussion later, or shaping a different direction, is a new invocation.

**You do not touch the repository.** No edit, no commit, no branch, no PR. The one artifact you produce is a single GitHub issue — everything else this skill does is investigation and conversation that either becomes a line in that issue or is discarded.

**Everything on this page is always in force.** The depth belonging to one moment lives under [`references/`](./references/) — read the file when its trigger fires, before acting.

| Reference | Trigger |
|---|---|
| [`inspect-the-repo.md`](./references/inspect-the-repo.md) | Before the first question to the owner, technical or product. What counts as an investigated fact, and how "not found by this search" differs from "does not exist". |
| [`resolve-the-direction.md`](./references/resolve-the-direction.md) | A direction or behavior exists that the current code cannot uniquely answer. How to classify it, how to ask it, and how the answer stops being re-asked. |
| [`create-the-ticket.md`](./references/create-the-ticket.md) | Goal, plan and acceptance are all settled and it is time to draft or file the issue. |

## Ask only what the repo cannot answer

Most of what feels like an open question is already decided. `CLAUDE.md` states positions directly (module shape, layering, what counts as an out-of-scope change). `docs/philosophy/` and `docs/guide/` state the product's stances for an adopter. And the code itself states the rest: `missing-layer`'s message is the position on declaring ahead of code, `renderCoverage` is the position on reporting enforcement that is not real — `CLAUDE.md`'s own **"Looking up a stance this project already took"** section is this exact discipline, aimed at the code instead of a conversation. It applies here undiminished: **read what the tool already says out loud before asking whether it says it.**

A direction is *underspecified*, not *unanswerable*, when the repo already implies the missing piece. The discussion budget belongs to the part nothing already answers — not to re-deriving a stance that exists two files away from where you're about to ask about it.

## One direction can hide several tickets

**Investigate before you assume the direction is one ticket.** A direction stated in one sentence sometimes decomposes into two or three capabilities that don't share a root cause and don't need to land together. If that's what you find, **say so and stop** — name the pieces, and let the owner decide the split and the order. Don't file the first piece to make progress, and don't force the whole thing into one issue because splitting felt like more work than it was worth.

The opposite failure is just as real, and it's the one deliver-ticket's own "you do not create tickets" rule exists to prevent: the arrangement it replaced let eighty-five tickets get filed in two days, six of them on a single cause, because nobody looked at the set before filing the next one. **Splitting by every difference you notice is not more careful than not splitting at all — it's the same failure to look at the set, aimed the other way.** Cut by root cause, not by how many things caught your eye.

**One shape-ticket run files at most one issue.** Not a parent and its children, not "the rest tracked separately" — if there is more than one, this run names them and creates none until the owner says which comes first.

## The issue is deliver-ticket's whole briefing

deliver-ticket reads the ticket number, not a summary of this conversation — that's stated in its own SKILL.md, and it means whatever you leave implicit here does not survive the handoff. An implementer with a goal and no edge finds the edge by crossing it; a plan with an unstated assumption gets a different assumption substituted at build time; an acceptance criterion that doesn't name a command gets satisfied by whatever the builder believes is close enough. **Ambiguity you don't resolve here is not deferred — it is reassigned to someone with less context than you have right now.**

That is why the completion bar below is strict, and why it's checked before the draft is shown, not after:

- The goal has no open product decision left in it.
- The implementation plan is built on the module and layer that CLAUDE.md already says owns this, names the primitives already in the repo instead of inventing new ones, and is true of the commit it was read against.
- Every plan stage is independently landable and verifiable — the same bar `deliver-a-stage.md` holds a commit to, applied one level up.
- Every acceptance criterion names a command, an output, or an artifact — not "works correctly" — and maps back to a goal clause or a plan stage. An orphan criterion or an unproven goal clause is a hole.
- Anything adjacent that this issue does not cover is named as out of scope, not left for the reader to guess.
- Nothing in the draft duplicates an open issue, a merged PR, or a `discarded-attempt`-labeled one.

## Discussion is not a form

**One blocking decision at a time.** Not a checklist fired at the owner in one message — each question waits for its answer before the next one is asked, because an early answer routinely changes what the later questions even are.

Every question carries, in this order: the current state and the evidence for it, the real options with their actual consequences (not which is less work to build), and a recommendation with its reasoning. A question with two options that behave identically isn't a question — it's a coin flip dressed as one, and it costs the owner's attention for nothing.

**Keep a running decision log for the length of the conversation** — what's confirmed, what was considered and rejected and why, which constraints must hold, and which of those came from the owner versus were derived by you from the repo. Don't re-ask a settled decision. If something surfaces later that contradicts one, that contradiction goes back to the owner explicitly — it is not quietly reconciled in your own head, because a silent reconciliation is a second, unreviewed decision wearing the first one's name.

## Re-sync before you draft

This repo moves same-day: issues close, branches merge, `main` is not the commit the discussion started against. **Before writing the draft, re-read `main` and re-verify every fact the plan leans on** — a symbol renamed, a module split, a helper added underneath the conversation all turn a sound plan into one that references something that no longer exists. `inspect-the-repo.md` covers how to keep this cheap rather than re-doing the whole investigation.

## Repo facts

- File with `gh issue create` or the GitHub MCP tool, whichever the session has. Title and body are English, matching every existing issue in this repo — the title states the outcome or a directive with its reason (`"The gates run at error, and the code meets them"`, `"Add an eslint 10 CI leg — the tool installs it unpinned and nothing tests it"`), never ticket-speak, never a filename standing in for a capability.
- **Use only labels that already exist** (`gh label list`); don't create one for this issue. Don't set an assignee, milestone, or parent issue unless the owner explicitly asks.
- `CLAUDE.md` and `.claude/docs/` hold the conventions the plan must not contradict. Read the doc when its trigger fires; don't substitute first-principles reasoning for what it says.
- One issue per run. No sub-issues, no follow-ups, no "tracked separately" issue filed alongside it — if the direction needs more than one, say so per *One direction can hide several tickets* above and stop.
