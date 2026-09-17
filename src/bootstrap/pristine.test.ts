import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildConfigSource, buildNextConfigSource, detect } from '../project';
import { observePristineScaffold } from './pristine';

const roots: string[] = [];

function project(config: string, dependencies: Record<string, string> = { react: '^18' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-pristine-'));

  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', dependencies }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), config);

  return root;
}

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('observePristineScaffold', () => {
  it.each([
    ['react', 'layer-first'],
    ['react', 'module-first'],
    ['vue', 'layer-first'],
    ['vue', 'module-first'],
  ] as const)('recognizes the %s %s scaffold with and without a name', (framework, topology) => {
    for (const scaffold of [
      { topology },
      { topology, name: 'shop' },
      { topology, agents: ['claude' as const] },
      { topology, name: 'shop', agents: ['agents' as const] },
    ]) {
      const root = project(buildConfigSource(framework, scaffold));

      expect(observePristineScaffold(root, detect(root))).toBe(topology);
    }
  });

  it('recognizes a pristine Next scaffold as layer-first', () => {
    const next = { router: 'app' as const, srcDir: false };
    const root = project(buildNextConfigSource(next, 'shop'), { react: '^19', next: '^15' });

    fs.mkdirSync(path.join(root, 'app'));
    fs.writeFileSync(path.join(root, 'app/page.tsx'), 'export default () => null;\n');

    expect(observePristineScaffold(root, detect(root))).toBe('layer-first');
  });

  it('treats any edited config as authored', () => {
    const edited = buildConfigSource('react', { topology: 'module-first' })
      .replace('modules: []', 'modules: [{ name: \'checkout\', does: \'Checkout.\' }]');

    const root = project(edited);

    expect(observePristineScaffold(root, detect(root))).toBeNull();
  });
});
