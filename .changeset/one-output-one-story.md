---
'@kekkai/blueprint': patch
---

Three field-verified message defects, one class — an output that
contradicts its own doctrine or prose (field issue #12):

- `impact` now names a vacuous zero: when the layer globs match no files,
  "0 hits" says so and adds "proves nothing until code lands in a layer" —
  matching `inspect`'s coverage warning instead of reading like the rules
  ran clean. `--json` output carries the new `linted` count.
- `init`'s eslint wiring snippet on a TypeScript repo IS the TS version
  (`emitLint(blueprint, { typescript: tseslint.plugin })` with its import)
  instead of a JS snippet corrected by prose four lines later.
- `init --authoring`'s hand-off line promises "locking a baseline if debt
  exists" — the sub-threshold early exit locks nothing, and the old
  unconditional wording contradicted that prescribed path.

Plus two recurring field doubts encoded where they arise: the early-exit
checklist now says to remove `.claude/` itself when deleting the command
leaves it empty, and the reference's parser-setup header names presets
that wire parsers internally (tseslint.configs.recommended) as "already
wired".
