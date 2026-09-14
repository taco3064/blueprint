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
| [`.agents/docs/verification-layers.md`](./.agents/docs/verification-layers.md) | **Trigger:** adding a test for an adoption scenario; touching `bin` / `exports` / the shebang / the bundle; refactoring emitted documents or operational prose. What `src/conformance/` is for, the layers `npm run dist:verify` and `npm run operational:check` cover, and when a supplementary byte baseline belongs with a refactor. |
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

`config` → `markdown` → `operational-contract` → `plugin` → `emit/*` → `presets` →
`project` → `inspect` → `survey` / `impact` → `bootstrap` → `cli`. A module imports only
from lower ones (survey reads inspect's scan; bootstrap embeds the survey in
its authoring playbook).
`operational-contract` owns Blueprint-authored CLI, generated, runtime, field,
and checked-in operational text. It renders supplied facts for higher surfaces;
it may import `config` and `markdown`, but never imports `project`, `inspect`, or
`bootstrap` and does not own or re-decide domain policy. Every renderer owner is
declared in its surface registry.
`project` is the shared reader (`detect` + `resolveBlueprint`) for both
runtimes; `plugin` is the embedded ESLint plugin (plain rule objects, no
internal deps) that `emit/lint` ships inside its output.

## Authority map

Locate the owner before changing a representation of its truth:

- **Product behavior and state** belong to the runtime, config, resolver, or
  other domain module that computes them.
- **Blueprint-authored operational prose** starts at
  `src/operational-contract/registry.ts`. Follow the registered surface to its
  renderer owner and fact providers; consumer output proves delivery but is not
  another policy owner.
- **Checked-in composed operational artifacts**, including `agent-contract.md`
  and `scripts/field-prompt.md`, are outputs of the compose/check pipeline.
  Change their registered owner and intentionally recompose them; never treat a
  generated copy as the source fix.
- **Public product documentation** is authored separately and audited against
  runtime, schema, and generated output. English is the semantic source: verify
  it first, then rewrite the Traditional Chinese counterpart by meaning with
  natural Taiwan technical terminology. Preserve literal identifiers,
  commands, filenames, product/library names, and established terms; avoid
  unnecessary English in ordinary Chinese prose. Parity is semantic, not a
  heading or sentence count.
- **Repository AI collaboration rules** belong here, under `.agents/docs/`,
  and under `.agents/skills/`. They teach maintainers how to find authority;
  they do not copy product state machines or transient release status.

The root `AGENTS.md` is maintainer guidance for Agents working on Blueprint.
An adopter-facing generated `AGENTS.md` is an Agent-contract target owned by
Blueprint's emitter and operational contract. The shared filename does not make
this repository file a registered or composed operational artifact. It must
never be added to `OPERATIONAL_SURFACES` or generated from the adopter contract,
and a registry target named `AGENTS.md` never authorizes regenerating this file.

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

Self-explaining does not authorize consumer-local prose. Runtime and domain
modules supply measured facts; registered `operational-contract` renderers own
Blueprint-authored explanation and prescription; consumers retain only their
target-specific transport, path, merge, and adapter mechanics.

## Looking up and changing an existing stance

New work raises questions its ticket does not answer: what defaults, what the
tool refuses to decide, and what happens before code exists. Before inventing
an answer, find its authority in this order:

1. Identify the runtime, config, resolver, or other domain owner of the fact.
2. For operational wording, find the surface in `OPERATIONAL_SURFACES`, then
   read its renderer owner and fact providers.
3. Inspect consumer code, tests, and observed output to verify delivery rather
   than treating their local wording as policy.
4. Extend the existing fact or renderer authority instead of adding prose
   beside it.

`missing-layer`, vacuous coverage, and unavailable gates remain useful case
law, but their consumer output is evidence of a registered decision, not an
independent source of truth.

For every Blueprint-owned operational-text change:

1. locate the surface in `OPERATIONAL_SURFACES`;
2. identify its renderer owner and fact providers;
3. change the authoritative fact source or renderer, never consumer-local prose;
4. keep target-specific adapter, path, and merge mechanics outside semantic ownership;
5. never hand-edit composed copies such as `agent-contract.md` or
   `scripts/field-prompt.md` as the source fix;
6. run focused tests for the affected surface and `npm run operational:check`;
7. use `npm run operational:compose` only when intentionally refreshing those
   checked-in outputs.

This protocol does not add a manual full-suite requirement when Husky or
exact-head CI already owns the same deterministic gate.

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
