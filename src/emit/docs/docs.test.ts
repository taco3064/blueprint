import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitHandbook } from './docs';
import type { Blueprint } from '../../config';

function full(): Blueprint {
  return defineBlueprint({
    name: 'Acme',
    framework: 'auto',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI', owns: ['clsx'] },
        {
          name: 'services',
          does: 'net',
          owns: ['axios', { global: 'fetch' }],
          allowedImporters: [{ layer: 'components', selfOnly: true, description: 'net only' }],
        },
      ],
      flow: 'one-way',
      module: { layout: 'folder', entry: 'index', private: ['hooks', 'types'] },
      naming: { hook: 'useX + reactivity' },
    },
    principles: [{ id: 'p', say: 'split by responsibility', why: 'not by size', land: 'claude' }],
    rules: { noUtils: 'error' },
  });
}

describe('emitHandbook', () => {
  it('includes every section for a full blueprint', () => {
    const md = emitHandbook(full());

    for (const heading of [
      '# Acme — Architecture Handbook',
      '## Architecture',
      '## Module shape',
      '## Import discipline',
      '## Principles',
      '## Rules',
      '## Naming',
    ]) {
      expect(md).toContain(heading);
    }
  });

  it('omits sections with no data', () => {
    const minimal = defineBlueprint({
      framework: 'auto',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }],
        flow: 'one-way',
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    const md = emitHandbook(minimal);

    expect(md).toContain('## Architecture');
    expect(md).not.toContain('## Principles');
    expect(md).not.toContain('## Rules');
    expect(md).not.toContain('## Naming');
  });

  it('is deterministic', () => {
    expect(emitHandbook(full())).toBe(emitHandbook(full()));
  });
});
