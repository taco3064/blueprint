---
"@kekkai/blueprint": minor
---

Expose source-observed direct module dependencies, deterministic evidence, reconciliation, and importer-scoped uncertainty in deps and inspect. Add the opt-in Inspect moduleDependencySync gate while preserving transitive import permission. Existing configurations and presets gain observability without new synchronization failures until owners enable the gate; no config migration or automatic dependsOn edits are required.
