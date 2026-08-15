---
'@kekkai/blueprint': minor
---

**`blueprint rules --json` and `blueprint deps --json` change meaning under
`architecture.modules`** — the two breaking changes in this release that reach
nobody who does not declare it. Nothing throws in either case: a consumer reads a
key that is no longer what it was and carries on, which is why these are written
down here rather than reported by the tool.

**On a flat project, nothing you already read has moved** — but that is not the
same as "identical output", and the difference is worth having exactly. Measured
against `v3.1.0` on the same config: `deps --json` is unchanged, top-level keys
and all. `rules --json` gains two keys and loses none — `zone`, which is
`"layer"` on every row, and a `moduleRoot` that is always `[]`. Both are
additions beside what you had, so a `3.x` consumer keeps working.

- **`rules --json` rows are discriminated by `zone`**, and `layer` is absent on
  two of the three values it takes. Under `modules` the emitted config holds one
  ban set per *(module, layer)* plus one for each module's own root, so `module`
  is the field to key on and `layer` narrows it when the zone says there is one.
  **The `root` rows are the ones to plan for** — a config with two plain modules
  and nothing else declared already emits one per module, so a consumer reading
  `layer` unconditionally breaks there first.
- **`deps --json`'s `module` changed meaning**, which is worse than a rename
  because nothing about the key looks different. It was the layer; under
  `modules` it is the feature, and the inner thing moves to a new `units` array
  with the module it lives in beside it. **The check that finds it is whether
  `units` is present** — absent on a flat project, present whenever modules are
  declared.

Both are entries 5 and 6 of
[Upgrading to 4.0.0](https://taco3064.github.io/blueprint/guide/upgrading), with
the before/after consumer code.
