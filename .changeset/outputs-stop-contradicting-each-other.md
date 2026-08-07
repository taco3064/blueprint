---
"@kekkai/blueprint": patch
---

**Four places where two of the tool's own outputs answered the same question differently.**
Each pair was individually plausible, which is why they survived: the reader only finds out
by putting the two side by side, and then has no way to tell which one to act on.

**The handbook's `selfOnly` rule against its own diagram legend.** The legend says a
**solid** edge is a declared importer relation whose label carries `selfOnly`, and a
**dotted** edge only records declaration order. The import-discipline bullet twelve lines
down said "a *dashed* edge may be depended on but never re-exported onward" — pointing a
reader at the edges the legend defines as *not* dependencies, while the genuinely
constrained solid edge reads as ordinary. The bullet states the rule now and leaves the
notation to the legend.

**`blueprint rules` against `doctor`'s survival check, about what that check compares.**
`rules` closed its per-layer block with "Everything below is what doctor compares" — over a
block that prints a `packages:` column, while doctor's ✓ says package-ownership entries are
not compared. Someone folding blueprint's entries into a house config reads `rules`, and
skips the `--print-config` pass precisely *because* doctor cannot see that column, so a
merge that drops a package ban stays green. `rules` names its own columns now: `no-import`,
`globals` and the selfOnly selectors are compared, `packages` is not, and it says to verify
that one with `npx eslint --print-config`. **`rules --json` carries the same sentence** on
each ban entry that has a `packages` column (`bans[i].packagesNote`) — the playbook sends a
merging agent to `--json` in five places, so that is the channel it matters most in.

**The agent contract against the handbook, about `cycles`.** One said lint holds it, the
other `blueprint inspect`. It is `inspect` — a green lint says nothing about cycles — and
both say so.

**`blueprint rules` against `inspect`, about how many optional gates exist.** They counted
differently on a stack that cannot open one of them, with neither naming the discrepancy,
so `0/17` from one output sat beside eighteen rows from the other. One count now, and the
row that is excluded says why.

The pattern under all four: a boundary described in two places drifts. The rule that came
out of it — the scope stays with the check that owns it, every other output names its own
parts rather than restating the boundary, and where a fact must reach two channels they
share one string rather than two copies.
