import { expect, it } from 'vitest';
import { resolveProhibitions } from '../config';
import { renderRulesReport } from './rules';

it('includes the configured prohibition catalog with its identity and evidence status', () => {
  const prohibitions = resolveProhibitions({
    name: 'domain', does: 'policy', mustNot: [{
      id: 'ui', description: 'render UI', checks: [{ call: 'divIcon' }],
    }],
  });

  const catalog = {
    severity: 'error', structural: [], gates: [], bans: [], docsOnly: [],
  };

  const output = renderRulesReport({ ...catalog, prohibitions }, true);

  expect(output).toContain('\n\nMust-not prohibitions\n');
  expect(output).toContain('domain: ui: render UI');
  expect(output).toContain('reach: unmeasured; lint integration: unverified');
  expect(renderRulesReport(catalog, true)).not.toContain('Must-not prohibitions');
});
