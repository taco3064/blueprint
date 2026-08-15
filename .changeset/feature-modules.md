---
'@kekkai/blueprint': minor
---

**Feature modules: the one-way flow now runs at two depths.** Declare
`architecture.modules` and the top of your source tree holds features rather than
layer folders, with the layers living inside each one. A module is isolated until
it names a dependency, and it may only name modules declared after it — so the
graph is one-way and acyclic because of how it is written down, rather than
because something checks it later.

```js
architecture: {
  alias: '~app',
  modules: [
    { name: 'app',       does: 'Routing only.', layers: false,
      imports: ['GameStage', 'Session'] },
    { name: 'GameStage', does: 'The run, rendered.', imports: ['Combat', 'Session'] },
    { name: 'Combat',    does: 'Bullets, collisions, damage.', imports: ['Session'] },
    { name: 'Session',   does: 'The run state machine.' },
  ],
  layers: [ /* unchanged syntax — now describes what is inside one module */ ],
}
```

```
src/GameStage/GameStage.tsx    the module root — governed as the implicit top layer
src/GameStage/index.ts         the only address another module may write
src/GameStage/hooks/useRun/    a unit, inside a layer, inside a module
```

**Three boundaries this expresses that a layer flow cannot:**

- **A module reaches nothing it has not named**, and a module it has named only
  through that module's entry — `~app/Combat` resolves, `~app/Combat/hooks/useX`
  does not.
- **Nothing inside a layer may reach back up to its own module root**, at any
  spelling. The root composes the layers, so the fix is to move the shared part
  down into a layer or pass it in from the root.
- **A module may not pass another module's public surface through its own.** The
  rule follows the local binding rather than the path, so every spelling is one
  violation. A wrapper expressing this module's own responsibility is fine, and a
  wrapper added only to clear the rule is named in the message as the non-fix it
  is — no static tool can tell those apart, so the guarantee is stated at the
  width it actually holds.

**A module may opt out of the inner layers with `layers: false`.** That is how a
routing module is expressed — a capability, never a reserved name, because
file-based routing exists well beyond Next and each router brings its own folder
vocabulary. It drops the layer flow, not governance: the module's declared
`imports`, the entry-only ban, `owns`, the metric gates and coverage all still
reach inside it.

**Every command already speaks it**, because a structure only half the tooling
understands is worse than no structure:

- **`init --structure flat|modular`** scaffolds it, and the presets take the same
  option directly — `reactPreset({ name: 'sky-1945', structure: 'modular' })`.
  Under `modular` a preset drops the two layers that dissolve: routing moves to a
  module, and a module's own root is what `containers` used to be.
- **`inspect`** reports an undeclared module, a declared module with no folder, a
  module whose folder holds code but carries no entry, a layer no module uses,
  and every cross-module edge. An undeclared module finding hands over a draft
  rather than a demand: the import graph knows both halves of a declaration, so
  it names the legal interval — *after `GameStage`, before `Session`* — and
  leaves the choice with you.
- **`impact`** takes its lint targets from the same per-module glob set the
  emitted config is built from, rather than walking the layers a second time —
  split, the two answers diverge under `modules` and the number it reports is
  about neither the config blueprint emitted nor the files it linted.
- **`deps`** addresses both meanings of the word: `blueprint deps GameStage` is
  the feature, `blueprint deps GameStage/hooks/useRun` is the unit, and the
  leaderboard prints both rankings labelled, since one list silently answers
  whichever question you did not ask.
- **`survey`** says which shape your tree already is, with the evidence that
  decided it, before the rows that depend on the answer — a `hooks` row means a
  layer on one shape and a module on the other. It answers "could not tell" where
  the evidence is thin, which is a real answer.
- **`doctor`** probes every emitted entry rather than one per layer, so a merge
  that keeps one module's rules and silently replaces the rest is a named loss
  rather than a green run.
- **`rules`** reports one row per emitted entry, addressed `GameStage/hooks` and
  carrying that module's own selectors — which matters because the authoring
  playbook sends an adopting agent to that output to paste from, and a
  neighbour's selector installs a rule matching nothing with lint green over it.
- **The emitted handbook and agent contracts** carry the module dimension: what
  each module may reach, whether it is layered, what it owns, and the tree at
  full depth.

**When your `structure` choice does not match your tree, that is one decision,
not N declarations.** A flat tree under `structure: 'modular'` used to draw only
a finding per folder, each correct about itself and none in a position to see
that *every* top folder was undeclared while *every* declared module was
absent — followed one at a time they talk you into declaring your layer names
as modules. `structure-mismatch` lands above the findings it is built from, states
the ratios, offers the other structure, and hands back the one question only you
can answer: are these folders layers, or modules? **The per-folder findings all
still print, and the summary still counts them** — the new finding names them as
its evidence rather than replacing them, because suppressing what a verdict is
derived from leaves you nothing to check it against. So the report grows by one
error rather than collapsing to one: three undeclared folders print four errors,
and the first of them is the one to act on.

**Flat stays first-class.** Omit `modules` and none of this is in force and
nothing in your project moves — a small project is right to stay flat and is
never told it is on a legacy path. One trade is worth knowing before you pick:
the config migration is free and the file migration is not, so switching later
moves every file under `src/`.
[Flat or Modular](https://taco3064.github.io/blueprint/guide/structure) draws
both trees and makes the case for each.
