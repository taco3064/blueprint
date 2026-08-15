import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import { COMMAND_FILE } from '../project';
import type { ClaudeDirState } from '../project';
import { renderSurvey } from '../survey';
import type { SurveyResult } from '../survey';

/**
 * The authoring playbook, one function per emitted section — `authoringBrief`'s
 * call list is the table of contents, and a passage used twice is one function.
 *
 * The sections that always render live here, with the two passages more than one
 * section states. The two conditional or step-numbered halves are their own
 * files: `verdict.ts` (the early exit) and `method.ts` (the nine steps), both of
 * which read their shared passages from this one.
 */

/** A repo counts as brownfield when src/ already holds this many source files. */
export const BROWNFIELD_MIN_FILES = 10;

/**
 * The four facts that make a *correct* resolved config look broken, for the two
 * paths reaching `--print-config`. Each caller opens the sentence itself, where
 * the framing genuinely differs; this carries the part that must not.
 *
 * `indent` is the caller's continuation indent. Lines are wrapped for the deeper
 * of the two and reused at the shallower; the first carries no indent, since it
 * continues the caller's own line.
 */
export function printConfigCaveats(): string {
  return [
    ', or a correct config looks broken: resolved keys carry their plugin prefix '
    + '(`@stylistic/max-len`, never bare `max-len`); a rule scoped to a layer that holds no files '
    + 'does not appear at all (inspect\'s `declaratory-self-only` note, not a loss); '
    + 'selfOnly\'s re-export ban resolves on the IMPORTER layer inspect names, '
    + 'not on the layer being protected; and **inspect\'s finding names are not ESLint rule ids** '
    + '— `deep-import`, `flow-violation` and `package-ownership` all fold into the single '
    + '`no-restricted-imports` entry, so searching for '
    + '`blueprint/deep-import` finds nothing and proves nothing.',
    'Inspect\'s migration steps name the carrying rule for each finding, '
    + 'and mark the ones no lint run will ever show.',
  ].join(' ');
}

/**
 * What authoring leaves behind — the two files AND the directories init created
 * for them, with `claudeDir` deciding whether `.claude/` is one. One passage, four
 * call sites including the banner: doctor's leftover check matches file families
 * and never looks at a directory, so nothing downstream catches a copy that drops
 * the directories (field runs #124, #145).
 */
export function cleanupTargets(claudeDir: ClaudeDirState): string {
  // The owner's own commands live here too, and "now-empty" was asserted about a
  // directory the tool can read. Half of this sentence was already measured — the
  // `.claude/` arm — so a field agent with `my-existing-command.md` beside blueprint's
  // got the pre-existing `.claude/` right and `commands/` wrong in the same breath
  // (field run #139). Nothing about `.claude/` needs deciding when its child stays.
  if (claudeDir.otherCommands > 0) {
    return `this playbook and \`${COMMAND_FILE}\`, and nothing else: `
      + `\`.claude/commands/\` holds ${claudeDir.otherCommands} other command file(s) that `
      + 'are the owner\'s, so it and `.claude/` both stay.';
  }

  return [
    `this playbook, \`${COMMAND_FILE}\`, and the now-empty`,
    ...(claudeDir.hadDir
      ? [
          '`.claude/commands/` directory — but NOT `.claude/` itself: it was already '
          + 'here before this run, so it is the owner\'s, whatever ends up left in it.',
        ]
      : [
          '`.claude/commands/` directory — and `.claude/` itself, '
          + 'which init created only to hold this command (it was not here before this run).',
        ]),
  ].join(' ');
}

/**
 * The Next.js addendum, appended to the H1 — the route tree is itself a layer,
 * and `src/pages` beside the App Router is a routing convention, not a layer to
 * scaffold. Empty on every other framework.
 */
export function renderNextNote(next: boolean): string {
  if (!next) {
    return '';
  }

  return [
    '',
    '',
    '> **Next.js project.** The route tree (`app/`, or `pages/` on the Pages Router) is itself a '
    + 'layer — declare it at the top of the flow (a typical shape: '
    + '`app` → `components` → `hooks` → `lib`).',
    '> Never scaffold or declare an empty `src/pages` alongside the App Router: '
    + 'that folder name is a routing convention.',
    '> Flat module layout fits the route tree — '
    + 'relative imports stay free inside a segment while cross-layer traffic uses the alias.',
  ].join('\n');
}

