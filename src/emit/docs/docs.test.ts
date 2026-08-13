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
        { name: 'components', does: 'UI', owns: ['clsx'], layout: 'folder' },
        {
          name: 'services',
          does: 'net',
          owns: ['axios', { global: 'fetch' }],
          layout: 'folder',
          allowedImporters: [{ layer: 'components', selfOnly: true, description: 'net only' }],
        },
      ],
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
        layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
      },
    });

    const md = emitHandbook(minimal);

    expect(md).toContain('## Architecture');
    expect(md).not.toContain('## Principles');
    expect(md).not.toContain('## Rules');
    expect(md).not.toContain('## Naming');
  });

  // The Enforced-by column asks, per row, whether THIS blueprint can open the gate at
  // all, and two facts decide it: the framework (`deepWatch` never emits on React) and
  // `testFiles` (`testFilename` has no scope when nothing is exempt). `sections.test.ts`
  // asserts the renderer with those facts handed to it; nothing asserted that
  // `emitHandbook` hands them over. Losing them is silent and reads as `lint` — the
  // table claiming a machine holds a rule the emitted config does not contain, in the
  // document that outlives the adoption (field run #150). One assertion per fact,
  // because the two arms are independent and either could be dropped alone.
  it('hands the rules table both facts that decide whether a gate can emit', () => {
    const layer = { name: 'components', does: 'UI' };

    const onReact = emitHandbook(defineBlueprint({
      framework: 'react',
      architecture: { alias: '~app', layers: [layer] },
      rules: { deepWatch: 'error' },
    }));

    expect(onReact).toContain('nothing — Vue only');

    const exemptingNothing = emitHandbook(defineBlueprint({
      framework: 'vue',
      architecture: { alias: '~app', layers: [layer], testFiles: [] },
      rules: { testFilename: 'error' },
    }));

    expect(exemptingNothing).toContain('`architecture.testFiles: []` exempts nothing');
  });

  it('describes the diagram notation once, and the diagram matches it', () => {
    // The fixture declares a selfOnly importer, so both halves render: the legend under
    // the diagram and the selfOnly rule in the discipline bullets. They disagreed — the
    // bullet called it "a dashed edge" while the legend says a SOLID edge carries
    // selfOnly and a dotted one records declaration order only. One document, two
    // answers, and the wrong one points at the edges that are explicitly NOT
    // dependencies. Neither half was asserted, so it shipped.
    const md = emitHandbook(full());

    // The legend's vocabulary is solid/dotted. "dashed" anywhere is a second vocabulary
    // for one drawing, which is how these drifted apart.
    expect(md).not.toContain('dashed');

    // One explanation of the notation, in the legend that owns it.
    expect(md.match(/\bsolid\b/g) ?? []).toHaveLength(1);
    expect(md.match(/\bdotted\b/g) ?? []).toHaveLength(1);

    // And the legend is not describing a drawing the diagram does not produce: this
    // config's selfOnly edge really is solid, and really is labelled.
    expect(md).toContain('components -->|net only · selfOnly| services');
  });

  it('is deterministic', () => {
    expect(emitHandbook(full())).toBe(emitHandbook(full()));
  });
});

describe('emitHandbook · joining the sections', () => {
  it('leaves no gap where a section rendered nothing', () => {
    // Same shape as the agent contract: a renderer with nothing to say returns
    // '', and joining it in leaves blank lines in the published handbook.
    const minimal = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
      },
    });

    expect(emitHandbook(minimal)).not.toMatch(/\n{3,}/);
  });
});
