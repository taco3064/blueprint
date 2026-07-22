# AI-Assisted Adoption

Adopting blueprint on a **brownfield** repo is a judgment call, not a scaffold: the
layers already exist, and someone has to *read* them before rules can encode them.
Blueprint splits that work into three parts — and only the middle one needs
intelligence:

| Part | Who | Tool |
|---|---|---|
| **Evidence** — folders, import matrix, module shapes, package concentration | deterministic | `blueprint survey` |
| **Judgment** — which folders are layers, which way the flow points, what's debt vs intent | an agent (or you) | the authoring playbook |
| **Validation** — findings must be explainable as real debt, not mistranslation | deterministic | `blueprint inspect` + the baseline ratchet |

## The flow

Run `init` on a repo that has source code but no `blueprint.config.mjs`:

```bash
npx @kekkai/blueprint init
```

Instead of guessing a preset, init surveys the code and writes:

- **`blueprint-authoring.md`** — an executable playbook: the survey evidence, the
  authoring method, the emitted-rule semantics (flat vs folder layout, what the
  wiring will flag), the config schema sketch, and the acceptance gates
- **`.claude/commands/blueprint-author.md`** — so Claude Code users can just type
  `/blueprint-author`

Then hand it to your agent:

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# or: codex "…same prompt…"
# or, in one step:
npx @kekkai/blueprint init --agent claude
```

The agent derives the config from the evidence, iterates against
`blueprint inspect` until every finding is explainable as real debt, re-runs `init`
for the artifacts, and locks the baseline. You review the result.

`--agent` is the thinnest possible layer: it spawns the **printed** command in the
foreground, interactive, under your own agent CLI's permissions — see
[Security & Trust](/guide/security) for the exact boundaries.

To skip the authoring flow entirely and scaffold the framework preset even on a
brownfield repo, pass `init --preset` — the escape hatch when you already know the
preset fits.

## A prompt that works

The method doesn't belong in the prompt — the evidence, derivation steps, and gates
all live in `blueprint-authoring.md`. The prompt only pins what "done" means:

```text
Help adopt @kekkai/blueprint in this repo, autonomously:
run `npx @kekkai/blueprint init --authoring`,
then execute the blueprint-authoring.md it writes, fully and to the end.

Acceptance — `blueprint doctor` passes, plus:
- lint, `inspect --baseline`, and the existing tests all pass
- emitLint genuinely wired into ESLint (no leftover reference files)
- no source edits — existing debt (if any) goes to its native ledger:
  `inspect --update-baseline` for architecture, `eslint --suppress-all` for
  lint (both only when debt exists — an empty ledger is ceremony); zero findings means the ledgers stay absent — that IS success,
  don't manufacture debt to have something to lock
