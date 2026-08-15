---
'@kekkai/blueprint': patch
---

**A module root is judged by its module's entry, not as a layer named after its
own file.**

Under `architecture.modules`, a layered module's root file (`src/Fighter/Fighter.jsx`)
was run through the layer branch of `inspect`'s per-file pass. At a root
`segments[depth]` is the filename, so the layer that judged it was
`Fighter.jsx` — and the ownership message said so out loud:

> `"zustand"` is owned by **hooks** — not importable from **"Fighter.jsx"**.

Four judgments fired there against a lint run green on every one of them. The
emitted entry for that zone is `src/<Module>/*`, and it carries the cross-module
ban groups, the unit-entry group over the module's own folder-layout layers, the
MODULE-level `owns` bans and `blueprint/no-module-reexport` — no layer-level ban
of any kind. `blueprint/relative-escape` never registers on a root either: the
rule opens on the file's segment at layer depth being a declared layer.

So the layer `owns` check and the whole relative family are silent at a module
root, and everything that entry does ban still bites. Rendered over one tree,
before and after: lint is byte-identical at 7 hits over 3 files, and `inspect`
goes from 14 errors to 8 — one per lint hit at the same path, plus the one
`undeclared-module` that never appears in a lint run by construction.

The same depth test recognised a file directly under an **undeclared** top-level
folder, which has the root's shape and none of its governance. `src/scratch/notes.js`
drew two errors under an `undeclared-module` note whose own message reads *"lint
stays green throughout"* — and told a folder that is not a module about "this
module's own surface". The zone is now read through `moduleZone`, which looks the
module up, so that position answers to nothing, as the emitted config does.

`package-ownership`'s migration step named the owning **layer** while the id
answers at two levels; it now names both, the treatment `deep-import` and
`no-entry` already carry.
