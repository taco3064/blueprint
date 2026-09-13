# @kekkai/blueprint — repo conventions

This package *is* the tool that generates architecture contracts. It should
live by the subset of its own handbook that applies to a Node library. It is
**not** a front-end app, so the layer model it emits (`pages → … → services`,
aliases, framework primitives) does **not** apply to this repo — the handbook
ideas below do.

Everything on this page applies to **every** edit. The depth that applies only
to a particular job lives under [`.agents/docs/`](./.agents/docs/) — read the doc
when its trigger fires, before drafting a plan or an opinion, and don't
substitute first-principles reasoning for what it says.

| Doc | What it covers |
|---|---|
| [`.agents/docs/autonomous-delivery.md`](./.agents/docs/autonomous-delivery.md) | **Trigger:** shaping, delivering, resuming, or accepting a GitHub ticket. The shared rules for autonomy, scope, evidence, durable state, progress, and final acceptance. |
| [`.agents/docs/verification-layers.md`](./.agents/docs/verification-layers.md) | **Trigger:** adding a test for an adoption scenario; touching `bin` / `exports` / the shebang / the bundle; refactoring code that emits a document. What `src/conformance/` is for, the layer `npm run dist:verify` covers (the 0.1.1 symlink bug), and the byte baseline that belongs with an emitted-prose refactor. |
| [`.agents/docs/mutation-testing.md`](./.agents/docs/mutation-testing.md) | **Trigger:** reading automatic PR mutation evidence, judging a survivor, or adding a test because CI found weak coverage. Status adjudication and narrow equivalent-mutant proofs. |
| [`.agents/docs/field-triage.md`](./.agents/docs/field-triage.md) | **Trigger:** running live field validation, triaging a field finding, changing Agent-facing prose, or cutting a release. Exact packed candidates, affected replay, full convergence, and exact-SHA release authority. |

