import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';

const line = (...parts: string[]): string => parts.join('');

export function renderModuleFirstGrowthGuidance(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first') {
    return '';
  }

  const authority = resolved.modules.length === 0
    ? '`architecture.modules: []` is an intentional runway: no domain module exists yet.'
    : line(
        'Existing module declarations are authority; add or change a boundary only from ',
        'semantic evidence.',
      );

  return [
    '### Growing module boundaries',
    '',
    authority,
    '',
    line(
      '- **Reason before materializing.** Do not create a module from a requirement noun, ',
      'screen, hook, service, entity, route segment, or top-level folder by itself.',
    ),
    line(
      '- **Use a temporary LF semantic projection only as a reasoning tool.** Trace route/page ',
      'composition → container/use-case responsibilities → the technical layers and import ',
      'closure owned by each responsibility. Containers/use cases are domain seeds. Merge ',
      'related seeds, and split a broad seed only when the evidence shows independent domains.',
    ),
    line(
      '- **Keep ownership semantic.** Domain-owned code stays with its domain even when multiple ',
      'consumers use it. Only truly neutral code may move to a specifically named neutral ',
      'module; never create a generic `shared` catch-all.',
    ),
    line(
      '- **Materialize only after the boundary is chosen.** Use Module → Layer → Unit. Former ',
      'LF `containers` responsibilities live at each ordinary module root, not in an inner ',
      '`containers` layer. Route/page composition belongs in reserved `app` when applicable.',
    ),
    line(
      '- **Derive the graph from code.** Set `dependsOn` from real cross-module imports after ',
      'the boundary is materialized. The temporary LF projection is not the active topology: ',
      'never write LF config or invoke a topology transformation merely to perform this reasoning.',
    ),
  ].join('\n');
}
