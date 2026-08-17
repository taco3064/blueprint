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
- **The base**: the branch's `HEAD` SHA, the worktree path, and the fact that the change under review is *staged and uncommitted* there.
- **Anything the owner already ruled out of scope** for this ticket. That is a decision, not a claim, and re-litigating it wastes a round.

## Read in this order, and stop between the steps

**1. The authority sources, before you look at a single line of the change.** What is this stage *supposed* to make true, and which of ranks 1 to 4 says so. Write that down first. Read it after the diff and you will be reading the diff's own framing of the requirement back to yourself.

**2. The whole change.** `git diff --cached` is the diff of record — the dispatcher staged the work so one command shows all of it. **Run `git status --porcelain` anyway**: an added file that never got staged is invisible to a diff and is exactly where a stray fixture or a half-written module hides, and a modified-but-unstaged file means the tree is not what the dispatcher hashed.

**3. The tree as it now stands, around the change.** This is the step that gets skipped, and it is the one this role exists for. **The diff says what moved; the tree says what it has to live with**, and most of what you are hunting is not in the diff at all: a consumer nobody updated, a rule that just went inert, a test that would pass against either implementation, a second derivation of something already derived two modules away. A review that only read the diff can only find defects the author already knew where to put.

**When the change is too large to read line by line, name the instrument in the report.** A mechanical sweep across sixty files is read by a byte baseline, a rendered artifact, or a targeted probe — not by scrolling. An unread diff with its instrument stated is honest; an unread diff called reviewed is the exact failure this skill was created for.

## Then answer these five yourself

Written down, before any probe is chosen. They are what turn a diff into an attackable claim:

**1. What did this stage actually change?** In terms of what is now true that was not — not a file list. If your answer is a list of files, you have not read it yet.

**2. What new assumptions does it establish?** Every change adds premises: that a field is always present, that two orderings are equivalent, that a path is already normalised, that no other caller reaches this. Each one is a probe target, and the ones stated in a code comment are the highest-yield of all.

**3. Which function is the real judging authority here?** When a behaviour has to be decided somewhere, exactly one place should decide it. Name that place. If the change introduces a second one, `probe-the-change.md`'s class 2 is now mandatory rather than optional.

**4. Is there a second derivation?** Something already computed from a source, now computed again from the same source by different code. That is the defect shape this repo pays for most, and it survives every unit test because both derivations get tested against their own author's expectations.

**5. Which existing consumers does this affect?** Answer it with a search, not from the diff — `probe-the-change.md`'s class 3 has the method and the measured numbers. The ticket's own list of files is a starting point that has never yet been complete.

## A packet you cannot review

Four mechanical conditions, and each one means **no review happened** — so the report carries no verdict at all. Report `VOID`, name which condition, and hand it back:

- **Insufficient** — an authority question this stage turns on has no answer in the packet, and inferring it from the nearest analogue is exactly what rank one forbids. **A decision handed over without provenance is insufficient in the same way**, when the stage turns on it: undated, it is indistinguishable from one already superseded, and *"the owner decided this"* is not a claim you have any way to age.
- **Self-contradictory** — the acceptance criteria and the plan text ask for different things, or an invariant rules out what a criterion requires.
- **Contaminated** — the implementer's report, summary, or verification claims arrived inside pass one. Name what you saw.
- **Moved** — `git status --porcelain` does not match what the dispatcher handed you. Something changed the tree while you were reading it.

**`VOID` is not a hedge and it is not a soft `BLOCKED`.** It is available for exactly these four conditions and nothing else — never for "I could not decide", never for a probe you found hard to build. The dispatcher does not count a `VOID` as a fix round, because nothing was reviewed; that is precisely why it must not become the exit from a difficult review.
