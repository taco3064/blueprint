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
      { name: 'components', does: 'Presentation UI, including feature-private components.' },
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
    { name: 'components', does: 'Presentation UI, including feature-private components.' },
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

### Ordinary module root units

An ordinary module with immediate governed source files is one structural unit addressed by
its directory. It has exactly one supported `index.*` entry; all other direct source members
are private. External callers use the bare module alias (`~app/checkout`), never `/index` or a
private filename. Private members must be transitively reachable through imports/re-exports
from the entry. Inspect reports `orphan-root-file` for proven unreachable members, including
disconnected cycles; parse failures and runtime-dependent imports remain analysis limitations.
Missing or ambiguous entries must be resolved before orphan analysis can prove membership.

Declared inner-layer descendants remain separate units. A module with only inner layers needs
no root entry or empty barrel. Arbitrary child folders remain undeclared. Same-root relative
imports are permitted; crossings retain canonical alias and layer-entry rules. Inner layers
cannot import upward to the root. The reserved recursive `app` tree is exempt from these root
entry/private/orphan checks. Dependency identity remains the module/container, not private files.

Upgrading an older adoption across 4.2 requires manual `review-module-root-unit` confirmation.
An already valid root has a no-move path. Blueprint never chooses exports or synthesizes an
application API. Layer-first applications record that no module-root migration is needed.
Only unchanged canonical React/Vue preset guidance recommends `components` for presentation.
Every custom architecture requires an owner decision, even a `components` name or an apparently
unique `views.does` description. The runtime does not resolve responsibility prose, add a layer,
or edit the adopter's responsibilities. Private or single-consumer code is not thereby orchestration.

For LF → MF, retain original member paths, unit identities, layer definitions and custom entry
names in the transformation origin and exact member decisions. A merged MF root still retains
all contributing LF units. For MF → LF, valid retained origin restores each proven member to
its original unit, preserving entries such as `Screen`. The MF `index` requirement cannot rename
a historic LF entry. Only without retained origin may `containers/<module>` be proposed as a
fallback, subject to owner, collision and target-entry review. Incomplete, conflicting or unmapped
origin requires a decision; do not silently fall back, drop members or fabricate absent units.
New MF-only members require ownership decisions. Verify unique and complete destinations,
case-insensitive collisions, exports, rewritten references and final LF entry/dependency rules.
Historic restoration and semantic presentation placement are separate reviews: surface a conflict
instead of overwriting proven provenance. A bounded path verifier cannot prove arbitrary API edits.

### Layer fields

- **`name`**
  - Shape and default: required non-empty `string`.
  - Meaning: Folder/layer identity. Names must be unique and cannot be paths or reserved generated-artifact names.
- **`does`**
  - Shape and default: required `string`; must not be empty or whitespace-only.
  - Meaning: One-line responsibility rendered into generated guidance.
