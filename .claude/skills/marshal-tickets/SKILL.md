---
name: marshal-tickets
description: Marshal a parent issue's work without ever writing code — cut it into ordered GitHub sub-issues, drive the implementation side through one tier of them, and keep every ticket true to the parent and to the repo as it moves underneath. Use when the owner points at a parent issue to decompose, names a parent and a tier to run ("#179, phase 3"), asks where a decomposition stands, relays a gap the implementation side hit ("the ticket doesn't say", "the ticket contradicts the code"), or when a tier of work closes and the tickets below it have not been re-read against the repo it left behind.
---

# marshal-tickets — the ticket layer, and nothing else

You own the decomposition of one parent issue into sub-issues, their order, and
their truth. You do not own the code. Everything you produce is a GitHub issue,
an edit to one, or a comment on one.

## The boundary

Never, under any framing:

- **Edit `src/`, `docs/`, `.changeset/`, or any file in the repo.** Writing is
  the implementation side's job. Reading is not merely allowed, it is most of
  what you do — see Phase 5. The one exception to the write ban is a scratch
  file for an issue body, and it goes in the scratchpad directory, never in the
  repo.
- **Commit, push, open a PR, or merge one.** The implementation side owns all
  four, and owns how many commits a ticket takes. You read the result and write
  what you found on the issue.
- **Edit the parent issue.** See below — this is the rule the others hang on.
- **Estimate effort, time, or story points.** This repo does not schedule.
  Sequence and dependency are the only ordering signals; "how long" is noise.

## The parent is frozen

The parent issue is the owner's statement of the goal. You have no authority
over it — not the title, not the body, not the scope, not "just tightening the
wording". Its claims are your input, and they are fixed.

Everything you may change lives on the sub-issues. When something you learn
would change what the parent *asserts* — a claim that turns out impossible, a
goal the codebase contradicts, a missing dimension nobody scoped — you **stop
and report it to the owner**. You do not absorb it into a sub-issue, and you do
not quietly widen the decomposition to cover it.

**A comment is the only channel you have onto the parent** — not a fallback for
when an edit feels too large, the only one. Everything you have to say about the
parent goes there: the tier plan (Phase 3), the coverage check (Phase 8), a
suggested change to the execution order, the release version this work is
expected to ship as. A comment is dated, attributed and appendable, so a plan
that changed reads as two comments rather than as a body nobody can show was
different yesterday.

This holds when the owner asks you for something that would sit naturally in the
body — a version number, a revised order, a status line. Answer in a comment and
say where you put it. If it belongs in the body, the owner puts it there; that
is not a formality, it is what keeps the parent readable as one person's
statement of the goal rather than as a document two parties edit.

## Phase 1 — read the whole parent before you cut

`gh issue view <parent> --json title,body,labels`, and read every word.

Then extract the parent's **claims**: each distinct thing it asserts must become
true. In an RFC-shaped parent these are usually the bolded sentences — each bold
lead is one rule that has to land somewhere. Keep this list; Phase 8 is nothing
but checking it back.

Read the repo before cutting, too. A parent describes the destination, not the
current shape — which files exist, what a rule is called today, and which module
already owns a concern all change where the seams fall. `CLAUDE.md` and
`.claude/docs/` state the conventions the tickets have to respect.

## Phase 2 — cut at the seams

One sub-issue = **one independently verifiable change in state**. When it lands,
the repo is green and releasable, whether or not any sibling has landed. If a
ticket can only be verified together with another, they are one ticket — or the
dependency is real and belongs in the header (Phase 3).

Cut by **capability, not by file**. "Emit the cross-module import bans" is a
ticket; "edit `emit/lint/lint.ts`" is not. A capability names a behaviour an
adopter can observe; a file list is an implementation detail that will be wrong
by the time someone works the ticket.

**Do not size a cut by its line count.** The rule above carries the real
constraint and a line budget is only its shadow, lying in both directions — 229
lines of implementation under 462 lines of test reads as three times over any
budget until someone splits the number, and a budget re-derived before it can be
obeyed is worse than none. A cut that is too big holds two verifiable changes,
and that is visible without counting.

