# Test-strength gate

**Trigger:** production code changed; a mutation smoke report needs reading; a
survivor needs judging; or a property/metamorphic contract is being added.

Coverage proves that code ran. This gate asks the complementary question:
would the tests reject a representative semantic fault in the code that just
changed? It has three layers:

1. examples pin known cases;
2. property and metamorphic tests exercise invariants over generated inputs;
3. changed-code mutation smoke verifies that those assertions reject wrong logic.

## Changed-code mutation smoke

Do not run a whole-repository Stryker sweep during normal delivery. On the
current tree that means 13,732 generated mutants, including 3,114 static mutants
that repeatedly execute the full suite. The monolithic run is too slow to be a
reliable delivery primitive and its completion time discourages use.

Run the smoke against the PR base instead:

```sh
npm run mutation:smoke -- --base origin/main
```

The runner computes the merge base, reads zero-context Git hunks, and passes
only added or modified production TypeScript line ranges to Stryker. Test files,
deleted lines, docs, and unchanged source are not mutation targets. It keeps
Stryker's configured operators rather than implementing a second mutation
engine.

The default budget is 200 changed production lines and 15 minutes. Exceeding
either is a refusal, not a partial pass. A broad change must be split or receive
an explicit reviewed override:

```sh
npm run mutation:smoke -- --base origin/main --max-changed-lines 350 --timeout-ms 1200000
```

The manual `Mutation smoke` workflow offers the same command on a stable
executor, but is never triggered automatically. Do not dispatch it when the
ticket requires remote-only execution.

## File-backed evidence

Terminal scrollback is not evidence. Every run writes under
`reports/mutation-smoke/` (ignored by Git):

| File | Meaning |
| --- | --- |
| `scope.json` | base, merge base, changed lines, exact Stryker ranges |
| `mutation.json` | Stryker's machine-readable mutant report |
| `summary.json` | pass, fail, refusal, or skip verdict and status counts |
| `run.log` | complete Stryker output |

Read `summary.json` and `scope.json` after the process returns. A run passes only
when every reported mutant is `Killed` or explicitly `Ignored`. `Survived`,
`NoCoverage`, `Timeout`, compile/runtime errors, a missing report, or termination
all fail the smoke. No changed production lines is an explicit skip rather than
a fabricated score. Changed lines that generate zero runtime mutants (for
example, type-only syntax) are also reported as `skipped: no-mutants-generated`,
never as a 0/0 pass.

## Property and metamorphic contracts

Use `fast-check` when a rule should hold over a domain rather than for one hand
selected fixture. Keep generators bounded, valid for the domain, deterministic
under fast-check's reported seed, and small enough for the ordinary test suite.

A metamorphic test applies a meaning-preserving transformation and compares the
observable result. High-value Blueprint relations include:

- ordering input evidence must not change a sorted plan;
- repeating the same observation must not create a new collision or action;
- adding unrelated input must not alter existing findings;
- a second init must be byte-identical;
- dry-run and every rejected preflight must leave the filesystem byte-identical;
- topology round trips must preserve the semantic graph, even when paths move.

Do not add random examples that merely restate implementation details. State the
invariant in the test name and compare public evidence or filesystem state.

## Judging survivors

A survivor is a question, not automatically a defect. Read its operator,
location, replacement, and the assertions that should observe it.

- If behavior changed observably, strengthen the narrowest relevant test.
- If the mutant is truly equivalent, record the proof at the source site:

```ts
// Stryker disable next-line EqualityOperator: both branches return the same public value
```

Name the exact mutator, never `all`. A broad directive hides mutations nobody
has judged. The directive is part of the source-level ledger and will appear as
`Ignored` in later reports.

`StringLiteral` remains excluded repo-wide for the measured reason documented
in `stryker.config.json`: most survivors are prose, while discrete literal
contracts are asserted directly. Re-enable it deliberately when that boundary
needs re-audit.

## Scope and authority

The smoke is authoritative only for changed production lines on the recorded
merge base. It intentionally makes no claim about unchanged legacy code. A
full-tree Stryker survey may still be commissioned as a separate, long-running
audit, but it is not a PR gate, not a routine release prerequisite, and cannot
be substituted silently for the smoke's recorded scope.
