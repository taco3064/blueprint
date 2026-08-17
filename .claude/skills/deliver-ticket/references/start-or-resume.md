# Starting or resuming a ticket

**Trigger:** the skill loads. Every time — a fresh "do #204" and a resumed session both read this before anything else happens, because from inside the session there is no way to tell which one this is without doing the reading first.

## Read before you decide anything

**The issue body and every comment, in full** — not the latest comment, not a summary of the ticket someone gave you in the prompt. The comment stream is deliver-ticket's own record of every stage that landed, every shortfall opened and closed, and every reason a decision went the way it did. Skipping to the bottom loses the shortfalls that have no address anywhere else.

**`git fetch origin --prune` first — every time, before searching or branching.** A stale `origin/main` and a stale set of remote-tracking refs both look identical to "nothing's there" from inside a session that hasn't talked to the remote yet, and that's indistinguishable from an actual fresh start until you've fetched.

**Then search for what already exists, before assuming there's nothing.** `git worktree list`, `git branch --list 'ticket/<n>-*'`, **and `git branch -r --list 'origin/ticket/<n>-*'`** — the remote-tracking search matters because a worktree from an earlier session may have been cleaned up locally while its branch is still live on the remote, and only the fetch above makes that branch visible at all. These find deliver-ticket's own worktrees and branches — they always carry the ticket number, per the naming rule in *New work gets a new environment* below, even though this repo's other feature branches read by outcome instead (`CLAUDE.md`'s convention for everything that isn't this skill's own bookkeeping). `gh pr list --search "<n> in:body"`, or by title, and a commit-message grep for the number cover the case where the branch predates this convention or was made by hand outside this skill.

## Reconstruct the state; don't assume it

Cross-reference what the comments claim against what the branch actually contains. **A comment saying a stage landed and a commit that actually landed are two different kinds of evidence** — `SKILL.md`'s own *How you verify* applies to this ticket's history exactly as it applies to a sub-agent's claim, and "the last comment said done" is the implementer's kind of evidence, not yours until you've checked it. `git log <branch> --oneline` against the SHAs the comments cite is the check.

From that comparison, build the same list `finish-the-ticket.md`'s completion test needs at the end — build it now, at the start, instead:

- **Which stages have actually landed**, each checked against its comment rather than assumed from it.
- **Which shortfalls are still open** — every one the comment stream ever named and never later said was closed.
- **A pushed commit with no comment naming it is not a stage to redo — it's a comment owed.** `deliver-a-stage.md`'s ordering is verify → commit → push → comment; a resumed session is exactly where a run that died between push and comment turns up. Post the missing comment, from that commit's own diff, before treating anything else as the next stage.
- **Which commit is `HEAD` of the existing branch**, and how far behind `origin/main` it is — being behind is not, by itself, something to fix mid-ticket; see *New work gets a new environment* for what is and isn't allowed about it.

**A stage the comments describe as landed is not redone.** Re-running a finished stage through a fresh sub-agent produces a second attempt at something already true, and the two rarely agree on the seam — that's how a resumed ticket ends up with a commit undoing part of an earlier one for no reason a later reader can find.

## New work gets a new environment; resumed work reuses the one that exists

**One worktree per ticket**, per `SKILL.md`'s Repo facts — but *per ticket*, not per session. If the search above found an existing **local** worktree or branch for this ticket, that is the one to continue in, not a second `git worktree add` beside it. Two worktrees for one ticket is exactly the failure the Repo facts note already names: commits landing on the wrong one because two sessions each believed they owned the checkout.

**A branch that only turned up on the remote — `origin/ticket/<n>-*` with no local counterpart — is a resume, not a fresh start, and the recovery is to rebuild the local half from it, not from `origin/main`.** This is what the remote-tracking search above exists to catch: a worktree from an earlier session got cleaned up (or was never on this machine) while its branch, and every commit already pushed and cited in a comment, is still live on the remote. `git worktree add <path> -b ticket/<n>-<slug> origin/ticket/<n>-<slug>` creates the local worktree and branch **from that existing history** — branching it from `origin/main` instead would silently discard every commit the ticket already has, which is indistinguishable from data loss to whoever reads the comment stream afterward and finds the branch doesn't contain what it says it does. Once rebuilt this way, proceed exactly as *Reconstruct the state* above.

If nothing exists anywhere — no local worktree or branch, no matching remote branch either — this is a genuine start, and *The ticket has to already be a ticket, not a direction* below has to pass **before** any of the following: branch from the `origin/main` tip the fetch above just resolved — not from whatever the session's own working directory happens to be on, and not from a local `origin/main` that predates that fetch — create the worktree, `npm ci` inside it, and record where it branched from the same way the first stage comment will need to.

**Name both the branch and the worktree directory with the ticket number**: `ticket/<n>-<slug>`. This repo's other branches read by outcome instead, but that's exactly what defeats a resume here — an outcome-named branch says nothing about which ticket it belongs to until a commit or comment references the number, and a session interrupted before either exists leaves nothing to search for. The number in the name is what *Search for what already exists* above depends on.

