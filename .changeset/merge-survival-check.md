---
'@kekkai/blueprint': minor
---

`doctor` gains a seventh check — the emitted rules must survive the merged eslint config. Flat config never merges a rule two entries set: a later entry silently replaces blueprint's structural bans (or the user's own defenses) while lint stays green — two field runs hit this from both directions and caught it only by hand. Doctor now resolves the project's final config for a real layer file via the project's own ESLint and names exactly what was lost (structural pattern groups, selfOnly selectors, restricted globals, the embedded relative-escape rule); unreachable preconditions skip with a labeled reason instead of failing. The playbook's wire-the-lint step upgrades accordingly: a rule both sides set must be combined into one entry — ordering alone cannot save it.
