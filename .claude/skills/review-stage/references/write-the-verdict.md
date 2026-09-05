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

**One of the two documents part two hands you is not in the tree you reviewed.** The draft commit message is nowhere in `git diff --cached`, so correcting it moves nothing any probe was run against — and it is still a finding, because the push makes it permanent and no later stage can revise it in place. **So when a finding's only subject is that draft, say so in the finding.** It keeps the severity its content earns; what the sentence buys is the dispatcher being able to tell it from a finding on the tree, which it otherwise cannot (`deliver-a-stage.md`, *Reading the verdict*).

**A third subject is neither the tree nor the draft: the issue's own prose.** A criterion carries worked examples — a named check target, a count, a sentence describing what some cited artifact contains — and those can be wrong while the criterion still decides the same cases. **A defect whose only subject is the issue's illustrative prose is FOLLOW-UP, and you say that it is.** It is real, it is worth recording, and **it does not block the stage**: routing it upstream as REQUIRED stops the tree on a sentence the tree does not contain, and the repair costs an issue edit, a materiality ruling and — where a review is running — that review, discarded.

**Two shapes on the issue are REQUIRED and they are not this one.** A criterion that **cannot be decided as written**, because it contradicts itself or asks for something unmeasurable; and a criterion that **describes the deliverable wrongly**, so a tree that satisfies it is the wrong tree. **The test is the same one the dispatcher applies: name the artifact that comes out different.** If the answer is only "the issue would read correctly", it is FOLLOW-UP. **#387 ran both in one review** — two absolutes that could not be satisfied together (REQUIRED, correctly: no tree could meet both) and a miscounted characterisation of a cited comment (raised as REQUIRED, and it cost a `VOID`ed pass one to repair a sentence that decided nothing).

**The shape to expect there is a sentence that was true when it was measured.** #371's stage 5 shipped *"with the fix removed and the self-ban widened the suite ran fully green"* — a real measurement, correctly reported, taken on the tree before that round's own fix changed the assertion it was measuring. Nothing was fabricated and the sentence is false about the tree it rides on. **A measurement's tree can move under it, so a claim is checked against the tree in front of you rather than against how it was obtained.**

**A report that hands you its own evidence gap has not thereby discharged it.** *"I removed the `layers: false` guard and the suite still passed"* is not a seventh bucket and not a courtesy — it is a **proof, supplied by the only party in a position to supply it, that nothing pins the behaviour.** If the surviving mutation changes real behaviour and sits inside the claimed scope, it is **REQUIRED**, and *the code is currently correct* is not the answer to it: what is missing is the thing that keeps the code correct after the next edit. The one exit is `CLAUDE.md`'s ledger — the one-line `undecidable` assertion at the site, proving the mutant is equivalent — so a survivor that is genuinely equivalent either carries that line or does not have the exit. Outside the claimed scope it is FOLLOW-UP like anything else.

**Where pass two and pass one disagree, pass one wins and the disagreement is the finding.** You built that account from the authority sources and the code; the report is rank five.

**Part two may also carry a previous reviewer's findings**, when the session holding your predecessor ended and you were dispatched in its place — recovered from the handback file your predecessor wrote before it could return it, as often as from a message that did arrive. Nothing changes, and the recovery changes nothing either: it arrives in part two precisely because it is somebody else's conclusion, it is audited with the same six buckets, and **a predecessor's finding is re-verified by re-running its reproduction, never by trusting that it once held.** The round count arrives with it and continues — a new reviewer is not a new budget.

## The report

Exactly this shape. The dispatcher reads it as input to a binary decision, so the fields it acts on come first.

**The pass-one handback is this same report with `Claim audit` empty and the verdict line reading `pass one — not yet computed`.** The claims have not arrived, so the audit cannot exist and the verdict is not computable; everything else — scope, axes, crossings, findings, verified, verification status — is filled in and goes back at that point. That is the artifact part two and every later round are measured against.

