import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { collectArchitectureFacts } from './facts';

let root: string;
let blueprint: Blueprint;

function write(file: string, source = 'export const value = 1;'): void {
  const target = path.join(root, file);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-module-forms-'));

  blueprint = { framework: 'react', architecture: {
    alias: '@', modules: [
      { name: 'a', does: 'a', dependsOn: ['b'] }, { name: 'b', does: 'b' },
    ],
    layers: [{ name: 'services', does: 'services', layout: 'file' }],
  } };

  write('src/b/services/B.ts');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it.each([
  ['static', 'import { value } from \'@/b/services/B\';'],
  ['side-effect', 'import \'@/b/services/B\';'],
  ['type', 'import type { Value } from \'@/b/services/B\';'],
  ['export', 'export { value } from \'@/b/services/B\';'],
  ['type export', 'export type { Value } from \'@/b/services/B\';'],
  ['export all', 'export * from \'@/b/services/B\';'],
  ['require', 'const value = require(\'@/b/services/B\');'],
  ['dynamic', 'const value = import(\'@/b/services/B\');'],
  ['bounded dynamic', 'const target = \'@/b/services/B\'; import(target);'],
])('counts %s proven coupling', (_label, source) => {
  write('src/a/services/A.ts', source);
  const result = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  expect(result.moduleDependencies).toMatchObject({ status: 'synchronized', modules: [
    { observedDirect: [{ to: 'b', references: 1 }], uncertainty: [], reach: 'covered' }, {},
  ] });
});

it.each(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue'])('counts governed .%s files',
  (extension) => {
    const source = 'import \'@/b/services/B\';';

    write(`src/a/services/A.${extension}`,
      extension === 'vue' ? `<script>${source}</script>` : source);

    expect(collectArchitectureFacts(root, blueprint, { demand: 'governed-source' })
      .moduleDependencies!.modules[0].observedDirect[0].references).toBe(1);
  });

it('keeps known outside targets separate from module completeness', () => {
  blueprint.architecture.consumerFiles = ['tools/**'];
  blueprint.architecture.additionalAliases = { '~tools': 'tools', '~other': 'outside' };
  write('tools/Tool.ts');
  write('outside/Other.ts');

  write('src/a/services/A.ts',
    'import \'@/b/services/B\'; import \'~tools/Tool\'; import \'~other/Other\';');

  const facts = collectArchitectureFacts(root, blueprint, { demand: 'application-scope' });

  expect(facts.moduleDependencies).toMatchObject({ status: 'synchronized', modules: [
    { observedDirect: [{ to: 'b' }], uncertainty: [] }, {},
  ] });

  expect(facts.moduleDependencies!.modules[0].observedDirect).toHaveLength(1);

  expect(facts.findings.map((finding) => finding.rule))
    .toContain('uncovered-application-source');
});

it('source-root dot uses the same canonical module boundary', () => {
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  blueprint.architecture.sourceRoot = '.';
  write('a/services/A.ts', 'import \'@/b/services/B\'; import \'@/unknown/Other\';');
  write('b/services/B.ts');
  write('unknown/Other.ts');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  expect(facts.moduleDependencies!.modules[0]).toMatchObject({ root: 'a',
    matched: ['b'], uncertainty: [{ cause: 'unresolved-project-reference',
      path: 'a/services/A.ts', specifier: '@/unknown/Other' }] });
});

it('missing classified targets do not become proven source edges', () => {
  write('src/a/services/A.ts', 'import \'@/b/services/Missing\';');
  const facts = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  expect(facts.moduleDependencies).toMatchObject({ status: 'indeterminate', modules: [
    { observedDirect: [], unverifiedDeclarations: ['b'], uncertainty: [
      { cause: 'unresolved-project-reference', path: 'src/a/services/A.ts',
        specifier: '@/b/services/Missing' },
    ] }, {},
  ] });
});