```

`--authoring` guarantees the playbook is written even on a small repo (plain `init`
below the file-count threshold scaffolds a preset instead — no playbook). Each
acceptance clause maps to an incomplete state seen in field testing: half-done
integration, gates never run, debt payments mixed into adoption. Greenfield repos
skip all of this — `init` alone completes; and once `init` has run, typing
`/blueprint-author` in Claude Code does the same job.

## Verify it's finished — `blueprint doctor`

"Is adoption actually done?" is a question the prompt's acceptance clause used to
leave to memory. `blueprint doctor` answers it as a read-only checklist, exit 0 only
when every check passes — so it drops into an agent's verify loop or CI:

```bash
npx @kekkai/blueprint doctor
```

- **blueprint.config.mjs present**
- **no leftover `*.blueprint.*` reference files** — a reference still on disk means
  the merge never finished (the single most-missed step)
- **eslint wired to emitLint** — and a legacy `.eslintrc` is flagged to migrate first,
  never silently left half-adopted
- **import alias wired to the toolchain** — a declared alias that neither tsconfig
  `paths` nor a bundler config (vite / webpack / vue-cli / next / rsbuild) resolves
  would send agents into unresolvable imports; the failure carries the exact wiring
  snippet
- **emitted rules survive the merged config** — flat config never merges a rule two
  entries set: a later entry silently *replaces* blueprint's structural bans while
  lint stays green. Doctor resolves the final config for a real layer file and
  names what was lost
- **architecture clean** — no findings outside the baseline; the detail line states
  the coverage (source files inside layer nets, active optional gates — the
  structural boundary rules are always on), so a vacuously
  green gate is visible instead of quietly reassuring — and the vacuous callout
  names the step that arms the net (move code into a declared layer)
- **lint suppressions ledger current** — stale entries in `eslint-suppressions.json`
  (files that no longer exist) fail the check

`--json` emits the same checklist for tooling.

## Why the survey matters

Letting an agent grep a repo from scratch is slow and unreliable. `survey` hands it
deterministic facts instead:

```bash
npx @kekkai/blueprint survey          # human-readable
npx @kekkai/blueprint survey --json   # for tooling / agents
```

- top-level folders with **module-shape evidence** (index coverage, nesting depth —
  the folder-vs-flat call)
- the **folder-to-folder import matrix**, heaviest edges first — the intended flow
  direction, and the counter-edges that are debt (the matrix counts test files;
  `inspect` excludes them, so its numbers run lower)
- **package-usage concentration** — `owns` candidates
- test-convention hits — what belongs in `testFiles`, not in `layers`

## Decide conflicts on numbers — `blueprint impact`

Field testing's costliest authoring step was deciding rule conflicts before
wiring: "how many times would each emitted rule fire on this repo?" used to be
answered by dumping the emitted config and reading it against the code by
hand. `impact` answers it directly:

```bash
npx @kekkai/blueprint impact          # how red would the wiring be?
npx @kekkai/blueprint impact --json   # feed the counts to tooling / an agent
```

It compiles the authored config with `emitLint`, runs the **project's own**
ESLint over the layer files with only that config, and reports hits per rule
with the heaviest files named. Informational, never a gate — exit 0 whatever
the count, and the total counts **only** violations the wiring would
introduce. Isolation artifacts render apart and never inflate it:
`parse-error` (a file could not be parsed; its numbers are untrustworthy)
and `unused-disable-directive` (an inline disable suppressing nothing *in
isolation* — one pointing at your own config's rules vanishes after the
merge, a truly stale one survives it) sit under "Isolation caveats"; rule ids
blueprint does not emit sit apart as *echoes of your own config* — a row
there mirroring a blueprint hit is the same spot seen through your house
rule's name, not a second violation. The report's closing line says it
plainly: the numbers decide **tiers**, not just suppressions — a rule you
would suppress everywhere is usually better declared `warn`/`off` in the
blueprint `rules` block, with suppressions locking only what remains.

## Failure semantics

Every artifact is on disk **before** any agent starts. A launch that fails, or an
agent that gives up midway, degrades to exactly the manual path — the same playbook,
walked by you. `inspect` is read-only, `init` is idempotent, and the baseline is only
written at the final step, so there is no half-adopted state to clean up.

## Existing debt — turn it red, then ratchet it

Adoption's job is to make debt visible and lock it, not to quiet the screen. On a repo
with existing violations, keep severity at `error` and lock each side of the debt in
its **native ledger**:

- **architecture debt** → `npx blueprint inspect --update-baseline`
  (`.blueprint-baseline.json` — the ratchet you already know)
- **lint debt** (maxLines, unusedVars…) → `npx eslint . --suppress-all`
  (ESLint ≥ 9.24 bulk suppressions — counted per file × rule, so **new** violations
  still fail)

CI then gates on both — `eslint` and `blueprint inspect --baseline` — and each blocks
only *new* debt. Two files, one discipline: `blueprint doctor` verifies neither ledger
has gone stale.

Still on ESLint 8, or a legacy `.eslintrc`? Suppressions need ESLint ≥ 9.24 + flat
config, and that migration is your call, never the playbook's. The **transitional**
fallback until then: `emit: { lint: { severity: 'warn' } }` — with its cost stated
plainly: `severity` covers only the structural rules (metric rules like `maxLines`
keep their own tiers), and while it's warn, new metric debt is not gated.

## Scope honesty

The playbook authors the config and locks the baseline — it does **not** promise to
refactor the debt away. Existing violations are recorded and paid down later through
the [baseline ratchet](/guide/getting-started#brownfield-—-blueprint-inspect); adoption
and debt burn-down are different jobs.

The inverse expectation needs stating too: on a clean or young repo, expect **zero
findings** — that is the codebase being clean, not the config being loose (the
coverage line tells you whether the net actually reaches your files). Blueprint's
immediate value there is forward-looking: it pins down how future code will be
judged — the handbook, the agent contract, the gates — rather than harvesting
existing bugs. "Keeping a codebase honest" starts with writing the standard of
honesty down *before* the violations exist; the teeth bite as code lands.
