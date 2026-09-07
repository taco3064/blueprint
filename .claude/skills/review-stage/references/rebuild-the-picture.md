# Pass one — rebuild the picture before anyone tells you what it is

**Trigger:** the Review Packet has arrived and you have not run anything yet.

**The goal of this pass is one thing: an account of what this stage did that you wrote yourself.** Everything in `probe-the-change.md` is aimed at that account. A probe chosen after reading someone else's account tests their story, not the code.

## What the packet has to contain

The dispatcher extracts these verbatim — they are the authority sources, ranks 1 to 4, and none of them is the implementer's account of its own work:

- **The owner's latest decision** on anything this stage turns on, quoted as the owner stated it, **with its source: the comment URL, the author, and the timestamp.** A decision with no provenance cannot be checked for being the *latest* one, which is the only property rank one is ranked for.
- **The issue's current `## Goal`**, and **this stage's own plan text and acceptance criteria**, verbatim — current, including any in-flight revision, not as first filed.
- **Every revision comment that amended this stage's plan or criteria**, verbatim and with the same provenance. Rank 3 reaches you here or not at all: the body edit destroyed the prior wording, and you are not permitted to go read the thread.
- **Whatever the plan states must not change** — the global invariants.
- **The citations the issue named**: the module, the primitives, the consumers, the docs pages it made required reading.
- **The base**: the branch's tip SHA, the worktree path, and the fact that the change under review is *committed* there — the ticket assembled, every stage of it. **That is the only target this review has**: `SKILL.md`'s *There is one caller and one dispatch* settles it, and there is no staged, uncommitted one to fall back to, because the dispatch runs once the last requirement has landed and by then committed history is all there is left to read. **What you cannot review is a tree that has moved off the one the packet names** — `VOID`, *Moved*, below.
- **Two hashes**: the **code hash** — the reviewed commit's own tree, `git rev-parse <sha>^{tree}` — and the **requirement hash** of the authority text above. **That is one definition and not two**: `git write-tree` over a clean index returns the same object, and that is the value the dispatcher records as it stages the commit, so nothing has to be reconciled between what it hands you and what you recompute. **Measured on this repo, the two commands returned the same tree object while the parent commit's tree differed** — the control, because a check that cannot tell two trees apart is not a check. Both are re-checked when your report lands, and either one having moved discards the verdict — the second one because **code that has not changed does not mean the requirement it must satisfy has not changed**, and a PASS earned against a criterion revised mid-review is worth nothing.
- **Anything the owner already ruled out of scope** for this ticket. That is a decision, not a claim, and re-litigating it wastes a round.

## Read in this order, and stop between the steps

**1. The authority sources, before you look at a single line of the change.** What is this stage *supposed* to make true, and which of ranks 1 to 4 says so. Write that down first. Read it after the diff and you will be reading the diff's own framing of the requirement back to yourself.

**2. The whole change.** The branch's own diff is the diff of record — `git diff origin/main...HEAD`, every stage of the ticket in one read, because the dispatch runs after the last requirement has landed and there is no staged tree left to read. **Run `git status --porcelain` anyway**: uncommitted work is invisible to that diff and is exactly where a stray fixture or a half-written module hides, and anything it reports means the worktree you are about to run things in is not the tree the code hash names.

**3. The tree as it now stands, around the change.** This is the step that gets skipped, and it is the one this role exists for. **The diff says what moved; the tree says what it has to live with**, and most of what you are hunting is not in the diff at all: a consumer nobody updated, a rule that just went inert, a test that would pass against either implementation, a second derivation of something already derived two modules away. A review that only read the diff can only find defects the author already knew where to put.

**When the change is too large to read line by line, name the instrument in the report.** A mechanical sweep across sixty files is read by a byte baseline, a rendered artifact, or a targeted probe — not by scrolling. An unread diff with its instrument stated is honest; an unread diff called reviewed is the exact failure this skill was created for.

## Then answer these six yourself

Written down, before any probe is chosen. They are what turn a diff into an attackable claim:

**1. What did this stage actually change?** In terms of what is now true that was not — not a file list. If your answer is a list of files, you have not read it yet.

**2. What new assumptions does it establish?** Every change adds premises: that a field is always present, that two orderings are equivalent, that a path is already normalised, that no other caller reaches this. Each one is a probe target, and the ones stated in a code comment are the highest-yield of all.

**3. Which function is the real judging authority here?** When a behaviour has to be decided somewhere, exactly one place should decide it. Name that place. If the change introduces a second one, `probe-the-change.md`'s class 2 is now mandatory rather than optional.

**4. Is there a second derivation?** Something already computed from a source, now computed again from the same source by different code. That is the defect shape this repo pays for most, and it survives every unit test because both derivations get tested against their own author's expectations.

**5. Which existing consumers does this affect?** Answer it with a search, not from the diff — `probe-the-change.md`'s class 3 has the method and the measured numbers. The ticket's own list of files is a starting point that has never yet been complete.

**6. What does this stage claim is *true* — as against what it added?** Take it from the authority text you wrote down in step 1, never from the file list: a scope read off the diff **is** the diff, and it makes every question above tautological. The two come apart hardest when the stage's own job is verification — a conformance or integration stage adds nothing but tests, and claims the assembled behaviour holds. **Write the claim in behavioural terms and the scope falls out of it**: *"`emitLint` and `inspect` return the same verdict for a modular config"* is a claim about verdicts, so any reproducible divergence in a verdict is inside it, whoever wrote the code that diverges and however many stages ago. `SKILL.md`'s three FOLLOW-UP conditions are read against this line, and it goes in the report as `Claimed scope` — **it has to exist before the first probe**, because a scope written afterwards is written by whatever you found.

## A packet you cannot review

Four mechanical conditions, and each one means **no review happened** — so the report carries no verdict at all. Report `VOID`, name which condition, and hand it back:

- **Insufficient** — an authority question this stage turns on has no answer in the packet, and inferring it from the nearest analogue is exactly what rank one forbids. **Name what is missing and stop there: whether it is missing from the packet or missing from the world is not yours to say**, because you are forbidden from reading the ticket and that is where the difference is visible. The dispatcher can read it, and the two answers are unalike — one is a re-extraction, the other is a product question that goes to the owner (`deliver-a-stage.md`'s *The protocol's own budget*). **A decision handed over without provenance is insufficient in the same way**, when the stage turns on it: undated, it is indistinguishable from one already superseded, and *"the owner decided this"* is not a claim you have any way to age.
- **Self-contradictory** — the acceptance criteria and the plan text ask for different things, or an invariant rules out what a criterion requires.
- **Contaminated** — the implementer's report, summary, or verification claims arrived inside pass one. Name what you saw.
- **Moved** — `git status --porcelain` or the code hash does not match what the dispatcher handed you: something changed the tree while you were reading it. **The requirement moving counts the same way** — if a source you were handed turns out to have been superseded while the pass was running, the verdict would be a verdict on a question nobody is asking any more.

**`VOID` is not a hedge and it is not a soft `BLOCKED`.** It is available for exactly these four conditions and nothing else — never for "I could not decide", never for a probe you found hard to build. The dispatcher does not count a `VOID` as a fix round, because nothing was reviewed; that is precisely why it must not become the exit from a difficult review.
