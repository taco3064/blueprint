import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { renderModuleDependencyDerivation } from '../operational-contract';
import { runDeps } from './deps';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-derivation-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'derivation' }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');
  fs.mkdirSync(path.join(root, 'src/components/Button'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/components/Button/index.ts'), 'export {};');
  fs.mkdirSync(path.join(root, 'src/shop'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/shop/index.ts'), 'export {};');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  { moduleFirst: false, targeted: false },
  { moduleFirst: false, targeted: true },
  { moduleFirst: true, targeted: false },
  { moduleFirst: true, targeted: true },
])('JSON derivation matches topology with %j', async ({ moduleFirst, targeted }) => {
  const blueprint: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: moduleFirst ? [{ name: 'shop', does: 'Commerce' }] : undefined,
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
    },
  };

  let output = '';

  const result = await runDeps(root, {
    loadConfig: async () => blueprint,
    target: targeted ? (moduleFirst ? 'shop' : 'components/Button') : undefined,
    json: true,
    log: (text) => (output = text),
  });

  expect(result.ok).toBe(true);
  expect(JSON.parse(output).moduleDependencies).toEqual(result.moduleDependencies);
  expect(result.moduleDependencies === null).toBe(!moduleFirst);

  expect(JSON.parse(output).moduleDependencyDerivation)
    .toBe(moduleFirst ? renderModuleDependencyDerivation() : null);
});