**Unknowns get their own ticket.** When part of the parent is a question nobody
has answered ("what should a modular greenfield scaffold create?"), that is a
`design:` ticket whose Done-when is a decision, not code. Do not bury an open
question inside an implementation ticket — it will be resolved by whoever picks
it up, silently, at 2am.

### Title

Conventional prefix, lowercase, imperative, no ticket-speak:

`feat:` `fix:` `docs:` `test:` `refactor:` `perf:` `design:` — and `!` after
the prefix when the change breaks a published contract (`refactor!:`).

### Body

The shape below is what this repo's own sub-issues look like. Match it.

```markdown
Part of #<parent>. Depends on #a, **#b**, #c — <one line: what those give you
that this ticket's acceptance cannot be reached without>.

<Why this ticket exists, stated against its neighbours: what the adjacent
tickets do and do not cover, so the boundary is explicit. "#185 gives it a
glob; #183 shifts the depth. Neither owns the flow rules, and a glob without
a rule only means the files get counted.">

## <The rules / What changes>

- <each rule, one line, concrete>

## Cases to pin

<a code block of input → expected verdict, exhaustive for the boundary this
ticket draws. These are the tests the implementation side will write.>

## Done when

<One sentence. An observable end state, not a checklist. "A module whose root
imports a layer unit correctly stays green while every upward or
past-the-entry edge is red.">
```

Bold the dependency that is actually load-bearing. Acceptance is written as
something a command shows you — a rule that fires, a verdict that flips, a
fixture that goes red — never as "implemented correctly".

Facts you assert, the implementation side has to live with. Where you are
inferring rather than reading the parent, say so in the ticket.

## Phase 3 — order

Build the dependency graph over the cuts, then flatten it into tiers: a tier is
the set of tickets whose dependencies are all satisfied by earlier tiers, so
everything inside one tier can run in parallel.

Ordering principles, in force when the graph leaves you a choice:

- **Schema and types before their readers.** A field nobody can declare cannot
  be consumed.
- **Readers before emitters.** Resolve the value, then let something print it.
- **Vocabulary changes early.** A rename that reaches the finding ids or the
  message ids gets more expensive with every ticket that lands on the old name.
- **Docs, conformance fixtures, and site alignment last.** They describe what
  exists; run them before the behaviour lands and they describe fiction.
- **Measurement can float**, unless a later decision depends on the number.

Publish the tiers as a **comment on the parent** — a mermaid graph plus the tier
list. Not in the parent's body. The comment is the plan of record; when the
order changes, comment again saying what moved and why, rather than editing the
old comment into a lie.

Then make the order real on GitHub, so the parent's sub-issue list reads top to
bottom in execution order:

```bash
gh api --method PATCH repos/:owner/:repo/issues/<parent>/sub_issues/priority \
  -F sub_issue_id=<db-id> -F after_id=<db-id>
```

## Phase 4 — create

GitHub's native sub-issue API — no `gh` extension needed. `sub_issue_id` is the
issue's **database id**, not its number; passing the number silently attaches
the wrong issue or none.

```bash
# body first, in the scratchpad — never in the repo
url=$(gh issue create --title "feat: …" --body-file "$SCRATCH/ticket.md")
num=${url##*/}
id=$(gh api repos/:owner/:repo/issues/$num --jq .id)
gh api --method POST repos/:owner/:repo/issues/<parent>/sub_issues -F sub_issue_id=$id
```

Create in tier order so the numbers read in roughly the order they are worked,
and so `Depends on #…` headers can reference real numbers — a ticket in tier 2
is created after the tier-1 tickets it names. When a forward reference is
unavoidable, create the ticket, then edit the header once the number exists.

Label from the existing set only (`gh label list`). Do not invent labels.

## Phase 5 — run the tier

The owner names a parent and a tier. That is the whole input — everything below
is standing procedure, so do not ask for it and do not wait to be told it again.

