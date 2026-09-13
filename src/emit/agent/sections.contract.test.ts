import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../../config';
import { gateFacts, renderHardRules, renderPlacement } from './sections';

function blueprint(rules: Blueprint['rules']): Blueprint {
  return {
    framework: 'vue',
    architecture: {
      alias: '~app',
      layers: [{ name: 'components', does: 'UI' }],
    },
    rules,
  };
}

describe('agent section contract boundaries', () => {
  it('does not invent an exemption line for an empty test policy', () => {
    const architecture = { ...blueprint({}).architecture, testFiles: [] };

    expect(renderPlacement(architecture)).not.toContain('Stryker was here');
  });

  it('omits warning-tier and documentation-only rules from machine gates', () => {
    const input = blueprint({
      maxLines: { tier: 'warn', value: 400 },
      deadCode: 'error',
    });

    const out = renderHardRules(input);

    expect(gateFacts(input)).toEqual([]);

    expect(out).not.toContain('`maxLines`');
    expect(out).not.toContain('`deadCode`');
  });
});
