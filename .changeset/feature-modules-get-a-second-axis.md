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

**`deps`, `rules`, `doctor`, and `impact` now agree with `emitLint` about what a
modular repo governs — they no longer silently mistake a module for a layer.**
Before this, all four assumed the flat structure: `moduleKey` / `buildModuleGraph`
read `segments[0]` as a layer name, so `blueprint deps` on a modular repo reported
an empty leaderboard (every file dropped by a filter that never matched); `inspect`
coverage and `blueprint impact` built their file nets from the bare layer globs
alone, so a module's files always read as ungoverned and `impact` always linted
zero files; `blueprint rules` had no module-axis section at all, so a cross-module
ban `emitLint` enforced was invisible to the catalog.

- `deps`: `moduleKey` / `buildModuleGraph` gain the module dimension in their
  segment arithmetic (module at `segments[0]`, layer at `segments[1]`, a
  folder-layout feature-folder at `segments[2]`) — the same either/or a module's
  own alias-reach already uses. `blueprint deps <target>` also strips a declared
  `sourceRoot` (single- or multi-segment) instead of a hardcoded `'src'`.
- `inspect` coverage and `impact`: both now build their file nets from
  `emitLint`'s own resolver (`resolveFileNets` / `allNetFiles`), so a module's own
  root files and its files nested a layer deep are counted and linted, not
  silently excluded for having no bare layer glob to match.
- `rules`: a new **Per-module bans** section, from the same `getForbiddenModules`
  primitive `emitLint` reads — the module-axis twin of the existing per-layer
  bans table.

**Still open:** `analyze`'s own per-file findings (`flow-violation`,
`relative-escape`, `undeclared-folder`, `missing-layer`, package ownership, …)
do not yet know about `architecture.modules` — a module folder at the source
root still reads as an undeclared layer, and a bare cross-module import is not
its own `inspect` finding (it can still surface indirectly, if it happens to
close an import cycle). `emitLint`'s embedded rule already enforces the real
boundary regardless of this gap; making `inspect`'s own report agree is
follow-up work.
