---
'@kekkai/blueprint': patch
---

Layer names carrying glob or path characters are rejected at validation — a layer literally named `*` (field batch 9's root-files workaround) widened every file glob into a wildcard and scaffolded a literal `src/*/` folder. The playbook states the doctrine the workaround violated: an empty net on a root-only app is the true state, not a failure — never invent a layer to make coverage non-zero; root-file hygiene belongs to the project's own lint.
