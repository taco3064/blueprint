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

## Long-running external work

Treat a remote build, survey, deployment, or other durable job as asynchronous work rather than a reason to keep an interactive turn open. Record its provider, run identifier, target ref and commit, expected artifact, and authoritative timeout. A later session must be able to recover from those remote facts without the original process or local workspace.

Continue any useful work that does not depend on the result. When the result is the next real dependency and the execution environment exposes scheduled tasks, create a one-time continuation for the expected completion time plus a reasonable buffer, then end the current turn. Do this only when the owner has authorized creating the scheduled task. The continuation prompt must contain the durable identifiers, success path, failure path, and verification boundary; it must not depend on an uncommitted local file or transient worktree.

Codex IDE and CLI sessions do not provide the scheduled-task management interface. In those environments, preserve the same durable state and return a self-contained resume prompt for the owner or an explicitly configured external orchestrator. Never claim that an unavailable scheduler will wake the session, and never replace an authoritative check with a smaller one merely to avoid the handoff.

A scheduled continuation is transport, not evidence. On resume, verify that the job measured the intended commit and scope before using its result. Diagnose failure or timeout from the durable logs; do not report a queued or running job as passed.

## Progress and verification

Use focused checks while iterating and the full relevant repository gates before acceptance. Inspect generated or user-visible artifacts directly when changed. Add regression coverage for behavior, not wording or implementation trivia.

Continue after ordinary progress without waiting for confirmation. If the same failure survives two meaningfully different fixes, stop patching the symptom: reduce the case, revisit the model, inspect history, or request the one missing decision.

Independent acceptance happens once on the assembled change, not once per stage. A failed acceptance may receive at most two repair rounds before escalation.
