# Revising a ticket deliver-ticket has already started

**Trigger:** new evidence — a review, a hand-traced bug, a stalled assumption
— shows a real gap in an issue's plan or acceptance criteria, and
`deliver-ticket` has already been invoked on it. **A landed stage is not a
precondition** — this applies whether zero stages have landed (the gap
surfaced during `deliver-ticket`'s own pre-first-commit read, or from a
review that ran before any dispatch) or several have; the rule below is
about what a landed stage does to the decision when there is one, not about
requiring one to exist first.

**The floor is checked before this trigger is.** New evidence enters this
path only when it is related to what the ticket is fixing —
`resolve-the-direction.md`'s *The floor — is it related to what this ticket
is fixing* is that test, and evidence that fails it is recorded in the issue
and the ticket ships, with no pass on offer however real the defect is.
#379's plan reached twenty stages across fifteen revision passes entered
here, and not one of them was asked that question.

This is the narrow exception to *You do not touch the repository* and to
"never for touching a ticket already handed to delivery" above. It exists
because the alternative already in this skill — the owner closes the issue,
naming why, and a fresh run supersedes it — is a full reset, and a full reset
is the wrong tool when the goal hasn't moved and nothing that shipped is
invalidated. #371 is the case this file first generalized from: six review
passes corrected its plan and acceptance criteria after stage 1 had already
landed, none of them touched stage 1 itself, and treating each one as a
close-and-reopen would have manufactured seven tickets out of one. **The
zero-landed-stages case is the same logic at lower risk, not a different
one** — a gap found before any code exists costs even less to fix in place,
since there is nothing yet that a revision could possibly invalidate.

## Which path this is — checked before anything else

| Fingerprint | Goal | Landed stages | Path |
|---|---|---|---|
| Missing or invalid | — | — | Bounce back: owner closes, a fresh run supersedes it |
| Valid | Changed | — | Bounce back: owner closes, a fresh run supersedes it |
| Valid | Unchanged | One or more, and the fix would invalidate any of them | Bounce back: owner closes, a fresh run supersedes it |
| Valid | Unchanged | Zero, or one or more and every one still valid under the fix | **This file: in-place revision** |
| — (not a ticket problem) | — | The plan and acceptance criteria are correct; the *code* just doesn't meet them | `deliver-ticket`'s own shortfall loop — no issue edit, no shape-ticket invocation |

**Zero landed stages is not a special case — it falls out of the same rule.**
"Every already-landed stage stays valid" is vacuously true when there are
none yet, and that is the *lower*-risk end of this path, not a reason to
fall back to bouncing the ticket: a plan gap found before the first commit
costs nothing to fix in place, because nothing yet exists that the fix could
invalidate. Requiring a stage to already be landed before allowing an
in-place revision would create exactly the dead end this file exists to
close: `deliver-ticket` finding a plan gap pre-first-commit, routing to this
path per its own rule, and this file rejecting the case because its
precondition was written too narrowly.

