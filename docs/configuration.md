# Configuration

`blueprint.config.mjs` is the project architecture authority after adoption. Export either a
validated object from `defineBlueprint()` or one of the built-in presets:

```js
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: 'storefront',
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'pages', does: 'Route composition.' },
      { name: 'components', does: 'Reusable UI.' },
      { name: 'services', does: 'Network access.', owns: ['axios'] },
    ],
  },
});
```

`defineBlueprint()` validates immediately, and Blueprint validates a plain exported object again
when it loads the file. Unknown structural keys and incoherent graphs fail with a specific error
instead of being silently ignored. The generated [API reference](/api/) remains the signature-level
reference; this page explains how the fields work together.

The package has two declaration-backed public entry points. Use `@kekkai/blueprint` for authoring,
presets, emitters, and runtimes. `@kekkai/blueprint/operational-contract` exposes the typed
`OperationalText` renderers used by integration tooling that must compose Blueprint-owned runtime
or generated wording. It is not required for ordinary adoption; import the subpath instead of a
file below `dist/` when that integration surface is needed.

## Root fields

- **`name`**
  - Shape and default: optional `string`.
  - Purpose: Project name used in the handbook and Agent contract.
- **`framework`**
  - Shape and default: required `'vue' | 'react' | 'auto'`.
  - Purpose: Selects source globs and framework-specific rules. `auto` asks the runtime to detect the project.
- **`architecture`**
  - Shape and default: required `ArchitectureDef`.
  - Purpose: Source root, topology, dependency direction, unit layout, aliases, and ownership.
- **`rules`**
  - Shape and default: `Record<string, RuleSetting>`, default `{}`.
  - Purpose: Optional lint/runtime gates and documented judgments. No optional gate is enabled merely because an id has a fallback value.
- **`principles`**
  - Shape and default: `PrincipleDef[]`, default `[]`.
  - Purpose: Core engineering claims rendered into human and Agent guidance.
- **`componentShape`**
  - Shape and default: `AxisDef[]`, default `[]`.
  - Purpose: Independent component-design axes rendered as review guidance.
- **`playbook`**
  - Shape and default: `PlaybookSection[]`, default `[]`.
  - Purpose: Behavioral operating rules grouped by theme.
- **`emit`**
  - Shape and default: optional `EmitDef`.
  - Purpose: Handbook, Agent-contract, and structural-lint output policy.

## Architecture

### Alias and source root

```js
architecture: {
  alias: '~app',
  additionalAliases: {
    '@legacy': './src',
    '@shared': './src/shared',
  },
  sourceRoot: 'src',
  // ...
}
```

- **`alias`** is required and has no default. It is the canonical source-root spelling for imports
  that cross a governed module or layer boundary.
- **`additionalAliases`** maps existing alias names to project-relative roots for resolution and
  dependency diagnosis. They do not become alternate canonical spellings across boundaries.
  Repeating the canonical `alias` here is accepted only when its normalized target is the same
  source root. A different target is rejected during config validation, before lint emission,
  inspection, or migration advice can use the contradictory identity.
- **`sourceRoot`** defaults to `src`. Use `.` for a root-level source layout such as Next.js without
  `src/`. Lint, `inspect`, `deps`, generated guidance, and scaffold paths all resolve from it.

### Layer-first

Without `architecture.modules`, the physical model is `Layer → Unit`:

```js
architecture: {
  alias: '~app',
  layers: [
    { name: 'pages', does: 'Routes and page composition.' },
    { name: 'components', does: 'Reusable UI.' },
    { name: 'services', does: 'Network primitives.' },
  ],
}
```

Layer declaration order defines the default one-way flow: an earlier layer may import a later
layer, never the reverse. With the example above, `pages` may import `components` and `services`,
while `services` may not import either upstream layer.

### Module-first

`architecture.modules` selects the topology by presence:

