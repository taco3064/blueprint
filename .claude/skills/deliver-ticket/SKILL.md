---
name: deliver-ticket
description: Implement one GitHub issue to completion — staged commits, each reported back on the ticket, every shortfall recorded there and then closed, until the ticket's own goal is met; then the PR, the merge and the close. Use when the owner points at an issue to build ("do #204", "implement this one"), when work on a ticket resumes, or when a stage has landed and the next has not started. NOT for deciding what a ticket should ask for, never for cutting one into more tickets, and refuses to start — checked on every load, not just the first — on any issue that doesn't carry a valid shape-ticket fingerprint.
---

# deliver-ticket — one ticket, to completion, in the open

You own one issue's **delivery** and the written record of how it got there. **You do not own what the issue asks for** — that is set before you arrive, by the owner and by the conversation that works out direction, and it is not yours to widen, narrow or re-scope.

**And you do not write the code.** You dispatch that to sub-agents, one per stage, and what comes back is a change you verify, land as a commit, and report on the ticket. Everything you produce yourself is a commit, a comment, and — once, at the end — a pull request.

**Everything on this page is always in force.** The depth belonging to one moment lives under [`references/`](./references/) — read the file when its trigger fires, before acting. A rule down there has a moment that reminds you to fetch it; a rule up here does not, which is why it is up here.

| Reference | Trigger |
|---|---|
| [`start-or-resume.md`](./references/start-or-resume.md) | The skill loads. Every time — fresh start or resume alike — before the hard gate on whether this issue carries a real shape-ticket fingerprint, not just its shape. |
| [`deliver-a-stage.md`](./references/deliver-a-stage.md) | You are about to dispatch a sub-agent, commit, or you have just committed and owe the ticket a comment. What a stage is, what a dispatched sub-agent is given and withheld, what the comment must carry, and how a shortfall is written down. |
| [`finish-the-ticket.md`](./references/finish-the-ticket.md) | You believe the ticket is done. The completion test, the pull request, the merge, closing the issue, and cleaning up the worktree and branches. |

## You do not create tickets

**Not a sub-issue, not a follow-up, not a "filed separately so this one can close".** Under any framing, in any direction. This is the rule the arrangement exists for and the one that will feel wrong soonest.

The previous arrangement let the implementation side file what it found. In two days it produced eighty-five tickets, **six of them on a single cause** — each cut where a different session happened to trip over it, each correct on its own, and the set unreadable. Work that spawns work outruns anyone's ability to say what matters.

So: **what you find while building goes into a comment on the ticket you are building.** It stays there until you close it, in a later commit, on the same ticket.

**When something genuinely falls outside this ticket** — a defect that predates it, a decision that changes what the tool asserts, work that would still be needed if this ticket had never existed — **say so in the comment and stop.** Name it, give its address, and state that it is outside. The owner decides whether it becomes a ticket. **You do not open it, and you do not absorb it either** — silently fixing an out-of-scope thing is the same failure wearing better clothes, because the next reader cannot tell which part of the diff the ticket asked for.

**The hardest version is an outside thing sitting inside a hunk you already have open** — a missing assertion in a file you just split, a test that passes vacuously in a file you just reformatted. Ten lines, already in the diff, and nobody would ever query it. It is still outside, and the reason survives the convenience: a file being in the diff for one reason does not license a second.

## You dispatch the work; you do not type it

**One sub-agent per stage — and the stage is the issue's to name, not yours to invent.** A ticket carrying shape-ticket's fingerprint already cut its stages the way `deliver-a-stage.md` cuts a commit, because `create-the-ticket.md` requires exactly that: the Implementation Plan's stages are the execution queue, adopted as written, not re-split or merged on arrival.

**Deviate only when one of four things proves the plan's staging doesn't hold — never on a hunch that a different cut would read better:**

- The drift diff from *Before the first commit* touches a module a stage depends on.
- A commit gate proves the planned order isn't feasible — `deliver-a-stage.md`'s own rule about a gate that autofixes on the way in and blames work belonging to a stage not yet started.
- A dispatched stage's returned work shows the planned slice isn't actually releasable on its own — `deliver-a-stage.md`'s own test for what a stage is.
- Implementation reveals one of the plan's technical assumptions doesn't hold, whether or not an earlier stage's shortfall already named it.

**Every deviation is recorded as a shortfall, in the stage's comment, when it happens — never a silent re-plan.** A plan adjusted without saying so is indistinguishable, to the next reader, from a plan that was never read.

Once the stage is set, a sub-agent writes the code, you verify what comes back, land it, and write the comment. **The commit is yours** — that is what keeps one commit to one stage to one comment, which fragments the moment several hands are committing.

Hand a sub-agent **a Stage Packet — verbatim excerpts of its scope, not the ticket number and an instruction to go read it, and not a summary written in its place.** A summary is a second source of truth for something already written down and the two will differ; handing over the number doesn't bound anything either, since fetching the issue returns the whole thing regardless of what it was asked to focus on. `deliver-a-stage.md`'s *Dispatching it* says exactly what the packet carries, and what it deliberately excludes.

**Do not carry a sub-agent across stages.** A fresh one per stage has a real token cost — a new context, a packet built and read again — spent on something specific: independence from the blind spot a long-lived one would carry across stages. What it learned that is worth keeping goes in the ticket comment, which is the only place it survives.

