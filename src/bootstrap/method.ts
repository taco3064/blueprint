import { cleanupTargets, printConfigCaveats } from './playbook';
import type { ClaudeDirState } from '../project';

/**
 * The playbook's step-numbered half — `renderMethod` and the passages step 9
 * composes, which is most of the file.
 *
 * The passages this shares with `verdict.ts` come from `playbook.ts`: a text two
 * sections state is one function there, never a copy in each.
 */

/**
 * The three chained paragraphs about building the combined `no-restricted-*` entry.
 * They stay together and in this order: each opens by referring to the last, and
 * this is the one place in the playbook where the order is load-bearing.
 *
 * Every clause of the recommendation is pinned by conformance, negatives included
 * — "combined one last, yours wherever it already sits" must survive and "has to
 * move up" must not come back, because reordering an existing entry silently
 * re-decides every other rule key it carries (field issue #163).
 */
function renderCombinedEntry(): string {
  return [
    '     **"ONE entry" means one per COLLISION, not one for the whole rule key.** '
    + 'emitLint scopes its entries per layer, so a rule key can have several — '
    + 'a `selfOnly` layer with two importers emits `no-restricted-syntax` on BOTH importer layers, '
    + 'and your own rule may overlap only one of them.',
    '     Combine with the entry you actually collide with, '
    + 'and leave the others exactly as emitted.',
    '     Widening your combined entry to cover the other layers as well is the way to get this '
    + 'wrong: it imposes YOUR rule on files it never governed, and one field run widened a '
    + 'date-guard onto a layer\'s `.js` and took 38 errors '
    + 'in a single test file that deliberately relaxes it.',
    '     Scoping it narrowly is NOT the opposite error — by the qualifier above, '
    + 'the layers you leave out keep the entry the spread emitted, unchanged.',
    '     Check the emit points before merging, not after: `npx blueprint rules --json` '
    + 'lists the selectors per layer, so two importers show up as two.',
    '     If you get it wrong anyway, doctor\'s survival check probes every layer separately '
    + 'and names the one that lost its selectors — it is a red you can act on, not a silent pass.',
    '',
    '     **How you combine, given that `...emitLint(blueprint)` is opaque.** '
    + 'You cannot reach inside the spread to edit the entry it emits, so do not try: '
    + 'write the combined entry yourself and place it LAST — '
    + 'after the spread, and after your own original entry wherever that one already sits.',
    '     That is the same later-replaces-earlier property this paragraph opens by warning about, '
    + 'used deliberately — the LAST entry to set that key on a file is the one that governs '
    + 'it there, so yours is the effective one only while nothing after it sets the key again.',
    '     Which is exactly why it has to carry everything the emitted one ENFORCED there: '
    + 'both option sets\' patterns and selectors, and the emitted `ignores`.',
    '     The ban message is the one part that is NOT among those: '
    + 'that text is yours to write, doctor compares selectors and never messages, '
    + 'so nothing here sends you into a dump to retrieve a sentence.',
    '     `rules --json` says the same beside the selectors.',
    '     **Scope is not on that list, and the two silent losses are about what the entry '
    + 'CONTAINS.** Leave blueprint\'s selectors out of an entry that matches its '
    + 'files and the ban is gone there — doctor\'s survival check turns that red.',
    '     Fold your own original entry away and keep only the combined one, '
    + 'and your rule quietly stops governing the rest of what it used to — doctor does not '
    + 'compare the rules you brought, and says so, which is what the probe below is for.',
    '     Confirm with `npx eslint --print-config`, and the affected layer takes TWO probes rather '
    + 'than one: a file INSIDE the collision and a file OUTSIDE it, '
    + 'because the arrangement below deliberately makes those two resolve different entries — '
    + 'and the inside one is also what catches a wrong entry order.',
    '     Add one file your own rule governed outside that layer, for the loss doctor cannot see — '
    + 'that is the whole probe. This is the one place print-config is not optional: '
    + 'doctor resolves a single path per layer, and its ✓ says an entry scoped to '
    + 'part of a layer is not compared, which is now the shape you are aiming for.',
    '',
    '     **When the two sides\' scopes were never the same, do not reconcile them — '
    + 'the collision is the entry, and neither side moves.** A house rule framed at `**/*.vue` '
    + 'folded into a layer glob of `.{js,vue}` is the ordinary case: '
    + 'scope the combined entry to `**/*.vue` inside that layer, '
    + 'and leave your original entry in place rather than folding it into the new one.',
    '     Three entries then cover three sets, and none of them gives a file a rule it never had: '
    + 'yours keeps the files blueprint never governed, the spread keeps the `.js` '
    + 'files your rule never governed, and the combined one wins where they meet.',
    '     **The placement above is what makes the three of them work, '
    + 'and it still asks nothing of the entries you have: combined one last, '
    + 'yours wherever it already sits.** Put the combined one above your original instead and that '
    + 'original wins the overlap again — '
    + 'your bare rule back on top, blueprint\'s selectors gone there.',
    '     Lifting your original entry over the spread satisfies the same ordering and is the wrong '
    + 'repair: other rule keys ride along on it, and measured, one that also set '
    + '`no-restricted-imports` flipped from its own paths to blueprint\'s the moment it moved — '
    + 'silently, while the key you came here for looked right either way.',
    '     Say in the report which set each of the three covers.',
    '',
  ].join('\n');
}

