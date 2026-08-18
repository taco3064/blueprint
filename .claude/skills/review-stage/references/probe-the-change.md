# The eight probes

**Trigger:** your own account of the change holds and it is time to decide what to run.

**Every probe here is one question in different clothes: what is the smallest input that makes this stage's conclusion collapse?** Not "does the normal case work" — the implementer already checked that, and it is the only thing an implementer reliably checks.

**State every class in the report — the ones you ran, and the ones you ruled not triggered with the reason.** A class silently skipped is indistinguishable from a class that found nothing, and the report is the only place that difference survives. `write-the-verdict.md`'s *Verified* and *Verification status* sections are where they go.

**And read output, never `grep` it.** A `grep` answers about the string you already suspected; the defect is normally the one you did not, and a search returning nothing is equally consistent with *unaffected* and *matched the wrong thing* while feeling like the first. Print the artifact. `CLAUDE.md`'s *How you verify* is the same rule from the delivery side.

## 1. Decision consistency

**Triggered by: every stage, without exception.** It is first because it is the only class whose failure cannot be seen from inside the code.

- Is what landed the direction the **owner chose**, or a neighbouring one that is cheaper to build?
- Was a **cost consideration promoted into a product decision**? An implementer may report a cost; it may never spend that report as a licence to switch options.
- When the change met a **trade-off the plan did not name**, did it stop and hand it back — or resolve it in the diff? A trade-off arriving already resolved is the finding, whichever way it was resolved.

**#371's first attempt is the case to keep in mind.** The owner had decided the two mechanisms should *align with ESLint*. What landed narrowed the shared contract to what both sides could already honour — internally consistent, fully tested, and a different decision. Every test below rank one was written against the substituted direction, so no amount of coverage could have reported it. **This is a BLOCKER, and it outranks a clean test run completely.**

## 2. Find the real authority

**Triggered by: any change where two mechanisms must agree** — an emitted config and a report about it, a rule and its documentation, a plugin and the analysis that explains it.

**One place decides; everywhere else explains what that place decided.** In this repo the shape is concrete: what `emitLint` emits, run through real ESLint, **is** the behaviour — `inspect` explains that same behaviour, and does not get its own opinion. A hand-rolled matcher that looks close enough is not equivalent; it is a second authority wearing the first one's name.

So search for which of these four the change did:

- **Shares the authoritative function outright.** The only shape that cannot drift.
- **Re-derives from the same raw config** — two computations of one answer, each tested against its own author's expectations.
- **Builds a parallel judgement** — a matcher, a normaliser, a comparator that reimplements semantics something else already owns.
- **Rests on a different underlying syntax than the side it claims to match.** This is the one that hides: two implementations can agree on every case anyone wrote down and still diverge, because the grammars underneath them are not the same grammar.

That last one is exactly how #371's divergence surfaced. The change permitted a flat `{a,b}` brace list; the question *"what about a `*` inside the braces?"* separated the two sides immediately — the hand-rolled matcher escaped the inner `*`, and `minimatch` went on expanding it. **A claim of equivalence with no shared function behind it is a claim to attack, not a design to admire.**

## 3. Scan every consumer, not the ones the ticket listed

**Triggered by: any change to a config field, a shared type, or the meaning of an existing term.**

**Also triggered by: any new output that encodes a file location, an import specifier, a module or layer name, or the extent of what is governed** — with no config field anywhere in the diff. Here the scan runs **backwards**: not *"who reads the field I changed"* but *"which existing field already decides the thing I just emitted"*. A stage that adds a consumer which should read a field and does not moves that field's line count by zero, so every trigger phrased around the diff misses it by construction — and the output ships wrong for exactly the adopters who set the field.

Search for the readers yourself. The ticket's file list is a starting point and has not yet been complete:

```
grep -rl "<fieldName>" src --include="*.ts" | grep -v test
```

Measured on this tree while writing this page: **`sourceRoot` has 18 non-test readers, `owns` 22, `modules` 17** — spanning `config`, `emit/*`, `plugin`, `inspect`, `bootstrap`, `survey`, `impact`, `project` and `presets`. The raw list is wider than the true consumer set, because the word also appears in prose and comments; **triaging it is the work, and starting from the ticket's list instead is the mistake.** Run it again rather than trusting these numbers — they were true of one commit.

Beyond the field name, search for: the **types** that carry it, the **shared helpers** that read it, **hand-built string concatenation** that assembles what the field is supposed to produce, **duplicated conditionals** testing the same thing in two places, and **assumptions about an older data shape** left behind by whoever changed the shape.

