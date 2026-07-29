---
"@kekkai/blueprint": minor
---

Three new gate ids, all riding a caller-injected plugin so the library keeps zero runtime dependencies: `explicitAny` → `@typescript-eslint/no-explicit-any` (the `narrow-interfaces` principle's mechanical half — `any` is the hole that lets illegal states be expressed), `statementsPerLine` → `@stylistic/max-statements-per-line` at a hard-wired `{ max: 1 }`, and `statementPadding` → `@stylistic/padding-line-between-statements` with a fixed 17-entry option list. All three land at `error` in every preset.

`statementsPerLine` is what makes `maxLines` mean anything: that gate counts code lines with blanks and comments skipped, so a line budget with no cap on line *content* is satisfiable by collapsing statements onto one line rather than splitting the file — the evasion an agent under budget pressure reaches for first. Its threshold is deliberately not configurable; the gate's dial is its tier.

`emitLint` grows an `options.stylistic` slot beside the existing `options.typescript`, and the generated config passes both — `init` now installs `@stylistic/eslint-plugin`, and `impact` loads it from the project so its per-rule counts cover the shape gates instead of reporting a silent zero for two active ones. A gate whose carrier plugin is absent emits nothing while lint still passes, so the merge guidance, the gate catalog, and the generated config each state that the options object travels whole. `statementPadding` is the only emitted rule carrying a fixer: the playbook asks for that `--fix` pass as its own commit, and notes it cannot push a file over `maxLines`. On a JavaScript project `explicitAny` drops out of inspect's coverage denominator — `any` is a TypeScript construct, and a gate nobody can open is not a gate.
