---
"@kekkai/blueprint": patch
---

**The handbook's `selfOnly` rule contradicted the diagram legend twelve lines above it.**
The legend says a **solid** edge is a declared importer relation whose label carries
`selfOnly`, and a **dotted** edge only records declaration order — adjacent layers that
are not necessarily related. The import-discipline bullet then said "**selfOnly** — a
*dashed* edge may be depended on but never re-exported onward".

One document, two answers, and the wrong one points at the edges that are explicitly not
dependencies: a reader following the bullet looks at the dotted edges and takes those for
the constrained ones, while the actually-constrained solid edges read as ordinary.

The bullet now states the rule and leaves the notation to the legend that owns it —
"where a layer narrows its importers with `selfOnly`, that importer may depend on it but
must never re-export it onward". Describing one drawing in two places is what let them
drift, so the discipline section no longer describes it at all.
