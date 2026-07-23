# Feature Overview

Everything blueprint does, with a one-line description for each — click a feature name
to see how to use it.

## Commands — what you run

- [`init` — greenfield scaffold](/guide/getting-started#greenfield-—-blueprint-init) — one command scaffolds the whole operating contract: layer folders, config, lint, handbook, agent contracts, import alias
- [`init` — brownfield authoring](/guide/ai-adoption#the-flow) — on a repo with code but no config, writes an executable authoring playbook instead of guessing a preset
- [`init --agent claude|codex`](/guide/ai-adoption) — launches your own agent CLI on that playbook; it derives the config from evidence and iterates until every finding is explainable
- [`survey`](/guide/ai-adoption#why-the-survey-matters) — deterministic repo evidence: folder shapes, the import matrix, package concentration — the raw material for authoring a config
- [`inspect`](/guide/getting-started#brownfield-—-blueprint-inspect) — scans `src/` against the blueprint and lists every violation; any error-level finding exits 1 — gate on it anywhere (a git hook, CI, whatever you run)
- [`inspect --baseline`](/guide/getting-started#brownfield-—-blueprint-inspect) — the brownfield ratchet: lock today's debt, fail only on *new* findings, tighten as debt is paid down
- [`impact`](/guide/ai-adoption#decide-conflicts-on-numbers-—-blueprint-impact) — dry-run the emitted lint rules through the project's own ESLint: hits per rule, heaviest files named — rule conflicts decided on numbers, before wiring
- [`deps`](/guide/deps) — blast radius per module: who gets hit if I change this, plus the fan-in leaderboard
- [`rules`](/guide/reference#blueprint-rules-—-which-ids-actually-gate) — the emitted-rule catalog, queryable: what always emits, what needs declaring, metric defaults — annotated with the config's declared tiers
- [`doctor`](/guide/ai-adoption#verify-it-s-finished-—-blueprint-doctor) — is adoption finished? A read-only checklist: config, no leftover references, eslint wired, alias wired, emitted rules alive in the merged config, architecture clean (with its coverage stated), suppressions ledger current
- [All CLI flags](/guide/reference#cli-flags) — the full flag matrix for every command, including `init --preset` and `--dry-run`

## Artifacts — what one config compiles into

- [`eslint.config.mjs`](/guide/generated-artifacts#eslint-config-mjs-—-enforce) — `emitLint` compiles the layer flow, ownership, and module boundaries into a flat config — embedded plugin included, nothing extra to install
- [`docs/architecture-handbook.md`](/guide/generated-artifacts#docs-architecture-handbook-md-—-explain) — `emitHandbook` renders the human handbook (mermaid diagram, layer table, playbook) from the same source as the rules — it cannot drift
- [`CLAUDE.md` / `AGENTS.md` / …](/guide/generated-artifacts#claude-md-agents-md-—-collaborate) — `emitAgentFiles` distributes one agent contract across Claude, AGENTS.md, Gemini, Copilot, Cursor, and Windsurf — hand-written content survives behind markers

## The blueprint — what you declare

- [`defineBlueprint`](/guide/getting-started#the-blueprint) — the single source of truth, validated at definition *and* on every load, so a structural mistake fails with a precise message
- [Layers & one-way flow](/philosophy/layers) — ordered layers where each imports only downward; `allowedImporters` narrows who may import, `selfOnly` bars re-exporting
- [Ownership — `owns`](/philosophy/layers#ownership-—-owns) — a layer exclusively owns packages, named imports, or globals — every other layer is barred from them
- [Module shape](/philosophy/layers#feature-folder-—-one-module-one-folder) — `folder` = one feature per folder behind a public entry; `flat` = the layer is one node (e.g. a Next route tree) — overridable per layer
- [`blueprint.rules`](/guide/reference#blueprint-rules-—-which-ids-actually-gate) — rule ids with tiers: the machine-checkable ones become lint gates, the rest land in the handbook and agent contract as judgment
- [Every other config field](/guide/reference#config-fields-beyond-the-quick-start-example) — `sourceRoot`, `additionalAliases`, `naming`, `lintOverrides`, `emit.*` — one line each, typed in full in the API reference
- [Presets](/guide/field-tested#framework-notes) — `vuePreset` / `reactPreset` encode the full governance handbook; `nextPreset` adapts to the App or Pages router, with or without `src/`

## Checks — what gets caught

- [The `inspect` findings](/guide/reference#what-inspect-reports) — undeclared folders, flow violations, deep imports, ownership, relative escapes, selfOnly re-exports, cycles, missing entries, missing layers, declaratory selfOnly bans
- [The embedded ESLint rules](/guide/reference#the-embedded-eslint-plugin) — `relative-escape`, `no-deep-watch`, `use-prefix` (+ reactivity), `test-filename-matches-source`, `no-typedef-only-file`
- [The three-tier landing](/philosophy/#the-three-tier-landing) — what a machine can check compiles into lint; what needs judgment compiles into the contract — a green lint run is never an architecture verdict

## Trust & compatibility

- [Security & trust](/guide/security) — no network, zero runtime dependencies, read-only checks, declared writes, `--dry-run`, provenance-signed releases
- [Field-tested setups](/guide/field-tested) — what has actually been run: production apps, all five stacks, monorepo model — plus what is unsupported (Nuxt) and why
- [Prior art — how it differs](/guide/prior-art) — where blueprint overlaps with import-boundary linters, and what only it compiles from the same source
- [Programmatic API](/api/) — every emitter and runtime is importable — `emitLint` in your own eslint config, `runInspect` / `runDeps` in your own tooling
