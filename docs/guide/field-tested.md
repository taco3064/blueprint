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
| **create-next-app (App Router, `src/`, TS)** | Greenfield | Authoring flow engaged automatically (the react preset does not fit Next — see below); config authored as `app` → `components` → `hooks` → `lib`; `emitLint` merged into Next's own flat config; `next build` + lint + inspect green; re-runs fully quiet. |
| **Monorepo: turbo + pnpm** | Per-package adoption | Supported model: run `blueprint init` inside each package (`pnpm --filter <pkg> exec …`). The package manager is detected from the **workspace root** (lockfile / `pnpm-workspace.yaml` looked up through parent directories). Blueprint must be a devDependency of the package itself, so the contract's `node_modules` link resolves. Wire CI as a turbo task per package (`"inspect": "blueprint inspect --baseline"`) instead of `emit.ci`. |

## Framework notes

- **Next.js**: the react preset is deliberately bypassed — it would scaffold
  `src/pages/` (a routing convention in Next) and does not declare the App
  Router's `app/` tree. `init` routes Next projects to the authoring flow
  regardless of file count; the playbook carries the fitting shape
  (`app` → `components` → `hooks` → `lib`, flat modules so relative imports
  stay free inside a route segment).
- **Vue SFC templates**: `<script setup>` imports are scanned like any other
  source; the vite starter needs its three asset imports moved onto the alias.
- **Overlapping structure tools** (structure-lint, dependency-cruiser): wiring
  blueprint after them means the shared rule ids take blueprint's semantics
  (proven equivalent on the tested repo); consolidation is flagged as a
  decision for the team, never done unilaterally.

## Not yet tested

Nuxt, Remix / React Router framework mode, Windows paths, tsconfig `paths`
inherited through `extends` chains (the `--alias` flag covers detection
misses), yarn workspaces. If you run blueprint on one of these,
[an issue with the outcome](https://github.com/taco3064/blueprint/issues) —
green or red — is the most useful contribution there is.
