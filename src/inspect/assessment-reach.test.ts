import { renderAssessmentClaim } from '../operational-contract';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectArchitectureFacts } from './facts';
import type { ArchitectureFacts } from './facts';
import type { OutsideScopeEvidence } from './types';
import { reachAssessmentItems } from './assessment-reach';

let root: string;
let facts: ArchitectureFacts;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-reach-assessment-'));

  facts = collectArchitectureFacts(root, {
    framework: 'react', architecture: { alias: '@', modules: [],
      layers: [{ name: 'views', does: 'Presentation', layout: 'file' }] },
  }, { demand: 'governed-source' });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const collection = {
  inventoryMode: 'filesystem-fallback', files: [], directoryWalks: 3,
  inventoryFiles: 2, readFiles: 2, parsedFiles: 1, testFilesExcluded: 1,
  contributions: { repositoryVisible: 0, explicitConsumerRoot: 1, governedReference: 1 },
  limitations: ['bounded-fallback'], fallbackReason: 'git unavailable',
} as const;

it.each([
  [{ status: 'not-requested' }, 'unverified', 'partial',
    ['internal-evidence-demand-invariant-defect']],
  [{ status: 'not-applicable', reason: 'layer-first' }, 'not-applicable', null, []],
  [{ status: 'complete', ...collection }, 'passed', 'covered', ['bounded-fallback']],
  [{ status: 'partial', ...collection }, 'unverified', 'partial', ['bounded-fallback']],
  [{ status: 'unavailable', inventoryMode: 'none', reason: 'denied' }, 'unverified', 'partial',
    ['denied']],
] as const)('retains outside source evidence %j without changing its scope', (...args) => {
  const [outside, status, reach, limitations] = args;

  facts.demand = 'application-scope';
  facts.outsideScope = outside as OutsideScopeEvidence;
  const result = reachAssessmentItems('apps/web', facts, facts.coverage);

  expect(result[0]).toEqual({
    application: 'apps/web', id: 'outside-source-universe', sourceKey: 'outside-source-universe',
    subject: 'src', lane: 'reach', status, reach, limitations,
    source: 'inspect.outsideScope', evidence: outside,
    claim: renderAssessmentClaim('outside-source-universe'),
    signals: [], affectsExit: false, nextStep: null,
  });
});

it('does not claim full outside coverage for source-only demand', () => {
  expect(reachAssessmentItems('.', facts, facts.coverage).map((item) => item.id))
    .toEqual(['architecture-coverage', 'import-analysis']);
});

it.each([
  [0, 0, [], true, 'declaratory', 'runway'],
  [0, 0, [], false, 'declaratory', 'vacuous'],
  [1, 0, [], true, 'unverified', 'partial'],
  [2, 1, ['src/other.ts'], false, 'unverified', 'partial'],
  [1, 1, [], false, 'passed', 'covered'],
] as const)('separates net reach with %i source and %i layer files', (...args) => {
  const [sourceFiles, layerFiles, outsideNets, runway, status, reach] = args;

  facts.resolved.moduleRunway = runway;
  const coverage = { ...facts.coverage, sourceFiles, layerFiles, outsideNets: [...outsideNets] };

  expect(reachAssessmentItems('.', facts, coverage)[0]).toMatchObject({
    id: 'architecture-coverage', status, reach, evidence: coverage,
  });
});

it.each([
  ['healthy', 0, 'passed', 'covered'],
  ['healthy', 1, 'unverified', 'partial'],
  ['degraded', 0, 'unverified', 'partial'],
] as const)('keeps analysis %s with %i dynamic references independently visible', (...args) => {
  const [status, unknownDynamicImports, expected, reach] = args;

  facts.analysis = { ...facts.analysis, status, unknownDynamicImports };

  expect(reachAssessmentItems('.', facts, facts.coverage)[1]).toMatchObject({
    id: 'import-analysis', status: expected, reach, evidence: facts.analysis,
  });
});
