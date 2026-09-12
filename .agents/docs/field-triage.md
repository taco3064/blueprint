# Candidate field validation and release convergence

**Trigger:** running live Agent validation, triaging a field finding, changing prose an adopting Agent reads, recording convergence, or cutting a release.

## Verification boundary

Conformance tests preserve known adoption regressions. `npm run field:transformation` deterministically replays explicit topology decisions in CI. Neither replaces live Codex and Claude execution, where naming, ownership, placement, and interpretation remain Agent decisions.

After a successful push to `main`, CI installs cleanly, builds, verifies the distribution, and retains one `npm pack` artifact with `candidate.json`. The manifest binds the tarball digest, package version, full main SHA, workflow run, event, and ref. Release field validation consumes that artifact. It never credits a locally rebuilt or dirty working tree as release evidence.

Do not manually repeat lint, typecheck, unit, build, distribution, mutation, or deterministic transformation gates already proven by that exact successful candidate workflow. Live validation adds the Agent boundary and keeps post-Agent Doctor and Inspect because those examine the adopter result, not the Blueprint checkout CI already verified.

`npm run field:run -- --candidate <downloaded-candidate>/candidate.json` uses the exact artifact and still runs Doctor and Inspect after the Agent. Omitting `--candidate` is local diagnostic mode: the harness may build and pack the checkout for investigation, but that result cannot establish release convergence.

The cross-Agent release matrix may use the harness or an explicitly defined manual matrix such as #452. Each Agent receives an independent disposable target checkout with the same candidate pre-installed. Preserve the required target pins, roles, positive and negative controls, native gates, adoption diff, and result classification.

## One convergence ledger

One release cycle uses one field-convergence ticket. Every round records:

- candidate full SHA, version, digest, and candidate workflow;
- scenarios and Agents executed;
- findings and their release-blocking disposition;
- repair pull requests;
- whether the run is an affected replay or the complete matrix;
- a durable report link.

The ticket is linked evidence. The machine authority is the dedicated `blueprint/field-convergence` commit status on the exact candidate SHA.

Use an affected replay only when the repaired blast radius is explicitly reviewable. Shared Agent-facing guidance, adoption workflow, and other changes whose effect cannot be narrowed require broader replay. A successful affected replay writes `pending`, never `success`; a failed replay writes `failure`. It proves a repair only and still owes the final matrix.

After all blocking findings are repaired, run the complete required matrix against one exact candidate. Only that full matrix may write success. Missing scenarios, skipped Agents, missing feedback, red mechanical gates, or an incomplete matrix fail convergence. A later Blueprint commit retains the old historical status but has no field authority of its own.

Prepare a reviewed evidence JSON and record it with:

```sh
npm run field:converge -- record \
  --candidate <downloaded-candidate>/candidate.json \
  --evidence <round-evidence.json> \
  --issue <convergence-ticket-number>
```

The evidence names `candidateSha`, `scope` (`full` or `affected`), `result`, the ticket-authorized `requiredScenarios`, executed `scenarios`, classified `findings` with a reviewed `releaseBlocking` disposition, `repairPrs`, `reportUrl`, and an affected-replay `reason`. The recorder computes matrix completeness from exact non-duplicated set equality and derives the blocker count from findings; callers cannot assert either with a boolean or total. It re-verifies the tarball and the successful completed main-push workflow before posting the ticket comment and exact-commit status. If either GitHub write fails, the command fails.

## Triage findings

Do not flatten every observation into a release blocker. Agent feedback separates useful behavior, withdrawn suspicions, uncertainty, and actual friction. Existing adopter debt, supported model boundaries, and environment limitations are evidence, not automatically Blueprint defects.

The release-blocking count is a reviewed disposition. Mechanical failure, false green, unsafe mutation, contradictory guidance, or a Blueprint defect that prevents completion blocks. A correctness exception without real adoption cost still deserves repair and evidence but does not silently become a release blocker. Doctor and Inspect must remain visible independent cross-checks; do not hide an unverified subcheck or treat missing matrix evidence as green.

Before changing Agent-facing wording, ask:

1. Can Blueprint compute the fact? If it can, measure it rather than asking prose to predict the repository.
2. How many other instances exist? Fix the class and align every generated, CLI, and published surface instead of patching one paragraph.

Graduate reproducible product regressions into `src/conformance/` with the fix. Do not add a product exception solely to make a field control pass.

## Release

Run `npx changeset version`, hoist the release-framing entry above the generated change headings, commit, and merge the version change to `main`. That new commit receives its own packed candidate and must pass the final complete field matrix. Only then create and push the tag.

The tag workflow re-runs lint, typecheck, tests, build, and distribution verification. Before `npm publish`, it queries `blueprint/field-convergence` on the exact tag target and follows its convergence-ticket link. It requires a machine-readable comment proving the same SHA, full scope, complete matrix, success, and zero release blockers. A closed ticket, prior SHA, affected replay, missing status, or stale report cannot publish.

The workflow preserves npm provenance and generates the GitHub Release from the matching changelog section without overwriting an existing hand-written release.
