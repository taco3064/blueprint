# @kekkai/blueprint — repo conventions

This package *is* the tool that generates architecture contracts. It should
live by the subset of its own handbook that applies to a Node library. It is
**not** a front-end app, so the layer model it emits (`pages → … → services`,
aliases, framework primitives) does **not** apply to this repo — the handbook
ideas below do.

## Module shape (enforced by convention, checked in review)

- **One module = one folder** with a single public entry `index.ts`. The
  implementation file is named after the module, never `main` — e.g.
  `emit/lint/lint.ts`, `inspect/inspect.ts`. Satellites keep semantic names
  (`plan.ts`, `scan.ts`, `analyze.ts`, `patterns.ts`, `sections.ts`).
- **Entry-only imports across modules.** Import another module through its
  folder (`../config`, `../project`, `../markdown`), never a deep path
  (`../config/graph`). Within a module, use relative paths (`./types`).
- **No `utils` junk drawer.** A shared file earns a name for what it does
  (`markdown`, `patterns`), or lives private to its module.
- **Emitters are pure and deterministic** (`emit*`, `defineBlueprint`,
  presets). Side effects live only in the runtimes (`bootstrap`, `inspect`,
  `cli`) and are split plan (pure) / apply (I/O).

## Layering (one-way, low → high)

`config` → `markdown` → `plugin` → `emit/*` → `presets` → `project` →
`inspect` → `survey` / `impact` → `bootstrap` → `cli`. A module imports only
from lower ones (survey reads inspect's scan; bootstrap embeds the survey in
its authoring playbook).
`project` is the shared reader (`detect` + `resolveBlueprint`) for both
runtimes; `plugin` is the embedded ESLint plugin (plain rule objects, no
internal deps) that `emit/lint` ships inside its output.

## Self-explaining output (every CLI / runtime message)

An adopting agent's only guaranteed in-context channel is the output of the
command it just ran — the playbook and docs were read long before the doubt
arises, and its priors ("tools usually behave like X") fill every gap the
output leaves. So **every message that reports a side effect (write / rm),
or a behavior that contradicts common tool intuition, carries its cause and
the next step in the same line.** Two truths without a bridge read as a
contradiction ("Adoption complete" beside "vacuous"); an effect without a
stated cause reads as breakage (a deletion blamed on a config field that
is not in the config). Field batches 10–12 are the case law.

## Fixing a field finding (two questions before the wording)

A finding's obvious fix is a better sentence, and that reflex is why the
authoring playbook went 152 → 877 lines in 17 days: 1133 added against 256
removed, and of the 69 commits that touched it only two ever made it shorter
(4fe2d55, 7a29e7d) — both refactors, never a field fix. Length is not the
defect. **The added sentence is where the next finding lands**, so ask two
things before writing one.

