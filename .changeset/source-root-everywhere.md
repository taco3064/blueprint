---
'@kekkai/blueprint': patch
---

Honor `architecture.sourceRoot` consistently in init scaffolding, generated agent guidance,
dependency targets, relative-import and typedef-only enforcement, and inspect messages.
Projects using a source directory other than `src` now receive paths and rules for the
configured root.