**One mechanical check, because this repo already has the shape:** a literal `src/` in a new path string owes a proof that the path is not `sourceRoot`'s to decide. Measured on this tree — `emit/lint/patterns.ts:19` is where `sourceRoot` resolves (`sourceRoot === '.' ? '' : `${sourceRoot}/``), so under `sourceRoot: 'app'` the emitted ESLint config governs `app/**`, while `emit/agent/sections.ts:131` hands that same adopter ``- `src/<layer>/` `` from a `renderPlacement(architecture)` that has `architecture.sourceRoot` in scope and never reads it (`emit/agent/` and `emit/docs/` contain zero occurrences of the field). **One config, two answers, and the prose is the one the agent obeys.** Re-measure rather than trusting the line numbers; the class is the point.

`blueprint.config.mjs`'s own `testFiles: []` is the case for why one field's second consumer matters: that row sets what the size gates reach *and* silently empties the file set of `test-filename-matches-source`, which is declared `error` and therefore runs on nothing. Two contracts, one field, and the second one is invisible unless you look for it.

## 4. Attack it with counterexamples

**Triggered by: every stage that adds or changes a judgement** — a rule, a matcher, a validator, a verdict, a normalisation.

Do not ask whether the happy path passes. **Ask what minimal input breaks the conclusion**, and walk these dimensions:

- **Cardinality**: empty, absent, exactly one, several, and several that interact.
- **Split ownership**: one package name divided between different owners.
- **Mixed legality in one operation**: one condition satisfied and another violated at the same time — most implementations report the first and forget the second.
- **Path shape**: `.`, `./`, a trailing slash, a nested path, an absolute path, `..`, and a **symlinked realpath** — the 0.1.1 bug published a CLI that exited 0 having done nothing because `argv[1]` was compared without `realpathSync`, and every in-process test passed. `.claude/docs/verification-layers.md` is why `dist:verify` exists.
- **Case differences**, on a filesystem that may or may not care.
- **Wildcards nested or combined** — a `*` inside a brace list, a `**` beside a `*`, a glob that also happens to be a literal.
- **Exempt and non-exempt together**: a rule with an exemption list, exercised with both kinds in one run.
- **Structural position**: a module's root, a file deep inside it, and `layers: false`.
- **Recovery combinations**: remote state only, local state only, both, neither.

**One counterexample that reproduces outranks any number of representative cases that pass.**

### Cross the dimensions — walking them one at a time is how a change passes each column and fails every cell

**The list above is axes. The defects live in the pairs.** Every one this repo has paid for so far needed two values held at once: a forbidden direction **and** a bare layer entry; `layers: false` **and** a folder whose name collides with a globally declared layer; a custom `sourceRoot` **and** an emitter that assembles its own path. Each axis had been exercised alone, and each passed alone — which is exactly what a report saying "all the edge cases are covered" is describing when it is wrong.

So before probing, **write down the axes this change actually puts in play, with their values** — that list is the report's `Axes in play`, and it is written here, before the pairs are formed, because an axis dropped at this step leaves no trace at the next one. For the module axis that came to: module shape (layered / `layers: false`), import site (module root / layer entry / inside a layer), spelling (relative / alias), permission (allowed / forbidden), source root (`src` / `.` / a nested path).

**Then take the pairs, not the product.** The full grid is unaffordable and mostly inert; the selection rule is the one the failures share — **for each pair, ask whether one axis has a value that suspends or reroutes the other axis's normal handling.** `layers: false` suspends layer-name resolution, so it crosses with everything that resolves a name; a bare entry suspends the depth arithmetic, so it crosses with everything that counts segments; a non-default `sourceRoot` reroutes every path, so it crosses with everything that emits one. Pairs where neither axis touches the other's path are the large, cheap remainder.

**Every pair those axes make is then crossed, or ruled out with the reason, under the report's `Dimensions crossed`** — the same standard the probe classes themselves are held to. A pair ruled out because the two axes provably cannot reach the same code is a result. A pair nobody wrote down is indistinguishable from one that was crossed and found clean, and that is the difference this record exists to keep.

## 5. Differential-test anything claimed consistent

**Triggered by: the stage asserting two mechanisms agree.** Then a differential test is mandatory, and it has a required shape: one config, one input, the authoritative result, the checked result, and **an expected answer you derived independently of both**.

```ts
// Not enough on its own — this passes when both sides are wrong together.
expect(inspectResult).toBe(eslintResult);

// Required: pin each side to the answer, not merely to each other.
expect(eslintResult).toBe(true);
expect(inspectResult).toBe(true);
```

