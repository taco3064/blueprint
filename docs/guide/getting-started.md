# Getting Started

## Greenfield — `blueprint init`

```bash
npx @kekkai/blueprint init
```

One command scaffolds the whole operating contract:

- `src/<layer>/` folders for every declared layer
- `blueprint.config.mjs` — the single source of truth
- `eslint.config.mjs` — structural rules plus the third-party core
- `docs/architecture-handbook.md` and agent contracts (`CLAUDE.md`, `AGENTS.md`)
- `compilerOptions.paths` wired into `tsconfig.json` / `jsconfig.json`
- `.github/workflows/blueprint-ci.yml` — lint + inspect as the gate

The framework is auto-detected from `package.json` (`--framework vue|react` only breaks
ties). An existing eslint config is **never overwritten** — init prints a merge snippet
instead. Re-running init is idempotent.

## Brownfield — `blueprint inspect`

```bash
npx @kekkai/blueprint inspect
```

Read-only. Scans `src/`, checks it against the blueprint, and prints an Architecture
Report with migration steps. Any error-level finding exits `1`.

A legacy project's first report is a wall of red — that is what the **baseline ratchet**
is for:

```bash
npx @kekkai/blueprint inspect --update-baseline   # lock today's debt
npx @kekkai/blueprint inspect --baseline          # CI: fail only on NEW findings
```

The codebase stops getting worse today; as debt is paid down, stale baseline entries are
reported so the ratchet keeps tightening. A zero-finding repo needs no baseline file at
all — `--baseline` treats a missing file as an empty baseline.

## Blast radius — `blueprint deps`

```bash
npx @kekkai/blueprint deps hooks/useCart   # who imports it, what it imports
npx @kekkai/blueprint deps                 # leaderboard: every module by fan-in
```

Read-only fan-in / fan-out per module — "who gets hit if I change this". Output
samples, granularity, and graph boundaries: [Blast Radius — deps](/guide/deps).

## The Blueprint

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
        allowedImporters: ['hooks'],
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});
```

Or start from a canonical preset — `vuePreset()` / `reactPreset()` encode the full
governance handbook: six layers, ten principles, seven component-shape axes, and an
eighteen-rule working playbook. That content is documented page by page in
[Philosophy](/philosophy/); see the [API Reference](/api/) for every export.
