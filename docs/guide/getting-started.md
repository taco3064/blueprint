# Getting Started

## Greenfield — `blueprint init`

```bash
npx @kekkai/blueprint init --structure flat
```

**One flag is not optional here**, and it is the only one. On a tree below the
brownfield threshold (10 source files) there is nothing to measure, so `init`
refuses rather than picking, and prints both options with the trade-off:

```
✗ blueprint init needs --structure here: 0 source files, below the brownfield threshold (10) — there is nothing here to measure, so this is your call, not a detection failure.
```

`flat` puts the layers at the source root; `modular` puts feature modules there,
each holding those layers. The config migration between them is free and the file
migration is not, which is why it is a day-one choice and why nothing guesses it for
you — **[Flat or Modular](/guide/structure) draws both trees**. Above the threshold
`init` never asks: it reads the layout you already have.

With that answered, one command puts guardrails behind your design philosophy:

- `src/<layer>/` folders — scaffolded only into an empty tree; where code
  already lives, an unbuilt layer's absence is its true state and no
  `.gitkeep` shells are invented. Under `--structure modular` the module folders
  and their entry files are the scaffold instead, because a layer is a folder
  *inside* a module there
- `blueprint.config.mjs` — the single source of truth
- `eslint.config.mjs` — structural rules plus the third-party core
- `docs/architecture-handbook.md` and agent contracts (`CLAUDE.md`, `AGENTS.md`)
- `compilerOptions.paths` wired into `tsconfig.json` / `jsconfig.json`

The framework is auto-detected from `package.json` (`--framework vue|react` only breaks
ties). An existing eslint config is **never overwritten** — init prints a merge snippet
instead (only the config init generated itself, marked by its first-line banner, is
regenerated in place). Re-running init is idempotent, and a re-run with `--structure`
changes nothing once a config exists — the config already answers it.

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

### Upgrading with a baseline already on disk

**The first run refuses an existing `.blueprint-baseline.json` and prints one command**
— re-key it, once:

```bash
npx @kekkai/blueprint inspect --update-baseline
```

Re-keying records the same debt: nothing that was suppressed stops being suppressed.
What moves is what *identifies* an entry — and the refusal names the change for the
version your file actually carries, rather than describing someone else's upgrade:

- **Version 2 → 3**, the move in `4.0.0`. `relative-escape` was a single finding id
  covering three different relative-import problems, which forced one migration step
  to answer all three. They are `src-escape`, `entry-bypass` and `layer-escape` now,
  each naming the move that is legal for it. A finding id is part of an entry's key,
  so entries recorded under the old id no longer match
- **Version 1 → 2**, earlier. Identity used to include the finding's **message text** —
  the one part of a finding that changes while the violation does not — so rewording
  any finding silently retired every baseline entry for that rule: the old debt came
  back as `fresh`, the recorded entries counted as `stale`, and a brownfield CI went
  red on an upgrade that changed no code. Identity is the rule, the path and the
  **subject** (the import specifier, a cycle's members) now

The old file is refused rather than reinterpreted because read under the new key it
would match nothing — which is the wall of red the ratchet exists to prevent, arriving
with no stated cause. Files written today are stamped `"version": 3`, and for `--json`
consumers every finding carries `subject`.

Everything else `4.0.0` breaks, in the order you meet it:
[Upgrading to 4.0.0](/guide/upgrading).

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
      { name: 'components', does: 'Reusable, presentational UI', mustNot: ['call services'], layout: 'folder' },
      { name: 'hooks', does: 'Adapts server and shared state', layout: 'folder' },
      {
        name: 'services',
        does: 'Network primitives',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: ['hooks'],
        layout: 'folder',
      },
    ],
  },
});
```

`layout` is the unit shape and it lives on the layer that has it: `folder` is one
folder per unit behind an `index`, and omitting the key means `file`. To declare the
modular structure by hand instead, add `architecture.modules` —
[Flat or Modular](/guide/structure) has both shapes side by side.

Or start from a canonical preset — `vuePreset()` / `reactPreset()` encode the full
governance handbook: the layer model, core principles, component-shape axes, and a
working playbook. That content is documented page by page in
[Philosophy](/philosophy/); see the [API Reference](/api/) for every export.

Presets take `emit` directly, so declaring your agent tool keeps the one-line form:

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', alias: '@', emit: { agents: ['claude'] } });
```

Presets return a plain `Blueprint`, so anything else is a spread.
