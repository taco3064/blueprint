import type { Blueprint } from '../../config';
import { resolveArchitecture } from '../../config';
import { plugin } from '../../plugin';
import { scopeLintOptions } from './scope';
import type { EmitLintOptions, LintConfigEntry } from './types';

export function prohibitionEntries(
  blueprint: Blueprint,
  options: EmitLintOptions,
): LintConfigEntry[] {
  const severity = blueprint.emit?.lint?.severity ?? 'error';

  const resolved = resolveArchitecture(blueprint.architecture, {
    framework: blueprint.framework === 'auto'
      ? options.detectedFramework ?? blueprint.framework
      : blueprint.framework,
    severity,
  });

  return resolved.layers.flatMap((layer) => {
    const prohibitions = layer.prohibitions.filter((entry) => entry.mode === 'executable');

    return prohibitions.length === 0
      ? []
      : [{
          files: resolved.prohibitionFiles(layer.name, blueprint.framework),
          ignores: resolved.testFiles.architectureExemptions,
          plugins: { blueprint: plugin },
          rules: {
            'blueprint/must-not': [severity, scopeLintOptions({ prohibitions }, options.basePath)],
          },
        }];
  });
}
