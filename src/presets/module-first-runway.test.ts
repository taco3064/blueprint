import { describe, expect, it } from 'vitest';

import { resolveArchitecture } from '../config';
import { reactPreset, vuePreset } from './presets';

const factories = [
  ['react', reactPreset],
  ['vue', vuePreset],
] as const;

describe('canonical module-first runway projection', () => {
  it.each(factories)('keeps %s governance while projecting only topology', (_framework, factory) => {
    const layerFirst = factory();
    const moduleFirst = factory({ topology: 'module-first' });

    expect(resolveArchitecture(moduleFirst.architecture).topology).toBe('module-first');
    expect(moduleFirst.architecture.modules).toEqual([]);
    expect(moduleFirst.architecture.layers.map(({ name }) => name)).toEqual([
      'components',
      'hooks',
      'contexts',
      'services',
    ]);

    expect(moduleFirst.rules).toEqual(layerFirst.rules);
    expect(moduleFirst.principles).toEqual(layerFirst.principles);
    expect(moduleFirst.componentShape).toEqual(layerFirst.componentShape);
    expect(moduleFirst.playbook).toEqual(layerFirst.playbook);
    expect(moduleFirst.architecture.naming).toEqual(layerFirst.architecture.naming);
  });

  it.each(factories)('maps container permissions to the module root for %s', (_framework, factory) => {
    const blueprint = factory({ topology: 'module-first' });
    const contexts = blueprint.architecture.layers.find(({ name }) => name === 'contexts');
    const services = blueprint.architecture.layers.find(({ name }) => name === 'services');

    expect(contexts?.allowedImporters).toEqual([
      { layer: 'hooks', selfOnly: true, description: 'Context only' },
    ]);
    expect(services?.allowedImporters).toEqual(['hooks', 'contexts']);
    expect(blueprint.architecture.layers.flatMap(({ allowedImporters = [] }) => allowedImporters))
      .not.toContain('containers');
  });
});
