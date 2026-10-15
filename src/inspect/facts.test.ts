import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import * as config from '../config';
import { collectArchitectureFacts } from './facts';
import * as outsideScope from './outside-scope';
import * as scanning from './scan';
import { computeCoverage } from './coverage';
import { measureProhibitions } from './prohibitions';

let root: string;

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [{ name: 'app', does: 'composition' }, { name: 'shop', does: 'shop' }],
    layers: [{ name: 'components', does: 'UI', layout: 'file' }],
  },
};

function write(file: string, content: string): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-facts-'));
  write('src/app/index.ts', 'export {};');
  write('src/shop/components/Item.ts', 'export const item = 1;');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it('source demand performs no outside work and cannot certify scope', () => {
  write('vendor/Broken.ts', 'const invalid: = 1;');
  const read = vi.spyOn(fs, 'readFileSync');
  const directories = vi.spyOn(fs, 'readdirSync');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  expect(facts.demand).toBe('governed-source');
  expect(facts.outsideScope).toEqual({ status: 'not-requested' });
  expect(facts.scopeComplete).toBe(false);

  expect(facts.scanResult.governedWork)
    .toEqual({ inventoryFiles: 2, readFiles: 2, parsedFiles: 2 });

  expect(facts.analysis).toEqual({
    status: 'healthy', scannedFiles: 2, parsedFiles: 2, unknownDynamicImports: 0, parseFailures: [],
  });

  expect(read.mock.calls.map(([file]) => String(file)))
    .not.toContain(path.join(root, 'vendor/Broken.ts'));

  expect(directories.mock.calls.map(([file]) => String(file))).not.toContain(root);

  expect(facts.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
    .toEqual([]);
});

it('full facts preserve relation identity and combined import health', () => {
  write('vendor/Consumer.ts', 'import \'~app/shop/components/Item\';');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'application-scope' });

  expect(facts.scopeComplete).toBe(true);
  expect(facts.scanResult.outsideScope).toBe(facts.outsideScope);

  expect(facts.outsideScope).toMatchObject({
    status: 'complete', inventoryMode: 'filesystem-fallback',
    inventoryFiles: 1, readFiles: 1, parsedFiles: 1,
  });

  expect(facts.analysis).toEqual({
    status: 'healthy', scannedFiles: 3, parsedFiles: 3, unknownDynamicImports: 0, parseFailures: [],
  });

  expect(facts.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
    .toMatchObject([{ severity: 'error', path: 'src', subject: 'vendor' }]);
});

it.each([
  { label: 'parse failure', content: 'const invalid: = 1;',
    status: 'degraded', failures: 1, unknown: 0 },
  { label: 'runtime-dependent import', content: 'import(process.env.TARGET);',
    status: 'healthy', failures: 0, unknown: 1 },
] as const)('full facts retain $label as incomplete scope', (test) => {
  const { content, status, failures, unknown } = test;

  write('tools/Consumer.ts', content);
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'application-scope' });

  expect(facts.scopeComplete).toBe(false);
  expect(facts.outsideScope.status).toBe('partial');
  expect(facts.analysis.status).toBe(status);
  expect(facts.analysis.parseFailures).toHaveLength(failures);
  expect(facts.analysis.unknownDynamicImports).toBe(unknown);
  expect(facts.analysis.scannedFiles).toBe(3);
});

it.each([
  ['layer-first', { ...blueprint.architecture, modules: undefined }],
  ['source-root-is-application-root', { ...blueprint.architecture, sourceRoot: '.' }],
] as const)('full %s facts mark outside scope not applicable', (reason, architecture) => {
  const facts = collectArchitectureFacts(root, { ...blueprint, architecture }, {
    demand: 'application-scope',
  });

  expect(facts.scopeComplete).toBe(true);
  expect(facts.outsideScope).toEqual({ status: 'not-applicable', reason });
});

