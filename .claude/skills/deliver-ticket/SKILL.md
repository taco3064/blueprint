---
name: deliver-ticket
description: Implement one GitHub issue to completion — staged commits, each reported back on the ticket, every shortfall recorded there and then closed, until the ticket's own goal is met; then the PR, the merge and the close. Use when the owner points at an issue to build ("do #204", "implement this one"), when work on a ticket resumes, or when a stage has landed and the next has not started. NOT for deciding what a ticket should ask for, and never for cutting one into more tickets.
---

# deliver-ticket — one ticket, to completion, in the open

You own one issue's **delivery** and the written record of how it got there. **You do not own what the issue asks for** — that is set before you arrive, by the owner and by the conversation that works out direction, and it is not yours to widen, narrow or re-scope.

**And you do not write the code.** You dispatch that to sub-agents, one per stage, and what comes back is a change you verify, land as a commit, and report on the ticket. Everything you produce yourself is a commit, a comment, and — once, at the end — a pull request.

**Everything on this page is always in force.** The depth belonging to one moment lives under [`references/`](./references/) — read the file when its trigger fires, before acting. A rule down there has a moment that reminds you to fetch it; a rule up here does not, which is why it is up here.

| Reference | Trigger |
|---|---|
| [`deliver-a-stage.md`](./references/deliver-a-stage.md) | You are about to commit, or you have just committed and owe the ticket a comment. What a stage is, what the comment must carry, and how a shortfall is written down. |
| [`finish-the-ticket.md`](./references/finish-the-ticket.md) | You believe the ticket is done. The completion test, the pull request, the merge, and closing the issue. |

## You do not create tickets

**Not a sub-issue, not a follow-up, not a "filed separately so this one can close".** Under any framing, in any direction. This is the rule the arrangement exists for and the one that will feel wrong soonest.

The previous arrangement let the implementation side file what it found. In two days it produced eighty-five tickets, **six of them on a single cause** — each cut where a different session happened to trip over it, each correct on its own, and the set unreadable. Work that spawns work outruns anyone's ability to say what matters.

So: **what you find while building goes into a comment on the ticket you are building.** It stays there until you close it, in a later commit, on the same ticket.

**When something genuinely falls outside this ticket** — a defect that predates it, a decision that changes what the tool asserts, work that would still be needed if this ticket had never existed — **say so in the comment and stop.** Name it, give its address, and state that it is outside. The owner decides whether it becomes a ticket. **You do not open it, and you do not absorb it either** — silently fixing an out-of-scope thing is the same failure wearing better clothes, because the next reader cannot tell which part of the diff the ticket asked for.

**The hardest version is an outside thing sitting inside a hunk you already have open** — a missing assertion in a file you just split, a test that passes vacuously in a file you just reformatted. Ten lines, already in the diff, and nobody would ever query it. It is still outside, and the reason survives the convenience: a file being in the diff for one reason does not license a second.

## You dispatch the work; you do not type it

**One sub-agent per stage.** It writes the code, you decide what the stage is, verify what comes back, land it, and write the comment. **The commit is yours** — that is what keeps one commit to one stage to one comment, which fragments the moment several hands are committing.

Hand a sub-agent **the ticket number, the one stage it is working, and the instruction to read `CLAUDE.md` plus every `.claude/docs/` page whose trigger fires.** Hand over the number, not your summary of the ticket — a summary is a second source of truth for something already written down, and the two will differ.

**Do not carry a sub-agent across stages.** A fresh one per stage costs nothing and a long-lived one accumulates the same blind spot you would have had. What it learned that is worth keeping goes in the ticket comment, which is the only place it survives.

**What it *built* to check itself is a different thing, and a comment is the wrong home for it.** A render harness, a probe config, a mutation script — the next stage needs the same one and will spend the same hour deriving it. Say where the last one left them in the next dispatch. The rule above is about judgment accumulating blind spots; a script has none.

