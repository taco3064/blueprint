# Mutation testing (`npx stryker run`)

**Trigger:** running or reading a mutation sweep; judging a survivor; adding a
test because a sweep said something was untested.

`npx stryker run` audits the suite itself — 100% line coverage says every line
ran, not that a wrong one would be caught. Internal only: no docs page, no
handbook section, nothing emitted. It runs **on** CI without being a CI **gate**
— `.github/workflows/mutation.yml` is `workflow_dispatch` and nothing else,
because Stryker has no approved-survivor ledger, so a threshold is a hard-coded
number every `src/` edit invalidates — the unappeasable red this repo argues
against elsewhere.

**Dispatch it rather than running it locally.** Per file while working, full
sweep before you believe the number:

```
gh workflow run mutation.yml --ref <branch>                          # whole tree
gh workflow run mutation.yml --ref <branch> -f mutate='src/x/y.ts'   # one file
```

A local sweep copies the whole project into `.stryker-tmp` once per core, and
watching those copies exhausted the editor's file-descriptor budget — the
workspace now excludes the path, but a clean runner is where a number filed as
authoritative belongs anyway. The `--ref` is typed rather than inferred and there
is no `npm run` shortcut on purpose: `gh` is not on this repo's script surface,
and the one argument a shortcut would guess is the one that decides which tree
you measured. Read the result in the run's step summary — survivors grouped by
file, with the scope named; the html artifact carries the diffs.

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

**Three endings, and the third is the valuable one.** A survivor is closed by a
test, by an `undecidable` proof at the site, or **by changing the source** —
because the mutant survived on a branch that decides nothing, and the honest
answer is that the branch should not be there. That third ending is what mutation
testing is *for*: a test written to pin meaningless behaviour makes the suite
longer and the code no better. `?? {}` defaulting a missing option block into
empty lists, so a rule with nothing to judge ran anyway and answered "legal" to
everything, is the shape — the mutant lived because nothing downstream could tell
the difference, and `if (!options) return {}` is the fix.

**But say so in the commit type.** A source change reached `main` under
`test: close the survivors in …`, and anyone scanning `git log` for behaviour
changes skips `test:` by design. Type it `fix:` or `refactor:` and name the
survivor that forced it. The change was right and the label was not, which is the
combination that gets waved through — a wrong label on a wrong change gets caught
by review.

Two endings are still wrong, and neither is this one: a survivor recorded as
noise, and `src/` edited to move a score with no defect behind it. The test is
whether you can name what the mutant proved. "It survived" is not an answer;
"this branch cannot change any output" is.

**The ledger does the first pass, so start there rather than at the report.** The
third sweep — the first dispatched, ~8k mutants in 17m04s on a runner against
5m34s on ten local cores — reported **35 survivors, and the `undecidable` grep
already accounted for 24 of them**. Reading the report top to bottom would have
re-litigated two thirds of a list that was answered. Match the report against the
grep first; what is left is the work.

Converging those 11 took the fourth sweep to **24 survivors, every one of them
proven at the site** (99.35% total / 99.51% covered). That is the floor to expect:
a higher number means new code arrived without assertions, not that something here
regressed. None of the 11 turned out to be equivalent, so the convergence touched
test files only.

- **The full sweep is the authority; a per-file run flatters.** Same suite, same
  config, and two mutants that read as killed under `--mutate <one file>` read as
  survived in a whole run. Measure one file to work on it, measure the tree to
  believe it.
- **Read both scores.** `total` counts every mutant, `covered` only the reachable
  ones, and the gap is `# no cov` — the `/* v8 ignore */` real-I/O defaults, the
  same boundary vitest's coverage config draws (`agent.ts` alone: 78.57%
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
- **A local run leaves processes behind — a dispatched one cannot.** A stale
  sandbox makes vitest collect `.stryker-tmp` as test files and the score comes
  back absurd (0.00%, 5.31%). `rm -rf .stryker-tmp` failing with "Directory not
  empty" is the tell: `pkill -9 -f "@stryker-mutator"; rm -rf .stryker-tmp`. Kept
  here for the sandbox left over from before this moved to CI, and for reading an
  absurd score correctly if one ever appears — the runner starts clean every time,
  so a dispatched sweep cannot produce this.

## What the sweep cannot see

`StringLiteral` is excluded, on measured evidence recorded in
`stryker.config.json`'s own comment. That exclusion draws a boundary around
*prose* — and explicitly not around **a discrete contract per literal**. An
allowlist member, a rule id, a per-site indent: those are contracts, and they are
owed ordinary assertions that hold whether or not this mutator runs. A clean sweep
on a file full of string literals is not evidence they are tested.
