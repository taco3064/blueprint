# Creating the ticket

**Trigger:** goal, plan, and acceptance are all settled — `resolve-the-direction.md`'s convergence list holds — and it's time to draft or file. **Or, on its own, the owner has said to start delivery on an issue already filed** — *The owner's word starts delivery, and the dispatch prompt stays cold* is this skill's second entry point, and it fires with no convergence list to hold, no draft in hand and no shaping discussion in context, including in a conversation that never shaped that issue at all. **Neither trigger is a precondition of the other**: a run sent here by the second one is here for the dispatch rule, and owes nothing to the drafting steps it never ran.

## Pre-flight

Do this before writing a word of the draft, even if the investigation feels current:

- **Sync `origin/main` a second time, and diff against the grounding SHA.** `git fetch origin`, then `git diff <grounding-sha> origin/main`. Read any changed path directly (`git show origin/main:<path>`) rather than off disk, and never `git pull`, `git checkout`, or `git merge`. `inspect-the-repo.md`'s *Ground the investigation before it starts* recorded the first SHA before the first fact that shaped this plan was read; this repo closes issues same-day, so this second check is not optional.
- **Re-verify every fact the diff touches.** A renamed symbol, a moved module, a helper that now exists and didn't when the discussion started each shows up as a changed path — and each turns a sound plan into one that cites something no longer there if skipped.
- **Re-run the duplicate search from `inspect-the-repo.md` at the current tip, not just the grounding commit — same `--limit` bump, same multiple queries.** Cover issues open and closed, PRs open and merged, and anything carrying the `discarded-attempt` label; something matching this direction may have been filed or merged during the discussion itself. **If this turns up an issue still open on the same root cause, stop — report it instead of filing**, per `SKILL.md`'s *And if a matching issue already exists, you don't create a second one*, **including its record-issue carve-out**: an open issue carrying no implementation plan, no acceptance criteria and no fingerprint is not the duplicate this stop is about, and filing one of its pieces needs no permission. A withdrawn attempt isn't a blocker, but its measurements belong in the draft instead of being re-derived, the way issue #364 reused #358's and #361's numbers instead of re-running them.
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

**This is a workflow handoff marker, not a security proof.** Nothing stops a hand-written issue from copying these two lines and pasting in a real commit SHA — the fingerprint's job is catching accidental drift and a genuinely unshaped ticket in a solo, non-adversarial pipeline, not defending against someone deliberately forging it. That's an accepted boundary here, not a gap that needs signing or any heavier mechanism to close.

## Body

Three sections are required, directly beneath the fingerprint above. Everything else is supporting material around them. **In the issue itself these are top-level headings — `## Goal`, `## Implementation Plan`, `## Acceptance Criteria` — the same register #364 and every other issue in this repo use for their own top-level sections.** The `###` below is this reference file's own organization for presenting the guidance one part at a time; it is not an instruction to nest the issue's sections under a literal "Body" heading, which the issue never has. Each optional item under *Auxiliary content* likewise becomes its own `##` section when it's included, the way #364 has its own `## Out of scope`.

### Goal

State the current behavior, the desired behavior, and the concrete cost of the gap between them — not "would be nice" but what it actually costs today, in the same register issue #364 uses ("nobody reads a warning" is a cost; "for completeness" is not). Name the boundary against neighboring work explicitly, even briefly — a reader should be able to tell what's in from what's merely nearby.

### Implementation Plan

Built on `origin/main` as it stands after the pre-flight sync, not as a fresh design:

