---
"@kekkai/blueprint": patch
---

The early-exit checklist claimed "nothing else in this file applies" while
omitting the tool declaration the Method itself mandates — a literal walk
scaffolded both contracts with no `emit.agents`, and doctor stayed green
(both files are the emitted default, so nothing was stale). Step 1 now
carries the declaration: `init --preset --agent claude|codex` persists the
choice, one run emits one contract; agents running as neither tool declare
`emit.agents` in the config instead.
