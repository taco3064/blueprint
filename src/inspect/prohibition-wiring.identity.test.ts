import { expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { plugin } from '../plugin';
import { resolveArchitecture } from '../config';
import { deriveAdoptionAssessment } from './adoption-assessment';
import { doctorAssessmentItems } from './assessment-runtime';
import { prohibitionDoctorChecks, verifyProhibitions } from './prohibition-wiring';
import type { ProhibitionEvidence } from './prohibition-wiring';

const fact: ProhibitionEvidence = {
  declarationSlot: 0, layer: 'domain', id: 'network', description: 'No network',
  mode: 'executable', status: 'active', checks: [], enforcedBy: 'lint', limitations: [],
  reach: 'covered', exempt: [], severity: 'error', ruleId: 'blueprint/must-not',
  position: 'shop/domain', files: ['src/shop/domain/*.js'], ignores: [],
  matchedFiles: ['src/shop/domain/A.js'], lintIntegration: 'verified', gate: 'passed',
  affectsExit: false,
};

it('preserves distinct probes and mixed gate evidence through Doctor assessment', () => {
  const facts: ProhibitionEvidence[] = [
    { ...fact, probeFile: 'src/shop/domain/A.js' },
    { ...fact, probeFile: 'src/shop/domain/B.js', status: 'partial', gate: 'unverified' },
    { ...fact, probeFile: 'src/shop/domain/C.js', status: 'unavailable', gate: 'unverified' },
    { ...fact, probeFile: 'src/shop/domain/D.js', severity: 'warn' },
    { ...fact, probeFile: 'src/shop/domain/E.js', gate: 'failed', affectsExit: true },
    fact,
    { ...fact, position: 'other/domain' },
    { ...fact, id: 'other-network' },
  ];

  const checks = prohibitionDoctorChecks(facts);

  expect(checks.map((check) => JSON.parse(check.sourceKey!))).toEqual([
    ['prohibition', 'shop/domain', 'network', 'src/shop/domain/A.js'],
    ['prohibition', 'shop/domain', 'network', 'src/shop/domain/B.js'],
    ['prohibition', 'shop/domain', 'network', 'src/shop/domain/C.js'],
    ['prohibition', 'shop/domain', 'network', 'src/shop/domain/D.js'],
    ['prohibition', 'shop/domain', 'network', 'src/shop/domain/E.js'],
    ['prohibition', 'shop/domain', 'network', null],
    ['prohibition', 'other/domain', 'network', null],
    ['prohibition', 'shop/domain', 'other-network', null],
  ]);

  const items = doctorAssessmentItems('.', checks);
  const assessment = deriveAdoptionAssessment('current-config-adoption', items);

  expect(assessment.items).toHaveLength(8);
  expect(assessment.gates).toEqual({ status: 'failed', failed: 1, unverified: 2 });
  expect(assessment.headline).toBe('blocked');

  expect(assessment.items.map((item) => item.evidence))
    .toEqual(expect.arrayContaining(checks));

  expect(deriveAdoptionAssessment('current-config-adoption', [...items].reverse()))
    .toEqual(assessment);

  expect(prohibitionDoctorChecks([{ ...facts[0], description: 'Reworded' }])[0].sourceKey)
    .toBe(checks[0].sourceKey);

  expect(deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems('.', checks.slice(0, 4))).gates)
    .toEqual({ status: 'unverified', failed: 0, unverified: 2 });
});

it('retains file identity on configuration exceptions beside successful probes', async () => {
  const blueprint: Blueprint = { framework: 'react', architecture: {
    alias: '@', layerFiles: 'src/{layer}/**/*.{js,jsx}', layers: [{ name: 'domain',
      does: 'policy', mustNot: [{ id: 'network', description: 'No network',
        checks: [{ call: 'fetch' }] }] }],
  } };

  const rules = { 'blueprint/must-not': ['error', {
    prohibitions: resolveArchitecture(blueprint.architecture, { framework: 'react' })
      .layers[0].prohibitions,
  }] };

  const facts = await verifyProhibitions({ root: '/repo', blueprint,
    scanResult: { topDirs: [], files: [] }, wired: true,
    load: async () => ({ ESLint: class {
      async calculateConfigForFile(file: string) {
        if (file.endsWith('.jsx')) {
          throw new Error('JSX unavailable');
        }

        return { rules, plugins: { blueprint: plugin } };
      }
    } }),
  });

  expect(facts.map(({ probeFile, gate, reason }) => ({ probeFile, gate, reason }))).toEqual([
    { probeFile: 'src/domain/__blueprint_probe__.js', gate: 'passed', reason: undefined },
    { probeFile: 'src/domain/__blueprint_probe__.jsx', gate: 'unverified',
      reason: 'Error: JSX unavailable' },
  ]);

  const checks = prohibitionDoctorChecks(facts);

  const assessment = deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems('.', checks));

  expect(assessment.items).toHaveLength(2);
  expect(assessment.gates).toEqual({ status: 'unverified', failed: 0, unverified: 1 });
  expect(assessment.items.map((item) => item.evidence)).toEqual(expect.arrayContaining(checks));
});
