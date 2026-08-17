# Revising a ticket deliver-ticket has already started

**Trigger:** new evidence — a review, a hand-traced bug, a stalled assumption
— shows a real gap in an issue's plan or acceptance criteria, and
`deliver-ticket` has already landed at least one of its stages against it.

This is the narrow exception to *You do not touch the repository* and to
"never for touching a ticket already handed to delivery" above. It exists
because the alternative already in this skill — the owner closes the issue,
naming why, and a fresh run supersedes it — is a full reset, and a full reset
is the wrong tool when the goal hasn't moved and what already shipped is
still correct. #371 is the case this file generalizes from: six review
passes corrected its plan and acceptance criteria after stage 1 had already
landed, none of them touched stage 1 itself, and treating each one as a
close-and-reopen would have manufactured seven tickets out of one.

## Which path this is — checked before anything else

**Both of these must hold, or this is not a revision — it's the existing
bounce-back path (owner closes the issue, names why, a fresh run supersedes
it):**

- **The goal is unchanged.** The gap is in the plan or the acceptance
  criteria — a missing consumer, an underspecified field, a stage ordering
  that assumed something a later stage was meant to build, a criterion a
  wrong implementation could still satisfy. The Goal section's own text does
  not need to change.
- **Every already-landed stage stays valid under the correction.** If the
  new evidence proves shipped behavior is actually wrong — not "the plan
  for what comes next was wrong," but "what already landed needs to be
  undone or redone" — that is not a revision. Route it to the bounce-back
  path instead: a correction that quietly asks a landed stage to be redone
  is the scope change this exception does not cover.

## How to revise

- **Edit the issue body in place** (`gh issue edit --body-file`). Never file
  a second issue for the same goal — that is exactly the duplicate
  `inspect-the-repo.md`'s search exists to prevent, arrived at from the
  other direction.
- **One comment per revision pass, posted immediately after the edit**,
  recording what changed and why. Split it the same way
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
- **State what's landed and what's pending, updated, near the top of the
  revision** — a reader picking the ticket up mid-flight should not have to
  reconstruct execution state from a stage table meant to describe the
  target shape, not the current one.
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

## Recognizing diminishing returns

Not every finding earns another pass. Before starting one, check what kind
the previous pass's own fix produced:

- **A new, independent defect** — a different file, a different mechanism, a
  different claim than the fix just applied — is real signal. Revise.
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
