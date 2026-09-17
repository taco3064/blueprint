import { describe, expect, it } from 'vitest';

import { validateBlueprint } from '../operational-contract';
import { resolveArchitecture } from './resolved';
import type { ArchitectureDef, Blueprint, ModuleDef } from './types';

function architecture(modules?: ModuleDef[]): ArchitectureDef {
  return {
    alias: '~app',
    ...(modules === undefined ? {} : { modules }),
    layers: [
      { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
      { name: 'services', does: 'data access' },
    ],
  };
}

describe('resolveArchitecture · topology by modules presence', () => {
  it.each([
    { name: 'omitted', topology: 'layer-first', runway: false },
    { name: 'empty', modules: [], topology: 'module-first', runway: true },
    {
      name: 'reserved app only',
      modules: [{ name: 'app', does: 'router composition' }],
      topology: 'module-first',
      runway: true,
    },
    {
      name: 'a domain module',
      modules: [{ name: 'checkout', does: 'checkout' }],
      topology: 'module-first',
      runway: false,
    },
  ] as const)('classifies $name modules', (row) => {
    const modules: ModuleDef[] | undefined = row.modules && [...row.modules];
    const resolved = resolveArchitecture(architecture(modules));

    expect(resolved.topology).toBe(row.topology);
    expect(resolved.moduleRunway).toBe(row.runway);
  });

  it('keeps an empty runway closed-world with no positions or nets', () => {
    const resolved = resolveArchitecture(architecture([]));

    expect(resolved.layerPositions).toEqual([]);
    expect(resolved.resolveLayerRoots('components')).toEqual([]);
    expect(resolved.resolveLayerRoot('components')).toBeNull();
    expect(resolved.layerFiles('components', 'react')).toEqual([]);
    expect(resolved.containerFiles('react')).toEqual([]);
    expect(resolved.classify('src/main.tsx')).toEqual({ kind: 'source-root' });
    expect(resolved.classify('src/components/Button/index.tsx')).toBeNull();
    expect(resolved.classify('src/checkout/CheckoutScreen.tsx')).toBeNull();
  });

  it('never reads a layer-first top-level layer as a runway position', () => {
    const layerFirst = resolveArchitecture(architecture());

    expect(layerFirst.classify('src/components/Button/index.tsx'))
      .toMatchObject({ kind: 'unit', module: null });
  });
});

describe('validateBlueprint · the empty module runway', () => {
  function blueprint(modules: unknown): Blueprint {
    return {
      framework: 'react',
      architecture: { ...architecture(), modules: modules as ModuleDef[] },
    };
  }

  it('accepts modules: [] as a valid module-first runway', () => {
    const runway = blueprint([]);

    expect(validateBlueprint(runway)).toBe(runway);
  });

  it('holds module-first layerFiles placeholders on the runway', () => {
    const runway = blueprint([]);

    runway.architecture.layerFiles = 'src/{layer}/**/*.ts';

    expect(() => validateBlueprint(runway)).toThrow(/\{module\}/);

    runway.architecture.layerFiles = 'src/{module}/{layer}/**/*.ts';
    expect(validateBlueprint(runway)).toBe(runway);
  });

  it.each([null, {}, 'checkout'])('rejects non-array modules %j', (modules) => {
    expect(() => validateBlueprint(blueprint(modules)))
      .toThrow('architecture.modules must be an array when set — omit it for layer-first, or use '
        + '[] for a module-first runway with no domain module yet.');
  });
});
