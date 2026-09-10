---
'@kekkai/blueprint': major
---

Add `init --topology layer-first|module-first` and require an explicit choice when an unconfigured repository's current topology cannot be determined safely. Existing configurations remain authoritative, module-first initialization enters authoring, and unavailable topology transformations abort before writing.

Align dependency reports with the canonical architecture resolver so governed recursive `app/**` routes are never also reported as outside the architecture.
