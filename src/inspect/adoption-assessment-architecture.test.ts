import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { collectArchitectureFacts } from './facts';
import { architectureAssessmentItems } from './adoption-assessment-architecture';
import type { Finding } from './types';

let root: string;

const blueprint: Blueprint = {
  framework: 'react', architecture: { alias: '@', modules: [{ name: 'shop', does: 'Shopping' }],
    layers: [{ name: 'views', does: 'Presentation', layout: 'file',
      mustNot: ['Do not fetch', 'Do not persist'] }] },
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-architecture-assessment-'));
  fs.mkdirSync(path.join(root, 'src/shop/views'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/shop/views/A.ts'), 'export {};');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('preserves review-only declarations with empty measurements', () => {
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  const result = architectureAssessmentItems({ application: 'apps/shop', blueprint, facts,
    findings: [], prohibitions: [] });

  expect(result.map((item) => item.id)).toEqual([
    'architecture-coverage', 'import-analysis', 'must-not-review', 'must-not-review',
    'module-dependencies', 'layer-responsibility', 'module-ownership',
  ]);

  expect(result.map((item) => item.declarationOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(result.map((item) => item.application)).toEqual(Array(7).fill('apps/shop'));
  expect(result[2].sourceKey).not.toBe(result[3].sourceKey);

  expect(result[5].evidence).toEqual({ position: 'src/shop/views', does: 'Presentation',
    files: ['src/shop/views/A.ts'] });
});

it('retains suppressed graph drift as debt and does not synthesize it again', () => {
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  facts.moduleDependencies!.modules[0].missingDeclarations = ['other'];

  const finding: Finding = { rule: 'module-dependency-missing', path: 'src/shop',
    subject: 'other', message: 'missing', severity: 'warn' };

  const result = architectureAssessmentItems({ application: '.', blueprint, facts,
    findings: [], suppressed: [finding] });

  const drift = result.filter((item) => item.id === 'inspect-finding');

  expect(drift).toHaveLength(1);

  expect(drift[0]).toMatchObject({ lane: 'conformance', status: 'known-debt',
    affectsExit: false, evidence: finding });
});
