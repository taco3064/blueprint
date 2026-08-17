import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitAgentContract } from './agent';
import type { Blueprint } from '../../config';

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
      folder: { layout: 'folder', entry: 'index', private: ['hooks'] },
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

  it('says where hand-written content goes relative to the markers (field #21)', () => {
    // When the generated file becomes the repo's only CLAUDE.md, "own notes
    // go outside the markers" was a convention the agent had to infer.
    expect(emitAgentContract(full())).toContain('OUTSIDE the markers');
  });

  it('omits the naming section when there is none', () => {
    const noNaming = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }],
        folder: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    expect(emitAgentContract(noNaming)).not.toContain('### Naming');
  });

  it('is deterministic', () => {
    expect(emitAgentContract(full())).toBe(emitAgentContract(full()));
  });
});

describe('emitAgentContract · joining the sections', () => {
  it('leaves no gap where a section rendered nothing', () => {
    // Several renderers return '' when the blueprint carries nothing for them.
    // Joining those in leaves a run of blank lines inside CLAUDE.md — and a later
    // init re-diffs them, because the marker block is rewritten each time.
    const minimal = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }],
        folder: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    expect(emitAgentContract(minimal)).not.toMatch(/\n{3,}/);
  });
});
