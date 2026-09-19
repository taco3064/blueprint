---
name: accept-ticket
description: Independently review an assembled, uncommitted ticket candidate and its focused evidence before delivery commits it. Use when delivery requests acceptance or when explicitly asked for acceptance. Do not implement fixes or review partial stages.
---

# Accept an assembled ticket

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md). This skill owns only the independent acceptance verdict.

## Reconstruct

Obtain the issue text, the base commit, the candidate tree delivery staged, the complete `git diff <base> <tree>`, and delivery's focused check results. Do not ask the owner for retrievable information. Confirm the index and the working tree both still are that candidate: `git diff --cached --quiet <tree>` passes for the index, which the commit is built from; `git diff --quiet <tree>` passes for tracked working-tree content; and `git ls-files --others --exclude-standard` lists nothing. A missing tree, or an index or working tree that differs from it, yields `BLOCKED`.

Full lint, typecheck, test, and mutation results for the candidate do not exist yet. The commit hook and PR CI produce them after acceptance, so their absence is not a blocker.

## Review

1. Reconstruct the requested outcome and boundaries from the issue.
2. Inspect the complete diff, including added and generated files.
3. Map each acceptance criterion to code, output, or a test.
4. Consume delivery's focused evidence. Repeat a check only when a claim is risky, the evidence looks doubtful, or a reported result needs interpretation.
5. Run or reproduce small focused checks needed for risky claims, vacuous controls, boundaries, variants, or failure paths. Do not run full lint, typecheck, test, build, distribution, transformation, or mutation jobs without a concrete reason; the commit hook and PR CI run them after acceptance.
6. Probe affected boundaries, configuration variants, failure paths, compatibility, and vacuous tests.
7. Check for regression, accidental scope expansion, stale output, and contradictory user-facing documentation.

Apply the shared evidence standard to every finding.

## Verdict

Return exactly one:

- `ACCEPTED`: all criteria are evidenced, focused checks pass, and no blocking finding remains.
- `CHANGES_REQUIRED`: at least one reproducible in-scope blocker remains.
- `BLOCKED`: required authority, environment, or evidence is unavailable.

Record the reviewed base commit and tree, and apply the shared candidate-staleness rule before returning: the index and working tree must still be the reviewed tree. Include a compact criterion-to-evidence table, commands actually run, blocking findings, and non-blocking observations.

Do not modify files, the index, branches, commits, issues, or pull requests. If the current request explicitly asks to post the verdict, use only the matching review mutation; it does not authorize repository-content writes.
