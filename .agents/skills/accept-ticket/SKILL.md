---
name: accept-ticket
description: Independently verify an assembled ticket change before pull-request handoff. Use after implementation is complete or when explicitly asked for final acceptance. Do not implement fixes or review partial stages.
---

# Accept an assembled ticket

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns only the final independent verdict.

## Reconstruct

Obtain the issue text, base and head commits, complete `base...head` diff, and reported verification from the repository or pull request. Do not ask the owner for retrievable information.

## Review

1. Reconstruct the requested outcome and boundaries from the issue.
2. Inspect the complete diff, including added and generated files.
3. Map each acceptance criterion to code, output, or a test.
4. Run or reproduce checks needed for risky claims. Do not duplicate an expensive trustworthy result without a concrete reason.
5. Probe affected boundaries, configuration variants, failure paths, compatibility, and vacuous tests.
6. Check for regression, accidental scope expansion, stale output, and contradictory user-facing documentation.

Apply the shared evidence standard to every finding.

## Verdict

Return exactly one:

- `ACCEPTED`: all criteria are evidenced, relevant gates pass, and no blocking finding remains.
- `CHANGES_REQUIRED`: at least one reproducible in-scope blocker remains.
- `BLOCKED`: required authority, environment, or evidence is unavailable.

Include a compact criterion-to-evidence table, commands actually run, blocking findings, and non-blocking observations. Do not modify files, create issues, post comments, commit, push, or merge.