- **`mustNot`**
  - Shape and default: `(string | ExecutableMustNot)[]`, default `[]`.
  - Meaning: Ordered review-only doctrine and opt-in executable prohibitions. See [Executable mustNot](#executable-mustnot).
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

### External consumers

`architecture.consumerFiles?: string | string[]` explicitly declares source files that consume
governed application code while staying outside the Module → Layer → Unit topology. It defaults
to no consumers; omission and `[]` preserve existing behavior. A single string is shorthand for
one pattern. Non-string values and empty or whitespace-only patterns fail validation.

```js
consumerFiles: ['.storybook/preview.ts', 'e2e/**/*.{ts,tsx}', 'scripts/seed.ts'],
```

Patterns use the same portable matcher as `testFiles`, relative to the **Blueprint application
root**, not `sourceRoot` or the process temporary directory. `/`, `**`, `*`, `?`, and flat brace
alternatives are supported; negation, character classes, extglobs, and nested braces are not.
Pattern order and equivalent duplicates do not change classification.

Only scanned files outside `sourceRoot` can receive this role. A broad pattern such as
`**/*.stories.tsx` never exempts governed files inside it. With `sourceRoot: '.'`, there is no
outside-source set and no effect. Layer-first behavior is unchanged. No preset, framework, or
tool name automatically declares consumers; keep patterns narrow because broad declarations
can hide genuine outside-source mistakes.

In module-first scope analysis, a declared consumer importing governed source does not establish
`uncovered-application-source`. Governed source importing that consumer still does. Files are
classified before directories, so an undeclared importer in the same directory remains an error.
Consumers have no module, layer, unit, container, ownership, or public-entry identity and add no
`dependsOn`, unit-graph, or architecture-reach evidence. This is only a source-scope distinction:
it does not certify canonical aliases, legal deep imports, target APIs, or public-entry use.

`testFiles` keeps its separate policy and takes precedence, removing matching tests in both
directions before consumer classification. `layerFilesIgnore` cannot hide scope evidence;
scanner exclusions, `additionalAliases`, and baselines keep their existing roles. A declaration
does not move or scaffold files, expand scanning, or suppress other applicable findings. Generated
handbook and Agent guidance contain the declared patterns and contract, never a live matched-file
list. Activation is an owner decision; existing configurations need no migration.

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

## Executable mustNot

A layer can mix existing prose with explicit executable checks. Strings remain **review only**;
Blueprint never infers a check from prose, descriptions, layer names, or filenames. Existing React,
Vue, and Next preset strings retain their meaning, and old configs need no lifecycle rewrite.

```js
mustNot: [
  'change product policy',
  {
    id: 'render-ui',
    description: 'render UI',
    checks: [
      { capability: 'render-ui' },
      { package: 'leaflet' },
      { package: 'react-leaflet' },
      { package: 'react-leaflet-cluster' },
      { call: 'divIcon' },
    ],
    exempt: ['src/domain/approved-adapter.ts'],
  },
]
```

Checks in one entry have **OR semantics**: any matching check violates the prohibition. The id
must match `[a-z][a-z0-9-]*` and be unique within its layer. Descriptions, discriminant values, and
checks must be non-empty. Checks have exactly one of `capability`, `package`, `global`, or `call`;
unknown keys and capability ids fail closed. Normalized duplicate checks and duplicate or empty
`imports` names are rejected. Entry `exempt` uses portable project-relative globs and applies after
the structural file net, to every check in that entry. Declaration and check order remain visible.

A React-only capability is invalid under a concrete Vue config and conversely. `framework: 'auto'`
defers compatibility to project resolution; unresolved required framework/parser support is
unavailable evidence, never an invented source violation. Integrations calling `emitLint` directly
can supply `detectedFramework` for an authored `auto` config.

### Project checks

| Check | Exact reach and limits |
| --- | --- |
| `{ package: 'leaflet' }` | Bare package and `/` subpaths, not `leaflet-extra`. Scoped `@org/pkg` likewise excludes `@org/pkg-extra`. Unlike `owns`, this is package-family matching, not exact-path matching. Covers static and type-only imports/re-exports, proven `require()` and statically reduced dynamic imports. Runtime-dependent sources remain unverified. |
| `{ package: 'leaflet/*', pattern: true }` | Existing ownership/no-restricted-imports group semantics, with no implicit family expansion. |
| `{ package: 'react', imports: ['useState'] }` | Named exported identities in static imports and re-exports, including aliases and type-only forms. Does not infer CommonJS/dynamic namespace members, later property access, reassignment, or wrappers. Use a whole-package, capability, or call check for those needs. |
| `{ global: 'WebSocket' }` | Unshadowed references in value and supported type positions. Declarations, keys, labels, literals, and local bindings are legal. Unsupported reference spaces make coverage unavailable. |
| `{ call: 'divIcon' }` | Direct calls and terminal members, including `L.divIcon()`, `L['divIcon']()`, and optional calls in JS/TS and SFC scripts. Syntactic name matching can flag an unrelated object's method. No destructuring aliases, wrappers, reassignment tracing, runtime-computed names, constructors, or Vue template calls. |

### Capability detector catalog

Framework calls follow proven imported aliases and namespace members, never unrelated local
functions. React classes must extend a proven React `Component` or `PureComponent` binding.

| Capability | Signals |
| --- | --- |
| `render-ui` | JSX elements/fragments; Vue templates with renderable elements, components, interpolation, or non-whitespace text; React `createElement`; Vue `h`/`createVNode`; React class `render` methods. |
| `react-state` | React `useState`, `useReducer`, `useSyncExternalStore`; React class `state` ownership or `setState` use. |
| `react-lifecycle` | React `useEffect`, `useLayoutEffect`, `useInsertionEffect`; class lifecycle declarations listed below. |
| `vue-reactivity` | Vue `ref`, `shallowRef`, `reactive`, `shallowReactive`, `customRef`, `computed`, `toRef`, `toRefs`. |
| `vue-lifecycle` | Vue `onBeforeMount`, `onMounted`, `onBeforeUpdate`, `onUpdated`, `onBeforeUnmount`, `onUnmounted`, `onActivated`, `onDeactivated`, `onErrorCaptured`, `onRenderTracked`, `onRenderTriggered`, `onServerPrefetch`. |
| `routing` | Proven package references, including subpaths/type-only references, to `react-router`, `react-router-dom`, `vue-router`, `next/router`, `next/navigation`, `next/link`. |
| `network-io` | Unshadowed direct `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon`. |
| `browser-dom` | Unshadowed direct `window`, `document`, `navigator`, `HTMLElement`, `Element`, `Node`, `EventTarget`, `CustomEvent`, `MutationObserver`, `ResizeObserver`, `IntersectionObserver`, `localStorage`, `sessionStorage`, `location`, `history`, `customElements`, `getComputedStyle`. |

React lifecycle declarations are `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`,
`shouldComponentUpdate`, `getSnapshotBeforeUpdate`, `getDerivedStateFromProps`,
`getDerivedStateFromError`, `componentDidCatch`, `componentWillMount`, `componentWillReceiveProps`,
`componentWillUpdate`, `UNSAFE_componentWillMount`, `UNSAFE_componentWillReceiveProps`, and
`UNSAFE_componentWillUpdate`. Arbitrary classes with these names are legal controls.

No detector proves indirect behavior through wrappers, dependency injection, application
abstractions, runtime execution, or cross-file value flow. Passing means only that documented
signals were absent in files actually reached.

### Availability, severity, wiring, and reach

One resolved plan feeds lint, Rules, Inspect, Doctor, and generated guidance. Strings have mode
`review-only` and no carrier. Executable entries are `active` when all checks are available,
`partial` when only some are available, and `unavailable` when none are. Available checks in a
partial entry still enforce. These availability facts are independent of effective lint wiring
(`verified`, `unverified`, or `reference-only`) and reach (`covered`, `vacuous`, `runway`, or
`unmeasured`). An empty concrete position is vacuous; `modules: []` is a future module runway.
Neither proves protection. Reserved `app` uses its container role, not repeated inner layers.

| Evidence | Gate evidence | Exit and completion |
| --- | --- | --- |
| Proven match at `emit.lint.severity: 'error'` | `failed` | `affectsExit: true`; enforcing lint exits nonzero; completion blocked. |
| Same match at `warn` | Visible non-blocking conformance observation | `affectsExit: false`; does not change aggregate gates or force a nonzero exit. |
| Partial/unavailable required detector | `unverified`, without an invented violation | Does not automatically change CLI exit; completion blocked regardless of severity. |
| Proven missing, disabled, replaced, or mismatched carrier | `failed` | Existing Doctor failure behavior; completion blocked even at warn. |
| Uninspectable effective config | `unverified` | Completion blocked, not automatically a nonzero exit. |
| Available checks, intact carrier, no error match | `passed` | Warnings may coexist; other completion requirements still apply. |

Failed and unverified facts both remain visible in mixed cases; failed takes aggregate precedence.
Lint alone detects source violations. Inspect measures reach without a second AST detector, and
static Rules cannot claim a live match. Doctor verifies normalized checks against final merged
ESLint configuration using representative/synthetic files, including empty positions. The managed
`blueprint/must-not` carrier cannot be disabled or replaced through `lintOverrides`.

Structural `sourceRoot`, layer/module globs, framework extensions, `layerFilesIgnore`, and
`testFiles` scope apply before per-entry exemptions. No new Inspect exit policy is introduced.