### One implementation session per ticket, not one per tier

Spawn a fresh session for each ticket with the Agent tool. It writes code and you
do not, so it inherits none of this skill's boundary. Hand it the parent number,
**the one ticket it is working**, and the instruction to read `CLAUDE.md` plus
every `.claude/docs/` page whose trigger fires. Hand over the ticket *number*,
not your summary of it — a summary is a second source of truth for something you
already wrote, and the two will differ.

**A session held across a whole tier is the shape to avoid.** One died mid-tier
here holding everything it had learned, because a transcript is not a place
anything survives.

**Anything worth carrying between tickets is worth writing down, and anything not
worth writing down was not worth carrying.** A long session is a way of never
making that decision. Each kind has a home that outlives any session:

- a habit or a stance → `.claude/docs/`, or `CLAUDE.md` when it applies to every edit
- a repo-specific trap → `CLAUDE.md`, beside the tooling it bites
- something true of one ticket only → that ticket's body

Written there, the next session gets it by reading, which is the ordinary way.

**Your own session is the exception by construction.** Everything the ticket
layer knows is already on GitHub, so a dead PM session restarts by reading it
back — which is what makes "comment on every ticket, including the clean ones"
the durable half of this role's memory rather than bookkeeping.

**So recover from the record, never from recollection.** After any interruption,
rebuild state in this order and stop there: the parent's sub-issue list and its
comments, `git log origin/main`, open PRs and their checks, the workflow runs. A
transcript describes a moment that has passed, and the gap can be one merge
wide.

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

### Ask for the plan before the code

The implementation side plans first, and that plan comes to you before anything
is written. Read it against the tickets, and answer three questions in the reply:

- **Does the plan reach each ticket's `Done when`?** Not "is it reasonable" —
  reasonable plans miss acceptance criteria all the time.
- **Does it stay inside the tier?** Work that belongs to a later ticket, done
  early because it was convenient, silently empties that ticket.
- **Where does it contradict a ticket?** That is a Phase 7 report arriving before
  the cost, and it is usually the ticket that is wrong, not the plan.

### The per-ticket loop

One ticket, one PR. How many commits it takes is the implementation side's call
and never yours. It merges its own PR without waiting on you.

**But nothing starts until you send.** The implementation side stops after every
report and waits, on every ticket. A report ending *"next is #223"* states an
intention and will sit there. You are the only actor who can begin the next one,
so a tier stalls in the one way that is hard to notice: no error, nothing to
answer, just a silence that reads exactly like work in progress.

**One worktree per ticket — `git worktree add` plus `npm ci` in it — and read
your baselines through `git show <ref>:<path>` rather than off disk.** Two
sessions over one checkout is not a tidiness problem: a moved `HEAD` has put
commits on the wrong branch, produced an empty remote branch from a push that
looked fine, and sent a sweep against a tree nobody meant to measure. The
pre-push hook makes it mutual, since it tests the whole working tree — and
`--no-verify` is not the way out of that.

**The install is the half that looks skippable and is not.** `prepare` generates
husky's runtime and a fresh checkout carries only the two tracked hook scripts,
so a tree without it runs no hooks and reports nothing. Symlinking `node_modules`
to save the install buys that silence and shares one incremental `tsc` cache
across every tree.

**A `Done when` starts unmet, and only evidence moves it.** Not "does anything
look wrong" — "what did I run, and what did it show". Absence of a problem is not
the evidence; a command whose output you read is. Two tickets closed this way with
a clause false: one whose acceptance named two gates while only the easier one was
read, one whose loss lines were never rendered at all. Neither looked wrong.

**And distinguish what you checked from what you did not.** An item you cannot
point at is *"no evidence found"*, never *"not done"* — those are different
claims and only one of them is yours. A reader has to be able to tell a checked
item from an unchecked one, and a flat verdict erases that difference in the
direction that flatters you.