/**
 * The `ignores` trap: a combined entry rebuilt from selector strings has no test
 * exemption unless it is written back. Separate from the merge mechanics because
 * dropping blueprint's `ignores` is silent unless a house rule collided there, and
 * doctor compares selectors rather than scope. One direction only — see
 * `renderCombinedEntry` for why the mirror case closed.
 */
function renderTestExemptions(): string {
  return [
    '     **An entry is more than its selectors — carry the emitted block\'s `ignores` too.** '
    + 'Every structural entry exempts test files, and a combined entry you '
    + 'rebuild from selector strings has no such exemption unless you write one.',
    '     `rules --json` gives it to you as `testExemptions` beside the selectors, '
    + 'and the text output prints the `ignores` line to paste.',
    '     Skip it and your combined entry starts governing test files: '
    + 'loud if your own rule collided there (a real run lost this and spent a debug cycle on 34 '
    + 'errors in one test file), silent if only blueprint\'s ban did — '
    + 'lint stays green while the test files it was never meant to reach are quietly under it.',
    '     Doctor compares selectors, not scope, so nothing downstream catches this.',
    '     The same move runs the other way when YOUR rule had no exemption: '
    + 'carrying blueprint\'s `ignores` onto the combined entry stops your rule at test files it '
    + 'used to govern — inside the collision only, and that is the second reason the paragraph '
    + 'above leaves your original entry in place, '
    + 'since it still governs those test files and nothing has to be given up.',
    '     Check whether the same rule appears on other layers you did NOT merge, '
    + 'because that is where an asymmetry you introduce here lands.',
    '',
    `     \`blueprint doctor\` verifies both the emitted structural rules and each declared gate's carrier rule survived the merge — so a hand sweep of the emitted gates duplicates it.`,
    `     What doctor does NOT compare is thresholds, package-ownership entries, and the survival of the rules YOU brought to the merge, and its ✓ says so.`,
    `     That remainder is what \`npx eslint --print-config <file>\` is for; a green lint run does not substitute, since it proves the config loads, not that a given rule reached a given file.`,
    `     Four things to know before reading that output${printConfigCaveats()} Run the project's own lint command; new findings introduced by the merge are fixed or explicitly judged, never left dangling — and when init wired the alias into \`tsconfig\`/\`vite\`, run the build once too (doctor's alias check reads wiring as text, never as a compile).`,
    `     Merging into a TypeScript config file (\`eslint.config.ts\`)?`,
    `     Importing \`./blueprint.config.mjs\` trips TS7016 when the tsconfig covering that file lacks \`allowJs\` — add \`allowJs: true\` there (often \`tsconfig.node.json\`), or ship a one-line \`blueprint.config.d.mts\` declaring the default export as \`Blueprint\`; name the choice in the report.`,
    `     Delete the reference once wired.`,
    `     Exception: a **legacy-format config** (\`.eslintrc.*\`) needs a flat-config/ESLint-9 migration that can break the project's own lint pipeline — do not do that unilaterally; surface it as a decision item in the report instead.`,
  ].join('\n');
}

