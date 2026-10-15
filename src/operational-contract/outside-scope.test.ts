import { describe, expect, it } from 'vitest';
import {
  renderOutsideScopeAnalysis, renderOutsideScopeDoctorCheck, renderOutsideScopeError,
} from './outside-scope';
import { renderArchitectureReport } from './inspect';
import type { OutsideScopeView } from './outside-scope';

const healthy = { status: 'healthy' as const, scannedFiles: 0, parsedFiles: 0,
  unknownDynamicImports: 0, parseFailures: [] };

describe('outside scope output', () => {
  it('explains unrequested evidence without claiming an inventory was measured', () => {
    const text = renderOutsideScopeAnalysis({ status: 'not-requested' });

    expect(text).toContain('was not requested');
    expect(text).toContain('Collect full architecture facts');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('Application scope:');
  });

  it('keeps topology exclusions silent without inventing a failed check', () => {
    const fact = { status: 'not-applicable' as const, reason: 'layer-first' };

    expect(renderOutsideScopeAnalysis(fact)).toBeUndefined();
    expect(renderOutsideScopeDoctorCheck(fact)).toBeUndefined();

    expect(renderArchitectureReport([], { importGraph: healthy, outsideScope: fact }))
      .toContain('Architecture Success');
  });

  it('reports complete Git evidence without fallback or unresolved prescriptions', () => {
    const fact = { status: 'complete' as const, inventoryMode: 'git-visible', limitations: [] };

    expect(renderOutsideScopeAnalysis(fact)).toBe('Application scope: complete (git-visible).');

    expect(renderOutsideScopeDoctorCheck(fact)).toEqual({
      label: 'Application source scope', ok: true,
      detail: 'Application scope: complete (git-visible).',
    });

    expect(renderArchitectureReport([], { importGraph: healthy, outsideScope: fact }))
      .toContain('Architecture Success');
  });

  it('explains the complete filesystem population and why fallback costs more', () => {
    const fact = { status: 'complete' as const, inventoryMode: 'filesystem-fallback',
      fallbackReason: 'not a worktree', limitations: [] };

    const text = renderOutsideScopeAnalysis(fact);

    expect(text).toContain('all supported outside source');
    expect(text).toContain('may cost more');
    expect(text).toContain('not a worktree');
    expect(text).toContain('Restore Git visibility');
    expect(renderOutsideScopeDoctorCheck(fact)?.ok).toBe(true);
  });

  it.each<OutsideScopeView>([
    { status: 'not-requested' },
    { status: 'unavailable', inventoryMode: 'git-visible', reason: 'inventory refused' },
    { status: 'partial', inventoryMode: 'git-visible',
      limitations: ['a.ts parse failed', 'b.ts dynamic'] },
  ])('never declares incomplete evidence successful: $status', (fact) => {
    expect(renderOutsideScopeDoctorCheck(fact)?.ok).toBe(false);
    const report = renderArchitectureReport([], { importGraph: healthy, outsideScope: fact });

    expect(report).not.toContain('Architecture Success');
    expect(report).toContain(fact.status);
    expect(report).toContain(renderOutsideScopeAnalysis(fact));
  });

  it('retains every limitation and the unavailable reason', () => {
    expect(renderOutsideScopeAnalysis({ status: 'partial', inventoryMode: 'git-visible',
      limitations: ['a.ts parse failed', 'b.ts dynamic'] }))
      .toContain('a.ts parse failed; b.ts dynamic');

    expect(renderOutsideScopeAnalysis({ status: 'unavailable', inventoryMode: 'none',
      reason: 'inventory refused' })).toContain('inventory refused');
  });

  it('includes scope evidence alongside existing findings', () => {
    const text = renderArchitectureReport([{
      severity: 'error', rule: 'uncovered-application-source',
      path: 'src', message: 'outside relation' }], { importGraph: healthy,
      outsideScope: { status: 'partial', inventoryMode: 'git-visible', limitations: ['a.ts'] } });

    expect(text).toContain('outside relation');
    expect(text).toContain('Application scope: partial');
  });
});

describe('doctor scope facts transport', () => {
  it('preserves deterministic measured facts only when supplied', async () => {
    const { renderDoctorReport } = await import('./doctor-report');

    const architectureFacts = {
      outsideScope: { status: 'complete' as const, inventoryMode: 'git-visible', limitations: [] },
      governedWork: { inventoryFiles: 2, readFiles: 2, parsedFiles: 2 },
      importAnalysis: healthy,
      applicationScope: [{ rule: 'uncovered-application-source', path: 'src', subject: 'tools' }],
    };

    expect(JSON.parse(renderDoctorReport([], { json: true, architectureFacts })).architectureFacts)
      .toEqual(architectureFacts);

    expect(JSON.parse(renderDoctorReport([], { json: true })))
      .not.toHaveProperty('architectureFacts');
  });
});

it('distinguishes inventory failure from absent demanded evidence', () => {
  expect(renderOutsideScopeError('inventory'))
    .toBe('Git outside-source inventory could not be collected.');

  expect(renderOutsideScopeError('not-requested'))
    .toBe('Application-scope analysis requires outside-scope evidence.');
});

it('renders baseline refusal from measured scope and import health', async () => {
  const { renderScopeBaselineRefusal } = await import('./inspect');

  const partial = { status: 'partial' as const, inventoryMode: 'git-visible',
    limitations: ['unknown target'] };

  expect(renderScopeBaselineRefusal(healthy, partial)).not.toContain('Import analysis is healthy');
  expect(renderScopeBaselineRefusal(healthy, partial)).toContain('unknown target');

  const failed = { ...healthy, status: 'failed' as const,
    parseFailures: [{ path: 'broken.ts', message: 'syntax' }] };

  expect(renderScopeBaselineRefusal(failed, partial)).toContain('Import analysis is failed');
  expect(renderScopeBaselineRefusal(failed, partial)).toContain('unknown target');

  expect(renderScopeBaselineRefusal(failed, { status: 'not-applicable', reason: 'layer-first' }))
    .not.toContain('Application scope');
});

it('keeps baseline success and fallback evidence in one output', async () => {
  const { renderOutsideScopeOutput } = await import('./outside-scope');

  expect(renderOutsideScopeOutput('Baseline updated', {
    status: 'not-applicable', reason: 'layer-first',
  })).toBe('Baseline updated');

  const output = renderOutsideScopeOutput('Baseline updated', {
    status: 'complete', inventoryMode: 'filesystem-fallback', limitations: [],
    fallbackReason: 'no worktree',
  });

  expect(output).toContain('Baseline updated\nApplication scope: complete');
  expect(output).toContain('no worktree');
});
