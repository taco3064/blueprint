import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import {
  expectedContainerStructural,
  expectedStructural,
  wiringCheck,
} from './wiring';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    additionalAliases: { '~billing': 'src/billing' },
    modules: [
      { name: 'account', does: 'accounts', dependsOn: ['billing'] },
      { name: 'billing', does: 'billing' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'hooks', does: 'state' },
    ],
  },
};

function structuralRules(): Record<string, unknown> {
  const expected = blueprint.architecture.modules!.flatMap((module) => [
    expectedContainerStructural(blueprint, module.name),
    ...blueprint.architecture.layers.map((layer) =>
      expectedStructural(blueprint, layer.name, module.name)),
  ]);

  const groups = new Set(expected.flatMap((entry) => [...entry.groups]));
  const paths = new Set(expected.flatMap((entry) => [...entry.paths]));

  return {
    'blueprint/relative-escape': 'error',
    'blueprint/import-boundary': ['error', { architecture: blueprint.architecture }],
    'no-restricted-imports': [2, {
      patterns: [...groups].map((group) => ({ group: JSON.parse(group) as string[] })),
      paths: [...paths].map((name) => ({ name })),
    }],
  };
}

async function check(rules: Record<string, unknown>) {
  return (await wiringCheck({
    root: '/repo',
    blueprint,
    scanResult: { topDirs: [], files: [] },
    wired: true,
    merged: true,
    hasTypescript: true,
    load: async () => ({
      ESLint: class {
        calculateConfigForFile(): unknown {
          return { rules };
        }
      },
    }),
  })).check;
}

describe('wiringCheck · import-boundary carrier', () => {
  it('accepts the intact policy on module layers and containers', async () => {
    expect((await check(structuralRules())).ok).toBe(true);
  });

  it.each([
    ['removed', undefined],
    ['off', ['off', { architecture: blueprint.architecture }]],
    [
      'weakened',
      ['error', { architecture: { ...blueprint.architecture, additionalAliases: {} } }],
    ],
    ['malformed', ['error', {}]],
  ])('rejects a %s import-boundary policy', async (_label, replacement) => {
    const rules = structuralRules();

    if (replacement === undefined) {
      delete rules['blueprint/import-boundary'];
    } else {
      rules['blueprint/import-boundary'] = replacement;
    }

    const result = await check(rules);

    expect(result.ok).toBe(false);

    expect(result.detail).toContain(
      'blueprint/import-boundary is missing, off, or its architecture policy was weakened',
    );
  });
});