/**
 * Method step 9's lint-merge bullet, the playbook's largest passage: a later flat-
 * config entry REPLACES an earlier one, so a merge that reads clean can delete a
 * defense while lint stays green. Not split further on purpose — its paragraphs
 * refer back to each other, so five functions would make their order load-bearing
 * while stating it nowhere.
 */
function renderLintMerge(): string {
  return [
    '   - **Wire the lint.** If `eslint.config.blueprint.mjs` was written, '
    + 'merge it into the existing flat config: spread `...emitLint(blueprint, …)` — '
    + '**carrying its options object over whole**: `stylistic` and `imports` always, '
    + 'plus `typescript: tseslint.plugin` on TypeScript projects.',
    '     Those arguments are load-bearing, not decoration: five gates ride an injected plugin '
    + '(`codeStyle`, `statementsPerLine` and `statementPadding` on stylistic; '
    + '`importBlock` on imports; `explicitAny` on the TS one) and a gate whose plugin is missing '
    + 'emits NOTHING while lint still passes — '
    + 'a dropped argument reads exactly like a clean merge.',
    '     **Declared no gates from those families?** Pass the carriers anyway, '
    + 'and let `init` install them: that is deliberate, not over-installation.',
    '     They sit inert until a gate names them, and paying for them now makes turning one on a '
    + 'one-line edit to `blueprint.config.mjs` — instead of a config edit plus an install '
    + 'plus a second pass over this merge, months later, by someone who was not here.',
    '     Then resolve every rule conflict *explicitly* — house disable conventions, thresholds, '
    + 'rules an existing structure tool already enforces — and note each decision in the report.',
    '     **`codeStyle` means blueprint\'s emitted config formats this repo**, '
    + 'so a repo that already runs its own formatter is the overlapping-tool case above: '
    + 'keep ONE owner of formatting, and say which in the report.',
    '     Rules configured under the same key on both sides (`@stylistic/*`, '
    + '`padding-line-between-statements`) collide mechanically — flat config replaces '
    + 'rather than merges — so those are a wiring precondition, not a preference.',
    '     Before merging, run `npx blueprint impact`: it lints the layer files with only the '
    + 'emitted config and reports hits per rule, so every conflict is decided on numbers, '
    + 'not by reading the emitted config against the code.',
    '     Mind flat-config semantics while merging: when two entries configure the same rule, '
    + 'the later entry *replaces* the earlier **on the files both of them match** — '
    + 'nothing merges, and ordering alone cannot save a rule **both sides set** '
    + '(`no-restricted-imports`, `no-restricted-syntax`): '
    + 'whichever comes later silently deletes the other\'s defense there while lint stays green.',
    '     That qualifier is the whole merge rather than a detail of it: '
    + 'an entry does nothing at all to a file outside its own `files`, '
    + 'so the spread goes on enforcing blueprint\'s entry everywhere yours does not reach, '
    + 'and only the overlap has to be combined.',
    '     Combine both option sets into ONE entry — blueprint\'s patterns and selectors plus your '
    + 'own (`npx blueprint rules --json` carries the exact selfOnly selectors per layer as '
    + '`jsLiteral` — paste that field, quotes included, never an emitLint dump. '
    + 'Its `note` says why the rendered `selectors` value is not the same string once it is inside '
    + 'JS source; that is a silent break, so take the field that '
    + 'survives the paste rather than the one that reads more naturally).',
    '',
    renderCombinedEntry(),

    renderTestExemptions(),
  ].join('\n');
}

/**
 * Step 9's debt posture: keep severity at `error` and ratchet, never mute. Earns a
 * name for the exception it carries — `codeStyle` and `statementPadding` are
 * nearly all auto-fixable, so they are fixed rather than ledgered, and that fix is
 * its own commit because it rewrites whitespace across every layer file.
 */
