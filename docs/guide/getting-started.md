# Getting Started

## Greenfield — `blueprint init`

```bash
npx @kekkai/blueprint init
```

One command, and your design philosophy has guardrails in place:

- `src/<layer>/` folders — scaffolded only into an empty tree; where code
  already lives, an unbuilt layer's absence is its true state and no
  `.gitkeep` shells are invented
- `blueprint.config.mjs` — the single source of truth
- `eslint.config.mjs` — structural rules plus the third-party core
- `docs/architecture-handbook.md` and agent contracts (`CLAUDE.md`, `AGENTS.md`)
- `compilerOptions.paths` wired into `tsconfig.json` / `jsconfig.json`

The framework is auto-detected from `package.json` (`--framework vue|react` only breaks
ties). An existing eslint config is **never overwritten** — init prints a merge snippet
instead (only the config init generated itself, marked by its first-line banner, is
regenerated in place). Re-running init is idempotent.

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
npx @kekkai/blueprint inspect --baseline          # gate: fail only on NEW findings
```

From the moment adoption completes, AI-collaboration output becomes controllable and
reviewable — the codebase stops getting worse. As debt is paid down, baseline records
that are no longer needed get surfaced for removal, so the ratchet keeps tightening. A
zero-finding repo needs no baseline file at all — `--baseline` treats a missing file as
an empty baseline.

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
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});
```

Or start from a canonical preset — `vuePreset()` / `reactPreset()` encode the full
governance handbook: six layers, nine principles, seven component-shape axes, and a
fourteen-rule working playbook. That content is documented page by page in
[Philosophy](/philosophy/); see the [API Reference](/api/) for every export.

Presets take `emit` directly, so declaring your agent tool keeps the one-line form:

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', alias: '@', emit: { agents: ['claude'] } });
```

Presets return a plain `Blueprint`, so anything else is a spread.
