import { afterEach, describe, expect, it } from 'vitest';

import { reactPreset, vuePreset } from '../presets';
import { cli, configSource, makeRepo, read, rm } from './conformance';

const directories: string[] = [];

afterEach(() => {
  directories.splice(0).forEach(rm);
});

describe.each(['react', 'vue'] as const)('presentation in a %s adopter', (framework) => {
  it.each(['layer-first', 'module-first'] as const)('emits %s guidance', async (topology) => {
    const preset = framework === 'react' ? reactPreset : vuePreset;

    const blueprint = preset(topology === 'module-first'
      ? {
          modules: [{ name: 'babyoasis', does: 'nearby room selection' }],
          emit: { agents: ['cursor'] },
        }
      : { emit: { agents: ['cursor'] } });

    const directory = makeRepo({
      packageJson: { name: 'presentation-fixture', dependencies: { [framework]: '*' } },
      files: { 'blueprint.config.mjs': configSource(blueprint) },
    });

    directories.push(directory);

    const result = await cli(directory, ['init', '--topology', topology, '--no-install']);

    expect(result.code).toBe(0);

    for (const artifact of ['docs/architecture-handbook.md', '.cursor/rules/blueprint.mdc']) {
      const output = read(directory, artifact);

      expect(output).toContain('Feature-private and single-consumer presenters are components');
      expect(output).toContain('when it does not coordinate the application use case');

      expect(output).toContain(
        'Reuse informs shared/public promotion, not component classification',
      );

      expect(output).not.toContain('Reusable, presentational UI.');
    }
  });
});
