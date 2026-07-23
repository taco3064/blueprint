# Field-Tested Setups

Every release is validated by adopting blueprint on real projects — not just
unit tests. Two automated layers back this page: an **adoption e2e suite**
(five committed template fixtures — vite react/vue, Next, a turbo + pnpm
workspace package, and a brownfield repo with planted debt — driven through
the full init/inspect/baseline arc on every commit, push, and release), and a
**weekly terrain run** that scaffolds the *latest* upstream templates and
opens an issue when they drift. This page records what has actually been run,
with the outcome and the caveats, so you know which terrain is proven and
which is still frontier.

## Tested and green

| Setup | Project shape | Outcome |
|---|---|---|
| **Vite + Vue 3 (JS, pnpm)** | 489-file production app with an existing structure-lint setup and a hand-written CLAUDE.md | Config authored from the survey + the repo's own intent docs; **0 findings**; `emitLint` merged into the existing flat config (structural rules proven equivalent to the incumbent linter); contract integrated into the hand-written CLAUDE.md; full test suite (4,196 tests) green. Zero source-code edits. |
| **Vite + React + TS (npm, legacy `.eslintrc`)** | 852-file production app, no prior structure governance | Config authored from the survey; **246 real findings** locked as the baseline (including one genuine `services → types → resources → services` import cycle); per-layer module layout (`resources` as folder modules). The legacy-eslintrc migration is surfaced as a decision, not forced. |
| **create-vite `react-ts`** (fresh) | Greenfield | One command: preset scaffold, compact contract, lint + inspect + build green out of the box. |
| **create-vite `vue-ts`** (fresh) | Greenfield | Same, plus a template-cleanup instruct: the starter's `../assets` relative imports violate the preset — init lists the exact findings and the fix (wire the alias, three small edits). |
| **create-next-app — App Router, `src/`, TS** | Greenfield | One command: `nextPreset` auto-selected (router + srcDir detected), config `app` → `components` → `hooks` → `lib`, `inspect` + `next build` green; hand-written CLAUDE/AGENTS left untouched. |
| **Next.js — App Router at the project root (no `src/`)** | Greenfield | `sourceRoot: '.'` scans the root-level `app/` tree; upward imports into it are caught like anywhere else. |
| **Next.js — Pages Router (`src/pages`)** | Greenfield | `pages/` is the top layer; `pages/api/*` handlers import downward into `lib`, no violations. |
| **Monorepo: turbo + pnpm** | Per-package adoption | Supported model: run `blueprint init` inside each package (`pnpm --filter <pkg> exec …`). The package manager is detected from the **workspace root** (lockfile / `pnpm-workspace.yaml` looked up through parent directories). Blueprint must be a devDependency of the package itself, so the contract's `node_modules` link resolves. Wire `blueprint inspect --baseline` as a turbo task per package (`"inspect": "blueprint inspect --baseline"`) and gate it however you already gate the monorepo. |

## Framework notes

- **Next.js**: `init` detects the route tree (`app/` and/or `pages/`, under
  `src/` or the project root) and generates `nextPreset` — the route dir is
  the top layer, flat module layout, and **no `fetch` ownership** (server
  components fetch everywhere by design, so restricting it would be a lie).
  Both routers reduce to the same shape; imports stay explicit, so the
  dependency graph is real and enforcement is genuine.
- **Vue SFC templates**: `<script setup>` imports are scanned like any other
  source; the vite starter needs its three asset imports moved onto the alias.
- **Legacy ESLint (`.eslintrc` / v8)**: adoption cost jumps from "run a command" to
  "a migration decision" — the flat-config migration is yours to call, and ESLint's
  native suppressions ledger needs ≥ 9.24. Until then the transitional posture is
  severity `'warn'` (with new metric debt ungated); the full doctrine:
  [turn it red, then ratchet it](/guide/ai-adoption#existing-debt-—-turn-it-red-then-ratchet-it).
- **Pinned-plugin drift**: upstream rule renames (e.g. typescript-eslint v8 folding
  `no-var-requires` into `no-require-imports`) can turn old disable comments stale
  mid-merge — it only surfaces when the wired lint actually runs; treat each as a
  merge decision, not a blocker.
- **Overlapping structure tools** (structure-lint, dependency-cruiser): wiring
  blueprint after them means the shared rule ids take blueprint's semantics
  (proven equivalent on the tested repo); consolidation is flagged as a
  decision for the team, never done unilaterally.

## Not supported

- **Nuxt** — blueprint runs on *static import analysis*; that is how the
  dependency flow gets enforced. Nuxt's auto-imports leave no `import`
  statements in the source, which removes blueprint's entire basis for
  checking — so after weighing it, Nuxt is not supported: `init` refuses
  outright rather than emit a setup that can't see anything. (A framework
  auto-import resolver could change this someday; it is real work and not
  planned.)

## Not yet tested

Remix / React Router framework mode, Windows paths, tsconfig `paths` inherited
through `extends` chains (the `--alias` flag covers detection misses). If you
run blueprint on one of these,
[an issue with the outcome](https://github.com/taco3064/blueprint/issues) —
green or red — is the most useful contribution there is.
