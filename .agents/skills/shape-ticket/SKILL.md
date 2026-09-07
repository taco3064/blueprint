---
name: shape-ticket
description: Turn a product direction or incomplete GitHub issue into one delivery-ready issue grounded in the current repository. Use when the desired outcome is not yet captured as a testable ticket. Do not implement the ticket.
---

# Shape one delivery-ready ticket

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns only investigation, necessary product decisions, and the ticket contract.

## Investigate

1. Fetch the remote and read `origin/main` without altering the current worktree.
2. Read the relevant implementation, tests, generated output, project guidance, and history.
3. Search open and closed issues and pull requests for the same root cause.
4. Stop investigating when the evidence can decide a minimal ticket. Do not turn exploration into scope.

Resolve technical details from evidence. Apply the shared decide/ask rule only to choices that change the outcome.

## Choose one ticket boundary

Use one ticket when the work shares one outcome and root cause. Propose a split only when parts can ship independently and neither is needed to verify the other. If a delivery-ready open issue already owns the same result, report it instead of creating a duplicate.

## Write the ticket

Create or materially revise one issue only after the owner approves the complete draft:

### Goal

State the current behavior, desired behavior, concrete cost, and boundary.

### Evidence

Record only evidence that changes the plan: relevant files or symbols, observed output, prior attempts, and unresolved assumptions.

### Implementation Notes

Name likely owning modules, reusable primitives, compatibility constraints, and migrations. These are guidance; the delivery agent may adjust technical details when current code proves a better route without changing the goal.

### Acceptance Criteria

Each criterion describes an observable result and how it can be checked. Prefer behavior and generated output over exact internal structure. Include required regression cases and final verification commands.

### Out of Scope

Name only nearby work a delivery agent could reasonably mistake as required.

## Check before filing

- Refresh `origin/main` and re-check evidence the plan depends on.
- Map every goal clause to at least one acceptance criterion.
- Remove stale-prone counts, line numbers, snapshots, and illustrative detail that does not constrain the outcome.
- Confirm no open delivery-ready issue owns the same result.

Once approved and filed, stop. Delivery is a separate `deliver-ticket` invocation; this skill does not dispatch, monitor, revise in-flight requirements, or implement code.
