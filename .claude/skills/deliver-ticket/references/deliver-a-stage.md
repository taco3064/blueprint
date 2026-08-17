# Delivering a stage

**Trigger:** you are about to dispatch a sub-agent, about to dispatch or answer a reviewer, about to commit, or you have just committed and owe the ticket a comment.

## What a stage is

**A slice of the ticket that stands on its own: the repo is green and releasable when it lands, whether or not any later stage ever does.** Not a checkpoint of convenience, not "I stopped here because it was late".

**Green is not the same as honest.** A stage can leave every gate passing and still misrepresent the state — a debt ledger carrying rows you already know a later stage removes, a suppression standing in for work simply not done yet. That is still a legitimate stage, and the comment is where the distinction has to live: which rows are debt, and which are only recorded until the commit that closes them. The gate cannot carry that difference and the ledger file has nowhere to put it.

If a slice can only be verified together with the next one, it is not a stage — it is half of one, and committing it splits a single verifiable change into two comments that each prove nothing.

Cut stages by **what becomes true**, not by which files you happened to open. *"The schema accepts the new field and rejects three ways to get it wrong"* is a stage; *"edited `defineBlueprint.ts`"* is not.

**A ticket that only makes sense as one commit is one stage.** Do not manufacture stages to have something to report — a single commit with a single honest comment is a complete delivery.

## Dispatching it

**A fresh sub-agent per stage, given a Stage Packet — not the ticket number and an instruction to go read it.** Handing over the number and trusting a sub-agent to read "just the relevant part" doesn't bound anything: `gh issue view` returns the whole body and every comment regardless of what it was told to focus on, and a sub-agent that fetches the issue itself has paid the full ticket's cost no matter how narrowly it was asked to read. The packet is what actually shrinks the input; an instruction alone only shrinks the attention.

**Build the packet by extracting verbatim, not by summarizing.** The issue stays the single source of truth; the packet is a projection of it, not a second account of it — copy the exact text spans, don't restate them, the same discipline as *hand over the number, not your summary* applied to the parts instead of the whole. It carries:

- The issue's `## Goal`, verbatim.
- The one stage's own text from the Implementation Plan, verbatim, and its corresponding acceptance criteria, verbatim.
- Whatever the plan states must not change (the global invariants), verbatim.
- Shape-ticket's cited references — the module, the primitives, the consumers, the docs pages named as required reading.
- The commits of stages already landed, so it builds on top of real code rather than re-deriving it.
- Any shortfall still open that affects this stage.
- The issue's number and URL, for traceability — not as an invitation to fetch it.
- The instruction to read `CLAUDE.md` and every `.claude/docs/` page whose trigger fires for this change.

**Tell the sub-agent not to load the full issue or its comment thread — the packet is what it works from.** The one exception is the packet turning out self-contradictory or missing something the stage actually needs; that's reported back as a shortfall or a question, not a license to go fetch the rest quietly and reconcile it itself.

**What the packet excludes**: shape-ticket's discussion history, the full text of options the discussion rejected, every closed shortfall's full history, other stages' implementation detail, or any prior agent's reasoning. None of that changes what this stage has to make true, and carrying it anyway is exactly the cost this packet exists to cut.

Tell it what the stage is in terms of **what must become true**, and tell it the boundary in the same breath — what this stage does *not* cover, and that anything it notices outside the stage is reported rather than fixed. An implementer given a goal and no edge will find the edge by crossing it.

**Ask it for what you need to write the comment**, since it has it and you do not: the commands it ran and their output, which of its claims it measured and which it reasoned, and anything it noticed and did not act on.

## Before you commit

**Verify what came back rather than accepting it.** *"Done, tests pass"* is the implementer reporting confidence; it is not evidence and it is not yours until you have run it. Re-run the layer that matters, read the artifact if the stage touched one, and read the diff — **not for style, for scope**: a change wider than the stage is the most common thing a dispatch returns, and it is invisible in a summary.

**When the diff is too large to read, say which instrument read it instead.** A mechanical sweep across sixty files is not something you walk line by line, and reporting it as reviewed when you ran gates over it is the exact failure this page is about. Name what actually carried the check — the suite, a byte baseline, a rendered artifact. An unread diff with its instrument stated is honest; an unread diff called verified is not. **Whoever actually reads it is *The review gate* below** — stating your instrument is how you report the limits of your own pass, not a second reader you dispatch instead of that one.

