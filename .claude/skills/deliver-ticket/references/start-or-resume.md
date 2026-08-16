# Starting or resuming a ticket

**Trigger:** the skill loads. Every time — a fresh "do #204" and a resumed session both read this before anything else happens, because from inside the session there is no way to tell which one this is without doing the reading first.

## Read before you decide anything

**The issue body and every comment, in full** — not the latest comment, not a summary of the ticket someone gave you in the prompt. The comment stream is deliver-ticket's own record of every stage that landed, every shortfall opened and closed, and every reason a decision went the way it did. Skipping to the bottom loses the shortfalls that have no address anywhere else.

**Search for what already exists, before assuming there's nothing.** `git worktree list` and `git branch --list 'ticket/<n>-*'` find deliver-ticket's own worktrees and branches — they always carry the ticket number, per the naming rule in *New work gets a new environment* below, even though this repo's other feature branches read by outcome instead (`CLAUDE.md`'s convention for everything that isn't this skill's own bookkeeping). `gh pr list --search "<n> in:body"`, or by title, and a commit-message grep for the number cover the case where the branch predates this convention or was made by hand outside this skill.

## Reconstruct the state; don't assume it

Cross-reference what the comments claim against what the branch actually contains. **A comment saying a stage landed and a commit that actually landed are two different kinds of evidence** — `SKILL.md`'s own *How you verify* applies to this ticket's history exactly as it applies to a sub-agent's claim, and "the last comment said done" is the implementer's kind of evidence, not yours until you've checked it. `git log <branch> --oneline` against the SHAs the comments cite is the check.

From that comparison, build the same list `finish-the-ticket.md`'s completion test needs at the end — build it now, at the start, instead:

- **Which stages have actually landed**, each checked against its comment rather than assumed from it.
- **Which shortfalls are still open** — every one the comment stream ever named and never later said was closed.
- **A pushed commit with no comment naming it is not a stage to redo — it's a comment owed.** `deliver-a-stage.md`'s ordering is verify → commit → push → comment; a resumed session is exactly where a run that died between push and comment turns up. Post the missing comment, from that commit's own diff, before treating anything else as the next stage.
- **Which commit is `HEAD` of the existing branch**, and how far behind `origin/main` it is — being behind is not, by itself, something to fix mid-ticket; see *New work gets a new environment* for what is and isn't allowed about it.

**A stage the comments describe as landed is not redone.** Re-running a finished stage through a fresh sub-agent produces a second attempt at something already true, and the two rarely agree on the seam — that's how a resumed ticket ends up with a commit undoing part of an earlier one for no reason a later reader can find.

## New work gets a new environment; resumed work reuses the one that exists

**One worktree per ticket**, per `SKILL.md`'s Repo facts — but *per ticket*, not per session. If the search above found an existing worktree or branch for this ticket, that is the one to continue in, not a second `git worktree add` beside it. Two worktrees for one ticket is exactly the failure the Repo facts note already names: commits landing on the wrong one because two sessions each believed they owned the checkout.

If nothing exists yet, this is a genuine start: branch from the current `origin/main` tip — not from whatever the session's own working directory happens to be on — create the worktree, `npm ci` inside it, and record where it branched from the same way the first stage comment will need to.

**Name both the branch and the worktree directory with the ticket number**: `ticket/<n>-<slug>`. This repo's other branches read by outcome instead, but that's exactly what defeats a resume here — an outcome-named branch says nothing about which ticket it belongs to until a commit or comment references the number, and a session interrupted before either exists leaves nothing to search for. The number in the name is what *Search for what already exists* above depends on.

**Being behind `origin/main` mid-ticket is a judgment call, not a mandate to fix** — `deliver-a-stage.md`'s stage-order rule already covers the one case where updating is forced (a commit gate failing on work belonging to a stage not yet started). **What's never allowed is rewriting or force-pushing a commit that's already been pushed and cited in a comment.** `deliver-a-stage.md`'s push-before-comment rule exists to make that SHA a stable, public reference; rewriting history out from under a comment that already named it breaks the one guarantee that rule was for.

## The ticket has to already be a ticket, not a direction

**Confirm the issue clears the bar `shape-ticket` sets, before writing a line of code:** a goal with no open product decision left in it, an implementation plan grounded in the repo as it stands, acceptance criteria that name a command or an artifact rather than "works correctly." If it doesn't — if what's in front of you reads closer to a direction than a decided shape — **that gap is not deliver-ticket's to fill.** Comment saying so, name which of the three (goal, plan, acceptance) is underspecified and why, and stop.

Inventing the missing product decision yourself is the same failure `deliver-a-stage.md`'s shortfall discipline exists to prevent, arriving earlier: a decision made silently at implementation time is still a decision nobody who owns the product got to make, and it doesn't stop being that just because it happened before the first commit instead of during one.

**Name the recovery path in that same comment — it isn't obvious from either skill alone.** `shape-ticket` never edits an existing issue: its only output is a new one, and it only supersedes a *closed* issue, never one it finds still open (that's a stop condition on its own side too — see its *And if a matching issue already exists* rule). So the path back is: the owner resolves the missing decision, **closes this issue** naming why, and re-runs `shape-ticket` on the direction — which then investigates afresh and files a new issue superseding this one via *Related work*, the ordinary way any superseded issue is handled. Deliver-ticket is then invoked again, on the new number. Leaving this unsaid makes both skills individually consistent and jointly a dead end; say it so the owner doesn't have to reconstruct it.
