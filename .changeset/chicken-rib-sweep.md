---
"@kekkai/blueprint": minor
---

Product-wide chicken-rib sweep. `architecture.flow` is now optional and
deprecated: it was a required field that nothing ever read — the layer ORDER
is the flow — so presets, scaffolds, docs, and the playbook schema stop
declaring it (existing configs keep working; drop the line at leisure).
`emit.lint.path` is deprecated for the same reason: never consumed, and its
doc claimed otherwise. `injectBetweenMarkers` left the package entry — an
internal merge utility with no documented story. Both deprecated fields are
removed in the next major.
