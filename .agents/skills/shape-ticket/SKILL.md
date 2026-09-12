---
name: shape-ticket
description: Shape a grounded delivery contract and later review its pull request for decision fidelity. Use for incomplete product work or the post-Accept Shaper review. Do not implement the ticket.
---

# Shape one delivery-ready ticket

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns investigation, necessary product decisions, the ticket contract, and the later Shaper review. It never implements the change.

## Investigate

1. Fetch the remote and read `origin/main` without altering the current worktree.
2. Reconstruct the relevant runtime behavior and follow its owning symbol, call path, consumers, tests, generated output, project guidance, and history.
3. Search open and closed issues and pull requests for the same root cause.
4. Stop investigating when the evidence can decide a minimal ticket. Do not turn exploration into scope.

Resolve technical details from evidence. Apply the shared decide/ask rule only to choices that change the outcome.

Keep verified implementation truth, stale or contradictory surfaces, and unproven inference distinct. Do not guess ownership or target files from names when a call, import, or generation path can establish them.

Preserve the full shaped decision model for later review: the original problem and intent, verified repository model, ownership paths, explicit decisions and tradeoffs, deliberately rejected viable alternatives and reasons, compatibility and scope boundaries, and the concise final ticket. If material context would otherwise exist only in the current conversation, prepare one compact Shaper-context comment for the issue under the shared durable-state rule. If a later session still cannot retrieve or reconstruct material context, state that uncertainty instead of inventing rationale.

## Choose one ticket boundary

Use one ticket when the work shares one outcome and root cause. Propose a split only when parts can ship independently and neither is needed to verify the other. If a delivery-ready open issue already owns the same result, report it instead of creating a duplicate.

## Write the ticket

Create or materially revise one issue only after the owner approves the complete ticket draft and any separate Shaper-context comment:

### Goal

State the current behavior, desired behavior, concrete cost, and boundary.

### Evidence

Record only evidence that changes the plan: owning surfaces, observed output, prior attempts, compatibility constraints, and unresolved assumptions.

### Implementation Notes

Name likely owning modules and affected consumers, reusable primitives, compatibility constraints, and migrations. These are guidance; the delivery agent may adjust technical details when current code proves a better route without changing the goal.

### Acceptance Criteria

Each criterion describes an observable result and how it can be checked. Prefer behavior and generated output over exact internal structure. Include special verification obligations unique to the ticket, such as a platform regression, adopter replay, or generated-output comparison. Do not repeat generic lint, typecheck, test, build, or mutation policy owned by the repository.

### Out of Scope

Name only nearby work a delivery agent could reasonably mistake as required.

## Check before filing

- Refresh `origin/main` and re-check evidence the plan depends on.
- Map every goal clause to at least one acceptance criterion.
- Remove stale-prone counts, line numbers, snapshots, and illustrative detail that does not constrain the outcome.
- Confirm no open delivery-ready issue owns the same result.

After filing the concise ticket, post the approved Shaper-context comment only when material decisions, tradeoffs, or rejected alternatives are not already durable in the issue discussion. Do not turn it into progress or approval bookkeeping. Then pause. Delivery is a separate `deliver-ticket` invocation; this skill does not dispatch, monitor, revise in-flight requirements, or implement code.

## Review the delivered candidate

Resume when the owner asks for Shaper review after exact-head CI and independent Acceptance. Reconstruct or retrieve the complete shaped decision model, then inspect:

- the original problem and verified repository model;
- shaped decisions, tradeoffs, rejected alternatives, compatibility, and scope boundaries;
- the final ticket and complete PR diff;
- required CI evidence and the Accept verdict for the same exact head.

Decide whether the implementation solves the problem that was shaped without drifting into a technically valid but semantically different result. Do not duplicate Acceptance's technical verification; challenge requirement and decision fidelity. A review based only on the concise issue is insufficient when material shaping context exists elsewhere.

Record the reviewed head SHA, apply the shared candidate-staleness rule, and report `APPROVED`, `CHANGES_REQUIRED`, or `BLOCKED` with evidence. Post a PR review only when the request authorizes that mutation.