If what came back is wrong or incomplete, **that is not a shortfall** — a shortfall is something true about the repo. It is an unfinished stage: dispatch again with what was missing, and do not commit in between.

- **Run the layer that could catch this**, not the cheapest one. `.claude/docs/verification-layers.md` says which is which. A unit test proves the logic; it does not prove the emitted artifact says anything.
- **If the change touches emitted prose, render it.** Enumerate the conditional branches from the code first, render one file per combination, and read them. An empty diff from a branch you never rendered looks exactly like an empty diff from a branch that did not change.
- **Never bypass the commit gate.** Not `--no-verify`, not `-n`, not `HUSKY=0`. If it stops you, the thing it stopped is the thing to fix.
- **And a gate that stops you may be saying your stage *order* is wrong, not your stage.** A hook that autofixes on the way in can produce violations no ledger holds, so the first commit touching a governed file fails on work belonging to a stage you have not run yet. Park the finished stage as a patch, land the one the gate named, re-apply. That is the gate working, and the order it forces is usually the honest one. **The review follows the commits, not your drafting order**: whichever stage lands next is the one reviewed next, and the parked one is reviewed when it is re-applied — a verdict on a patch that is not the tree is a verdict on nothing.

## The review gate

**Verify it yourself first, then hand it to a reviewer that has seen none of this.** Your own check above is a filter, not the review — a stage that does not lint, type-check or build has no business costing a review round. What it cannot be is the review itself: you chose the stage and wrote the packet, so *"was this the right thing to have asked for"* is not a question you can answer about your own instruction. `SKILL.md`'s *A stage is not yours to pass* is the standing rule; this is how it runs.

**Dispatch it in the background, and let nothing advance while it runs.** Not the next stage, not a commit, not a comment. The next stage builds on this code — starting it before the verdict means a BLOCKED arrives on top of work that already assumed a PASS, and untangling that costs more than the wait ever did.

**One reviewer per stage, continued across its parts and its rounds** — fresh per stage exactly as the implementer is, and continued within one, because re-verifying a finding means re-running the reproduction whoever wrote it holds. **That trade is deliberate and it is not free**: a reviewer carried across rounds accumulates its own investment in the findings it filed. `review-stage`'s re-review rules are what answer that — a PASS at the end has to rest on the fix diff read as a change in its own right, not on three earlier findings having disappeared.

**Run the commit gate's own fixer before you stage anything.** `lint-staged` autofixes on the way into a commit, so **a tree that has not been through it is not the tree that will land** — read what it runs from `package.json`'s `lint-staged`, not from this line, which will drift the moment that config changes. Fixing first is what makes the hash below mean anything: the alternative is discovering *after* the verdict that the gate rewrote what the reviewer read, and then having to rule on how much of a rewrite is too much — an exception this repo has already removed once, from this skill's own fingerprint gate.

**Then stage the change: `git add -A`.** One command now shows the whole thing (`git diff --cached`), which a plain `git diff` does not — a file the stage added and never staged is invisible in a diff, and that is exactly where a stray fixture or a half-written module hides. Staging is also what gives you an identity to check the review against:

- `git diff --cached | git hash-object --stdin` and `git status --porcelain`, recorded **before** the dispatch and again when the report lands.
- **If either moved, the review is void.** Discard the verdict whatever it said, find what wrote to the tree, and dispatch again. A verdict on a tree that no longer exists is worse than no verdict, because it reads exactly like a real one.

### The Review Packet, in two parts

**Part one, with the dispatch.** Verbatim extracts, the same discipline as the Stage Packet — a projection of what is already written, never a second account of it:

