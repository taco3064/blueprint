import { describe, expect, it } from 'vitest';

import { renderFieldPrompt, renderManualFieldPrompt } from './field-prompt';

describe('field prompt topology', () => {
  it.each(['layer-first', 'module-first'] as const)(
    'renders an explicit %s first-adoption target',
    (topology) => {
      const prompt = renderFieldPrompt({ topology });

      expect(prompt).toContain(`init --topology ${topology} --authoring`);
      expect(prompt).not.toContain('{{topology}}');
    },
  );

  it('keeps the manual artifact scenario-selectable', () => {
    const prompt = renderManualFieldPrompt();

    expect(prompt).toContain('init --topology <layer-first|module-first> --authoring');
    expect(prompt).not.toContain('{{topology}}');
  });
});
