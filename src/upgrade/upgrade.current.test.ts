import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReader } from '../project';
import { runUpgrade } from './upgrade';
import type { UpgradeOptions } from './upgrade';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-current-')));
  lines = [];

  write('package.json', JSON.stringify({
    dependencies: { '@kekkai/blueprint': '^4.1.0' },
  }));

  write('blueprint.config.mjs', 'export default {};\n');

  write('node_modules/@kekkai/blueprint/package.json', JSON.stringify({
    name: '@kekkai/blueprint', version: '4.1.0',
  }));

  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1,
    blueprint: '4.1.0',
    provenance: 'complete',
    operations: [],
    pending: null,
    applications: {},
  }));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const readMaybe = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

function setInstalled(version: string | null): string {
  const installed = path.join(root, 'node_modules/@kekkai/blueprint/package.json');

  if (version === null) {
    fs.rmSync(installed);

    write('blueprint.config.mjs',
      'import { defineBlueprint } from \'@kekkai/blueprint\';\n'
      + 'export default defineBlueprint({});\n');
  } else {
    fs.writeFileSync(installed, JSON.stringify({ name: '@kekkai/blueprint', version }));
  }

  return installed;
}

const repository: GitReader = (args) => ({
  status: 0,
  stdout: args[0] === 'status' ? '' : args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

function upgrade(options: Partial<UpgradeOptions> = {}): Promise<number> {
  return runUpgrade(root, {
    log: (line) => void lines.push(line),
    git: repository,
    loadConfig: async () => ({}),
    running: { root: '/runner', version: '4.1.0' },
    ...options,
  });
}

describe('runUpgrade · current lifecycle', () => {
  it('reports current only when no stale upgrade playbook remains', async () => {
    expect(await upgrade()).toBe(0);

    expect(lines).toEqual([
      'Blueprint lifecycle 4.1.0 is current — nothing to upgrade. Run `blueprint init` to repair '
      + 'generated integration and `blueprint doctor` to verify it.',
    ]);

    expect(fs.existsSync(path.join(root, 'blueprint-upgrade.md'))).toBe(false);
  });

  it.each([false, true])(
    'preserves a stale playbook and refuses the current lifecycle (dry run: %s)',
    async (dryRun) => {
      const stale = '# stale\nuser-owned detail\n';

      write('blueprint-upgrade.md', stale);
      const before = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8');

      await expect(upgrade({ dryRun })).rejects.toThrow(
        'blueprint-upgrade.md remains even though the Blueprint lifecycle is current. Review it '
        + 'and remove it manually before running upgrade again',
      );

      expect(fs.readFileSync(path.join(root, 'blueprint-upgrade.md'), 'utf8')).toBe(stale);
      expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8')).toBe(before);
      expect(lines).toEqual([]);
    },
  );

  it.each<[string, string | null]>([
    ['an older package', '4.0.0'],
    ['a missing package', null],
  ])('refuses before repairing %s while the stale playbook remains', async (_, version) => {
    const stale = '# stale\nuser-owned detail\n';
    const installed = setInstalled(version);

    write('blueprint-upgrade.md', stale);
    const before = fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8');
    const installedBefore = readMaybe(installed);
    const exec = vi.fn();
    const handoff = vi.fn(() => 0);
    const loadConfig = version === null ? undefined : async () => ({});

    await expect(upgrade({ exec, handoff, loadConfig }))
      .rejects.toThrow(
        'blueprint-upgrade.md remains even though the Blueprint lifecycle is current',
      );

    expect(exec).not.toHaveBeenCalled();
    expect(handoff).not.toHaveBeenCalled();
    expect(readMaybe(installed)).toBe(installedBefore);
    expect(fs.readFileSync(path.join(root, 'blueprint-upgrade.md'), 'utf8')).toBe(stale);
    expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf8')).toBe(before);
    expect(lines).toEqual([]);
  });
});