- **Omitted** — layer-first.
- **`[]`** — a module-first runway: the topology is declared and no domain module exists yet.
  Every inner layer, rule, and doctrine already applies, and lint, `inspect`, `deps`, `doctor`,
  `impact`, the handbook, and Agent contracts all treat the application as module-first. An empty
  runway is intended, not incomplete adoption.
- **One or more modules** — module-first with instantiated domain modules.

With declared modules, the physical model is `Module → Layer → Unit` for ordinary modules:

```js
architecture: {
  alias: '~app',
  modules: [
    { name: 'checkout', does: 'Checkout flow.', dependsOn: ['catalog'] },
    { name: 'catalog', does: 'Product discovery.' },
    { name: 'app', does: 'Router composition.' },
  ],
  layers: [
    { name: 'components', does: 'Module UI.' },
    { name: 'hooks', does: 'State adapters.' },
    { name: 'services', does: 'Data access.' },
  ],
  layerFiles: '{module}/{layer}/**/*.{ts,tsx}',
}
```

Each ordinary module repeats the same shared layer definition, and its root files take the
container position: they compose the module's inner layers and those of reachable modules, so a
layer-first `containers` layer is not repeated inside a module. `dependsOn` lists direct module
dependencies; permission follows transitive reachability through that graph, not declaration
order. A governed import must satisfy both the outer module graph and the inner layer flow.

Module names are unique even across case variants. Dependencies must name declared modules and may
not be empty, duplicated, self-referential, or cyclic.

`app` is optional and reserved. It models recursive router-composition source at the container
position; it is not an ordinary domain module and does not repeat the shared layers.

### Layer fields

- **`name`**
  - Shape and default: required non-empty `string`.
  - Meaning: Folder/layer identity. Names must be unique and cannot be paths or reserved generated-artifact names.
- **`does`**
  - Shape and default: required `string`.
  - Meaning: One-line responsibility rendered into generated guidance.
- **`mustNot`**
  - Shape and default: `string[]`, default `[]`.
  - Meaning: Prohibited responsibilities in prose; reviewed by people and Agents.
- **`layout`**
  - Shape and default: `'folder' | 'file'`, default `'file'`.
  - Meaning: Folder units have public entries; file layout uses layer-level dependency granularity.
- **`entry`**
  - Shape and default: `string`, default `'index'`.
  - Meaning: Public entry filename for folder-layout units.
- **`allowedImporters`**
  - Shape and default: optional `(string | AllowedImporter)[]`.
  - Meaning: Narrows which earlier layers may import this layer. Omission allows every earlier layer.
- **`owns`**
  - Shape and default: `OwnedPrimitive[]`, default `[]`.
  - Meaning: Packages, named imports, or globals that only this layer may use.
- **`lintOverrides`**
  - Shape and default: `Record<string, unknown>`, default `{}`.
  - Meaning: ESLint overrides for this layer. Blueprint-managed restriction rules cannot be overridden here.

An object-form importer adds `selfOnly` and `description`:

```js
{
  name: 'contexts',
  does: 'Context definitions and providers.',
  allowedImporters: [
    { layer: 'containers', description: 'Provider only' },
    { layer: 'hooks', selfOnly: true, description: 'Context only' },
  ],
}
```

`selfOnly` permits the dependency but blocks re-exporting it. Every importer must be a distinct,
earlier declared layer; the override can narrow the one-way graph but cannot introduce a back edge.

Ownership supports three forms:

```js
owns: [
  'axios',
  { package: 'react', imports: ['useContext'] },
  { package: '@company/*', pattern: true, exempt: ['**/*.adapter.ts'] },
  { global: 'WebSocket' },
]
```

- A string owns a complete package/module specifier.
- `{ package, imports }` owns only named imports; `pattern` treats the package as a glob group and
  `exempt` removes matching files from that restriction.
- `{ global }` owns a global that has no import declaration.

### File selection and naming

- **`layerFiles`**
  - Default: Framework-derived source globs.
  - Meaning: One glob or an array. Layer-first patterns contain `{layer}`; module-first patterns contain both `{module}` and `{layer}`.
