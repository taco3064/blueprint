# @kekkai/blueprint

## 1.4.0

### Minor Changes

- 6a7a400: The contract stops flooding your context files:

  - **Shared context files get a compact pointer block** — CLAUDE.md / AGENTS.md
    now receive ~12 lines: project facts (framework, alias, layer flow), the
    machine-gated rule list, and two links that carry the bulk — the generated
    handbook (project half, always current) and `agent-contract.md` shipped
    inside the package (generic operating discipline). Tool-owned rule files
    (Cursor, Windsurf) still carry the full contract.
  - **`init --agent claude|codex` emits one contract file** — the tool actually
    in use, instead of one per tool nobody runs. An explicit `emit.agents` in
    the config still wins, and the authoring playbook now tells the agent to
    declare its own tool there.
  - **Hand-written CLAUDE.md / AGENTS.md are never touched** — a context file
    without blueprint markers is a document someone maintains; init now writes
    a `<name>.blueprint.md` reference next to it with an integration instruct,
    and the authoring playbook's final step has the agent merge it into the
    document's own structure — link, don't duplicate.
  - **The docs site gains a Changelog page** — build-time-included from the
    repo's CHANGELOG.md, so the same push that publishes a release renders its
    notes on GitHub Pages. Synced by construction, not by hand.

## 1.3.0

### Minor Changes

- e823cb3: Five friction fixes from running the AI-assisted adoption on four real repos
  (two mature codebases, two fresh vite scaffolds):

  - **The authoring flow now installs `@kekkai/blueprint`** — the config the
    agent writes imports it, so the playbook used to fall over at the first
    `npx blueprint inspect` on a repo that never installed the package.
    `--no-install` downgrades to an instruct with the exact command, and the
    playbook opens with the prerequisite either way.
  - **The playbook reads existing intent documents first** — an architecture
    config or doc already in the repo (structure-lint, dependency-cruiser,
    `docs/architecture*`, agent-contract sections, ADRs) is intent evidence
    senior to the import matrix; it also carries what the matrix cannot see:
    zero-file layer positions, selfOnly-style constraints, ownership rules.
  - **Greenfield template cleanup is spelled out** — when fresh scaffold code
    violates the preset out of the box (vite's vue template imports
    `../assets/*` from a component), init now lists the exact findings and the
    fix path instead of letting the first lint run read as a broken install.
  - **`survey` reports unresolved alias-like specifiers** — `~x/…`-style
    imports that match no detected alias and no dependency are usually an
    undeclared alias; the report now names each prefix with its count instead
    of silently dropping it from the matrix.
  - **The tsconfig alias instruct notes that `baseUrl` is not needed** — modern
    TypeScript resolves `paths` without it, and it is deprecated in 7.0.

## 1.2.0

### Minor Changes

- f32436d: AI-assisted brownfield adoption — evidence, playbook, launcher:

  - **`blueprint survey`** — deterministic authoring evidence that runs _before_
    a config exists: top-level folders with module-shape evidence (index
    coverage, nesting depth), the folder-to-folder import matrix (alias +
    relative, heaviest first), same-folder alias imports, test-convention hits,
    and package-usage concentration as ownership candidates. `--json` for
    tooling; `--alias` when tsconfig detection finds nothing.
  - **The authoring playbook** — `init` on a brownfield repo without a config no
    longer guesses a preset: it writes `blueprint-authoring.md` (the method, the
    schema sketch, the acceptance gates, and the embedded survey) plus a
    `/blueprint-author` command file for Claude Code, and prints the launch
    one-liners. The playbook scopes itself honestly: author the config and lock
    the baseline — never refactor the debt. `--preset` keeps the old scaffold.
  - **`init --agent claude|codex`** — the thinnest possible launcher: spawns the
    _printed_ command in the foreground, interactive, under the user's own agent
    CLI permissions. Every artifact is on disk before the spawn, so a failed
    launch or an abandoned session degrades to exactly the manual path. The
    security disclosure is amended accordingly: never launches by default,
    explicit opt-in only, still zero network calls and zero credential surface.

  Field-tested end to end on a mature React + TypeScript repo: the playbook's
  evidence alone reproduced the hand-derived 11-layer config — same 246 baseline
  findings, same categories, same cycle.

## 1.1.0

### Minor Changes

