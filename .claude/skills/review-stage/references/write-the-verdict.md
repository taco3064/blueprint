# Pass two, the report, and the re-review

**Trigger:** pass one is written and the implementer's claims have arrived — or a fixed tree has come back for a second look.

## Pass two — audit the claims, one bucket each

The dispatcher now hands over the implementer's report and its commit message, verbatim, because pass one is already written and can no longer be anchored by them. **Every claim in it goes in exactly one bucket, and you say which:**

- **Proven by the code** — you read the path and it cannot behave otherwise.
- **Proven by a test** — a test exists, it enters through the real entry, and it fails if the claim is false. Pass-one class 6 is what qualifies it.
- **Representative cases only** — true of the inputs that were tried, unproven for the class they were drawn from.
- **Over-generalised from a partial result** — the evidence covers a part and the sentence covers the whole. **The highest-risk shape is an absolute**: *"the two engines can never differ"* does not follow from five agreeing cases, and it is the claim most worth one counterexample.
- **Contradicts the implementation** — the report describes behaviour the code does not have.
- **Contradicts the owner's decision** — rank five against rank one. This is a BLOCKER regardless of how well the code implements what the report describes.

**A claim you cannot place is a claim you have not checked.** "Sounds right" is not a bucket, and neither is "the tests are green".

**The last two buckets are findings by construction.** The middle two are findings when the stage's acceptance rests on them — an over-generalisation nothing depends on is a wording problem; one holding up an acceptance criterion is REQUIRED.

**Where pass two and pass one disagree, pass one wins and the disagreement is the finding.** You built that account from the authority sources and the code; the report is rank five.

**Part two may also carry a previous reviewer's findings**, when the session holding your predecessor ended and you were dispatched in its place. Nothing changes: it arrives in part two precisely because it is somebody else's conclusion, it is audited with the same six buckets, and **a predecessor's finding is re-verified by re-running its reproduction, never by trusting that it once held.** The round count arrives with it and continues — a new reviewer is not a new budget.

## The report

Exactly this shape. The dispatcher reads it as input to a binary decision, so the fields it acts on come first:

```
Verdict: PASS | BLOCKED
Reviewed: base <sha>, code hash <hash>, requirement hash <hash>, worktree <path>
Stage: <the stage as the packet named it>
Authority checked: <which of ranks 1–4 you read, and what each one said this stage owes>

Blocking findings (BLOCKER):
1. <one sentence: what is wrong>
   - Evidence: <the file, symbol, command or output it is visible in>
   - Reproduction: <the exact input or command that shows it>
   - Expected: <what the authority source says should happen, and which rank>
   - Actual: <what happened>
   - Impact: <who breaks, and how it presents to them>
   - Required direction: <what the fix must satisfy — never the patch itself>

Required findings (REQUIRED):
<same six fields>

Verified:
- <what you checked and found sound, one line each — including probe classes ruled not triggered, with the reason>

Out of scope (FOLLOW-UP):
- <real, addressed, and explicitly not blocking this stage>

Claim audit:
- <each claim from the implementer's report, with its bucket>

Verification status:
- Ran: <the commands, and what they showed>
- Could not run: <what, and why — a suspicion you could not reproduce belongs here, not above>
```

**Every finding carries all six fields or it is not a finding yet.** A finding with no reproduction is a guess that costs a fix round; one with no expected-and-actual pair leaves the implementer to invent the target; one with no rank cited invites a fix that satisfies a lower authority than the one it violated.

**`Required direction` is a constraint, not a patch.** Say what the fix must satisfy — *"one authority for glob semantics, shared rather than reimplemented"* — and stop. Writing the patch makes you the author of the code you are reviewing, and the next review has nobody outside it. **And if the direction turns on a product decision, that is not yours either**: name it as a BLOCKER that needs the owner, and say what the options cost. `SKILL.md`'s authority order is what makes that a stop rather than a judgement call.

**`Verified` is not optional padding.** A dimension checked and found sound is a result; its absence is how *"nothing found"* hides *"nothing looked at"*, and it is the only record that a probe class was considered at all.

**PASS is emitted only when there is no BLOCKER and no REQUIRED.** FOLLOW-UP entries do not move it.

## When the dispatcher says a finding will not reproduce

It is required to verify your findings rather than acting on them — so this will happen, and it is not an attack on the review.

**One exchange, then it stands.** Either **withdraw it explicitly**, saying what you had wrong, or **show why their reproduction missed it** — and the likeliest reason is that their rebuilt fixture lacks the very property the finding was about, which looks exactly like a finding that was wrong. Check that theirs carries it before you concede, and check yours before you insist.

**A withdrawal is not a fix round** — nothing was fixed. It is a correction to the report, and the dispatcher records it as one.

## Re-reviewing a fixed tree

**Do not start over freely.** A second unstructured pass produces a different set of opinions on the same code, which reads to everyone downstream as the review being arbitrary. Answer these six first, in order:

1. **Is the original finding gone** — verified by re-running its own reproduction, not by reading the fix?
2. **Was the whole class fixed, or just that input?** Run the sibling inputs from the same dimension in pass-one class 4. An instance repaired without the mechanism is still REQUIRED.
3. **Did the fix create a second semantics** — a new parallel judgement, normaliser or comparator introduced to satisfy the finding?
4. **Did it add a public contract change** the ticket never asked for — a new field, a changed output line, a widened type?
5. **Does it still obey every earlier decision**, including the ones the first pass confirmed it obeyed?
6. **Did anything that previously passed regress?** The fix diff is a change in its own right, and a fix for one finding is the most common cause of the next one.

**Then review the fix diff completely**, as pass one, scoped to what it touched.

**A finding you see for the first time on a re-review is still a finding.** There is no bonus round for novelty and no obligation to have caught it earlier — but it lands inside the dispatcher's budget like any other, which is the mechanism that ends the loop instead of extending it. **The budget is not yours to spend or to spare**: an exhausted budget escalates the stage to the owner, and it never converts a BLOCKED into a PASS.
