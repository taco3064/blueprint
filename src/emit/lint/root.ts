import { resolveArchitecture } from '../../config';
import type { Blueprint } from '../../config';
import { plugin } from '../../plugin';
import { scopeLintOptions } from './scope';
import type { EmitLintOptions, LintConfigEntry } from './types';

export function sourceRootImportEntries(
  blueprint: Blueprint,
  severity: 'error' | 'warn',
  options: EmitLintOptions,
): LintConfigEntry[] {
  const { architecture, framework } = blueprint;
  const resolved = resolveArchitecture(architecture);

  return resolved.topology === 'module-first'
    ? [{
        files: resolved.sourceRootFiles(framework),
        ignores: resolved.testFiles.architectureExemptions,
        plugins: { blueprint: plugin },
        rules: {
          'blueprint/import-boundary': [
            severity, scopeLintOptions({ architecture }, options.basePath),
          ],
        },
      }]
    : [];
}