function renderRatchet(): string {
  return [
    '   - **Red is correct — ratchet it, don\'t mute it.** Keep severity at `error`; '
    + 'adoption\'s job is to make debt visible and lock it, not to quiet the screen.',
    '     Lock each side in its native ledger: architecture findings via '
    + '`npx blueprint inspect --update-baseline`, lint violations via '
    + '`npx eslint . --suppress-all` (`impact` already told you the count — '
    + 'zero hits means SKIP this command, with one carve-out: the anti-bypass guard sits OUTSIDE '
    + 'impact\'s scope, so bare disables it flags in YOUR lint run are real findings — judge them: '
    + 'annotating the disable with its reason is a comment edit, not a source refactor, '
    + 'so it sits INSIDE this pass\'s boundary; the ledger takes whatever you choose to leave, '
    + 'and the report says which you did; ESLint ≥ 9.24 — '
    + 'counts per file × rule, so NEW violations still fail).',
    '     **The formatting family is the exception to "ledger it, '
    + 'don\'t fix it":** `codeStyle` and `statementPadding` are nearly all auto-fixable, '
    + 'so `eslint --fix` resolves them outright and suppressing '
    + 'them would ledger a reformat nobody needs to review.',
    '     Run that fix as its OWN commit, touching nothing else, and say so in the report — '
    + 'it rewrites whitespace across every layer file *including tests* (the shape rules are the '
    + 'one gate family tests are NOT exempt from), '
    + 'and a diff that size folded into an architecture commit is unreviewable.',
    '     It cannot make another gate worse: '
    + '`maxLines` skips blank lines, so the added lines are free.',
    '     What `--fix` does NOT resolve is worth naming, because those are the real findings: '
    + '`max-len` has no fixer (a long line must actually be restructured — '
    + 'and it does not exempt plain strings, so a string cannot hide one), '
    + 'and a `linebreak-style` red usually means git\'s `autocrlf` / `.gitattributes`, '
    + 'NOT the file — fix it there or the next checkout undoes you.',
    '     Your gate then blocks only new debt on both, '
    + 'and `blueprint doctor` verifies neither ledger has gone stale.',
    '     The inverse is equally correct: **zero findings and zero lint hits is a complete '
    + 'outcome** — the ledgers simply stay absent (`inspect --baseline` — '
    + 'identical without a ledger — and the project\'s own lint are the gates), '
    + 'and manufacturing debt just to demo the ratchet is mistranslation, not adoption.',
    '     That includes `--suppress-all`: on a clean lint it writes an EMPTY '
    + '`eslint-suppressions.json`, and an empty ledger is ceremony — skip the command when '
    + 'there are no hits, and delete the file if one slipped out (`doctor` says so too).',
    '     Still on ESLint 8 / a legacy config?',
    '     Transitional fallback: `emit: { lint: { severity: \'warn\' } }` — '
    + 'but state the cost in the report: severity only covers the structural rules, '
    + 'so until the migration, new metric debt (maxLines…) is not gated.',
  ].join('\n');
}

/**
 * Step 9's overlapping-tool decision. Earns a name for the one case where
 * consolidation stops being the owner's scope decision and becomes a wiring
 * precondition: when the existing tool configures the SAME ESLint rules emitLint
 * emits, coexistence is mechanically impossible and doctor's survival check fails.
 */
