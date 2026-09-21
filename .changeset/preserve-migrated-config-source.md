---
'@kekkai/blueprint': patch
---

Migrating a Blueprint 3.2 config no longer rewrites `blueprint.config.mjs` as the JSON of its evaluated value. `init` now edits the config's own source: it removes `architecture.module` and each layer's `module`, and declares `layout` / `entry` only where the migrated value differs from the 4.x default. A `defineBlueprint` call and a spread preset call such as `...reactPreset()` stay as written, so later preset changes keep reaching the project. Every comment is kept; one written inside a removed `module` value is re-emitted where that property stood. When those keys are not literal properties of the config, for example layers built by a helper, the file is left byte-identical, no backup is written, and the output names the keys to rewrite by hand.
