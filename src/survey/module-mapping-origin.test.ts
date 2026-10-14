import { describe, expect, it } from 'vitest';

import type { LayerToModuleObligation } from '../project';
import { originContainerUnits, rootRestoration } from './module-mapping-origin';

function origin(): LayerToModuleObligation {
  return {
    version: 1,
    direction: 'layer-first-to-module-first',
    origin: {
      head: 'abc', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      layers: [{ name: 'containers', does: 'composition', layout: 'folder', entry: 'Screen' }],
      sources: [{
        role: 'container-seed', unit: 'containers/Account',
        members: ['src/containers/Account/Screen.tsx', 'src/containers/Account/logic.ts'],
      }, {
        role: 'container-seed', unit: 'containers/Baby',
        members: ['src/containers/Baby/Screen.tsx'],
      }],
    },
    target: {
      topology: 'module-first',
      decisions: [{
        source: 'containers/Account',
        destinations: ['src/babyoasis/index.tsx', 'src/babyoasis/logic.ts'],
        members: [{
          source: 'src/containers/Account/Screen.tsx', destination: 'src/babyoasis/index.tsx',
        }, {
          source: 'src/containers/Account/logic.ts', destination: 'src/babyoasis/logic.ts',
        }],
      }, {
        source: 'containers/Baby', destinations: ['src/babyoasis/Baby.tsx'],
        members: [{
          source: 'src/containers/Baby/Screen.tsx', destination: 'src/babyoasis/Baby.tsx',
        }],
      }],
    },
  };
}

function restoration(
  record: LayerToModuleObligation | undefined, source = 'src/babyoasis/index.tsx',
) {
  return rootRestoration({
    source, fallback: 'src/containers/babyoasis/index.tsx', origin: record,
    recorded: originContainerUnits(record, 'src'),
  });
}

describe('retained member restoration authority', () => {
  it('restores custom entries and distinct merged units by exact member pairs', () => {
    expect([...originContainerUnits(origin(), 'src')]).toEqual([
      ['src/babyoasis/index.tsx', {
        destination: 'src/containers/Account/Screen.tsx',
        restoration: 'restored-from-origin', originUnit: 'containers/Account',
      }],
      ['src/babyoasis/logic.ts', {
        destination: 'src/containers/Account/logic.ts',
        restoration: 'restored-from-origin', originUnit: 'containers/Account',
      }],
      ['src/babyoasis/Baby.tsx', {
        destination: 'src/containers/Baby/Screen.tsx',
        restoration: 'restored-from-origin', originUnit: 'containers/Baby',
      }],
    ]);
  });

  it('uses the deterministic proposal only when origin is absent', () => {
    expect(restoration(undefined)).toEqual({
      destination: 'src/containers/babyoasis/index.tsx', restoration: 'fallback-no-origin',
    });

    expect(originContainerUnits(null, 'src')).toEqual(new Map());

    expect(restoration(origin(), 'src/babyoasis/new.ts')).toEqual({
      restoration: 'requires-decision', reason: 'unmapped-origin-member',
    });

    expect(restoration(origin(), 'src/babyoasis/Index.tsx')).toEqual({
      restoration: 'requires-decision', reason: 'unmapped-origin-member',
    });
  });
});

