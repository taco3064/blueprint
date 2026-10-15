import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { renderConsumerFiles } from './consumer-files';

const architecture: ArchitectureDef = {
  alias: '@',
  modules: [],
  layers: [{ name: 'components', does: 'Presentation.' }],
};

describe('external consumer guidance', () => {
  it.each([undefined, []])('omits absent or empty declarations: %j', (consumerFiles) => {
    expect(renderConsumerFiles({ ...architecture, consumerFiles }, '##')).toBe('');
  });

  it('preserves layer-first output even with declared patterns', () => {
    expect(renderConsumerFiles({
      ...architecture,
      modules: undefined,
      consumerFiles: '.storybook/preview.ts',
    }, '###')).toBe('');
  });

  it('renders the full directional contract with declared patterns only', () => {
    expect(renderConsumerFiles({
      ...architecture,
      consumerFiles: ['.storybook/preview.ts', 'e2e/**/*.{ts,tsx}'],
    }, '##')).toMatchSnapshot();
  });

  it('renders a single pattern and Agent heading without changing its coordinate system', () => {
    const sourceRoot = { ...architecture, sourceRoot: 'app/client', consumerFiles: 'tools/*.ts' };
    const agent = renderConsumerFiles(sourceRoot, '###');

    expect(agent).toBe(renderConsumerFiles(sourceRoot, '##').replace(/^## /, '### '));
    expect(agent).toContain('root): `tools/*.ts`.');
    expect(agent).not.toContain('app/client/tools');
  });
});
