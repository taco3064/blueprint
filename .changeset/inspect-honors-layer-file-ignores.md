---
"@kekkai/blueprint": patch
---

Align `inspect` with emitted lint exclusions: files matched by `layerFilesIgnore` no longer produce lint-backed findings or count as reached lint coverage, while inspect-only checks continue to see them. Coverage now names deliberately ignored layer files without misdiagnosing an all-ignored layer net as a broken glob.
