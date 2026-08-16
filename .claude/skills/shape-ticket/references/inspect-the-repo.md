# Inspecting the repo

**Trigger:** before the first question to the owner, technical or product.

## What counts as investigated

**Read the implementation, not the name.** `emit/lint` sounds like it owns every lint-shaped question; whether it does is answered by opening `src/emit/lint/lint.ts`, not by the folder name. The direction usually names a capability in the owner's words — the repo's name for the thing that owns it is rarely the same word, and CLAUDE.md's layering table (`config → markdown → plugin → emit/* → presets → project → inspect → survey/impact → bootstrap → cli`) is where you find it, not a grep for the owner's phrasing.

**Read the tests, don't skim the file list.** A test file's names and its `describe` blocks say what the current behavior actually guarantees, which is frequently narrower or wider than what the source file's shape implies.

**Where the direction touches something the tool emits or prints** — a CLI message, a rendered doc, an artifact — **read that output, not the code that produces it.** Reading code tells you the logic is right; reading output tells you what it actually says today, and those two diverge more often than either side expects.

**Search issues, PRs, and commits for the same root cause before assuming this is new ground — and search wide, not just recent.** `gh issue list` and `gh pr list`, even with `--state all`, default to a short page of the most recently updated items; this repo has passed 300 issues, so a plain list silently misses older ones. Use keyword search instead — `gh search issues "<terms>" --repo <owner>/<repo>` and `gh search prs "<terms>" --repo <owner>/<repo>`, tried against the capability's name, its likely module, and the behavior in the owner's own words, each covering both open and closed results by default. `git log --all --oneline --grep=...` for commits. A direction that sounds novel is sometimes issue #358's shape wearing a new sentence, and a withdrawn PR (the `discarded-attempt` label marks these) often carries measurements worth reusing rather than re-deriving.

**Name the reusable primitives you find**, even ones the direction didn't ask for by name — a resolver, an emitter, a verdict shape already used elsewhere for the same kind of decision. The implementation plan is built out of these, not around them.

## Facts vs inference

**Label every claim that will shape a plan** as either executed-and-observed (you ran it, rendered it, or read the actual output) or read-and-inferred (you read the source and reasoned about what it does). Both are legitimate at this stage — a plan built entirely from executed facts before any direction is settled would be wasted work — but the label has to survive into the discussion, because a wrong inference is exactly the kind of thing a decision should catch before it hardens into a plan.

**"Not found by this search" is not "does not exist."** A `grep` that returns nothing is consistent with *there is no such thing* and with *it's spelled differently than you searched for*, and the two look identical in the result. When a search comes back empty and the conclusion matters, say what the search covered and what it would have missed, rather than reporting the absence as settled.

## Scope judgment

**Cut by root cause, not by where you happened to look.** A direction that touches three files because the same assumption is wrong in three places is one ticket; a direction that touches three files because it bundles three unrelated capabilities is (at least) three. The test is the same one `deliver-a-stage.md` uses for a commit: does fixing the first part make the second part's problem go away on its own, or are they independent facts that both happen to be true?

**If the investigation surfaces more than one ticket's worth**, that goes back to the owner as a finding, not a decision you make — see *One direction can hide several tickets* in `SKILL.md`.

## Time control

**Note the commit this investigation is grounded on** (`git rev-parse HEAD`, or the SHA a `git log` search resolved to) so that a later re-check has something concrete to diff against rather than re-reading everything from scratch.

**Prefer naming symbols and files over line numbers wherever the plan will outlive this conversation** — a plan that says "the branch in `resolveBlueprint` that handles a missing `layers` array" survives a reformat; one that says "line 214" does not, and this repo's own convention (`CLAUDE.md`, *Self-explaining output*) already treats decaying references as a cost worth avoiding.

**Before the draft is written, sync `origin/main` and re-check — read-only, per `SKILL.md`'s *Re-sync before you draft*.** This is cheap if the grounding commit was recorded here first, and it's covered from the drafting side in `create-the-ticket.md`'s pre-flight.
