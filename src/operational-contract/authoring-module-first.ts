import { renderTestFilesOperational } from './test-files';
import { cleanupTargets } from './authoring-playbook';
import type { AuthoringClaudeDirFact } from './authoring-types';
import { renderModuleDecompositionSteps } from './module-growth';

export function renderModuleFirstNextNote(next: boolean): string {
  if (!next) {
    return '';
  }

  return [
    '',
    '',
    '> **Next.js module-first project.** Keep `app/**` as reserved router composition at '
    + 'the container position. It is not an ordinary domain module or a global layer.',
    '> Derive domain modules from the container/use-case responsibilities its routes compose, '
    + 'never from folder or route-segment names, then derive the repeated technical layers inside '
    + 'those modules. Never mix that model with global layers.',
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
    'There is no module-first domain preset: Blueprint never invents domain modules, and this '
    + 'playbook derives them from the existing source. A proven-empty React/Vue application does '
    + 'not need it — plain `init --topology module-first` opens the canonical runway there.',
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
    '3. Decompose the existing behavior into domain modules:',
    ...renderModuleDecompositionSteps().map((step) => `   - ${step}`),
    '4. Declare each module with a precise `does`. Its root files take the container position; '
    + 'never repeat a layer-first `containers` layer inside a module. Declare the reserved `app` '
    + 'module for route/page composition when routes exist — it composes recursively and does not '
    + 'repeat the inner layers.',
    '5. Derive the technical layers that repeat inside ordinary modules (for example '
    + '`components`, `hooks`, `services`, and `lib`) from the actual code. Declare one inner-layer '
    + 'flow shared by the modules; do not create parallel global layer folders.',
    '6. Derive direct `dependsOn` edges from the real cross-module imports of the decided '
    + 'ownership; report cycles and counter-direction edges as debt instead of inventing edges.',
    '7. Choose file/folder unit layouts and the inner-layer order from actual import direction.',
    '   A layer may import only inner layers declared after it; cross-boundary imports use the '
    + 'canonical alias.',
    '8. Draft the config early with `modules`, `layers`, and any custom `layerFiles` pattern '
    + 'containing both `{module}` and `{layer}`. Run `npx blueprint inspect`, correct the draft, '
    + 'and repeat until every finding is explainable. `modules: []` stays valid while no domain '
    + 'is evidenced — source-root wiring files alone evidence none.',
    '9. Run `npx blueprint init`, merge its lint export into the project lint command, then use '
    + '`npx blueprint impact` to measure the emitted rules.',
    '10. Run `npx blueprint inspect --update-baseline`, commit only intended generated outputs, '
    + `Delete ${cleanupTargets(claudeDir, claudeLauncher)} Then finish with \`npx blueprint doctor\`.`,
  ].join('\n');
}

export function renderModuleFirstSemantics(): string {
  return [
    '',
    '## Module-first semantics the linter holds you to',
    '',
    '- `modules` selects the topology by presence: `[]` is a valid module-first runway with no '
    + 'domain module yet; omitting `modules` means layer-first.',
    '- Module names select domain containers; declaration order grants no dependency permission.',
    '- `dependsOn` declares direct module edges. Transitive downstream modules are importable; '
    + 'cycles and undeclared counter-edges remain debt.',
    '- `layers` are repeated technical positions inside ordinary modules, not repository-wide '
    + 'top-level folders. Their order defines the one-way inner-layer flow.',
    '- A module\'s root files take the container position: they may import every inner layer of '
    + 'their own module and of reachable modules, through unit entries.',
    '- `app/**` is the reserved router-composition container position in a module-first tree; its '
    + 'recursive route segments are not ordinary domain modules.',
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
    '    // Illustrative names only: derive real modules with the method above.',
    '    modules: [',
    '      // Reserved router container: governed recursively; does not repeat inner layers.',
    '      { name: \'app\', does: \'router composition\', dependsOn: [\'auth\', \'shop\'] },',
    '      { name: \'auth\', does: \'authentication and session ownership\' },',
    '      { name: \'shop\', does: \'commerce workflows\', dependsOn: [\'auth\'] },',
    '    ],',
    '    // These are inner technical layers repeated below each ordinary module.',
    '    layers: [',
    '      { name: \'components\', does: \'domain UI\', layout: \'folder\', entry: \'index\' },',
    '      { name: \'hooks\', does: \'domain orchestration\', layout: \'file\' },',
    '      { name: \'services\', does: \'domain data access\', layout: \'file\' },',
    '    ],',
    ...(sourceRoot === 'src' ? [] : [`    sourceRoot: '${sourceRoot}',`]),
    '    // layerFiles is optional. Omit it to use Blueprint\'s framework-aware default.',
    '    // A custom pattern must include both {module} and {layer}.',
    '    testFiles: [\'**/*.test.*\', \'**/__tests__/**\'],',
    '  },',
    '  // Brownfield adoption translates existing house thresholds only; switching on a gate',
    '  // this repository never held is the owner\'s later tightening, not this playbook\'s.',
    '  // `npx blueprint rules` prints the gate catalog; the canonical tiers are the',
    '  // `rules` of `reactPreset({ modules: [] })` / `vuePreset({ modules: [] })`.',
    '  rules: { cycles: \'error\', unusedVars: \'error\' },',
    '});',
    '```',
    '',
    'When route/page composition exists, its declared `app` module selects the reserved '
    + 'router-composition container position. It is governed recursively without repeating the '
    + 'shared inner layers.',
    '`layerFiles` is optional. Its default follows the selected framework and `sourceRoot`; '
    + 'custom patterns must include both `{module}` and `{layer}`.',
    'Module-first is closed-world at the source root. Every governed folder directly under '
    + '`sourceRoot` is a declared module; source-root wiring files are the one exception, and a '
    + 'global `components/`, `hooks/` or other horizontal layer tree beside the modules is not '
    + 'module-first. `sourceRoot` is the application\'s architectural source, not a window onto '
    + 'the part that already looks like modules — narrowing it to exclude the rest makes the '
    + 'topology valid by hiding what it fails to cover.',
  ].join('\n');
}
