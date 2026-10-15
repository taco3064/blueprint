import { renderAssessmentClaim, renderAssessmentNextStep } from '../operational-contract';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { LayerToModuleObligation } from '../project';
import { collectArchitectureFacts } from './facts';
import { assessTransformation } from './transformation-assessment';
import { reachAssessmentItems } from './assessment-reach';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-transform-assessment-'));

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

afterEach(() => fs.rmSync(path.join(root, 'src'), { recursive: true, force: true }));

function facts() {
  fs.mkdirSync(path.join(root, 'src/auth/components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/auth/components/Login.ts'), 'export const login = 1;');

  return collectArchitectureFacts(root, { framework: 'react', architecture: {
    alias: '@',
    modules: [{ name: 'auth', does: 'authentication' }],
    layers: [{ name: 'components', does: 'UI', layout: 'file' }],
  } }, { demand: 'application-scope' });
}

function obligation(): LayerToModuleObligation {
  return {
    version: 1, direction: 'layer-first-to-module-first',
    origin: { head: 'origin-head', topology: 'layer-first', applicationRoot: 'apps/web',
      selectedScope: 'src', sourceRoot: 'src', framework: 'react', router: null,
      sources: [
        { role: 'container-seed', unit: 'containers/Login', members: ['src/containers/Login.ts'] },
        { role: 'route-composition', unit: 'pages/Login', members: ['src/pages/Login.ts'] },
      ] },
    target: { topology: 'module-first', decisions: [
      { source: 'containers/Login', destinations: ['src/auth/components/Login.ts'],
        members: [{ source: 'src/containers/Login.ts',
          destination: 'src/auth/components/Login.ts' }] },
      { source: 'pages/Login', destinations: ['src/app/Login.ts'],
        members: [{ source: 'src/pages/Login.ts', destination: 'src/app/Login.ts' }] },
    ] },
  };
}

describe('assessTransformation', () => {
  it.each([{ failures: [] },
    { failures: [{ code: 'origin-head-changed' }] }])('binds decisions to bounded verification %j',
    ({ failures }) => {
      const origin = obligation();
      const measured = facts();
      const result = assessTransformation(origin, failures, measured);

      const sourceKey = JSON.stringify([origin.direction, origin.origin.head,
        origin.origin.selectedScope]);

      expect(result.scope).toBe('topology-transformation');

      expect(result.gates).toEqual({ status: failures.length ? 'failed' : 'passed',
        failed: failures.length ? 1 : 0, unverified: 0 });

      expect(result.items.find((item) => item.id === 'transformation-obligation')).toEqual({
        id: 'transformation-obligation', application: 'apps/web', sourceKey, subject: 'src',
        source: 'transformation-obligation', lane: 'gate',
        claim: renderAssessmentClaim('transformation-obligation'),
        status: failures.length ? 'failed' : 'passed', reach: null,
        limitations: ['bounded-workflow-record-not-semantic-proof',
          'current-config-gates-not-historical-proof'],
        signals: [], affectsExit: true, nextStep: null,
        evidence: { obligation: origin, failures, outsideScope: measured.outsideScope,
          analysis: measured.analysis, findings: measured.findings },
      });

      const decisions = result.items.filter((item) => item.id === 'transformation-decision');

      expect(decisions).toHaveLength(2);

      expect(decisions.map((item) => [item.sourceKey, item.status, item.nextStep,
        item.evidence])).toEqual(
        origin.origin.sources.map((source, index) => [JSON.stringify([sourceKey, source.unit]),
          failures.length ? 'review-required' : 'review-recorded',
          failures.length
            ? renderAssessmentNextStep('verify-transformation-decisions')
            : null,
          { origin: origin.origin, source,
            decisions: [origin.target.decisions[index]], failures }]),
      );

      expect(result.items.filter((item) => item.lane === 'reach')).toEqual(
        expect.arrayContaining(reachAssessmentItems('apps/web', measured, measured.coverage)),
      );
    });

  it('keeps unavailable source evidence visible independently of recorded decisions', () => {
    const measured = facts();

    measured.outsideScope = {
      status: 'unavailable', inventoryMode: 'none', reason: 'permission-denied',
    };

    const result = assessTransformation(obligation(), [], measured);

    expect(result.gates.status).toBe('passed');
    expect(result.headline).toBe('source-unverified');
    expect(result.reach.partial).toBe(1);
    expect(result.review).toEqual({ status: 'none-known', required: 0, recorded: 2 });

    expect(result.items.find((item) => item.id === 'outside-source-universe')).toMatchObject({
      status: 'unverified', reach: 'partial', evidence: measured.outsideScope,
    });
  });

  it('does not invent decision records when the bounded origin has no sources', () => {
    const origin = obligation();

    origin.origin.sources = [];
    origin.target.decisions = [];
    const result = assessTransformation(origin, [], facts());

    expect(result.items.filter((item) => item.lane === 'review')).toEqual([]);
    expect(result.review).toEqual({ status: 'none-known', required: 0, recorded: 0 });
  });
});