**1. Can the tool compute this?** A claim about the adopter's repo that the tool
could measure will come back however well it is worded, because the playbook
cannot see the repo it describes. "A Vite + TS starter keeps `vite.config.ts`
inside a tsconfig project, so `tsc -b` type-checks the vite edit too" was
asserted by 90301b7 (field #21–#22), reworded, and was still a finding at #99
three batches later — an agent disproved it by injecting a type error into
`vite.config.ts` (passed) against a control in `src/` (failed). The fix that
holds is a measurement, not a hedge: `hadClaudeDir` is `fs.existsSync` because
the playbook used to assert init created `.claude/`, which init knew and had not
checked. Prose is the right medium for judgment, boundaries and doctrine — not
for a fact that has an address.

**2. How many other instances are there?** Fix the class, not the paragraph.
8bd4aec is the shape to copy: it closed one finding, then swept and said so —
"this is the only universal claim about the adopter's repo shape in any output"
— and closed two more classes the same way in the same pass. A per-paragraph
patch leaves the generator running, which is why weeks of them did not lower the
per-run finding count.

Two shapes recur, and both are prose doing a program's job. **Enumerating
combinations**: naming all four ignore-rule × version-control states still left
one cell undecided, and three consecutive runs called it a coin flip (8bd4aec).
**The same passage written twice**: the `--print-config` caveats had drifted into
four paraphrases, and `git blame` shows two commits editing *both* copies in one
pass — the shape was at fault, not the care taken. That one is now
`printConfigCaveats`, one text at two indents.

Then record the verdict where the next person meets it — the source, not the
commit message. Same argument as the survivor proofs below: a judgement in a
commit message serves the review and afterwards has to be excavated with
`git log -S`.

## Tests & tooling

- **Co-locate tests**: `foo.test.ts` beside `foo.ts`; the test name matches the
  source.
- **`src/conformance/` is the adoption conformance suite** — every field-
  feedback scenario fossilized as an offline fixture repo driven through the CLI's
  own dispatch (`run()` in-process, and the real eslint from this repo's
  devDeps). When field testing finds a new adoption failure, its fixture lands
  here with the fix; field runs should only ever discover *new* scenarios.
  Test-only: never exported from the package entry.
- **`npm run dist:verify` checks the layer in-process tests cannot reach** — the
  bundle, the shebang, the `bin` and `exports` fields, and the `argv[1]` guard,
  by executing `dist/bin.js` on throwaway fixtures and importing the package
  entry. Runs in CI after `build`. The guard is why it exists: npm installs the
  bin as a symlink, and comparing `argv[1]` to the entry module without
  `realpathSync` makes the published CLI exit 0 having done nothing (the 0.1.1
  bug) — a state every in-process test passes.
- **100% coverage** (`vitest --coverage`). The only exclusions are real-I/O
  defaults and the bin guard, marked `/* v8 ignore */` because tests inject
  those effects (`exec`, `loadConfig`) instead of running them.
- **`npx stryker run` audits the suite itself** — 100% line coverage says every
  line ran, not that a wrong one would be caught. Internal only: no docs page, no
  handbook section, nothing emitted, and deliberately not a CI gate (Stryker has
  no approved-survivor ledger, so a threshold is a hard-coded number every `src/`
  edit invalidates — the unappeasable red this repo argues against elsewhere).
  Per file while working (`--mutate 'src/x/y.ts'`), full sweep before a merge.
  **A survivor is proven equivalent at the site, never silenced with a
  `// Stryker disable` comment**; where two guards shield each other, the proof
  names which one keeps the other honest — removing either alone still passes.
  At the site, because that is where the next sweep meets it: a proof in a commit
  message serves the review and then has to be excavated with `git log -S`, and
  re-litigating one is expensive (two of these were wrong the first time). Each opens
  with the word **undecidable**, so `grep -rni undecidable src/ --include='*.ts'` is
  the ledger — no file to maintain, no line numbers to drift, and the survivor count
  stays honest because nothing is suppressed. **The `-i` is load-bearing**: most of
  these proofs open a sentence, so the word is capitalized, and the case-sensitive
  form of this command reported 8 of the 20 proof lines actually in the tree — a
  ledger that under-counts by 60% while looking like it works.
  Not chased to 100% — but "equivalent" is a claim someone has read the mutant and
  written down why, not a bucket for whatever is left. The first sweep on this suite
  reported 87 survivors and the second 59; of those 59, **43 turned out to be
  untested rather than equivalent**, and three were product defects. Reach the
  verdict last.
  - **The full sweep is the authority; a per-file run flatters.** Same suite, same
    config, and two mutants that read as killed under `--mutate <one file>` read as
    survived in a whole run. Measure one file to work on it, measure the tree to
    believe it.
  - **Read both scores.** `total` counts every mutant, `covered` only the reachable
    ones, and the gap is `# no cov` — the `/* v8 ignore */` real-I/O defaults above,
    the same boundary vitest's coverage config draws (`agent.ts` alone: 78.57%
    against 100.00%). `# timeout` counts as killed; `# errors` is a mutant that
    crashed the runner, neither killed nor survived.
  - **Read a mutant as the parser groups it, not as the diff prints it.**
    `a && b && c` is `(a && b) && c`, so the survivor whose diff shows the first
    `&&` flipped is `(a || b) && c`. Two "Stryker is wrong here" calls came from
    reading the rendered line instead of the precedence, and both were wrong.
  - **A decision that only shows up as an absence has to be asked of the unit that
    makes it.** A blank `.gitignore` line, `toArray(undefined)`, an unreadable
    `package.json`, a comparator's equal case, a memoized walk: through the pipeline
    each answers "nothing", and nothing is what a broken one answers too. Export the
    unit and ask it directly (`toRule`, `compareText`, `toArray`, `detectCycle`,
    `dependencyNames` are all this) — or, where the shape itself is the problem, fix
    the shape: a function returning four fields of which two are garbage on failure
    makes every bound inside it unanswerable, however many tests are written.
  - **Kill leftover processes first.** A stale sandbox makes vitest collect
    `.stryker-tmp` as test files and the score comes back absurd (0.00%, 5.31%).
    `rm -rf .stryker-tmp` failing with "Directory not empty" is the tell:
    `pkill -9 -f "@stryker-mutator"; rm -rf .stryker-tmp`.
- **A string list is one contract per member.** Cover each entry, or the rest can
  be deleted with the suite green — and every entry in these lists is a real file,
  directory, rule id, or API name an adopter has. `it.each` over the list is the
  shape; restate the list in the test when the source keeps it private, so a
  removal turns one case red.
- **Formatting is ESLint-driven** (`@stylistic/*`); there is no Prettier. Run
  `npm run lint` / `eslint . --fix`. Enforcement rules mirror the handbook
  stance: never `eslint-disable` to dodge a rule; fix the structure.
- Verify a change with `lint` + `tsc` + `test` + `build`, and drive the CLI
  end-to-end (`node dist/bin.js init|inspect`) for runtime changes.
- **`npm run field:run` is the live adoption harness** (`scripts/field-run.mjs`):
  packs the local tree (no publish), stages scenario repos in a temp dir, runs
  the adoption prompt through each available agent CLI headlessly, verifies
  with the real doctor/inspect, and collects the structured feedback file into
  one report — filed as a `field-run` GitHub issue, the triage inbox.
  Conformance guards known scenarios; the harness hunts new ones. Triage flow:
  consolidate the issue's findings, judge each (fix / by-design / reject),
  put each fix through the two questions above, sweep the class before landing,
  land with conformance fixtures, close the issue referencing the
  commits — the closed issue is the public record of what shaped the release.
  `--dry` stages without spawning agents; `--repo <path>` adds the
  existing-repo scenario from a local clone; `--no-issue` keeps it local.
