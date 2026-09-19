# Autonomous delivery policy

This policy is shared by `shape-ticket`, `deliver-ticket`, `accept-ticket`, and `field-validation`. It owns the decisions below; individual skills must link here rather than restate them.

## Candidate lifecycle

Shape reconstructs repository truth and keeps the complete decision model behind the concise ticket. Delivery iterates with focused checks and assembles an uncommitted candidate. Independent Acceptance reviews that candidate before it is committed, so its findings reach the change before hooks and PR CI spend a run on it. Delivery then commits the accepted candidate unchanged, pushes through repository hooks, and opens a draft pull request. Required PR CI is the deterministic authority for that exact head. Finally, Shape reviews the candidate against the original intent, decisions, tradeoffs, and scope boundaries before merge.

An acceptance belongs only to the recorded base commit and candidate tree. The index and the working tree must still represent that tree when Acceptance returns and again immediately before the commit, and the commit must carry exactly that tree. A Shaper review belongs only to the recorded PR head. Any later change to the candidate makes its acceptance stale; any later head makes the Shaper review stale. A repair, whether Acceptance, CI, or Shape prompted it, is a new candidate: it returns through Acceptance before its commit, then through required CI and Shaper review. A draft pull request carries verification evidence. It is not a claim that delivery is complete.

## Decide, ask, or stop

Proceed without the owner when repository evidence can answer the question or when the choice is technical, reversible, and does not materially change the requested outcome.

Ask the owner only when reasonable choices would materially change user-visible behavior, compatibility, data, security, cost, or product scope. State the current evidence, viable options, consequences, and one recommendation. Ask one blocking question, not a questionnaire.

Stop when required authority or credentials are unavailable, an operation would risk unrecoverable work, the goal contradicts itself or cannot be verified, or two meaningfully different attempts fail for the same unresolved cause. Leave durable work recoverable and name the exact input needed to continue.

## Scope

A discovered existing problem belongs in the current ticket when it shares the root cause, blocks the requested result, or prevents trustworthy verification, and can be validated within the delivery. Fix it now even if it predates the ticket.

Otherwise leave it unchanged and record it once as an observation. Do not create follow-up tickets unless the owner asks. A nearby file or interesting defect is not scope by itself.

## Write authority

Default to read-only. Discussion, investigation, audit, review, shape, and acceptance do not authorize repository mutation unless the current request explicitly names a matching write.

Match every mutation to that request. Permission to create or update an issue or comment permits only that issue/comment mutation. Permission to post a review permits only the review mutation. Neither permits branches, repository files, blobs, trees, commits, or deletions.

Repository-content writes require explicit implementation or delivery authority. Every such write must target a resolved non-default branch and flow through a pull request. Never omit the branch, target `main`, or let a repository API choose its default. This applies equally to file, blob, tree, commit, ref, and branch-writing tools.

When the requested write surface and the selected operation differ, stop before the call. Incidental convenience is not authority.

## Evidence

Prefer current implementation, tests, generated output, project guidance, and history over summaries or names. Distinguish observed facts from inference. An empty search proves only that the search found nothing.

Use negative and positive controls when a check could pass without exercising the behavior. A blocking finding needs a reachable code path or reproduction, expected and actual behavior, and a concrete user, adopter, or downstream action that would be wrong or unsafe.

Do not block on preference, naming taste, commit-message quality, duplicated explanation, speculative risk without a reachable path, or prose that changes neither a decision nor a user-visible result.

## Durable state

Git branches, commits, tests, and pull requests are the delivery record. Reuse existing ticket branches and pull requests, preserve unrelated work, and never rewrite pushed history.

Before its commit, a candidate's recoverable identity is its base commit plus the staged candidate tree recorded with `git write-tree`. That tree object is a valid pre-commit artifact: a resume checks out the recorded base, restores the index and working tree with `git read-tree -u --reset <tree>`, and continues from there. It lives in the local repository's object store, so it resumes in the same clone. It is neither an accepted candidate nor a pull-request head.

Do not create a parallel protocol state machine in issue comments. Fingerprints, hashes of requirement prose, per-stage audit comments, retry counters, movement counters, and recovery ledgers require an explicit external consumer and owner approval.

When material shaping decisions are intentionally omitted from a concise ticket, one owner-approved Shaper-context comment on that issue is the durable input for the later Shaper review. It records only context needed to distinguish intended tradeoffs and boundaries from delivery drift, and links existing durable discussion instead of copying it when possible. It is not a stage ledger or approval state.

A release-convergence ticket is a human-readable ledger of candidate SHAs, scenarios, findings, repair PRs, and replays. The dedicated exact-commit field status is the machine state consumed by release; the linked ticket comment is its evidence, not a second release gate.

## Long-running external work

Treat a remote build, survey, deployment, or other durable job as asynchronous work rather than a reason to keep an interactive turn open. Record its provider, run identifier, expected artifact, authoritative timeout, and the candidate it measures: the target ref and commit once the candidate is committed, or the recorded base commit and candidate tree before its first commit. A later session must be able to recover from those facts without the original process; a committed candidate recovers without the local workspace, while a pre-commit candidate tree resumes in the same clone under the durable-state rule.

Continue any useful work that does not depend on the result. When the result becomes the next real dependency, end the current turn with a self-contained resume prompt containing the durable identifiers, success path, failure path, and verification boundary. The handoff must not depend on an uncommitted local file or transient worktree; a pre-commit candidate is handed off by its recorded base commit and candidate tree.

On resume, verify that the job measured the intended candidate (the recorded commit, or the recorded base commit and candidate tree) and scope before using its result. Diagnose failure or timeout from the durable logs; do not report a queued or running job as passed, and never replace an authoritative check with a smaller one merely to avoid the handoff.

## Progress and verification

Use focused checks while iterating. Husky is the minimum outgoing floor; the pull request's clean-environment CI is authoritative for full deterministic and changed-code mutation verification of the exact current candidate. Before Shaper handoff, prove that preflight, CI, and mutation evidence all bind the current PR head and base lineage, and that the head's tree is the accepted tree. Inspect generated or user-visible artifacts directly when changed. Add regression coverage for behavior, not wording or implementation trivia.

Continue after ordinary progress without waiting for confirmation. If the same failure survives two meaningfully different fixes, stop patching the symptom: reduce the case, revisit the model, inspect history, or request the one missing decision.

Independent acceptance happens once on each assembled candidate before its commit, not once per implementation stage and not after PR CI. It consumes delivery's focused evidence and adds only focused probes that answer a concrete unresolved risk; full deterministic and mutation gates belong to the hooks and PR CI that follow. After exact-head CI passes on the accepted candidate, Shape performs the separate requirement-fidelity review. A failed acceptance may receive at most two repair rounds before escalation.
