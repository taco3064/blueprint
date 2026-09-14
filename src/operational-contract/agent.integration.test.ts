import { describe, expect, it } from 'vitest';

import { renderCompactContract, renderHardRules, renderImportDiscipline } from '.';
import type { Blueprint } from '../config';

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
  },
};

describe('measured lint integration contracts', () => {
  it.each([
    ['verified', 'verified alive', 'verified alive'],
    ['reference-only', 'not enforced', 'not a project-lint gate yet'],
    ['unverified', 'unverified', 'not yet verified alive'],
  ] as const)('bounds every durable surface to %s', (lintIntegration, statement, hardStatement) => {
    expect(renderCompactContract(blueprint, {
      gates: [], handbook: 'HANDBOOK.md', lintIntegration,
    })).toContain(statement);

    expect(renderHardRules(blueprint, [
      { id: 'unusedVars', setting: 'error', holder: 'lint' },
    ], lintIntegration)).toContain(hardStatement);

    expect(renderImportDiscipline(blueprint.architecture, lintIntegration)).toContain(statement);
  });
});
