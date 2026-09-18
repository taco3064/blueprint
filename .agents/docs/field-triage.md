# Candidate field validation and release convergence

**Trigger:** running live Agent validation, triaging a field finding, changing prose an adopting Agent reads, recording convergence, or cutting a release.

## Verification boundary

Conformance tests preserve known adoption regressions. `npm run field:transformation` deterministically replays explicit topology decisions in CI. Neither replaces live Codex and Claude execution, where naming, ownership, placement, and interpretation remain Agent decisions.

After a successful push to `main`, CI installs cleanly, builds, verifies the distribution, and retains one `npm pack` artifact with `candidate.json`. The manifest binds the tarball digest, package version, full main SHA, workflow run, event, and ref. Release field validation consumes that artifact. It never credits a locally rebuilt or dirty working tree as release evidence.

Do not manually repeat lint, typecheck, unit, build, distribution, mutation, or deterministic transformation gates already proven by that exact successful candidate workflow. Live validation adds the Agent boundary and keeps post-Agent Doctor and Inspect because those examine the adopter result, not the Blueprint checkout CI already verified.

`npm run field:run -- --candidate <downloaded-candidate>/candidate.json` treats the supplied manifest only as a locator. It verifies the successful main run, resolves its unique unexpired `blueprint-candidate-<SHA>` artifact, downloads it again, and rejects any manifest or tarball digest mismatch before an Agent runs. It still runs Doctor and Inspect after the Agent. Omitting `--candidate` is local diagnostic mode: the harness may build and pack the checkout for investigation, but that result cannot establish release convergence.

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

Use the [`field-validation`](../skills/field-validation/SKILL.md) skill to select an affected replay or full convergence and the target roles. A successful affected replay writes `pending`, never `success`; a failed replay writes `failure`. It proves a repair only and still owes the final matrix.

After all blocking findings are repaired, run the complete required matrix against one exact candidate. Only that full matrix may write success. Missing scenarios, skipped Agents, missing feedback, red mechanical gates, or an incomplete matrix fail convergence. A later Blueprint commit retains the old historical status but has no field authority of its own.

Prepare a reviewed evidence JSON and record it with:

```sh
npm run field:converge -- record \
  --candidate <downloaded-candidate>/candidate.json \
  --evidence <round-evidence.json> \
  --issue <convergence-ticket-number>
```

The evidence names `candidateSha`, `scope` (`full` or `affected`), `result`, the ticket-authorized `requiredScenarios`, executed `scenarios`, classified `findings` with a reviewed `releaseBlocking` disposition, `repairPrs`, `reportUrl`, and an affected-replay `reason`. The recorder computes matrix completeness from exact non-duplicated set equality and derives the blocker count from findings; callers cannot assert either with a boolean or total. It independently downloads the run's unique exact-SHA artifact and rejects a caller-supplied rebuild before posting the ticket comment and exact-commit status. If either GitHub write fails, the command fails.

## Triage findings

Do not flatten every observation into a release blocker. Agent feedback separates useful behavior, withdrawn suspicions, uncertainty, and actual friction. Existing adopter debt, supported model boundaries, and environment limitations are evidence, not automatically Blueprint defects.

The release-blocking count is a reviewed disposition. Mechanical failure, false green, unsafe mutation, contradictory guidance, or a Blueprint defect that prevents completion blocks. A correctness exception without real adoption cost still deserves repair and evidence but does not silently become a release blocker. Doctor and Inspect must remain visible independent cross-checks; do not hide an unverified subcheck or treat missing matrix evidence as green.

Before changing Agent-facing wording, ask:

1. Can Blueprint compute the fact? If it can, measure it rather than asking prose to predict the repository.
2. Is the wording a registered operational surface? If so, locate it in
   `OPERATIONAL_SURFACES`, change the owning fact source or renderer, and fix
   the complete registered surface class rather than one consumer.
3. Did product semantics also change? Audit the separately authored public-doc
   category against the new behavior when needed. Do not couple website prose,
   philosophy, marketing, or release narrative into the operational contract
   merely to make wording identical.

Graduate reproducible product regressions into `src/conformance/` with the fix. Do not add a product exception solely to make a field control pass.

## Release

### Adopter upgrade assessment

Every release preparation answers one question before the version change merges:

> Does this release require adopter-side semantic work after deterministic upgrade code has done everything Blueprint can safely prove?

- **No** — record nothing. No empty catalog entry, file, or instruction is required.
- **Yes** — first move everything provable into code: a deterministic migration run through `blueprint init`, an existing owner, or `blueprint upgrade` itself. Only the judgment that remains becomes a structured operation in `UPGRADE_CATALOG` (`src/lifecycle/catalog.ts`) with a stable id, `introducedIn` set to the release version, applicability measured from repository facts, verification, and `requires` / `cancels` / `supersedes` relations when an earlier operation changes meaning. Its Agent instruction belongs to the registered `upgrade-instructions` surface.

Published operations are immutable history. Change a shipped instruction by cancelling or superseding it from the new release; a superseding operation must converge both a repository that already ran the older operation and one that never did. Cancellation is not rollback: if the target no longer wants effects an older operation produced, a new active operation owns that cleanup.

Raising `supportedFrom` drops support for older sources and is a release decision, not cleanup. Every deterministic migration must still cover the declared window. An operation introduced at or before the new `supportedFrom` can no longer run for any supported source, so its executable definition and instruction leave the catalog; keep its `id` and `introducedIn` in `retired` so repositories that already completed it keep a readable lifecycle history. An active operation may still `supersedes` a retired one, so its playbook can tell a repository that ran it from one that never did; drop any `requires` / `cancels` reference to it. `catalogProblems` rejects duplicate, malformed, unknown, future, cyclic, unresolvable, and window-incomplete catalogs, and retired operations still inside the window, in the unit suite, and `npm run dist:verify` proves the packed release plans upgrades from its supported checkpoint.

CHANGELOG entries and GitHub releases remain human-facing history. They are never an executable upgrade authority.

### Version, candidate, and tag

Run `npx changeset version`, hoist the release-framing entry above the generated change headings, commit, and merge the version change to `main`. That new commit receives its own packed candidate and must pass the final complete field matrix. Only then create and push the tag.

The tag workflow re-runs lint, typecheck, tests, build, and distribution verification. Before `npm publish`, it queries `blueprint/field-convergence` on the exact tag target and follows its convergence-ticket link. It requires a machine-readable comment proving the same SHA, full scope, complete matrix, success, and zero release blockers. A closed ticket, prior SHA, affected replay, missing status, or stale report cannot publish.

The workflow preserves npm provenance and generates the GitHub Release from the matching changelog section without overwriting an existing hand-written release.