**The row that isn't either path is worth naming as clearly as the two that
are.** The plan and acceptance criteria are fine, and a sub-agent's actual
output just doesn't meet them — that's a shortfall, `deliver-ticket`'s own
mechanism (`SKILL.md`'s *Shortfalls close where they were found*):
commented, dispatched, closed in a later commit, no issue edit and no
shape-ticket invocation at all. The tell: does reading the *plan* find the
gap, or does reading the *diff against a plan that's already correct* find
it? Only the first is this file's business — misrouting the second here
would turn every ordinary code-review finding into a ticket revision, which
is its own way of eroding trust in what a revision means.

## How to revise

- **Edit the issue body in place** (`gh issue edit --body-file`). Never file
  a second issue for the same goal — that is exactly the duplicate
  `inspect-the-repo.md`'s search exists to prevent, arrived at from the
  other direction.
- **One comment per revision pass, posted immediately after the edit, and
  the edit's own before/after text is quoted in it — not summarized.** The
  issue body is overwritten each pass, so the comment is the only place the
  prior wording survives; "tightened AC1's baseline" is a claim nobody can
  check six passes later, while the literal old sentence and the literal new
  one, side by side, are. Every revision comment carries, at minimum:
  - the exact prior text of what changed, quoted;
  - the exact new text, quoted;
  - which stage(s) or acceptance criteria it touches;
  - which already-landed stage(s) it leaves valid, and why (this is what
    makes the next bullet's "judged by the criteria that stood at the time"
    actually reconstructable later, instead of a claim resting on nothing);
  - whether the finding was executed-and-observed or read-and-inferred (see
    below).

  Beyond that floor, split the reasoning the same way
  `create-the-ticket.md`'s independent feasibility check already splits
  findings: a **technical fix** (a stale symbol, a missing consumer, a
  citation that named the wrong file) is stated as a correction; a
  **re-opened product decision** (a tradeoff reconsidered with a real
  counter-argument, not just a mistake) carries the old reasoning, the new
  reasoning, and which one won — the same way *Decisions made* already
  records a first-round decision, now applied to a decision revisited after
  filing. A reader who only sees the final shape, without this trail, can
  plausibly reintroduce a defect an earlier pass already found and fixed —
  #371's own fifth and sixth passes are the case in point: the fifth pass's
  fix was itself found overcorrected by the sixth, and the comment trail is
  what let that be stated as a correction to a specific prior claim rather
  than a fresh, unexplained flip.
- **A landed stage is judged by the acceptance criteria that stood when it
  landed, never retroactively by a criterion written after.** If a
  correction would make an already-landed stage newly fail, that correction
  needs a two-tier bar instead — one for the stage as landed, one for
  everything after it — the way #371's AC1 split into a stage-1 tier
  (text-diff-only, because stage 1 was a rename) and a stage-2-onward tier
  (byte-identical against the post-stage-1 baseline, not the original). A
  single bar that only ever passed by accident is not a bar; state the tier
  it actually belongs to.
- **A claim you are correcting may already have been copied into the tree,
  and overwriting the issue body does not move those copies.** This page is
  careful about which landed *stage* a revision leaves valid and says nothing
  about which landed *sentence* it leaves false — but a stage that has landed
  has written the ticket's claims into places an adopter reads: a doc comment
  that becomes the API reference, the emitted prose, a fixture docstring — and,
  once `finish-the-ticket.md` has assembled it, the changeset. **So a revision that
  changes what a claim says names every copy it can find, in its own comment,
  as work owed** — not as a suggestion, because the next reviewer will find
  them one at a time and each one costs a round. #371 is the case: the ninth
  revision amended the Goal for exactly one sentence about flat repos being
  unchanged, the thirteenth reversed its framing again, and the tree's two
  copies of it were still standing at stage 5 — where they blocked a commit
  whose code no reviewer ever found a defect in. **You do not edit those
  copies** — that is `deliver-ticket`'s tree and its own
  `deliver-a-stage.md` now enumerates these surfaces before a commit — but a
  revision that does not name them has handed the work to whoever trips over
  it.
- **Say what's landed as of this revision, in the comment — never as a
  maintained section of the issue body.** A "here's what's done" line in the
  body is correct for exactly as long as nothing lands before someone reads
  it, and nothing in this flow updates it when a stage does — `deliver-ticket`
  already reconstructs current state from commits and comments, per its own
  `start-or-resume.md`, and a second, unmaintained status living in the body
  is a second source of truth that goes stale first and is trusted anyway
  because it's the one at the top. Say it as a fact about this moment
  instead — "as of this revision, stages 1–3 have landed" — which stays true
  forever precisely because it never claims to be current.
- **Label a revision's own evidence the same way `inspect-the-repo.md`
  labels everything else**: executed-and-observed (ran it, traced the real
  function, read the actual committed diff) or read-and-inferred (reasoned
  from how the mechanism is scoped elsewhere). A revision that overturns a
  read-and-inferred claim with an executed one is strictly progress; say
  which kind each pass's finding was, the way #371's fourth pass labeled its
  own conclusion read-and-inferred and its sixth pass corrected it with a
  real disposable ESLint run rather than more reasoning.
- **The fingerprint's `grounded-at` does not move for a plan-only
  revision.** It records the commit the *shaping* was grounded in; that fact
  does not change because the plan text was corrected. Re-sync and bump it
  only if the revision itself was triggered by `origin/main` moving under
  the ticket — the ordinary pre-flight case, not this one.
- **A revision that splits or merges a stage, or writes a new criterion,
  runs `create-the-ticket.md`'s *Two passes over the finished draft* over
  what it changed.** Those passes are keyed to restructuring, not to
  filing, and this is the path restructuring actually happens on: #379's
  stages 7, 8, 10 and 13 and its criterion 19 were every one of them
  authored here, and its stage 7/8 split is where the plan bullet
  criterion 14 went on gating was dropped.

## When it lands, and who hears about it

- **A ticket that should move, moves.** Holding a sentence you already know
  is wrong so that a running review can finish against it does not save that
  review — it spends the next stage instead of this one. **The delivery queue
  is not the bar**; being right about the ticket is. #379 ran both errors in
  one ticket. *Early:* two revisions landed under a running review and stopped
  the stage on `deliver-a-stage.md`'s second-movement rule — *"a second
  movement on one stage stops"* — a review cycle spent on a target that would
  not hold still. *Then, over-correcting:* two further corrections were
  **queued** for a gap between stages, one of them restating the *Decisions
  made* entry stage 3's first implementation had misread; the delivering
  session ruled it correctly at a hand-back's cost, and the ticket still said
  the old thing while stage 3 went out for review. The owner ruled the
  queueing out — **「該動就要動」**.
- **Every edit to a live issue is announced to the delivering session, in the
  same breath as the push.** Not only one that moves a requirement — **any**
  edit: a body correction, a re-worded decision, a fixed citation, a label.
  The delivering side is the only party that can price what a change costs it,
  and it can only do that if it knows the change happened. **The revision
  comment above is the record, not the announcement** — a comment on the issue
  does not reach a session that is already running. A silent edit is how a
  reviewer earns a verdict against text that no longer exists. This is
  the other half of the same ruling — **「issue 有任何改動記得都要通知
  deliver 端」** — and it is what makes moving immediately safe.
- **The announcement carries what the delivering side needs in order to
  decide, and stops there:** which sections moved, whether any acceptance
  criterion or stage scope moved, which landed stages stay valid and why —
  and this run's read on materiality **offered as basis, never as a ruling.**
  `deliver-a-stage.md`'s movement bookkeeping belongs to the delivering
  session, and the shaper is the one party with an interest in its own edit
  being judged immaterial.
- **Batching stays a preference and stops being a reason to wait.** Two
  corrections found in one sitting go in one pass; a correction found alone
  does not wait for a second to keep it company.

**Once this skill dispatches delivery itself** — `create-the-ticket.md`'s
*The owner's word starts delivery* — that announcement is a message to this
run's own delivery agent rather than to a peer session. The channel changes;
the requirement does not.

## Recognizing diminishing returns

Not every finding earns another pass. Before starting one, check what kind
the previous pass's own fix produced:

- **A new, independent defect** — a different file, a different mechanism, a
  different claim than the fix just applied — is real signal once it has
  cleared the floor above. **Independent of the last fix is not the same as
  related to the ticket**: #379's four follow-ups (#386–#389) were each
  independent, and each one failed that test.
- **A defect *in* the fix just applied** — the same mechanism, corrected
  again — is still real signal once, maybe twice. #371's fifth pass (closing
  a loophole) and sixth pass (narrowing that close so it stopped
  overcorrecting) are one continuous thread on one mechanism, not two
  unrelated findings, and both were worth fixing.
- **Three or more consecutive passes tracing back to the same underlying
  design choice, each patching the previous patch**, is the signal to stop
  patching and ask whether the *choice* needs the owner's input rather than
  another implementation fix — the same "genuinely unknown, goes to the
  owner" bucket `resolve-the-direction.md` already uses, applied to a
  decision that resurfaced after filing instead of one raised before it.

The goal of a revision pass is a ticket a reader can trust without re-running
the trail themselves — not a ticket that has survived the most rounds.
