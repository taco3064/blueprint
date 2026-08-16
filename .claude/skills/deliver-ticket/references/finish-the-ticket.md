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
- **One per dimension of what this ticket changed** — the emitted artifact, the CLI's output, the docs pages it touches, the tests it added. A single reviewer given everything returns the shape of its own attention.
- **Tell each one to run or render rather than read.** Every defect worth finding here has been found that way and none was reachable by reading source.
- **Every finding comes back with a file, a line, and a command.** Without an address it is an opinion.
- **Ask for the clean list too.** A dimension checked and found sound is a result, and its absence is how "nothing found" hides "nothing looked at".

**Their findings are unverified reports until you reopen the file yourself.** One that does not hold is dropped **and said in the closing comment to have been dropped, with the reason** — that is where your own convergence hides, since generating findings freshly does not make your verdict on them fresh.

**And when a finding will not reproduce, suspect your reproduction before you suspect the finding.** A reader who ran the real thing and a dispatcher who rebuilt an approximation of it disagree for two reasons, and the approximation is the likelier one — a fixture missing the very property the finding was about looks exactly like a finding that was wrong. Check that yours carries it before you write *dropped*.

**Anything that survives is a shortfall.** Which means step 2 now fails, and you are back in the loop rather than finishing. That is the mechanism working, not a setback.

If any of the five fails, **you are not finishing, you are on another stage.** Go back.

## The pull request

One per ticket. Open it after the completion test, not before.

- **Title**: conventional prefix, lowercase, imperative — `feat:` `fix:` `docs:` `test:` `refactor:` `perf:`, and `!` when a published contract breaks.
- **Body**: what the ticket asked for and what makes it true; how it was verified, with the commands and their output; and, if the diff contains anything the ticket did not literally ask for, an **Out-of-scope changes & rationale** section naming each one and why it is there.
- **Do not restate the comment stream.** The ticket has it. The PR body is for a reader who arrives at the diff.

**Wait for CI.** All required checks green before merging — the four contexts `main` requires. A red check is a shortfall, and shortfalls do not merge.

## Merging, and closing

Merge your own PR once CI is green.

**Then check that what landed is what you tested.** A squash or a rebase rewrites the commits, and a base branch that moved while CI was green produces a tree nothing was ever run against. Compare the merged tree against the one your last verification ran on — if they differ, you are verifying again, not finishing.

Then close the ticket with a final comment carrying:

- **The five completion-test answers**, stated rather than implied. Especially the third — which commit satisfies which part of the goal — and the fifth: which dimensions were read by fresh readers, what they found, and what you dropped with the reason.
- **What the ticket taught that its body did not know** — an assumption that turned out false, a case the goal did not name, an approach abandoned and why. **This is the part that is worth reading a year from now**, and it exists nowhere else once this session ends.
- **Anything named as outside the ticket**, restated in one list so the owner does not have to walk the comment stream to recover it. **You still do not file it.**

## What does not happen here

**No new tickets.** Not for the outside-scope list, not for a follow-up, not for "the obvious next step". That list is the owner's input, not your output.

**No estimate of what is left.** If something is left, the ticket is not finished.

**No closing on a green counter.** A passing suite proves the tests pass. The completion test above is what proves the ticket is done, and only the third and fourth steps of it read the ticket at all.