Repository workflows live under [`.agents/skills/`](./.agents/skills/). Use
`shape-ticket` to shape and later review decision fidelity, `deliver-ticket` to
produce the candidate, `accept-ticket` for independent exact-head acceptance,
`field-validation` to choose affected replay or full convergence, and `audit-docs`
when checking whether published guides, CLI help, the public API, translations,
generated examples, and runtime output still describe the same product.
The shared [write-authority interlock](./.agents/docs/autonomous-delivery.md#write-authority)
applies before every GitHub or repository mutation.

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
- **Never write `@kekkai/blueprint` inside this repo.** For an adopter that
  specifier resolves to an installed, versioned package; **here it is a
  self-reference, and `exports` sends it to `./dist/index.js`** — so anything
  written that way is reading whatever was last built rather than the source
  beside it, and nothing in the output says which. Import from the source, or
  import nothing: `defineBlueprint` is one line over `validateBlueprint`, which
  `project/resolve` already calls on load, so a config can be a plain object.
  The tell is a command whose answer changes when somebody runs `npm run build`
  and changes nothing else.
- **Emitters are pure and deterministic** (`emit*`, `defineBlueprint`,
  presets). Side effects live only in the runtimes (`bootstrap`, `inspect`,
  `cli`) and are split plan (pure) / apply (I/O).

## Layering (one-way, low → high)

`config` → `markdown` / `editorial` → `plugin` → `emit/*` → `presets` → `project` →
`inspect` → `survey` / `impact` → `bootstrap` → `cli`. A module imports only
from lower ones (survey reads inspect's scan; bootstrap embeds the survey in
its authoring playbook).
`editorial` renders domain-owned config facts for higher emit/runtime surfaces;
it may import `config`, but does not own or re-decide domain policy.
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

## Looking up a stance this project already took

New work raises questions its ticket does not answer — what this defaults to,
what the tool refuses to decide, what it says when the code is not there yet.
**Most of them are already answered, and the answer is usually not on a docs
page: it is the line some existing surface prints.** `missing-layer` says
"runway, not a todo: the rules arm when code lands", and that one line is the
whole position on declaring ahead of the code. `renderCoverage` says enforcement
is vacuous rather than reporting it green. `unavailableGate` says a gate you
cannot open is not a gate. **None of those three appears anywhere under
`docs/`** — a grep there finds the fourth (`utils/` is a junk drawer that grows
until everything imports it) and misses the rest.

Which is the section above read from the other end: messages carry their cause,
so the messages are where the causes are kept. So **look a position up by
reading what the tool already says out loud** — `src/inspect/`, `src/emit/`,
the CLI help and the published pages together — and extend that answer instead
of writing a second one beside it. Two positions on one question is a
contradiction, and an adopter meets it before we do.

## Tests & tooling

- **Co-locate tests**: `foo.test.ts` beside `foo.ts`; the test name matches the
  source. **A suite too big for one file splits by aspect, not by moving away
  from its source**: `<source>.<aspect>.test.ts`, still beside `<source>.ts`
  (`plan.eslint.test.ts`, `bootstrap.repo.test.ts`, `conformance.lint.test.ts`).
  `architecture.testFiles: []` puts tests under `maxLines` (400), so a source
  file under 400 lines whose test runs past it cannot satisfy both the gate and
  a strict 1:1 name — the aspect suffix is what gives. The one suite with no
  single source (`src/e2e/adoption.e2e.test.ts`) has no sibling to sit beside
  and takes the same shape. **The rule that would check the 1:1 name
  (`blueprint/test-filename-matches-source`) is declared `error` in
  `blueprint.config.mjs` and left with no files to run on by `testFiles: []` —
  the comment there says so in those terms** — because a gate this repo declares
  and cannot meet is the suppressions ledger #364 exists to not have.
- **100% coverage** (`vitest --coverage`). The only exclusions are real-I/O
  defaults and the bin guard, marked `/* v8 ignore */` because tests inject
  those effects (`exec`, `loadConfig`) instead of running them.
- **A string list is one contract per member.** Cover each entry, or the rest can
  be deleted with the suite green — and every entry in these lists is a real file,
  directory, rule id, or API name an adopter has. `it.each` over the list is the
  shape; restate the list in the test when the source keeps it private, so a
  removal turns one case red.
- **No comments. The ticket is the record.** No rationale block, no road not
  taken, no bug's biography, no invariant restated beside the code that already
  holds it, no note explaining the implementation to whoever reads it next. Each
  of those has a home that outlives the line and is searchable from outside the
  file — the issue comment, the commit message, the test. **Nothing compiles a
  comment and no gate reads one**, so a comment is a second copy of a record, and
  the copy is the one that goes stale.
- **Two exemptions, and neither of them is commentary.** A **doc comment on an
  exported symbol** is a published page: `typedoc` compiles it into the API
  reference an adopter reads, so it is output, held to what every other emitted
  document is held to. It says what the symbol is for and never how it works
  inside. And a mutation survivor proven equivalent is recorded with **Stryker's
  own directive** — `// Stryker disable next-line <Mutator>: <why the mutant
  changes nothing observable>` — which is an instruction to a tool rather than a
  note to a reader: the reason lands in the report beside the mutant it is about,
  so nothing is reconciled by hand. The derivation still goes in the commit.
- **Formatting is ESLint-driven** (`@stylistic/*`); there is no Prettier. Run
  `npm run lint` / `eslint . --fix`. Enforcement rules mirror the handbook
  stance: never `eslint-disable` to dodge a rule; fix the structure.
- Use focused local checks while iterating and let Husky enforce the outgoing floor.
  The PR's clean exact-candidate CI owns full lint, typecheck, test, build,
  distribution, compatibility, deterministic transformation, and changed-code
  mutation verification. Drive the CLI end-to-end for runtime changes.
- Four layers sit past ordinary unit examples: conformance, relevant
  `npm run field:transformation` replay in CI, `npm run dist:verify`, and live
  Agent validation of the exact main candidate artifact. Each exists because the one below passes on a
  harness. See [`verification-layers.md`](./.agents/docs/verification-layers.md)
  and [`field-triage.md`](./.agents/docs/field-triage.md);
  [`mutation-testing.md`](./.agents/docs/mutation-testing.md) audits the suite
  itself and is why "100% coverage" above is a floor, not the claim.
