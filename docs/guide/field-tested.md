# Field-Tested Setups

Every release is validated by adopting blueprint on real projects — not just unit
tests. This page records what has actually been run, with the outcome and the caveats,
so you know which terrain is proven and which is still frontier.

## What backs this page

None of these layers is redundancy — each was added because everything already in place
went green on a defect it could not see:

- **The adoption e2e suite** — committed starter fixtures covering the Vite, Next.js and
  workspace shapes this page records, plus a brownfield repo with planted debt; the set
  is [`fixtures/adoption/`](https://github.com/taco3064/blueprint/tree/main/fixtures/adoption).
  Every one is driven through `init` on every commit, push, and release, and how much
  further each goes varies by what it exists to prove: some stop at the tree `init`
  writes, others carry on through `inspect`, and the brownfield one walks the whole arc
  to the baseline ratchet. The install is skipped outright except on the workspace
  fixtures, where it runs against a stubbed `exec` — the only way to prove the package
  manager is read off the workspace root rather than the package (`pnpm add -D` /
  `yarn add -D`). So what this layer proves is the tree `init` writes and the findings
  `inspect` reports on real starter shapes: it never executes ESLint
- **The conformance suite** — every field-feedback scenario fossilized as a fixture repo
  built from a DSL and driven through the CLI's own dispatch, **against the real ESLint
  from this repo's devDependencies**. That is the layer the e2e suite above cannot be:
  `impact` and the merge-survival check only mean anything when a real ESLint resolves a
  real config, so those are proven here. A scenario the field harness finds lands here
  as a fixture with its fix
- **Linux and Windows, both reporting** — CI runs the whole gate on
  `ubuntu-latest` *and* `windows-latest`, neither leg allowed to hide the other's
  failure. This tool reads and writes other people's repositories and carries explicit
  Windows branches to do it; on posix those branches are no-ops, so their behaviour had
  never been observed. A separate leg builds on the current Node and then runs the built
  artifact on `18.18.0` exactly — the declared `engines` floor, executed rather than
  claimed
- **The ESLint major you actually resolve to** — `init` installs `eslint` unpinned, so
  you land on the newest major every carrier's peer range admits, which is newer than
  the one this repo develops against. A separate leg swaps that major in and runs the
  whole suite on it, so the version the tool hands you is one it has executed rather
  than one it merely permits. It deliberately leaves out this repo's own
  `npm run lint`: whether *this* project's config is clean on a new major is a
  different question from whether the config blueprint *emits* still loads there and
  still holds its rules, and only the second one is a promise to you
- **`npm run dist:verify`** — the layer in-process tests cannot reach: it executes
  `dist/bin.js`, resolves the `bin` field and imports the package entry. Its reason for
  existing is the 0.1.1 bug — npm installs the bin as a symlink, and a missing
  `realpathSync` made the published CLI exit 0 having done nothing, **a state every
  in-process test passes**. It runs in CI after the build, and again in the job that
  publishes, because that job produces the `dist/` npm actually receives
- **A weekly terrain run** — scaffolds the *latest* upstream `create-vite` and
  `create-next-app` templates and opens an issue when their shapes drift. Deliberately
  outside the PR gate: it is network-dependent and upstream-driven
- **The live field harness** — a real agent CLI taking a real repo through `init` →
  `inspect` → `impact` → `doctor`, headlessly, verified with the real doctor. It hunts
  *new* scenarios — the suites above guard the ones already known. The per-item
  paper trail is public: this repo's
  closed [`field-run` issues](https://github.com/taco3064/blueprint/issues?q=is%3Aissue+label%3Afield-run)

**Mutation testing arrived after 3.0.0** and audits the suite itself — whether the
assertions would catch a *wrong* line, not just an untested one. The suite roughly
doubled under it, and most of that found places where a wrong edit to the source would
have shipped with every test green. It is run on demand rather than as a gate, on
purpose: a score threshold would be a number every source edit invalidates, and this
project's stance is against a red nobody can appease.

## Tested and green

**Vite + Vue 3 (JS, pnpm)**
- Shape — 489-file production app with an existing structure-lint setup and a hand-written CLAUDE.md
- Outcome — config authored from the survey + the repo's own intent docs; **0 findings**; `emitLint` merged into the existing flat config (structural rules proven equivalent to the incumbent linter); contract integrated into the hand-written CLAUDE.md; full test suite (4,196 tests) green. Zero source-code edits.

**Vite + React + TS (npm, legacy `.eslintrc`)**
- Shape — 852-file production app, no prior structure governance
- Outcome — config authored from the survey; **246 real findings** locked as the baseline (including one genuine `services → types → resources → services` import cycle); per-layer layout (`resources` as a `folder`-layout layer). The legacy-eslintrc migration is surfaced as a decision, not forced.

**create-vite `react-ts` (fresh)**
- Shape — greenfield
- Outcome — one command: preset scaffold, compact contract, lint + inspect + build green out of the box.

**create-vite `vue-ts` (fresh)**
- Shape — greenfield
- Outcome — same, plus a template-cleanup instruct: the starter's `../assets` relative imports violate the preset — init lists the exact findings and the fix (wire the alias, three small edits).

**create-next-app — App Router, `src/`, TS**
- Shape — greenfield
- Outcome — one command: `nextPreset` auto-selected (router + srcDir detected), config `app` → `components` → `hooks` → `lib`, `inspect` + `next build` green; hand-written CLAUDE/AGENTS left untouched.

**Next.js — App Router at the project root (no `src/`)**
- Shape — greenfield
- Outcome — `sourceRoot: '.'` scans the root-level `app/` tree; upward imports into it are caught like anywhere else.

**Next.js — Pages Router (`src/pages`)**
- Shape — greenfield
- Outcome — `pages/` is the top layer; `pages/api/*` handlers import downward into `lib`, no violations.

**Monorepo: turbo + pnpm**
- Shape — per-package adoption
- Outcome — supported model: run `blueprint init` inside each package (`pnpm --filter <pkg> exec …`). The package manager is detected from the **workspace root** (lockfile / `pnpm-workspace.yaml` looked up through parent directories). Blueprint must be a devDependency of the package itself, so the contract's `node_modules` link resolves. Wire `blueprint inspect --baseline` as a turbo task per package (`"inspect": "blueprint inspect --baseline"`) and gate it however you already gate the monorepo.

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
- **Windows**: the full gate runs there on every commit, so the path-normalising
  branches (`scan`, `ignored`, `impact`, the relative-escape rule) are executed rather
  than reasoned about. One consequence worth knowing if you are on the platform: a
  **CRLF `tsconfig.json`** — the Windows default — used to fall through to "add these
  paths yourself" instead of getting the alias wired, with nothing said. The line ending
  is read off the file now, which also keeps the edit from mixing conventions into a
  file your own `linebreak-style` gate would then flag.
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

Remix / React Router framework mode, and tsconfig `paths` inherited through
`extends` chains (the `--alias` flag covers detection misses). If you
run blueprint on one of these,
[an issue with the outcome](https://github.com/taco3064/blueprint/issues) —
green or red — is the most useful contribution there is.
