# Checks & Config Reference

Everything blueprint can check, and every config field the guide pages don't walk
through — in one place. The [API Reference](/api/) has the full type signatures; this
page is the map.

## What `inspect` reports

Ten finding kinds. Any `error`-level finding exits `1`; `warn` and `info` inform
without failing the gate. Test files (`architecture.testFiles`) are exempt throughout.

| Rule | Severity | What it catches |
| --- | --- | --- |
| `undeclared-folder` | error | A top-level source folder that is not a declared layer |
| `flow-violation` | error | An upstream import, or a same-layer import via the alias |
| `deep-import` | error | An alias import reaching *inside* a folder module instead of through its entry |
| `relative-escape` | error | A relative import that leaves its own module, or escapes the source root |
| `package-ownership` | error | Importing a layer-owned package (or restricted named import) from a non-owner layer |
| `selfonly-reexport` | error | Re-exporting a dependency marked `selfOnly` — depend on it, never pass it on |
| `cycle` | error | A module-level import cycle, with the full path listed |
| `no-entry` | warn | A folder module without its public entry file — nothing is importable from outside |
| `missing-layer` | info | A declared layer that has no folder on disk yet |
| `declaratory-self-only` | info | A `selfOnly` ban protecting a layer that holds no files — the re-export ban cannot fire until code lands |

On brownfield repos the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect)
turns this list into "fail only on *new* findings".

## The embedded ESLint plugin

`emitLint` ships six custom rules inside the generated config — nothing extra to
install. One is structural and always on; five are gated by `blueprint.rules` ids:

| ESLint rule | Driven by | What it enforces |
| --- | --- | --- |
| `blueprint/relative-escape` | always (structural) | Relative imports must not leave their module — the depth-aware twin of inspect's finding |
| `blueprint/no-deep-watch` | `rules.deepWatch` | No `deep: true` watches — they traverse the whole source on every change (Vue preset: `error`) |
| `blueprint/use-prefix` | `rules.usePrefix` | Exported functions in the hook layer must carry the `use` prefix (layer and prefix configurable) |
| `blueprint/use-prefix-needs-reactivity` | `rules.usePrefixReactivity` | A `use`-prefixed file must actually call a reactive or lifecycle API |
| `blueprint/test-filename-matches-source` | `rules.testFilename` | A test file must have a co-located, same-named source sibling |
| `blueprint/no-typedef-only-file` | `rules.typedefOnlyFile` | A JS file must not contain only `@typedef` declarations (attached to `.js` only) |

Three further rules are **managed** — compiled from `layers` / `owns` / `alias` and
owned by the emitter: `no-restricted-imports`, `no-restricted-syntax`,
`no-restricted-globals`. They cannot be set through `lintOverrides`; change the
blueprint instead.

## `blueprint.rules` — which ids actually gate

A rule id in `blueprint.rules` becomes a lint gate only if the machine can check it.
The gated set:

| Id | Compiles to | Preset default |
| --- | --- | --- |
| `maxLines` | `max-lines` | error · 400 |
| `maxLinesPerFunction` | `max-lines-per-function` | warn · 100 |
| `maxParams` | `max-params` | warn · 3 |
| `maxStatements` | `max-statements` | warn · 15 |
| `complexity` | `complexity` | warn · 12 |
| `unusedVars` | `no-unused-vars` (TS-aware when the project is TS) | error |
| `fixtureImports` | restricted fixture imports in production code | error (vue preset) |
| `cycles` | inspect's `cycle` finding (module-level; `import/no-cycle` was dropped from the generated config — a slow per-file re-check of the same graph) | error |
| `deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile` | the plugin rules above | see table above |

Any **other** id (e.g. `deadCode`) is documentation: it lands in the handbook and the
agent contract as a judgment the agent must hold, and is never presented as a hard
gate. That split is the [three-tier landing](/philosophy/#the-three-tier-landing).

One scope note that bites in practice: **`emit.lint.severity` covers only the
structural family** (`no-restricted-imports` / `-syntax` / `-globals` and
`blueprint/relative-escape`). Every rule in the table above keeps its own
`blueprint.rules` tier — setting severity to `warn` does **not** quiet `maxLines` or
`unusedVars`.

## Config fields beyond the quick-start example

The `defineBlueprint` example in [Getting Started](/guide/getting-started#the-blueprint)
shows the core. The rest, one line each — full shapes in the
[API Reference](/api/):

| Field | What it does |
| --- | --- |
| `architecture.sourceRoot` | Where layers live, relative to the project root. Default `src`; `.` for root-level layouts (e.g. Next.js without `src/`) |
| `architecture.additionalAliases` | Extra import roots beyond `alias` that participate in every structural ban |
| `architecture.testFiles` | Test glob(s) exempt from structural rules and metric gates (default `*.test.*` / `*.spec.*`) |
| `architecture.layerFiles` / `layerFilesIgnore` | Per-layer file globs when the framework defaults don't fit |
| `architecture.naming` | Naming conventions by concept (e.g. `{ hook: 'useX + reactivity' }`) — rendered into handbook + contract |
| `layer.module` | Per-layer override of the shared module shape — e.g. folder modules in one layer, flat everywhere else |
| `layer.lintOverrides` | Per-layer ESLint tweaks (the three managed rules excluded) |
| `emit.agents` | Contract distribution targets: `claude`, `agents`, `gemini`, `copilot`, `cursor`, `windsurf` (+ per-target `path`). Default `['claude', 'agents']`; `[]` emits none. Narrowing it makes the next init remove a stale contract that is wholly its own output (hand-edited files only get told) |
| `emit.handbook` / `emit.ci` / `emit.lint` | Output path for the handbook · CI provider (`github` / `none`) · lint config path + severity of the **structural** rules only (metric rules keep their `rules` tiers) |

## CLI flags

| Command | Flags |
| --- | --- |
| `init` | `--agent claude\|codex` (launch the authoring agent) · `--preset` (force the preset scaffold) · `--authoring` (force the playbook even on a small repo; opposite of `--preset`) · `--framework vue\|react` · `--no-install` · `--dry-run` |
| `survey` | `--alias <name>` (when tsconfig-paths detection finds none) · `--json` |
| `inspect` | `--baseline` · `--update-baseline` · `--framework vue\|react` · `--json` |
| `impact` | `--framework vue\|react` · `--json` |
| `deps [module]` | `--framework vue\|react` · `--json` |
| `doctor` | `--framework vue\|react` · `--json` |

Every command also answers `--help`; the bare CLI answers `--version`.