- **Name the module and layer that already owns this**, per `CLAUDE.md`'s layering table. If the direction seems to belong to two, that tension is itself a finding — surface it rather than picking silently.
- **Name the primitives already in the repo** that the plan reuses, and name every consumer that needs to move with the change (a resolver's caller, a rule the preset recommends, a page in `docs/` that documents the old behavior).
- **Name the docs pages and existing output deliver-ticket must read before touching this** — the specific `docs/philosophy/`, `docs/guide/`, `docs/api/` pages, or a rendered artifact/CLI output, this plan depends on or must not contradict. This is deliver-ticket's reading list, not a suggestion: its own `SKILL.md` reads exactly these citations by default and nothing more, so a page that actually matters but isn't cited here is a missing citation, not something to add later out of caution.
- **Cut into stages the way `deliver-a-stage.md` cuts a commit** — each stage is something that becomes true and leaves the repo releasable on its own, not a list of files to touch. A plan that only makes sense as one commit is one stage; don't manufacture more to look thorough.
- **Order the stages by payback, and say in the plan that any stage boundary is a finish.** Stages that depend on each other leave no valid stopping point, so *when does this end* stays a judgement somebody makes under pressure at the worst moment. Name which stage is worth merging alone, and say it before delivery starts — that is what lets a run out of budget still have shipped something. #379 was filed with one stage and reached a plan of twenty, and no boundary in it was ever a place to stop.
- **State what must not change** alongside what must — an implementer needs the invariant as much as the delta.
- **Say whether a docs update or a migration note is needed, and which release this ships in** — the bump level, and whether the plan's stages all land in one release. **That statement is the ticket's; the changeset is not.** How a release is described is this repo's own practice, and `deliver-ticket`'s `finish-the-ticket.md` assembles one changeset per ticket at the end from the delivery's own comments. **A ticket that specifies the changeset has made a release artifact its own deliverable — and therefore a surface a stage review can block on with this issue's authority.** #371 spent two of one stage's three rounds exactly there, on a changeset claim two of its own revisions had falsified, before the owner ruled release artifacts out of the ticket entirely.
- **Leave deliver-ticket's actual implementation choices to deliver-ticket.** Name the module, the primitive, the consumer, and the invariant; don't lock in a private function name the plan doesn't need, and **never a line number** — `inspect-the-repo.md`'s *Time control* bans that outright in anything that outlives the conversation, and a filed issue is the plainest case of that. Pinning one here just relocates the problem into the ticket instead of solving it.

### Acceptance Criteria

Each criterion names an actual command, output, or artifact — never "works correctly" or "tests pass" alone — and maps back to a specific goal clause or plan stage; an acceptance criterion with nothing to trace to is a hole, same as a goal clause nothing satisfies. **The plan-stage half of that is what *Two passes over the finished draft* below actually checks** — both directions, and again after any restructuring; the goal-clause half has no pass, and `SKILL.md`'s completion bar is the whole of what holds it. Cover, where they apply:

- The happy path.
- The error / rejection path.
- The default-unchanged path — proof that everything not touched by this direction still behaves as it did.
- A non-default or edge configuration, when the direction has one.

**Say which verification layer proves each one** — unit test, the conformance suite, `dist:verify`, or the field harness — per `.claude/docs/verification-layers.md`; a criterion that names the wrong layer reads as satisfied by a check that couldn't have caught the failure it's guarding against.

### Auxiliary content, as needed

- **Evidence**, cited to the pre-flight commit — measured counts, current behavior quoted from the code or its output, the same way issue #364 carries its rule counts and file names. **Every behavioral claim the issue makes carries its label** — a measured one names the command and the fixture that produced it, a reasoned one says it was reasoned — and that holds wherever the claim sits, this section or a plan entry's rationale. The rule is `inspect-the-repo.md`'s *Facts vs inference*.
- **Decisions made**, restated briefly, and the options that were rejected with why — so the owner reading the filed issue later doesn't have to reconstruct the conversation to see why an alternative isn't there.
- **Out of scope**, explicit, even for things adjacent enough that a reader might otherwise assume they're included.
- **Related work** — issues, PRs, or discarded attempts this supersedes or reuses, linked by number.

## Two passes over the finished draft

Both run on the assembled text — after the body is written, **before the fingerprint goes on and the issue is filed**, and **again over any text that changed after they last ran, on either side of filing**, because a pass that ran on text a later step replaced carries the same defect the *Independent feasibility check* below keeps a loop to close. **The later step is often a revision pass**: #379's stages 7, 8, 10 and 13 and its criterion 19 were all authored after filing, on `revise-an-in-flight-ticket.md`'s path, which sends a restructuring back here. Neither pass belongs inside that check, which reads for technical error: a stale symbol, a broken command, a missing consumer. **An under-specified criterion is not an error. It is a true sentence that permits the wrong outcome**, and it is not something an agent reading the draft alone can see.

**The adversarial pass — for each criterion, state the case that would satisfy its words and miss its intent.** If that case exists, the criterion names an instance: rewrite it as the property, or widen it to name the instances it excludes. **When the answer is "none", write that down beside the criterion**, so a later reader can tell the pass ran from the pass being skipped. Three shapes to look for, all from #379, where *write the property, not the instance* was already on the page and the same failure landed three times in one night:

- **A sentence with two assertions and a criterion covering one.** Criterion 10 was scoped to one clause of a two-clause sentence; the second clause would have shipped false.
- **A number a criterion says must "agree", where the agreement is itself the decision.** Criterion 11 asked two blast-radius numbers to agree, which assumed away a product decision and would have had the tool guess at the adopter's intent.
- **A mutation named singly, where the mutation has a mirror.** Criterion 16 named one mutant and one fixture shape; the mirror mutant survived 1433 passing tests, leaving live the exact class an earlier stage had spent itself removing.

**The cost is not the miss, it is where the miss lands.** A criterion is what a delivering session is judged against, so an under-specified one **passes** — the work is graded correct against half a contract, and the other half is found later by a reviewer or an adopter. Criterion 10 was widened two passes before criterion 16 was written one-directionally, which is the tell: this is not a gap in knowledge, and re-reading your own text is not the check.

**And it fails in both directions.** #379 produced one of each in a day: a claim about `--json` generalized past what was measured (one command's config-dependent split, written as a rule across three), and a rule against stalling generalized no further than what had been seen (two stage landings, written as *a stage landing*, which a `chore` commit then walked straight through into a third stall). **Stopping at your own evidence feels like discipline**, which is why that second one is the harder to catch. The check is the same either way: **state the property, then name the instances it excludes and ask whether you meant to exclude them.**

**The pass runs over the plan text too** — the same disease ran to seven instances on that one ticket, and the three criteria above are only three of them. A stage that lists its sites hands the delivery a roster to satisfy, and the roster is what goes stale:

- **A list of sites in a stage is a defect unless the stage says how the list was derived.** State the derivation and let the list be examples; if there is no derivation, the stage is not ready. *"Every docs site stage 10 touched has a runtime twin"* is a derivation. *"These three files"* is a roster — #379's stage 10 listed two docs files and the fix needed six, because the `zh-TW` mirrors publish the same sentence, and its stage 13 listed three runtime sites and was short by at least five.
- **One test tells a roster from a derivation, and it is *additive*.** Not "does the check find today's instances" — that is exactly what a roster passes, being complete over the corpus it was written from and empty over everything after it. **Add a new instance and see whether the check covers it without anyone registering it.** Every sweep run on #379 tested the corpus as it stood and every one was short; the one mechanism that held was the one whose coverage did not depend on having been told. Stage 13's shortfall was found by a property the delivery ran, and it returned sites nobody had listed — one of them in a form no grep for the obvious word would have matched. **Enumeration is not a weaker property; it is a different artifact, short by construction the moment the tree grows.**
- **A criterion that prescribes a check prescribes the check's blind spot too.** A literal grep misses a wrapped string: #379's criterion 19 prescribed one, and the sentence it hunted was split across array elements. A word-boundary match misses the same word inflected. Its criterion 18 named a `!` fixture that was the one glob unable to exercise the guard it was written to protect. **Say what the check cannot see, or require it run red-then-green** — against the pre-fix tree it must find the defect, or it never could have.
- **And the blind spot is where the surviving instance will be — by selection, not by chance.** Everything the instrument can see gets fixed; **what is left is exactly what it could not reach.** #379's stage 13 swept for a claim by extracting *what the program can print*, which strips comments by construction, and the survivor was a **doc comment** — published by typedoc into a gitignored build directory, so neither the source sweep nor a docs grep could reach it. **The one published surface no instrument covered is the one still carrying the claim.** So the question after a clean sweep is not *did it find them* but **which surface did it never look at**, and that surface is where to look by hand.
- **A correction pass has one blind spot by construction: absence.** Checking every existing sentence against current behavior is a complete-feeling job that **contains no prompt to notice something missing**, so doing it thoroughly is exactly what makes an omission easy to leave. **Correcting a document and extending it are different acts, and the second has to be asked for explicitly.** Two instances, one each side. #379's release note was corrected line by line after a stage landed, and the stage was still absent from the note that had just been checked; the other side is the plan bullet a restructuring dropped, which is what the correspondence pass below exists for. **Whenever the input is "go over this and fix it", the question that is not being asked is "what is not here".**

**The correspondence pass — every criterion has a plan item that explains why it exists, and every plan item has a criterion that would catch it.** Run it **after any restructuring, not only at first draft**: restructuring is when it breaks, because splitting or merging stages moves bullets between two lists nothing compares. An orphaned criterion still gates, so nothing fails and no reviewer objects — it is invisible until someone goes looking for the reasoning behind a bar and finds none, and **a criterion with no plan item is strictly harder to find than the reverse**, which at least surfaces as an untested claim. Splitting #379's stage 7 into 7 and 8 dropped the *"a test weaker than the claim in its own comment"* bullet while criterion 14 went on gating it; it surfaced only because the delivering session quoted the item's text back and the text was not in the issue body — it was quoting a revision comment.

## Independent feasibility check

Before showing the draft to the owner, dispatch a fresh, read-only agent that had no part in the discussion:

- **Latest `main`, the draft, and nothing else** — not the reasoning that produced it, so it can't inherit a premise instead of checking one.
- **Told to run and read, not just read source** — verify referenced symbols, files, and commands actually exist and actually say what the draft claims.
- **Asked three things explicitly**: are the plan's stages landable in the stated order; can the acceptance criteria be satisfied by a wrong or no-op implementation; is any consumer, duplicate issue, or duplicate PR missing from the draft.
- **Unable to write** — to the repo, or to the draft. It reports; it does not fix.

**Every finding is a report, not a fact, until you reopen the file yourself.** A technical error — a stale symbol, a broken command, a missing consumer — gets fixed in the draft directly. A finding that's product-shaped (the plan and the stated goal actually don't match, an acceptance criterion is testing the wrong thing) is not a category of its own — it gets the bar every other decision gets: **decide it, record the basis under *Decisions made*, and escalate only when proceeding under either reading would be unsafe or would make the work useless if wrong.** That is the bar `resolve-the-direction.md`'s *Classify before you ask* states, applied to something a reader found instead of something you asked.

