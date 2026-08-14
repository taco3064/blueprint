---
"@kekkai/blueprint": minor
---

**A layer reaching up to its own module root is red at every alias spelling.** `#220` closed the two
that `no-restricted-imports` can express and stated the residual at the site rather than leaving it
to be discovered; this closes it.

`~app/Fighter/Fighter` was an error in the report and green in the lint run — and that spelling is
the likely one, not the exotic one. The RFC settles that a module exporting a single component takes
that component's name, so `Fighter/Fighter.tsx` is what a module root is *called*, and
`~app/Fighter/Fighter` is what an agent writes to reach it.

**The channel had to change**, because `no-restricted-imports` cannot express "the module root and
its own direct files, but not its layer folders":

- a pattern **group** is gitignore-matched, so banning the module folder takes its own layers with it
- **`paths`** entries match a specifier exactly, so they carry the two names a config knows and never
  a filename it has never seen

So the ban moves to `blueprint/no-module-root-import`, which has the source file and can compute the
answer — the same reason `blueprint/relative-escape` and `blueprint/no-module-reexport` exist.

**One verdict, both gates.** `addressesModuleRoot` is shared with `inspect`'s `root-import` finding
rather than restated in the rule, so the two cannot conclude differently — the `relativeVerdict`
pattern. The root is stated as an absence: inside the same module, a specifier reaching no *declared*
layer reaches the root, which is what covers every spelling including the extension.

`root-import`'s migration line now names all three channels, so a reader searching the resolved
config finds the id actually holding their violation. Doctor verifies the rule survives a merge, and
`blueprint rules` carries it.

A flat config is unaffected — there is no module root to reach, and the rule is not emitted at all.
