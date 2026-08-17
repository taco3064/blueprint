# Finishing

**Trigger:** you believe the ticket is done.

## The completion test, in this order

**1. Every staged delivery has landed**, and each has a comment on the ticket carrying its commit.

**2. No shortfall is open.** Not "none that matter" — none. The ones ruled outside the ticket by the owner are the only exception, and each has a comment saying the owner ruled it so.

**3. The ticket's own goal is met, checked against the ticket rather than against your memory of it.** Re-read the issue body now, at the end. Take each thing it asks for and name the commit that makes it true. **This is the step that catches a ticket delivered faithfully in every part except the one nobody re-read** — you have been inside this for hours and the body has been quietly reinterpreted by every decision since.

**Anything you would describe as "partly done" is something you have not actually mapped.** Split it into the parts it is made of and map each one separately. *"Mostly covered"* is not a verdict, it is the absence of one, and it survives this step only because nobody made it say which half is missing.

**If a part of the goal cannot be turned into something a command shows you** — a rule that fires, a verdict that flips, a fixture that goes red, a rendered line that reads differently — **that is a shortfall, not a judgement call.** Name it, say what you would have run, and say how you satisfied yourself instead. Do not quietly downgrade it to "looks right".

Where the body is ambiguous, say in the closing comment how you read it. **Do not resolve an ambiguity by picking the reading your work already satisfies.**

**4. Nothing in the diff is unasked-for.** Walk the whole change. Anything the ticket did not ask for is either a shortfall you should have named, or scope you added — and both are said out loud before merging, not discovered afterwards.

**5. Readers who were not here have looked, and what they found has been dealt with.**

Steps 1 to 4 are all you checking your own work, and **you are the worst available reader of it** — you know what each line was meant to do, so you see the intent rather than the text. Under this arrangement nothing else stands between the code and `main`: you build it, you check it, you merge it. **The check has to be manufactured, because the structure no longer provides one.**

So before the pull request, **spawn read-only agents that had no part in the work**:

- **Fresh context, latest branch, and unable to write.** A reader that can edit starts explaining instead of reporting.
- **One per dimension of what this ticket changed** — the emitted artifact, the CLI's output, the docs pages it touches, the tests it added, **and the diff itself.** A single reviewer given everything returns the shape of its own attention, and a matrix of only output-shaped dimensions returns the shape of *that* mistake: every one of them can report what the code produces and none of them can report what the code structurally is.
- **The diff dimension is not optional and nothing else covers it.** One reader gets the issue, `CLAUDE.md`, the latest branch, and the full diff — everything it needs to judge the diff against, the same baseline every other reader already has. What it doesn't get is the reasoning, conclusions, or expected answers of the agents that came before it; withholding *that* is what keeps it a check instead of a rubber stamp, and it's a different thing from withholding the ticket or the repo's own rules, without which "scope beyond the ticket" and "a layering violation against `CLAUDE.md`'s table" aren't answerable questions at all. It's asked specifically for: scope beyond the ticket, a layering or dependency-direction violation against `CLAUDE.md`'s table, a test that would still pass against a wrong implementation, and a consumer the change didn't update. Running the artifact tells you the output is right; it says nothing about whether the diff is the right size or shape, and both failures are invisible from the render side.
- **Every other reader is told to run or render rather than read** — the artifact, CLI-output, and docs dimensions are exactly where that's earned, because every defect found there so far was found that way. The diff reader is the deliberate exception: it reads, because reading is the only thing that dimension can do.
- **An address is a file, a symbol, a command, or an output — not necessarily a line.** A wrong line is addressable by number; a missing branch, an uncalled consumer, or an untested reverse case is not, and demanding a line number for those either invents one or drops a real finding for want of one. Require the strongest address the finding actually has.
- **Ask for the clean list too.** A dimension checked and found sound is a result, and its absence is how "nothing found" hides "nothing looked at".

**Their findings are unverified reports until you reopen the file yourself.** One that does not hold is dropped **and said in the closing comment to have been dropped, with the reason** — that is where your own convergence hides, since generating findings freshly does not make your verdict on them fresh.

**And when a finding will not reproduce, suspect your reproduction before you suspect the finding.** A reader who ran the real thing and a dispatcher who rebuilt an approximation of it disagree for two reasons, and the approximation is the likelier one — a fixture missing the very property the finding was about looks exactly like a finding that was wrong. Check that yours carries it before you write *dropped*.

**Anything that survives is a shortfall.** Which means step 2 now fails, and you are back in the loop rather than finishing. That is the mechanism working, not a setback.

If any of the five fails, **you are not finishing, you are on another stage.** Go back.

## The pull request

One per ticket — with one narrow, named exception in *Merging, and closing* below. Open it after the completion test, not before.

