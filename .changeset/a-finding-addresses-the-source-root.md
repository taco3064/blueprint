---
"@kekkai/blueprint": patch
---

**A directory finding addresses the source root the config named.** `scan`, coverage,
deps and doctor all honoured `architecture.sourceRoot`; the four directory-level
findings built their path from a literal `src/`. On a repo configured with
`sourceRoot: 'app'`, an undeclared folder at `app/utils` was reported as `src/utils`.

Cosmetic only if the reader is a person who will notice. This output is read by an
agent that goes to the address it was given, finds nothing, and has to decide whether
the finding or the path is the lie. Affects `undeclared-folder`, `missing-layer`,
`declaratory-self-only` and `no-entry` — the findings whose path is composed from a
layer or module name. Per-file findings were already correct.
