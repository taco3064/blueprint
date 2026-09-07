---
name: deliver-ticket
description: Autonomously implement and verify one GitHub issue through a review-ready pull request. Use when the owner asks to build, continue, or finish a ticket and expects work to proceed without supervision. Stop only under the shared autonomous-delivery policy.
---

# Deliver one ticket autonomously

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns implementation, integration, verification, and pull-request handoff.

The issue defines the outcome. The repository defines technical reality. Preserve the outcome and adapt implementation details when current code disproves the proposed route.

## Start or resume

1. Fetch the remote; read the issue, repository guidance, related history, branches, worktrees, and pull requests.
2. Reuse an existing ticket branch or pull request. Otherwise branch from current `origin/main` with the ticket number in the branch name.
3. Inspect `git status`; preserve unrelated work.
4. Compare the issue with current code. Missing implementation detail is not a blocker. Apply the shared decide/ask rule if an essential product decision is missing.

## Plan and execute

Create a short working plan from acceptance criteria and dependency order. A step ends in an observable result; it does not require its own reviewer, agent, commit, or issue comment.

Use sub-agents when bounded investigation or implementation can safely run independently. Give them relevant paths and one outcome. The orchestrator integrates and verifies the complete tree.

For each step:

1. inspect the owning code and tests;
2. make the smallest coherent change that advances the outcome;
3. run focused checks;
4. inspect failures and generated output, then fix within the shared scope rule;
5. checkpoint coherent work in Git when it improves recoverability;
6. continue directly to the next step.

Do not wait for confirmation after ordinary progress. Do not post one issue comment per step or commit.

## Verify

Use the shared verification and no-progress rules. Before acceptance:

- every acceptance criterion maps to concrete code, output, or a passing test;
- relevant lint, typecheck, test, build, generation, and conformance gates pass;
- changed user-visible or generated artifacts were inspected;
- the complete diff contains no accidental scope expansion or unrelated edits.

## Independent acceptance

Dispatch a fresh agent that did not implement the change and have it load `accept-ticket` once on the assembled change. Provide the issue, base and head commits, complete diff, verification results, assumptions, and observations; do not provide your intended verdict.

For `CHANGES_REQUIRED`, reproduce each blocker, fix confirmed in-scope defects, rerun relevant gates, and request acceptance again. Follow the shared two-round limit. For `BLOCKED`, preserve the branch and report the missing authority or evidence.

## Handoff

After `ACCEPTED`:

1. commit and push without rewriting published history;
2. open or update one pull request linked to the issue;
3. summarize the outcome, important design choices, verification commands/results, and outside-scope observations;
4. leave one concise issue update linking the pull request when useful;
5. report completion.

Do not merge unless the owner explicitly requested autonomous merging and repository policy permits it. Do not close the issue before the requested merge or handoff boundary.