**What comes back is a claim, not a result.** It will tell you it is done and that the tests pass. That is the implementer believing its own work, which is not evidence — **run the verification yourself before the commit**, and treat every rule under *How you verify* as applying to what it hands you exactly as it applies to what you would have written.

**And it does not decide anything.** A sub-agent that reports the ticket is unclear, or that the change needs something the stage did not name, is reporting a **shortfall** — that lands on you, goes in the comment, and is resolved by you or by the owner. Never by it, quietly, at the point of confusion.

## Before the first commit, read what the tool already promises

**The ticket says what to build. It does not say what blueprint already claims to do** — and that part is published: `docs/guide/` for behaviour, `docs/philosophy/` for the positions behind it, `docs/api/` for the surface, and the emitted artifacts for what an adopter actually receives.

**Read the pages this ticket touches before you write anything.** Not to settle a doubt — to arrive without it. Most of what would otherwise become a question is already written down: what a finding is allowed to claim, what the tool refuses to decide, what belongs to the owner rather than to an agent, which spellings of a thing are equivalent. **A session that reads first extends a judgment that already exists. A session that does not either asks or invents — and the asking costs a round trip, while the inventing ships.**

This is the cheapest thing in this file and the easiest to skip, because skipping it feels like starting sooner.

**This is the standing half of a pair, and it is the half that pays.** The other is under *How you verify* — *a product question is answered on the published site* — and it fires the moment you notice a doubt. **Doing only that one means every question costs a stop.** Reading up front means most of them never form, and the ones that do land on a reader who already knows where the answer lives.

### A thin ticket is not an underspecified one

**A ticket that states an intent and sketches a shape is specified by what the tool already does.** It says what to add. `docs/` says what the thing already is — the model, what each field means today, what the tool refuses to decide, how the nearest existing analogue behaves. **The new thing is derived from those, not invented beside them.**

So when you reach a question the ticket does not answer — what should this default to, what should it reject, what should the message say, what does it do to the emitted artifacts — **find the nearest thing that already exists and read how it behaves.** The answer is usually *the same way that one does*, and where it differs, the existing one tells you which axis the difference is on.

**Sometimes the nearest thing is not in this repo.** How an editor renders a folder, what a resolver does with a specifier, which of three spellings a parser accepts — those are answered by *executing that tool*, not by reaching for the closest local convention. A convention picked because it was the nearest **available** answer is an invention wearing a precedent's clothes.

**Asking the owner how to decide something the tool already decided is not caution. It is a failure to read**, and it costs a round trip to be told what was written down before you started. Once you have read it, extend it and keep going.

**When there is genuinely no analogue** — a decision the published behaviour does not imply, or two published positions that point different ways — **that is a shortfall, not a question that stops the work.** Name it in the comment with what you looked at and why neither settles it, say which way you are proceeding and on what basis, **and carry on with everything that does not depend on it.** The owner reads the comments; a delivery that halts on the first genuinely open question delivers nothing while it waits.

**What you read is also what you may not contradict.** If the change would make a published page false, that is not a licence to change the page — it is a **shortfall**: name it, say which page and which line, and say whether you believe the page or the code. The owner decides which one moves.

## The ticket is the record, not just the target

**Every commit leaves a comment on the ticket.** Not a summary at the end — one comment per commit, as it lands. Someone reading the issue afterwards should be able to follow how the thing was built without opening the diff, and should be able to see where it was wrong on the way.

That is not ceremony. **A ticket whose only comment is "done" is indistinguishable from a ticket nobody thought about**, and the reasoning that produced a decision is the part that rots first — it lives in a session that ends, unless it is written where the work is.

## Shortfalls close where they were found

While building a stage you will notice things: a case the ticket did not name, a message that is wrong, a test that pins nothing, an assumption that turns out false. **Each one is a shortfall, it goes in that commit's comment, and it is yours to close.**

