---
"@kekkai/blueprint": minor
---

Drop the "backend boundary" posture from the emitted handbook. The `respect-backend` core belief and the whole "Data integrity & backend boundary" playbook section (`no-fake-fallback`, `drift-guard-framing`, `no-fe-workaround`, `preserve-locale-shape`) no longer ship in the presets, the handbook, or the agent contract.

No API surface changes — `PrincipleDef` and `PlaybookSection` are untouched. The preset data is simply nine beliefs and a three-section playbook now (was ten and four). Re-run `init` to regenerate a handbook and agent contract without the section; a repo that authored its own `principles` / `playbook` is unaffected.