function renderOverlappingTool(): string {
  return [
    '   - **If the repo already runs an overlapping structure tool** (e.g. '
    + 'structure-lint, dependency-cruiser), say so in the report: '
    + 'blueprint\'s lint layer duplicates it, and consolidating onto one '
    + 'gate is a scope decision for the user — flag it, don\'t decide it.',
    '     **Exception:** when the existing tool configures the *same ESLint rules* emitLint emits '
    + '(`no-restricted-imports`, `no-restricted-syntax`), coexistence is mechanically impossible — '
    + 'the entries overwrite each other and doctor\'s survival check fails.',
    '     There, consolidation stops being a scope decision and becomes a wiring precondition; '
    + 'do it, and name which gate won in the report.',
    '     The inverse case — a house rule under a DIFFERENT key with the same semantics (a '
    + 'hand-rolled deep-watch or test-filename twin) — '
    + 'never collides mechanically; it double-reports instead.',
    '     Keep ONE gate per semantic (the house rule\'s docs footprint usually decides '
    + 'which) and record the choice — declaring blueprint\'s twin on top is noise, not safety.',
    '     The same rule spans gate LAYERS: a house `import/no-cycle` (lint) and the `cycles` gate '
    + '(inspect) are one semantic — pick one detector and record it '
    + '(the catalog\'s perf note usually argues for the inspect side).',
    '     **But across gate layers the deciding axis is WHEN the failure appears, '
    + 'not perf**, and that is the difference between deciding and flagging.',
    '     Two lint rules for one semantic are a pure duplicate: '
    + 'drop one, no one\'s workflow changes.',
    '     Dropping a lint-time detector in favour of `cycles` moves the interception from wherever '
    + 'lint runs — pre-commit hook, editor, CI step — '
    + 'to the `inspect` gate, which may not be wired into any of them yet.',
    '     That is the adopter\'s pipeline, so declare blueprint\'s gate only if you are also '
    + 'placing `inspect` where the lint rule used to fire; otherwise leave the existing detector '
    + 'alone and put the consolidation in the report as a recommendation with that cost named.',
    '     Two field runs reached this conclusion by deriving it.',
    '     And when a tool IS retired, retire it whole: DELETE its config file — '
    + 'a stale architecture config sitting beside blueprint.config.mjs misleads worse than any '
    + 'prose pointer — then sweep the footprint in the same pass: '
    + 'grep the repo for its name (docs, README, code comments, agent skills and commands all '
    + 'go stale the moment the config is deleted) and update or remove every pointer you find.',
    '     A dependency entry leaves via the package manager, not a text edit; '
    + 'source-code comments referencing the dead tool may outlive the sweep under this '
    + 'playbook\'s no-source-edits boundary — list them in the report instead of editing them.',
  ].join('\n');
}

/**
 * Method step 9 — "Finish means integrated, not parked". A step by numbering only,
 * and the passage field findings land in, because integration is where adoption
 * actually fails. The three short bullets stay inline.
 */
function renderFinishStep(claudeDir: ClaudeDirState): string {
  return [
    `9. **Finish — and finish means integrated, not parked.** Run \`npx blueprint init\`, then \`npx blueprint inspect --update-baseline\`, write the report, and delete ${cleanupTargets(claudeDir)} The tool never touches files you own, so it leaves \`*.blueprint.*\` references next to them — **those references are your input, not the deliverable.`,
    `   Adoption is not done while any reference file remains:**`,
    '   - **Declare your own tool** in the config — `emit: { agents: [\'claude\'] }` (Claude Code) '
    + 'or `[\'agents\']` (codex & friends) — '
    + 'so init generates one contract file, not one per tool nobody uses.',
    '     Declare the tool RUNNING this adoption — you know who you are; '
    + 'never guess at future tools (the next one is a one-line config change away).',
    '     On a preset config, pass it straight in: '
    + '`reactPreset({ name, emit: { agents: [\'claude\'] } })` — '
    + 'and `init --agent claude` on the preset path scaffolds the config with '
    + 'this already declared, so flag and config end up saying the same thing.',
    renderLintMerge(),
    renderRatchet(),
    '   - **If a hand-written CLAUDE.md / AGENTS.md exists**, integrate the `<name>.blueprint.md` '
    + 'reference into the existing document following *its* structure — '
    + 'link, don\'t duplicate; keep project facts to one screen — then delete the reference.',
    renderOverlappingTool(),
    '   - **Everything the adoption produced is meant to be committed** — '
    + 'the config, the generated artifacts, and both ledgers (`.blueprint-baseline.json`, '
    + '`eslint-suppressions.json`): the gates read the ledgers from the repo, '
    + 'so an uncommitted baseline is a ratchet that only works on your machine.',
    '     Not a VCS repo (or you lack commit rights)?',
    '     Leave the files in place and say so in the report — '
    + 'never initialize version control on the owner\'s behalf.',
    '     The same boundary covers ongoing enforcement: blueprint deliberately scaffolds no CI — '
    + 'the gate commands (`npx blueprint inspect --baseline`, `npx blueprint doctor`) are '
    + 'the deliverable, and wiring them into a pipeline or git hook is the owner\'s call.',
    '     Recommend it in the report; never add pipeline config yourself.',
  ].join('\n');
}

