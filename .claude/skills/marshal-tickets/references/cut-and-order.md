## Read the whole parent before you cut

`gh issue view <parent> --json title,body,labels`, and read every word.

Then extract the parent's **claims**: each distinct thing it asserts must become
true. In an RFC-shaped parent these are usually the bolded sentences — each bold
lead is one rule that has to land somewhere. Keep this list; [`close-the-parent.md`](./close-the-parent.md) is nothing
but checking it back.

Read the repo before cutting, too. A parent describes the destination, not the
current shape — which files exist, what a rule is called today, and which module
already owns a concern all change where the seams fall. `CLAUDE.md` and
`.claude/docs/` state the conventions the tickets have to respect.

## Cut at the seams

One sub-issue = **one independently verifiable change in state**. When it lands,
the repo is green and releasable, whether or not any sibling has landed. If a
ticket can only be verified together with another, they are one ticket — or the
dependency is real and belongs in the header ([`cut-and-order.md`](./cut-and-order.md)).

Cut by **capability, not by file**. "Emit the cross-module import bans" is a
ticket; "edit `emit/lint/lint.ts`" is not. A capability names a behaviour an
adopter can observe; a file list is an implementation detail that will be wrong
by the time someone works the ticket.

**Do not size a cut by its line count.** The rule above carries the real
constraint and a line budget is only its shadow, lying in both directions — 229
lines of implementation under 462 lines of test reads as three times over any
budget until someone splits the number, and a budget re-derived before it can be
obeyed is worse than none. A cut that is too big holds two verifiable changes,
and that is visible without counting.

**Unknowns get their own ticket.** When part of the parent is a question nobody
has answered ("what should a modular greenfield scaffold create?"), that is a
`design:` ticket whose Done-when is a decision, not code. Do not bury an open
question inside an implementation ticket — it will be resolved by whoever picks
it up, silently, at 2am.

### Title

Conventional prefix, lowercase, imperative, no ticket-speak:

`feat:` `fix:` `docs:` `test:` `refactor:` `perf:` `design:` — and `!` after
the prefix when the change breaks a published contract (`refactor!:`).

### Body

The shape below is what this repo's own sub-issues look like. Match it.

```markdown
Part of #<parent>. Depends on #a, **#b**, #c — <one line: what those give you
that this ticket's acceptance cannot be reached without>.

<Why this ticket exists, stated against its neighbours: what the adjacent
tickets do and do not cover, so the boundary is explicit. "#185 gives it a
glob; #183 shifts the depth. Neither owns the flow rules, and a glob without
a rule only means the files get counted.">

## <The rules / What changes>

- <each rule, one line, concrete>

## Cases to pin

<a code block of input → expected verdict, exhaustive for the boundary this
ticket draws. These are the tests the implementation side will write.>

## Done when

<One sentence. An observable end state, not a checklist. "A module whose root
imports a layer unit correctly stays green while every upward or
past-the-entry edge is red.">
```

Bold the dependency that is actually load-bearing. Acceptance is written as
something a command shows you — a rule that fires, a verdict that flips, a
fixture that goes red — never as "implemented correctly".

Facts you assert, the implementation side has to live with. Where you are
inferring rather than reading the parent, say so in the ticket.

## Order

Build the dependency graph over the cuts, then flatten it into tiers: a tier is
the set of tickets whose dependencies are all satisfied by earlier tiers, so
everything inside one tier can run in parallel.

Ordering principles, in force when the graph leaves you a choice:

- **Schema and types before their readers.** A field nobody can declare cannot
  be consumed.
- **Readers before emitters.** Resolve the value, then let something print it.
- **Vocabulary changes early.** A rename that reaches the finding ids or the
  message ids gets more expensive with every ticket that lands on the old name.
- **Docs, conformance fixtures, and site alignment last.** They describe what
  exists; run them before the behaviour lands and they describe fiction.
- **Measurement can float**, unless a later decision depends on the number.

Publish the tiers as a **comment on the parent** — a mermaid graph plus the tier
list. Not in the parent's body. The comment is the plan of record; when the
order changes, comment again saying what moved and why, rather than editing the
old comment into a lie.

Then make the order real on GitHub, so the parent's sub-issue list reads top to
bottom in execution order:

```bash
gh api --method PATCH repos/:owner/:repo/issues/<parent>/sub_issues/priority \
  -F sub_issue_id=<db-id> -F after_id=<db-id>
```

## Create

GitHub's native sub-issue API — no `gh` extension needed. `sub_issue_id` is the
issue's **database id**, not its number; passing the number silently attaches
the wrong issue or none.

```bash
# body first, in the scratchpad — never in the repo
url=$(gh issue create --title "feat: …" --body-file "$SCRATCH/ticket.md")
num=${url##*/}
id=$(gh api repos/:owner/:repo/issues/$num --jq .id)
gh api --method POST repos/:owner/:repo/issues/<parent>/sub_issues -F sub_issue_id=$id
```

Create in tier order so the numbers read in roughly the order they are worked,
and so `Depends on #…` headers can reference real numbers — a ticket in tier 2
is created after the tier-1 tickets it names. When a forward reference is
unavoidable, create the ticket, then edit the header once the number exists.

Label from the existing set only (`gh label list`). Do not invent labels.

