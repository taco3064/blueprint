# Upgrading to 4.0.0

**Six things break, and they are ordered here by who meets them** — not by how
big they are. The first four reach a project that adopts nothing new in this
release; the last two reach nobody who does not declare `architecture.modules`.

There is a line partway down that says where a flat project stops reading. It is
measured rather than promised: on a flat project `blueprint rules` and
`blueprint deps` are unchanged in this release, text and `--json` alike, and the
emitted ESLint config enables the same fourteen rules over the same globs at the
same severities. What a flat project *does* see is the emitted **prose**: five
ban messages say *unit* where they said *module*, and the emitted handbook, agent
contract and authoring playbook drop a claim that was wrong — that a same-layer
import is banned outright. It never was. If you sank shared code into a lower
layer on that advice, the imports you were avoiding were legal.

The model itself is additive. Omit `modules` and the flat structure behaves
exactly as it did — [Flat or Modular](/guide/structure) draws both trees and is
where the choice belongs. This page is only about what you have to edit.

## 1. `blueprint init` refuses on a fresh tree

**Who this reaches: anyone who runs `init` on a tree below the brownfield
threshold.** It is the only break in this release that needs nothing of yours —
no config, no script, no baseline. A scripted `init` against a template repo
starts failing having changed nothing.

```bash
# before — 3.x
blueprint init                       # → flat config, exit 0

# after — 4.0.0
blueprint init                       # → exit 1, naming the option
blueprint init --structure flat      # → exactly what 3.x wrote
blueprint init --structure modular   # → feature modules at the source root
```

The refusal prints the file count against the threshold and both commands, so
the fix is in the output. It refuses rather than defaulting because the config
migration is free and the file migration is not: switching later moves every
file under `src/`.

**Two cases are never asked**, and neither is a change from 3.x. A repo above the
threshold (10 source files) has a layout to read, so `init` writes the authoring
playbook instead. A detected Next.js route tree scaffolds the Next preset and
says why the question was not put — `nextPreset` builds one shape and takes no
`structure`.

If you are choosing rather than restoring 3.x behaviour,
[Flat or Modular](/guide/structure) has both trees and the case for each.

## 2. `architecture.module` is deleted

**Who this reaches: every 3.x config, including a flat project adopting nothing
from this release.** This is the clause that gets missed. The module *shape* did
not disappear — it moved onto the layer that has it.

**Your 3.x config can spell it two ways, and both are gone:**

- `architecture.module` — the shared shape for every layer
- `architecture.layers[].module` — the per-layer override that narrowed it

```js
// before — 3.x, shared
architecture: {
  module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles'] },
  layers: [
    { name: 'components', does: 'Reusable, presentational UI' },
    { name: 'services', does: 'Network primitives' },
  ],
}

// before — 3.x, per-layer override
architecture: {
  layers: [
    { name: 'components', does: '…', module: { layout: 'folder', entry: 'index' } },
    { name: 'services', does: '…' },
  ],
}

// after — 4.0.0, both become the same thing
architecture: {
  layers: [
    { name: 'components', does: '…', layout: 'folder', entry: 'index' },
    { name: 'services', does: '…' },
  ],
}
```

**`private` is gone with no replacement**, and nothing is lost with it: the
entry-only ban already covers every non-entry file inside a folder unit, so the
list was not enforcing anything.

The config does not load until this edit is made — `defineBlueprint` throws, and
the message carries the replacement:

```
Unknown key "module" in architecture — nothing reads it, so the declaration is
silently dead. The module shape moved onto each layer in 4.0.0 — write `layout` /
`entry` there instead: layers: [{ name: 'components', does: '…', layout: 'folder',
entry: 'index' }] (entry defaults to "index", layout to "file"). `private` is gone
with no replacement: the entry-only ban already covers every non-entry file, so
nothing was enforcing it. Every 3.x config must make this edit, including a flat
project that is not adopting `modules`.
```

The per-layer spelling throws the same hint, naming the layer it found it on:
`Unknown key "module" in layer "components" — …`.

## 3. The layout value `'flat'` is now `'file'`

**Who this reaches: you, while you are making edit 2.** This is not a separate
field to search your 3.x config for — `layers[].layout` did not exist in 3.x, so
there is nothing there to find. The value is what carries over.

In 3.x the word lived inside whichever `module` block you had — the shared
`architecture.module.layout`, or a layer's own
`architecture.layers[].module.layout` — and in both it took the same two values,
`'folder' | 'flat'`. Edit 2 tells you to move `layout` onto the layer, and if you
transcribe the value with it you arrive at `layout: 'flat'` — which 4.0.0
rejects, whichever spelling you started from. That is the whole of this entry.

```js
// what edit 2 produces if you carry the old value across
layers: [{ name: 'components', does: '…', layout: 'flat' }]   // → throws

// after
layers: [{ name: 'components', does: '…', layout: 'file' }]   // → same shape
layers: [{ name: 'components', does: '…' }]                   // → also the same shape
```

`'flat'` was renamed because `structure: 'flat' | 'modular'` now needs that word
for the root shape, and one config file cannot spell two different axes the same.
`'folder'` is untouched, and so is the default.

It fails at load rather than at lint time, and says which edit to make:

```
Layer "components" has layout "flat", renamed to "file" in 4.0.0 — same shape,
one file per unit: layers: [{ name: 'components', does: '…', layout: 'file' }].
Omitting the key resolves to it too, so deleting the line is the other valid edit.
```