/**
 * Title, the provenance banner, and the two conditional blocks that ride with
 * them. The banner states the deletion up front because `doctor` treats this
 * file and the command file as leftovers while they remain.
 */
export function renderHeader(
  nextNote: string,
  verdict: string,
  claudeDir: ClaudeDirState,
): string {
  return [
    `# Blueprint authoring playbook${nextNote}`,
    '',
    `> Generated by \`blueprint init\`.`,
    `> Execute top to bottom, autonomously — do not stop to ask for confirmation.`,
    `> When you finish, delete ${cleanupTargets(claudeDir)} Then \`blueprint doctor\` has the final word: it flags the two files as leftovers while they remain.${verdict}`,
  ].join('\n');
}

/**
 * The one precondition: the package must be a devDependency, because the config
 * the agent writes imports it and every `npx blueprint` step resolves it from
 * the project.
 */
export function renderPrerequisites(install: string): string {
  return [
    '',
    '## Prerequisites',
    '',
    '`@kekkai/blueprint` must be a devDependency — the config you will write imports it, '
    + 'and every `npx blueprint` step resolves it from the project.',
    '`init` already installed it unless `--no-install` was passed; verify, or run:',
    '',
    '```bash',
    `${install}`,
    '```',
  ].join('\n');
}

/**
 * What is being installed and where the job stops: the four deliverables, the
 * no-refactor boundary, and the three verdicts an agent must be licensed to
 * reach — the preset early exit, the honestly empty net, and drafting before
 * reading. Each one exists because a field run talked itself out of it.
 */
