---
"@kekkai/blueprint": patch
---

**Every output that reports the import graph says how the graph was read.**
`inspect`'s graph comes from source text, not a parsed AST — a computed
`import(path)`, the individual names behind `import * as`, and import-like text inside
a string are outside what it can see. That was written in `scan.ts`'s own doc comment
and nowhere an adopter looks, so `✓ Architecture Success` read as a verdict on the
dependency graph rather than on what a text scan could see.

One text, at every surface that reports a graph-derived fact: the architecture report
(the clean one included, which is where it matters most), both `deps` renderings, and
the `--json` payloads as a `derivation` field, because JSON is the whole channel for
whoever parses it.

The correction travels with it: **the hard gates do not share the limit** — they run
in ESLint, on the AST, which is what CI enforces. So `inspect` is the survey and the
lint run is the authority on any single import. `reference.md` carries the boundary
once, with `deps.md` and `prior-art.md` linking to it; `prior-art.md` now names the
difference against dependency-cruiser plainly rather than leaving it implied.
