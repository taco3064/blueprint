# Running a tier

**Trigger:** the owner names a parent and a tier to run.

## One implementation session per ticket, not one per tier

Spawn a fresh session for each ticket with the Agent tool. It writes code and you
do not, so it inherits none of this skill's boundary. Hand it the parent number,
**the one ticket it is working**, and the instruction to read `CLAUDE.md` plus
every `.claude/docs/` page whose trigger fires. Hand over the ticket *number*,
not your summary of it — a summary is a second source of truth for something you
already wrote, and the two will differ.

**A session held across a whole tier is the shape to avoid.** One died mid-tier
here holding everything it had learned, because a transcript is not a place
anything survives.

If the owner already has a session open and points at it, use that one.
`ListAgents` shows what is reachable, and **confirming the target before the
first send matters**: addressing the wrong session fails silently — the message
lands, someone answers about a different repo, and nothing in the reply says it
came from the wrong place.

When two rows could both be it, the confirmation goes **in the message** rather
than in a round trip before it: open by naming what you believe the recipient is
working on, specifically enough that the wrong one can stop at the first line.
A question costs a turn and a wrong guess costs the whole exchange; a first line
costs neither.

## Ask for the plan before the code

The implementation side plans first, and that plan comes to you before anything
is written. Read it against the tickets, and answer three questions in the reply:

- **Does the plan reach each ticket's `Done when`?** Not "is it reasonable" —
  reasonable plans miss acceptance criteria all the time.
- **Does it stay inside the tier?** Work that belongs to a later ticket, done
  early because it was convenient, silently empties that ticket.
- **Where does it contradict a ticket?** That is a the gap loop report arriving before
  the cost, and it is usually the ticket that is wrong, not the plan.

## When a merged result falls short

**There is a third exit, and it is often the right one:** fold the gap into an
adjacent open ticket — but only when that ticket is already building the thing
the gap belongs inside. A missing ban group whose entry does not exist yet
belongs to whoever is creating that entry; reopening the closed ticket to add one
group to someone else's new work is process for its own sake. When you fold, say
so on the parent, so the closed ticket is not read as more complete than it was.

## While it runs

The counter is one cheap call:

```bash
gh api repos/:owner/:repo/issues/<parent> --jq .sub_issues_summary
gh api repos/:owner/:repo/issues/<parent>/sub_issues --paginate \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'
```

`--paginate` is not optional — the default page is 30 and a decomposition outgrows it.

Report as: what is done, what is in flight, what is unblocked and next, what is blocked and on which ticket. A closed tier is the unit the owner cares about, and the trigger for the boundary sweep.

## A tier is not closed when its last PR merges

One more gate, and it is the repo's, not GitHub's: **the tier's mutation sweep
runs, its survivors are judged, and the tests that judging calls for are
written.** Only then is the tier done — every ticket can be closed and the counter
green while a survivor sits unexamined, and the counter cannot see it.

Dispatch one sweep per tier, after the tier's last commit lands. **Never run it
locally; it hangs the machine.** `mutation.yml` by `workflow_dispatch` with
`--ref <branch>`, then read the run's artifact and step summary.

Judging belongs to the implementation side, and it has three honest endings per
survivor — a test, a one-line `undecidable` note at the site, or **a change to the
source**, when the mutant survived on a branch that decides nothing. The third is
the most valuable and the easiest to disguise: it arrived once inside a commit
typed `test:`, which is what a reader scanning for behaviour changes skips.

What you check for is the fourth thing, which is not an ending: a survivor waved
off, or `src/` edited to move a score with no defect behind it. The test is
whether the commit can name what the mutant proved.
`.claude/docs/mutation-testing.md` is the doctrine and
`grep -rni undecidable src/` is the ledger.

**Count the dispatches.** The budget and its reasoning live in
`.claude/docs/mutation-testing.md`; what belongs to you is that the count is
visible from here and invisible from inside the work. **No dispatch during a
ticket — one sweep per tier**, so a ticket held open waiting for a run is a
finding, and so is a run of them inside a few minutes on one branch. Same class
as a survivor waved off, costing wall-clock rather than correctness.

```bash
gh run list --workflow=mutation.yml --limit 20 \
  --json createdAt,headBranch --jq '.[] | "\(.createdAt[5:16])  \(.headBranch)"'
```

## The gap loop

The implementation side does not widen its own scope. When it reports that a
ticket under-specifies something, or contradicts the code as it stands, that
report lands on you. Three exits, and picking the wrong one is how a
decomposition rots:

1. **The ticket is imprecise, the scope is unchanged** — edit the sub-issue, and
   comment on it saying what changed and what forced the change. The ticket body
   stays the single current truth; the comment carries the history.
2. **The work is real but belongs to no existing ticket** — file a new
   sub-issue, attach it to the parent, place it in the tiers, and say in the new
   ticket which ticket surfaced it.

   **Unless it is not the parent's at all**, which happens more than the three
   exits suggest: a defect that predates the parent, or one this work merely made
   frequent enough to notice. File it standalone, name the work that surfaced it,
   and **do not attach it**. Attaching keeps a list looking complete and makes the
   claim-coverage check lie — [`close-the-parent.md`](./close-the-parent.md) reads an unattached ticket as out of scope,
   which it is, and an attached one as serving a claim, which it does not.