export function renderGoal(): string {
  return [
    '',
    '## Goal and boundary',
    '',
    '**Know what you are installing.** Blueprint is a governance tool for AI-driven development: '
    + 'its job is to keep agents — including you, and every agent that touches '
    + 'this repo after you — from drifting outside the declared architecture.',
    'The strictness is the product, not a cost to negotiate down.',
    'When you feel the urge to soften a tier, skip a gate, or leave yourself an escape hatch, '
    + 'that urge is exactly what this tool exists to catch: install faithfully, '
    + 'and put disagreements in the report for the maintainer — never into a weakened config.',
    '',
    'Author `blueprint.config.mjs` for this repository so that its architecture rules '
    + 'match the code\'s *intent*, then generate the artifacts and lock the baseline.',
    'Deliverables:',
    '',
    '1. `blueprint.config.mjs` — validated, findings explainable',
    '2. `npx blueprint init` artifacts (lint config, handbook, agent contracts)',
    '3. `npx blueprint inspect --update-baseline` run — it writes `.blueprint-baseline.json` '
    + 'only when debt exists; on a clean repo "No debt to lock" and no file IS the correct outcome',
    '4. A short report: the layer table, debt counts by category, any cycles.',
    '   It is a message, not an artifact — deliver it as your closing reply to the '
    + 'user (or the PR description when one is opened); never commit a report file',
    '',
    'Out of scope: fixing the debt.',
    'Existing violations are recorded in the baseline and paid down later — '
    + 'do not refactor application code in this pass.',
    '',
    `**Early exit is a legitimate verdict.** On a repo below the brownfield threshold (${BROWNFIELD_MIN_FILES} source files) whose shape a framework preset already fits, the correct conclusion is to run \`npx blueprint init --preset\`, wire its outputs, delete this playbook and the command file, and stop.`,
    `Walking the full method on a starter is ceremony, not judgment; this playbook earns its cost on repos whose layer boundaries have grown fuzzy.`,
    '',
    '**An empty net is equally legitimate.** On a root-only app the layer rules reach nothing — '
    + 'that is the true state, not a failure to fix.',
    'Never invent a layer to make coverage non-zero (a `*` name, a glob contortion): '
    + 'root files are wiring, and their hygiene (line counts, '
    + 'unused vars) belongs to the project\'s own lint, not to a manufactured layer.',
    'The net starts biting when code lands inside declared layers.',
    'The inverse also holds: a preset\'s declared-but-empty layers are the runway, '
    + 'not a manufactured net — declaring intent costs nothing and `inspect` '
    + 'tracks them honestly (missing-layer info, the coverage line), so keep them.',
    '**Runway comes in three shapes, and `inspect` names two of them.** '
    + 'An empty layer gets its note, and so does an `owns` entry for a package the repo has not '
    + 'installed (a preset\'s `hooks` owns `zustand` whether or not you use it) — '
    + 'an `owns-not-installed` note naming the layer that declares it.',
    'An alias no import uses yet gets none — '
    + 'nothing imports it, so there is nothing to count and no finding to raise.',
    'All three are still runway: they say where a thing goes if it arrives, '
    + 'ban nothing until then, and need no dependency added to justify them.',
    'Keep them on the same default as the layers, and know that the alias is '
    + 'the one shape you have to recognize yourself rather than read off a report.',
    'Keeping is the DEFAULT — the preset layers are the baseline, '
    + 'and slimming them is the project owner\'s later decision, never the adopting agent\'s.',
    'When a declared-but-empty layer ALSO looks stale, the tiebreak is prose intent: '
    + 'an intent document describing it as a future seam makes it runway (keep); '
    + 'one the prose never mentions, contradicted by where the code actually lives, '
    + 'is a stale clause (downgrade it and record the conflict — Method step 1).',
    '**A drawn diagram is part of what that document says.** A layer absent from every per-layer '
    + 'section but still drawn in the same file\'s flow graph HAS been mentioned — '
    + 'read both before calling a clause unmentioned, or the tiebreak decides '
    + 'on half the evidence and drops a layer the document is still declaring.',
    '**Those two branches are not a partition, and the third state is the common one: '
    + 'mentioned, but nowhere described as intent.** A box in a diagram and nothing else is '
    + 'exactly that — it says the clause is not stale '
    + 'without saying it is a seam, so neither branch fires.',
    'Do not force it into one.',
    'Keeping is already the default, so keep it and hand the owner the specific question: '
    + 'this layer is drawn in <file> and described nowhere, '
    + 'and the code it names lives at <path> instead.',
    'That sentence is worth more than a verdict you reached by picking the nearer branch — '
    + 'the owner knows which of the two the drawing meant, and you do not.',
    'Adding a state to the diagram-mention rule is what opened this gap: broadening "mentioned" '
    + 'narrowed the stale branch and left the middle unowned, so it is named rather than implied.',
    '',
    '**Work the loop, not the archive.** Everything below is evidence and reference — '
    + 'it is NOT a syllabus to master before touching the config.',
    'Draft `blueprint.config.mjs` early from the survey and the rule catalog, '
    + 'then let `inspect` correct you: it is read-only, cheap, and needs nothing installed, and '
    + 'a wrong draft fixed in two runs beats a perfect draft after an hour of code archaeology.',
    '`impact` is the same kind of read-only feedback but is NOT available at this point — '
    + 'it lints with the emitted config, so it needs the plugins `init` installs; '
    + 'it joins the loop at Method step 9, after init.',
    'Reaching for it while drafting only earns you a load error.',
    'In field runs, agents that drafted first finished in a fraction of the time of agents '
    + 'that studied first — at the same quality, because the acceptance gates are the same.',
    'And if you ever feel the need to read the package\'s `dist/` bundle to answer a question, '
    + 'stop: the answer belongs in this playbook — note the gap in your report instead.',
  ].join('\n');
}

/**
 * Facts about the emitted rules that drive authoring decisions. Stated here for
 * one reason: an agent that cannot find them reverse-engineers them from the
 * package's `dist/` bundle, which the playbook forbids a few sections up.
 */
