# Creating the ticket

**Trigger:** goal, plan, and acceptance are all settled — `resolve-the-direction.md`'s convergence list holds — and it's time to draft or file.

## Pre-flight

Do this before writing a word of the draft, even if the investigation feels current:

- **Sync `origin/main` a second time, and diff against the grounding SHA.** `git fetch origin`, then `git diff <grounding-sha> origin/main`. Read any changed path directly (`git show origin/main:<path>`) rather than off disk, and never `git pull`, `git checkout`, or `git merge`. `inspect-the-repo.md`'s *Ground the investigation before it starts* recorded the first SHA before the first question was asked; this repo closes issues same-day, so this second check is not optional.
- **Re-verify every fact the diff touches.** A renamed symbol, a moved module, a helper that now exists and didn't when the discussion started each shows up as a changed path — and each turns a sound plan into one that cites something no longer there if skipped.
- **Re-run the duplicate search from `inspect-the-repo.md` at the current tip, not just the grounding commit — same `--limit` bump, same multiple queries.** Cover issues open and closed, PRs open and merged, and anything carrying the `discarded-attempt` label; something matching this direction may have been filed or merged during the discussion itself. **If this turns up an issue still open on the same root cause, stop — report it instead of filing**, per `SKILL.md`'s *And if a matching issue already exists, you don't create a second one*. A withdrawn attempt isn't a blocker, but its measurements belong in the draft instead of being re-derived, the way issue #364 reused #358's and #361's numbers instead of re-running them.
- **Confirm exactly one issue is about to be created.** If the investigation ever surfaced more than one ticket's worth, this is the last checkpoint before that either gets said out loud or gets buried in a single oversized draft.
- **Confirm no product decision is still open.** Re-run `resolve-the-direction.md`'s convergence list against the current draft, not against memory of having checked it earlier.
- **Confirm the acceptance criteria can't be trivially gamed.** A wrong or no-op implementation should be visibly unable to pass them. "The function exists" is not a criterion; "`npx eslint .` reports 0 errors across all 130 tracked files, and `--print-config` returns a non-empty rule set for each" is — because a lint config that governs nothing would pass the first and fail the second.

## Title

This repo's issue titles state the outcome or a directive with its reason, in plain sentences — not ticket-speak, not a filename standing in for the capability it belongs to. `"The gates run at error, and the code meets them"`, `"Both ledgers come out, and nothing goes red"`, `"Add an eslint 10 CI leg — the tool installs it unpinned and nothing tests it"` are the register to match. `RFC:` is this repo's own prefix for a direction that's deliberately being opened rather than decided — use it only when the owner has said this ticket is that, not as a hedge for an unfinished discussion. Mark a break to a published contract in the title itself, the way a PR title would carry `!`.

## Fingerprint

**The issue body's first two lines, before anything else — including a restatement of the title — are an HTML comment fingerprint:**

```
<!-- blueprint-shape-ticket:v1 -->
<!-- grounded-at:<sha> -->
```

`<sha>` is `origin/main`'s tip as confirmed in *Pre-flight* above — the exact commit this draft was last verified against. This is what lets deliver-ticket trust the issue without re-deriving what this skill already determined, rather than merely reading as if it did: three headings with the right names are something anyone typing an issue by hand can produce, and deliver-ticket's own gate no longer takes that as enough. A fingerprint naming a real, resolvable commit is not something a hand-written issue produces by accident. GitHub renders an HTML comment as nothing, so it costs a human reader nothing to have it there.

**`v1` is the only version this file writes.** It moves only when the contract between the two skills changes in a way deliver-ticket needs to know about — not on a wording tweak to this file. A version bump is a decision made in both `SKILL.md`s together, not a number changed here alone.

## Body

Three sections are required, directly beneath the fingerprint above. Everything else is supporting material around them. **In the issue itself these are top-level headings — `## Goal`, `## Implementation Plan`, `## Acceptance Criteria` — the same register #364 and every other issue in this repo use for their own top-level sections.** The `###` below is this reference file's own organization for presenting the guidance one part at a time; it is not an instruction to nest the issue's sections under a literal "Body" heading, which the issue never has. Each optional item under *Auxiliary content* likewise becomes its own `##` section when it's included, the way #364 has its own `## Out of scope`.

### Goal

State the current behavior, the desired behavior, and the concrete cost of the gap between them — not "would be nice" but what it actually costs today, in the same register issue #364 uses ("nobody reads a warning" is a cost; "for completeness" is not). Name the boundary against neighboring work explicitly, even briefly — a reader should be able to tell what's in from what's merely nearby.

### Implementation Plan

Built on `origin/main` as it stands after the pre-flight sync, not as a fresh design:

