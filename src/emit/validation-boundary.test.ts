import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { emitAgentFiles } from './agent';
import { emitHandbook } from './docs';
import { emitLint } from './lint';

const invalidBlueprint: Blueprint = {
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [{ name: 'components', does: 'UI', layout: 'folder', entry: 'index' }],
    modules: [{ name: 'checkout', does: 'Checkout', dependsOn: ['missing'] }],
  },
};

describe('public emitter validation boundary', () => {
  it.each([emitLint, emitHandbook, emitAgentFiles])('rejects conflicting aliases', (emit) => {
    const blueprint: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        additionalAliases: { '~app': 'src/other' },
        layers: [{ name: 'components', does: 'UI' }],
      },
    };

    expect(() => emit(blueprint)).toThrow(/Canonical alias "~app"/);
  });

  it.each([
    ['emitLint', () => emitLint(invalidBlueprint)],
    ['emitHandbook', () => emitHandbook(invalidBlueprint)],
    ['emitAgentFiles', () => emitAgentFiles(invalidBlueprint)],
  ])('renders structured config errors from %s', (_name, emit) => {
    expect(emit).toThrow(
      'Module "checkout" depends on unknown module "missing" — '
      + 'declare that module in architecture.modules or remove the edge.',
    );
  });
});
