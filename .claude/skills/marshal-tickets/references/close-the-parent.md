## Does the sum reach the parent?

Run this twice: once after the cut, before anyone starts, and once before the
parent closes.

Take the claim list from [`cut-and-order.md`](./cut-and-order.md) and map each claim to the ticket that makes it
true. Post it on the parent as a comment: one bold claim per entry, with its
ticket and state on the lines beneath. Not a markdown table — an issue comment
is read on a phone as often as not, and three columns wrap there into something
nobody can follow. Then:

- **A claim with no ticket** is a missing cut. File it.
- **A claim covered "partly"** is a claim you have not actually mapped. Split it
  into the parts and map each.
- **A ticket serving no claim** is one of two things, and calling it the wrong
  one wastes the owner's answer. Either it is **scope you added** — say so and ask
  whether it stays — or it is **a defect this work exposed**, which is what a tier
  spent refining mostly produces: the parent asked for a capability, building it
  meant using the tool, and using it surfaced something already broken. Those are
  not scope creep and must not be pruned as though they were. Say which, and for
  a defect say whether it predates the parent, because that decides whether it is
  a sub-issue at all ([`run-a-tier.md`](./run-a-tier.md)'s gap loop, exit 2).

The parent closes when every claim maps to a closed ticket. Not when the
sub-issue counter hits 100% — the counter proves the tickets closed, not that
they covered the parent.

### Before it closes, readers who were not here check it

You cut these tickets and you verified them, which makes you the worst available
reader of whether they hold — and a second session that has been in the
decomposition with you is the second-worst. **Two readers are not two checks; they
converge on the same resemblance.**

So before the parent closes, **you** spawn agents that were not part of this and
cannot write. The freshness is a property of the readers, not of who dispatches
them — this pass does not wait for anybody else to run it:

- **Fresh context, latest `main`, read-only.** A reader that can edit starts
  explaining instead of reporting.
- **One agent per dimension**, split by the kind of claim — emitted artifacts
  against the documents describing them, the parent's claims against the code,
  acceptance against what a command shows. A single reviewer given everything
  returns the shape of its own attention.
- **Every finding comes back, with a file, a line and the commit.** Not a ranked
  top-N: the finding dropped because two others outrank it is the one the next
  reader rediscovers. Without an address it is an opinion.
- **Findings are unverified reports until you reopen the file.** One that does not
  hold is dropped *and said to be dropped* — and the dropping is where your own
  convergence can hide, since generating findings freshly does not make the
  verdict on them fresh. Report which dimensions were spawned, what came back,
  and what you dropped with the reason. That list is the part worth exposing.

### Then decide what the process keeps

A retrospective that only adds rules produces a document nobody reads, and every
rule in it becomes decoration. So the pass that adds also **merges and deletes**,
measured rather than sensed — this skill nearly doubled in a day, and the section
that grew most was not the one that mattered most.

**What goes and what stays has a test.** A rule keeps its statement and its
reason: a rule without a reason gets shortcut, which is why the reasons are here
at all. What it does not keep is the incident that produced it — that belongs in
the commit that added the rule, by this repo's own policy that history goes to
the commit. A skill carrying its own changelog is a skill nobody finishes.

Three questions, and the last is the one that gets skipped:

- **Which assumption did this parent overturn?** Something in it was wrong when
  written; name it, or the next decomposition inherits it.
- **Which gap should have been caught earlier, and by what?** The answer is
  sometimes "nothing available would have", which is worth writing down too.
- **Which rules here are now duplicated, superseded, or unread?** A rule restated
  in a doc that owns it is two sources of truth for one requirement. Cut the copy,
  keep the pointer.

## Repo facts