export function renderSemantics(): string {
  return [
    '',
    '## Semantics the linter holds you to',
    '',
    'Facts about the emitted rules that drive authoring decisions — '
    + 'stated here so you never have to reverse-engineer them from the bundle:',
    '',
    '- **Flat layout:** the module is the whole layer, '
    + 'so same-layer *relative* imports are always legal.',
    '  The alias is for crossing layers — '
    + 'a same-layer import through the alias becomes an error the moment the lint is wired.',
    '- **Folder layout:** a module is one child folder with private internals.',
    '  *Same-layer* sibling modules must not import each other at all — '
    + 'via the alias or `../` alike; the shared part wants to live in a lower layer.',
    '  Only *lower-layer* folder modules are importable, and entry-only; '
    + '`../` escapes are caught at any depth by `blueprint/relative-escape`.',
    '- **Pre-wiring check:** the survey\'s "Same-folder imports via the alias" count is an upper '
    + 'bound on the errors the wiring will introduce, not the exact number — '
    + 'it is a textual count that includes test files (exempt in the emitted config) and '
    + 'non-static references (dynamic imports, mock specifiers, '
    + 'doc comments) the wired rules may never flag.',
    '  Treat non-zero as "look here"; once the config exists, '
    + '`npx blueprint impact` reports the real per-rule count.',
    '  The fix for true hits is layout-dependent — flat: rewrite them as relative imports; folder: '
    + 'extract the shared code downward (a relative '
    + 'rewrite just trades the error for `relative-escape`).',
    '  Whatever stays unresolved lands in the suppressions ledger.',
    '- **`unusedVars`** emits with `argsIgnorePattern: \'^_\'` and nothing else: '
    + '`_`-prefixed *arguments* are exempt; unused variables and catch parameters are not.',
    '- **`doctor`\'s "eslint wired" check** passes when the config is the generated file itself, '
    + 'or when its CODE calls `emitLint(` or names `@kekkai/blueprint` — '
    + 'both tells, because neither covers the other: a config reaching `emitLint` through a shared '
    + 'config package never names this package, '
    + 'and one that renames the import on the way in never spells the call.',
    '  Code, not text: a tell inside a comment or a string literal is NOT wiring, '
    + 'so a spread you commented out to unblock CI reads `✗` while it sits there '
    + 'in full — and so does a `function emitLint()` of your own, whose calls are '
    + 'its own. A config the scanner cannot read straight through '
    + '(an unterminated literal, a regex it cannot tell from a comment) also reads `✗`, '
    + 'because the recoverable answer is the one that hands you the reference file.',
    '- **`doctor`\'s leftover check matches exact file families** — '
    + 'this playbook, the command file, `*.blueprint.*` references, and marker-bearing '
    + 'contracts outside `emit.agents` — never other files, whatever their names.',
    '  A report or feedback file you were asked to write is safe without a verification re-run.',
    '- **`doctor` prints `⊘` for a check it could not run** and never counts it as a pass: '
    + 'the banner reads "Adoption unverified — N of M checks passed, K could not run".',
    '  Exit stays 0, because a skip is not a failure — '
    + 'so an exit-code gate cannot see one, and `--json` carries `skipped` with the reason.',
    '  The check that skips is `emitted rules survive the merged eslint config`, in two states: '
    + 'eslint is not wired (the wiring check above is the red for that), or the merged '
    + 'config would not resolve, leaving nothing to compare the emitted rules against.',
    '- **Test files are EXEMPT** — `architecture.testFiles` (default '
    + '`*.test.* / *.spec.*`) sit outside the structural rules and `inspect` alike.',
    '  If the tool you are replacing policed tests too, switching to blueprint deliberately '
    + 'RELAXES that enforcement — say so in the report '
    + 'instead of letting the difference pass silently.',
  ].join('\n');
}

/**
 * The rule catalog, generated from the same exported gate tables `emitLint` and
 * `blueprint rules` read — so the playbook cannot drift from what is emitted.
 * The one section here whose body is computed rather than written.
 */
