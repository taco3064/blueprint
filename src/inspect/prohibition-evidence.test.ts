import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureProhibitions } from './prohibitions';
import { observedProhibitions } from './prohibition-evidence';
import type { ProhibitionEvidence } from './prohibition-wiring';
import type { ProhibitionLintFinding } from './lint-runtime';

function fact(): ProhibitionEvidence {
  return { ...measureProhibitions({
    framework: 'react', architecture: { alias: '@', layers: [{
      name: 'domain', does: 'policy', mustNot: [{
        id: 'ui', description: 'UI', checks: [{ call: 'divIcon' }],
      }],
    }] },
  },
  { topDirs: [],
    files: [] })[0],
  gate: 'passed',
  affectsExit: false,
  lintIntegration: 'verified' };
}

function finding(severity: 'error' | 'warn' = 'error'): ProhibitionLintFinding {
  return { layer: 'domain', id: 'ui', filePath: path.resolve('src/domain/map.ts'),
    message: 'proven UI', severity, gate: severity === 'error' ? 'failed' : 'passed',
    affectsExit: severity === 'error', observation: severity === 'warn' };
}

function observed(entry: ProhibitionEvidence, findings?: ProhibitionLintFinding[]) {
  return observedProhibitions([entry], {
    status: 'passed', command: 'eslint .', errors: 0, warnings: 0, prohibitionFindings: findings,
  }, process.cwd())[0];
}

describe('observedProhibitions', () => {
  it.each(['error',
    'warn'] as const)('joins proven %s observations using actual lint severity',
    (severity) => {
      const entry = fact();

      entry.severity = severity === 'error' ? 'warn' : 'error';

      expect(observed(entry, [finding(severity)])).toMatchObject({
        gate: severity === 'error' ? 'failed' : 'passed', affectsExit: severity === 'error',
        observation: severity === 'warn', prohibitionFindings: [finding(severity)],
      });
    });

  it('preserves missing-check uncertainty beside observed errors and warnings', () => {
    const entry = fact();

    entry.status = 'partial';
    expect(observed(entry, [finding()])).toMatchObject({ status: 'partial', gate: 'failed' });

    expect(observed(entry, [finding('warn')])).toMatchObject({
      status: 'partial', gate: 'unverified', affectsExit: false, observation: true,
    });
  });

  it('preserves proven broken carriers and reference-only uncertainty beside warnings', () => {
    const entry = fact();

    entry.lintIntegration = 'failed';
    expect(observed(entry, [finding('warn')]).gate).toBe('failed');
    entry.lintIntegration = 'reference-only';
    expect(observed(entry, [finding('warn')]).gate).toBe('unverified');
  });

  it('does not assign absent, unknown-identity, other-entry, or other-position findings', () => {
    const entry = fact();
    const source = finding();

    expect(observed(entry)).toBe(entry);
    expect(observed(entry, [])).toBe(entry);
    expect(observed(entry, [{ ...source, layer: undefined, id: undefined }])).toBe(entry);
    expect(observed(entry, [{ ...source, id: 'another' }])).toBe(entry);
    expect(observed(entry, [{ ...source, filePath: path.resolve('src/ui/map.ts') }])).toBe(entry);
    entry.exempt = ['src/domain/map.ts'];
    expect(observed(entry, [source])).toBe(entry);
    entry.exempt = [];
    entry.ignores = ['src/domain/*.ts'];
    expect(observed(entry, [source])).toBe(entry);
  });

  it('retains both source severities and keeps error precedence', () => {
    expect(observed(fact(), [finding('warn'), finding()])).toMatchObject({
      gate: 'failed', affectsExit: true, prohibitionFindings: [finding('warn'), finding()],
    });
  });
});

it('keeps layer identity and matches any file net including hidden sources', () => {
  const entry = fact();
  const source = { ...finding(), filePath: path.resolve('src/domain/.hidden.ts') };

  entry.files = ['src/domain/**/*.js', 'src/domain/**/*.ts'];
  expect(observed(entry, [{ ...source, layer: 'other' }])).toBe(entry);
  expect(observed(entry, [source]).prohibitionFindings).toEqual([source]);
  entry.ignores = ['src/domain/*.ts'];
  expect(observed(entry, [source])).toBe(entry);
  entry.ignores = [];
  entry.exempt = ['src/domain/*.ts'];
  expect(observed(entry, [source])).toBe(entry);
});
