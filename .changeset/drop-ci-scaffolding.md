---
"@kekkai/blueprint": major
---

Drop CI scaffolding. Blueprint no longer emits `.github/workflows/blueprint-ci.yml`, and the `emitCi` export, the `CiOptions` type, and the `emit.ci` config field are removed.

Verification strategy is the adopter's call — a git hook, GitHub Actions, GitLab CI, whatever you already run. Blueprint still ships the verification *commands* (`inspect --baseline`, `doctor`) that exit non-zero on new findings; wire them into your own gate.

Migration: remove `emit.ci` from any `blueprint.config.mjs` (it is now an unknown key, so `init` rejects it), and move the two steps the emitted workflow ran — `eslint` and `blueprint inspect --baseline` — into your existing pipeline.
