---
"@kekkai/blueprint": major
---

**Breaking: `architecture.module` is now `architecture.folder`, and `layer.module` is now
`layer.folder`.** The feature-folder shape stopped calling itself a module. Same keys
(`layout` / `entry` / `private`), same defaults, same behaviour — a config that spells it
`folder` does exactly what the same config spelled `module` did.

- **What to edit.** Rename the key in `blueprint.config.mjs`: `architecture.module` →
  `architecture.folder`, and any per-layer `module: { … }` override → `folder: { … }`.
  Nothing inside the block changes. That is the whole migration.
- **The old spelling fails loudly and points at the new one.** `module` is rejected as an
  unknown key at both levels, and the message says it was renamed rather than removed —
  `module was RENAMED to folder — same keys, same behavior, nothing removed.` A silent
  fallback was deliberately not shipped: one concept keeps one spelling.
- **Renamed with it, for anyone importing the types.** `ModuleDef` → `FolderDef` and
  `LayerModuleDef` → `LayerFolderDef`.
- **The emitted prose says "folder" now.** The handbook's `## Module shape` section is
  `## Folder shape`; `inspect` reports `Folder "components/Dropdown" has no "index" entry`
  where it said `Module`; the agent contract, the authoring playbook, `blueprint rules`
  and the CLI help follow. If you diff generated artifacts in CI, expect those lines to
  move — and only those.
- **`blueprint deps` is untouched.** Its unit is the import-graph node, which is a feature
  folder under `folder` layout and the whole layer under `flat` — a different thing from
  the shape being renamed, so `--json` still carries `module`, and `inspect`'s
  `Import cycle between modules` is unchanged.

The rename frees the word: `module` is wanted for a coarser concept, and one letter is not
enough to separate two things at two depths.
