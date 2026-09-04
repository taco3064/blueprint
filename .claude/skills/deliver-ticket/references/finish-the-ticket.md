# Finishing

**Trigger:** you believe the ticket is done.

## The release note is assembled here, and nowhere else

**One changeset per ticket, written now, in its own commit, before the completion test runs on the whole assembly.** Not one per stage, and not left to whoever cuts the release.

**Nothing gates it earlier, and that is the point.** `ci.yml` has no changeset check; only `release.yml` consumes them, at the tag. So a stage that lands without one breaks nothing — **and a stage must never be judged on one.** A changeset written per stage describes what the *plan predicted*, and a plan gets revised: #371's stage 5 spent two of its three rounds on sentences in a changeset that had gone stale because two revisions changed what they should say and nothing linked the two. **Written at the end it describes what actually landed, and a fact does not go stale the way a prediction does.**

**Assemble it from the ticket's own comment stream, not from memory of the work.** Each stage comment already carries the two things a release note is made of: *what landed — one line on what is now true that was not*, and the shortfalls, which say what must **not** be claimed. Every one of those lines sits behind a commit that already passed a review. **Assembling them is not authoring a new account of the ticket; re-deriving them from the diff is.**

**What it carries is what a changelog reader needs — what changed, what they will see, and whether anything is asked of them.** Not the ticket's reasoning, not the options rejected, not the mechanism. Those live on the issue and in the commits, and a changeset that restates them becomes a second copy of the ticket that goes false the first time the ticket moves.