/**
 * Method step 1, carrying the whole re-adoption problem: an architecture doc in the
 * repo is intent evidence senior to the import matrix, EXCEPT when it is
 * blueprint's own prior output. The clauses a matrix cannot see must be reproduced
 * from it, or a "faithful" re-adoption hands back a looser config than it replaced.
 */
function renderIntentDocuments(): string {
  return [
    '1. **Look for existing intent documents first.** An architecture config or doc already in the '
    + 'repo (`structure.config.json`, dependency-cruiser rules, `docs/architecture*`, '
    + '`CLAUDE.md`/`AGENTS.md` sections, ADRs) is intent evidence *senior* to the import matrix: '
    + 'the matrix shows what the code *does*, those documents say what it *should* do.',
    '   They also carry what the matrix cannot — '
    + 'the position of empty (zero-file) layers, selfOnly-style constraints, and ownership rules.',
    '   Translate them; use the matrix to verify.',
    '   (One token trap: structure-lint\'s `{folder}` placeholder is blueprint\'s `{layer}` in '
    + '`layerFiles`.) One document family is NOT senior evidence: blueprint\'s own prior output.',
    '   A `docs/architecture-handbook.md` it generated, and any `BLUEPRINT:START` marker block in '
    + '`CLAUDE.md`/`AGENTS.md`, are a previous answer to this same question — re-adopting a repo '
    + 'blueprint has already adopted, they will hand you back the old config almost verbatim.',
    '   Read them as an answer to CHECK, never as intent to translate: '
    + 'derive the flow from the matrix independently first, then compare.',
    '   Agreeing is the good outcome (that is idempotency); '
    + 'agreeing because you copied is how a mistranslation from the first pass becomes permanent.',
    '   One exception, and it decides the harder cases: some clauses **cannot** be derived from '
    + 'the matrix at all — ownership of a named import, the shape of a selfOnly narrowing, '
    + 'the position of a layer holding no files, a permitted importer with zero edges today.',
    '   **And the rule that catches the rest: any field in the prior config that the schema sketch '
    + 'below does not show.** The sketch is a starting shape, not the field list — '
    + '`sourceRoot`, `layerFilesIgnore`, `naming`, a layer\'s `mustNot` and `lintOverrides`, '
    + '`principles`, `componentShape`, `playbook` are all valid, '
    + 'all invisible to a survey, and every one of them changes what gets emitted.',
    '   They are the easiest of the set to lose because losing them costs no error: the contract '
    + 'comes back shorter, an override stops being emitted, an ignore stops being applied.',
    '   `sourceRoot` is the one that does real damage — drop it on a repo whose '
    + 'code is not under `src/` and every layer glob silently points at nothing.',
    '   Diff the prior config against yours field by field before you believe you reproduced it.',
    '   For those the prior output is the only evidence there is, '
    + 'so check-only means dropping them, and a "faithful" re-adoption '
    + 'then hands back a config LOOSER than the one it replaced.',
    '   Verify each against what the matrix CAN see (is there an edge for this importer? '
    + 'is the owned package imported only there?), reproduce it when that checks out, '
    + 'and list in your report which clauses were reproduced rather than derived.',
    '   **A named import has its own evidence, and it is not the package row**: '
    + 'the survey lists every specifier that appears in exactly one folder, '
    + 'from a package that appears in several — '
    + '`owns: [{ package: \'react\', imports: [\'createContext\'] }]` is CONFIRMED '
    + 'when the pair is on that list, which the package row can never do for it.',
    '   Absent from that list it is not refuted, and absence is never a licence to drop it: '
    + 'the specifier may be imported nowhere yet (a forward-looking ban, '
    + 'like the permitted importer with no edges), its package may sit in one folder already (the '
    + 'package row covers it), or several folders may import it — '
    + 'and that last one is existing debt for the baseline to record, not a clause to delete.',
    '   Regressing a gate the owner already committed is the worse error.',
    '   One more thing about re-adoption, so you do not spend a cycle proving it: '
    + 'the artifacts init regenerates — the contract block, the handbook — can come out '
    + 'WORDED differently from the ones committed whenever a different BUILD wrote them.',
    '   Equal version strings do not rule that out: an unreleased tree, a linked '
    + 'checkout and a git dependency each report the last release while emitting later text.',
    '   That is the improvement arriving, not drift and not non-idempotency, and the check is '
    + 'the same either way — re-run init twice and the second run is byte-identical to the first.',
    '   Take the new wording and say in your report that it changed.',
    '   Never hand-revert generated text toward what git happens to hold.',
    '   Documents also go stale: cross-check every translated clause against the survey below.',
    '   Where they disagree, the document governs *intent* (layer order, '
    + 'ownership) and the code governs *shape* (module layout) — '
    + 'downgrade the stale clause and record the conflict in your report.',
    '   Flow documents often draw a DAG; '
    + 'blueprint\'s order is linear (a layer may import *any* later layer).',
    '   Linearize, then verify against the matrix — '
    + 'linear is transitive, so it is usually a strict relaxation, not a real change.',
    '   Downgrading a clause leaves that drawing disagreeing with the config you just wrote.',
    '   Leave it disagreeing: a hand-written document is the repo\'s, '
    + 'not adoption\'s to edit, and redrawing one is a doc reconcile no one asked for.',
    '   Name the specific edge or box that no longer matches, '
    + 'in the report, so the owner can settle it in one pass.',
    '   Several positions equally legal (no matrix edges either way — empty layers especially)?',
    '   Pick the one granting the fewest new import permissions: the smallest relaxation.',
  ].join('\n');
}

