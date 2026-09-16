import { renderTestFilesOperational } from './test-files';
import { cleanupTargets } from './authoring-playbook';
import type { AuthoringClaudeDirFact } from './authoring-types';

export function renderModuleFirstNextNote(next: boolean): string {
  if (!next) {
    return '';
  }

  return [
    '',
    '',
    '> **Next.js module-first project.** Keep `app/**` as reserved router composition at '
    + 'the container position. It is not an ordinary domain module or a global layer.',
    '> Derive domain modules from container/use-case responsibilities, then associate the '
    + 'technical layers and import closure owned by each domain. Never make route segments '
    + 'or top-level folders domain boundaries by themselves.',
    '> Reserved router composition may be declared as `{ name: \'app\', does: \'router '
    + 'composition\', dependsOn: [...] }`; `app/**` is governed recursively without repeating '
    + 'the shared inner layers.',
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
    'There is no generic module-first domain preset: author the domain model from semantic '
    + 'evidence.',
  ].join('\n');
}

export function renderModuleFirstMethod(
  claudeDir: AuthoringClaudeDirFact,
  claudeLauncher: boolean,
): string {
  return [
    '',
    '## Method — project semantics before materializing modules',
    '',
    '1. Read architecture notes, ownership docs, route descriptions, and existing lint rules.',
    '   Treat them as intent evidence; record contradictions instead of silently choosing one.',
    '2. Use the survey, source tree, and import graph as facts. Unresolved imports and inspection '
    + 'findings are evidence, not permission to weaken the model.',
    '3. Build a **temporary layer-first semantic projection for reasoning only**: trace route/page '
    + 'composition to container/use-case responsibilities, then associate the technical layers '
    + 'and import closure owned by each responsibility. Do not write a layer-first config and do '
    + 'not invoke topology transformation for this projection.',
    '4. Treat containers/use-case responsibilities as the first domain seeds. Merge related seeds '
    + 'that express one business responsibility; split a broad seed only when the evidence shows '
    + 'independent domains. A requirement noun, screen, hook, service, entity, or top-level folder '
    + 'is never sufficient evidence for a module by itself. Never treat ordinary top-level '
    + 'folders below `sourceRoot` as module boundaries.',
    '5. Keep domain-owned code with its domain even when multiple consumers use it. Move only '
    + 'truly neutral code into a specifically named neutral module; never create a generic '
    + '`shared` catch-all.',
    '6. Once boundaries are chosen, materialize Module → Layer → Unit. LF `containers` '
    + 'responsibilities map to each module root, not an inner `containers` layer. Route/page '
    + 'composition maps to the reserved `app` module when that composition exists.',
    '7. Derive the technical layers that repeat inside ordinary modules (for example '
    + '`components`, `hooks`, `services`, and `lib`) from actual code. Declare one inner-layer '
    + 'flow shared by the modules; do not create parallel global layer folders. Never mix that '
    + 'model with global layers.',
    '8. Give every module a precise `does` responsibility. Infer direct `dependsOn` edges from '
    + 'real cross-module imports after the module move; report cycles and counter-direction edges '
    + 'as debt rather than inventing edges from declaration order.',
    '9. Choose file/folder unit layouts and the inner-layer order from actual import direction.',
    '   A layer may import only inner layers declared after it; cross-boundary imports use the '
    + 'canonical alias.',
    '10. Draft the config early with `modules`, `layers`, and any custom `layerFiles` pattern '
    + 'containing both `{module}` and `{layer}`. Run `npx blueprint inspect`, correct the draft, '
    + 'and repeat until every finding is explainable.',
    '11. Run `npx blueprint init`, merge its lint export into the project lint command, then use '
    + '`npx blueprint impact` to measure the emitted rules.',
    '12. Run `npx blueprint inspect --update-baseline`, commit only intended generated outputs, '
    + `Delete ${cleanupTargets(claudeDir, claudeLauncher)} Then finish with \`npx blueprint doctor\`.`,
  ].join('\n');
}

export function renderModuleFirstSemantics(): string {
  return [
    '',
    '## Module-first semantics the linter holds you to',
    '',
    '- `architecture.modules: []` is a valid module-first runway: topology is selected while no '
    + 'domain has been instantiated yet.',
    '- Module names select semantic domain containers; declaration order grants no dependency '
    + 'permission. Screens, hooks, services, entities, and folder names do not become modules '
    + 'merely because they exist.',
    '- `dependsOn` declares direct module edges and comes from real cross-module imports. '
    + 'Transitive downstream modules are importable; cycles and undeclared counter-edges remain '
    + 'debt.',
    '- `layers` are repeated technical positions inside ordinary modules, not repository-wide '
    + 'top-level folders. Their order defines the one-way inner-layer flow.',
    '- A module root is the container/use-case position. Do not repeat LF `containers` as an '
    + 'inner technical layer.',
    '- `app/**` is the reserved router-composition container position in a module-first tree when '
    + 'route/page composition exists; its recursive route segments are not ordinary domain '
    + 'modules.',
    '- Relative imports stay within a unit. Imports crossing a module or inner-layer boundary '
    + 'must use the canonical source-root alias.',
    `- ${renderTestFilesOperational('core', 'en')} Never add fake modules or layers merely to `
    + 'make coverage non-zero.',
  ].join('\n');
}

export function renderModuleFirstSchemaSketch(sourceRoot: string): string {
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
    '    // Empty is valid runway. Add domains only after semantic boundaries are evidenced.',
    '    modules: [],',
    '    // Inner technical layers repeat below each future ordinary module.',
    '    layers: [',
    '      { name: \'components\', does: \'domain UI\', layout: \'folder\', '
    + 'entry: \'index\' },',
    '      { name: \'hooks\', does: \'domain orchestration\', layout: \'file\' },',
    '      { name: \'services\', does: \'domain data access\', layout: \'file\' },',
    '    ],',
    ...(sourceRoot === 'src' ? [] : [`    sourceRoot: '${sourceRoot}',`]),
    '    // layerFiles is optional. Omit it to use Blueprint\'s framework-aware default.',
    '    // A custom pattern must include both {module} and {layer}.',
    '    testFiles: [\'**/*.test.*\', \'**/__tests__/**\'],',
    '  },',
    '  rules: { cycles: \'error\', unusedVars: \'error\' },',
    '});',
    '```',
    '',
    'When route/page composition exists, declare the reserved `app` module for it. `app/**` uses '
    + 'the container position recursively and does not repeat the shared inner layers.',
    '`layerFiles` is optional. Its default follows the selected framework and `sourceRoot`; '
    + 'custom patterns must include both `{module}` and `{layer}`.',
  ].join('\n');
}
