import { expect, it } from 'vitest';
import { renderPlacement } from './agent';

it('does not invent a must-not clause for an unconstrained placement', () => {
  const output = renderPlacement({
    alias: '@', layers: [
      { name: 'views', does: 'present UI' },
      { name: 'domain', does: 'policy', mustNot: ['render UI'] },
    ],
  });

  expect(output.split('\n').find((line) => line.startsWith('- `src/views/`')))
    .toBe('- `src/views/` — layer: present UI.');

  expect(output).toContain('MUST NOT: render UI [review only; no machine carrier].');
});
