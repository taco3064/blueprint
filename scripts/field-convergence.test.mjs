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
import { validateReleaseEvidence } from './release-field-gate.mjs';

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

describe('release field gate', () => {
  const repository = 'taco3064/blueprint';
  const linked = 'https://github.com/taco3064/blueprint/issues/521#issuecomment-123';

  const status = (state = 'success', target = linked) => ({
    statuses: [
      { context: 'ci/other', state: 'success', target_url: 'https://example.test/ci' },
      { context: 'blueprint/field-convergence', state, target_url: target },
    ],
  });

  const comment = (body = renderEvidence(evidence, candidate), htmlUrl = linked) => ({
    body,
    html_url: htmlUrl,
  });

  const open = { state: 'open' };

  const gate = (patch = {}) => validateReleaseEvidence({
    repository,
    sha,
    combinedStatus: status(),
    comment: comment(),
    ticket: open,
    ...patch,
  });

  it('accepts exact-SHA full convergence linked to its open ticket comment', () => {
    expect(gate()).toMatchObject({
      issue: 521,
      comment: 123,
      evidence: { candidateSha: sha, scope: 'full', matrixComplete: true, releaseBlockers: 0 },
    });
  });

  it.each([
    ['a missing status', { combinedStatus: { statuses: [] } }, /No blueprint\/field-convergence status/],
    ['a pending status', { combinedStatus: status('pending') }, /is pending, not success/],
    ['a failed status', { combinedStatus: status('failure') }, /is failure, not success/],
    ['a non-comment link', { combinedStatus: status('success', 'https://example.test/report') }, /does not link/],
    [
      'a foreign repository comment',
      { combinedStatus: status('success', 'https://github.com/someone/else/issues/521#issuecomment-123') },
      /does not link/,
    ],
    ['a comment the status does not link to', { comment: comment(undefined, `${linked}9`) }, /not the one the status links to/],
    ['a closed ticket', { ticket: { state: 'closed' } }, /#521 is not open/],
  ])('rejects %s', (_name, patch, message) => {
    expect(() => gate(patch)).toThrow(message);
  });

  it('never trusts a green status whose comment carries no valid evidence', () => {
    expect(() => gate({ comment: comment('Field convergence passed.') }))
      .toThrow(/no machine-readable evidence marker/);

    expect(() => gate({ comment: comment('<!-- blueprint-field-convergence {"scope":"full"} -->') }))
      .toThrow(/different candidate SHA/);
  });

  it.each([
    ['a different candidate SHA', { candidateSha: 'c'.repeat(40) }, /different candidate SHA/],
    ['an affected replay', { scope: 'affected' }, /successful complete full matrix/],
    ['a failed full run', { result: 'failure' }, /successful complete full matrix/],
    ['an incomplete matrix', { scenarios: ['pure-admin×codex'] }, /successful complete full matrix/],
    [
      'a release blocker',
      { findings: [{ releaseBlocking: true, classification: 'Blueprint defect', summary: 'false green' }] },
      /successful complete full matrix/,
    ],
  ])('rejects evidence from %s', (_name, patch, message) => {
    expect(() => gate({ comment: comment(renderEvidence({ ...evidence, ...patch }, candidate)) }))
      .toThrow(message);
  });

  it('rejects evidence without a durable HTTPS report', () => {
    const marker = evidenceMarker(evidence);

    for (const body of [
      marker.replace(/,"reportUrl":"[^"]+"/, ''),
      marker.replace('https://example.test/report', 'http://example.test/report'),
    ]) {
      expect(() => gate({ comment: comment(body) })).toThrow(/durable HTTPS report URL/);
    }
  });
});
