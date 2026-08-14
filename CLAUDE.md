# @kekkai/blueprint — repo conventions

This package *is* the tool that generates architecture contracts. It should
live by the subset of its own handbook that applies to a Node library. It is
**not** a front-end app, so the layer model it emits (`pages → … → services`,
aliases, framework primitives) does **not** apply to this repo — the handbook
ideas below do.

Everything on this page applies to **every** edit. The depth that applies only
to a particular job lives under [`.claude/docs/`](./.claude/docs/) — read the doc
when its trigger fires, before drafting a plan or an opinion, and don't
substitute first-principles reasoning for what it says.

| Doc | What it covers |
|---|---|
| [`.claude/docs/verification-layers.md`](./.claude/docs/verification-layers.md) | **Trigger:** adding a test for an adoption scenario; touching `bin` / `exports` / the shebang / the bundle; refactoring code that emits a document. What `src/conformance/` is for, the layer `npm run dist:verify` covers (the 0.1.1 symlink bug), and the byte baseline that belongs with an emitted-prose refactor. |
| [`.claude/docs/mutation-testing.md`](./.claude/docs/mutation-testing.md) | **Trigger:** running or reading `npx stryker run`; judging a survivor; adding a test because a sweep called something untested. Survivor proofs at the site (`undecidable` as the ledger), why the full sweep is the authority, how to read both scores, and where the `StringLiteral` exclusion draws its boundary. |
| [`.claude/docs/field-triage.md`](./.claude/docs/field-triage.md) | **Trigger:** running `npm run field:run`; triaging a `field-run` issue; writing or rewording any prose an adopting agent reads (playbook / CLI output / contract); cutting a release. Harness flags, the triage flow, the two questions before the wording — can the tool compute this, and how many other instances are there — and the release sequence, including the one step no workflow gate covers. |

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

`config` → `boundary` → `markdown` → `plugin` → `emit/*` → `presets` →
`project` → `inspect` → `survey` / `impact` → `bootstrap` → `cli`. A module
imports only from lower ones (survey reads inspect's scan; bootstrap embeds the
survey in its authoring playbook).
`project` is the shared reader (`detect` + `resolveBlueprint`) for both
runtimes; `plugin` is the embedded ESLint plugin that `emit/lint` ships inside
its output — plain rule objects with exactly one internal dependency,
`boundary`, running downward.
`boundary` answers what an import does to a module boundary (`verdict`) and
where a specifier lands (`resolve`). It sits below `plugin` so that a lint rule
and the matching `inspect` finding reach **one** judgment rather than two
readings that can drift apart — which they did, four times, before the
judgments were shared. An exception permitting `plugin` → `inspect` would have
been unenforceable: the next rule that wants `analyze` calls itself a verdict,
and no test can tell it apart. `src/plugin/plugin.test.ts` holds that
dependency list to one entry.

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

## Tests & tooling

- **Co-locate tests**: `foo.test.ts` beside `foo.ts`; the test name matches the
  source.
- **100% coverage** (`vitest --coverage`). The only exclusions are real-I/O
  defaults and the bin guard, marked `/* v8 ignore */` because tests inject
  those effects (`exec`, `loadConfig`) instead of running them.
- **A string list is one contract per member.** Cover each entry, or the rest can
  be deleted with the suite green — and every entry in these lists is a real file,
  directory, rule id, or API name an adopter has. `it.each` over the list is the
  shape; restate the list in the test when the source keeps it private, so a
  removal turns one case red.
- **Assert the part that could be wrong.** A line can run, satisfy coverage, and
  be asserted by a test that never reads what it says. Five of these landed in one
  release: a `toContain` matched a folder line two rows above the one it named; an
  assertion on a message began *after* its prefix, and the prefix was the defect;
  two cases pinned a finding's `subject` and `severity` while its `path` and
  `message` went unread; and the layer-level twin of one of those ran only on a
  flat config, where the wrong path is the right one. Before writing the
  assertion, name the thing that would break — then check that a wrong value there
  turns it red. Coverage cannot see this and neither can `tsc`, so nothing else
  will.
- **A comment carries only what the name, the type, the test, and the commit
  message cannot.** History goes to the commit — "this used to be X", a road not
  taken, a bug's biography. An invariant a test already covers is the test's to
  state. Two things stay: doc comments on exported symbols (the API docs are
  generated from them), and the one-line `undecidable` assertion a mutation
  survivor is proven equivalent by — `grep -rni undecidable src/` is that ledger,
  so the word stays at the site while the derivation goes in the commit.
- **Formatting is ESLint-driven** (`@stylistic/*`); there is no Prettier. Run
  `npm run lint` / `eslint . --fix`. Enforcement rules mirror the handbook
  stance: never `eslint-disable` to dodge a rule; fix the structure.
- Verify a change with `lint` + `tsc` + `test` + `build`, and drive the CLI
  end-to-end (`node dist/bin.js init|inspect`) for runtime changes.
- Three layers sit past the unit tests, each because the one below it passes on a
  real defect: the conformance suite, `npm run dist:verify`, and the live field
  harness. See [`verification-layers.md`](./.claude/docs/verification-layers.md)
  and [`field-triage.md`](./.claude/docs/field-triage.md);
  [`mutation-testing.md`](./.claude/docs/mutation-testing.md) audits the suite
  itself and is why "100% coverage" above is a floor, not the claim.