export function renderRuleCatalog(): string {
  return [
    '',
    '## Rule catalog — ask this file, not the bundle',
    '',
    '(The same catalog is queryable anytime: `npx blueprint rules` — '
    + 'annotated with the config\'s declared tiers once one exists.)',
    '',
    '**Structural rules — always emitted**, whatever the `rules` block says.',
    'Their shared severity is `emit.lint.severity` (default `error`), '
    + 'and that knob covers ONLY these:',
    '',
    '- `no-restricted-imports` per layer — dependency flow, same-layer bans, '
    + 'package ownership at whole-package OR named-import granularity '
    + '(`owns: [{ package: \'vue\', imports: [\'inject\'] }]` bans that named import outside the '
    + 'owning layer; same-signature entries merge into one '
    + 'rule allowing every declaring layer), fixture bans.',
    '  `additionalAliases` join every structural ban alongside the main alias — '
    + 'with their target\'s offset baked in (`\'~root\': \'.\'` bans `~root/src/views/**`); '
    + 'an alias into a subfolder has no layer surface, so it carries no layer bans.',
    '- `no-restricted-syntax` — re-export bans for `selfOnly` importers, '
    + 'emitted ONLY when an allowedImporters ENTRY declares it '
    + '(`allowedImporters: [{ layer: \'views\', selfOnly: true }]` — '
    + 'a layer-level `selfOnly` key is invalid and validation rejects it) — '
    + 'no selfOnly, no syntax rule to collide with your own `no-restricted-syntax`.',
    '  `blueprint rules` annotates whether THIS config emits it — '
    + 'never probe emitLint to find out.',
    '- `no-restricted-globals` — global ownership (e.g. `{ global: \'fetch\' }`)',
    '- `blueprint/relative-escape` — depth-aware `../` module '
    + 'escapes (embedded plugin; ships inside the emitted config)',
    '',
    '**Optional gates — emitted only when declared** in `rules` with a tier other than `off`; '
    + 'none of these emits by default, and every gate scopes to the layer file globs — '
    + 'root wiring sits outside all of them.',
    'When merging, collisions are decided by rule KEY, not by hit count — '
    + '`blueprint rules --json` names every key the emitted config sets, '
    + 'and carries the exact selfOnly selector strings a fold needs.',
    'Adoption stance for these gates: declare one only to translate an existing house threshold '
    + '(carry its value); switching NEW gates on is the owner\'s later tuning, '
    + 'not the adopting agent\'s call.',
    'Carrying a value is the OBJECT form of a rule setting — '
    + '`maxLines: { tier: \'error\', value: 1200 }`, never a tier/value array; '
    + '`tier` is required in that form, so the object without it is '
    + 'rejected by name at config load rather than emitting a tierless rule.',
    'The metric family falls back to these thresholds when no `value` is given:',
    '',
    `${METRIC_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.rule}\` (default ${gate.fallback})`).join('\n')}`,
    `${PLUGIN_GATES.map((gate) => `- \`${gate.id}\` → \`${gate.emits}\` — ${gate.note}`).join('\n')}`,
    '',
    '**Documentation-only ids — never an ESLint line:**',
    '',
    `${DOC_ONLY_RULES.map((entry) => `- \`${entry.id}\` — ${entry.note}`).join('\n')}`,
  ].join('\n');
}

/**
 * A commented `defineBlueprint` sketch. Deliberately a sketch and not the field
 * list: the re-adoption step tells an agent to reproduce any field the sketch
 * does not show, so this staying incomplete is load-bearing, not an omission.
 */
export function renderSchemaSketch(): string {
  return [
    '',
    '## Config schema sketch',
    '',
    '```js',
    'import { defineBlueprint } from \'@kekkai/blueprint\';',
    '',
    'export default defineBlueprint({',
    '  name: \'<project>\',',
    '  framework: \'<vue|react>\',',
    '  architecture: {',
    '    // Preset default is \'~app\' ON PURPOSE: \'@\' is npm\'s scope sigil',
    '    // (@vue/*, @types/*) — an app alias that does not look like a package',
    '    // scope stays visually distinct. Override only to match an existing',
    '    // team convention, not for taste.',
    '    alias: \'<alias>\',',
    '    // Extra import roots beyond the alias. One whose target can contain',
    '    // the layer folders (the source root, or above it — \'~root\': \'.\')',
    '    // joins every structural ban with the offset baked in; a subfolder',
    '    // alias like this one has no layer surface and carries no layer bans.',
    '    additionalAliases: { \'~shared\': \'./src/shared\' },',
    '    layers: [',
    '      // Order defines the one-way flow: a layer may import only layers',
    '      // declared AFTER it. allowedImporters (optional) narrows who may',
    '      // import a layer; selfOnly = depend on it but never re-export it.',
    '      { name: \'pages\', does: \'<one-line responsibility>\' },',
    '      {',
    '        name: \'features\',',
    '        does: \'…\',',
    '        module: { layout: \'folder\', entry: \'index\' }, // per-layer override',
    '      },',
    '      // owns entries — the full shape (nothing else lives only in dist).',
    '      // A package several layers may use: declare the SAME entry in each of',
    '      // them — same-signature owns merge into one rule allowing every',
    '      // declaring layer; the repetition IS the shared-allowance syntax.',
    '      //   \'axios\'                                    whole package',
    '      //   { package: \'vue\', imports: [\'inject\'] }    named imports only',
    '      //   { package: \'@scope/*\', pattern: true }     glob over import',
    '      //     specifiers — npm scopes and alias paths (\'~app/services/http*\') alike',
    '      //   { package: \'x\', exempt: [\'**/*.stories.*\'] }  files exempt from the ban',
    '      //   { global: \'fetch\' }                        global identifier',
    '      { name: \'services\', does: \'…\', owns: [\'axios\', { global: \'fetch\' }] },',
    '    ],',
    '    // Optional — omitting module (or any of its keys) IS the flat default',
    '    // ({ layout: \'flat\', entry: \'index\' }); private: [\'hooks\', …] keeps',
    '    // parts behind the entry.',
    '    module: { layout: \'flat\', entry: \'index\' },',
    '    layerFiles: \'src/{layer}/**/*.<ext glob>\',',
    '    testFiles: [\'**/*.test.*\', \'**/__tests__/**\'],',
    '  },',
    '  // A bare tier takes the gate\'s default threshold. To carry an existing',
    '  // house threshold instead, use the object form — `tier` required, `value`',
    '  // optional: `maxLines: { tier: \'error\', value: 1200 }`. Shown here as a',
    '  // comment ON PURPOSE: declaring a gate you are not translating is the',
    '  // owner\'s tuning, so this line stays two gates that a preset sets too —',
    '  // NOT the set a preset sets, which is nearly the whole catalog.',
    '  // `npx blueprint rules` prints that set, and which of them are active.',
    '  rules: { cycles: \'error\', unusedVars: \'error\' },',
    '});',
    '```',
  ].join('\n');
}

