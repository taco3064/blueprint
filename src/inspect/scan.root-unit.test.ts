import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineBlueprint } from '../config';
import { scan } from './scan';
import { analyze } from './analyze';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-root-scan-'));
  fs.mkdirSync(path.join(root, 'src/shop'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app', modules: [{ name: 'shop', does: 'commerce' }],
    layers: [{ name: 'domain', does: 'logic', layout: 'folder' }],
  },
});

describe('root graph scan evidence', () => {
  it.each([
    { source: `const text = 'import "./Feature";';`, edges: [], rules: ['orphan-root-file'] },
    { source: 'const target = "./Feature"; require(target);', edges: ['./Feature'], rules: [] },
    { source: 'import feature = require("./Feature");', edges: ['./Feature'], rules: [] },
  ])('retains AST edges for $source', ({ source, edges, rules }) => {
    fs.writeFileSync(path.join(root, 'src/shop/index.ts'), source);
    fs.writeFileSync(path.join(root, 'src/shop/Feature.ts'), 'export const feature = 1;');
    const measured = scan(root);

    expect(measured.files.find((file) => file.path === 'src/shop/index.ts')?.moduleSpecifiers)
      .toEqual(edges);

    const entry = measured.files.find((file) => file.path === 'src/shop/index.ts');

    expect(entry?.unknownModuleSpecifiers).toBe(0);

    expect(analyze(measured, blueprint).map((item) => item.rule)).toEqual(rules);
  });
});

describe('root graph unknown module loaders', () => {
  it.each([
    { source: 'export function load(name: string) { return require(name); }', unknown: 1 },
    { source: 'require(runtime()); require(other());', unknown: 2 },
  ])('withholds orphan proofs for supported unknown loads: $source', ({ source, unknown }) => {
    fs.writeFileSync(path.join(root, 'src/shop/index.ts'), 'import "./loader";');
    fs.writeFileSync(path.join(root, 'src/shop/loader.ts'), source);
    fs.writeFileSync(path.join(root, 'src/shop/Feature.ts'), 'export const feature = 1;');
    const measured = scan(root);
    const loader = measured.files.find((file) => file.path === 'src/shop/loader.ts');

    expect(loader?.unknownModuleSpecifiers).toBe(unknown);
    expect(loader?.moduleSpecifiers).toEqual([]);
    expect(loader?.importAnalysis).toEqual({ unknownDynamicImports: 0 });

    expect(analyze(measured, blueprint)).toEqual([
      expect.objectContaining({
        rule: 'root-reachability-unknown', path: 'src/shop/loader.ts', subject: 'shop',
      }),
    ]);
  });

  it.each([
    '',
    'function load(require: (name: string) => unknown, name: string) { return require(name); }',
    'require?.(runtime());',
    'require(runtime(), other());',
    'object.require(runtime());',
    'require();',
  ])('does not treat a nonloader call as incomplete evidence: %s', (source) => {
    fs.writeFileSync(path.join(root, 'src/shop/index.ts'), source);
    fs.writeFileSync(path.join(root, 'src/shop/Feature.ts'), 'export const feature = 1;');
    const measured = scan(root);
    const entry = measured.files.find((file) => file.path === 'src/shop/index.ts');

    expect(entry?.unknownModuleSpecifiers).toBe(0);
    expect(entry?.moduleSpecifiers).toEqual([]);

    expect(analyze(measured, blueprint)).toEqual([
      expect.objectContaining({ rule: 'orphan-root-file', path: 'src/shop/Feature.ts' }),
    ]);
  });

  it('does not let an unreachable unknown require suppress a proven orphan', () => {
    fs.writeFileSync(path.join(root, 'src/shop/index.ts'), 'export const entry = 1;');
    fs.writeFileSync(path.join(root, 'src/shop/loader.ts'), 'require(runtime());');
    const measured = scan(root);

    const loader = measured.files.find((file) => file.path === 'src/shop/loader.ts');

    expect(loader?.unknownModuleSpecifiers).toBe(1);

    expect(analyze(measured, blueprint)).toEqual([
      expect.objectContaining({ rule: 'orphan-root-file', path: 'src/shop/loader.ts' }),
    ]);
  });
});