**Both artifacts are written to the file the dispatch named — when it named one — before either is returned, and the path goes back with them** — the handback with the `pass one — not yet computed` line, the final report with the verdict line (`SKILL.md`'s *You do not write*, which carries that scope and names the one caller it does not reach). **Writing it first is what makes a finding outlive the agent that found it**: #385's stage IV reviewer raised a REQUIRED, was killed between part one and part two, and its handback existed nowhere but in the message it never got to send — the replacement's independent pass one did not find the same thing, and a completion-test reader found it again two stages later. **It moves nothing about the passes themselves.** Pass one is still written before the claims are opened, the blocks still freeze there, and the file is still not a comment on the ticket.

```
Verdict: PASS | BLOCKED
Reviewed: base <sha>, code hash <hash>, requirement hash <hash>, worktree <path>
Stage: <the stage as the packet named it>
Claimed scope: <what this stage asserts is TRUE, in behavioural terms — not what it added.
               This is the line every FOLLOW-UP is judged against>
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

Axes in play:
- <axis>: <its values in this change — the ones a probe could actually take>

Dimensions crossed:
- <axis=value x axis=value>: <the probe you ran and what it returned — or the reason
  these two provably cannot reach the same code>

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

**`Claimed scope` and `Dimensions crossed` are load-bearing, not headings.** The first is what stops FOLLOW-UP absorbing the very behaviour a verification stage exists to prove, and it is only worth that if it was written before the probes (`rebuild-the-picture.md`, question 6). The second is the record that a change was not merely walked one axis at a time. **Neither is a field you fill in after choosing the verdict** — a PASS with either one reconstructed from what you happened to find is the failure mode both were added for.

**`Axes in play` is the half of the crossing record that has to survive.** Crossings alone record what you probed and lose what you were choosing from, so a whole axis dropped before the pairs were formed reads exactly like an axis that had no interesting pairs — the same ambiguity the crossings were added to remove, moved one level up. List the axes with their values, then account for **every** pair they make: probed, or ruled out with the reason.

**All three blocks are pass-one output and freeze there.** They go back with the pass-one findings, before part two exists. Pass two audits claims and adds no crossings; a re-review carries them forward unchanged and **may only extend** — a fix introducing a new value on an axis adds a row, and nothing already listed is removed or reworded. **An axis first written down after reading the implementer's report is an axis that report chose**, which is the anchoring the two-pass split exists to prevent, and the same holds for a scope, and for a pair that appears only once it has been found clean.

**And the dispatcher checks these blocks twice** — `deliver-a-stage.md`. Once when the handback arrives, **before part two is sent**, which is the only moment the freeze is still verifiable rather than merely asserted; and once at the final report, where the pass-one blocks are compared against the copy it kept and may only have extended. Either check failing is `VOID`, costing no fix round. **A pass-one block that moved between the two goes to a fresh reviewer, not back to you** — by then your first pass was written with the implementer's report in hand and no longer exists to re-run. That check is what makes `SKILL.md`'s *PASS asserts…* a gate rather than an instruction, so the two pages are one mechanism: **do not answer a returned `VOID` by adding the heading** — the block is a record of work, and a record written to satisfy a shape check is the thing this whole page is against.

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
   The `Claimed scope` line does not move between rounds either — a fix is not an occasion to
   redraw what the stage said it was proving.
6. **Did anything that previously passed regress?** The fix diff is a change in its own right, and a fix for one finding is the most common cause of the next one.

**Then review the fix diff completely**, as pass one, scoped to what it touched.

**A finding you see for the first time on a re-review is still a finding.** There is no bonus round for novelty and no obligation to have caught it earlier — but it lands inside the dispatcher's budget like any other, which is the mechanism that ends the loop instead of extending it. **The budget is not yours to spend or to spare**: an exhausted budget escalates the stage to the owner, and it never converts a BLOCKED into a PASS.
