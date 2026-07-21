# @kekkai/blueprint

## 1.9.0

### Minor Changes

- fb4bb90: `init` UX: the silent decisions now speak, and local lint matches the CI gate.
  All four from a field report of a fresh vite react-ts adoption.

  - **The greenfield/brownfield fork is narrated.** When a repo has fewer than 10
    source files, init scaffolds the preset — and now says so
    (`Fresh scaffold (N source files < 10) — scaffolding the framework preset.
Repos with 10+ source files get the authoring playbook instead.`) instead of
    silently taking the biggest branch it has.
  - **Local lint gets wired to the structural rules.** Templates whose `lint`
    script doesn't run eslint (e.g. oxlint) previously stayed green locally while
    CI failed on the generated config. On a fresh scaffold init now patches the
    script (`"lint": "oxlint && eslint src"` — precondition-guarded, placed
    before the install step, visible in `--dry-run`); existing projects get an
    instruction instead.
  - **The generated eslint header no longer contradicts `--help`.** The banner
    now explains that only the blueprint-owned file (marked by that banner) is
    regenerated, while hand-written configs are never overwritten; `init --help`
    says the same.
  - **The default agent-contract pair is surfaced.** When the config doesn't
    declare `emit.agents`, init notes that both CLAUDE.md and AGENTS.md were
    written and points at the narrowing the playbook itself recommends.

- 361e27e: Brownfield honesty pass — from a legacy-repo (ESLint 8 / `.eslintrc`, 239
  pre-existing violations) field report.

  - **`import/no-cycle` dropped from the generated eslint config.** `inspect`
    already detects module cycles; the ESLint rule re-checked the whole graph
    per file — measured at 92s on an 850-file repo. One detector, the cheap one.
    `eslint-plugin-import` leaves the install set with it.
  - **The single-ledger posture is now doctrine.** Playbook + docs: on a repo
    with existing violations, wire `emitLint` at `severity: 'warn'` and let
    `inspect --baseline` be the only debt ledger — never lock the same debt as
    both eslint suppressions and a blueprint baseline; flip to `error` at zero.
    New "Legacy ESLint — one ledger, never two" section on the AI-adoption page,
    and the legacy-`.eslintrc` cliff is named in Field-Tested notes (with the
    pinned-plugin drift caveat).
  - **The gitignored-contract warning is now actionable** — it says exactly how
    to start tracking the files, not just that teammates won't have them.
  - **Honest positioning, stated where it matters**: the Philosophy page opens
    with "blueprint encodes an architecture someone already chose — it does not
    design one for you", and the README credits that the lint layer is standard
    ESLint machinery: the rarity is that rules, handbook, agent contract, and CI
    compile from one source and can never disagree.

## 1.8.2

### Patch Changes

- af41c22: API-surface and docs-site review sweep.

  - Six internal helpers (`getDiagramEdges`, `getForbiddenLayers`,
    `getModuleShape`, `getSelfOnlyTargets`, `normalizeAgentEmit`,
    `normalizeAllowedImporters`) are now `@internal` — they were never runtime
    exports of the package root, but typedoc listed them as importable Functions.
  - `AgentContractOptions`, `CiOptions`, and `PackageManager` are now exported
    types (they appear in public signatures and previously dangled unresolved in
    the API docs).
  - API reference is grouped (Author / Emitters / Runtimes / Utilities) via
    `@group`; every headline function carries an English `@example`;
    `Blueprint.framework` / `Blueprint.architecture` gained the TSDoc they were
    missing; the zh-TW API index states it is intentionally rendered in English.
  - Docs site: landing grew the compile-model diagram, a "Why" section, and two
    more cards (Adopt / Verify); new "Prior Art & Differences" page (en + zh-TW);
    en security page caught up with two zh-only facts; og/twitter meta added.

## 1.8.1

### Patch Changes