it('passes dependency inventory through the shared analyzer', () => {
  const configured: Blueprint = { ...blueprint, architecture: {
    ...blueprint.architecture, layers: [{ name: 'components', does: 'UI', owns: ['react'] }],
  } };

  const absent = collectArchitectureFacts(root, configured, {
    demand: 'governed-source', dependencies: [],
  });

  const present = collectArchitectureFacts(root, configured, {
    demand: 'governed-source', dependencies: ['react'],
  });

  expect(absent.findings.filter((finding) => finding.rule === 'owns-not-installed'))
    .toMatchObject([{ subject: 'react' }]);

  expect(present.findings.filter((finding) => finding.rule === 'owns-not-installed')).toEqual([]);
});

it('full facts retain one resolved architecture through every analyzer', () => {
  write('src/shop/index.ts', 'export * from \'./components/Item\';');

  write('src/shop/components/Item.ts',
    'import \'react\'; import \'~app/app\'; import \'../../../tools/Consumer\';');

  write('tools/Consumer.ts', 'import \'~app/shop\';');
  const resolve = vi.spyOn(config, 'resolveArchitecture');
  const scan = vi.spyOn(scanning, 'scan');

  const facts = collectArchitectureFacts(root, { ...blueprint, rules: { cycles: 'warn' } }, {
    demand: 'application-scope', dependencies: [],
  });

  expect(resolve).toHaveBeenCalledTimes(3);
  expect(scan).toHaveBeenCalledExactlyOnceWith(root, 'src');
  expect(facts.resolved).toBe(resolve.mock.results[0].value);
  expect(facts.resolved.sourceRoot).toBe('src');

  expect(facts.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
    .toMatchObject([{ subject: 'tools' }]);
});

it('unavailable outside inventory cannot become complete or invent relations', () => {
  const unavailable = {
    status: 'unavailable' as const, inventoryMode: 'none' as const, reason: 'inventory unavailable',
  };

  const collect = vi.spyOn(outsideScope, 'collectOutsideScope').mockReturnValue(unavailable);
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'application-scope' });

  expect(collect).toHaveBeenCalledExactlyOnceWith(root, facts.resolved, facts.scanResult);
  expect(facts.outsideScope).toBe(unavailable);
  expect(facts.scanResult.outsideScope).toBe(unavailable);
  expect(facts.scopeComplete).toBe(false);

  expect(facts.analysis).toEqual({
    status: 'healthy', scannedFiles: 2, parsedFiles: 2, unknownDynamicImports: 0, parseFailures: [],
  });

  expect(facts.findings.filter((finding) => finding.rule === 'uncovered-application-source'))
    .toEqual([]);
});

it.each([undefined, false, true])('retains coverage for TypeScript=%s', (hasTypescript) => {
  const configured: Blueprint = { ...blueprint, rules: { explicitAny: 'error' } };

  const facts = collectArchitectureFacts(root, configured, {
    demand: 'governed-source', hasTypescript, framework: 'react',
  });

  expect(facts.coverage)
    .toEqual(computeCoverage(facts.scanResult, configured, hasTypescript ?? false));

  expect(facts.prohibitions).toEqual(measureProhibitions(configured, facts.scanResult, 'react'));
});

it.each([
  ['react', 'active'], ['vue', 'unavailable'], [null, 'unavailable'],
] as const)('passes detected framework %s to the prohibition authority', (framework, status) => {
  const configured: Blueprint = { ...blueprint, framework: 'auto', architecture: {
    ...blueprint.architecture, layers: [{ name: 'components', does: 'UI', layout: 'file',
      mustNot: [{ id: 'state', description: 'state', checks: [{ capability: 'react-state' }] }] }],
  } };

  const facts = collectArchitectureFacts(root, configured, {
    demand: 'governed-source', framework,
  });

  expect(facts.prohibitions).toHaveLength(1);
  expect(facts.prohibitions.map((fact) => fact.status)).toEqual([status]);
  expect(facts.prohibitions[0].matchedFiles).toEqual(['src/shop/components/Item.ts']);
});
