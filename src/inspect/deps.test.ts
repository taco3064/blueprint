import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDeps } from './deps';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSrc(rel: string, content = ''): void {
  const full = path.join(root, 'src', rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function scaffold(): void {
  writeSrc('services/api/api.ts', 'export const api = 1;');
  writeSrc('hooks/useCart/useCart.ts', 'import { api } from \'~app/services/api\';');
  writeSrc('containers/Cart/Cart.ts', 'import { useCart } from \'~app/hooks/useCart\';');
  writeSrc('pages/Home/Home.ts', 'import { useCart } from \'~app/hooks/useCart\';');
}

describe('runDeps · target', () => {
  it('answers blast radius for a module key, file path, or src-prefixed path', async () => {
    scaffold();

    for (const target of ['hooks/useCart', 'src/hooks/useCart/useCart.ts', './src/hooks/useCart']) {
      const { ok, modules } = await runDeps(root, { target, log: silent });

      expect(ok).toBe(true);
      expect(modules[0].module).toBe('hooks/useCart');
      expect(modules[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
      expect(modules[0].imports).toEqual(['services/api']);
    }
  });

  it('renders arrows in the text report and raw JSON with --json', async () => {
    scaffold();
    let output = '';

    await runDeps(root, { target: 'hooks/useCart', log: (m) => (output = m) });
    expect(output).toContain('← containers/Cart');
    expect(output).toContain('→ services/api');

    await runDeps(root, { target: 'hooks/useCart', json: true, log: (m) => (output = m) });
    expect(JSON.parse(output).module).toBe('hooks/useCart');
  });

  it('fails on an unknown module', async () => {
    scaffold();
    let output = '';

    const { ok } = await runDeps(root, { target: 'hooks/useGhost', log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(output).toContain('Unknown module "hooks/useGhost"');
  });
});

describe('runDeps · leaderboard', () => {
  it('sorts every module by fan-in, name-breaking ties', async () => {
    scaffold();
    let output = '';

    const { ok, modules } = await runDeps(root, { log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('hooks/useCart'); // fan-in 2
    expect(modules[1].module).toBe('services/api'); // fan-in 1
    expect(modules.at(-1)?.importedBy).toEqual([]);
    expect(output).toContain('Blast radius');
    expect(output).toContain('2 ← hooks/useCart');
  });

  it('handles an empty project and JSON output', async () => {
    let output = '';

    const empty = await runDeps(root, { log: (m) => (output = m) });

    expect(empty.modules).toEqual([]);
    expect(output).toContain('No modules found');

    scaffold();
    await runDeps(root, { json: true, log: (m) => (output = m) });
    expect(Array.isArray(JSON.parse(output).modules)).toBe(true);
  });
});

describe('runDeps · test files are excluded from the graph', () => {
  it('does not count test importers in the blast radius', async () => {
    scaffold();
    writeSrc('pages/Home/Home.test.ts', 'import { useCart } from \'~app/hooks/useCart\';');

    const { modules } = await runDeps(root, { target: 'hooks/useCart', log: silent });

    // Still the two production importers — the test adds nothing.
    expect(modules[0].importedBy).toEqual(['containers/Cart', 'pages/Home']);
  });
});

describe('runDeps · file modules drop their extension from the key', () => {
  it('resolves a bare-file module without its extension', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    writeSrc('components/HelloWorld.vue', '');
    writeSrc('pages/Home/Home.ts', 'import x from \'~app/components/HelloWorld.vue\';');

    const { ok, modules } = await runDeps(root, { target: 'components/HelloWorld', log: silent });

    expect(ok).toBe(true);
    expect(modules[0].module).toBe('components/HelloWorld');
    expect(modules[0].importedBy).toEqual(['pages/Home']);
  });
});
