import { DOC_ONLY_RULES, METRIC_GATES, PLUGIN_GATES } from '../emit/lint';
import type { ClaudeDirState } from '../project';
import { renderSurvey } from '../survey';
import type { SurveyResult } from '../survey';
import { cleanupTargets } from './playbook';

/**
 * The reference half of the playbook — what the agent looks things up in rather
 * than executes: the linter's semantics, the rule catalog generated from the gate
 * tables, the config sketch, the acceptance gates, the resume point, and the
 * survey evidence.
 */

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
    '  The alias is for crossing layers — a same-layer import through the alias becomes an error '
    + 'the moment the lint is wired.',
    '- **Folder layout:** a module is one child folder with private internals.',
    '  *Same-layer* sibling modules must not import each other at all — '
    + 'via the alias or `../` alike; the shared part wants to live in a lower layer.',
    '  Only *lower-layer* folder modules are importable, and entry-only; '
    + '`../` escapes are caught at any depth by `blueprint/relative-escape`.',
    '- **Pre-wiring check:** the survey\'s "Same-folder imports via the alias" count is an upper '
    + 'bound on the errors the wiring will introduce, not the exact number — '
    + 'it is a textual count that includes test files (exempt in the emitted config '
    + 'as far as the globs reach) '
    + 'and non-static references (dynamic imports, mock specifiers, doc comments) '
    + 'the wired rules may never flag.',
    '  Treat non-zero as "look here"; once the config exists, '
    + '`npx blueprint impact` reports the real per-rule count.',
    '  The fix for true hits is layout-dependent — flat: rewrite them as relative imports; folder: '
    + 'extract the shared code downward (a relative rewrite just trades the error for '
    + '`relative-escape`).',
    '  Whatever stays unresolved lands in the suppressions ledger.',
    '- **`unusedVars`** emits with `argsIgnorePattern: \'^_\'` and nothing else: '
    + '`_`-prefixed *arguments* are exempt; unused variables and catch parameters are not.',
    '- **`doctor`\'s "eslint wired" check** passes when the eslint config\'s text references '
    + '`@kekkai/blueprint` (or the config is the generated file itself).',
    '- **`doctor`\'s leftover check matches exact file families** — this playbook, '
    + 'the command file, `*.blueprint.*` references, '
    + 'and marker-bearing contracts outside `emit.agents` — never other files, '
    + 'whatever their names.',
    '  A report or feedback file you were asked to write is safe without a verification re-run.',
    '- **`doctor` prints `⊘` for a check it could not run** and never counts it as a pass: '
    + 'the banner reads "Adoption unverified — N of M checks passed, K could not run".',
    '  Exit stays 0, because a skip is not a failure — so an exit-code gate cannot see one, '
    + 'and `--json` carries `skipped` with the reason.',
    '  The check that skips is `emitted rules survive the merged eslint config`, in two states: '
    + 'eslint is not wired (the wiring check above is the red for that), '
    + 'or the merged config would not resolve, leaving nothing to compare the emitted rules '
    + 'against.',
    '- **Test files are EXEMPT as far as the globs reach** — `architecture.testFiles` '
    + '(default `*.test.* / *.spec.*`) sit outside the structural rules and `inspect` alike, '
    + 'and a scanned file no declared glob matches is ordinary source on both sides.',
    '  If the tool you are replacing policed tests too, '
    + 'switching to blueprint deliberately RELAXES that enforcement '
    + 'over the test files those globs reach — '
    + 'say so in the report instead of letting the difference pass silently.',
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
    + 'package ownership at whole-package OR named-import granularity (`owns: [{ package: '
    + '\'vue\', imports: [\'inject\'] }]` bans that named import outside the owning layer; '
    + 'same-signature entries merge into one rule allowing every declaring layer), fixture bans.',
    '  `additionalAliases` join every structural ban alongside the main alias — '
    + 'with their target\'s offset baked in (`\'~root\': \'.\'` bans `~root/src/views/**`); '
    + 'an alias into a subfolder has no layer surface, so it carries no layer bans.',
    '- `no-restricted-syntax` — re-export bans for `selfOnly` importers, '
    + 'emitted ONLY when an allowedImporters ENTRY declares it (`allowedImporters: [{ layer: '
    + '\'views\', selfOnly: true }]` — a layer-level `selfOnly` key is invalid and validation '
    + 'rejects it) — no selfOnly, no syntax rule to collide with your own '
    + '`no-restricted-syntax`.',
    '  `blueprint rules` annotates whether THIS config emits it — '
    + 'never probe emitLint to find out.',
    '- `no-restricted-globals` — global ownership (e.g. `{ global: \'fetch\' }`)',
    '- `blueprint/relative-escape` — depth-aware `../` module escapes (embedded plugin; '
    + 'ships inside the emitted config)',
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
    'Carrying a value is the OBJECT form of a rule setting — `maxLines: { tier: \'error\', value: '
    + '1200 }`, never a tier/value array; `tier` is required in that form, '
    + 'so the object without it is rejected by name at config load rather than emitting a '
    + 'tierless rule.',
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
    '- [ ] `npx blueprint inspect --baseline` exits 0 — ledger locked when debt exists, '
    + 'correctly absent when it does not',
    '- [ ] The blueprint lint rules run inside the project\'s own lint command (merged, '
    + 'conflicts resolved) — or the legacy-config migration is a named decision item in the '
    + 'report',
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
    'This playbook and the survey stay on disk; `inspect` is read-only, `init` is idempotent, '
    + 'and the baseline is only written at the final step.',
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