- d5cf68a: `deps` guardrails + a dedicated guide page.

  - A hand-written `blueprint.config.mjs` that bypasses `defineBlueprint` is now
    validated on load: structural mistakes fail with a precise
    `blueprint.config.mjs: <reason>` message (missing default export included)
    instead of an undefined-property crash deep inside a command. Applies to every
    config-loading command (`init` / `inspect` / `deps`).
  - The `deps` leaderboard lists source folders that sit outside the declared
    layers instead of silently ignoring them, so zero fan-in can't be misread as
    "nobody imports this"; querying into such a folder names the actual cause.
  - Flat-layout layers are annotated (`(flat layer — answers at layer
granularity)`) wherever they appear, so the granularity collapse is visible
    instead of silent. Leaderboard JSON now carries `{ modules, skipped }`.
  - New docs page "Blast Radius — deps" (en + zh-TW): how to run it, sample
    outputs, granularity via `module.layout`, and the graph's boundaries.
    `deps --help` grew a matching scope-and-granularity section.
  - Philosophy section now states its relationship to the tool explicitly: the
    Operating Contract opens with "this documents the preset payload", and every
    sub-page (beliefs / layers / component-shape / discipline) carries an
    "In blueprint" connector naming the config field it compiles from
    (`principles` / `architecture` / `componentShape` / `playbook`) and where it
    lands; Getting Started links the preset paragraph back to Philosophy.
  - New "Feature Overview" docs page (en + zh-TW): every capability listed with a
    one-line description, each linking to its how-to page — now the Guide nav
    entry and the first sidebar item; the four home-page cards link to the
    matching generated-artifact sections.
  - Docs coverage sweep (en + zh-TW): new "Checks & Config Reference" page (all
    nine `inspect` finding kinds, the six embedded plugin rules, the gated
    `blueprint.rules` ids, config fields beyond the quick-start example, the full
    CLI flag matrix incl. `init --preset`) and new "What init Generates" page
    (verbatim artifacts from a fresh init). Layer Architecture grew an
    "Ownership — `owns`" section; `inspect --help` now also names the
    `missing-layer` info finding.

## 1.8.0

### Minor Changes

- 3fa65f7: Configurable source root, first-class Next.js, and Nuxt declared unsupported —
  the terrain widens from "everything under `src/`" to real framework layouts:

  - **`architecture.sourceRoot`** (default `src`) generalizes the engine off the
    hardcoded `src/` assumption. `.` scans the project root (with a built-in
    ignore set for `node_modules` / `.next` / build output); the alias target,
    layer-file globs, and vite/tsconfig wiring all follow it. Backward compatible
    — every existing config keeps `src`.
  - **`nextPreset({ router, srcDir })`** and auto-detection. A fresh
    `create-next-app` adopts in one command: init detects the route tree
    (`app` / `pages`, under `src/` or the root) and generates the Next preset —
    the route dir is the top layer, flat module layout, and **no `fetch`
    ownership** (server components fetch everywhere by design). Both routers
    reduce to the same shape; because Next keeps imports explicit, the dependency
    graph is real and enforcement is genuine.
  - **Nuxt is refused, by design.** Its auto-imports leave no import statements
    for static analysis, so the graph would be near-empty and report a hollow
    "clean". `init` errors with an explanation rather than emit a false-green
    setup. Documented under "Not supported" on the field-tested page.
  - **The adoption e2e suite grows to ten fixtures** covering the tiers approved
    for this round: the ratchet catching a _new_ violation (not just staying
    green), the JS-project jsconfig branch, `--dry-run` writing nothing,
    survey + deps on a real repo, the `--agent` launch ordering, the emitted CI
    gate, a yarn workspace, and `--no-install` — plus the two new Next fixtures
    (root-level app router, pages router).

## 1.7.0

### Minor Changes