- **Title**: conventional prefix, lowercase, imperative — `feat:` `fix:` `docs:` `test:` `refactor:` `perf:`, and `!` when a published contract breaks.
- **Body**: what the ticket asked for and what makes it true; how it was verified, with the commands and their output; and, if the diff contains anything the ticket did not literally ask for, an **Out-of-scope changes & rationale** section naming each one and why it is there.
- **Do not restate the comment stream.** The ticket has it. The PR body is for a reader who arrives at the diff.

**Wait for CI, read against the PR's current `HEAD`.** Read the PR's required checks as they stand right now (`gh pr checks`, or the branch protection API) and confirm every one is green against the current `HEAD` SHA — not a stale run. The count and the names are `main`'s branch-protection settings, not a fact this file should carry: a check added or removed there makes a hardcoded number here wrong the next time someone reads it. A red check, or a green one that ran against an earlier commit than `HEAD`, is a shortfall, and shortfalls do not merge.

**Before merging, `git fetch origin --prune` and confirm the branch is up to date with the result — don't assume the platform enforced it for you, and don't check it against a stale local `origin/main`.** `git merge-base --is-ancestor origin/main <branch>` (exit 0 means yes) is the authoritative test; `gh pr view --json mergeStateStatus` is a fast supplementary read, not a substitute — it also reflects conflicts, CI, and branch-protection state, and "behind" is only one of the things it can mean. If the branch isn't up to date, **update it with `git merge origin/main` — never rebase.** By this point in a ticket, `deliver-a-stage.md`'s loop guarantees at least one commit has already landed and been cited in a comment, and `start-or-resume.md`'s no-rewrite rule forbids rebasing a branch that holds one. Wait for CI to go green on the resulting `HEAD` after the merge commit — a new commit is a new candidate, and the rule above about reading CI against current `HEAD` applies to it too.

**This is where the freshness check belongs, not after merging.** Merging is the irreversible step in this whole procedure, so every check capable of failing belongs on its near side. Once the branch is confirmed up to date and CI is green against that state, that `HEAD` is `<verified-sha>` below, and it now has the one property the post-merge check depends on: nothing can land on `main` between here and the merge except by a genuine race.

## Merging, and closing

Merge your own PR once its required checks are green against its current `HEAD`, confirmed up to date with `origin/main` per the step above.

**Then confirm identity, not correctness.** This repo merges by rebase only — squash and merge-commit are both off in its merge-button settings — so GitHub replays the PR's own commits onto `main`'s current tip. Because the branch was just confirmed up to date, that replay lands on the same base it was written against, and the resulting tip's tree has to equal `<verified-sha>`'s own tree exactly, even though the individual commit SHAs change. `git fetch origin` again to see the merge land, then `git diff origin/main <verified-sha>` empty is the whole check — cheap for that reason, not because it's being skipped.

**Comparing against a `<verified-sha>` that was never confirmed up to date is a different check, and the wrong one.** If `main` gained unrelated commits while this PR was still catching up — or while waiting on the update above to go green — a correct merge legitimately produces a tree that includes them, and diffing against a stale `<verified-sha>` flags that as divergence even though nothing went wrong. The up-to-date confirmation is what makes this comparison mean something instead of guaranteeing a false alarm on every PR that had to wait its turn.

**If the diff is not empty anyway, that is an emergency, not a shortfall.** Something landed on `main` that this ticket never actually verified. Diagnose what diverged, and if the ticket's own goal no longer holds on `main`, **this is the one case where a second PR against the same ticket is correct** — *one per ticket*, above, assumes the merge is what it was checked to be, and this is the case where that assumption failed. Name it on the ticket: what diverged, why the pre-merge check above didn't catch it, and the follow-up PR's number. This should be rare enough to never happen; it's named here so the rule has somewhere to go if it ever does, instead of stranding the ticket with `main` broken and no permitted way to fix it.

Then close the ticket with a final comment carrying:

- **The five completion-test answers**, stated rather than implied. Especially the third — which commit satisfies which part of the goal — and the fifth: which dimensions were read by fresh readers, what they found, and what you dropped with the reason.
- **What the ticket taught that its body did not know** — an assumption that turned out false, a case the goal did not name, an approach abandoned and why. **This is the part that is worth reading a year from now**, and it exists nowhere else once this session ends.
- **Anything named as outside the ticket**, restated in one list so the owner does not have to walk the comment stream to recover it. **You still do not file it.**

## What does not happen here

**No new tickets.** Not for the outside-scope list, not for a follow-up, not for "the obvious next step". That list is the owner's input, not your output.

**No estimate of what is left.** If something is left, the ticket is not finished.

**No closing on a green counter.** A passing suite proves the tests pass. The completion test above is what proves the ticket is done, and only the third and fourth steps of it read the ticket at all.
