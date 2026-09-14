import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vuePreset } from '../presets';
import { readTransformationObligation, writeTransformationAuthority } from '../project';
import type { LayerToModuleObligation } from '../project';
import { runDoctor } from './doctor';
import { verifyTransformationObligation } from './transformation-obligation';

vi.mock('./transformation-obligation', () => ({
  verifyTransformationObligation: vi.fn(),
}));

vi.mock('../project', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../project')>();

  return { ...actual, readTransformationObligation: vi.fn(actual.readTransformationObligation) };
});

const verify = vi.mocked(verifyTransformationObligation);
const readObligation = vi.mocked(readTransformationObligation);
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-transformation-'));
  spawnSync('git', ['init'], { cwd: root });

  write('package.json', JSON.stringify({
    name: 'x', scripts: { lint: 'eslint .' }, dependencies: { vue: '^3' },
  }));

  write('blueprint.config.mjs', '// user config');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');

  write('tsconfig.json', JSON.stringify({
    compilerOptions: { paths: { '~app/*': ['./src/*'] } },
  }));
});

afterEach(() => {
  vi.resetAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  const file = path.join(root, relative);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function obligation(): LayerToModuleObligation {
  return {
    version: 1,
    direction: 'layer-first-to-module-first',
    origin: {
      head: 'recorded-head', topology: 'layer-first', applicationRoot: '.',
      selectedScope: 'src', sourceRoot: 'src', framework: 'vue', router: null,
      sources: [{
        role: 'container-seed', unit: 'account', members: ['src/containers/account.ts'],
      }],
    },
    target: {
      topology: 'module-first',
      decisions: [{ source: 'account', members: [], destinations: ['src/modules/account'] }],
    },
  };
}

async function doctor(): Promise<Awaited<ReturnType<typeof runDoctor>>> {
  return runDoctor(root, { loadConfig: async () => vuePreset(), log: () => {} });
}

describe('runDoctor transformation obligation', () => {
  it('keeps deleted obligation evidence red while its Git authority is pending', async () => {
    writeTransformationAuthority(root, obligation(), { status: 'pending' });

    const result = await doctor();
    const check = result.checks.find((item) => item.label.includes('transformation'));

    expect(check).toMatchObject({ ok: false });
    expect(check?.detail).toContain('authority');
    expect(result.ok).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it('reports malformed obligation JSON as an invalid red check', async () => {
    write('blueprint-transformation.json', '{');

    const result = await doctor();
    const check = result.checks.find((item) => item.label.includes('transformation'));

    expect(result.ok).toBe(false);
    expect(check).toMatchObject({ ok: false });
    expect(check?.detail).toContain('blueprint-transformation.json is not valid JSON');
    expect(verify).not.toHaveBeenCalled();
  });

  it('preserves a non-Error obligation read failure as an invalid fact', async () => {
    readObligation.mockImplementationOnce(() => {
      throw 'reader unavailable';
    });

    const result = await doctor();
    const check = result.checks.find((item) => item.label.includes('transformation'));

    expect(check).toMatchObject({ ok: false, detail: 'reader unavailable' });
  });

  it('reports an invalid pending mapping as incomplete with its verification facts', async () => {
    write('blueprint-transformation.json', JSON.stringify(obligation()));
    writeTransformationAuthority(root, obligation(), { status: 'pending' });

    verify.mockReturnValue({
      ok: false,
      failures: [{ code: 'destination-missing', subject: 'src/modules/account' }],
    });

    const result = await doctor();
    const check = result.checks.find((item) => item.label.includes('transformation'));

    expect(check).toMatchObject({ ok: false });

    expect(check?.detail).toBe(
      'LF→MF transformation incomplete: destination does not exist: src/modules/account',
    );
  });

  it('keeps a verified artifact red until init retires it', async () => {
    write('blueprint-transformation.json', JSON.stringify(obligation()));
    writeTransformationAuthority(root, obligation(), { status: 'pending' });
    verify.mockReturnValue({ ok: true, failures: [] });

    const result = await doctor();
    const check = result.checks.find((item) => item.label.includes('transformation'));

    expect(result.ok).toBe(false);
    expect(check).toMatchObject({ ok: false });

    expect(verify).toHaveBeenCalledExactlyOnceWith({
      root, obligation: obligation(), blueprint: vuePreset(),
      state: expect.objectContaining({ applicationRoot: root, framework: 'vue' }),
    });

    expect(check?.detail).toContain('final state verifies');
    expect(check?.detail).toContain('blueprint init --topology module-first');
  });
});