- 83894a6: Per-layer module layout, a TS-aware unusedVars gate, and a depth-aware
  relative-escape rule — all three surfaced by adopting blueprint on a mature,
  previously ungoverned React + TypeScript codebase:

  - **`LayerDef.module`** — a layer can now override the shared module shape
    (`layout` / `entry`): folder modules in a feature layer while the rest of
    the project stays flat. `inspect`, `deps`, the emitted lint config, the
    handbook, and the agent contract all resolve the shape per layer, and
    deep-import bans now name each folder-layout target layer instead of
    assuming one global layout.
  - **`emitLint(blueprint, { typescript })`** — inject the `@typescript-eslint`
    plugin and the `unusedVars` gate emits the TS-aware `no-unused-vars`; the
    core twin false-flags TS enum members and type parameters (565 false
    positives on the field-test repo). `init` wires the option automatically on
    TypeScript projects, and the brownfield merge instruct mentions it.
  - **`blueprint/relative-escape`** — replaces the literal `../` ban patterns,
    which could not see file depth and so flagged intra-module imports inside
    nested module folders (~310 false positives). The rule shares inspect's
    resolution primitives, so the two gates cannot disagree — the field-test
    repo now reports exactly the same 54 escapes on both sides.

## 1.0.3

### Patch Changes

- `inspect` and `deps` now honor `architecture.testFiles`, symmetric with
  the lint side: test files are exempt from structural analysis — they
  neither produce findings (a co-located `Foo.test.js` importing its
  sibling through the alias is test plumbing, not a violation) nor form
  modules or edges in the dependency graph. Found by adopting blueprint
  on a mature production repo, where every remaining "violation" turned
  out to be a test file its own structure linter had always exempted.

## 1.0.2

### Patch Changes

- Close the reviewer's "half-wired" nuance around the dead-code gate:

  - `--no-install` no longer silently drops the dependency requirement —
    the exact install command is surfaced as an instruct, so "knip is in
    the install set" holds on every path.
  - The generated CI ships the knip step **commented** when `deadCode` is
    error-tier: one uncomment turns the gate hard, and zero-config false
    positives can never redden a fresh project's CI out of the box.
  - The agent contract's dead-code bullet now points at that commented
    step instead of a vague "wire it into CI".

## 1.0.1

### Patch Changes

- DX polish round for 1.0:

  - **The contract no longer writes checks the tooling can't cash.** "Hard
    rules (lint enforces these)" now lists only rule ids a machine
    actually gates out of the box; error-tier `deadCode` moves to the
    behavioral section with its real gate spelled out (`npx knip`,
    installed by init — wire it into CI to make it hard), and unknown ids
    are never called gates.
  - **Brownfield merge is copy-ready**: when an eslint config already
    exists, init writes `eslint.config.blueprint.mjs` — the full generated
    config as a diffable, clearly-unwired reference — and the instruct
    shows the exact diff command and minimal merge block.
  - Per-command `--help` now carries example invocations; the README
    gains a 30-second before/after tree.

## 1.0.0

### Major Changes

- 1.0.0 — the compiler is complete and the config schema is stable.

  One Blueprint compiles into six capabilities:

  - **Define** — `defineBlueprint` / `vuePreset` / `reactPreset`: ordered
    layers with `allowedImporters` (acyclic by construction), package and
    global ownership, module shape, metric/rule tiers, ten principles,
    seven component-shape axes, an eighteen-rule working playbook.
  - **Enforce** — `emitLint`: an ESLint flat config with parser wiring for
    the detected stack and an embedded five-rule plugin. Nothing extra to
    install.
  - **Explain** — `emitHandbook`: a human handbook that cannot drift from
    the rules.
  - **Collaborate** — `emitAgentFiles`: one agent operating contract
    distributed across CLAUDE.md, AGENTS.md, Gemini, Copilot, Cursor, and
    Windsurf.
  - **Bootstrap** — `blueprint init`: layers, configs, alias wiring, agent
    contracts, and a CI gate from one command — deterministic, idempotent,
    and it never operates an agent.
  - **Verify** — `blueprint inspect` (nine checks + the baseline ratchet
    for brownfield adoption) and `blueprint deps` (blast radius).

  Field-proven on fresh create-vite react/vue projects — including a full
  feature written by a coding agent under the generated contract, where
  lint stayed green and `inspect` caught the one thing lint cannot see:
  code drifting into undeclared folders.

## 0.2.3

### Patch Changes

- The generated eslint.config.mjs now wires parsers for the detected
  stack — vue-eslint-parser for SFCs (with the TypeScript parser inside
  `<script lang="ts">`), typescript-eslint for .ts/.tsx, and espree's JSX
  mode for React .js/.jsx. Parsers only: framework rule packs stay the
  user's choice. Found by running init against fresh create-vite
  templates, whose App.tsx / App.vue previously failed to parse under the
  generated config; the packages backing the parsers join the install
  set.

## 0.2.2

### Patch Changes

- Security & trust disclosure: the README and the docs site now state
  explicitly that the package never operates an agent CLI (it prepares
  plain-markdown contracts and hands off — no credential surface), makes
  no network calls, has zero runtime dependencies, runs exactly one
  declared and skippable child process (the dependency install), bounds
  every write, and ships provenance-signed releases.

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
