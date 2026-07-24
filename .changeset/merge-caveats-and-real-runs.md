---
"@kekkai/blueprint": patch
---

The merge instruction meets the agent at the point of need (field issues #21–#22): an existing `eslint.config.ts` gets the TS7016 caveat — importing `./blueprint.config.mjs` needs `allowJs` on the tsconfig covering the config, or a one-line `blueprint.config.d.mts`; `defineConfig([...])` arrays are named spread-equivalent; the generated jsx parser block carries its own skip criterion (dormant on a TS-only repo).

"Only a real run proves it" now covers the alias wiring (both runs added the build check by hand): the early-exit checklist and the merge step order one build run after init edits tsconfig/vite, stating why — doctor's alias check reads wiring as text, never as a compile. The contract header now says hand-written notes live outside the marker block, the convention an agent had to infer when the generated file became the repo's only CLAUDE.md.
