# Resolving the direction

**Trigger:** a direction or behavior exists that the current code cannot uniquely answer.

## Classify before you ask

Every open point falls into one of five buckets, and only one of them goes to the owner:

- **A technical fact.** The code already answers it. Go read it — don't ask.
- **An existing stance.** `CLAUDE.md` or `docs/philosophy/` already took a position on this exact question, even if the direction phrases it differently. Cite the position — don't ask.
- **A plain implementation detail.** No published stance, but a nearest analogue already exists in the repo and the direction doesn't imply a reason to depart from it. Decide it the way the analogue decided it, write it into the decision log as a derived decision, and move on — don't ask, and don't manufacture a question out of something that has one reasonable answer.
- **A product decision.** It changes what an owner or an adopter observes, it breaks a published contract, or two existing stances point different ways. This is the only bucket that goes to the owner.
- **Genuinely unknown.** No analogue in the repo, nothing in `docs/` speaks to it, and it's still a product decision. Also goes to the owner — but framed as *here are the honest options*, not *which of these did we already decide*, because none of them is the repo's answer yet.

The failure this classification exists to prevent runs in both directions: asking the owner something the code already settled wastes their attention and reads as not having read the repo; silently deciding something that actually changes observable behavior is a decision made without the one person who owns product tradeoffs, discovered later as a surprise in the diff.

## How to ask

**One blocking decision per question.** A message with three questions in it gets answered out of order, or the first answer changes what the other two should have been.

Every question that does go to the owner carries three things, in this order:

1. **Current state, with its evidence** — what the code does today, cited to the file or the test that shows it, not to memory of having read it earlier.
2. **The real options, each with its actual consequence** — what an adopter or a future maintainer experiences under each, not which one is less work to build. Implementation convenience is a fine tiebreaker once the product consequences are equal; it is never the reason offered for a product decision.
3. **A recommendation and why**, so the owner is confirming or overriding a position rather than generating one from nothing.

**No question with two options that behave identically.** If neither option is distinguishable from the outside, it isn't a product decision — it's a plain implementation detail that was misclassified, and it belongs back in that bucket.

## Keeping the decision log

Carry, for the length of the conversation:

- **What's confirmed**, and whether the owner decided it or you derived it from an analogue.
- **What was considered and rejected, and why.** The rejected reasoning is what tells a later question it's already covered — without it, a decision that resurfaces two turns later looks like a new question instead of ground already settled.
- **Constraints that must hold** regardless of how the remaining questions resolve.

**Don't re-ask a settled decision**, and don't let a later discovery quietly overwrite one — if something surfaces that contradicts an entry in the log, say so explicitly and let the owner re-decide with the new information in front of them. A silent reconciliation is a second decision wearing the first one's name, and the log stops being trustworthy the moment one entry in it was never actually reviewed.

## Convergence

The direction is ready for `create-the-ticket.md` when, and only when, all of the following hold:

- The target behavior is singular and stated without a hedge — not "roughly" or "in most cases."
- Every place this could break existing behavior has a stated answer, not an assumption that it won't.
- Defaults, rejection conditions, and error behavior are decided, not left to whoever builds it.
- The relationship to any existing published contract is decided — extends it, replaces it, or sits beside it, and which.
- What this ticket does not cover is decided, not merely unmentioned.

If any one of these would produce a different implementation depending on how it's answered, and it isn't answered yet, the direction is not ready to become a ticket — go back to the discussion, not forward to the draft.
