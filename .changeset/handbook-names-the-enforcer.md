---
"@kekkai/blueprint": patch
---

**The generated handbook stops promising a gate that does not exist.** Its Rules table printed a tier beside every declared rule under one legend — "`error` fails lint" — which is true of most rows and false of two kinds. `cycles` is `inspect`'s finding and deliberately emits no ESLint line; `deadCode` is documentation-only and asks for knip. A preset declares both at `error`, so a stock handbook told its reader that two rules gate their lint run when neither does.

A field agent caught it by cross-checking against `blueprint rules` and trusted the catalog — at no cost to itself, but it named the real problem: the handbook is the artifact meant to outlive the adoption, read later by people who will not have the catalog open beside it. Two generated artifacts from one source disagreeing is the thing the README claims cannot happen.

The table gains an **Enforced by** column — `lint`, `` `blueprint inspect` ``, or `documentation only` — and the legend now separates the tier (what the enforcing machine does with a violation) from which machine that is. Unknown ids resolve to documentation, matching how the agent contract already treats them.

The classification comes from the catalog rather than a second hand-kept list: `GateSpec` gains an optional `runtime` marker, `cycles` carries it, and `enforcedBy()` derives the three-way answer. Adding a runtime-backed gate needs no edit in the handbook, and a test asserts that correspondence rather than the current membership.
