import { describe, expect, it } from 'vitest';

import {
  convergenceStatus,
  evidenceMarker,
  matrixComplete,
  parseEvidenceMarker,
  releaseBlockerCount,
  renderEvidence,
  validateReportUrl,
} from './field-convergence.mjs';
import { validateCandidateRun } from './field-candidate.mjs';
import { validateChangesetsRelease } from './release-field-gate.mjs';

const sha = 'a'.repeat(40);

const evidence = {
  candidateSha: sha,
  scope: 'full',
  result: 'success',
  requiredScenarios: ['pure-admin×codex', 'pure-admin×claude'],
  findings: [],
  scenarios: ['pure-admin×codex', 'pure-admin×claude'],
  repairPrs: ['#464'],
  reportUrl: 'https://example.test/report',
};

const candidate = {
  version: '4.0.0',
  sha256: 'b'.repeat(64),
  workflowUrl: 'https://github.com/taco3064/blueprint/actions/runs/1',
  artifactUrl: 'https://github.com/taco3064/blueprint/actions/runs/1/artifacts/7',
};

describe('field convergence authority', () => {
  it('allows only a complete blocker-free full run to succeed', () => {
    expect(convergenceStatus(evidence).state).toBe('success');

    for (const patch of [
      { result: 'failure' },
      { scenarios: ['pure-admin×codex'] },
      { findings: [{ releaseBlocking: true, classification: 'Blueprint defect', summary: 'false green' }] },
    ]) {
      expect(convergenceStatus({ ...evidence, ...patch }).state).toBe('failure');
    }
  });

  it('derives release blockers from reviewed finding dispositions', () => {
    expect(releaseBlockerCount(evidence)).toBe(0);

    expect(releaseBlockerCount({
      ...evidence,
      findings: [
        { releaseBlocking: false, classification: 'adopter debt', summary: 'legacy cycle' },
        { releaseBlocking: true, classification: 'Blueprint defect', summary: 'false green' },
      ],
    })).toBe(1);
  });

  it('requires exact non-duplicated equality with the ticket-authorized matrix', () => {
    expect(matrixComplete(evidence)).toBe(true);
    expect(matrixComplete({ ...evidence, scenarios: ['pure-admin×codex'] })).toBe(false);

    expect(matrixComplete({
      ...evidence,
      scenarios: [...evidence.scenarios, evidence.scenarios[0]],
    })).toBe(false);

    expect(matrixComplete({ ...evidence, requiredScenarios: null })).toBe(false);
  });

  it('never turns an affected replay into release success', () => {
    expect(convergenceStatus({ ...evidence, scope: 'affected' })).toMatchObject({ state: 'pending' });
    expect(convergenceStatus({ ...evidence, scope: 'affected', result: 'failure' })).toMatchObject({ state: 'failure' });
  });

  it('renders durable candidate, matrix, repair, and report evidence', () => {
    const body = renderEvidence(evidence, candidate);

    expect(body).toContain(`candidate SHA: \`${sha}\``);
    expect(body).toContain(`candidate artifact: ${candidate.artifactUrl}`);
    expect(body).toContain('repair PRs: #464');

    expect(parseEvidenceMarker(body)).toEqual({
      schemaVersion: 1,
      candidateSha: sha,
      scope: 'full',
      result: 'success',
      matrixComplete: true,
      releaseBlockers: 0,
      reportUrl: 'https://example.test/report',
    });

    expect(evidenceMarker(evidence)).toContain('blueprint-field-convergence');
  });

  it('rejects missing, local, or credential-bearing report links', () => {
    expect(validateReportUrl(evidence.reportUrl)).toBe('https://example.test/report');

    for (const reportUrl of [undefined, 'field-report.json', 'file:///tmp/report.json', 'http://example.test/report', 'https://user:secret@example.test/report']) {
      expect(() => convergenceStatus({ ...evidence, reportUrl })).toThrow(/durable HTTPS report URL/);
    }
  });

  it('binds convergence to a completed successful main candidate workflow', () => {
    const manifest = { workflowRunId: '42', headSha: sha };

    expect(validateCandidateRun(manifest, {
      id: 42,
      event: 'push',
      head_branch: 'main',
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
    })).toBe(true);

    for (const patch of [
      { head_sha: 'b'.repeat(40) },
      { head_branch: 'feature' },
      { event: 'pull_request' },
      { status: 'in_progress' },
      { conclusion: 'failure' },
    ]) {
      expect(() => validateCandidateRun(manifest, {
        id: 42,
        event: 'push',
        head_branch: 'main',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        ...patch,
      })).toThrow();
    }
  });
});

describe('release Changesets SHA gate', () => {
  const valid = {
    version: '4.0.0',
    releaseFiles: [
      '.changeset/a.md',
      'CHANGELOG.md',
      'package-lock.json',
      'package.json',
    ],
    consumedChangesets: ['.changeset/a.md'],
    changelog: '# @kekkai/blueprint\n\n## 4.0.0\n\nRelease notes.\n',
    pendingChangesets: [],
    filesAfterRelease: [
      '.github/workflows/release.yml',
      '.agents/docs/field-triage.md',
      'AGENTS.md',
      'CHANGELOG.md',
      'scripts/release-field-gate.mjs',
      'scripts/field-convergence.test.mjs',
    ],
  };

  it('accepts a consumed Changesets release with only non-package follow-up changes', () => {
    expect(validateChangesetsRelease(valid)).toBe(true);
  });

  it.each([
    ['missing package version file', { releaseFiles: ['package-lock.json', 'CHANGELOG.md'] }],
    ['no consumed changeset', { consumedChangesets: [] }],
    ['missing changelog section', { changelog: '# @kekkai/blueprint\n\n## 3.2.0\n' }],
    ['pending changeset', { pendingChangesets: ['late-fix.md'] }],
    ['product changed after release prep', { filesAfterRelease: ['src/cli/bin.ts'] }],
    ['packaged README changed after release prep', { filesAfterRelease: ['README.md'] }],
  ])('rejects %s', (_name, patch) => {
    expect(() => validateChangesetsRelease({ ...valid, ...patch })).toThrow();
  });
});