- **`layerFilesIgnore`**
  - Default: none.
  - Meaning: Globs excluded from emitted lint and lint-backed findings. Other inspect analysis can still see them.
- **`testFiles`**
  - Default: `**/*.test.{js,jsx,ts,tsx,vue}` and `**/*.spec.{js,jsx,ts,tsx,vue}`.
  - Meaning: Test files exempted from structural/metric analysis and dependency graphs, and targeted by test-only rules. `[]` disables both the exemption and `testFilename` scope.
- **`naming`**
  - Default: `{}`.
  - Meaning: Human-readable conventions keyed by concept, rendered into the handbook and Agent contract.

Portable globs use `/`, `**`, `*`, `?`, and flat brace alternatives such as `*.{ts,tsx}`. Negation,
character classes, extglobs, and nested braces are outside the dialect shared by lint and inspect.

## Rules

A rule setting is a tier string or an object with a tier and options:

```js
rules: {
  maxLines: { tier: 'error', value: 400 },
  usePrefix: { tier: 'error', layer: 'hooks', prefix: 'use' },
  codeStyle: { tier: 'warn', indent: 2, quotes: 'single', semi: true, maxLen: 90 },
  deadCode: 'warn',
}
```

The valid tiers are `error`, `warn`, and `off`. A missing optional rule does not emit. For metric
rules, the fallback is used only when the rule is declared without `value`.

- **`maxLines`** — Enforced by `max-lines`; fallback `400`, code lines only.
- **`maxLinesPerFunction`** — Enforced by `max-lines-per-function`; fallback `100`, code lines only.
- **`maxParams`** — Enforced by `max-params`; fallback `3`.
- **`maxStatements`** — Enforced by `max-statements`; fallback `15`.
- **`complexity`** — Enforced by `complexity`; fallback `12`.
- **`unusedVars`** — Enforced by core or TypeScript-aware `no-unused-vars`; underscore arguments are ignored, but underscore variables are not an exemption.
- **`explicitAny`** — Enforced by `@typescript-eslint/no-explicit-any`; emitted only with the TypeScript plugin.
- **`codeStyle`** — Enforced by the `@stylistic` bundle plus `curly`; defaults to indent `2`, single quotes, semicolons, and maximum line length `90`.
- **`statementsPerLine`** — Enforced by `@stylistic/max-statements-per-line`; fixed maximum `1`.
- **`statementPadding`** — Enforced by `@stylistic/padding-line-between-statements`; fixed padding policy.
- **`importBlock`** — Enforced by `import-x/first` and `import-x/no-duplicates`; requires the import-x plugin.
- **`fixtureImports`** — Enforced by structural restricted imports; bans governed production imports from alias `fixtures` paths.
- **`deepWatch`** — Enforced by `blueprint/no-deep-watch`; Vue only.
- **`usePrefix`** — Enforced by `blueprint/use-prefix`; defaults to layer `hooks`, prefix `use`.
- **`usePrefixReactivity`** — Enforced by `blueprint/use-prefix-needs-reactivity`; checks `use`-named units for directly recognised reactive/lifecycle calls in the same file. It does not follow delegated hooks; a diagnostic is not proof of purity. Inspect composed hooks before renaming or moving code.
- **`testFilename`** — Enforced by `blueprint/test-filename-matches-source`; uses `architecture.testFiles` and is unavailable when that list is empty.
- **`typedefOnlyFile`** — Enforced by `blueprint/no-typedef-only-file`; JavaScript files only.
- **`cycles`** — Enforced by the `inspect` cycle finding for on-demand/CI graph diagnosis, not as an ESLint rule by default.
- **`deadCode` and unknown ids** — Generated guidance only; no machine gate. Use an appropriate external tool such as knip.

Structural rules are separate from this optional catalog. Dependency flow, module reachability,
canonical aliases, folder entries, relative escapes, ownership, and `selfOnly` restrictions compile
from `architecture` whenever `emitLint` runs.

