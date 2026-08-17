# Delivering a stage

**Trigger:** you are about to dispatch a sub-agent, about to commit, or you have just committed and owe the ticket a comment.

## What a stage is

**A slice of the ticket that stands on its own: the repo is green and releasable when it lands, whether or not any later stage ever does.** Not a checkpoint of convenience, not "I stopped here because it was late".

**Green is not the same as honest.** A stage can leave every gate passing and still misrepresent the state — a debt ledger carrying rows you already know a later stage removes, a suppression standing in for work simply not done yet. That is still a legitimate stage, and the comment is where the distinction has to live: which rows are debt, and which are only recorded until the commit that closes them. The gate cannot carry that difference and the ledger file has nowhere to put it.

If a slice can only be verified together with the next one, it is not a stage — it is half of one, and committing it splits a single verifiable change into two comments that each prove nothing.

Cut stages by **what becomes true**, not by which files you happened to open. *"The schema accepts the new field and rejects three ways to get it wrong"* is a stage; *"edited `defineBlueprint.ts`"* is not.

**A ticket that only makes sense as one commit is one stage.** Do not manufacture stages to have something to report — a single commit with a single honest comment is a complete delivery.

## Dispatching it

**A fresh sub-agent per stage, given the ticket number and a reading scope — not a summary written in its place.** The issue stays the single source of truth; the main agent says which parts of it and the repo matter for this stage, it does not re-narrate them. Hand over:

- The issue's `## Goal`.
- The one stage it's building, and that stage's own acceptance criteria.
- Whatever the plan states must not change (the global invariants).
- Shape-ticket's cited references — the module, the primitives, the consumers, the docs pages named as required reading.
- The commits of stages already landed, so it builds on top of real code rather than re-deriving it.
- Any shortfall still open that affects this stage.
- The instruction to read `CLAUDE.md` and every `.claude/docs/` page whose trigger fires for this change.

**What it doesn't need**: shape-ticket's discussion history, the full text of options the discussion rejected, every closed shortfall's full history, other stages' implementation detail, or any prior agent's reasoning. None of that changes what this stage has to make true, and carrying it anyway is exactly the cost this scope exists to cut.

Tell it what the stage is in terms of **what must become true**, and tell it the boundary in the same breath — what this stage does *not* cover, and that anything it notices outside the stage is reported rather than fixed. An implementer given a goal and no edge will find the edge by crossing it.

**Ask it for what you need to write the comment**, since it has it and you do not: the commands it ran and their output, which of its claims it measured and which it reasoned, and anything it noticed and did not act on.

## Before you commit

**Verify what came back rather than accepting it.** *"Done, tests pass"* is the implementer reporting confidence; it is not evidence and it is not yours until you have run it. Re-run the layer that matters, read the artifact if the stage touched one, and read the diff — **not for style, for scope**: a change wider than the stage is the most common thing a dispatch returns, and it is invisible in a summary.

**When the diff is too large to read, say which instrument read it instead.** A mechanical sweep across sixty files is not something you walk line by line, and reporting it as reviewed when you ran gates over it is the exact failure this page is about. Name what actually carried the check — the suite, a byte baseline, a rendered artifact — and dispatch a reader for what those cannot see. An unread diff with its instrument stated is honest; an unread diff called verified is not.

If what came back is wrong or incomplete, **that is not a shortfall** — a shortfall is something true about the repo. It is an unfinished stage: dispatch again with what was missing, and do not commit in between.

- **Run the layer that could catch this**, not the cheapest one. `.claude/docs/verification-layers.md` says which is which. A unit test proves the logic; it does not prove the emitted artifact says anything.
- **If the change touches emitted prose, render it.** Enumerate the conditional branches from the code first, render one file per combination, and read them. An empty diff from a branch you never rendered looks exactly like an empty diff from a branch that did not change.
- **Never bypass the commit gate.** Not `--no-verify`, not `-n`, not `HUSKY=0`. If it stops you, the thing it stopped is the thing to fix.
- **And a gate that stops you may be saying your stage *order* is wrong, not your stage.** A hook that autofixes on the way in can produce violations no ledger holds, so the first commit touching a governed file fails on work belonging to a stage you have not run yet. Park the finished stage as a patch, land the one the gate named, re-apply. That is the gate working, and the order it forces is usually the honest one.

## Push before the comment, always

The order is **verify → commit → push → comment**, every stage, no exceptions. A comment citing a SHA that only exists in the local worktree is citing something a reader clicking through cannot open — and on a delivery that can run for hours, local-only is one crashed session away from being the only copy that ever existed.

**If the push fails, the stage has not landed.** Do not post the comment claiming it has. Resolve why it failed — a moved remote branch is the likely cause — and push before writing anything.

**If the push succeeds but posting the comment fails, do not start the next stage.** Re-post the comment for the commit that is already public first. A resumed session finds this exact state by diffing `git log <branch>` against `git log origin/<branch>` and against what the comment stream actually names — see `start-or-resume.md`. A pushed commit with no comment naming it is not a new stage to build; it's a comment owed on one already built.

## The comment, one per commit

Post it as the commit lands, not in a batch at the end. It carries four things and the last one is the one that gets skipped:

**1. What landed, and the commit.** The short SHA and one line on what is now true that was not. Not a file list — the file list is in the diff.

**2. What you ran, and what it showed.** The command and its result. `2134 tests green` is evidence; *"tests pass"* is a claim about evidence. Where you rendered an artifact to check it, say which artifact and quote the line that settled it.

**3. Which claims are measured and which are reasoned.** Mark them. A mechanism you inferred from reading is worth writing down and is not the same as one you executed, and only the label tells a later reader which ones are still owed a run.

**4. Shortfalls.** Everything you noticed and did not close in this commit, each with an address — file and line, or the command and the output. **Repeat the ones still open from earlier comments.** A shortfall named once and never mentioned again is indistinguishable from a shortfall that was fixed.

State explicitly when there are none: *"No shortfalls open."* Silence reads as "nobody looked".

## Writing a shortfall

**Name the thing that is wrong, its address, and whether it is inside this ticket.**

- **Inside** — you close it, in a later commit on this ticket. Say what you intend to do, or say you do not know yet.
- **Outside** — it predates the ticket, or it changes what the tool asserts, or it would be needed even if this ticket had never existed. **Say that it is outside, name it fully enough to act on, and stop.** Do not open a ticket. Do not fix it either; a fix the ticket did not ask for is invisible to whoever reads the diff expecting only what was asked.

**The test for "outside" is not how big it is.** A one-line fix to something that predates the ticket is outside; a two-day rewrite the ticket's own goal requires is inside.

**Uncertain? Write it as a shortfall and say you are unsure which side it falls on.** The owner reads these. An unsure note costs a sentence; a wrong absorption costs a diff nobody can explain.

## Then the next commit

Take the open shortfalls first, unless a staged delivery blocks them. Each commit that closes one says so in its comment, naming which — so the list shrinks visibly rather than quietly.

**A shortfall you decide not to fix is not closed by deciding.** It stays open and named until the owner rules it out of scope, and the ticket does not finish while it stands.
