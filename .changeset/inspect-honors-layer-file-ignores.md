---
"@kekkai/blueprint": patch
---

Align `inspect` with the generated ESLint scope: files matched by
`architecture.layerFilesIgnore` no longer produce lint-backed findings or count toward lint
coverage. Inspect-only checks continue to include them, and coverage output now identifies
deliberately ignored layer files.
