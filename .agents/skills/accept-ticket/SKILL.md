---
name: accept-ticket
description: Independently review a green exact-head pull-request candidate and its evidence. Use after required PR CI completes or when explicitly asked for final acceptance. Do not implement fixes or review partial stages.
---

# Accept an assembled ticket

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns only the final independent verdict.

## Reconstruct

Obtain the issue text, PR base, exact remote head SHA, complete `base...head` diff, preflight base/head/merge-base, and every required deterministic and mutation CI result for that head. Do not ask the owner for retrievable information. Required CI that is pending, red, missing, or bound to another head yields `BLOCKED`; final acceptance does not begin yet.

## Review

1. Reconstruct the requested outcome and boundaries from the issue.
2. Inspect the complete diff, including added and generated files.
3. Map each acceptance criterion to code, output, or a test.
4. Consume trustworthy exact-head CI evidence. Inspect detailed job artifacts further only when a concrete inconsistency makes the authority doubtful or a reported finding needs interpretation.
5. Run or reproduce small focused checks needed for risky claims, vacuous controls, boundaries, variants, or failure paths. Do not duplicate full lint, typecheck, test, build, distribution, transformation, or mutation jobs without a concrete reason.
6. Probe affected boundaries, configuration variants, failure paths, compatibility, and vacuous tests.
7. Check for regression, accidental scope expansion, stale output, and contradictory user-facing documentation.

Apply the shared evidence standard to every finding.

## Verdict

Return exactly one:

- `ACCEPTED`: all criteria are evidenced, relevant gates pass, and no blocking finding remains.
- `CHANGES_REQUIRED`: at least one reproducible in-scope blocker remains.
- `BLOCKED`: required authority, environment, or evidence is unavailable.

Record the reviewed head SHA and apply the shared candidate-staleness rule before returning. Include a compact criterion-to-evidence table, commands actually run, blocking findings, and non-blocking observations.

Do not modify files, branches, commits, issues, or pull requests. If the current request explicitly asks to post the verdict, use only the matching review mutation; it does not authorize repository-content writes.