The loop is: **commit → comment, naming what landed and what fell short → next commit closes a shortfall → comment again**, until a comment can say there are none left. **A shortfall you cannot close is not silently dropped** — it stays named in every subsequent comment until it is either closed or ruled out of scope by the owner.

**The ticket is not done while a shortfall is open**, no matter how complete the staged deliveries look.

## How you verify

None of these has a moment that prompts you to look them up. The moment each one applies is the moment you are least likely to go and read it.

**A ticket's goal starts unmet, and only evidence moves it.** Not "does this look right" — "what did I run, and what did it show". Absence of a problem is not evidence; a command whose output you read is.

**Say which of your claims you measured and which you reasoned, every time.** They look identical on the page and only one kind can be wrong in a way that re-reading will never show. An unlabelled mechanism is acted on as measured. *"I read the code and there is no other path"* is not the same evidence as *"I ran it and here is the output"*, and the label costs four words.

**Name what your instrument dropped before you write the sentence.** Every way of looking narrows: a `--json` selector, a diff of two renders, a grep of one column. The narrowing leaves no trace in what comes back — **a dropped field looks exactly like a field that was empty** — so a sentence claiming the whole is a claim about the source, made from the projection.

**The claims most worth opening a file on are the ones that make your own work necessary.** A reason and the decision it justifies arrive together, so checking the reason feels like doubting the decision — which is why a justification reads as settled and is inherited unread. **The false premises found in this repo were all written by the person the claim excused from doing more work.**

**Read the output, which is a different check from reading the code.** Not the code that produces it — the artifact an adopter receives: `emitLint` against a fixture, `blueprint rules`, the playbook, the handbook, the CLI's whole run. **Reading code tells you whether the logic is right; reading output tells you whether it touches anything**, and the two feel identical while you do them. A ban built from the wrong segment is correct code, passes its unit test, raises coverage, and matches no file in the repo it governs.

**And grepping the output is not reading it.** A `grep` answers about the string you already suspected, and the defect is normally the one you did not; a search returning nothing is equally consistent with *unaffected* and with *matched the wrong thing*, while feeling like the first. Print the artifact and read it.

**Render in a throwaway directory.** Some of what you run to see the output writes files — `init` is the obvious one — and run from the repo root it leaves them there.

**A product question is answered on the published site before it is answered here.** *What counts as governed? What is the agent contract for? What does this tool refuse to decide?* — this project publishes its positions, at `docs/philosophy/` and across `docs/guide/`, and an adopter has read them. Deciding one of these fresh in a commit is not deciding, it is forking.

**This is the reactive half of the pair whose standing half is above** — *read what the tool already promises, before the first commit*. They are not the same rule twice. **The one above stops the question forming; this one stops it being answered by you** when it forms anyway, which it will, because no amount of reading up front anticipates every case. Neither replaces the other: skip the standing half and every question costs a stop; skip this one and the questions you did not anticipate get invented answers.

**And reading it is not trusting it** — a page can be stale, several were — so when the site and the code disagree, **that disagreement is a shortfall**: write it down, say which one you believe and why. That applies to both halves equally.

## Repo facts

- Verify with `npm run lint`, `tsc`, `npm test` (100% coverage is the floor), `npm run build`, `npm run dist:verify`, `npm run field:run`, and drive the CLI end to end (`node dist/bin.js init|inspect`) for runtime changes. `.claude/docs/verification-layers.md` says which layer catches what.
- **One worktree per ticket — `git worktree add` plus `npm ci` in it** — and read baselines through `git show <ref>:<path>` rather than off disk. Two sessions over one checkout has put commits on the wrong branch. The install is not skippable: without it the commit gate refuses.
- Every user-visible change ships a changeset.
- `CLAUDE.md` and `.claude/docs/` hold the conventions this repo's own code must not contradict. Read the doc when its trigger fires; do not substitute first-principles reasoning for what it says.
- Commits, comments, PR titles and PR bodies are written in English.
