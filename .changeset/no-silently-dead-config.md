---
'@kekkai/blueprint': minor
---

A config key nothing reads now fails validation instead of dying silently
(field issue #14): a 489-file field repo declared `selfOnly: true` on the
layer object — where nothing reads it — and the intended re-export ban
never existed while every gate stayed green. Validation now rejects
unknown keys across the structural path (blueprint, architecture, layers,
allowedImporters entries, module, owns entries, emit), and the misplaced
`selfOnly` gets a pointed error naming its real home
(`allowedImporters: [{ layer: 'views', selfOnly: true }]`).

`blueprint rules` also answers "does THIS config emit it?" for the
structural family: each rule carries a per-config `✓ emits / · not
emitted` annotation (`active` in `--json`), so nobody has to probe
emitLint to learn whether their `no-restricted-syntax` will collide with
a house rule. A test pins the annotation to emitLint's real output.
