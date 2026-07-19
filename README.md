[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)

**English** | [繁體中文](https://github.com/taco3064/blueprint/blob/main/README.zh-TW.md)

# @kekkai/blueprint

**Architecture as Code** — Blueprint turns frontend architecture into something that can be
understood by developers, enforced by tooling, and executed by coding agents.

## 🔍 What Problem Does This Solve?

In most projects, architecture lives in three disconnected places:

- A docs page nobody updates
- A lint config that enforces only a fraction of it
- The instructions you paste into every coding-agent session

The three drift apart, and every agent session re-negotiates the architecture from scratch.

`@kekkai/blueprint` treats architecture as a **compiler problem**: one Blueprint config is the
single source of truth, and everything else is a compile target —

| Target | Emitter | Output |
|---|---|---|
| Enforce | `emitLint` | An ESLint flat config + an embedded plugin |
| Explain | `emitHandbook` | A human handbook (markdown + mermaid) |
| Collaborate | `emitAgentFiles` | Agent contracts across tool files |
| Gate | `emitCi` | A GitHub Actions workflow |

> ⚠️ **ESLint v9+ Required**
>
> The emitted config is **Flat Config only**. If your project still uses legacy
> `.eslintrc`, migrate first.

## ✨ Core Ideas

1. **One source, many targets**
   - Layers, module shape, ownership, principles, component-shape axes, and the working
     playbook are declared once in `blueprint.config.mjs`
   - Docs, lint, agent contracts, and CI are generated from it — they cannot drift apart

2. **Acyclic by construction**
   - Layers are ordered; the order *is* the one-way dependency flow
   - A layer restricts who may import it via `allowedImporters`, and every importer must be
     declared *earlier* — cycles are impossible to express, so no cycle detection is needed

3. **Judgment stays judgment**
   - What a machine can check becomes a lint gate (`error`) or a triage entry point (`warn`)
   - What only a reviewer can judge (component shape, backend boundaries, refactor
     discipline) is compiled into the handbook and the agent contract instead — lint green
     never means "architecture correct"

## 📥 Installation

```bash
npm install -D @kekkai/blueprint eslint
```

Or let `blueprint init` install everything (including `eslint-plugin-import`,
`@eslint-community/eslint-plugin-eslint-comments`, and `knip`).

## 🚀 Quick Start

### Greenfield — `blueprint init`

```bash
npx @kekkai/blueprint init            # or: --framework vue|react, --dry-run, --no-install
```

One command scaffolds the whole operating contract:

- `src/<layer>/` folders for every declared layer
- `blueprint.config.mjs` (from the vue/react preset, or loaded if one exists)
- `eslint.config.mjs` — the blueprint-driven rules plus the third-party core
  (`import/no-cycle`, eslint-comments discipline)
- `docs/architecture-handbook.md` and agent contracts (`CLAUDE.md`, `AGENTS.md`, …)
- `compilerOptions.paths` wired into `tsconfig.json` / `jsconfig.json` — user files are only
  edited when they can be rewritten losslessly; anything else gets a paste-ready snippet
- `.github/workflows/blueprint-ci.yml` — lint + inspect as the architecture gate

### Brownfield — `blueprint inspect`

```bash
npx @kekkai/blueprint inspect         # or: --json
```

Read-only. Scans `src/`, checks it against the blueprint, and prints an **Architecture
Report** with migration steps: undeclared folders, flow violations, deep imports, package
ownership, relative escapes, missing module entries, selfOnly re-exports, and import cycles.
Any error-level finding exits `1`, so it drops straight into CI.

## 🧩 The Blueprint

```js
// blueprint.config.mjs
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'Reusable, presentational UI', mustNot: ['call services'] },
      { name: 'hooks', does: 'Adapts server and shared state' },
      {
        name: 'services',
        does: 'Network primitives',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: ['hooks'], // only hooks may import services
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
  rules: {
    maxLines: { tier: 'error', value: 400 },
    deepWatch: 'error',
    usePrefix: 'error',
  },
});
```

Or start from a canonical preset — `vuePreset()` / `reactPreset()` encode a full governance
handbook: six layers (`pages → containers → components → hooks → contexts → services`, no
`utils`), ten core principles, seven component-shape axes, and an eighteen-rule working
playbook.

### The `rules` record

Known ids compile into real gates; unknown ids stay documentation:

| id | Lands on |
|---|---|
| `maxLines` / `maxLinesPerFunction` / `maxParams` / `maxStatements` / `complexity` | ESLint built-in metric rules |
| `unusedVars` | `no-unused-vars` |
| `fixtureImports` | Fixture roots barred from production imports |
| `deepWatch` | `blueprint/no-deep-watch` (Vue) |
| `usePrefix` / `usePrefixReactivity` | Hook naming, both directions |
| `testFilename` | `blueprint/test-filename-matches-source` |
| `typedefOnlyFile` | `blueprint/no-typedef-only-file` (JS + JSDoc) |
| `cycles` | `import/no-cycle` in the generated config + `inspect` |
| `deadCode` | `knip` + `inspect` (deliberately not an ESLint rule) |

The embedded plugin ships *inside* the emitted config — nothing extra to install.

## 🤝 Agent Contracts

The same contract is distributed to every tool your team uses, from one compile:

| Target | File | Strategy |
|---|---|---|
| `claude` | `CLAUDE.md` | merge (marker block — hand-written content survives) |
| `agents` | `AGENTS.md` | merge |
| `gemini` | `GEMINI.md` | merge |
| `copilot` | `.github/copilot-instructions.md` | merge |
| `cursor` | `.cursor/rules/blueprint.mdc` | owned (frontmatter, overwritten) |
| `windsurf` | `.windsurf/rules/blueprint.md` | owned |

Defaults to `['claude', 'agents']`; configure via `emit.agents`.

## 📚 API

Everything below is exported from the package root. Every emitter is **pure and
deterministic** — the same blueprint always yields the same output.

### `defineBlueprint(config): Blueprint`

Validates referential integrity up front — duplicate layer names, importers that are not
declared earlier, overrides of managed lint rules, unknown agent targets, duplicate
axis/playbook ids — then returns the config unchanged. `validateBlueprint(config)` runs the
same checks standalone.

#### `Blueprint`

| Field | Type | Notes |
|---|---|---|
| `name?` | `string` | Handbook title / agent-contract context |
| `framework` | `'vue' \| 'react' \| 'auto'` | `auto` = detected at bootstrap time |
| `architecture` | `ArchitectureDef` | see below |
| `rules?` | `Record<string, RuleSetting>` | `'error' \| 'warn' \| 'off'`, or `{ tier, value?, …options }`; known ids in the table above |
| `principles?` | `PrincipleDef[]` | `{ id, say, why, land: 'lint' \| 'claude' }` |
| `componentShape?` | `AxisDef[]` | `{ id, name, say, why, triage? }` |
| `playbook?` | `PlaybookSection[]` | `{ title, rules: { id, say, why? }[] }` |
| `emit?` | `EmitDef` | output paths and targets, see below |

#### `architecture`

| Field | Type | Notes |
|---|---|---|
| `alias` | `string` | Project import alias, e.g. `~app` — required |
| `additionalAliases?` | `Record<string, string>` | Extra alias → directory |
| `layers` | `LayerDef[]` | **Ordered** — the order is the one-way flow |
| `flow` | `'one-way'` | |
| `module` | `{ layout: 'folder' \| 'flat', entry, private }` | Feature-folder shape |
| `layerFiles?` | `string \| string[]` | Lint glob(s) carrying a `{layer}` placeholder |
| `layerFilesIgnore?` | `string \| string[]` | Globally ignored globs |
| `testFiles?` | `string \| string[]` | Default `*.test.* / *.spec.*` — exempt from structural rules and metric gates (per entry, so test-only rules still reach them) |
| `naming?` | `Record<string, string>` | Concept → convention, rendered into docs |

#### `LayerDef`

| Field | Notes |
|---|---|
| `name` / `does` | Folder name / one-line responsibility |
| `mustNot?` | Rendered into the handbook and agent contract |
| `owns?` | `'axios'` shorthand, `{ package, imports?, pattern?, exempt? }`, or `{ global: 'fetch' }` — exclusive ownership, every other layer is barred |
| `allowedImporters?` | `('name' \| { layer, selfOnly?, description? })[]` — each must be a layer declared **earlier**; `selfOnly` = may depend on, never re-export |
| `lintOverrides?` | Per-layer ESLint overrides (the managed rules are rejected) |

#### `emit`

| Field | Notes |
|---|---|
| `handbook?` | Handbook output path (default `docs/architecture-handbook.md`) |
| `agents?` | `(target \| { target, path? })[]` — default `['claude', 'agents']`, `[]` opts out |
| `ci?` | `'github' \| 'none'` |
| `lint?` | `{ severity?: 'error' \| 'warn' }` for the managed structural rules |

### Emitters

| Function | Returns |
|---|---|
| `emitLint(blueprint)` | `LintConfigEntry[]` — spread into `eslint.config.js`; the embedded plugin rides along in `plugins` |
| `emitHandbook(blueprint)` | Handbook markdown `string` |
| `emitAgentContract(blueprint)` | Agent contract `string` (`##` headings, nests into an existing CLAUDE.md) |
| `emitAgentFiles(blueprint)` | `AgentFile[]` — `{ target, path, strategy: 'merge' \| 'own', content }` |
| `emitCi(blueprint, { packageManager? })` | GitHub Actions workflow `string` (`npm`/`pnpm`/`yarn`-aware) |

### `runInspect(root, options?): Promise<{ findings, ok }>`

Programmatic `blueprint inspect`. `options`: `{ framework?, json?, log?, loadConfig? }`.
Each `Finding` is `{ severity: 'error' | 'warn' | 'info', rule, path, message }`; `ok` is
`false` when any error-level finding exists.

### `vuePreset(options?)` / `reactPreset(options?)`

`{ name?, alias? }` → a fresh, validated Blueprint carrying the canonical governance
handbook. Every call returns an independent object — mutate freely.

### `plugin`

The embedded ESLint plugin, also usable standalone (`plugins: { blueprint: plugin }`):

| Rule | Checks |
|---|---|
| `blueprint/no-deep-watch` | `watch(src, cb, { deep: true })` — deep watches traverse the whole source per change |
| `blueprint/use-prefix` | Function-shaped exports in the hooks layer must be `use`-prefixed |
| `blueprint/use-prefix-needs-reactivity` | A `useX`-named file must call a reactive/lifecycle API |
| `blueprint/test-filename-matches-source` | A test file must have a co-located same-named source |
| `blueprint/no-typedef-only-file` | No `@typedef`-only files (JS + JSDoc projects) |

### `injectBetweenMarkers(source, tag, content)`

Replaces the content between `<!-- TAG:START -->` and `<!-- TAG:END -->` in `source`;
throws when the markers are missing or out of order. This is how init refreshes its block
inside an existing CLAUDE.md / AGENTS.md without touching hand-written content.

### CLI

| Command | Flags | Exit |
|---|---|---|
| `blueprint init` | `--framework vue\|react` · `--no-install` · `--dry-run` | `1` on failure |
| `blueprint inspect` | `--framework vue\|react` · `--json` | `1` on any error-level finding |

## 🧠 Philosophy

Lint is an entry point, not a verdict. Blueprint pushes everything machine-checkable into
gates, and compiles everything else into the two artifacts a human and an agent actually
read — so the judgment rules are *in context* on every change, instead of in a wiki tab
nobody opens. This package lives by its own handbook: entry-only module imports, no `utils`
drawer, and 100% test coverage enforced as a hard gate.

## License

[MIT](./LICENSE) © taco3064
