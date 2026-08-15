# Verification layers beyond the unit tests

**Trigger:** adding a test for an adoption scenario; touching `bin`, `exports`,
the shebang, the bundle, or anything about how a consumer installs the package.

Each layer exists because the one below it passes on a real defect.

## `test/` — the suites that belong to no layer

`test/` is where test-only source lives, and the boundary is `sourceRoot`:
`architecture.sourceRoot` is *where layers live*, so everything under `src/`
belongs to a layer and ships. Code that ships nothing goes here instead of being
declared as a layer it is not — a declared `conformance` layer would also let
every other layer import it, and folding it into one would put fixture code
inside shipped source. Two suites live here; a co-located `foo.test.ts` beside
its `foo.ts` stays in `src/` as always.

### `test/conformance/` — the adoption conformance suite

Every field-feedback scenario fossilized as an offline fixture repo driven
through the CLI's own dispatch (`run()` in-process, and the real eslint from
this repo's devDeps). When field testing finds a new adoption failure, its
fixture lands here with the fix; field runs should only ever discover *new*
scenarios. Test-only: never exported from the package entry.

`conformance.ts` is in the coverage denominator (`vitest.config.ts` includes
`test/**/*.ts`) and in Stryker's `mutate` list, both deliberately — moving the
tree was a placement decision, and neither measurement was meant to shrink with
it.

### `test/e2e/` — the adoption e2e

Committed starter templates under `fixtures/adoption/` copied to a tmpdir and
driven through the same `runInit` / `runInspect` / `runSurvey` / `runDeps` calls
the CLI makes. It carries
the one standing `blueprint/test-filename-matches-source` suppression: its
subject is the package's own dispatch across nine fixture repos, so a same-named
source sibling does not exist to co-locate it with. The reason is written at the
top of the file, where the rule fires.

## `npm run dist:verify` — the layer in-process tests cannot reach

Checks the bundle, the shebang, the `bin` and `exports` fields, and the
`argv[1]` guard, by executing `dist/bin.js` on throwaway fixtures and importing
the package entry. Runs in CI after `build`.

One check reads the emitted *declarations* rather than running anything: **no
`.d.ts` may carry this repo's own import alias.** `tsc` does not rewrite path
mappings, so an aliased type import inside `src/` lands verbatim in the per-file
declarations and a consumer type-checking against `dist/` gets `TS2307` on a
path only this repo's tsconfig resolves. It reads the alias out of
`blueprint.config.mjs` instead of spelling it twice, and it is the reason that
config's alias is declared and unused — the argument, and the `#`-subpath route
that also fails, are written there.

The guard is why the script exists: npm installs the bin as a symlink, and
comparing `argv[1]` to the entry module without `realpathSync` makes the
published CLI exit 0 having done nothing (the 0.1.1 bug) — **a state every
in-process test passes.** Any change that could only fail after publishing
belongs here.

## A byte baseline, when refactoring emitted prose

Not a standing suite — a throwaway process check, because this repo has no
snapshot tests by design. Before restructuring code that emits a document,
render every conditional combination to files, refactor, render again, and diff.
Earned in one sitting: splitting `authoringBrief` into per-section renderers
silently dropped the template's final newline, so every emitted playbook lost
its trailing blank line, and 1154 green tests did not notice. Only the byte diff
did. Keep the baseline out of the repo — it is scaffolding, not a contract.
