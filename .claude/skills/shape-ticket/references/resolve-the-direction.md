# Resolving the direction

**Trigger:** a direction or behavior exists that the current code cannot uniquely answer — or a finding is reported against a ticket already in delivery.

## Classify before you ask

Every open point falls into one of five buckets, and only one of them goes to the owner:

- **A technical fact.** The code already answers it. Go read it — don't ask.
- **An existing stance.** `CLAUDE.md` or `docs/philosophy/` already took a position on this exact question, even if the direction phrases it differently. Cite the position — don't ask.
- **A plain implementation detail.** No published stance, but a nearest analogue already exists in the repo and the direction doesn't imply a reason to depart from it. Decide it the way the analogue decided it, write it into the decision log as a derived decision, and move on — don't ask, and don't manufacture a question out of something that has one reasonable answer.
- **A product decision.** It changes what an owner or an adopter observes, it breaks a published contract, or two existing stances point different ways. This is the only bucket that goes to the owner.
- **Genuinely unknown.** No analogue in the repo, nothing in `docs/` speaks to it, and it's still a product decision. Also goes to the owner — but framed as *here are the honest options*, not *which of these did we already decide*, because none of them is the repo's answer yet.

The failure this classification exists to prevent runs in both directions: asking the owner something the code already settled wastes their attention and reads as not having read the repo; silently deciding something that actually changes observable behavior is a decision made without the one person who owns product tradeoffs, discovered later as a surprise in the diff.

**And the classification has a price this file never named, which is why it gets ignored in practice.** A question costs a round-trip and a slice of the owner's attention, spent before anything else can move — so anything that *feels* consequential gets routed to him regardless of which bucket it is actually in. **The bar is not how much rides on it: escalate when proceeding under any assumption would be unsafe, or would make the work useless if wrong.** Everything else is decided, its basis recorded in the log below, and the owner overrides if he disagrees. This skill's first run put ten decisions to the owner and at most two of them needed him.

Three ways a question gets manufactured, all three from that run and the delivery that followed it:

- **Don't invent an option the direction never raised** in order to have something to ask. #384's item 10 was put to the owner as cuttable-or-not; nobody had proposed cutting it.
- **A scope question the issue's own text answers is not a product decision**, however consequential the underlying work feels. #378 explicitly declines to prescribe a fix, and whether that blocked its own split into #379–#384 was put to the owner anyway.
- **Strip the frame before you rule.** A finding arrives with an address, a measurement, and often **a case for including it** — and the case is the reporter's, not evidence. Ask what was measured and where, refuse the argument that came attached, then make or decline the case yourself. #379's delivery offered the `layerFiles` advice as *"this ticket's own character in one of its own four named fields"* — an argument, not an address — and quoted a sentence from the shaper's own message back as though it were a requirement. **A shaper that rules on a pre-framed question has been handed its answer**, and the ticket's scope is then set by whoever reported last.

**And what a wrong decision costs is not what a wrong question costs — which is why the bar above does not move.** A question spends one round-trip of the owner's attention. **A ruling lands on the record in your name**, and a wrong one is refused by a delivering session spending a dispatch on it: an escalation that is wrong costs the owner a round-trip, a ruling that is wrong costs the ledger its integrity. **So the answer to a premise you are not sure of is to check it, never to hand it to the owner.**

**A ruling that overrides a recorded number, state or verdict — a budget, a count, a review outcome, a landed stage's status — quotes the record it is reading, and names who holds the evidence when that is not you.** The case is the first ruling this skill made with the owner asleep: that stage 3 of #379 had its exhausted fix budget reset, on the premise that both its rounds were spent under a ticket ambiguity a later revision pass repaired. They were not — both were the code failing on its own merits — the delivering session refused the refill, and the ruling was withdrawn. Three specifics, all read off that one ruling:

