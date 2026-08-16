# Starting or resuming a ticket

**Trigger:** the skill loads. Every time — a fresh "do #204" and a resumed session both read this before anything else happens, because from inside the session there is no way to tell which one this is without doing the reading first.

## Read before you decide anything

**The issue body and every comment, in full** — not the latest comment, not a summary of the ticket someone gave you in the prompt. The comment stream is deliver-ticket's own record of every stage that landed, every shortfall opened and closed, and every reason a decision went the way it did. Skipping to the bottom loses the shortfalls that have no address anywhere else.

**Search for what already exists, before assuming there's nothing.** A branch or worktree carrying the ticket number, an open PR against it, commits whose messages reference it: `git worktree list`, `git branch --list '*<n>*'`, `gh pr list --search "<n> in:body"` or by title. This repo names branches and commits after what they make true rather than after the ticket number (`CLAUDE.md`'s own convention), so a plain number search is the reliable one — a name search will miss work that's actually there.

## Reconstruct the state; don't assume it

Cross-reference what the comments claim against what the branch actually contains. **A comment saying a stage landed and a commit that actually landed are two different kinds of evidence** — `SKILL.md`'s own *How you verify* applies to this ticket's history exactly as it applies to a sub-agent's claim, and "the last comment said done" is the implementer's kind of evidence, not yours until you've checked it. `git log <branch> --oneline` against the SHAs the comments cite is the check.

From that comparison, build the same list `finish-the-ticket.md`'s completion test needs at the end — build it now, at the start, instead:

- **Which stages have actually landed**, each checked against its comment rather than assumed from it.
- **Which shortfalls are still open** — every one the comment stream ever named and never later said was closed.
- **A pushed commit with no comment naming it is not a stage to redo — it's a comment owed.** `deliver-a-stage.md`'s ordering is verify → commit → push → comment; a resumed session is exactly where a run that died between push and comment turns up. Post the missing comment, from that commit's own diff, before treating anything else as the next stage.
- **Which commit is `HEAD` of the existing branch**, and how far behind `origin/main` it is.

**A stage the comments describe as landed is not redone.** Re-running a finished stage through a fresh sub-agent produces a second attempt at something already true, and the two rarely agree on the seam — that's how a resumed ticket ends up with a commit undoing part of an earlier one for no reason a later reader can find.

## New work gets a new environment; resumed work reuses the one that exists

**One worktree per ticket**, per `SKILL.md`'s Repo facts — but *per ticket*, not per session. If the search above found an existing worktree or branch for this ticket, that is the one to continue in, not a second `git worktree add` beside it. Two worktrees for one ticket is exactly the failure the Repo facts note already names: commits landing on the wrong one because two sessions each believed they owned the checkout.

If nothing exists yet, this is a genuine start: create the branch and the worktree, `npm ci` inside it, and record where it branched from — the `main` commit — the same way the first stage comment will need to.

## The ticket has to already be a ticket, not a direction

**Confirm the issue clears the bar `shape-ticket` sets, before writing a line of code:** a goal with no open product decision left in it, an implementation plan grounded in the repo as it stands, acceptance criteria that name a command or an artifact rather than "works correctly." If it doesn't — if what's in front of you reads closer to a direction than a decided shape — **that gap is not deliver-ticket's to fill.** Comment saying so, name which of the three (goal, plan, acceptance) is underspecified and why, and stop.

Inventing the missing product decision yourself is the same failure `deliver-a-stage.md`'s shortfall discipline exists to prevent, arriving earlier: a decision made silently at implementation time is still a decision nobody who owns the product got to make, and it doesn't stop being that just because it happened before the first commit instead of during one.