**The bump level comes from the issue's release statement** — which release this ships in, and whether the ticket's stages all land in one. That decision is the ticket's. **The artifact is not**, and an issue that specifies the changeset itself has made a release artifact its own deliverable, which is what let one stage be blocked on it with the ticket's authority (`shape-ticket`'s `create-the-ticket.md` now asks only for the release statement, for this reason).

**It is its own commit and it has no stage**, like the pull request and the closing comment below. **Step 5's readers are what read it** — the release note is one of their dimensions — which is why it is written before the test rather than after it.

## The completion test, in this order

**1. Every staged delivery has landed**, and each has a comment on the ticket carrying its commit.

**2. No shortfall is open.** Not "none that matter" — none. The ones ruled outside the ticket by the owner are the only exception, and each has a comment saying the owner ruled it so.

**An observation outside this purpose is not a shortfall and never becomes one**, so it never reaches this step — **it is classified where it is recorded, not excepted here**, and this step's one exception stays the one exception. **Recording something is not the same as owing something**: a loop that turns every note into a debt cannot reach step 5, and the ticket becomes unfinishable by the act of writing down what it found. **What separates the two is purpose, not importance** — an observation can matter more than a shortfall and still not be this ticket's to carry.

**3. The ticket's own goal is met, checked against the ticket rather than against your memory of it.** Re-read the issue body now, at the end. Take each thing it asks for and name the commit that makes it true. **This is the step that catches a ticket delivered faithfully in every part except the one nobody re-read** — you have been inside this for hours and the body has been quietly reinterpreted by every decision since.

**Anything you would describe as "partly done" is something you have not actually mapped.** Split it into the parts it is made of and map each one separately. *"Mostly covered"* is not a verdict, it is the absence of one, and it survives this step only because nobody made it say which half is missing.

**If a part of the goal cannot be turned into something a command shows you** — a rule that fires, a verdict that flips, a fixture that goes red, a rendered line that reads differently — **that is a shortfall, not a judgement call.** Name it, say what you would have run, and say how you satisfied yourself instead. Do not quietly downgrade it to "looks right".

Where the body is ambiguous, say in the closing comment how you read it. **Do not resolve an ambiguity by picking the reading your work already satisfies.**

**4. Nothing in the diff is unasked-for.** Walk the whole change. Anything the ticket did not ask for is either a shortfall you should have named, or scope you added — and both are said out loud before merging, not discovered afterwards.

**5. Readers who were not here have looked, and what they found has been dealt with.**

Steps 1 to 4 are all you checking your own work, and **you are the worst available reader of it** — you know what each line was meant to do, so you see the intent rather than the text.

**Every stage already passed a review, and this is not that review again.** `deliver-a-stage.md`'s gate judges one stage against its own acceptance criteria, on the tree as it stood at that moment, by a reviewer that was shown only that stage. **Three defect classes are structurally invisible from there and exist only here**: a goal met in every stage and unmet as a whole; a later stage quietly withdrawing a guarantee an earlier one made; and the assembled diff being the wrong size or shape for the ticket. **So a per-stage PASS is not evidence for any of steps 1 to 4, and a run of them is not evidence either** — a clean sheet of stage verdicts is exactly what a ticket that drifted looks like from the inside.

Between the stage gate and the merge, nothing else stands between the code and `main`: you build it, you have each piece reviewed, you assemble it, you merge it. **The check on the assembly has to be manufactured, because the structure provides one for the pieces and none for the whole.**

So before the pull request, **spawn read-only agents that had no part in the work**:

- **They load [`review-stage`](../../review-stage/SKILL.md), and borrow two things from it: the finding format and the probe classes.** Reproduction, expected, actual, impact, required direction — and the BLOCKER / REQUIRED / FOLLOW-UP ladder — so a finding at this altitude reads the same as one at stage altitude and needs no translating. **What they do not borrow is its verdict machinery**: nothing here blocks a commit, because every commit already landed. A survivor inside the frozen frontier becomes a shortfall, which fails step 2, which puts you back in the loop; one outside it is an observation and gates nothing — the pair below says which is which. Its authority order applies unchanged, and the target is what differs — the assembled ticket, not one stage.
- **Fresh context, latest branch, and unable to write.** A reader that can edit starts explaining instead of reporting.
- **One per dimension of what this ticket changed** — the emitted artifact, the CLI's output, the docs pages it touches, the tests it added, **the release note written above**, **and the diff itself.** A single reviewer given everything returns the shape of its own attention, and a matrix of only output-shaped dimensions returns the shape of *that* mistake: every one of them can report what the code produces and none of them can report what the code structurally is.
- **The diff dimension is not optional and nothing else covers it.** One reader gets the issue, `CLAUDE.md`, the latest branch, and the full diff — everything it needs to judge the diff against, the same baseline every other reader already has. What it doesn't get is the reasoning, conclusions, or expected answers of the agents that came before it; withholding *that* is what keeps it a check instead of a rubber stamp, and it's a different thing from withholding the ticket or the repo's own rules, without which "scope beyond the ticket" and "a layering violation against `CLAUDE.md`'s table" aren't answerable questions at all. It's asked specifically for: scope beyond the ticket, a layering or dependency-direction violation against `CLAUDE.md`'s table, a test that would still pass against a wrong implementation, and a consumer the change didn't update. Running the artifact tells you the output is right; it says nothing about whether the diff is the right size or shape, and both failures are invisible from the render side.
- **Every other reader is told to run or render rather than read** — the artifact, CLI-output, and docs dimensions are exactly where that's earned, because every defect found there so far was found that way. The diff reader is the deliberate exception: it reads, because reading is the only thing that dimension can do.
- **An address is a file, a symbol, a command, or an output — not necessarily a line.** A wrong line is addressable by number; a missing branch, an uncalled consumer, or an untested reverse case is not, and demanding a line number for those either invents one or drops a real finding for want of one. Require the strongest address the finding actually has.
- **Ask for the clean list too.** A dimension checked and found sound is a result, and its absence is how "nothing found" hides "nothing looked at".

**They verify the frontier that is already frozen, and may not add a new purpose to it.** *"You named five consumers of this pattern and one of them has no test for an unmatched brace"* is a completion finding — it names a gap inside what the ticket already committed to. *"While we are here, check whether the wording for an empty pattern is precise enough"* is a new direction wearing a finding's clothes. **The test is whether the ticket already owed this, not whether it would be good to know.** A reader that may widen the purpose is a reader that can always find one more thing, and a step that ends when it stops finding them ends never.

**So write the matrix down before they run, and finish when it is green.** One column per invariant, consumer, input axis and public surface the ticket committed to — each with the instrument that answers it **and what that instrument cannot see**. **Completion is that matrix passing. It is not another batch of fresh readers failing to turn anything up**, because a target defined as *"whatever the next reader finds"* has no green state.

**You draw it — and the guard is not who drew it, it is that every column names its instrument out loud.** You are the worst available reader of your own work and this step never pretended otherwise; what it can do is make that blind spot visible instead of structural. **An instrument built to check someone else's work fails the same way the work does, and it is never caught by the check it feeds**: a hash of the wrong text is a perfectly stable hash, a diff of a mangled reconstruction is a real diff, a sweep for a number finds numbers. **So a column carries what it found and what its instrument could not see, and a column with no instrument named is not green — it is unrun.**

**None of this bans a fresh reader; it bans an undefined target.** A reader that had no part in the work, running a matrix it did not draw, is exactly what this step is for — and being unable to write, what it can still do is say a column is wrong, which is the check on your drawing of it. What it may not do is add a column while it runs: **a column it thinks is missing is a finding about the matrix**, reported like any other and disposed of like any other.

**Their findings are unverified reports until you reopen the file yourself.** One that does not hold is dropped **and said in the closing comment to have been dropped, with the reason** — that is where your own convergence hides, since generating findings freshly does not make your verdict on them fresh.

**And when a finding will not reproduce, suspect your reproduction before you suspect the finding.** A reader who ran the real thing and a dispatcher who rebuilt an approximation of it disagree for two reasons, and the approximation is the likelier one — a fixture missing the very property the finding was about looks exactly like a finding that was wrong. Check that yours carries it before you write *dropped*.

**Anything that survives inside the frozen frontier is a shortfall.** Which means step 2 now fails, and you are back in the loop rather than finishing. That is the mechanism working, not a setback.

**Anything that survives outside it goes under `## Observations outside this purpose` in the closing comment, and stops there.** Not an issue — nobody files one. **Not a shortfall — not an excepted one, not one at all**, so step 2 never sees it. Not a promise — the comment commits no one to acting on it, and *"we should look at this later"* is not written. **It is a prospecting record, and the owner opens a ticket if and when they judge one worth opening.** A run that files its own follow-ups generates tickets faster than anyone closes them, and the backlog it leaves is indistinguishable from work nobody chose.

**Each entry carries an address and a measurement, and no case for taking it.** Where it is, what was observed, and nothing arguing for its promotion — the argument is what turns a note into a debt, and the debt is what this heading exists to not create.

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
- **Anything named as outside the ticket**, restated in one list so the owner does not have to walk the comment stream to recover it. **You still do not file it.** **That list is the one headed `## Observations outside this purpose`, and there is only one** — what the owner ruled outside, what a stage review sent here as an association, and what a step-5 reader found outside the frozen frontier all land in it, each with its address, its measurement, and how it got there. A second list for not-this-ticket material is a second place to look and a first place to lose something.

## Cleaning up

Once the ticket is closed, the worktree, the local branch, and usually the remote branch have stopped being useful — and `SKILL.md`'s one-worktree-per-ticket convention accumulates indefinitely across tickets if nothing ever removes one.

**Leave the worktree before removing it.** `cd` back to the main checkout, or any other worktree, first. `git worktree remove` on the directory currently sitting under you is exactly the kind of thing that fails or leaves things in a strange state, and there's no reason to still be there once the ticket is closed.

- `git worktree remove <path>` for the ticket's worktree.
- `git branch -D ticket/<n>-<slug>` for the local branch. **`-D`, not `-d`.** This repo's only merge strategy is rebase-merge, which gives every landed commit a new SHA on `main` — so git's own "is this merged" check, which `-d` relies on, says no even though it is. The identity check two sections up already proved the content landed; that's the safety this step depends on, not git's heuristic.
- The remote branch: this repo deletes the head branch on merge automatically, so `git fetch origin --prune` and check it's actually gone (`git branch -r --list 'origin/ticket/<n>-*'`) before deleting it by hand. Push a delete only if it's somehow still there.

## What does not happen here

**No new tickets.** Not for the outside-scope list, not for a follow-up, not for "the obvious next step". That list is the owner's input, not your output.

**No estimate of what is left.** If something is left, the ticket is not finished.

**No closing on a green counter.** A passing suite proves the tests pass. The completion test above is what proves the ticket is done, and only the third and fourth steps of it read the ticket at all.