- **Re-read the ledger at the moment of ruling, not from memory of having read it.** The premise was refuted by stage 3's own review-state comment — *"No fix round was consumed; nothing had been reviewed"* — in a comment that same run had quoted three hours earlier. **Having read something is not having checked it**, which is the discipline *How to ask* below already demands of a question's evidence, cited to what shows it rather than to memory of having read it.
- **A count and the event that produced it are different facts.** `deliver-a-stage.md` keeps them apart itself: an incomplete handback goes back as a first pass and costs *"No fix round"*, and the round number *"increments when a fix is dispatched, never when a BLOCKED arrives"*. The ruling collapsed the two and read a spent budget out of the narrative around it. **Where the delivering side keeps a counter, the counter is its fact, not your inference from the story around it** — it is on the review-state comment, where it can be read.
- **State what would make the ruling wrong, and to whom.** The withdrawn ruling did do this, and that one clause is why the exchange cost a message instead of an argument. **It is required, not a flourish**, and it names the party holding the disproof — *wrong if the review-state comment records no round spent, and the delivering session is the one holding it.*

**And a ruling that does not survive is withdrawn where it was made.** This one was withdrawn in a separate comment two minutes later, and the original still stands unmarked — so the record carries a live ruling and its retraction as two comments a reader can meet in either order, and the one who stops at the first acts on a decision nobody holds any more. **Edit the ruling itself**: say it is withdrawn, point at what replaced it, and leave the reasoning that was wrong where it is, since that reasoning is what stops the ruling being re-derived. `SKILL.md`'s *Every comment names its author, a retraction reaches back, and a citation waits for its target* is the rule, and it is also why the pointer is written only once the thing it points at exists.

## The floor — is it related to what this ticket is fixing

A finding reported against a ticket already in delivery gets one test, and it is the owner's:

> **我們的目標是改 A，他額外發現 B 的問題，還跟 A 不相關，那關我們屁事**

**A defect in the fix for A is A's.** Untrue output that A's own repair added is the same work, and it resolves to *in* — #379's stage 20 was a false sentence printed by output an earlier stage of that ticket had added, and it belonged to the ticket.

**A defect the work happened to sit next to is not** — however true, however measured, however adopter-facing. **It is recorded in the issue, and the ticket ships.** Not a stage, not a follow-up, not a deferral, not a revision pass, not "the owner can weigh it later": the record is the whole disposal, and there is nothing else on offer. **`revise-an-in-flight-ticket.md` is entered through this test, not beside it** — its own trigger says so at the top.

**Both bars this replaces failed the same way — each left somewhere for everything to go.** *"Is it a false statement"* admits comments and test fixtures, so there is always a next one; *"an adopter meets it"* admits any adopter-facing defect anywhere in the tool. Under those two, #379 opened four follow-ups (#386–#389) during its own delivery and grew from one filed stage to a plan of twenty — and its stage 17 was seven restatements of one fact, four of them in comments. **Reporting was free because nothing was ever refused, only relocated.**

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

**Record a ruling at the level the owner stated it, not at the level of the instance that provoked it.** *"全部塞進 ④"* is a ruling about a class, and every later *"should this one go in ④ as well?"* was answered before it was asked. **A per-instance question a class ruling already covers is not asked.** #383's scope went to the owner three times — whether to split `relative-escape` out, whether `projectRoot`'s public-API reach changed the answer, and whether the `unavailableGate` gap belonged elsewhere — and the first answer covered all three.

**If an instance genuinely differs, name which class ruling it appears to contradict** and let the owner re-decide with that in front of him. That is the paragraph above at a narrower scale — not a licence to walk the class one instance at a time.

## Convergence

The direction is ready for `create-the-ticket.md` when, and only when, all of the following hold:

- The target behavior is singular and stated without a hedge — not "roughly" or "in most cases."
- Every place this could break existing behavior has a stated answer, not an assumption that it won't.
- Defaults, rejection conditions, and error behavior are decided, not left to whoever builds it.
- The relationship to any existing published contract is decided — extends it, replaces it, or sits beside it, and which.
- What this ticket does not cover is decided, not merely unmentioned.

If any one of these would produce a different implementation depending on how it's answered, and it isn't answered yet, the direction is not ready to become a ticket — go back to the discussion, not forward to the draft.
