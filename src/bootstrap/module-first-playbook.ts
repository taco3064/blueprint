import type { ClaudeDirState } from '../project';
import { cleanupTargets } from './playbook';

export function renderModuleFirstNextNote(next: boolean): string {
  if (!next) {
    return '';
  }

  return [
    '',
    '',
    '> **Next.js module-first project.** Keep `app/**` as reserved router composition at '
    + 'the container position. It is not an ordinary domain module or a global layer.',
    '> Derive domain modules from the other application folders, then derive the repeated '
    + 'technical layers inside those modules. Never mix that model with global layers.',
  ].join('\n');
}

export function renderModuleFirstGoal(): string {
  return [
    '',
    '## Goal and boundary',
    '',
    '**Author the selected module-first topology.** Blueprint governs both domain-module '
    + 'dependencies and the repeated technical-layer flow inside each module.',
    'Write `blueprint.config.mjs` from repository intent and observed imports; do not run a '
    + 'layer-first preset or translate the repository into global layers.',
    'Deliverables:',
    '',
    '1. `blueprint.config.mjs` with module responsibilities, `dependsOn`, and inner layers',
    '2. `npx blueprint init` artifacts (lint config, handbook, agent contracts)',
    '3. `npx blueprint inspect --update-baseline` — a missing baseline is correct when no debt '
    + 'exists',
    '4. A closing report with the module + inner-layer structure, dependency debt, and cycles',
    '',
    'Out of scope: fixing application debt or changing the selected topology.',
    'There is no generic module-first preset and no starter early exit: author the domain model.',
  ].join('\n');
}

export function renderModuleFirstMethod(claudeDir: ClaudeDirState): string {
  return [
    '',
    '## Method — draft, inspect, correct',
    '',
    '1. Read architecture notes, ownership docs, route descriptions, and existing lint rules.',
    '   Treat them as intent evidence; record contradictions instead of silently choosing one.',
    '2. Use the survey and source tree as facts. Unresolved imports and inspection findings are '
    + 'usable evidence, not permission to weaken the model.',
    '3. Treat ordinary top-level folders below `sourceRoot` as module candidates, never as '
    + 'global layer candidates. Group by domain responsibility, not technical vocabulary.',
    '4. Derive the technical layers that repeat inside ordinary modules (for example '
    + '`components`, `hooks`, `services`, and `lib`). Declare one inner-layer flow shared by '
    + 'the modules; do not create parallel global layer folders.',
    '5. Give every module a precise `does` responsibility. Infer direct `dependsOn` edges from '
    + 'cross-module imports and intent; report cycles and counter-direction edges as debt.',
    '6. In Next.js, reserve `app/**` for recursive router composition at the container position.',
    '   Do not treat `app` as an ordinary domain module or as a global layer.',
    '7. Choose file/folder unit layouts and the inner-layer order from actual import direction.',
    '   A layer may import only inner layers declared after it; cross-boundary imports use the '
    + 'canonical alias.',
    '8. Draft the config early with `modules`, `layers`, and a `layerFiles` pattern containing '
    + 'both `{module}` and `{layer}`. Run `npx blueprint inspect`, correct the draft, and repeat '
    + 'until every finding is explainable.',
    '9. Run `npx blueprint init`, merge its lint export into the project lint command, then use '
    + '`npx blueprint impact` to measure the emitted rules.',
    '10. Run `npx blueprint inspect --update-baseline`, commit only intended generated outputs, '
    + `Delete ${cleanupTargets(claudeDir)} Then finish with \`npx blueprint doctor\`.`,
  ].join('\n');
}

export function renderModuleFirstSemantics(): string {
  return [
    '',
    '## Module-first semantics the linter holds you to',
    '',
    '- Module names select domain containers; declaration order grants no dependency permission.',
    '- `dependsOn` declares direct module edges. Transitive downstream modules are importable; '
    + 'cycles and undeclared counter-edges remain debt.',
    '- `layers` are repeated technical positions inside ordinary modules, not repository-wide '
    + 'top-level folders. Their order defines the one-way inner-layer flow.',
    '- `app/**` is the reserved router-composition container position in a Next.js module-first '
    + 'tree; its recursive route segments are not ordinary domain modules.',
    '- Relative imports stay within a unit. Imports crossing a module or inner-layer boundary '
    + 'must use the canonical source-root alias.',
    '- Test-file exemptions and inspection coverage follow the declared file globs; never add '
    + 'fake modules or layers merely to make coverage non-zero.',
  ].join('\n');
}

export function renderModuleFirstSchemaSketch(): string {
  return [
    '',
    '## Module-first config schema sketch',
    '',
    '```js',
    'import { defineBlueprint } from \'@kekkai/blueprint\';',
    '',
    'export default defineBlueprint({',
    '  name: \'<project>\',',
    '  framework: \'<vue|react>\',',
    '  architecture: {',
    '    alias: \'~app\',',
    '    modules: [',
    '      { name: \'auth\', does: \'authentication and session ownership\' },',
    '      { name: \'shop\', does: \'commerce workflows\', dependsOn: [\'auth\'] },',
    '    ],',
    '    // These are inner technical layers repeated below each ordinary module.',
    '    layers: [',
    '      { name: \'components\', does: \'domain UI\', layout: \'folder\', entry: \'index\' },',
    '      { name: \'hooks\', does: \'domain orchestration\', layout: \'file\' },',
    '      { name: \'services\', does: \'domain data access\', layout: \'file\' },',
    '    ],',
    '    layerFiles: \'src/{module}/{layer}/**/*.{ts,tsx,vue}\',',
    '    testFiles: [\'**/*.test.*\', \'**/__tests__/**\'],',
    '  },',
    '  rules: { cycles: \'error\', unusedVars: \'error\' },',
    '});',
    '```',
    '',
    '`app/**` is intentionally absent from `modules`: in Next.js it occupies the reserved '
    + 'router-composition container position.',
  ].join('\n');
}