/**
 * The nine steps, and the largest section by far — step 9 alone carries the
 * whole integration boundary, because "finish" is where adoption gets parked:
 * the tool declaration, the lint merge and its flat-config traps, the ratchet
 * posture, the overlapping-tool decision, and what must be committed.
 *
 * `claudeDir` reaches here for step 9's cleanup, which names the same targets
 * the early-exit checklist does — see `cleanupTargets`.
 */
export function renderMethod(claudeDir: ClaudeDirState): string {
  return [
    '',
    '## Method',
    '',
    renderIntentDocuments(),
    '2. **Study the survey evidence below.** '
    + 'Every number is deterministic fact from this repo; do not re-derive it by grepping.',
    '3. **Decide what is a layer.** Top-level folders under `src/` are candidates; '
    + 'root files are app wiring (never a layer).',
    '   Test plumbing (`test/`, `__tests__/`) belongs in `testFiles`, not in `layers`.',
    '   A folder that exists but holds no source files usually signals declared intent — '
    + 'check the documents from step 1 before dropping it.',
    '4. **Infer the one-way flow.** Order layers so the '
    + '*majority* direction of the import matrix points downward.',
    '   Counter-edges are debt to surface, not intent to encode — '
    + 'never contort the order to make findings zero.',
    '5. **Choose module shape per layer.** High `index`-coverage child folders → '
    + '`module: { layout: \'folder\', entry: \'index\' }` on that layer; '
    + 'plain files → the flat default (omit `module` entirely — '
    + 'it validates and resolves to `{ layout: \'flat\', entry: \'index\' }`).',
    '   Mixed repos usually need per-layer overrides.',
    '6. **Assign ownership.** A package imported by exactly one folder '
    + '(see the concentration list) is an `owns` candidate for that layer.',
    '   A candidate the intent documents never mention is a proposal, not intent — '
    + 'leave it out of the config and name it in the report; '
    + 'encoding it is tightening beyond what the repo declared.',
    '7. **Write the config** with `defineBlueprint` (schema sketch below).',
    '8. **Validate — the loop that keeps you honest.** Run `npx blueprint inspect`.',
    '   A findings explosion (roughly more findings than source files, or one dominant rule '
    + 'everywhere) means you mistranslated intent — revisit the order or the module shapes.',
    '   Converged means: every finding is explainable as real, nameable debt.',
    renderFinishStep(claudeDir),
  ].join('\n');
}