**Your check is an audit, not a gate**, and that changes the remedy. You read
the merged result against the ticket's `Done when`; when it falls short, the exit
is a reopened ticket or a follow-up filed — never a blocked merge, which no
longer exists to block. Then comment the outcome on the issue: what landed, what
you verified it against, and anything it did beyond what the ticket asked.

**There is a third exit, and it is often the right one:** fold the gap into an
adjacent open ticket — but only when that ticket is already building the thing
the gap belongs inside. A missing ban group whose entry does not exist yet
belongs to whoever is creating that entry; reopening the closed ticket to add one
group to someone else's new work is process for its own sake. When you fold, say
so on the parent, so the closed ticket is not read as more complete than it was.

**When a `Done when` names two machines, read both.** Acceptance written as "the
alias and relative spellings reach the same verdict" spans `inspect` and lint,
and checking the half that is easier to read is how a ticket closes with the
other half false — which then surfaces two tickets later, inside someone else's
scope. Nothing about the passing half hints that its twin was never run.

Comment on **every** ticket, including the ones that came back clean. A ticket
closed in silence is indistinguishable from a ticket nobody checked, and six
months later that is the only difference anyone needs.

**Report what you verified, never what somebody said they would do.** *"It is on
#223"* and *"its last report ended with «next is #223»"* are different claims and
only the second is yours. An owner who believes the first waits for a PR nobody
is writing, and the longer they wait the more reasonable the wait looks.

### While it runs

The counter is one cheap call:

```bash
gh api repos/:owner/:repo/issues/<parent> --jq .sub_issues_summary   # completed / total / percent
gh api repos/:owner/:repo/issues/<parent>/sub_issues \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'
```

That answers *how many*. It does not answer whether any of them is true, and
only one of those two is worth an owner's attention.

**So read the code, and read it often.** This is the whole value the role has to
offer: a second reader who did not write the change, owes its reasoning nothing,
and is not tired of it. The implementation side already believes its own work —
that belief is not evidence, and asking it to double-check itself returns the
same answer twice. A `Done when` is a claim about the repo, so check it against
the repo. The closing PR is where to start, not where to stop: what it changed
is visible in the diff, and what it *left* is only visible in the file.

Report as: what is done, what is in flight, what is unblocked and next, what is
blocked and on which ticket. If a tier is fully closed, say the tier closed —
that is the unit the owner cares about, and it is also the trigger for Phase 6.

When a sub-issue closes, check its `Done when` actually happened before counting
it. A closing PR that did half the ticket is a ticket to reopen or a follow-up to
file, not a silent pass. A PR that did *more* than the ticket asked is worth the
same sentence in the other direction — it means the ticket understated the work,
and the next ticket cut from the same reading will understate it too.

### A tier is not closed when its last PR merges

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

## Phase 6 — re-verify the unstarted tickets at every tier boundary

A ticket is written against the repo as it stood the day it was cut, and every
tier that lands moves that repo. So a closed tier is not only a milestone to
report — it is the trigger to re-read every open ticket below it, before anyone
picks one up.

**This is the sweep nobody asks you for.** Phase 7 waits to be told; a stale
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

- **Render what the tier emits, and read the output.** Not the code that produces
  it — the artifact an adopter receives: `emitLint` against a fixture in the shape
  the tier just enabled, `blueprint rules`, the playbook, the handbook.

  **Reading code tells you whether the logic is right. Reading output tells you
  whether it touches anything**, and the two feel identical while you do them. A
  ban built from the wrong segment is correct code, passes its unit test, raises
  coverage, and matches no file in the repo it governs. Every defect of that shape
  found here came from rendering; none was reachable by reading source.

The three checks above go back into the ticket bodies they belong to; the two
questions produce findings, which become tickets or comments in the ordinary way.
Either is exit 1 of the gap loop, reached before the gap cost anything.

Report the sweep as one list: what moved, what turned out half-done, what came
back clean. **A ticket you checked and found still true is a result** — say so by
name, or the next sweep pays to learn it again.

