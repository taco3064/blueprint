# Flat or Modular — the root structure

**Where the one-way flow starts.** Either the technical layers sit at the source root
and every feature is spread across them (`flat`), or feature modules sit at the root
and each one holds its own copy of those layers (`modular`).

`init` will not pick for you on a fresh tree. It refuses and names the flag:

```
✗ blueprint init needs --structure here: 0 source files, below the brownfield threshold (10) — there is nothing here to measure, so this is your call, not a detection failure.

  blueprint init --structure flat      the layers at the source root:
                                       src/components/, src/services/
  blueprint init --structure modular   feature modules at the source root, each
                                       holding those layers: src/<module>/services/

init refuses rather than picking one because this is the one choice here that is expensive to undo: the config migration is free, the file migration is not — switching later moves every file under src/. Above the threshold init never asks; it reads the layout you already have.
```

That is the whole reason this page exists: the refusal states the trade-off and
cannot draw you the two trees. Here they are.

## The two trees

Both are `reactPreset()` — the only difference is `structure`. Each tree below is
what the tool itself produces: the folders are `init`'s own plan output, and the
annotated blocks are copied out of the `docs/architecture-handbook.md` that the same
run wrote.

### `flat` — `reactPreset({ name: 'my-app' })`

```
src/
├─ pages/         # route layout — assembles containers
├─ containers/    # a feature: assembly, local state, calls services
├─ components/    # reusable, presentational UI
│  └─ Example/
│     ├─ index    # public entry — the only importable file
│     └─ Example  # implementation (named after the unit)
├─ hooks/         # adapts server and shared state; owns the store
├─ contexts/      # defines and provides Context / Provider only
└─ services/      # network primitives
```

Six layers, in flow order: a layer may import only the layers below it.
`src/components/Example/` is one **unit** — a folder behind a public entry.

### `modular` — `reactPreset({ name: 'my-app', structure: 'modular' })`

```
src/
├─ app/              # a module — its root composes the layers below
│  ├─ index          # the module's public surface — always `index`
│  └─ components/    # a layer, inside the module
│     └─ Example/
│        ├─ index    # the unit's entry — the only importable file
│        └─ Example  # implementation (named after the unit)
└─ common/           # another module — same shape, its own layers
```

Two flows, one inside the other. Modules flow one way at the root — a module may
name only modules declared *after* it — and inside each module the layers flow one
way exactly as they do under `flat`.

## The layer lists are different, and that is the point

You cannot read one tree off the other, because the modular preset does not ship
the same layers:

- **`flat`** — `pages` → `containers` → `components` → `hooks` → `contexts` → `services`
- **`modular`** — `components` → `hooks` → `contexts` → `services`

**`pages` and `containers` are deleted, not renamed.** Routing moves into the `app`
module, and what `containers` used to be — the thing that assembles a feature — is
now the module's own root. The module root is the implicit top layer, so it is not a
name in the list.

The preset also declares the two modules it can name without inventing a domain:

- **`app`** — routing and app-wide composition: the route tree, and what every screen is mounted inside. Declared first, so nothing may name it
- **`common`** — what more than one module needs and no single module owns. Declared last, so anyone may name it

No feature module ships, because a preset knows no domain. You add one folder per
domain under `src/` as they appear and declare each in `architecture.modules`.

## What else changes

Declaring `architecture.modules` changes the vocabulary of the whole config, so a
handful of things move with it:

- **Six findings only exist under `modules`** — `undeclared-module`, `missing-module`,
  `root-import`, `module-escape`, `undeclared-dependency`, `module-reexport` — and
  `undeclared-folder` is replaced by `undeclared-module`. Three more (`deep-import`,
  `no-entry`, `package-ownership`) start answering at two levels, and each message
  names the level it means. The full list is on the
  [checks reference](/guide/reference#what-inspect-reports)
- **Two more lint rules are emitted** — `blueprint/no-module-root-import` and
  `blueprint/no-module-reexport`, both structural and neither openable by a
  `blueprint.rules` id
- **A module reaches only what it declares.** `imports` is the whole list, and
  omitting it means none — the opposite of the layer default, where every earlier
  layer may import a later one until `allowedImporters` narrows it
- **A module can own primitives too.** `owns` on a module bars every *other* module,
  the way a layer's `owns` bars every other layer
- **`layers: false`** opts a module out of the inner layer vocabulary — how a routing
  module is expressed — and out of nothing else: `imports`, the entry-only ban,
  `owns`, the metric gates and coverage all still reach inside it

## When modular is worth it

**Modules buy you width.** They are how you stop a repo where a feature's code is
smeared across six layer folders and no single directory is the feature. That
problem needs there to *be* several features with real separation — and most repos
do not have that yet.

The honest version is a measurement rather than a preference: a 48-source-file
project has no width to slice. Every layer folder holds a handful of files, one
domain owns nearly all of them, and cutting it into modules produces folders that
exist to satisfy the config. **Small projects are right to stay flat**, and staying
flat is not a decision to revisit until a second domain genuinely arrives.

Two more things worth weighing:

- **The config migration is free and the file migration is not.** Switching later
  moves every file under `src/`. That asymmetry is why `init` refuses rather than
  defaulting — the cost is not in the config, and the config is the only part a tool
  can fix for you
- **Next.js takes neither choice.** `nextPreset` refuses `structure` outright: the
  modular model has no Next layer list yet, and what `router` and `srcDir` mean once
  the route tree is a module is undecided. Declare `architecture.modules` yourself
  through `defineBlueprint` if you want to pick the layer list

## Declaring it

On a preset, it is one option:

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', structure: 'modular' });
```

There is no `structure: 'flat'` to write — flat is the default, so `init` writes no
`structure` field on that path. On a hand-written `defineBlueprint`, the same choice
is whether `architecture.modules` is present at all.

If the two disagree — the tree on disk matches one model and the config declares the
other — `inspect` reports [`structure-mismatch`](/guide/reference#what-inspect-reports)
before it judges any single declaration, and names the edit for each answer.
