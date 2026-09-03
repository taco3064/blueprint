# Inspecting the repo

**Trigger:** before the first question to the owner, technical or product.

## Ground the investigation before it starts

**`git fetch origin`, then `git rev-parse origin/main` — first, before reading anything.** Record that SHA as the grounding commit. The checkout this session happens to be sitting in is not guaranteed to be `main`: a feature branch, an old worktree, a branch for unrelated work (this skill's own first draft was written while sitting on one) all look, from inside a session, exactly like being on `main`. Grounding on whatever `HEAD` happens to be and reconciling later doesn't recover the cost — by the time a later sync runs, the product decisions in `resolve-the-direction.md` are already made, against facts that might not have held.

**Read source through that ref, not off disk** — `git show origin/main:<path>` for a file, `git log origin/main -- <path>` for its history — the same discipline `deliver-ticket`'s own Repo facts already require for reading baselines, for the identical reason: what's on disk is whichever branch is checked out, and that's exactly what this section doesn't trust. Where the direction genuinely needs something run or rendered rather than read — a CLI message, a built artifact — use a disposable `git worktree add <tmp-path> origin/main` rather than touching the current checkout, and remove it when done.

## What counts as investigated

**Read the implementation, not the name.** `emit/lint` sounds like it owns every lint-shaped question; whether it does is answered by opening `src/emit/lint/lint.ts`, not by the folder name. The direction usually names a capability in the owner's words — the repo's name for the thing that owns it is rarely the same word, and CLAUDE.md's layering table (`config → markdown → plugin → emit/* → presets → project → inspect → survey/impact → bootstrap → cli`) is where you find it, not a grep for the owner's phrasing.

**Read the tests, don't skim the file list.** A test file's names and its `describe` blocks say what the current behavior actually guarantees, which is frequently narrower or wider than what the source file's shape implies.

**Where the direction touches something the tool emits or prints** — a CLI message, a rendered doc, an artifact — **read that output, not the code that produces it.** Reading code tells you the logic is right; reading output tells you what it actually says today, and those two diverge more often than either side expects.

**Search issues, PRs, and commits for the same root cause before assuming this is new ground — and search wide, not just recent.** `gh issue list` and `gh pr list`, even with `--state all`, default to a short page of the most recently updated items; this repo has passed 300 issues, so a plain list silently misses older ones. `gh search issues`/`gh search prs` fix the recency bias but default to `--limit 30` themselves, which is just as short for a repo whose numbering has passed 300 — pass a limit generous enough to actually cover it (`--limit 100` is the floor here), and query more than once: the capability's name, its likely module, and the behavior in the owner's own words are three different searches, not one. `git log --all --oneline --grep=...` for commits.

**When a search comes back empty and the conclusion matters, record the exact query and the limit used.** That's what lets a later reader — including you, an hour later — tell "searched and found nothing" apart from "searched too narrowly," per *Facts vs inference* below.

**If any of this turns up an issue still open on the same root cause, stop here.** Report it instead of continuing into `resolve-the-direction.md` — see `SKILL.md`'s *And if a matching issue already exists, you don't create a second one*. A direction that sounds novel is sometimes issue #358's shape wearing a new sentence, and a withdrawn PR (the `discarded-attempt` label marks these) often carries measurements worth reusing rather than re-deriving — that one isn't a stop, it's material. **Neither is an open issue carrying no implementation plan, no acceptance criteria and no fingerprint**: that is a record of a direction rather than delivery-ready work on it, and filing one of the pieces it splits into is what it exists for — #378 was one, said so in its own body, and the stop fired on it anyway. `SKILL.md`'s *A record issue is a source, not a duplicate* holds the test; read the three and the issue answers it without asking anyone.

**Name the reusable primitives you find**, even ones the direction didn't ask for by name — a resolver, an emitter, a verdict shape already used elsewhere for the same kind of decision. The implementation plan is built out of these, not around them.

## Facts vs inference

**Label every claim that will shape a plan** as either executed-and-observed (you ran it, rendered it, or read the actual output) or read-and-inferred (you read the source and reasoned about what it does). Both are legitimate at this stage — a plan built entirely from executed facts before any direction is settled would be wasted work — but the label has to survive into the discussion, because a wrong inference is exactly the kind of thing a decision should catch before it hardens into a plan.

**And a claim the tool can be run against is run before the ticket is filed.** The trigger is a claim about **behavior**, not about structure: *this symbol is exported* is read; *this config prints that* is run, because between the source and the output sit callers the source does not name. *What counts as investigated* above already says to read the emitted output rather than the code producing it — **this is that rule where the output has to be provoked before it can be read**, and **a claim about N fields is checked on N, not on one and generalized.** #379 was filed asserting that a glob matching nothing *"is already surfaced by `Coverage.outsideNets`"* across four named config fields; the issue now records the correction against itself — *"Measured per field during delivery, that holds for `layerFiles` only."* Two of the others were reachable by running `doctor` twice, one character apart in `testFiles` and then in `layerFilesIgnore`, and nothing about that needed the fix to exist first. They became two stages of a ticket filed with one.

**The label goes into the filed ticket, not only into the discussion.** `deliver-ticket`'s stage comments already carry a measured-versus-reasoned split — **the same split as above under the delivering side's names: measured is executed-and-observed, reasoned is read-and-inferred** — and the ticket that dispatches them carries none. **A measured claim names the command and the fixture that produced it; a reasoned claim says it was reasoned** — honest and cheap, where the same claim unmarked is what a stage gets built on.

**This is not a mandate to measure everything.** A claim that cannot be run until the fix exists is reasoned by necessity and says so: #379's stage 5 turned on a count that its own stage 2 moved, and its stage 6 on a number unreadable at that ticket's grounding commit because `deps` hung on the input that would have produced it. The fault was never that the ticket grew — it was that the two claims reachable by running the tool were reasoned about instead.

**"Not found by this search" is not "does not exist."** A `grep` that returns nothing is consistent with *there is no such thing* and with *it's spelled differently than you searched for*, and the two look identical in the result. When a search comes back empty and the conclusion matters, say what the search covered and what it would have missed, rather than reporting the absence as settled.

## Scope judgment

**Cut by root cause, not by where you happened to look.** A direction that touches three files because the same assumption is wrong in three places is one ticket; a direction that touches three files because it bundles three unrelated capabilities is (at least) three. The test is the same one `deliver-a-stage.md` uses for a commit: does fixing the first part make the second part's problem go away on its own, or are they independent facts that both happen to be true?

**If the investigation surfaces more than one ticket's worth**, that goes back to the owner as a finding, not a decision you make — see *One direction can hide several tickets* in `SKILL.md`.

## Time control

**Never a line number in anything that outlives the conversation** — the issue body, a comment on it, a PR description, a file in the repo. **Three anchors are permitted, and they are the whole list: a symbol, a verbatim quote of the line, a file path.** A plan that says "the branch in `resolveBlueprint` that handles a missing `layers` array" survives a reformat; one that says "line 214" does not, and this repo already prices that drift — `.claude/docs/mutation-testing.md` keeps each survivor proof at its site rather than in the commit message, so that a grep for one word *is* the ledger: *"no file to maintain, no line numbers to drift"*. This rule was once advice with a condition attached, and both halves were taken: thirty-plus line references went into #379–#384 and were stripped by hand after filing.

**Positional prose is the same ban, so nobody reads this as a rule about digits.** *"~180 lines below"* and *"twelve lines apart"* came out of those same six issues alongside the numbers — each anchors to a position the next edit moves, which is the whole defect, and neither is the shape a search for a line reference would catch. Inside the conversation a line number costs nothing; it dies with the conversation.

**Before the draft is written, fetch again and diff against the grounding SHA** — `git fetch origin && git diff <grounding-sha> origin/main` — rather than re-reading everything from scratch. An empty diff on the paths this direction touches means the grounding still holds; a non-empty one names exactly which facts from *What counts as investigated* need a second look, not a blanket re-investigation. This is covered from the drafting side in `create-the-ticket.md`'s pre-flight.
