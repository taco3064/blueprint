# @kekkai/blueprint

## 2.0.0

### Major Changes

- 33ed541: 2.0.0 — the field-hardened release. Fifteen autonomous adoption rounds
  (closed `field-run` issues #1–#15) drove every change since 1.14; the
  loop converged when a full round reported zero tool defects, with every
  suspicion an agent raised verified against the channels and retracted.

  Breaking changes:

  - **Config validation rejects unknown keys** across the structural path
    (blueprint, architecture, layers, allowedImporters entries, module,
    owns entries, emit). A key nothing reads was a silently dead
    declaration — a field repo shipped a `selfOnly` ban that never existed
    because the key sat one level too high. Configs carrying stray keys
    now fail loud with a pointed message.
  - **`architecture.flow` and `emit.lint.path` are removed** (both were
    inert), along with the `retire` command, the `--framework` flag on
    `impact` / `doctor` / `rules`, and the never-documented entry exports
    `emitAgentContract` / `AgentContractOptions` / `injectBetweenMarkers` /
    `StructuralRule`.
  - **`doctor` is stricter**: leftover authoring artifacts
    (`blueprint-authoring.md`, the command file) fail the leftover check —
    "Adoption complete" and the playbook now define done identically; a
    marker-bearing contract outside `emit.agents` already failed since 1.14.
  - **The emitted CI workflow gates with `inspect --baseline`** (a missing
    ledger is an empty one) — locked brownfield debt no longer turns the
    tool's own CI permanently red.
  - **`architecture.module.private` is optional** (omitted = none) — the
    one loosening.

### Minor Changes

- 4fe2d55: Product-wide chicken-rib sweep — dead surface is gone, not deprecated:

  - `architecture.flow` removed. It was a required field that nothing ever
    read — the layer ORDER is the flow. Existing `.mjs` configs keep working
    (the runtime ignores unknown properties); TypeScript-typed configs delete
    one line.
  - `emit.lint.path` removed for the same reason: never consumed, while its
    doc claimed a consumer.
  - `emitAgentContract` (and `AgentContractOptions`) left the package entry:
    the supported agent targets are the ones `emit.agents` names, and a
    render-it-yourself hatch for unsupported tools is surface without a
    mission. `emitAgentFiles` remains the one distribution API.
  - `injectBetweenMarkers` left the package entry — an internal merge utility
    with no documented story.
  - `plugin` stays, and its story is now stated in the reference: the escape
    hatch for hand-wiring a `blueprint/*` rule without `emitLint`.

- 538578b: `doctor` and the playbook now define "done" identically (field issue #13):
  the leftover-files check also flags `blueprint-authoring.md` and
  `.claude/commands/blueprint-author.md` — "Adoption complete" over a live
  playbook was a second, contradicting authority, and a careless agent
  stopped there. The check's detail says a mid-authoring doctor run is
  EXPECTED to fail on it; the early-exit checklist and acceptance gates now
  order cleanup BEFORE the final doctor run. Gate turns stricter: repos
  that finished wiring but skipped the playbook's cleanup step go red until
  the two files are deleted.

  Also: the `missing-layer` note carries the keep-is-default verdict in
  place ("runway, not a todo … slimming is the owner's call") — six of
  these read as a todo list and pointed an agent at dismantling the preset
  skeleton the playbook says to keep.

- 6c5af1c: Field issue #4 (489-file brownfield run, structure-lint retired per the
  playbook): unknown CLI flags now fail loud instead of being silently ignored
  — `inspect --verbose` read as a broken no-op to an agent; init re-includes
  its gitignored artifacts by appending `!` negations to .gitignore itself
  (with the parent-directory caveat stated in the note) instead of handing the
  fix back; the rule catalog now states what two agents had to eval the bundle
  to learn — `owns` covers named-import granularity (a house "only composables
  may inject" rule maps to it), `no-restricted-syntax` is emitted only when a
  selfOnly importer exists, and `additionalAliases` join every structural ban;
  the playbook's retirement clause says to DELETE the retired tool's config
  and that source-comment pointers may outlive the sweep under no-source-edits;
  impact's echoes block leads with "NOT blueprint findings, NEVER counted".
- f7bc5d9: Field issue #5: `init --agent claude` now PERSISTS the choice — a scaffolded
  config carries `emit: { agents: ['claude'] }`, so the first run emits one
  contract and the next plain init cannot grow the second one back; the
  chicken-and-egg (config must exist before you can narrow it) is gone. The
  catalog closes the last bundle-eval of the round: `unusedVars` is named as
  TWO rule keys on TypeScript, every optional gate is stated to scope to the
  layer globs only, and merge guidance says collisions are decided by rule
  KEY (`blueprint rules --json` names them), not by hit count.
- 5337f77: Field issues #2–#3 (automated harness runs): doctor's leftover check now
  also flags stale agent contracts — a marker-bearing CLAUDE.md/AGENTS.md/…
  outside the emitted `emit.agents` set cannot hide behind green (init removes
  a wholly-generated one itself; a hand-touched one only got an instruct, and
  nothing gated the orphan afterward). A preset that introduces the repo's first import
  alias names it as a decision instead of letting a new convention pass
  silently. init --help stops promising layer folders unconditionally and says
  plainly that --agent never launches anything on the preset path.
- a3aa5a8: Field issues #7–#8: `blueprint rules` gains the resolved per-layer view —
  what each layer may not import, which owned packages (down to named imports)
  and globals are banned there — ending the `eslint --print-config`
  archaeology behind "0 hits: wired-and-clean, or not applying at all?". The
  playbook's early-exit verdict becomes a complete self-contained checklist
  ("following this verdict IS executing the playbook fully"; impact's zero
  gates the suppress-all run; trivially-true acceptance gates are named as
  such; the now-empty command directory goes too), the config schema's full
  `owns`/`additionalAliases` shapes live in the playbook so nothing exists
  only in dist, the test-file exemption is named as a deliberate relaxation
  versus tools that police tests, and a below-threshold `--authoring` run
  says up front that the playbook's own verdict will be the early exit. All
  adoption prompts state that an early exit the playbook prescribes counts
  as full execution.
- 99a0727: Init now lives by its own doctrine (field batches 10–11): empty layer folders
  are scaffolded only into an empty source tree — where code already lives, an
  unbuilt layer's absence is its true state, no `.gitkeep` shells. Narrowing
  `emit.agents` makes the next init remove a stale agent contract that is
  wholly its own output (nothing outside the marker block; own-strategy rule
  files by construction) — a hand-edited file only gets told. And
  `validateBlueprint` now returns the blueprint instead of `void`, so a passing
  call is visible at runtime.
- 1e077f1: A config key nothing reads now fails validation instead of dying silently
  (field issue #14): a 489-file field repo declared `selfOnly: true` on the
  layer object — where nothing reads it — and the intended re-export ban
  never existed while every gate stayed green. Validation now rejects
  unknown keys across the structural path (blueprint, architecture, layers,
  allowedImporters entries, module, owns entries, emit), and the misplaced
  `selfOnly` gets a pointed error naming its real home
  (`allowedImporters: [{ layer: 'views', selfOnly: true }]`).

  `blueprint rules` also answers "does THIS config emit it?" for the
  structural family: each rule carries a per-config `✓ emits / · not
emitted` annotation (`active` in `--json`), so nobody has to probe
  emitLint to learn whether their `no-restricted-syntax` will collide with
  a house rule. A test pins the annotation to emitLint's real output.

- 514eb53: Presets take `emit` directly and merge it over their day-1 default
  (`ci: 'github'`). Declaring the agent tool in use is the first customization
  nearly every adoption makes — it no longer costs the one-line preset form,
  and no longer silently drops the CI workflow the way a spread-level `emit`
  override does.
- 62ddb7e: `architecture.module.private` is now optional — omitting it means no
  private parts (`[]`). A draft-first config that never mentions private
  sub-parts validates instead of failing with "must be an array" (field
  issue #11). Explicit `private: []` keeps working unchanged; a non-array
  value still fails loudly. The playbook's schema sketch marks the field
  optional.
- 0ee89bf: The tool now answers for itself (field batch 12): `blueprint rules` prints
  the emitted-rule catalog — always-on structural rules, optional gates with
  metric defaults, documentation-only ids — annotated with the config's
  declared tiers and whether each gate emits today. `inspect` gains the tenth
  finding, `declaratory-self-only`: a selfOnly ban protecting a layer with no
  files is named as a blank round until code lands. The authoring playbook
  additionally licenses draft-first authoring — write the config early and let
  read-only inspect/impact runs correct it, instead of studying the archive
  first — and carries the retirement sweep for a consolidated-away tool.

### Patch Changes

- e59c662: Init UX honesty (field batch 10): re-running init no longer re-instructs alias
  wiring it already did — JSONC tsconfigs are checked through the tolerant parse
  before "unparseable", and the vite instruct respects doctor's quoted-token
  wiredness standard (now shared as `quotedIn`). A below-threshold authoring
  playbook leads with the early-exit verdict instead of burying it mid-method.
  The vacuous-net callouts name the concrete next step that arms the net, and
  the both-contracts note surfaces that `--agent claude|codex` already narrows
  the emitted contracts.
- 963cfa9: Field issue #9 — the early-exit checklist honors its own completeness claim
  on every repo shape: step 1 carries the tool declaration (`init --preset
--agent claude|codex` persists into `emit.agents`, one run emits one
  contract); step 2 verifies `inspect --baseline`; the false guarantee "no
  reference file is ever written" is replaced by the conditional truth — a
  repo with its own eslint config DOES get a reference, and the checklist now
  carries the merge-and-delete step for it. The anti-bypass guard's plugin is
  provisioned on every path again: with ADOPT as the stated default, an agent
  following it must not hit "Cannot find package" — dropping the block is the
  exception, and the guard says to remove the dependency with it.
- f79d7cb: The emitted CI workflow now gates with `npx blueprint inspect --baseline`
  instead of plain `inspect` (field issue #10, live-verified). A missing
  baseline is an empty one, so greenfield behavior is unchanged — but locked
  brownfield debt no longer turns the tool's own CI permanently red, which
  contradicted both `inspect --help`'s CI example and the playbook's ratchet
  model. `inspect --update-baseline`'s no-debt messages now point at the
  `--baseline` CI line too, instead of telling the reader plain `inspect` is
  the gate, and the compact agent contract's verify line prescribes
  `inspect --baseline` for the same reason — red only on findings the agent
  itself introduced.
- 07818a5: Every starter field run re-derived "why adopt on an empty repo at all" in
  its judgment section — the answer (adopt early; the contract's value is
  highest before the first violation exists) lived only on the docs site,
  which an adopting agent never reads. The below-threshold playbook verdict
  now carries the doctrine in place: emptiness is the point, not a smell;
  the expensive version of this repo is the one that adopts two years and
  400 files later.
- 6576485: Zero-debt doctrine, lint side (first live field-harness catch): running
  `eslint --suppress-all` on a clean lint writes an EMPTY suppressions ledger
  — asymmetric with the baseline, which writes no file on zero debt. Doctor's
  suppressions check now names the empty ledger as ceremony and says to delete
  it; the playbook's ratchet clause covers it explicitly; every adoption
  prompt (README, docs, field prompt) scopes the lock commands to "only when
  debt exists".
- 8efd576: Field issue #1 (first automated harness run): init's alias notes say the
  edit's shape in place — "import alias added — existing content preserved" —
  instead of a bare "write" that reads as a rewrite; a fresh scaffold with no
  lint script gets one ("lint": "eslint <root>") so local lint matches the CI
  gate, and an existing project gets told; the playbook states the runway
  stance — a preset's declared-but-empty layers (and a not-yet-used alias) are
  declared intent, not a manufactured net, so keep them unless the project
  will never grow into them; the adoption guide notes which acceptance clauses
  resolve vacuously (no tests, zero debt) and that this is correct.
- cdfc99d: Field issue #6 — three message-level frictions, zero behavior bugs: the
  eslint merge hints now put `...emitLint(blueprint)` AFTER your existing
  entries and say why (later entries win in flat config — the old hint walked
  you into the exact override trap the playbook warns about); the generated
  config's parser blocks carry a header saying they are live-config-only and
  should be skipped when merging into a config that already wires parsers;
  survey prints "— none —" under empty sections instead of a bare heading
  that reads as a render failure.
- a4d7be9: Three field-verified message defects, one class — an output that
  contradicts its own doctrine or prose (field issue #12):

  - `impact` now names a vacuous zero: when the layer globs match no files,
    "0 hits" says so and adds "proves nothing until code lands in a layer" —
    matching `inspect`'s coverage warning instead of reading like the rules
    ran clean. `--json` output carries the new `linted` count.
  - `init`'s eslint wiring snippet on a TypeScript repo IS the TS version
    (`emitLint(blueprint, { typescript: tseslint.plugin })` with its import)
    instead of a JS snippet corrected by prose four lines later.
  - `init --authoring`'s hand-off line promises "locking a baseline if debt
    exists" — the sub-threshold early exit locks nothing, and the old
    unconditional wording contradicted that prescribed path.

  Plus two recurring field doubts encoded where they arise: the early-exit
  checklist now says to remove `.claude/` itself when deleting the command
  leaves it empty, and the reference's parser-setup header names presets
  that wire parsers internally (tseslint.configs.recommended) as "already
  wired".

- a3d33f1: One story per state — sibling tools stop contradicting each other (field run #10):

  - `doctor`'s architecture check only says "findings covered by the baseline"
    while a baseline is actually covering something. On a truly clean repo the
    label is plain `architecture clean` — matching `inspect --update-baseline`'s
    "no baseline needed" instead of claiming a ledger that does not exist. The
    red detail likewise drops "outside the baseline" when no baseline is in play.
  - The size gate has one name and one number everywhere: `init`'s forced-
    authoring log line and `init --help` now say "brownfield threshold
    (10 source files)" — the playbook's term — instead of the unnumbered
    "preset threshold".

- 3df2615: The five judgment items every field run re-derived now carry the owner's
  verdicts in the agent-facing channels, so they stop being open questions:
  keeping the preset's declared-but-empty layers is the DEFAULT (slimming is
  the project owner's later call, never the adopting agent's); the `~app`
  alias is deliberate — `@` is npm's scope sigil, and an app alias should not
  look like a package scope (the init note stops suggesting `@` as an
  alternative); a repo with no tests passes the tests clause vacuously (every
  adoption prompt says so); the eslint-comments block is named for what it is
  — the anti-bypass guard against silent disables, default ADOPT, dropping is
  the justified exception; and `emit.agents` declares the tool RUNNING the
  adoption — never a guess at future tools.
- 7aadb8f: Removed the inert `--framework` flag from `impact`, `doctor`, and `rules`
  (and the corresponding option from their TypeScript options types). All
  three commands require — or resolve — an existing config, and `framework`
  only ever steered the no-config preset fallback, so the flag never had any
  effect; documenting it was a lie waiting to confuse an agent. `init`,
  `inspect`, and `deps` keep theirs — there the no-config path is real.
- 94d8776: Adoption honesty from field batch 12: the authoring playbook now carries a
  full rule catalog (always-on structural rules, optional gates with their
  metric fallbacks interpolated from the source, documentation-only ids) so no
  agent reads the minified bundle again; impact's foreign block names itself as
  echoes of your own config and the closing line says numbers decide tiers, not
  just suppressions; the playbook warns about structure-lint's `{folder}` token
  and tells the agent to sweep a retired tool's stale footprint; the generated
  eslint companion block states its scope (JS/TS disable comments only).
- f45c23d: The mission statement enters the agent channels. Blueprint exists to keep
  AI-driven development inside the declared architecture — the strictness is
  the product, and the agent reading the contract is its subject. The
  contract header now says so on every emitted target ("never soften or
  bypass; disagreements go to the maintainer"), and the playbook's Goal
  section tells the adopting agent that the urge to soften a tier or leave an
  escape hatch is exactly what the tool exists to catch: install faithfully,
  put disagreements in the report.
- d637584: The survey's "Same-folder imports via the alias" count is now stated for
  what it is — a textual upper bound, not a promise (field issue #11: the
  playbook called it "exactly how many errors the wiring will introduce",
  and a 489-file field repo proved it 5 ≠ 0 against `impact`). The count
  includes test files (exempt in the emitted config) and non-static
  references (dynamic imports, mock specifiers, doc comments) the wired
  rules may never flag. Both the playbook's pre-wiring check and the survey
  heading now say so and point at `impact` for the real per-rule number.

## 1.14.0

### Minor Changes

- bc55a63: Doctor's merge-survival check no longer goes blind on empty repos — the anti-false-green gap field batch 7 called ironic. A layer with no files yet gets a synthetic probe derived from its own globs (`calculateConfigForFile` resolves by pattern and never touches the filesystem), so a gutted config turns red with zero files on disk; globs the synthesis cannot honor simply yield no probe. The authoring playbook gains an early-exit clause: on a repo at or below the preset threshold whose shape a preset fits, `init --preset` is a legitimate verdict — walking the full method on a starter is ceremony, not judgment. Docs show the `{ ...reactPreset(...), emit: {...} }` spread, since `emit` is a top-level blueprint field, not a preset option.

### Patch Changes

- 5d45120: Layer names carrying glob or path characters are rejected at validation — a layer literally named `*` (field batch 9's root-files workaround) widened every file glob into a wildcard and scaffolded a literal `src/*/` folder. The playbook states the doctrine the workaround violated: an empty net on a root-only app is the true state, not a failure — never invent a layer to make coverage non-zero; root-file hygiene belongs to the project's own lint.
- 9a5b15a: Batch-8 field fixes, all with repros. `usePrefix: 'off'` no longer validates its target layer (an off rule has nothing to target — it used to throw on repos without a `hooks` layer). `impact` stops contradicting itself: `parse-error` and `unused-disable-directive` move out of the wiring-red total into an "Isolation caveats" section that says which kind vanishes after the merge and which survives. The handbook diagram renders order-only spine edges dotted and declared importer relations solid with inline labels — consecutive leaf layers chained solid read as dependencies they never were. The playbook's overlapping-tool guidance gains its missing exception: when the existing tool sets the same ESLint rules emitLint emits, coexistence is mechanically impossible and consolidation becomes a wiring precondition, not a scope decision to flag.
- 6464b43: Scanned paths normalize to forward slashes at birth — on Windows every downstream glob net (inspect, coverage, survey, survival probes) silently matched nothing. Layer-name validation also rejects characters that corrupt the emitted mermaid diagram (whitespace, quotes, parens, `&`, `%`, `;`) while keeping real conventions like `@core` valid; pipe-bearing edge descriptions render as `/` instead of breaking the inline-label syntax; and the playbook's deliverables and acceptance gates go zero-debt-conditional — a clean repo's absent baseline is the correct outcome, not a stalled checklist item.

## 1.13.0

### Minor Changes

- 40d9b0a: Clean-repo honesty round, from two zero-debt field adoptions. tsconfig reading (doctor's alias check, survey's alias detection) now parses JSONC — the Vite + TS starter ships commented tsconfigs, so JSON-or-bail false-redded the mainstream path. `impact` labels rows whose rule id is not in the emitted config as isolation artifacts (existing disables referencing the project's own rules), renders them apart, and excludes them from the wiring-red total. `inspect --update-baseline` no longer records info findings — a missing-layer note is "not built yet", not debt; an all-info repo converges to "no baseline needed" instead of inviting manufactured debt.
- c729157: `doctor` gains a seventh check — the emitted rules must survive the merged eslint config. Flat config never merges a rule two entries set: a later entry silently replaces blueprint's structural bans (or the user's own defenses) while lint stays green — two field runs hit this from both directions and caught it only by hand. Doctor now resolves the project's final config for a real layer file via the project's own ESLint and names exactly what was lost (structural pattern groups, selfOnly selectors, restricted globals, the embedded relative-escape rule); unreachable preconditions skip with a labeled reason instead of failing. The playbook's wire-the-lint step upgrades accordingly: a rule both sides set must be combined into one entry — ordering alone cannot save it.

### Patch Changes

- 40d9b0a: Playbook and docs close the zero-debt gaps: flat-config merge trap stated (same rule in a later entry replaces the earlier — spread `...emitLint` before your own blocks and re-check shared rules), the generated reference marks the eslint-comments block as a companion rather than emitLint output, zero findings is named a complete outcome (never manufacture debt to demo the ratchet), intent-doc DAGs get a linearization hint, and the adoption prompt plus scope-honesty docs set greenfield expectations — on a clean repo the value is forward-looking, not a bug harvest.

## 1.12.0

### Minor Changes

- e8b2ba1: `doctor` gains a sixth check — the declared import alias must be resolvable by the toolchain (tsconfig `paths`, or a bundler config: vite / webpack / vue-cli / next / rsbuild, matched as a quoted token), closing the declared-yet-unwired gap where the agent contract points at imports nothing resolves. `inspect` reports and doctor's architecture check now state their coverage (source files inside layer nets, active optional gates), so a vacuously green gate over an empty net is called out instead of quietly passing. `detectAliases` moved from `survey` into `project` alongside the new `pathAliasKeys`.
- 2d55589: New `blueprint impact` command — the rule-impact dry-run. It compiles the authored config with `emitLint`, runs the project's own ESLint over the layer files with only that config, and reports what wiring would flag today: hits per rule, heaviest files named, and two honest special rows — `parse-error` (a file could not be parsed; its numbers are untrustworthy) kept apart from `unused-disable-directive` (a stale inline disable that suppresses nothing; the file is fine). Informational, never a gate (exit 0 whatever the count). The authoring playbook now points to it in the wire-the-lint step, so rule conflicts get decided on numbers instead of reverse-engineering the emitted config by hand.

### Patch Changes

- dacc70a: Authoring playbook now states the emitted-rule semantics up front (flat vs folder same-layer imports, the pre-wiring "Same-folder imports via the alias" count, `unusedVars` options, doctor's "wired" criterion) so agents stop reverse-engineering them from the bundle; intent-document translation gains a stale-clause downgrade rule; the survey import matrix notes that it counts test files while inspect does not.

## 1.11.0

### Minor Changes

- 321701c: Turn it red, then ratchet it — the debt posture flips, and the plain-init
  poison path is fixed. Both from adoption field reports.

  - **`init --authoring` now takes over a pristine preset scaffold.** A plain
    init on a small repo scaffolds a preset config; `--authoring` afterwards used
    to be a silent no-op (the config's existence skipped the fork entirely) —
    the one place field testers actually got stuck. A config byte-identical to
    init's own scaffold output is init-owned: `--authoring` removes it (a
    narrated `rm` action, dry-run aware) and writes the playbook. A hand-edited
    config is refused with an explicit error instead.
  - **Debt doctrine replaced: red + dual ratchet.** The 1.9.0 "one ledger via
    severity warn" advice had a hole — `severity` only covers the structural
    rules, and warn means new metric debt (maxLines…) is never gated. The
    doctrine is now: keep `error`, lock architecture debt with
    `inspect --update-baseline` and lint debt with `eslint --suppress-all`
    (ESLint ≥ 9.24 — per file × rule counts, new violations still fail); CI
    blocks only new debt on both gates. `severity: 'warn'` is demoted to the
    ESLint-8 transitional fallback, with its cost stated. Playbook, adoption
    prompt, and docs all updated in both locales.
  - **`doctor` grew a fifth check**: the lint suppressions ledger — entries
    pointing at files that no longer exist (or an unreadable ledger) fail, with
    the exact prune command in the detail.
  - Reference docs now state plainly that `emit.lint.severity` covers only the
    structural family — metric rules keep their own `blueprint.rules` tiers.

## 1.10.0

### Minor Changes

- 3540aae: Adoption DX — from a fresh vite react-ts field report. The preset path's
  finishing work (wire, verify) is now first-class commands, not stdout to
  remember.

  - **`blueprint doctor`** — a new read-only command answering "is adoption
    finished?" as a checklist (config present, no leftover `*.blueprint.*`
    reference files, eslint wired to emitLint, architecture clean under the
    baseline). Exit 0 only when all pass, so it drops into an agent verify loop
    or CI. Makes the adoption prompt's acceptance clause executable.
  - **`init --authoring`** — the symmetric escape hatch to `--preset`: force the
    authoring playbook even on a repo below the file-count threshold (which would
    otherwise scaffold a preset). The two are mutually exclusive. The preset
    branch now narrates plainly that no `blueprint-authoring.md` is written on
    that path — so an agent told to execute it no longer hunts for a missing file.
  - **Legacy `.eslintrc` is detected** instead of silently getting a fresh flat
    config written next to it (which produced two configs / two ledgers). It now
    routes to the reference + a flat-config-migration note.
  - **Shape-aware eslint wiring** — the merge instruction is tailored to the
    existing config's shape (`tseslint.config()` wraps the spread; a flat array
    takes it directly; legacy migrates first) rather than one generic snippet.
  - **knip is no longer installed by default** — zero-config knip false-flags, so
    shipping it pre-installed-but-commented was a dangling promise. It is now an
    opt-in recommendation, matching how stylelint is handled.

## 1.9.0

### Minor Changes

- fb4bb90: `init` UX: the silent decisions now speak, and local lint matches the CI gate.
  All four from a field report of a fresh vite react-ts adoption.

  - **The greenfield/brownfield fork is narrated.** When a repo has fewer than 10
    source files, init scaffolds the preset — and now says so
    (`Fresh scaffold (N source files < 10) — scaffolding the framework preset.
Repos with 10+ source files get the authoring playbook instead.`) instead of
    silently taking the biggest branch it has.
  - **Local lint gets wired to the structural rules.** Templates whose `lint`
    script doesn't run eslint (e.g. oxlint) previously stayed green locally while
    CI failed on the generated config. On a fresh scaffold init now patches the
    script (`"lint": "oxlint && eslint src"` — precondition-guarded, placed
    before the install step, visible in `--dry-run`); existing projects get an
    instruction instead.
  - **The generated eslint header no longer contradicts `--help`.** The banner
    now explains that only the blueprint-owned file (marked by that banner) is
    regenerated, while hand-written configs are never overwritten; `init --help`
    says the same.
  - **The default agent-contract pair is surfaced.** When the config doesn't
    declare `emit.agents`, init notes that both CLAUDE.md and AGENTS.md were
    written and points at the narrowing the playbook itself recommends.

- 361e27e: Brownfield honesty pass — from a legacy-repo (ESLint 8 / `.eslintrc`, 239
  pre-existing violations) field report.

  - **`import/no-cycle` dropped from the generated eslint config.** `inspect`
    already detects module cycles; the ESLint rule re-checked the whole graph
    per file — measured at 92s on an 850-file repo. One detector, the cheap one.
    `eslint-plugin-import` leaves the install set with it.
  - **The single-ledger posture is now doctrine.** Playbook + docs: on a repo
    with existing violations, wire `emitLint` at `severity: 'warn'` and let
    `inspect --baseline` be the only debt ledger — never lock the same debt as
    both eslint suppressions and a blueprint baseline; flip to `error` at zero.
    New "Legacy ESLint — one ledger, never two" section on the AI-adoption page,
    and the legacy-`.eslintrc` cliff is named in Field-Tested notes (with the
    pinned-plugin drift caveat).
  - **The gitignored-contract warning is now actionable** — it says exactly how
    to start tracking the files, not just that teammates won't have them.
  - **Honest positioning, stated where it matters**: the Philosophy page opens
    with "blueprint encodes an architecture someone already chose — it does not
    design one for you", and the README credits that the lint layer is standard
    ESLint machinery: the rarity is that rules, handbook, agent contract, and CI
    compile from one source and can never disagree.

## 1.8.2

### Patch Changes

- af41c22: API-surface and docs-site review sweep.

  - Six internal helpers (`getDiagramEdges`, `getForbiddenLayers`,
    `getModuleShape`, `getSelfOnlyTargets`, `normalizeAgentEmit`,
    `normalizeAllowedImporters`) are now `@internal` — they were never runtime
    exports of the package root, but typedoc listed them as importable Functions.
  - `AgentContractOptions`, `CiOptions`, and `PackageManager` are now exported
    types (they appear in public signatures and previously dangled unresolved in
    the API docs).
  - API reference is grouped (Author / Emitters / Runtimes / Utilities) via
    `@group`; every headline function carries an English `@example`;
    `Blueprint.framework` / `Blueprint.architecture` gained the TSDoc they were
    missing; the zh-TW API index states it is intentionally rendered in English.
  - Docs site: landing grew the compile-model diagram, a "Why" section, and two
    more cards (Adopt / Verify); new "Prior Art & Differences" page (en + zh-TW);
    en security page caught up with two zh-only facts; og/twitter meta added.

## 1.8.1

### Patch Changes

- d5cf68a: `deps` guardrails + a dedicated guide page.

  - A hand-written `blueprint.config.mjs` that bypasses `defineBlueprint` is now
    validated on load: structural mistakes fail with a precise
    `blueprint.config.mjs: <reason>` message (missing default export included)
    instead of an undefined-property crash deep inside a command. Applies to every
    config-loading command (`init` / `inspect` / `deps`).
  - The `deps` leaderboard lists source folders that sit outside the declared
    layers instead of silently ignoring them, so zero fan-in can't be misread as
    "nobody imports this"; querying into such a folder names the actual cause.
  - Flat-layout layers are annotated (`(flat layer — answers at layer
granularity)`) wherever they appear, so the granularity collapse is visible
    instead of silent. Leaderboard JSON now carries `{ modules, skipped }`.
  - New docs page "Blast Radius — deps" (en + zh-TW): how to run it, sample
    outputs, granularity via `module.layout`, and the graph's boundaries.
    `deps --help` grew a matching scope-and-granularity section.
  - Philosophy section now states its relationship to the tool explicitly: the
    Operating Contract opens with "this documents the preset payload", and every
    sub-page (beliefs / layers / component-shape / discipline) carries an
    "In blueprint" connector naming the config field it compiles from
    (`principles` / `architecture` / `componentShape` / `playbook`) and where it
    lands; Getting Started links the preset paragraph back to Philosophy.
  - New "Feature Overview" docs page (en + zh-TW): every capability listed with a
    one-line description, each linking to its how-to page — now the Guide nav
    entry and the first sidebar item; the four home-page cards link to the
    matching generated-artifact sections.
  - Docs coverage sweep (en + zh-TW): new "Checks & Config Reference" page (all
    nine `inspect` finding kinds, the six embedded plugin rules, the gated
    `blueprint.rules` ids, config fields beyond the quick-start example, the full
    CLI flag matrix incl. `init --preset`) and new "What init Generates" page
    (verbatim artifacts from a fresh init). Layer Architecture grew an
    "Ownership — `owns`" section; `inspect --help` now also names the
    `missing-layer` info finding.

## 1.8.0

### Minor Changes

- 3fa65f7: Configurable source root, first-class Next.js, and Nuxt declared unsupported —
  the terrain widens from "everything under `src/`" to real framework layouts:

  - **`architecture.sourceRoot`** (default `src`) generalizes the engine off the
    hardcoded `src/` assumption. `.` scans the project root (with a built-in
    ignore set for `node_modules` / `.next` / build output); the alias target,
    layer-file globs, and vite/tsconfig wiring all follow it. Backward compatible
    — every existing config keeps `src`.
  - **`nextPreset({ router, srcDir })`** and auto-detection. A fresh
    `create-next-app` adopts in one command: init detects the route tree
    (`app` / `pages`, under `src/` or the root) and generates the Next preset —
    the route dir is the top layer, flat module layout, and **no `fetch`
    ownership** (server components fetch everywhere by design). Both routers
    reduce to the same shape; because Next keeps imports explicit, the dependency
    graph is real and enforcement is genuine.
  - **Nuxt is refused, by design.** Its auto-imports leave no import statements
    for static analysis, so the graph would be near-empty and report a hollow
    "clean". `init` errors with an explanation rather than emit a false-green
    setup. Documented under "Not supported" on the field-tested page.
  - **The adoption e2e suite grows to ten fixtures** covering the tiers approved
    for this round: the ratchet catching a _new_ violation (not just staying
    green), the JS-project jsconfig branch, `--dry-run` writing nothing,
    survey + deps on a real repo, the `--agent` launch ordering, the emitted CI
    gate, a yarn workspace, and `--no-install` — plus the two new Next fixtures
    (root-level app router, pages router).

## 1.7.0

### Minor Changes

- 3a2c1c4: The rules stop assuming infrastructure nobody installed:

  - **Greenfield alias surgery.** On a fresh scaffold (init generated the
    blueprint config in this very run), init now wires the import alias
    directly into the template's `vite.config.*` (resolve.alias + the
    `node:url` import) and into the commented tsconfig (comment-preserving
    `paths` insertion) — precondition-guarded text edits that only touch the
    known template shapes, visible in `--dry-run`, falling back to the
    instructs on anything unexpected. Existing projects never take this path;
    the security disclosure is amended accordingly.
  - **Adoption e2e suite.** Five committed template fixtures — vite react/vue,
    Next (App Router + forwarding CLAUDE.md), a turbo + pnpm workspace package,
    and a brownfield repo with planted debt (upward reaches, a same-layer
    import, an import cycle, hand-written eslint/CLAUDE files) — driven through
    the full init → inspect → baseline → references → wired/integrated arc.
    The suite lives in the default vitest set, so the husky pre-commit and the
    new pre-push hook both gate on it locally, and the release workflow runs it
    before anything is published to npm.
  - **Weekly terrain workflow.** Scaffolds the _latest_ create-vite /
    create-next-app templates and drives the real adoption with the CLI built
    from HEAD — upstream template drift reddens the run and opens a
    deduplicated issue instead of surprising the next adopter.
  - The handbook's flow diagram now states its reading rules (reachability is
    transitive; dashed = selfOnly), and the packaged operating discipline
    covers conflicts with third-party lint advice — both straight from agent
    feedback on a field adoption.

## 1.6.0

### Minor Changes

- 99b9ad8: Two terrain fixes from the Next.js / monorepo field round, plus a
  field-tested compatibility page on the docs site:

  - **Next.js projects always take the authoring flow.** The react preset does
    not fit Next — it scaffolds `src/pages/` (a routing convention there) and
    does not declare the App Router's `app/` tree — so `init` now routes any
    project with a `next` dependency to the authoring flow regardless of file
    count. The playbook opens with the fitting shape (`app` → `components` →
    `hooks` → `lib`); `--preset` still works but carries an explicit warning.
  - **The package manager is detected from the workspace root.** In a pnpm /
    turbo monorepo the lockfile lives at the workspace root, not in the package
    being initialized — detection now walks parent directories for a lockfile
    or `pnpm-workspace.yaml`, so the authoring flow's auto-install generates
    `pnpm add -D` instead of the wrong `npm install -D`.
  - **Docs: Field-Tested Setups** — a bilingual page recording every setup the
    releases are validated against (two production apps, four fresh scaffolds,
    the turbo + pnpm per-package model) with outcomes and caveats, plus the
    not-yet-tested list.

## 1.5.2

### Patch Changes

- 277e7aa: Symmetric with the wired eslint-config detection: a hand-written CLAUDE.md /
  AGENTS.md that already mentions `@kekkai/blueprint` has been integrated by
  its owner — re-running init no longer regenerates the `<name>.blueprint.md`
  reference next to it.

## 1.5.1

### Patch Changes

- cad28b4: - **init recognizes a wired config.** When the user's own eslint config
  already imports `@kekkai/blueprint`, init no longer writes a reference
  file next to it on every re-run — the owner wired it; there is nothing
  to merge, and the plan says so instead of nagging.
  - **The Traditional Chinese documentation site is rewritten in formal
    register** — report-style prose throughout; general vocabulary is fully
    translated while proper nouns and identifiers stay verbatim.

## 1.5.0

### Minor Changes

- 8967311: Integration is the deliverable — reference files are input, not output:

  - **The authoring playbook now owns the lint wiring.** The agent merges
    `...emitLint(blueprint, …)` into the existing flat config, resolves every
    rule conflict explicitly (house disable conventions, overlapping structure
    tools), runs the project's own lint, and deletes the reference — adoption
    is not done while any `*.blueprint.*` file remains, and the acceptance
    gates say so. Legacy `.eslintrc.*` configs are the one exception: that
    migration is surfaced as a decision item, never done unilaterally.
  - **A clean repo carries no baseline.** `inspect --update-baseline` with zero
    findings writes nothing (and retires a paid-off baseline file);
    `inspect --baseline` with no file treats it as empty — one uniform CI line
    on repos with and without recorded debt.
  - **init recognizes its own eslint config.** Generated configs carry a banner
    line; a re-run regenerates the file in place instead of mistaking its own
    output for a hand-maintained config and writing a reference next to it.
  - **init warns when its artifacts are gitignored** — a best-effort root
    `.gitignore` check: if the handbook or a contract file is invisible to
    version control, the plan says so (the compact contract links assume they
    exist) instead of leaving teammates with dead links.
  - The greenfield `--agent` skip message no longer claims a config "already
    exists" three seconds after scaffolding it, and `deps` module keys for
    bare-file modules drop their extension (`components/HelloWorld`, not
    `components/HelloWorld.vue`).

## 1.4.0

### Minor Changes

- 6a7a400: The contract stops flooding your context files:

  - **Shared context files get a compact pointer block** — CLAUDE.md / AGENTS.md
    now receive ~12 lines: project facts (framework, alias, layer flow), the
    machine-gated rule list, and two links that carry the bulk — the generated
    handbook (project half, always current) and `agent-contract.md` shipped
    inside the package (generic operating discipline). Tool-owned rule files
    (Cursor, Windsurf) still carry the full contract.
  - **`init --agent claude|codex` emits one contract file** — the tool actually
    in use, instead of one per tool nobody runs. An explicit `emit.agents` in
    the config still wins, and the authoring playbook now tells the agent to
    declare its own tool there.
  - **Hand-written CLAUDE.md / AGENTS.md are never touched** — a context file
    without blueprint markers is a document someone maintains; init now writes
    a `<name>.blueprint.md` reference next to it with an integration instruct,
    and the authoring playbook's final step has the agent merge it into the
    document's own structure — link, don't duplicate.
  - **The docs site gains a Changelog page** — build-time-included from the
    repo's CHANGELOG.md, so the same push that publishes a release renders its
    notes on GitHub Pages. Synced by construction, not by hand.

## 1.3.0

### Minor Changes

- e823cb3: Five friction fixes from running the AI-assisted adoption on four real repos
  (two mature codebases, two fresh vite scaffolds):

  - **The authoring flow now installs `@kekkai/blueprint`** — the config the
    agent writes imports it, so the playbook used to fall over at the first
    `npx blueprint inspect` on a repo that never installed the package.
    `--no-install` downgrades to an instruct with the exact command, and the
    playbook opens with the prerequisite either way.
  - **The playbook reads existing intent documents first** — an architecture
    config or doc already in the repo (structure-lint, dependency-cruiser,
    `docs/architecture*`, agent-contract sections, ADRs) is intent evidence
    senior to the import matrix; it also carries what the matrix cannot see:
    zero-file layer positions, selfOnly-style constraints, ownership rules.
  - **Greenfield template cleanup is spelled out** — when fresh scaffold code
    violates the preset out of the box (vite's vue template imports
    `../assets/*` from a component), init now lists the exact findings and the
    fix path instead of letting the first lint run read as a broken install.
  - **`survey` reports unresolved alias-like specifiers** — `~x/…`-style
    imports that match no detected alias and no dependency are usually an
    undeclared alias; the report now names each prefix with its count instead
    of silently dropping it from the matrix.
  - **The tsconfig alias instruct notes that `baseUrl` is not needed** — modern
    TypeScript resolves `paths` without it, and it is deprecated in 7.0.

## 1.2.0

### Minor Changes

- f32436d: AI-assisted brownfield adoption — evidence, playbook, launcher:

  - **`blueprint survey`** — deterministic authoring evidence that runs _before_
    a config exists: top-level folders with module-shape evidence (index
    coverage, nesting depth), the folder-to-folder import matrix (alias +
    relative, heaviest first), same-folder alias imports, test-convention hits,
    and package-usage concentration as ownership candidates. `--json` for
    tooling; `--alias` when tsconfig detection finds nothing.
  - **The authoring playbook** — `init` on a brownfield repo without a config no
    longer guesses a preset: it writes `blueprint-authoring.md` (the method, the
    schema sketch, the acceptance gates, and the embedded survey) plus a
    `/blueprint-author` command file for Claude Code, and prints the launch
    one-liners. The playbook scopes itself honestly: author the config and lock
    the baseline — never refactor the debt. `--preset` keeps the old scaffold.
  - **`init --agent claude|codex`** — the thinnest possible launcher: spawns the
    _printed_ command in the foreground, interactive, under the user's own agent
    CLI permissions. Every artifact is on disk before the spawn, so a failed
    launch or an abandoned session degrades to exactly the manual path. The
    security disclosure is amended accordingly: never launches by default,
    explicit opt-in only, still zero network calls and zero credential surface.

  Field-tested end to end on a mature React + TypeScript repo: the playbook's
  evidence alone reproduced the hand-derived 11-layer config — same 246 baseline
  findings, same categories, same cycle.

## 1.1.0

### Minor Changes

- 83894a6: Per-layer module layout, a TS-aware unusedVars gate, and a depth-aware
  relative-escape rule — all three surfaced by adopting blueprint on a mature,
  previously ungoverned React + TypeScript codebase:

  - **`LayerDef.module`** — a layer can now override the shared module shape
    (`layout` / `entry`): folder modules in a feature layer while the rest of
    the project stays flat. `inspect`, `deps`, the emitted lint config, the
    handbook, and the agent contract all resolve the shape per layer, and
    deep-import bans now name each folder-layout target layer instead of
    assuming one global layout.
  - **`emitLint(blueprint, { typescript })`** — inject the `@typescript-eslint`
    plugin and the `unusedVars` gate emits the TS-aware `no-unused-vars`; the
    core twin false-flags TS enum members and type parameters (565 false
    positives on the field-test repo). `init` wires the option automatically on
    TypeScript projects, and the brownfield merge instruct mentions it.
  - **`blueprint/relative-escape`** — replaces the literal `../` ban patterns,
    which could not see file depth and so flagged intra-module imports inside
    nested module folders (~310 false positives). The rule shares inspect's
    resolution primitives, so the two gates cannot disagree — the field-test
    repo now reports exactly the same 54 escapes on both sides.

## 1.0.3

### Patch Changes

- `inspect` and `deps` now honor `architecture.testFiles`, symmetric with
  the lint side: test files are exempt from structural analysis — they
  neither produce findings (a co-located `Foo.test.js` importing its
  sibling through the alias is test plumbing, not a violation) nor form
  modules or edges in the dependency graph. Found by adopting blueprint
  on a mature production repo, where every remaining "violation" turned
  out to be a test file its own structure linter had always exempted.

## 1.0.2

### Patch Changes

- Close the reviewer's "half-wired" nuance around the dead-code gate:

  - `--no-install` no longer silently drops the dependency requirement —
    the exact install command is surfaced as an instruct, so "knip is in
    the install set" holds on every path.
  - The generated CI ships the knip step **commented** when `deadCode` is
    error-tier: one uncomment turns the gate hard, and zero-config false
    positives can never redden a fresh project's CI out of the box.
  - The agent contract's dead-code bullet now points at that commented
    step instead of a vague "wire it into CI".

## 1.0.1

### Patch Changes

- DX polish round for 1.0:

  - **The contract no longer writes checks the tooling can't cash.** "Hard
    rules (lint enforces these)" now lists only rule ids a machine
    actually gates out of the box; error-tier `deadCode` moves to the
    behavioral section with its real gate spelled out (`npx knip`,
    installed by init — wire it into CI to make it hard), and unknown ids
    are never called gates.
  - **Brownfield merge is copy-ready**: when an eslint config already
    exists, init writes `eslint.config.blueprint.mjs` — the full generated
    config as a diffable, clearly-unwired reference — and the instruct
    shows the exact diff command and minimal merge block.
  - Per-command `--help` now carries example invocations; the README
    gains a 30-second before/after tree.

## 1.0.0

### Major Changes

- 1.0.0 — the compiler is complete and the config schema is stable.

  One Blueprint compiles into six capabilities:

  - **Define** — `defineBlueprint` / `vuePreset` / `reactPreset`: ordered
    layers with `allowedImporters` (acyclic by construction), package and
    global ownership, module shape, metric/rule tiers, ten principles,
    seven component-shape axes, an eighteen-rule working playbook.
  - **Enforce** — `emitLint`: an ESLint flat config with parser wiring for
    the detected stack and an embedded five-rule plugin. Nothing extra to
    install.
  - **Explain** — `emitHandbook`: a human handbook that cannot drift from
    the rules.
  - **Collaborate** — `emitAgentFiles`: one agent operating contract
    distributed across CLAUDE.md, AGENTS.md, Gemini, Copilot, Cursor, and
    Windsurf.
  - **Bootstrap** — `blueprint init`: layers, configs, alias wiring, agent
    contracts, and a CI gate from one command — deterministic, idempotent,
    and it never operates an agent.
  - **Verify** — `blueprint inspect` (nine checks + the baseline ratchet
    for brownfield adoption) and `blueprint deps` (blast radius).

  Field-proven on fresh create-vite react/vue projects — including a full
  feature written by a coding agent under the generated contract, where
  lint stayed green and `inspect` caught the one thing lint cannot see:
  code drifting into undeclared folders.

## 0.2.3

### Patch Changes

- The generated eslint.config.mjs now wires parsers for the detected
  stack — vue-eslint-parser for SFCs (with the TypeScript parser inside
  `<script lang="ts">`), typescript-eslint for .ts/.tsx, and espree's JSX
  mode for React .js/.jsx. Parsers only: framework rule packs stay the
  user's choice. Found by running init against fresh create-vite
  templates, whose App.tsx / App.vue previously failed to parse under the
  generated config; the packages backing the parsers join the install
  set.

## 0.2.2

### Patch Changes

- Security & trust disclosure: the README and the docs site now state
  explicitly that the package never operates an agent CLI (it prepares
  plain-markdown contracts and hands off — no credential surface), makes
  no network calls, has zero runtime dependencies, runs exactly one
  declared and skippable child process (the dependency install), bounds
  every write, and ships provenance-signed releases.

## 0.2.1

### Patch Changes

- Slim README: the docs site (https://taco3064.github.io/blueprint/) now
  owns the full guide, API reference, and philosophy — the npm page keeps
  a compact introduction and one link.

## 0.2.0

### Minor Changes

- The DX round — discoverability, brownfield adoption, blast radius:

  - **Real help**: top-level usage leads with the value proposition;
    `init` / `inspect` / `deps` each have `--help` describing what gets
    generated, every flag, and the auto-detect / no-overwrite / idempotent
    guarantees.
  - **`inspect --baseline` / `--update-baseline`** — the brownfield
    ratchet: record today's debt in `.blueprint-baseline.json`, then fail
    only on new findings; stale entries are reported so the ratchet keeps
    tightening.
  - **`blueprint deps [module]`** — reverse dependencies / blast radius:
    who imports a module and what it imports, or the full fan-in
    leaderboard; `runDeps` is exported from the package root.
  - README (both languages) opens with a Before/After tree and documents
    the hand-off stance.

## 0.1.3

### Patch Changes

- CLI etiquette: `--help` / `-h` prints usage and exits 0 (it previously
  fell through as an unknown command, exit 1), and `--version` / `-v`
  prints the package version (read at runtime from package.json, covering
  both the bundled and source layouts).

## 0.1.2

### Patch Changes

- Fix the installed CLI being a silent no-op. npm installs the bin as a
  symlink and Node resolves the entry module to its real path while
  `argv[1]` keeps the symlink path, so the entry guard never matched —
  `npx @kekkai/blueprint` exited 0 doing nothing. The guard now resolves
  `argv[1]` through `realpathSync` before comparing, and is unit-tested
  against a real symlink.

## 0.1.1

### Patch Changes

- Release housekeeping — first published version.

## 0.1.0

### Minor Changes

- First release — Architecture as Code. One Blueprint compiles into:

  - **Enforce**: an ESLint flat config (one-way layer flow, module-entry
    boundaries, package/global ownership, metric gates) plus an embedded
    plugin (`no-deep-watch`, `use-prefix`, `use-prefix-needs-reactivity`,
    `test-filename-matches-source`, `no-typedef-only-file`).
  - **Explain**: a human handbook (layers, module shape, component-shape
    axes, principles, working playbook) with a mermaid flow diagram.
  - **Collaborate**: an agent operating contract distributed across tool
    files (CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions, Cursor
    and Windsurf rules).
  - **Bootstrap**: `blueprint init` — scaffold layers, generate configs,
    wire the import alias into tsconfig/jsconfig, emit a CI gate.
  - **Verify**: `blueprint inspect` — a read-only architecture report
    (closed-world folders, flow violations, deep imports, ownership,
    cycles) with migration steps; error findings exit 1 for CI.
  - Canonical `vuePreset` / `reactPreset` encoding the governance
    handbook: six layers, ten principles, seven component-shape axes, an
    eighteen-rule playbook.
  - Bilingual README (English / 繁體中文) with the full API reference.