**Being behind `origin/main` mid-ticket is a judgment call, not a mandate to fix** — `deliver-a-stage.md`'s stage-order rule already covers the one case where updating is forced (a commit gate failing on work belonging to a stage not yet started).

**Before any stage has landed — no commit pushed and cited in a comment yet — rebasing onto `origin/main` is fine.** There is nothing yet a rewrite could invalidate.

**Once one has, only `git merge origin/main` is allowed, for the rest of the ticket's life. Never rebase, and never force-push, either window.** A rebase replays every commit unique to the branch, not just the new ones being caught up — so it rewrites the SHA a comment already cited even when the only intent was to move the branch's own base forward, and there is no way to rebase selectively enough to avoid that once a cited commit exists. `deliver-a-stage.md`'s push-before-comment rule exists to make that SHA a stable, public reference; a merge commit brings `origin/main` in without touching it, which is why merge is always the safe operation and rebase, past this point, never is.

## The ticket has to already be a ticket, not a direction

**This is a hard gate, checked on every load — fresh start or resume, every time, with no exception inferred from a commit already existing.** A pushed commit and a cited comment prove a stage landed; they do not prove a gate ever ran, since they look identical whether this ticket went through shape-ticket, predates that requirement, or was built by hand outside either skill entirely. Checking every time costs nothing extra, though: the issue body is already being read in full per *Read before you decide anything*, so this is a scan of text already in hand, not a new investigation.

**Look for shape-ticket's fingerprint — two HTML comments, first thing in the body:**

```
<!-- blueprint-shape-ticket:v1 -->
<!-- grounded-at:<sha> -->
```

Three things have to hold, in order: the `v1` marker is present and is a version this file recognizes (currently only `v1` — a different version means shape-ticket's contract moved and this file is the one that's stale, not the ticket); `<sha>` is present and resolves to a real commit (`git cat-file -e <sha>^{commit}`, after the fetch above); and `## Goal`, `## Implementation Plan`, `## Acceptance Criteria` are all present with actual content beneath them, not just the heading. **The fingerprint checks that the shape-ticket process actually ran; the headings check that its output has the right shape — check both, because either alone is fakeable or accidental in a way the other isn't.** A hand-written issue can copy three heading names without ever having been shaped; a fingerprint with a corrupted or invented SHA fails the resolve check even if it looks right at a glance. This is a process check for a solo, non-adversarial pipeline, not a security proof — someone could still hand-copy the fingerprint itself onto a real SHA, and that's an accepted gap here, not one this gate is trying to close.

**If the fingerprint is missing or invalid, stop before any further commit — regardless of what *Reconstruct the state* found.** There is no exception this skill grants for continuing without one, and no "confirm to proceed anyway" this file offers. A ticket without a verifiable fingerprint is not one deliver-ticket builds, whether that would be the very first commit or the next one on a ticket that already has several.

- **Nothing landed yet** → stop before creating a branch or worktree. Comment: which part failed (no fingerprint, an unrecognized version, an unresolvable SHA, or a missing/empty heading), that deliver-ticket won't build against an issue that isn't verifiably shape-ticket's own, and the recovery path below. **If a stage-less worktree already exists from an earlier, also-rejected attempt at this same ticket, remove it** per `finish-the-ticket.md`'s *Cleaning up* — there's nothing on it worth keeping.
- **A stage already landed** → stop the same way. Comment that this ticket carries real work but no verifiable fingerprint, and that continuing it through this skill isn't something deliver-ticket does — from before this gate existed, from an older version of this skill, or from outside it entirely, the reason doesn't change the answer. **What happens to that work is the owner's decision, made outside this flow** — finishing it by hand, or closing the issue and letting a reshaped one account for what already exists — not a one-time exception this skill grants and then continues past. Naming the situation is this skill's job here; resolving it is not.

**If the fingerprint is present and valid, trust it — this is where the cost of re-deriving shape-ticket's own work actually gets cut, not before.** `<sha>` is the commit the plan is grounded on; `git diff <sha> origin/main` says what's moved since. `SKILL.md`'s *Before the first commit, read what the tool already promises* covers reading against that diff instead of an open-ended search — including the case where the diff shows a citation's premise gone rather than merely moved, which is its own stop-and-reshape path, not something to re-verify and carry on past — and *You dispatch the work; you do not type it* covers adopting the issue's own stages instead of re-cutting them.

**Name the recovery path in the rejection comment — it isn't obvious from either skill alone.** `shape-ticket` never edits an existing issue: its only output is a new one, and it only supersedes a *closed* issue, never one it finds still open (that's a stop condition on its own side too — see its *And if a matching issue already exists* rule). So the path back — for a missing fingerprint with nothing landed, or for a plan `SKILL.md`'s drift check finds invalidated — is the same: the owner closes this issue, naming why, and re-runs `shape-ticket` on the direction — which then investigates afresh and files a new issue superseding this one via *Related work*, the ordinary way any superseded issue is handled. Deliver-ticket is then invoked again, on the new number. Leaving this unsaid makes both skills individually consistent and jointly a dead end; say it so the owner doesn't have to reconstruct it.