**And the input has to be one the implementer's tests do not already contain.** Re-running their fixture through your own harness tests the harness, not the claim — a divergence that survived their suite lives precisely in the case nobody thought to write. So a consistency claim is checked against an input you constructed, or it is not checked.

**And the config has to come through the real emitter.** A hand-written lookalike tests two things that were never the pair in question — `src/conformance/` is the existing shape for this: fixtures driven through the CLI's own dispatch and the real ESLint from this repo's devDeps.

## 6. Ask what the tests actually prove

**Triggered by: any stage that adds or changes a test — which is all of them here.** Green is one piece of evidence, not a conclusion; `.claude/docs/mutation-testing.md` is this repo's own reason for saying so.

- Does it enter through the **real public entry**, or reach past it into an internal?
- Does the fixture come from the **real emitter** and run the **real ESLint**, or an approximation of both?
- Are there **both a red and a green** case? A rule with no failing input pinned is a rule that can be deleted with the suite still green.
- Does it test **only the example the author just fixed**? An instance repaired without the mechanism is a REQUIRED finding, and the next input of the same class reproduces it.
- Does the **fixture dodge the risky branch** — missing the very property the behaviour is about, so it passes for the wrong reason?
- **Is 100% coverage covering a wrong assumption?** Coverage counts executed lines; it says nothing about which of them assert anything. `CLAUDE.md`'s *a string list is one contract per member* is the common instance: a list covered as a whole where the rest of it could be deleted green.

## 7. Verify the engineering constraint that justified the design

**Triggered by: the change or its report offering a dependency, bundle, size, or compatibility argument as a reason.** **An engineering constraint offered as a reason is a claim, not a fact** — and it is the highest-value claim in the whole report, because it is the one that excused work.

Check it where the answer actually lives: `package.json`, `rolldown.config.ts`, the `external` list, the `files` array, the `exports` map, `npm run dist:verify`, and whatever `README.md` and `docs/` publicly promise.

**The measured case:** during #371, *"adding a matcher would break zero runtime dependencies"* was offered as a reason not to align. `package.json` has no `dependencies` at all, and `rolldown.config.ts` marks only `node:` builtins external — so a non-external dependency is **bundled into `dist`** and never appears in an adopter's install tree. The premise was false, and the design decision resting on it therefore had no support. **"Sounds plausible for a build system" is not a finding either way; read the build.**

## 8. Walk the state transitions, and the interruption points between them

**Triggered by: any change to a skill, a workflow, a CLI sequence, a GitHub operation, or anything else executed in more than one step.** The other seven probes read code and output. This one reads **a process**, and a process fails in a way none of them can see: correctly at every step, and unrecoverably between two of them.

For every state the change defines, answer:

- **How is this state identified** from the outside, by somebody arriving with no memory of how it was reached?
- **What is the next legal action** from here, and is exactly one of them legal?
- **What evidence is already durable** at this point, and what exists only in the running session's context?
- **Is a re-run safe** — idempotent, or does it duplicate work, or double-spend a budget?
- **What is lost if the process dies right here** — a verdict, a round already consumed, work not yet written down, a decision nobody can reconstruct?
- **Can a gate be skipped** by arriving at a later state directly?

**Then simulate an interruption at each boundary rather than reasoning about them in general.** For this repo's own delivery loop that is nine: after the first `git add -A` and before the fixer; after the fixer and before the re-stage; after staging and hashing and before the dispatch; part one done and part two unsent; BLOCKED and no fix yet; fix done and re-review not run; PASS and no commit; committed and not pushed; pushed and no delivery comment. **Every review round of #373 found its defects this way and nothing else found them** — the rules read correctly forwards, and the evidence chain broke backwards.

**Take the boundary list from the process under review, not from this page.** These nine are that loop's, at one commit, and the third round of #373 found the first of them wrong here — it still named a state the corrected staging order had made unreachable. **A boundary list is itself a claim about the process, so derive it from the steps in front of you and check each state is actually reachable.**

**A documented command also has to be executable as written**, which is the same class of defect one level down. #373's first attempt said *"run the commit gate's fixer before you stage"* — conceptually right, and `lint-staged` runs **on staged files**, so no reading of that instruction executes. Check, for each command a process document names: its required precondition, what it actually reads, whether it mutates the worktree, the index or nothing, what it leaves behind on failure, and **whether the documented order can be performed in that order at all.**
