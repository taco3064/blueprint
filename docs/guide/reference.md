# Checks & Config Reference

Everything blueprint can check, and every config field the guide pages don't walk
through — in one place. The [API Reference](/api/) has the full type signatures; this
page is the map.

## What `inspect` reports

Any `error`-level finding exits `1`; `warn` and `info` inform
without failing the gate. Test files (`architecture.testFiles`) are exempt throughout.

- **`undeclared-folder`** · error — a top-level source folder that is not a declared layer
- **`flow-violation`** · error — an upstream import, or a same-layer import via the alias
- **`deep-import`** · error — an alias import reaching *inside* a folder module instead of through its entry
- **`relative-escape`** · error — a relative import that leaves its own module, or escapes the source root
- **`package-ownership`** · error — importing a layer-owned package (or restricted named import) from a non-owner layer
- **`selfonly-reexport`** · error — re-exporting a dependency marked `selfOnly` — depend on it, never pass it on
- **`cycle`** · error — a module-level import cycle, with the full path listed
- **`no-entry`** · warn — a folder module without its public entry file — nothing is importable from outside
- **`missing-layer`** · info — a declared layer that has no folder on disk yet
- **`declaratory-self-only`** · info — a `selfOnly` ban protecting a layer that holds no files — the re-export ban cannot fire until code lands

On brownfield repos the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect)
turns this list into "fail only on *new* findings".

## The embedded ESLint plugin

`emitLint` ships custom rules inside the generated config — nothing extra to
install. One is structural and always on; the rest are gated by `blueprint.rules` ids.
The plugin object is also exported (`import { plugin } from '@kekkai/blueprint'`)
as the escape hatch for wiring a `blueprint/*` rule by hand in a config that does
not spread `emitLint` — everyone else never needs it:

- **`blueprint/relative-escape`** · always (structural) — relative imports must not leave their module; the depth-aware twin of inspect's finding
- **`blueprint/no-deep-watch`** · `rules.deepWatch` — no `deep: true` watches; they traverse the whole source on every change (Vue preset: `error`)
- **`blueprint/use-prefix`** · `rules.usePrefix` — exported functions in the hook layer must carry the `use` prefix (layer and prefix configurable)
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` — a `use`-prefixed file must actually call a reactive or lifecycle API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` — a test file must have a co-located, same-named source sibling
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` — a JS file must not contain only `@typedef` declarations (attached to `.js` only)

Three further rules are **managed** — compiled from `layers` / `owns` / `alias` and
owned by the emitter: `no-restricted-imports`, `no-restricted-syntax`,
`no-restricted-globals`. They cannot be set through `lintOverrides`; change the
blueprint instead.

## `blueprint.rules` — which ids actually gate

A rule id in `blueprint.rules` becomes a lint gate only if the machine can check it.
The gated set:

- **`maxLines`** → `max-lines` · error · 400
- **`maxLinesPerFunction`** → `max-lines-per-function` · warn · 100
- **`maxParams`** → `max-params` · warn · 3
- **`maxStatements`** → `max-statements` · warn · 15
- **`complexity`** → `complexity` · warn · 12
- **`unusedVars`** → `no-unused-vars` (TS-aware when the project is TS) · error
- **`fixtureImports`** → restricted fixture imports in production code · error (vue preset)
- **`cycles`** → inspect's `cycle` finding (module-level; `import/no-cycle` was dropped from the generated config — a slow per-file re-check of the same graph) · error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → the plugin rules above (see that section)

Any **other** id (e.g. `deadCode`) is documentation: it lands in the handbook and the
agent contract as a judgment the agent must hold, and is never presented as a hard
gate. That split is the [three-tier landing](/philosophy/#the-three-tier-landing).

This whole mapping is queryable in place: `npx blueprint rules` prints the catalog,
annotated with the declared tiers once a config exists.

One scope note that bites in practice: **`emit.lint.severity` covers only the
structural family** (`no-restricted-imports` / `-syntax` / `-globals` and
`blueprint/relative-escape`). Every rule in the list above keeps its own
`blueprint.rules` tier — setting severity to `warn` does **not** quiet `maxLines` or
`unusedVars`.

## Config fields beyond the quick-start example

The `defineBlueprint` example in [Getting Started](/guide/getting-started#the-blueprint)
shows the core. The rest, one line each — full shapes in the
[API Reference](/api/):

- **`architecture.sourceRoot`** — where layers live, relative to the project root. Default `src`; `.` for root-level layouts (e.g. Next.js without `src/`)
- **`architecture.additionalAliases`** — extra import roots beyond `alias` that participate in every structural ban
- **`architecture.testFiles`** — test glob(s) exempt from structural rules and metric gates (default `*.test.*` / `*.spec.*`)
- **`architecture.layerFiles` / `layerFilesIgnore`** — per-layer file globs when the framework defaults don't fit
- **`architecture.naming`** — naming conventions by concept (e.g. `{ hook: 'useX + reactivity' }`) — rendered into handbook + contract
- **`layer.module`** — per-layer override of the shared module shape — e.g. folder modules in one layer, flat everywhere else
- **`layer.lintOverrides`** — per-layer ESLint tweaks (the three managed rules excluded)
- **`emit.agents`** — contract distribution targets: `claude`, `agents`, `gemini`, `copilot`, `cursor`, `windsurf` (+ per-target `path`). Default `['claude', 'agents']`; `[]` emits none. Narrowing it makes the next init remove a stale contract that is wholly its own output (hand-edited files only get told)
- **`emit.handbook` / `emit.lint`** — output path for the handbook · severity of the **structural** rules only (metric rules keep their `rules` tiers)

## CLI flags

- **`init`** — `--agent claude|codex` (launch the authoring agent) · `--preset` (force the preset scaffold) · `--authoring` (force the playbook even on a small repo; opposite of `--preset`) · `--framework vue|react` · `--no-install` · `--dry-run`
- **`survey`** — `--alias <name>` (when tsconfig-paths detection finds none) · `--json`
- **`inspect`** — `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** — `--json`
- **`deps [module]`** — `--framework vue|react` · `--json`
- **`rules`** — `--json`
- **`doctor`** — `--json`

Every command also answers `--help`; the bare CLI answers `--version`.
