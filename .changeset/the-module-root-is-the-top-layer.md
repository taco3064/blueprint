---
"@kekkai/blueprint": minor
---

**The module root is governed as the implicit top layer.** `Fighter/Fighter.tsx` and
`Fighter/index.ts` sit above every declared layer: the root may reach each of them through
that unit's entry, and nothing inside a layer may reach back up to the root.

Two new findings, because neither state had an honest name among the existing ones — a
layer reaching the module root is not "leaving a layer", and crossing a module by relative
path is not "escaping src":

- **`root-import`** — a file inside a layer importing the module root, in either spelling
  (`../../Fighter`, `~app/Fighter`, `~app/Fighter/index`). The root composes the layers, so
  the fix is to move the shared part down into a layer or pass it in from the root.
- **`module-escape`** — a relative import that leaves the module. Cross a module boundary
  through the alias and declare the dependency in the module's `imports`; a relative path
  cannot express it.

Both are carried by `blueprint/relative-escape`, so lint and `inspect` reach the same
verdict on the same import — including the alias spelling of the upward edge, which
previously had no path through `inspect` at all.

**The module root's own imports are now analysed.** They were skipped: the guard asked
whether the segment at layer depth named a declared layer, and for a root file that segment
is a filename. A module's own composition code was the least examined code in the module.

Flat projects are unaffected — the new logic runs only where `architecture.modules` is
declared, and a file directly under the source root is app wiring, which both gates already
decline to judge.