Use `blueprint rules` to inspect the effective catalog for a real project. When manually calling
`emitLint`, third-party gates require their corresponding `typescript`, `stylistic`, or `imports`
plugin in `EmitLintOptions`; generated configs wire them for you.

## Principles, component shape, and playbook

These fields carry project-specific engineering doctrine without pretending every judgment can be
automated:

```js
principles: [{
  id: 'single-source',
  say: 'Keep one source of truth.',
  why: 'Derived values should not become duplicate mutable state.',
  land: 'claude',
}],
componentShape: [{
  id: 'narrow-inputs',
  name: 'Narrow inputs',
  say: 'Depend only on what the unit needs.',
  why: 'Small interfaces reduce coupling.',
  triage: 'max-params',
}],
playbook: [{
  title: 'Review',
  rules: [{ id: 'measure-first', say: 'Measure before optimizing.' }],
}],
```

- A principle requires unique `id`, `say`, `why`, and `land` (`lint` or `claude`).
- A component axis requires unique `id`, `name`, `say`, and `why`; `triage` can name a rule that
  points reviewers toward likely cases.
- Each playbook section has a non-empty `title`; rule ids are unique across every section and each
  rule has `say` plus optional `why`.

Vue and React presets supply Blueprint's standard doctrine. Custom configs may preserve it, replace
it, or omit it. See [Philosophy](/philosophy/) for the concepts rather than the data shape.

## Emit targets

```js
emit: {
  handbook: 'docs/architecture-handbook.md',
  agents: [
    'agents',
    { target: 'cursor', path: '.cursor/rules/architecture.mdc' },
  ],
  lint: { severity: 'warn' },
}
```

- **`emit.handbook`**
  - Default: `docs/architecture-handbook.md`.
  - Meaning: Project-relative handbook output path.
- **`emit.agents`**
  - Default: `['claude', 'agents']`.
  - Meaning: Contract targets. Valid targets: `claude`, `agents`, `gemini`, `copilot`, `cursor`, `windsurf`. Object entries may override the path. `[]` emits none.
- **`emit.lint.severity`**
  - Default: `'error'`.
  - Meaning: Severity for structural rules only. Optional `rules` retain their own tiers.

Agent targets must be unique and path overrides must be non-empty. Their default paths, merge/own
strategies, and lifecycle are listed in [Generated Files](/generated-files#agent-contracts).

## Presets

```js
import { nextPreset, reactPreset, vuePreset } from '@kekkai/blueprint';

export default vuePreset({ name: 'admin', alias: '~app' });
// export default reactPreset({ name: 'web', emit: { agents: ['agents'] } });
// export default nextPreset({ router: 'app', srcDir: true });
```

`vuePreset()` and `reactPreset()` provide the canonical one-way application layers, ownership,
rules, principles, component axes, and playbook. Their options are `name`, `alias` (default
`~app`), `emit`, and `modules`.

`modules` follows the same presence rule as `architecture.modules`. Omitted, the preset keeps its
layer-first layers. Given `[]` or declared modules, the preset projects onto module-first: `pages`
and `containers` leave the inner layers — route composition belongs to the reserved `app` module
and each module root takes the container position — while every other layer contract, rule,
principle, component axis, and playbook entry stays the same:

```js
// A proven-empty application adopted with --topology module-first:
export default reactPreset({ name: 'web', modules: [] });
```

`nextPreset()` uses React semantics while adapting the layer-first route tree to `app`, `pages`, or
`both`; `router` defaults to `app`. `srcDir: true` selects `src`, otherwise the source root is `.`.
Its alias defaults to `@`, and it deliberately does not reserve `fetch` to one layer because server
components can fetch across the route tree.

## The 3.2 to 4.0 boundary

A valid 3.2 config remains the authority for its existing layer-first project. Running 4.0 `init`
performs the supported normalization/repair path. If the same invocation requests module-first,
Blueprint first writes the normalized layer-first config as a recoverable checkpoint and stops at
that boundary. A later `init --topology module-first` starts the guarded transformation from the
now-explicit 4.0 authority; it does not reinterpret the old shape and move source in one step.
