import { expect, it } from 'vitest';

import { renderPackagedAgentContract } from './agent-contract';

it('renders the complete packaged operating discipline', () => {
  const contract = renderPackagedAgentContract();

  expect(contract).toContain('# Blueprint agent operating discipline');
  expect(contract).toContain('## The one-way flow');
  expect(contract).toContain('## Before you commit');
  expect(contract.endsWith('\n')).toBe(true);
});
