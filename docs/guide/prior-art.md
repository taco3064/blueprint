# Prior Art — How It Differs

Import-boundary enforcement is well-trodden ground: dependency-cruiser,
eslint-plugin-boundaries, Nx module boundaries, and sheriff all draw lines through your
import graph and fail CI when a line is crossed. They are mature tools — if all you need
is import rules, evaluate them directly. This page states the design difference, not a
scorecard.

## Where blueprint overlaps

On the lint layer, blueprint does the same job those tools do: one-way layer flow,
entry-only module boundaries, package and global ownership — compiled into an ESLint
flat config with an embedded plugin. Running blueprint next to an incumbent structure
linter has been field-tested; see
[Field-Tested Setups](/guide/field-tested#framework-notes).

## Where it differs

The difference is not the lint — it's everything else the **same source** compiles into:

| The same `blueprint.config.mjs` also becomes | Which an import-linter alone does not produce |
| --- | --- |
| A human handbook (`docs/architecture-handbook.md`) | The "why" stays in sync with the rules by construction — it cannot drift |
| Ground rules for AI agents (`CLAUDE.md`, `AGENTS.md`, Cursor, Windsurf…) | The agent holds the rules **before** it places a file, not after lint fails |
| A CI workflow plus read-only `inspect` / `deps` runtimes | Ten finding kinds lint cannot see (undeclared folders, cycles, missing entries…) and a blast-radius query |
| A brownfield authoring flow (`survey` → playbook → baseline ratchet) | Adopting on a legacy repo is a first-class, evidence-driven path — not "turn it on and drown in red" |

The bet behind that design: with AI agents writing a growing share of the code, rules
that live only in lint arrive **after** the file already landed in the wrong place. The
same rules need to sit in the agent's context up front — and that only works if the
contract and the lint can never disagree. One source, translated everywhere, is the
mechanism.

## Honest scope

We have not benchmarked those tools feature by feature, and this page claims no
lint-layer superiority. If your need is purely an import graph with rules, any of the
tools above may serve you well. blueprint earns its place when the handbook, the AI
agent, and CI must stay in lockstep with the rules — because they are the same thing.
