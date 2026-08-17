---
"@kekkai/blueprint": minor
---

**Add `architecture.modules`** — ordered feature modules at the source root, each a
folder holding the declared `architecture.layers` nested one level inside it (or, with
`layers: false`, its files directly). Omitting `modules` leaves the flat structure
exactly as it is today, byte-for-byte — the two config surfaces coexist by
construction: `layers` is always the technical-layer definition, `modules` only
decides *where* those layers live.

- **The schema.** `name` / `does` (parallel `layer.name` / `layer.does`), `layers?:
  false` (the only opt-out — omit it to nest the shared layers, `false` for a module
  that holds its files directly), `owns?` (same shape as `layer.owns`, and it
  cascades: a file group may reach a primitive its own layer owns *or* its owning
  module owns), `allowedImporters?` (same shape and default as
  `layer.allowedImporters` — a module declared earlier may import a module declared
  later by default; entries name a `module`, not a `layer`), `entry?` (override the
  module's own public entry filename, inheriting `architecture.folder.entry` when
  unset).
- **Entry-only, in both directions.** A module is reachable from outside only at its
  bare alias path (`~app/N`); reaching past it (`~app/N/**`) is caught, whichever
  shape the target module is. From inside, the module's own alias spelling has to
  stay relative too (`~app/N` banned, `./` is not) — but a declared layer nested
  inside is still reachable at `~app/N/<layer>`, the modular restatement of the flat
  model's own cross-layer alias import. A module's own root file may relatively
  import anything inside its own module, unconstrained; an inner layer relatively
  reaching back to its own module's root files is caught the same way leaving any
  other layer is.
- **`selfOnly` at both depths.** A layer's `allowedImporters` entry can still mark
  `selfOnly` within a module; a module's own `allowedImporters` entry can mark it too
  — an importer may depend on the module but never re-export it onward, caught even
  at the module's bare entry spelling, not only one segment deeper.
- **No `imports` field.** An earlier draft proposed isolation by default (every
  cross-module edge hand-declared). Reconfirmed against `allowedImporters`'
  declared-order-implies-default-permission instead, matching the layer model
  exactly — a module boundary still deserves a greppable edge where one narrows, but
  forcing every edge (not just the exception) to be written out breaks the
  "majority direction is free" authoring flow the rest of this tool depends on.

`emitLint` is the only emitter that reads any of this yet — the import-graph node
identity `deps` and `analyze` use (`moduleKey` / `buildModuleGraph`), and the
`rules` / `doctor` / `impact` consumers, are follow-up work.
