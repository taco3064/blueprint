---
"@kekkai/blueprint": minor
---

Add the exported `StackFacts` type and optional stack facts to `emitHandbook` and
`emitAgentFiles`. Existing calls remain compatible.

`blueprint init` now supplies the detected TypeScript capability, so generated handbooks and
agent contracts no longer claim that `explicitAny` is enforced in JavaScript-only projects.
TypeScript projects keep their existing output.