- 3a2c1c4: The rules stop assuming infrastructure nobody installed:

  - **Greenfield alias surgery.** On a fresh scaffold (init generated the
    blueprint config in this very run), init now wires the import alias
    directly into the template's `vite.config.*` (resolve.alias + the
    `node:url` import) and into the commented tsconfig (comment-preserving
    `paths` insertion) — precondition-guarded text edits that only touch the
    known template shapes, visible in `--dry-run`, falling back to the
    instructs on anything unexpected. Existing projects never take this path;
    the security disclosure is amended accordingly.
  - **Adoption e2e suite.** Five committed template fixtures — vite react/vue,
    Next (App Router + forwarding CLAUDE.md), a turbo + pnpm workspace package,
    and a brownfield repo with planted debt (upward reaches, a same-layer
    import, an import cycle, hand-written eslint/CLAUDE files) — driven through
    the full init → inspect → baseline → references → wired/integrated arc.
    The suite lives in the default vitest set, so the husky pre-commit and the
    new pre-push hook both gate on it locally, and the release workflow runs it
    before anything is published to npm.
  - **Weekly terrain workflow.** Scaffolds the _latest_ create-vite /
    create-next-app templates and drives the real adoption with the CLI built
    from HEAD — upstream template drift reddens the run and opens a
    deduplicated issue instead of surprising the next adopter.
  - The handbook's flow diagram now states its reading rules (reachability is
    transitive; dashed = selfOnly), and the packaged operating discipline
    covers conflicts with third-party lint advice — both straight from agent
    feedback on a field adoption.

## 1.6.0

### Minor Changes

- 99b9ad8: Two terrain fixes from the Next.js / monorepo field round, plus a
  field-tested compatibility page on the docs site:

  - **Next.js projects always take the authoring flow.** The react preset does
    not fit Next — it scaffolds `src/pages/` (a routing convention there) and
    does not declare the App Router's `app/` tree — so `init` now routes any
    project with a `next` dependency to the authoring flow regardless of file
    count. The playbook opens with the fitting shape (`app` → `components` →
    `hooks` → `lib`); `--preset` still works but carries an explicit warning.
  - **The package manager is detected from the workspace root.** In a pnpm /
    turbo monorepo the lockfile lives at the workspace root, not in the package
    being initialized — detection now walks parent directories for a lockfile
    or `pnpm-workspace.yaml`, so the authoring flow's auto-install generates
    `pnpm add -D` instead of the wrong `npm install -D`.
  - **Docs: Field-Tested Setups** — a bilingual page recording every setup the
    releases are validated against (two production apps, four fresh scaffolds,
    the turbo + pnpm per-package model) with outcomes and caveats, plus the
    not-yet-tested list.

## 1.5.2

### Patch Changes

- 277e7aa: Symmetric with the wired eslint-config detection: a hand-written CLAUDE.md /
  AGENTS.md that already mentions `@kekkai/blueprint` has been integrated by
  its owner — re-running init no longer regenerates the `<name>.blueprint.md`
  reference next to it.

## 1.5.1

### Patch Changes

- cad28b4: - **init recognizes a wired config.** When the user's own eslint config
  already imports `@kekkai/blueprint`, init no longer writes a reference
  file next to it on every re-run — the owner wired it; there is nothing
  to merge, and the plan says so instead of nagging.
  - **The Traditional Chinese documentation site is rewritten in formal
    register** — report-style prose throughout; general vocabulary is fully
    translated while proper nouns and identifiers stay verbatim.

## 1.5.0

### Minor Changes

- 8967311: Integration is the deliverable — reference files are input, not output:

  - **The authoring playbook now owns the lint wiring.** The agent merges
    `...emitLint(blueprint, …)` into the existing flat config, resolves every
    rule conflict explicitly (house disable conventions, overlapping structure
    tools), runs the project's own lint, and deletes the reference — adoption
    is not done while any `*.blueprint.*` file remains, and the acceptance
    gates say so. Legacy `.eslintrc.*` configs are the one exception: that
    migration is surfaced as a decision item, never done unilaterally.
  - **A clean repo carries no baseline.** `inspect --update-baseline` with zero
    findings writes nothing (and retires a paid-off baseline file);
    `inspect --baseline` with no file treats it as empty — one uniform CI line
    on repos with and without recorded debt.
  - **init recognizes its own eslint config.** Generated configs carry a banner
    line; a re-run regenerates the file in place instead of mistaking its own
    output for a hand-maintained config and writing a reference next to it.
  - **init warns when its artifacts are gitignored** — a best-effort root
    `.gitignore` check: if the handbook or a contract file is invisible to
    version control, the plan says so (the compact contract links assume they
    exist) instead of leaving teammates with dead links.
  - The greenfield `--agent` skip message no longer claims a config "already
    exists" three seconds after scaffolding it, and `deps` module keys for
    bare-file modules drop their extension (`components/HelloWorld`, not
    `components/HelloWorld.vue`).

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
