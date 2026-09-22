---
name: deliver-ticket
description: Implement one GitHub issue through an independently accepted, CI-verified pull request ready for Shaper review. Use when the owner asks to build, continue, repair, or finish a ticket without routine supervision.
---

# Deliver one ticket autonomously

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns implementation, integration, verification, and pull-request handoff.

The issue defines the outcome. The repository defines technical reality. Preserve the outcome and adapt implementation details when current code disproves the proposed route.

## Start or resume

1. Fetch the remote; read the issue, repository guidance, related history, branches, worktrees, and pull requests.
2. Reuse an existing ticket branch or pull request. Otherwise branch from current `origin/main` with the ticket number in the branch name.
3. In every fresh or untrusted remote checkout, run `npm ci` before relying on repository-local tools or Husky.
4. Confirm the checked-out base and inspect `git status`; preserve unrelated work.
5. Compare the issue with current code. Missing implementation detail is not a blocker. Apply the shared decide/ask rule if an essential product decision is missing.

## Plan and execute

Create a short working plan from acceptance criteria and dependency order. A step ends in an observable result; it does not require its own reviewer, agent, commit, or issue comment.

Use sub-agents when bounded investigation or implementation can safely run independently. Give them relevant paths and one outcome. The orchestrator integrates and verifies the complete tree.

For each step:

1. inspect the owning code and tests;
2. make the smallest coherent change that advances the outcome;
3. run focused checks;
4. inspect failures and generated output, then fix within the shared scope rule;
5. continue directly to the next step.

Keep the work uncommitted until the assembled candidate is accepted. When a long-running dependency must be handed off before that, hand off the recorded candidate tree under the shared durable-state rule, not a commit. Do not wait for confirmation after ordinary progress. Do not post one issue comment per step.

When a remote job will outlive the useful interactive work, follow the shared long-running-work policy. Continue independent steps first; when its result becomes the next dependency, leave a self-contained resume prompt and end the turn. Do not poll merely to keep the turn alive.

## Prepare changed production behavior for mutation testing

Before acceptance, audit only production code changed from the candidate base. Start from the production hunks in `git diff <base>`; do not expand this into a repository-wide mutation review. For every changed predicate, branch, return, collection boundary, fallback, and side-effect block, ask: **if this were replaced by the nearest plausible wrong implementation, which test would fail?**

Mentally exercise at least these mutation directions where the changed line permits them:

- `===` / `!==`;
- `>` / `>=` and `<` / `<=`;
- `&&` / `||`;
- `true` / `false`;
- `+` / `-`;
- return-value replacement;
- conditional removal;
- block removal;
- optional or fallback replacement/removal;
- array and string boundary changes.

Each changed behavior needs distinguishing evidence for all applicable sides:

- a positive case proves the intended action or value;
- the nearest negative case proves the action, write, deletion, fallback, install, overwrite, or acceptance does **not** occur;
- a boundary case makes equality, emptiness, absence, first/last index, or fallback behavior explicit.

Treat absence as an observable result. Assert the unchanged file or package, retained user-owned artifact, missing call, missing output, rejected invalid input, or other concrete non-event. A positive call assertion does not cover its adjacent negative path.

For changed behavior, do not rely on `toBeTruthy()`, `toBeFalsy()`, existence-only checks, or similarly broad assertions when an exact result is knowable. Prefer exact values and structures, exact call arguments/counts, and explicit negative assertions that distinguish the correct result from its nearest wrong result.

Record a concise mutation readiness report before Acceptance. Name each changed production behavior, its positive, negative, and boundary evidence, the nearby mutants those tests reject, and any remaining risk. Use this shape:

```text
Changed production behavior

path/to/source.ts
- predicate or fallback
  - positive: test name
  - negative: test name
  - boundary: test name
  - nearby mutants: mutation directions -> rejecting tests

Unprotected mutation risks:
- none
```

If a changed behavior lacks distinguishing evidence, add the smallest focused test before assembling the candidate. The report predicts readiness; PR CI remains the mutation authority and may disprove it.

## Verify the candidate

Use the shared verification and no-progress rules. Run focused checks locally. Before acceptance:

- every acceptance criterion maps to concrete code, output, or a passing focused check;
- changed user-visible or generated artifacts were inspected;
- the complete diff contains no accidental scope expansion or unrelated edits.

Do not launch Stryker; mutation planning, execution, and aggregation belong to PR CI. Do not manually repeat `npm run tsc`, `npm test`, or other full deterministic gates merely for acceptance or handoff; the commit hook and required CI run them on the accepted candidate. Rerun a gate only when diagnosing a concrete failure or distrust condition.

## Independent acceptance

Stage the complete candidate and run the pre-commit fixer (`npx lint-staged`), so the hook's automatic fixes are already part of what Acceptance reviews. Record the base commit and the candidate tree (`git write-tree`).

Dispatch a fresh agent that did not implement the change and have it load `accept-ticket` once on the assembled candidate. Provide the issue, base commit, candidate tree, complete diff, focused check results, assumptions, and observations; do not provide your intended verdict. Leave the working tree and index untouched while it reviews.

For `CHANGES_REQUIRED`, reproduce each blocker, fix confirmed in-scope defects, rerun relevant focused checks, and request acceptance again on the new tree. Follow the shared two-round limit. For `BLOCKED`, preserve the uncommitted work on the ticket branch and report the missing authority or evidence.

## Commit and open the pull request

After `ACCEPTED`, confirm immediately before committing that `git write-tree` still prints the accepted tree; any other tree makes the acceptance stale. Then commit the accepted candidate as one commit, without splitting it after Acceptance, and push through the normal Husky hooks. Do not use `--no-verify`. Confirm the head's tree (`git rev-parse HEAD^{tree}`) equals the accepted tree; if a hook changed the content, the acceptance is stale. Open or update a draft pull request so authoritative CI can inspect the exact candidate.

Read preflight, deterministic CI, and mutation summaries and artifacts. A confirmed hook or CI failure is repaired as a new candidate: fix it, run focused regression checks, and return it through acceptance before its commit.

## Handoff

After exact-head preflight, deterministic CI, and mutation aggregate pass on the accepted candidate:

1. confirm the remote PR head equals the local head and its tree is the accepted tree;
2. mark the single pull request review-ready;
3. hand it to the Shaper for the separate decision-fidelity review;
4. summarize the outcome, important design choices, verification evidence, and outside-scope observations;
5. mutate an issue or comment only when the current request explicitly authorized that surface;
6. report completion.

If the Shaper requests a repair, resume the shared candidate lifecycle: a focused change, accepted before its commit, then a new pushed head.

Do not merge unless the owner explicitly requested autonomous merging and repository policy permits it. Do not close the issue before the requested merge or handoff boundary.