**The check re-runs against the rewritten draft.** Its findings drive the rewrite, and the rewritten text is what gets filed — so a check whose output is discarded by the rewrite it caused is ceremony, and all six of #379–#384 were filed that way. Dispatch again on the current text, with the same four bullets above, and repeat.

**The loop terminates on a stated condition, and the condition is not "no findings at all".** It ends on **no technical findings against text no later step has changed** — product-shaped ones are decided in place by the paragraph above and never gate a re-run. **The condition is evaluated after whatever changed the text last**, so a rewrite this check did not cause reopens it exactly as one it did. If the technical findings won't clear, **file over them and name them in the issue**: each finding, why it is being filed over, and what would show it right. A check that cannot be satisfied is a finding about the check, not a reason to keep dispatching — an unbounded loop is the same ceremony from the other end.

## Owner confirmation

Show the complete draft — title and full body, not a summary of it. Name, in the same message, anywhere the draft still rests on an inference rather than a confirmed decision. Ask for an explicit go before filing.

**If the owner wants a change, go back to the step that owns that content** — a goal change goes back to discussion, a plan change goes back to the repo, don't patch the visible text of the draft in isolation and call it re-confirmed.

## Filing and handoff

- **Before calling `gh issue create`, confirm the fingerprint's `<sha>` is still `origin/main`'s tip.** Owner confirmation can take a while; if `origin/main` moved during it, re-sync once more (per *Pre-flight*) and use the new tip in the fingerprint — one that names a commit no longer at the tip it claims is stale before the issue even exists.
- Create exactly one issue, with only labels that already exist in the repo (`gh label list`) — never a new one.
- No assignee, milestone, or parent issue unless the owner explicitly asked for one.
- Report back the issue number and its URL.
- Say the issue is ready for deliver-ticket, then **stop — filing does not start delivery.** No delivery agent exists until the owner says to start one, and then it is this skill that dispatches it, per *The owner's word starts delivery* below.
- **Create nothing else.** Not a sub-issue for the out-of-scope list, not a tracking issue for the alternative the owner didn't pick. That list is the owner's input for next time, not this run's output.

