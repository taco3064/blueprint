# Verification layers beyond the unit tests

**Trigger:** adding a test for an adoption scenario; touching `bin`, `exports`,
the shebang, the bundle, or anything about how a consumer installs the package.

Each layer exists because the one below it passes on a real defect.

## `src/conformance/` — the adoption conformance suite

Every field-feedback scenario fossilized as an offline fixture repo driven
through the CLI's own dispatch (`run()` in-process, and the real eslint from
this repo's devDeps). When field testing finds a new adoption failure, its
fixture lands here with the fix; field runs should only ever discover *new*
scenarios. Test-only: never exported from the package entry.

## `npm run field:transformation` — deterministic topology execution

This replay creates fresh temporary Git repositories and executes both topology
playbooks using explicit, reviewed semantic decisions. It proves tracked moves,
import/config cutover, source manifests, baseline fail-closed behavior, generated
artifacts, adopter gates, and the semantic layer-first → module-first → layer-first
round trip. It is not a production transformer and does not replace the live harness:
collision naming, router classification, and layer placement remain Agent judgments.
PR CI runs this replay alongside other deterministic jobs when the candidate can affect topology behavior. It verifies the frozen integration candidate and is not live field evidence.

## `npm run dist:verify` — the layer in-process tests cannot reach

Checks the bundle, the shebang, the `bin` and `exports` fields, and the
`argv[1]` guard, by executing `dist/bin.js` on throwaway fixtures and importing
the package entry. Runs in CI after `build`.

The guard is why it exists: npm installs the bin as a symlink, and comparing
`argv[1]` to the entry module without `realpathSync` makes the published CLI
exit 0 having done nothing (the 0.1.1 bug) — **a state every in-process test
passes.** Any change that could only fail after publishing belongs here.

## Live field convergence — the Agent boundary

After deterministic main CI passes, CI builds and retains one `npm pack` artifact bound to the full main SHA. Live Codex and Claude validation consumes that artifact; it does not rebuild an arbitrary checkout. Doctor and Inspect still run after the Agent as independent cross-checks.

Affected replay may prove a repair, but only one complete required matrix against one exact candidate can write successful `blueprint/field-convergence` evidence. A later commit has no inherited authority.

## A byte baseline, when refactoring emitted prose

Not a standing suite — a throwaway process check, because this repo has no
snapshot tests by design. Before restructuring code that emits a document,
render every conditional combination to files, refactor, render again, and diff.
Earned in one sitting: splitting `authoringBrief` into per-section renderers
silently dropped the template's final newline, so every emitted playbook lost
its trailing blank line, and 1154 green tests did not notice. Only the byte diff
did. Keep the baseline out of the repo — it is scaffolding, not a contract.
