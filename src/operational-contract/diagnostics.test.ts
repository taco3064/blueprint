import { describe, expect, it } from 'vitest';

import {
  renderCoverageReport,
  renderDoctorCheck,
  renderDoctorReport,
  renderFindingMessage,
  renderMetricGateNote,
  renderSurveyScopeNote,
} from './index';

describe('operational diagnostic prose', () => {
  it('keeps failed, skipped, and passing doctor facts distinct', () => {
    const failed = renderDoctorCheck({
      kind: 'lint-entrypoint', reachable: false, reason: 'missing-lint',
    });

    const skipped = renderDoctorCheck({ kind: 'live-lint', status: 'unreachable' });
    const passed = renderDoctorCheck({ kind: 'config', present: true });

    expect(failed).toMatchObject({ ok: false, detail: expect.stringContaining('add one') });
    expect(skipped).toMatchObject({ ok: true, skipped: expect.stringContaining('red') });
    expect(passed).toEqual({ label: 'blueprint.config.mjs present', ok: true });

    expect(renderDoctorReport([passed], {})).toContain('Adoption complete');
    expect(renderDoctorReport([skipped], {})).toContain('Adoption unverified');
    expect(renderDoctorReport([failed], {})).toContain('Adoption incomplete');
  });

  it('renders finding actions from distinct measured facts', () => {
    expect(renderFindingMessage({
      kind: 'package-ownership',
      specifier: 'axios',
      names: ['get'],
      owners: ['services'],
      importer: 'pages',
    })).toBe('"axios" (get) is owned by services — not importable from "pages".');

    expect(renderFindingMessage({
      kind: 'missing-position', name: 'hooks', subject: 'layer',
    })).toContain('runway, not a todo');

    expect(renderFindingMessage({
      kind: 'relative-escape-entry', specifier: '../Card/impl', entry: 'index',
    })).toContain('what lives behind it is that unit\'s own business');
  });

  it('keeps vacuous coverage distinct from a reached architecture net', () => {
    const base = {
      sourceFiles: 2,
      outsideNets: [],
      activeRules: 1,
      gatedRules: 2,
    };

    expect(renderCoverageReport({ ...base, layerFiles: 0 }, 'next: add code'))
      .toContain('green gate proves nothing yet');

    expect(renderCoverageReport({ ...base, layerFiles: 2 }, 'next: unused'))
      .toContain('Coverage: 2/2');
  });

  it('keeps gate and survey scope facts explicit', () => {
    expect(renderMetricGateNote(true)).toContain('code lines only');
    expect(renderMetricGateNote(false)).toBe('plain threshold');

    expect(renderSurveyScopeNote({ kind: 'root-typescript-includes' }))
      .toContain('repository root');

    expect(renderSurveyScopeNote({ kind: 'workspace-applications' }))
      .toContain('--source-root');
  });
});
