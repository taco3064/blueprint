import { renderAssessmentClaim } from '../operational-contract';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectArchitectureFacts } from './facts';
import type { ArchitectureFacts } from './facts';
import { moduleAssessmentItems } from './assessment-modules';
import type { ModuleDependencyRow } from './module-dependencies-types';
import type { Finding } from './types';

let root: string;
let facts: ArchitectureFacts;

const row: ModuleDependencyRow = {
  name: 'shop', root: 'src/shop', declaredDirect: [], reachable: [], observedDirect: [],
  matched: [], missingDeclarations: [], unusedDeclarations: [], unverifiedDeclarations: [],
  uncertainty: [], reach: 'covered',
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-module-assessment-'));

  facts = collectArchitectureFacts(root, {
    framework: 'react', architecture: { alias: '@', modules: [],
      layers: [{ name: 'views', does: 'Presentation', layout: 'file' }] },
  }, { demand: 'governed-source' });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('layer-first absence produces no graph item', () => {
  facts.moduleDependencies = null;
  expect(moduleAssessmentItems('.', facts, [])).toEqual([]);
});

it.each([
  ['synchronized', 'passed', 'covered'], ['drift', 'passed', 'covered'],
  ['indeterminate', 'unverified', 'partial'], ['runway', 'declaratory', 'runway'],
] as const)('retains %s graph independently from outside-source failure', (status, expected,
  reach) => {
  facts.moduleDependencies = { status, modules: [] };
  facts.outsideScope = { status: 'unavailable', inventoryMode: 'none', reason: 'denied' };

  expect(moduleAssessmentItems('apps/web', facts, [])).toEqual([{
    application: 'apps/web', id: 'module-dependencies', sourceKey: 'module-dependencies',
    subject: 'src', lane: 'reach', source: 'inspect.moduleDependencies',
    evidence: facts.moduleDependencies,
    status: expected, reach, claim: renderAssessmentClaim('module-dependencies'),
    limitations: ['direct-graph-agreement-does-not-prove-ownership'],
    signals: [], affectsExit: false, nextStep: null,
  }]);
});

it('adds warn/off drift while preserving existing findings and debt identities', () => {
  facts.moduleDependencies = { status: 'drift', modules: [{ ...row,
    missingDeclarations: ['existing', 'missing'], unusedDeclarations: ['unused'],
  }] };

  const existing: Finding = { rule: 'module-dependency-missing', path: 'src/shop',
    subject: 'existing', message: 'missing', severity: 'warn' };

  const result = moduleAssessmentItems('.', facts, [existing]);

  expect(result.map((item) => [item.id, item.lane, item.status])).toEqual([
    ['module-dependencies', 'reach', 'passed'],
    ['inspect-finding', 'conformance', 'failed'],
    ['inspect-finding', 'conformance', 'failed'],
  ]);

  expect(result.slice(1).map((item) => [item.sourceKey, item.affectsExit])).toEqual([
    ['module-dependency-missing\0src/shop\0missing', false],
    ['module-dependency-unused\0src/shop\0unused', false],
  ]);

  expect(result[1].evidence).toEqual({ rule: 'module-dependency-missing', path: 'src/shop',
    subject: 'missing', row: facts.moduleDependencies.modules[0] });
});

it('adds declaratory items only for vacuous rows, retaining canonical module identity', () => {
  const empty = { ...row, name: 'empty', root: 'src/empty', reach: 'vacuous' as const };

  facts.moduleDependencies = { status: 'synchronized', modules: [row, empty] };
  const result = moduleAssessmentItems('.', facts, []);

  expect(result).toHaveLength(2);

  expect(result[1]).toMatchObject({ id: 'module-dependency-reach', sourceKey: 'src/empty',
    subject: 'src/empty', lane: 'reach', status: 'declaratory', reach: 'vacuous',
    evidence: empty });
});
