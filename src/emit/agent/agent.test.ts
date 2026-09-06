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
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    expect(emitAgentContract(noNaming)).not.toContain('### Naming');
  });

  it('hands the stack fact to whichever contract it renders', () => {
    // `compact` picks the renderer; the stack facts are what remains of the bag and
    // must reach either one. Dropped on one branch the defect is invisible — the two
    // documents ship side by side and only one over-promises. `explicitAny` is the
    // gate this decides: `any` is a TypeScript construct with no core rule behind it,
    // and a blueprint does not carry the dependency list that settles it.
    const bp = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }],
        module: { layout: 'folder', entry: 'index', private: [] },
      },
      rules: { explicitAny: 'error', maxLines: { tier: 'error', value: 400 } },
    });

    // The full contract gives each hard gate a bullet; the compact block lists them in
    // one clause. Both forms are pinned, so a drop cannot be mistaken for a re-wording.
    const forms = [
      [false, '- `explicitAny` is a hard gate.'],
      [true, '`explicitAny`, `maxLines` = 400 fail the project\'s lint run'],
    ] as const;

    for (const [compact, named] of forms) {
      expect(emitAgentContract(bp, { compact, hasTypescript: false }))
        .not.toContain('explicitAny');

      // Both directions, or the fact passes by never emitting the gate at all — and
      // the caller that supplies nothing keeps it, since an emitter told nothing would
      // otherwise strip a gate a TypeScript project genuinely holds.
      for (const stack of [{ hasTypescript: true }, {}]) {
        expect(emitAgentContract(bp, { compact, ...stack })).toContain(named);
      }
    }
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
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    expect(emitAgentContract(minimal)).not.toMatch(/\n{3,}/);
  });
});
