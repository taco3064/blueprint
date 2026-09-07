# Autonomous delivery policy

This policy is shared by `shape-ticket`, `deliver-ticket`, and `accept-ticket`. It owns the decisions below; individual skills must link here rather than restate them.

## Decide, ask, or stop

Proceed without the owner when repository evidence can answer the question or when the choice is technical, reversible, and does not materially change the requested outcome.

Ask the owner only when reasonable choices would materially change user-visible behavior, compatibility, data, security, cost, or product scope. State the current evidence, viable options, consequences, and one recommendation. Ask one blocking question, not a questionnaire.

Stop when required authority or credentials are unavailable, an operation would risk unrecoverable work, the goal contradicts itself or cannot be verified, or two meaningfully different attempts fail for the same unresolved cause. Leave durable work recoverable and name the exact input needed to continue.

## Scope

A discovered existing problem belongs in the current ticket when it shares the root cause, blocks the requested result, or prevents trustworthy verification, and can be validated within the delivery. Fix it now even if it predates the ticket.

Otherwise leave it unchanged and record it once as an observation. Do not create follow-up tickets unless the owner asks. A nearby file or interesting defect is not scope by itself.

## Evidence

Prefer current implementation, tests, generated output, project guidance, and history over summaries or names. Distinguish observed facts from inference. An empty search proves only that the search found nothing.

Use negative and positive controls when a check could pass without exercising the behavior. A blocking finding needs a reachable code path or reproduction, expected and actual behavior, and a concrete user, adopter, or downstream action that would be wrong or unsafe.

Do not block on preference, naming taste, commit-message quality, duplicated explanation, speculative risk without a reachable path, or prose that changes neither a decision nor a user-visible result.

## Durable state

Git branches, commits, tests, and pull requests are the delivery record. Reuse existing ticket branches and pull requests, preserve unrelated work, and never rewrite pushed history.

Do not create a parallel protocol state machine in issue comments. Fingerprints, hashes of requirement prose, per-stage audit comments, retry counters, movement counters, and recovery ledgers require an explicit external consumer and owner approval.

## Progress and verification

Use focused checks while iterating and the full relevant repository gates before acceptance. Inspect generated or user-visible artifacts directly when changed. Add regression coverage for behavior, not wording or implementation trivia.

Continue after ordinary progress without waiting for confirmation. If the same failure survives two meaningfully different fixes, stop patching the symptom: reduce the case, revisit the model, inspect history, or request the one missing decision.

Independent acceptance happens once on the assembled change, not once per stage. A failed acceptance may receive at most two repair rounds before escalation.
