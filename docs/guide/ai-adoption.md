# AI-Assisted Adoption

Adopting blueprint on a **brownfield** repo is a judgment call, not a scaffold: the
layers already exist, and someone has to *read* them before rules can encode them.
Blueprint splits that work into three parts — and only the middle one needs
intelligence:

**Evidence** — top-level shape, folders, import matrix, unit shapes, package concentration
- Who — deterministic
- Tool — `blueprint survey`

**Judgment** — which folders are layers, which way the flow points, what's debt vs intent
- Who — an agent (or you)
- Tool — the authoring playbook

**Validation** — findings must be explainable as real debt, not mistranslation
- Who — deterministic
- Tool — `blueprint inspect` + the baseline ratchet

## Why the survey matters

Letting an agent grep a repo from scratch is slow and unreliable. `survey` hands it
deterministic facts instead:

```bash
npx @kekkai/blueprint survey          # human-readable
npx @kekkai/blueprint survey --json   # for tooling / agents
```

- the **top-level shape verdict** — `flat` or `modular`, with the evidence that
  decided it (`shape` in `--json`, `Top-level shape:` in the human output). This
  is the call [`--structure`](/guide/structure) needs, and when the evidence does
  not decide it prints `COULD NOT TELL` rather than guessing
- top-level folders with **unit-shape evidence** (index coverage, nesting depth —
  the folder-vs-file call). Under a `modular` verdict the same rows read the
  modules' children
- the **folder-to-folder import matrix**, heaviest edges first — the intended flow
  direction, and the counter-edges that are debt (the matrix counts test files;
  `inspect` excludes them, so its numbers run lower)
- **package-usage concentration** — `owns` candidates
- **named imports concentrated in one folder**, from a package spread across several
  — the only evidence a specifier-level `owns: [{ package, imports: […] }]` can be
  checked against (read from brace clauses, so a member reached through
  `import * as` is not counted)
- test-convention hits — what belongs in `testFiles`, not in `layers`

## The flow

Run `init` on a repo that has source code but no `blueprint.config.mjs`:

```bash
npx @kekkai/blueprint init
```

Instead of guessing a preset, init surveys the code and writes:

- **`blueprint-authoring.md`** — an executable playbook: the survey evidence, the
  authoring method, the emitted-rule semantics (`file` vs `folder` unit layout,
  what the wiring will flag), the config schema sketch, and the acceptance gates
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
preset fits. It does not exempt the [structure question](/guide/structure): below the
file-count threshold `--preset` still asks for `--structure` first, because the
preset ships both shapes and nothing in a tree that small can tell them apart.

## A prompt that works

The method doesn't belong in the prompt — the evidence, derivation steps, and gates
all live in `blueprint-authoring.md`. The prompt only pins what "done" means:

```text
Help adopt @kekkai/blueprint in this repo, autonomously:
run `npx @kekkai/blueprint init --authoring`,
then execute the blueprint-authoring.md it writes, fully and to the end
(an early exit the playbook itself prescribes counts as full execution).

Acceptance — `blueprint doctor` passes, plus:
- lint, `inspect --baseline`, and the existing tests all pass
  (no tests = passes vacuously)
- emitLint genuinely wired into ESLint (no leftover reference files)
- no source edits — existing debt (if any) goes to its native ledger:
  `inspect --update-baseline` for architecture, `eslint --suppress-all` for
  lint (both only when debt exists — an empty ledger is ceremony); zero findings means the ledgers stay absent — that IS success,
  don't manufacture debt to have something to lock
```

`--authoring` guarantees the playbook is written even on a small repo (plain `init`
below the file-count threshold scaffolds a preset instead — no playbook, and it asks
for [`--structure`](/guide/structure) before it will scaffold one; `--authoring` is
the one path that reaches a small repo without that question, since the playbook
answers it from the evidence). Each
acceptance clause maps to an incomplete state seen in field testing: half-done
integration, gates never run, debt payments mixed into adoption. Two clauses
resolve vacuously and that is fine: a repo with no tests passes the tests
clause without adding a runner, and zero debt means the lock commands are
skipped, not performed for ceremony. Greenfield repos
skip all of this — `init` alone completes; and once `init` has run, typing
`/blueprint-author` in Claude Code does the same job.

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
blueprint does not emit sit apart as *names your own config owns* — a name
your code carries in an `eslint-disable` comment, which this isolated run
cannot resolve, reported **at that comment**. So a count there counts
mentions, not violations, and says nothing about the code underneath one; a
row mirroring a blueprint hit is the same spot seen through your house rule's
name, not a second finding. The report's closing line says it
plainly: the numbers decide **tiers**, not just suppressions — a rule you
would suppress everywhere is usually better declared `warn`/`off` in the
blueprint `rules` block, with suppressions locking only what remains.

## Verify it's finished — `blueprint doctor`

"Is adoption actually done?" is a question the prompt's acceptance clause used to
leave to memory. `blueprint doctor` answers it as a read-only checklist — so it drops
into an agent's verify loop or CI:

```bash
npx @kekkai/blueprint doctor
```

- **blueprint.config.mjs present**
- **no leftover reference, authoring, or stale contract files** — a `*.blueprint.*`
  reference still on disk means the merge never finished (the single most-missed
  step); `blueprint-authoring.md` and its `/blueprint-author` command file are the
  playbook's own last step to delete, so a doctor run *mid*-authoring is expected to
  fail here; and a marker-bearing contract file outside the emitted `emit.agents` set
  is an orphan nothing maintains
