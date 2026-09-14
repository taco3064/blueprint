---
name: field-validation
description: Select the required live Blueprint field targets and choose affected repair replay or full release convergence. Use for field-scope decisions, not candidate staging or runner mechanics.
---

# Choose field-validation scope

Read and follow [the shared autonomous delivery policy](../../docs/autonomous-delivery.md) and [field triage](../../docs/field-triage.md). This skill owns only target-role judgment and replay scope. Repository tooling owns candidate identity, downloads, staging, Agent invocation, Doctor and Inspect execution, durable evidence, statuses, convergence updates, and release gating.

## Required target roles

Use the release-convergence ticket as the authority for exact revisions and the required matrix. Preserve these established targets unless the owner explicitly changes the release contract:

| Target | Role |
|---|---|
| Vue Pure Admin | Real-world conventional `src/` adopter control |
| React DDD Feature Folder | Real-world outer-axis control with an intentional inner-architecture model boundary |
| RealWorld React FSD | Real-world feature-sliced layer and alias control |
| Vue Vben Admin `apps/web-antd` | Real-world nested workspace and application-scope control |
| sky-1945 | Layer-first → module-first → layer-first transformation control |
| Repository-owned new-project starters | Greenfield adoption controls only when the release contract includes them |

Real-world adopters test safe understanding and adoption of their existing architecture; they are not topology-conversion controls. sky-1945 owns the bidirectional transformation role. Do not silently substitute one role for another or treat adopter debt and supported model boundaries as Blueprint defects.

## Choose replay scope

Use **affected replay** only to confirm a known finding after repair when the changed behavior and blast radius justify a narrow target set. Record the affected targets and the evidence that excludes the rest. It is repair evidence only and can never authorize release convergence.

Use **full convergence** when establishing the release baseline or final authority, when shared Agent-facing or adoption behavior changes broadly, or whenever the blast radius cannot be narrowed confidently. Full convergence runs every target and Agent required by the release contract against one exact candidate.

Return the selected scope, target roles, and short blast-radius rationale. Do not reproduce runner commands or programmatic mechanics in this skill.
