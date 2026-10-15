import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { renderModuleDependencyDerivation } from '../operational-contract';
import { runInspect } from './inspect';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-inspect-derivation-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'derivation' }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');
  fs.mkdirSync(path.join(root, 'src/shop'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/shop/index.ts'), 'export {};');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  { moduleFirst: false, baseline: false },
  { moduleFirst: false, baseline: true },
  { moduleFirst: true, baseline: false },
  { moduleFirst: true, baseline: true },
])('JSON derivation matches topology with %j', async ({ moduleFirst, baseline }) => {
  const blueprint: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: moduleFirst ? [{ name: 'shop', does: 'Commerce' }] : undefined,
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
    },
  };

  let output = '';

  const result = await runInspect(root, {
    loadConfig: async () => blueprint,
    baseline,
    json: true,
    log: (text) => (output = text),
  });

  expect(JSON.parse(output).moduleDependencies).toEqual(result.moduleDependencies);
  expect(result.moduleDependencies === null).toBe(!moduleFirst);

  expect(JSON.parse(output).moduleDependencyDerivation)
    .toBe(moduleFirst ? renderModuleDependencyDerivation() : null);
});
