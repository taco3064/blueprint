---
"@kekkai/blueprint": minor
---

Presets take `emit` directly and merge it over their day-1 default
(`ci: 'github'`). Declaring the agent tool in use is the first customization
nearly every adoption makes — it no longer costs the one-line preset form,
and no longer silently drops the CI workflow the way a spread-level `emit`
override does.