- **The owner's latest decision** on anything this stage turns on, quoted as the owner stated it. That is rank one of `review-stage`'s authority order, and the packet is the only place a reviewer can get it.
- The issue's `## Goal`, this stage's own plan text, its acceptance criteria, and the invariants — **current**, including any in-flight revision, not as first filed.
- **Every revision comment that amended this stage's plan or criteria, verbatim.** `shape-ticket`'s `revise-an-in-flight-ticket.md` **overwrites the issue body on each pass**, so that comment is the only place the prior wording survives — and it is also the only record of which already-landed stage the revision leaves valid, which is what makes "judged by the criteria that stood at the time" reconstructable at all. **A reviewer reading only the current body cannot tell a criterion that always said this from one revised yesterday, and cannot tell which version a landed stage was judged against.** Extract those comments; do not hand over the thread they sit in.
- **Provenance on both of the above**: the comment URL, the author, and the timestamp. *"The owner decided X"* with no source is unfalsifiable as **latest** — which is the one property rank one is ranked for — and a reviewer that cannot date a decision cannot tell it from one that was superseded an hour later.
- Shape-ticket's cited references, and anything the owner has already ruled out of scope on this ticket.
- The base SHA, the worktree path, and the staged-diff hash you just recorded.
- The instruction to load `review-stage`, and to read `CLAUDE.md` plus every `.claude/docs/` page whose trigger fires for this change.

**What part one withholds is the whole point of the gate**: the implementer's report, its command output, its reasoning, its self-assessment, **your own verification results**, any earlier stage's reviewer findings, and the issue's comment thread — which is where all of that is written down. Tell it not to fetch the issue, for the same mechanical reason the implementer is told: `gh issue view` returns every comment regardless of what it was asked to focus on.

**Part two, after its first pass comes back.** Only then do you send the implementer's report and the draft commit message, verbatim, for the claim audit. **Sending them with part one collapses two passes into one anchored pass** — the sequence is what makes the independence mechanical instead of a promise. Send it to the same reviewer, which holds its own pass-one findings; a reviewer that died between the parts is a re-dispatch from part one, never a shortcut into part two.

### Reading the verdict

- **PASS** → commit, then prove the commit is what was reviewed. `git diff HEAD~1 HEAD | git hash-object --stdin` compares the same two trees the reviewed hash was taken across, so it has to match **exactly**. **Any difference at all goes back for a fresh PASS before the push — there is no "only formatting" exception**, because an autofix does not guarantee it touched only layout, and even where it provably did, the verdict is no longer a verdict on the tree that exists. The whole gate rests on *the reviewed tree is the landed tree*; a size threshold on the divergence dissolves that claim quietly, which is the same shape as the bypass removed from the fingerprint gate. Running the fixer before staging is what makes this check normally pass on the first try.
  - **This is the one window where amending is allowed.** The commit is not pushed and no comment cites it, so `git commit --amend` is how a re-reviewed version replaces it. `start-or-resume.md`'s no-rewrite rule begins at the push — which is exactly why *push before the comment* is the line that makes a SHA public.
  - **A re-review forced by the gate does not consume a fix round if it passes** — nothing was fixed, the gate moved the tree. If the reviewer blocks on something the autofix introduced, that is a real finding and it costs a round like any other.
  - Then `push → comment` below.
- **BLOCKED** → this is *an unfinished stage*, per the rule above, not a shortfall: the repo is not yet what the ticket asked for. Dispatch a fix, with the findings **verbatim** and nothing about which of them you found persuasive. Do not commit in between.
- **VOID** → nothing was reviewed. Fix the condition it named — an insufficient packet, a contaminated pass one, a moved tree — and dispatch again. **A VOID does not consume a fix round**, and neither does a finding the reviewer withdraws.
- **A finding that will not reproduce** → one exchange back to the reviewer, carrying your reproduction attempt in full. Suspect yours first: a fixture missing the property the finding was about looks exactly like a finding that was wrong. If the reviewer defends it, it stands.

### The round count lives on the ticket, not in this session

**A BLOCKED that exists only in your context is a round that gets spent twice.** Until the escalation, the gate writes to the ticket at exactly one moment — the PASS's stage comment — and a run that dies after round one's fix leaves a staged tree with nothing on the ticket to explain it. `start-or-resume.md` cannot tell that apart from a review that never started: the budget resets to zero, the reviewer's findings are gone, and **an overnight loop can spend rounds on one stage indefinitely while every rule about a two-round budget stays technically satisfied.**

