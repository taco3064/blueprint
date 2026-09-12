import { describe, expect, it } from 'vitest';

import {
  convergenceStatus,
  evidenceMarker,
  matrixComplete,
  parseEvidenceMarker,
  releaseBlockerCount,
  renderEvidence,
  validateCandidateRun,
} from './field-convergence.mjs';
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

const candidate = { version: '4.0.0', sha256: 'b'.repeat(64), workflowUrl: 'https://github.com/taco3064/blueprint/actions/runs/1' };

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
    expect(body).toContain('repair PRs: #464');

    expect(parseEvidenceMarker(body)).toEqual({
      schemaVersion: 1,
      candidateSha: sha,
      scope: 'full',
      result: 'success',
      matrixComplete: true,
      releaseBlockers: 0,
    });

    expect(evidenceMarker(evidence)).toContain('blueprint-field-convergence');
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
  const status = (state = 'success', target = 'https://github.com/taco3064/blueprint/issues/452#issuecomment-123') => ({
    statuses: [{ context: 'blueprint/field-convergence', state, target_url: target }],
  });

  const comment = { body: renderEvidence(evidence, candidate) };

  it('accepts exact-SHA full convergence linked to the ticket comment', () => {
    expect(validateReleaseEvidence({ repository: 'taco3064/blueprint', sha, combinedStatus: status(), comment }))
      .toMatchObject({ issue: 452, comment: 123 });
  });

  it.each([
    ['missing', { statuses: [] }, comment],
    ['pending', status('pending'), comment],
    ['foreign URL', status('success', 'https://example.test/report'), comment],
    ['wrong SHA', status(), { body: renderEvidence({ ...evidence, candidateSha: 'c'.repeat(40) }, candidate) }],
    ['partial', status(), { body: renderEvidence({ ...evidence, scope: 'affected' }, candidate) }],
  ])('rejects %s evidence', (_name, combinedStatus, evidenceComment) => {
    expect(() => validateReleaseEvidence({
      repository: 'taco3064/blueprint',
      sha,
      combinedStatus,
      comment: evidenceComment,
    })).toThrow();
  });
});
