# @kekkai/blueprint

## 0.2.1

### Patch Changes

- Slim README: the docs site (https://taco3064.github.io/blueprint/) now
  owns the full guide, API reference, and philosophy — the npm page keeps
  a compact introduction and one link.

## 0.2.0

### Minor Changes

- The DX round — discoverability, brownfield adoption, blast radius:

  - **Real help**: top-level usage leads with the value proposition;
    `init` / `inspect` / `deps` each have `--help` describing what gets
    generated, every flag, and the auto-detect / no-overwrite / idempotent
    guarantees.
  - **`inspect --baseline` / `--update-baseline`** — the brownfield
    ratchet: record today's debt in `.blueprint-baseline.json`, then fail
    only on new findings; stale entries are reported so the ratchet keeps
    tightening.
  - **`blueprint deps [module]`** — reverse dependencies / blast radius:
    who imports a module and what it imports, or the full fan-in
    leaderboard; `runDeps` is exported from the package root.
  - README (both languages) opens with a Before/After tree and documents
    the hand-off stance.

## 0.1.3

### Patch Changes

- CLI etiquette: `--help` / `-h` prints usage and exits 0 (it previously
  fell through as an unknown command, exit 1), and `--version` / `-v`
  prints the package version (read at runtime from package.json, covering
  both the bundled and source layouts).

## 0.1.2

### Patch Changes

- Fix the installed CLI being a silent no-op. npm installs the bin as a
  symlink and Node resolves the entry module to its real path while
  `argv[1]` keeps the symlink path, so the entry guard never matched —
  `npx @kekkai/blueprint` exited 0 doing nothing. The guard now resolves
  `argv[1]` through `realpathSync` before comparing, and is unit-tested
  against a real symlink.

## 0.1.1

### Patch Changes

- Release housekeeping — first published version.

## 0.1.0

### Minor Changes

- First release — Architecture as Code. One Blueprint compiles into:

  - **Enforce**: an ESLint flat config (one-way layer flow, module-entry
    boundaries, package/global ownership, metric gates) plus an embedded
    plugin (`no-deep-watch`, `use-prefix`, `use-prefix-needs-reactivity`,
    `test-filename-matches-source`, `no-typedef-only-file`).
  - **Explain**: a human handbook (layers, module shape, component-shape
    axes, principles, working playbook) with a mermaid flow diagram.
  - **Collaborate**: an agent operating contract distributed across tool
    files (CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions, Cursor
    and Windsurf rules).
  - **Bootstrap**: `blueprint init` — scaffold layers, generate configs,
    wire the import alias into tsconfig/jsconfig, emit a CI gate.
  - **Verify**: `blueprint inspect` — a read-only architecture report
    (closed-world folders, flow violations, deep imports, ownership,
    cycles) with migration steps; error findings exit 1 for CI.
  - Canonical `vuePreset` / `reactPreset` encoding the governance
    handbook: six layers, ten principles, seven component-shape axes, an
    eighteen-rule playbook.
  - Bilingual README (English / 繁體中文) with the full API reference.
