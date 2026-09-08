---
"@kekkai/blueprint": patch
---

Make full generated agent contracts describe enforcement accurately: unavailable
`testFilename` and `deepWatch` gates are no longer called hard lint gates, while `cycles` is
identified as enforced by `blueprint inspect --baseline` rather than ESLint. Regenerate the
contract to receive the corrected wording.