3. **It touches what the parent asserts** — stop. Report to the owner with the
   contradiction stated plainly and the options you see. Do not edit the parent.

   **Then carry the question until it is answered.** A decision asked for inside a
   comment about something else is lost the moment the next comment lands: two sat
   unanswered through four tickets, each buried in the last third of a comment
   headed with a ticket number, while eighteen comment titles said nothing about
   any decision being open. Every status comment from then on carries the open
   ones — a short list, at the top, until it is empty. This is the same argument
   as commenting on clean tickets: the durable record has to hold what is
   unresolved, not only what is finished.

**Every finding gets two dispositions, and they are independent.** What happens
to *this* instance — fix now, defer with enough context to act on later, or accept
and record it so the next sweep stops re-raising it. And separately: **what would
prevent the next one** — a ticket's wording, a missing convention, a gate, or
**nothing**. That last option is not a formality. A finding whose only evidence is
a case the existing process already caught yields "nothing", and writing the
"nothing" down is what stops the ledger reading as though every finding earned a
rule.

There is a fourth thing that is not a gap: **discoveries made while building**.
When implementation surfaces a blind spot inside the ticket's own scope — an
acceptance criterion that would have passed for the wrong reason — that belongs
written back into the ticket body under its own heading, so the ticket stays a
true account of what it covers. That is exit 1 with a better name.

### Your own decisions get no reader — manufacture one

Everything above is you reviewing someone else. Nothing reviews you, and the
asymmetry has a mechanism: **a decision that becomes code gets a reader; a
decision that stays in a ticket body does not.** Cuts, orderings, scope calls and
"this precedent applies here" are all decided once, by one reader, and then
inherited by everyone downstream as if they had been checked.

So send them out. Not as a general "check my work" — as **specific claims with
the file and line that would settle each one, and no reasoning attached.** The
reasoning is not the payload: what kills a wrong claim is somebody opening the
file, and an argument invites agreement with the argument instead.

**A line number carries no evidence of which tree produced it**, and that is how
this form fails quietly — a `grep` in a stale checkout returns a number that looks
current. So **cite the commit with the line**, or read through
`git show <ref>:<path>`. Reading from git was already the rule and did not stop it
twice, because a rule you followed and a rule you skipped produce the same-looking
citation; what this adds is that the artifact shows which.

**A "yes" tells you nothing about the claim.** A correct claim gets the same reply
whether its reader checked or nodded. So the form is only ever validated by a
claim that turns out false, which means **send the ones you are least sure of, not
the ones you want confirmed** — the opposite of what asking for review feels like,
and the whole discipline.

The reply does carry one thing, and naming it is what stops "tells you nothing"
being softened into "weak evidence": the output is two-valued. *"No, and here is
the line"* kills a claim; *"yes, and here is the line"* says the reader opened the
file. **Silence says neither, so answer even when you agree.**

Measured once: seven claims sent **with their reasoning still attached**, two
died — both to the reader opening a file, neither to the reader weighing the
reasoning. The reasoning was present and did nothing, which is the argument for
leaving it out.

**Peer review is not verification**, and two readers agreeing is not two checks —
they converge on the same resemblance. Claims here survived two sessions examining
them and died to the owner asking what the thing actually does. Not a better
reviewer: a different question, and one that needs no context to ask.

## When the tier closes, re-verify every ticket below it

A ticket is written against the repo as it stood the day it was cut, and every
tier that lands moves that repo. So a closed tier is not only a milestone to
report — it is the trigger to re-read every open ticket below it, before anyone
picks one up.

**This is the sweep nobody asks you for.** the gap loop waits to be told; a stale
ticket never tells, and by the time it does the cost is already paid.

For each open ticket downstream of the tier that just closed, check three things
against the code as it stands now:

- **Line and symbol references.** A ticket citing `resolve.ts:171` is citing a
  line that has moved. Correct it, or drop the number and name the function —
  the number was only ever a convenience, and a wrong one sends its reader to a
  passage that argues against the ticket.
- **Premises the closed tier already satisfied.** The dangerous shape is the
  *half*-done ticket: the part it described most vividly has landed, the part it
  mentioned in passing has not, and its reader rebuilds the finished half because
  the ticket told them to. Say which half moved.
- **Primitives that now exist.** When the closed tier produced a resolver, a
  helper, or a shared verdict function, name it in the ticket. A ticket that does
  not point at one invites a second implementation of the same rule, and two
  sources of truth that agree today have not agreed about tomorrow.
- **This skill, and the docs the tickets stand on.** They change under a running
  tier and a session in flight never re-reads them, so a rule added mid-tier
  reaches nobody working at the time — it has already happened here. Re-read at
  the boundary, and say what moved in the dispatch that starts the next ticket.

Then two questions that are not about any ticket:

- **Which assertion here could be satisfied by the wrong thing?** A standing
  question, asked every sweep, never closed once. `CLAUDE.md` holds the prevention;
  this is the detection half, and it exists because prevention is demonstrably not
  enough — one instance was introduced while its predecessor was being fixed, same
  file, same sitting.

- **Render what the tier emits, and read the output** — in the shape the tier just
  enabled, which is the part the boundary adds. The rule itself is in the spine
  under *How you verify*, because its moment is not this one: it pays most when
  reached for mid-ticket, on a suspicion that a behaviour is invisible from the
  code.

The three checks above go back into the ticket bodies they belong to; the two
questions produce findings, which become tickets or comments in the ordinary way.
Either is exit 1 of the gap loop, reached before the gap cost anything.

Report the sweep as one list: what moved, what turned out half-done, what came
back clean. **A ticket you checked and found still true is a result** — say so by
name, or the next sweep pays to learn it again.