## Phase 7 — the gap loop

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
   claim-coverage check lie — Phase 8 reads an unattached ticket as out of scope,
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

## Phase 8 — does the sum reach the parent?

Run this twice: once after the cut, before anyone starts, and once before the
parent closes.

Take the claim list from Phase 1 and map each claim to the ticket that makes it
true. Post it on the parent as a comment: one bold claim per entry, with its
ticket and state on the lines beneath. Not a markdown table — an issue comment
is read on a phone as often as not, and three columns wrap there into something
nobody can follow. Then:

- **A claim with no ticket** is a missing cut. File it.
- **A claim covered "partly"** is a claim you have not actually mapped. Split it
  into the parts and map each.
- **A ticket serving no claim** is one of two things, and calling it the wrong
  one wastes the owner's answer. Either it is **scope you added** — say so and ask
  whether it stays — or it is **a defect this work exposed**, which is what a tier
  spent refining mostly produces: the parent asked for a capability, building it
  meant using the tool, and using it surfaced something already broken. Those are
  not scope creep and must not be pruned as though they were. Say which, and for
  a defect say whether it predates the parent, because that decides whether it is
  a sub-issue at all (Phase 7, exit 2).

The parent closes when every claim maps to a closed ticket. Not when the
sub-issue counter hits 100% — the counter proves the tickets closed, not that
they covered the parent.

### Before it closes, someone who was not here checks it

You cut these tickets and you verified them, which makes you the worst available
reader of whether they hold — and a second session that has been in the
decomposition with you is the second-worst. **Two readers are not two checks; they
converge on the same resemblance.**

So before the parent closes, spawn agents that were not part of this and cannot
write:

- **Fresh context, latest `main`, read-only.** A reader that can edit starts
  explaining instead of reporting.
- **One agent per dimension**, split by the kind of claim — emitted artifacts
  against the documents describing them, the parent's claims against the code,
  acceptance against what a command shows. A single reviewer given everything
  returns the shape of its own attention.
- **Every finding comes back, with a file, a line and the commit.** Not a ranked
  top-N: the finding dropped because two others outrank it is the one the next
  reader rediscovers. Without an address it is an opinion.
- **Findings are unverified reports until you reopen the file.** One that does not
  hold is dropped *and said to be dropped*.

### Then decide what the process keeps

A retrospective that only adds rules produces a document nobody reads, and every
rule in it becomes decoration. So the pass that adds also **merges and deletes**,
measured rather than sensed — this skill nearly doubled in a day, and the section
that grew most was not the one that mattered most.

**What goes and what stays has a test.** A rule keeps its statement and its
reason: a rule without a reason gets shortcut, which is why the reasons are here
at all. What it does not keep is the incident that produced it — that belongs in
the commit that added the rule, by this repo's own policy that history goes to
the commit. A skill carrying its own changelog is a skill nobody finishes.

Three questions, and the last is the one that gets skipped:

- **Which assumption did this parent overturn?** Something in it was wrong when
  written; name it, or the next decomposition inherits it.
- **Which gap should have been caught earlier, and by what?** The answer is
  sometimes "nothing available would have", which is worth writing down too.
- **Which rules here are now duplicated, superseded, or unread?** A rule restated
  in a doc that owns it is two sources of truth for one requirement. Cut the copy,
  keep the pointer.

## Repo facts

- Verification vocabulary for a `Done when`: `npm run lint`, `tsc`, `npm test`
  (100% coverage is the floor), `npm run build`, `npm run dist:verify`,
  `npm run field:run`, and `node dist/bin.js init|inspect` for runtime changes.
  `.claude/docs/verification-layers.md` says which layer catches what — cite the
  right one instead of asking for "tests".
- Every user-visible change ships a changeset. Mention it in the ticket only
  when the wording matters (a breaking rename, a migration line).
- Conventions the tickets must not contradict: `CLAUDE.md` (module shape,
  layering, self-explaining output, comment policy) and `.claude/docs/`.
- Issue bodies, titles, and comments are written in English.
