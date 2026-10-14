import { describe, expect, it } from 'vitest';
import { prohibitionLintFindings } from './lint-runtime';
import { liveLintCheck } from './doctor-lint';

describe('prohibitionLintFindings', () => {
  it('retains error and warning diagnostics with independent gate mapping', () => {
    const findings = prohibitionLintFindings(JSON.stringify([{
      filePath: '/repo/domain/a.ts', messages: [
        { ruleId: 'blueprint/must-not', severity: 2, message: 'domain ui: JSX' },
        { ruleId: 'blueprint/must-not', severity: 1, message: 'domain call: divIcon' },
        { ruleId: 'other', severity: 2, message: 'unrelated' },
        { ruleId: 'blueprint/must-not', severity: 0, message: 'off' },
      ],
    }]));

    expect(findings).toEqual({ prohibitionFindings: [
      { filePath: '/repo/domain/a.ts',
        message: 'domain ui: JSX',
        severity: 'error',
        gate: 'failed',
        observation: false,
        affectsExit: true },
      { filePath: '/repo/domain/a.ts',
        message: 'domain call: divIcon',
        severity: 'warn',
        gate: 'passed',
        observation: true,
        affectsExit: false },
    ] });

    const check = liveLintCheck({ status: 'passed',
      command: 'eslint .',
      errors: 0,
      warnings: 1,
      ...findings },
    {
      reachable: true,
      entrypoint: 'eslint .',
      reason: 'eslint-reachable',
      scriptPath: [],
      eslint: null,
    });

    expect(check.prohibitionFindings).toEqual(findings.prohibitionFindings);
    expect(check.ok).toBe(true);
  });

  it('does not invent findings when messages are absent or belong to other carriers', () => {
    expect(prohibitionLintFindings('[{}]')).toEqual({});
    expect(prohibitionLintFindings('[]')).toEqual({});
    expect(prohibitionLintFindings('[{"messages":[{"ruleId":"other","severity":1}]}]')).toEqual({});
  });

  it('retains a matching diagnostic even without optional formatter text', () => {
    const output = '[{"messages":[{"ruleId":"blueprint/must-not","severity":1}]}]';

    expect(prohibitionLintFindings(output)).toEqual({
      prohibitionFindings: [{ filePath: '',
        message: '',
        severity: 'warn',
        gate: 'passed',
        observation: true,
        affectsExit: false }],
    });
  });
});