- **Name the module and layer that already owns this**, per `CLAUDE.md`'s layering table. If the direction seems to belong to two, that tension is itself a finding — surface it rather than picking silently.
- **Name the primitives already in the repo** that the plan reuses, and name every consumer that needs to move with the change (a resolver's caller, a rule the preset recommends, a page in `docs/` that documents the old behavior).
- **Cut into stages the way `deliver-a-stage.md` cuts a commit** — each stage is something that becomes true and leaves the repo releasable on its own, not a list of files to touch. A plan that only makes sense as one commit is one stage; don't manufacture more to look thorough.
- **State what must not change** alongside what must — an implementer needs the invariant as much as the delta.
- **Say whether a changeset, a docs update, or a migration note is needed**, matching this repo's own practice (every user-visible change ships a changeset).
- **Leave deliver-ticket's actual implementation choices to deliver-ticket.** Name the module, the primitive, the consumer, and the invariant; don't lock in a private function name or a line number the plan doesn't need — those are exactly the kind of decayable reference `inspect-the-repo.md` warns against, and pinning one here just relocates the problem into the ticket instead of solving it.

### Acceptance Criteria

Each criterion names an actual command, output, or artifact — never "works correctly" or "tests pass" alone — and maps back to a specific goal clause or plan stage; an acceptance criterion with nothing to trace to is a hole, same as a goal clause nothing satisfies. Cover, where they apply:

- The happy path.
- The error / rejection path.
- The default-unchanged path — proof that everything not touched by this direction still behaves as it did.
- A non-default or edge configuration, when the direction has one.

**Say which verification layer proves each one** — unit test, the conformance suite, `dist:verify`, or the field harness — per `.claude/docs/verification-layers.md`; a criterion that names the wrong layer reads as satisfied by a check that couldn't have caught the failure it's guarding against.

### Auxiliary content, as needed

- **Evidence**, cited to the pre-flight commit — measured counts, current behavior quoted from the code or its output, the same way issue #364 carries its rule counts and file names.
- **Decisions made**, restated briefly, and the options that were rejected with why — so the owner reading the filed issue later doesn't have to reconstruct the conversation to see why an alternative isn't there.
- **Out of scope**, explicit, even for things adjacent enough that a reader might otherwise assume they're included.
- **Related work** — issues, PRs, or discarded attempts this supersedes or reuses, linked by number.

## Independent feasibility check

Before showing the draft to the owner, dispatch a fresh, read-only agent that had no part in the discussion:

- **Latest `main`, the draft, and nothing else** — not the reasoning that produced it, so it can't inherit a premise instead of checking one.
- **Told to run and read, not just read source** — verify referenced symbols, files, and commands actually exist and actually say what the draft claims.
- **Asked three things explicitly**: are the plan's stages landable in the stated order; can the acceptance criteria be satisfied by a wrong or no-op implementation; is any consumer, duplicate issue, or duplicate PR missing from the draft.
- **Unable to write** — to the repo, or to the draft. It reports; it does not fix.

**Every finding is a report, not a fact, until you reopen the file yourself.** A technical error — a stale symbol, a broken command, a missing consumer — gets fixed in the draft directly. A finding that's product-shaped (the plan and the stated goal actually don't match, an acceptance criterion is testing the wrong thing) goes back to the owner instead of being resolved unilaterally; that's the same boundary `resolve-the-direction.md` draws for every other product decision, applied to something a reader found instead of something you asked.

## Owner confirmation

Show the complete draft — title and full body, not a summary of it. Name, in the same message, anywhere the draft still rests on an inference rather than a confirmed decision. Ask for an explicit go before filing.

**If the owner wants a change, go back to the step that owns that content** — a goal change goes back to discussion, a plan change goes back to the repo, don't patch the visible text of the draft in isolation and call it re-confirmed.

## Filing and handoff

- **Before calling `gh issue create`, confirm the fingerprint's `<sha>` is still `origin/main`'s tip.** Owner confirmation can take a while; if `origin/main` moved during it, re-sync once more (per *Pre-flight*) and use the new tip in the fingerprint — one that names a commit no longer at the tip it claims is stale before the issue even exists.
- Create exactly one issue, with only labels that already exist in the repo (`gh label list`) — never a new one.
- No assignee, milestone, or parent issue unless the owner explicitly asked for one.
- Report back the issue number and its URL.
- Say the issue is ready for deliver-ticket. **Don't start deliver-ticket** — that's a separate invocation, by the owner's choice, not this skill's.
- **Create nothing else.** Not a sub-issue for the out-of-scope list, not a tracking issue for the alternative the owner didn't pick. That list is the owner's input for next time, not this run's output.

The task ends here.