## 4. A version-2 baseline is refused

**Who this reaches: every project holding a `.blueprint-baseline.json`, flat or
modular.** It is one command, it records the same debt, and it suppresses nothing
that was not suppressed before:

```bash
npx @kekkai/blueprint inspect --update-baseline
```

The file moves from version 2 to version 3 because a finding id is part of an
entry's key, and `relative-escape` split into three ids — `src-escape`,
`entry-bypass` and `layer-escape` — each naming the move that is legal for it.
Entries recorded under the old id no longer match, so the file is refused rather
than reinterpreted: read under the new ids it would suppress nothing and report
your whole accepted ledger as fresh debt.

The refusal names your file's version and what changed for it. Full background,
including the earlier version-1 move:
[Upgrading with a baseline already on disk](/guide/getting-started#upgrading-with-a-baseline-already-on-disk).

**This is the only baseline migration in 4.0.0.** In particular a `cycle`
finding's address did not change: it is still a module graph node key relative to
the source root, no baseline entry moves, and no upgrade turns a suppressed
cycle fresh.

## A flat project stops here

**If your `blueprint.config.mjs` has no `architecture.modules`, you are done.**

Entries 5 and 6 are `--json` shape changes on two commands, and both were
measured on a flat project against `v3.1.0`:

- **`blueprint rules --json`** — every row is `zone: "layer"` and every row
  carries `layer`, exactly as before. Two keys arrive that `v3.1.0` did not
  emit — `zone`, and a `moduleRoot` that is always `[]` on a flat project. Both
  are additions beside what you already read rather than changes to it, so
  nothing a 3.x consumer keyed on has moved
- **`blueprint deps --json`** — the top-level keys are `modules`, `skipped` and
  `derivation`, and `modules[].module` holds what it always held. There is no
  `units` key on a flat project at all

Read on only if you are declaring `architecture.modules` *and* something of yours
reads those two outputs as JSON. Nothing throws for either one — a consumer reads
a key that is no longer what it was and gets on with it — which is why they are
written down here rather than reported by the tool.

## 5. `blueprint rules --json` rows are discriminated by `zone`

**Who this reaches: a program reading `rules --json` on a modular repo.** The
authoring playbook sends an adopting agent to this output in five places, so
"a program" includes blueprint's own documented workflow.

Under `modules` the emitted config holds one ban set per *(module, layer)* rather
than one per layer, plus a set for each module's own root. So the rows gained a
`zone`, and **`layer` is absent on two of the three zones**:

```
zone=layer    layer present    one row per (module, layer)
zone=root     layer ABSENT     one per layered module — its own root
zone=module   layer ABSENT     one per `layers: false` module — the whole module
```

**The `root` rows are the ones to plan for.** They need nothing declared: a
config with two plain modules and no `layers: false` anywhere already emits one
per module. A consumer reading `layer` unconditionally breaks there first, not on
the rarer `module` row.

```js
// before — 3.x, and still true of a flat project
for (const row of bans) index[row.layer] = row;

// after — row.layer is undefined on a root or module row
for (const row of bans) {
  index[row.zone === 'layer' ? `${row.module}/${row.layer}` : row.module] = row;
}
```

`module` is present on every row under `modules`, so it is the field to key on;
`layer` narrows it when the zone says there is one.

If you paste selectors by hand, `jsLiteral` sits on each entry of the row's
`selfOnly` array — alongside `target`, `selectors` and `note` — and it is the
field that survives a paste. Take it from the row for the entry you are actually
merging with: a neighbour's selector is a different string, and pasting the wrong
one installs a rule that matches nothing with lint green over it.

## 6. `blueprint deps --json`: `module` changed meaning

**Who this reaches: a program reading `deps --json` on a modular repo.** This one
is worse than a rename, because nothing about the key looks different: `module`
keeps its name and stops meaning what it meant.

- **In 3.x**, and in 4.0.0 on a flat project, `modules[].module` is the layer's
  child — `components/Button`, `services/api`. Granularity follows each layer's
  `layout`, not the version: a `folder`-layout layer answers per child, and
  `reactPreset` and `vuePreset` declare `folder` on every layer they ship
- **A `file`-layout layer** collapses to one node, and only there is the value a
  bare layer name — `components`, `services`. That is what `nextPreset` ships,
  and what omitting `layout` resolves to. In 3.x that layer spelled the value
  `'flat'` and answered the same way; entry 3 is that rename
- **Under `architecture.modules`**, `modules[].module` is the **feature** —
  `Fighter`, `Combat` — and the inner thing moves to a new `units` array, keyed
  `unit`, with the module it lives in beside it

```jsonc
// after — modular. Both granularities are present, and they are different questions
{
  "modules": [
    { "module": "Fighter", "importedBy": [], "imports": [] }
  ],
  "units": [
    {
      "unit": "Fighter/components",
      "importedBy": [],
      "imports": [],
      "module": "Fighter",
      "moduleImportedBy": []
    }
  ]
}
```

A consumer that fed `modules[].module` to something expecting a layer keeps
running and starts answering about features. **The check that finds it is whether
`units` is present** — it is absent on a flat project and present whenever
modules are declared.

The text output says the same thing with both rankings labelled, since one list
silently answers whichever question the reader did not ask:
[Blast Radius — deps](/guide/deps).
