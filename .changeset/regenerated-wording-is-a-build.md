---
"@kekkai/blueprint": patch
---

**A re-adoption was told that regenerated text differs when the installed version is newer — and
the version string cannot decide that.** Both sides of the run that found it read `3.0.0`, and the
artifacts still came out worded differently, because the two builds were different. The paragraph
exists so nobody spends a cycle proving non-idempotency; stating a cause that did not hold spends
that cycle anyway, on reconciling the sentence instead.

The condition is now the one that is actually true: a different build wrote them, and equal version
strings do not rule that out — an unreleased tree, a linked checkout and a git dependency each
report the last release while emitting later text. The falsifiable part is unchanged and was
verified in the field: re-run `init` twice and the second run is byte-identical to the first. That
check decides the question either way, which is why it, not the version, is what the playbook now
leans on.

This shape is not exotic. `scripts/field-run.mjs` packs whatever version `package.json` holds,
which stays at the last release until changesets bump it, so every re-adoption run against an
already-adopted repo reproduces it.