So **post a review-state comment the moment the first BLOCKED lands, and update that same comment every round.** It is not a stage comment — it precedes the commit and may never become one — so it carries its own marker as its first line, which is also how a resumed session finds it:

```
<!-- deliver-ticket:stage-review:<stage-slug> -->
```

Each update carries: the stage, the base SHA, **the staged-diff hash that round was reviewed at**, the round number against the budget, the reviewer's findings for that round **verbatim**, and what the fix changed. The hash is what makes a resume precise rather than approximate — a staged tree matching the last round's hash means that round's verdict still stands, and one that differs means the fix landed and the re-review did not, so that round is already spent.

**Locate it by the marker, not with `--edit-last`.** `gh issue comment --edit-last` targets your most recent comment on the issue, which is the wrong one as soon as anything else has landed since — and on this ticket something will have. `gh api repos/:owner/:repo/issues/<n>/comments` filtered on the marker gives the id, and `gh api -X PATCH repos/:owner/:repo/issues/comments/<id>` updates it.

**Close it out when the stage resolves**: a PASS edits it a final time to name the commit that landed, and an exhausted budget edits it to point at the escalation comment. **A review-state comment left open reads as a stage still mid-review**, which is precisely the state a resumed session is trying to identify.

**Two fix rounds is the budget.** When the second re-review still returns BLOCKED, **the stage escalates and nothing commits**:

- **Park the work where it survives the session.** `git diff --cached > <patch>` into the scratchpad or a `mktemp -d` — **never inside the worktree**, which would add an untracked file to the very diff under review. Leave the worktree staged and otherwise untouched.
- **Comment on the ticket**: the stage, the reviewer's findings verbatim across every round, what each fix round changed, the base SHA, where the patch is, and that this is now waiting on the owner. Then stop — no commit, no next stage. `start-or-resume.md` reads that comment to recognise this state on the way back in.
- **A stage that fails three reviews is evidence about the plan, the packet or the ticket** rather than about the code, and a fourth attempt at the code is the one response that cannot help. If the ticket itself turns out to be wrong, `SKILL.md`'s drift branch is where that goes.

## Push before the comment, always

The order is **verify → review → commit → push → comment**, every stage, no exceptions. A comment citing a SHA that only exists in the local worktree is citing something a reader clicking through cannot open — and on a delivery that can run for hours, local-only is one crashed session away from being the only copy that ever existed.

**If the push fails, the stage has not landed.** Do not post the comment claiming it has. Resolve why it failed — a moved remote branch is the likely cause — and push before writing anything.

**If the push succeeds but posting the comment fails, do not start the next stage.** Re-post the comment for the commit that is already public first. A resumed session finds this exact state by diffing `git log <branch>` against `git log origin/<branch>` and against what the comment stream actually names — see `start-or-resume.md`. A pushed commit with no comment naming it is not a new stage to build; it's a comment owed on one already built.

## The comment, one per commit

Post it as the commit lands, not in a batch at the end. It carries five things and the last one is the one that gets skipped:

**1. What landed, and the commit.** The short SHA and one line on what is now true that was not. Not a file list — the file list is in the diff.

**2. What you ran, and what it showed.** The command and its result. `2134 tests green` is evidence; *"tests pass"* is a claim about evidence. Where you rendered an artifact to check it, say which artifact and quote the line that settled it.

**3. Which claims are measured and which are reasoned.** Mark them. A mechanism you inferred from reading is worth writing down and is not the same as one you executed, and only the label tells a later reader which ones are still owed a run.

**4. The review.** That it returned `PASS`, and on which base and staged-diff hash — and if it took rounds to get there, what each round's findings were and what closed them. **A stage that passed first time says so explicitly.** This is the only durable record that the gate ran at all: a commit and a comment look identical whether a reviewer cleared them or nobody was ever asked, which is exactly the gap `start-or-resume.md`'s fingerprint gate exists to close one level up. Anything the reviewer filed as **FOLLOW-UP** is not closed by the PASS — it becomes a shortfall below, or something the owner rules outside, by the ordinary rules.

**5. Shortfalls.** Everything you noticed and did not close in this commit, each with an address — file and line, or the command and the output. **Repeat the ones still open from earlier comments.** A shortfall named once and never mentioned again is indistinguishable from a shortfall that was fixed.

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