- **eslint wired to emitLint** — and a legacy `.eslintrc` is flagged to migrate first,
  never silently left half-adopted
- **import alias wired to the toolchain** — a declared alias that neither tsconfig
  `paths` nor a bundler config (vite / webpack / vue-cli / next / rsbuild) resolves
  would send agents into unresolvable imports; the failure carries the exact wiring
  snippet
- **emitted rules survive the merged config** — flat config never merges a rule two
  entries set: a later entry silently *replaces* blueprint's structural bans while
  lint stays green. Doctor resolves the final config for a real layer file and names
  what was lost. Its ✓ also states its own reach: it compares config *text* and never
  executes ESLint — structural bans, the module-root ban, the embedded plugin rules and
  each active gate's carrier rule, one probe per emitted entry (per layer on a flat
  config; per (`module`, `layer`) and per module zone under
  [`modules`](/guide/structure)), with thresholds, package-ownership entries
  and a merged entry covering only part of one entry's files left uncompared. When the
  config will not resolve, this check
  **skips** instead of failing (below), quoting the loader so the missing package is
  on screen rather than one `npm run lint` away
- **architecture clean** — no findings outside the baseline; the detail line states
  the coverage — source files inside layer nets, and the ones outside are *named*
  (up to a cap), because "12 of 40" is a number its reader cannot check; plus active
  optional gates, the structural boundary rules being always on. So a vacuously green
  gate is visible instead of quietly reassuring — and the vacuous callout names the
  step that arms the net at the address *your* config has: `src/<layer>/` on a flat
  config, `src/<module>/<layer>/` under [`modules`](/guide/structure), where a layer
  is a folder inside a module and one at the source root is an `undeclared-module`
  error rather than a remedy
- **lint suppressions ledger current** — stale entries in `eslint-suppressions.json`
  (files that no longer exist) fail the check

### Three outcomes, not two

**A check that could not run is not a check that passed.** The merge-survival check
skips rather than fails when the config will not resolve — a red you cannot appease is
worse than no check — and while that skip rode in the pass count, the output read
`✓ … (skipped)` above `✓ Adoption complete — all 7 checks passed`. What you see now:

```
⊘ emitted rules survive the merged eslint config (skipped — could not resolve …)
⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run (⊘ above). Nothing failed, and nothing here proves what those checks cover.
```

(The banner is one line — wrapped here only by your terminal.)

**The exit status is unchanged — a skip is not a failure, so this run still exits 0.**
Which is the reason to gate on `--json` rather than the exit code:

```json
{ "ok": true, "verdict": "unverified",
  "summary": "⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run …",
  "counts": { "total": 7, "passed": 6, "failed": 0, "skipped": 1 },
  "checks": [ { "label": "…", "ok": true, "skipped": "why it could not run" } ] }
```

`ok` keeps the meaning the exit code needs — nothing *failed*. `verdict` is
`complete` / `unverified` / `incomplete`, and rides on
[`runDoctor`](/api/functions/runDoctor)'s return value too, so `verdict` or
`counts.skipped` is what a CI gate should branch on.

One more thing a green says out loud, under the banner rather than as an eighth check
(it cannot fail, so it would push the count): **on a repo with no version control**,
every check can pass while nothing adoption wrote is committed — and a ratchet living
only in an uncommitted working tree is not installed, because the next clone starts
without it. Initialising version control is the owner's call, never an adopting
agent's.

## Existing debt — turn it red, then ratchet it

Adoption's job is to make debt visible and lock it, not to quiet the screen. On a repo
with existing violations, keep severity at `error` and lock each side of the debt in
its **native ledger**:

- **architecture debt** → `npx blueprint inspect --update-baseline`
  (`.blueprint-baseline.json` — the ratchet you already know)
- **lint debt** (maxLines, unusedVars…) → `npx eslint . --suppress-all`
  (ESLint ≥ 9.24 bulk suppressions — counted per file × rule, so **new** violations
  still fail)

Your gate then runs both — `eslint` and `blueprint inspect --baseline` — and each blocks
only *new* debt. Two files, one discipline: `blueprint doctor` verifies neither ledger
has gone stale.

Still on ESLint 8, or a legacy `.eslintrc`? Suppressions need ESLint ≥ 9.24 + flat
config, and that migration is your call, never the playbook's. The **transitional**
fallback until then: `emit: { lint: { severity: 'warn' } }` — with its cost stated
plainly: `severity` covers only the structural rules (metric rules like `maxLines`
keep their own tiers), and while it's warn, new metric debt is not gated.

## Failure semantics

Every artifact is on disk **before** any agent starts. A launch that fails, or an
agent that gives up midway, degrades to exactly the manual path — the same playbook,
walked by you. `inspect` is read-only, `init` is idempotent, and the baseline is only
written at the final step, so there is no half-adopted state to clean up.

The same ordering holds one level down, inside `init` itself: **every filesystem
effect lands above the dependency install**, so what an interrupted run leaves behind
is a complete tree minus `node_modules`. That matters because the install is the one
step that can sit for minutes — a package manager with no route to the registry
retries in silence — so the line above it prints the command it is about to run, says
that quiet is normal and that minutes of quiet means stopping it and running that line
yourself (or re-running with `--no-install`), and names what stopping omits: these
packages in `package.json`. Until that line runs, a failure naming one of them is that
gap, not a broken adoption.

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