**Filing ends the drafting; it does not end the run.** Delivery still starts on the owner's word and never on this skill's own — what inverted is who acts on that word.

## The owner's word starts delivery, and the dispatch prompt stays cold

**Filing and dispatching are two steps with the owner between them.** The run reports the issue and stops; when he says to start, **this skill dispatches `deliver-ticket` on that issue as a background agent and reports the agent's name back to him.** He does not open a second session to do it. This rule used to read *"don't start deliver-ticket — that's a separate invocation, by the owner's choice, not this skill's"*, and the choice was always his; what it got wrong was making him carry it. Everything in #379–#384 that routed through him twice — every revision announcement, and the liveness check he had to ask for — was the cost of two peer sessions simulating a parent and a child.

**"Start delivery on #N" is answerable cold**, in a conversation that never shaped that issue: the fingerprint check and the issue's own text are the whole input, because `deliver-ticket`'s gate reads the issue and not this conversation. **That check is the gate's own, run here before the dispatch rather than invented here:** read the issue body and check the three things `start-or-resume.md`'s *The ticket has to already be a ticket, not a direction* checks, in its order — the marker is present and reads `v1`; `grounded-at`'s SHA is present and resolves to a real commit (`git cat-file -e <sha>^{commit}`, after a fetch); and `## Goal`, `## Implementation Plan` and `## Acceptance Criteria` each carry actual content rather than only a heading. **A failure is reported and not dispatched, and it is not repaired here:** name which part failed and stop, because a missing or invalid fingerprint is the owner closing that issue and a fresh run superseding it — `revise-an-in-flight-ticket.md`'s *Which path this is — checked before anything else* is the table, and this skill does not revise an issue that never carried its fingerprint. **Nothing deadlocks if this is skipped** — `deliver-ticket`'s gate stops on the same three — **but the cost of skipping it is a whole dispatch spent discovering what one read of the body would have shown**, on the entry point whose whole justification is that it is cheap. So the word may arrive in the same breath as the filing report, later in the same conversation, or in a new one about an issue filed days ago, and nothing about the sequence needs the shaping discussion still in context.

**Which is why the prompt names the issue and the task and carries nothing else** — no summary of the discussion, no restatement of a criterion's reasoning, no "what I really meant was". **A dispatched agent starts fresh, so the independence that used to come from a session boundary now comes from what the prompt contains**, and that independence is the only instrument measuring this skill's own drafting: it is what found roughly thirty defects across #379–#384's six drafts, three of them acceptance criteria that did not discriminate at all. **A prompt that briefs the deliverer moves the numbers and not the tickets** — anything in it that is not in the issue is a defect of the run that sent it.

Progress reporting and a dead agent are `SKILL.md`'s *Progress on any delivery this run reports is read from the record*; announcing a revision to the delivering session — this run's agent or a peer's — is `revise-an-in-flight-ticket.md`'s *When it lands, and who hears about it*.