describe('retained member restoration invalid evidence', () => {
  const invalid: [string, (record: LayerToModuleObligation) => void, string][] = [
    ['duplicate unit', (record) => {
      record.origin.sources.push(record.origin.sources[0]);
    }, 'unproven-origin-unit'],
    ['unknown unit', (record) => {
      record.target.decisions[0].source = 'containers/Missing';
    }, 'unproven-origin-unit'],
    ['router unit', (record) => {
      record.origin.sources[0].role = 'route-composition';
    }, 'unproven-origin-unit'],
    ['unknown member', (record) => {
      record.origin.sources[0].members.shift();
    }, 'unproven-origin-member'],
    ['multiply owned member', (record) => {
      record.origin.sources[1].members.push(record.origin.sources[0].members[0]);
    }, 'unproven-origin-member'],
    ['undeclared destination', (record) => {
      record.target.decisions[0].destinations.shift();
    }, 'ambiguous-member-mapping'],
    ['one source to two destinations', (record) => {
      record.target.decisions[0].members.push({
        source: record.origin.sources[0].members[0], destination: 'src/babyoasis/another.ts',
      });
    }, 'ambiguous-member-mapping'],
    ['two sources to one destination', (record) => {
      record.target.decisions[1].members[0].destination = 'src/babyoasis/index.tsx';
      record.target.decisions[1].destinations = ['src/babyoasis/index.tsx'];
    }, 'ambiguous-member-mapping'],
    ['case-insensitive target reuse', (record) => {
      record.target.decisions[1].members[0].destination = 'src/babyoasis/Index.tsx';
      record.target.decisions[1].destinations = ['src/babyoasis/Index.tsx'];
    }, 'ambiguous-member-mapping'],
    ['missing layer inventory', (record) => {
      delete record.origin.layers;
    }, 'missing-origin-layer'],
    ['missing containers layer', (record) => {
      record.origin.layers = [{ name: 'pages', does: 'routes' }];
    }, 'missing-origin-layer'],
    ['member outside unit', (record) => {
      record.origin.sources[0].unit = 'containers/Other';
      record.target.decisions[0].source = 'containers/Other';
    }, 'origin-unit-member-mismatch'],
    ['non-container unit address', (record) => {
      record.origin.sources[0].unit = 'other/Account';
      record.target.decisions[0].source = 'other/Account';
    }, 'unsafe-origin-member'],
  ];

  it.each(invalid)('requires a decision for %s', (_name, change, reason) => {
    const record = origin();

    change(record);
    expect(restoration(record)).toEqual({ restoration: 'requires-decision', reason });
  });

  it.each(['/outside.ts', '../outside.ts', 'src/../outside.ts', 'other/Screen.tsx'])(
    'rejects an unsafe or out-of-scope origin source %s', (source) => {
      const record = origin();

      record.origin.sources[0].members[0] = source;
      record.target.decisions[0].members[0].source = source;

      expect(restoration(record)).toEqual({
        restoration: 'requires-decision', reason: 'unsafe-origin-member',
      });
    },
  );

  it.each(['/outside.ts', '../outside.ts', 'src/../outside.ts', 'other/Screen.tsx'])(
    'does not match an unsafe or out-of-scope recorded destination %s', (destination) => {
      const record = origin();

      record.target.decisions[0].members[0].destination = destination;
      record.target.decisions[0].destinations[0] = destination;

      expect(restoration(record)).toEqual({
        restoration: 'requires-decision', reason: 'unmapped-origin-member',
      });
    },
  );
});

describe('retained origin layout', () => {
  it.each(['file', undefined] as const)('restores flat units with layout %s', (layout) => {
    const record = origin();

    record.origin.layers![0].layout = layout;
    record.origin.sources[0].members[0] = 'src/containers/Account.tsx';
    record.target.decisions[0].members[0].source = 'src/containers/Account.tsx';

    expect(restoration(record)).toEqual({
      destination: 'src/containers/Account.tsx',
      restoration: 'restored-from-origin', originUnit: 'containers/Account',
    });

    expect(restoration(record, 'src/babyoasis/logic.ts')).toEqual({
      restoration: 'requires-decision', reason: 'origin-unit-member-mismatch',
    });
  });

  it('relocates a recorded source root without inventing a new unit identity', () => {
    const record = origin();
    const entries = [...originContainerUnits(record, '.')];

    expect(entries[0]).toEqual(['babyoasis/index.tsx', {
      destination: 'containers/Account/Screen.tsx',
      restoration: 'restored-from-origin', originUnit: 'containers/Account',
    }]);
  });
});
