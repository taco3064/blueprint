# Delivering a stage

**Trigger:** you are about to commit, or you have just committed and owe the ticket a comment.

## What a stage is

**A slice of the ticket that stands on its own: the repo is green and releasable when it lands, whether or not any later stage ever does.** Not a checkpoint of convenience, not "I stopped here because it was late".

If a slice can only be verified together with the next one, it is not a stage — it is half of one, and committing it splits a single verifiable change into two comments that each prove nothing.

Cut stages by **what becomes true**, not by which files you happened to open. *"The schema accepts the new field and rejects three ways to get it wrong"* is a stage; *"edited `defineBlueprint.ts`"* is not.

**A ticket that only makes sense as one commit is one stage.** Do not manufacture stages to have something to report — a single commit with a single honest comment is a complete delivery.

## Dispatching it

**A fresh sub-agent per stage**, given the ticket number, the one stage it is working, and the instruction to read `CLAUDE.md` and every `.claude/docs/` page whose trigger fires.

Tell it what the stage is in terms of **what must become true**, and tell it the boundary in the same breath — what this stage does *not* cover, and that anything it notices outside the stage is reported rather than fixed. An implementer given a goal and no edge will find the edge by crossing it.

**Ask it for what you need to write the comment**, since it has it and you do not: the commands it ran and their output, which of its claims it measured and which it reasoned, and anything it noticed and did not act on.

## Before you commit

**Verify what came back rather than accepting it.** *"Done, tests pass"* is the implementer reporting confidence; it is not evidence and it is not yours until you have run it. Re-run the layer that matters, read the artifact if the stage touched one, and read the diff — **not for style, for scope**: a change wider than the stage is the most common thing a dispatch returns, and it is invisible in a summary.

If what came back is wrong or incomplete, **that is not a shortfall** — a shortfall is something true about the repo. It is an unfinished stage: dispatch again with what was missing, and do not commit in between.

- **Run the layer that could catch this**, not the cheapest one. `.claude/docs/verification-layers.md` says which is which. A unit test proves the logic; it does not prove the emitted artifact says anything.
- **If the change touches emitted prose, render it.** Enumerate the conditional branches from the code first, render one file per combination, and read them. An empty diff from a branch you never rendered looks exactly like an empty diff from a branch that did not change.
- **Never bypass the commit gate.** Not `--no-verify`, not `-n`, not `HUSKY=0`. If it stops you, the thing it stopped is the thing to fix.

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
