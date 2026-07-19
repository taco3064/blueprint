import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config/defineBlueprint';
import { emitAgentContract } from './main';
import type { Blueprint } from '../../config/types';

function full(): Blueprint {
  return defineBlueprint({
    name: 'Acme',
    framework: 'vue',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI', mustNot: ['import services'] },
        { name: 'services', does: 'net', owns: ['axios', { global: 'fetch' }] },
      ],
      flow: 'one-way',
      module: { layout: 'folder', entry: 'index', private: ['hooks'] },
      naming: { hook: 'useX' },
    },
    principles: [{ id: 'p', say: 'no utils', why: 'no cohesion', land: 'claude' }],
    rules: { maxLines: { tier: 'error', value: 400 } },
  });
}

describe('emitAgentContract', () => {
  it('includes every contract section', () => {
    const out = emitAgentContract(full());

    for (const heading of [
      '## Architecture contract',
      '### Context',
      '### Where code goes',
      '### Naming',
      '### Hard rules',
      '### Behavioral rules',
      '### Before you commit',
    ]) {
      expect(out).toContain(heading);
    }
  });

  it('never emits a top-level h1 (so it can nest in CLAUDE.md)', () => {
    expect(emitAgentContract(full())).not.toMatch(/^# /m);
  });

  it('omits the naming section when there is none', () => {
    const noNaming = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }],
        flow: 'one-way',
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    expect(emitAgentContract(noNaming)).not.toContain('### Naming');
  });

  it('is deterministic', () => {
    expect(emitAgentContract(full())).toBe(emitAgentContract(full()));
  });
});