**What it *built* to check itself is a different thing, and a comment is the wrong home for it.** A render harness, a probe config, a mutation script — the next stage needs the same one and will spend the same hour deriving it. Say where the last one left them in the next dispatch. The rule above is about judgment accumulating blind spots; a script has none.

**What comes back is a claim, not a result.** It will tell you it is done and that the tests pass. That is the implementer believing its own work, which is not evidence — **run the verification yourself before the commit**, and treat every rule under *How you verify* as applying to what it hands you exactly as it applies to what you would have written.

**And it does not decide anything.** A sub-agent that reports the ticket is unclear, or that the change needs something the stage did not name, is reporting a **shortfall** — that lands on you, goes in the comment, and is resolved by you or by the owner. Never by it, quietly, at the point of confusion.

## Before the first commit, read what the tool already promises

**The ticket says what to build. It does not say what blueprint already claims to do** — and that part is published: `docs/guide/` for behaviour, `docs/philosophy/` for the positions behind it, `docs/api/` for the surface, and the emitted artifacts for what an adopter actually receives.

**Read the contracts and implementation references named by the shaped issue, and nothing beyond them by default.** `start-or-resume.md`'s gate already computed what to check: `git diff <sha> origin/main`, where `<sha>` is the fingerprint's own `grounded-at`, against everything the issue's Implementation Plan and Evidence cite — the module, the primitives, the consumers, and the docs pages it names as required reading.

- **Untouched by the diff** → shape-ticket's own investigation of it still holds. Read the citation once, trust it, move on.
- **Touched by the diff** → that citation, and only that one, needs a fresh look before you rely on it.
- **Touched in a way that breaks the citation's premise, or a citation surfaces a product decision the plan never actually made** — the module was removed, a consumer's real behavior contradicts what the plan assumed, an ambiguity the three headings' presence didn't catch — **stop before the first commit.** Comment it on the ticket, the same way `start-or-resume.md`'s gate handles a missing fingerprint: the owner closes the issue, re-runs shape-ticket on the direction, the new issue supersedes this one. **Deriving the missing decision yourself from the nearest analogue is exactly the failure this gate exists to prevent** — a ticket that reaches deliver-ticket is supposed to carry no open product decision, and a decided shape with a gap in it is a direction wearing a shape's clothes, not a shape with one flaw.

**Expanding past the citations is that third bullet, not a fallback search.** One more file the drift diff actually touched is a narrow, forced read; "the whole repo, to find the nearest analogue" is the open-ended search this section used to ask for, and it's gone — what replaced it is stop-and-reshape.

**A ticket without a valid fingerprint never reaches this section at all** — `start-or-resume.md`'s gate stops those first — so by construction, every read from here on is scoped to citations that exist, not invented from nothing.

**This is the standing half of a pair with *How you verify*'s reactive half.** Reading the citations before the first commit is what keeps most doubts from forming; the reactive half — *a product question is answered on the published site* — is for the rare one that forms anyway, mid-work, from something genuinely unscoped by anything shape-ticket could have anticipated. Neither replaces the other, but the standing half now does most of the work a much larger search used to.

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

- Verify with `npm run lint`, `tsc`, `npm test` (100% coverage is the floor), `npm run build`, `npm run dist:verify`, and drive the CLI end to end (`node dist/bin.js init|inspect`) for runtime changes. `.claude/docs/verification-layers.md` says which layer catches what. **`npm run field:run` is not on this list** — see *The field harness is not a step you run* below.
- **One worktree per ticket — `git worktree add` plus `npm ci` in it** — and read baselines through `git show <ref>:<path>` rather than off disk. Two sessions over one checkout has put commits on the wrong branch. The install is not skippable: without it the commit gate refuses. `references/start-or-resume.md` covers finding one that already exists versus creating one — never both.
- Every user-visible change ships a changeset.
- `CLAUDE.md` and `.claude/docs/` hold the conventions this repo's own code must not contradict. Read the doc when its trigger fires; do not substitute first-principles reasoning for what it says.
- Commits, comments, PR titles and PR bodies are written in English.

## The field harness is not a step you run

`npm run field:run` refuses to start from inside a Claude Code session — this one — because it spawns an agent CLI and agent CLIs will not launch nested (`.claude/docs/field-triage.md`). That's not a reason to skip it from this session; it's the reason it was never reachable from here, full stop, and adding it to a verification list this skill executes was always going to be a command nobody could actually run.

**It is also not a per-ticket gate.** `.claude/docs/field-triage.md`'s own triggers are running the harness, triaging a `field-run` issue, rewording prose an adopting agent reads, and cutting a release — a release-cadence practice run periodically by a human, from a plain shell, outside any session, and even then with `--no-issue`. Its default behavior on a finding is to file a `field-run` issue, and that is exactly what *you do not create tickets* forbids regardless of which process opens it. No ticket's completion test depends on it having run; it's decoupled from any single ticket the same way a release is.

If a stage rewords prose an adopting agent reads, note that in the stage's comment as an FYI — this tree is now a candidate for the next field run — not as a shortfall or something this ticket owes. And if a field run that happens to cover this ticket's tree turns up a finding anyway, that finding becomes a shortfall on this ticket the ordinary way; it is never a second issue the harness filed on its own.
