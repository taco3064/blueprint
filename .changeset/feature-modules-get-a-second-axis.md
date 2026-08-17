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

**`doctor` and `rules --json` now agree with `emitLint` about a MODULE's owned
packages, globals, and selfOnly too — the first pass above closed the gap for
`deps` / `impact` / coverage and gave `rules` its module-flow section, but left
two narrower disagreements where a module's own `owns` / `allowedImporters`
diverged from what each still reported:**

- `doctor`'s merge-survival check (`wiringCheck`) resolved its probes AND its
  expectations from `architecture.layers` alone — one probe per bare layer name,
  built from `resolveLayerFiles('hooks', ...)`. Under a modular blueprint no real
  file ever matches that glob (a real file sits at `src/Combat/hooks/**`), so
  every probe missed and the check either read a false "lost" against files
  outside every real net, or — worse — proved nothing about a real module-scoped
  ban a merge had actually dropped. It now probes `resolveFileNets` — the same
  resolver `emitLint` compiles the config from, so a probe exists for a module's
  own root files and for each layer nested inside it — and builds its
  expectations from `emit/lint/bans.ts`'s own `resolveBanScope` / `netPatterns` /
  `netSelfOnly` / `netModuleSelfOnly` / `barredIn`, the exact functions `emitLint`
  itself compiles from, so the expectation and the real output are one function
  call rather than two hand-rolled ones that happened to agree. A merge that
  silently drops a module-scoped ban is now reported lost, by the net's name
  (`Combat`, or `Combat/hooks`), not silently green.
- `rules --json`'s per-layer view (`layerBans`) and its structural `active` flags
  (`resolveStructural`) read `architecture.layers` alone too — `!rule.allowedIn`
  `.includes(layer.name)`, never the layer's owning module. A selfOnly importer or
  an owned package/global declared only on a MODULE (stage 2's own cascade,
  already live in `emitLint`) reported `active: false` for a rule the emitted
  config actually carries, and a layer nested inside the owning module still
  showed the owned thing as banned there. Both now read the governed nets rather
  than the declarations: `no-restricted-globals` and the per-net package/global
  columns through `resolveBanScope`'s combined layer+module facts and `barredIn`,
  `no-restricted-syntax` through each net's own `netSelfOnly` /
  `netModuleSelfOnly` — so a selfOnly that no net actually carries (every module
  `layers: false`, leaving no net with a layer to hang it on) reports inactive,
  matching an emitted config that carries no such rule. Since the same bare
  layer name can be nested inside more than one module with a different cascade
  in each, `layerBans` now carries one row per net rather than one per bare layer
  name — a new `module` field on each row, and the printed/JSON `layer` label
  reads `Combat/hooks` once a row is module-nested, so two rows sharing a bare
  name stay distinguishable. `moduleBans` (the per-module flow section above) is
  unchanged.
- **`rules`' selfOnly selectors are now the ones a modular repo can actually
  paste.** `layerBans.selfOnly` built its selector from the bare layer name, so it
  printed `~app/contexts/…` — but inside a module the target really sits at
  `~app/Combat/contexts/…`. That column exists to be copied into a hand-merged
  flat config (`jsLiteral` exists solely so the paste survives), and `doctor`'s own
  failure message names `blueprint rules --json` as where to get "the exact
  selfOnly selectors" — so on a modular repo the one string this whole column is
  for matched no file it was meant to guard and silently protected nothing, while
  lint stayed green. It now comes from `emit/lint/bans.ts`'s `netSelfOnly` /
  `netModuleSelfOnly` per net, the same functions `emitLint` emits from, and
  module-level `selfOnly` (an `allowedImporters` entry on a MODULE) is reported at
  all for the first time — with `selfOnlyModuleReexportSelector`, which also
  matches a module's bare entry spelling, not only one segment deeper.
- **A module's own root files, and a `layers: false` module, get a row at all.**
  `layerBans` skipped every net with no layer, so a layered module's root-file
  group was missing and a `layers: false` module appeared in **no section of the
  catalog whatsoever** — `moduleBans` carries `forbidden` only, so the packages
  and globals it is barred from, and the same-module rule that its own files be
  reached relatively rather than through the alias, were reported nowhere. Those
  nets carry real bans (verified against `netPatterns` / `netSelfBanPaths`), so
  they are now rows, keyed by the bare module name, with a paragraph naming what
  such a row is (root files, or the whole module) and why its `no-import` is
  always `(none)`. `LayerBans.layer` is now `string | null` to carry them.
- Both outputs name a net the same way, through one shared `netLabel` in
  `emit/lint/nets.ts`: `doctor` reddens with `Lobby: no-restricted-imports lost …`
  and `rules` keys that net's row `Lobby`. Its own failure message sends the
  reader from the first to the second, and two spellings of one net's name was a
  bridge that reader had to build themselves.
- **`rules`' Per-module bans header no longer under-claims doctor.** It said the
  section was "NOT compared by doctor's survival check — that check is layer-scoped
  only", which the fix above makes false: `expectedStructural` now routes through
  `netPatterns`, which composes the cross-module flow bans, so a merge that drops
  one reddens by net name. It now says so, and states the narrower boundary that
  really does remain — the same-module rule's bare-entry half (`~app/<module>` as
  an exact `paths` entry; the check reads `patterns` only), which is what
  `--print-config` is still for there. The separate `packages` caveat is unchanged
  and still true: package ownership is genuinely not compared.

**Still open:** `analyze`'s own per-file findings (`flow-violation`,
`relative-escape`, `undeclared-folder`, `missing-layer`, package ownership, …)
do not yet know about `architecture.modules` — a module folder at the source
root still reads as an undeclared layer, and a bare cross-module import is not
its own `inspect` finding (it can still surface indirectly, if it happens to
close an import cycle). `emitLint`'s embedded rule already enforces the real
boundary regardless of this gap; making `inspect`'s own report agree is
follow-up work.
