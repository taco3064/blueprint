# Finishing

**Trigger:** you believe the ticket is done.

## The completion test, in this order

**1. Every staged delivery has landed**, and each has a comment on the ticket carrying its commit.

**2. No shortfall is open.** Not "none that matter" — none. The ones ruled outside the ticket by the owner are the only exception, and each has a comment saying the owner ruled it so.

**3. The ticket's own goal is met, checked against the ticket rather than against your memory of it.** Re-read the issue body now, at the end. Take each thing it asks for and name the commit that makes it true. **This is the step that catches a ticket delivered faithfully in every part except the one nobody re-read** — you have been inside this for hours and the body has been quietly reinterpreted by every decision since.

Where the body is ambiguous, say in the closing comment how you read it. **Do not resolve an ambiguity by picking the reading your work already satisfies.**

**4. Nothing in the diff is unasked-for.** Walk the whole change. Anything the ticket did not ask for is either a shortfall you should have named, or scope you added — and both are said out loud before merging, not discovered afterwards.

If any of the four fails, **you are not finishing, you are on another stage.** Go back.

## The pull request

One per ticket. Open it after the completion test, not before.

- **Title**: conventional prefix, lowercase, imperative — `feat:` `fix:` `docs:` `test:` `refactor:` `perf:`, and `!` when a published contract breaks.
- **Body**: what the ticket asked for and what makes it true; how it was verified, with the commands and their output; and, if the diff contains anything the ticket did not literally ask for, an **Out-of-scope changes & rationale** section naming each one and why it is there.
- **Do not restate the comment stream.** The ticket has it. The PR body is for a reader who arrives at the diff.

**Wait for CI.** All required checks green before merging — the four contexts `main` requires. A red check is a shortfall, and shortfalls do not merge.

## Merging, and closing

Merge your own PR once CI is green. Then close the ticket with a final comment carrying:

- **The four completion-test answers**, stated rather than implied. Especially the third: which commit satisfies which part of the goal.
- **What the ticket taught that its body did not know** — an assumption that turned out false, a case the goal did not name, an approach abandoned and why. **This is the part that is worth reading a year from now**, and it exists nowhere else once this session ends.
- **Anything named as outside the ticket**, restated in one list so the owner does not have to walk the comment stream to recover it. **You still do not file it.**

## What does not happen here

**No new tickets.** Not for the outside-scope list, not for a follow-up, not for "the obvious next step". That list is the owner's input, not your output.

**No estimate of what is left.** If something is left, the ticket is not finished.

**No closing on a green counter.** A passing suite proves the tests pass. The completion test above is what proves the ticket is done, and only the third and fourth steps of it read the ticket at all.