/**
 * The six checkboxes that define done — `doctor` last, since it flags this file.
 * The cleanup box names the directories too: a checkbox is the definition an
 * agent verifies itself against, so a target missing here is a target left
 * behind by anyone who works from this list.
 */
export function renderAcceptanceGates(claudeDir: ClaudeDirState): string {
  return [
    '',
    '## Acceptance gates',
    '',
    '- [ ] `npx blueprint inspect` findings are all explainable as real debt',
    '- [ ] `npx blueprint inspect --baseline` exits 0 — '
    + 'ledger locked when debt exists, correctly absent when it does not',
    '- [ ] The blueprint lint rules run inside the project\'s own lint command (merged, '
    + 'conflicts resolved) — or the legacy-config migration is a named decision item in the report',
    '- [ ] No `*.blueprint.*` reference file remains in the repo',
    '- [ ] The report names every import cycle and every upward dependency found',
    `- [ ] Deleted: ${cleanupTargets(claudeDir)} THEN \`npx blueprint doctor\` passes with no \`⊘\` — a skip is not a pass and keeps exit 0 — doctor flags them as leftovers, so it is the last thing you run, not a mid-flow smoke test`,
  ].join('\n');
}

/**
 * What survives an interrupted run. `inspect` is read-only, `init` idempotent,
 * and the baseline is written only at the final step, so stopping costs nothing
 * — worth saying, because an agent that fears a half-done state hands back.
 */
export function renderResumePoint(): string {
  return [
    '',
    '## If you stop midway',
    '',
    'Nothing is lost.',
    'This playbook and the survey stay on disk; `inspect` is read-only, '
    + '`init` is idempotent, and the baseline is only written at the final step.',
    'A human (or another agent) resumes from the same loop.',
  ].join('\n');
}

/**
 * The survey, fenced. Every number is deterministic fact about this repo, which
 * is why the Method tells the agent not to re-derive any of it by grepping.
 */
export function renderSurveyEvidence(survey: SurveyResult): string {
  return [
    '',
    '## Survey evidence',
    '',
    '```',
    `${renderSurvey(survey)}`,
    '```',
    '',
  ].join('\n');
}
