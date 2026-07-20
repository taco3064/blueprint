---
'@kekkai/blueprint': minor
---

Per-layer module layout, a TS-aware unusedVars gate, and a depth-aware
relative-escape rule — all three surfaced by adopting blueprint on a mature,
previously ungoverned React + TypeScript codebase:

- **`LayerDef.module`** — a layer can now override the shared module shape
  (`layout` / `entry`): folder modules in a feature layer while the rest of
  the project stays flat. `inspect`, `deps`, the emitted lint config, the
  handbook, and the agent contract all resolve the shape per layer, and
  deep-import bans now name each folder-layout target layer instead of
  assuming one global layout.
- **`emitLint(blueprint, { typescript })`** — inject the `@typescript-eslint`
  plugin and the `unusedVars` gate emits the TS-aware `no-unused-vars`; the
  core twin false-flags TS enum members and type parameters (565 false
  positives on the field-test repo). `init` wires the option automatically on
  TypeScript projects, and the brownfield merge instruct mentions it.
- **`blueprint/relative-escape`** — replaces the literal `../` ban patterns,
  which could not see file depth and so flagged intra-module imports inside
  nested module folders (~310 false positives). The rule shares inspect's
  resolution primitives, so the two gates cannot disagree — the field-test
  repo now reports exactly the same 54 escapes on both sides.
