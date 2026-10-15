import type { ArchitectureDef } from '../config';
import { resolveArchitecture } from '../config';

export function renderConsumerFiles(architecture: ArchitectureDef, heading: '##' | '###'): string {
  const resolved = resolveArchitecture(architecture);

  if (resolved.topology !== 'module-first' || !resolved.consumerFiles.globs.length) {
    return '';
  }

  return [
    `${heading} External consumers`,
    '',
    'Declared `architecture.consumerFiles` patterns (relative to the Blueprint application root): '
    + resolved.consumerFiles.globs.map((glob) => `\`${glob}\``).join(', ') + '.',
    '',
    'Only matching files outside `sourceRoot` are external consumers, outside the '
    + 'Module → Layer → Unit topology. They receive no module, layer, unit, container, ownership, '
    + 'or public-entry identity; their imports add no module `dependsOn` or architecture reach '
    + 'evidence. A pattern matching governed files does not exempt those files. '
    + 'With `sourceRoot: "."`, there is no outside-source set and this declaration has no effect.',
    '',
    'Consumers may depend on governed source only in the application-scope sense: that edge '
    + 'does not establish uncovered application source. Governed source must not depend on '
    + 'consumers; declaring a consumer never repairs that reverse dependency. The declaration '
    + 'does not certify canonical aliases, target API correctness, public entries, '
    + 'or deep imports.',
    '',
    'File globs are explicit owner authority, never inferred from tool or directory names. '
    + 'Keep patterns narrow: broad patterns can hide genuine outside-source mistakes. '
    + 'Mixed-role directories remain checked file by file. This role does not move or scaffold '
    + 'files, expand scan roots, or suppress other independently applicable findings.',
    '',
    '`testFiles` retains its separate existing policy and takes precedence, exempting matching '
    + 'tests in both directions before consumer classification. `layerFilesIgnore` remains '
    + 'a lint/lint-backed exclusion and cannot hide application-scope evidence. '
    + 'Scanner exclusions, `additionalAliases`, and baselines retain their existing roles.',
  ].join('\n');
}
