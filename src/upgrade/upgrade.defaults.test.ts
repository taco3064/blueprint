import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runningPackage } from '../lifecycle';
import type { OperationalText } from '../operational-contract';
import type { GitReader } from '../project';
import { gatherUpgradeFacts } from './facts';
import { runUpgrade } from './upgrade';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-defaults-')));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function adopt(version: string): void {
  write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': version } }));

  write('blueprint.config.mjs',
    'export default { architecture: { module: { private: [1] }, layers: [] } };\n');

  write('node_modules/@kekkai/blueprint/package.json',
    JSON.stringify({ name: '@kekkai/blueprint', version }));
}

const repository: GitReader = (args) => ({
  status: 0,
  stdout: args[0] === 'status' ? '' : args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

describe('runUpgrade · real defaults', () => {
  it('reads the running package, catalog, console, and config loader when nothing is '
    + 'injected', async () => {
    const running = runningPackage()!;

    adopt(running.version);

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: running.version, provenance: 'complete', operations: [],
      pending: null, applications: {},
    }));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await runUpgrade(root)).toBe(0);
    expect(String(log.mock.calls[0][0])).toContain(`Blueprint lifecycle ${running.version} is current`);
  });

  it('measures facts outside Git with the real loader and legacy private '
    + 'declarations', async () => {
    adopt('3.2.0');

    const facts = await gatherUpgradeFacts(root, { catalog: {
      supportedFrom: '3.2.0', legacyConfigCheckpoint: '3.2.0', migrations: [], operations: [],
    } });

    expect(facts.git).toEqual({ repository: false, changes: [] });

    expect(facts.applications).toEqual([expect.objectContaining({
      key: '.',
      facts: { root: '.', legacyShape: true, legacyKeys: { 'module.private': ['1'] } },
    })]);
  });

  it('keeps the first unreadable config when several fail to load', async () => {
    write('apps/a/blueprint.config.mjs', '');
    write('apps/b/blueprint.config.mjs', '');

    const facts = await gatherUpgradeFacts(root, {
      git: repository,
      loadConfig: async (file) => Promise.reject(new Error(path.basename(path.dirname(file)))),
      catalog: {
        supportedFrom: '3.2.0', legacyConfigCheckpoint: '3.2.0', migrations: [], operations: [],
      },
    });

    expect(facts.unreadable).toEqual({ application: 'apps/a', cause: 'a' });
  });
});

describe('runUpgrade · confirmation operations', () => {
  it('records an operation Blueprint cannot measure on explicit confirmation', async () => {
    adopt('4.1.0');

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '4.0.0', provenance: 'complete', operations: [],
      pending: {
        from: '4.0.0', to: '4.1.0', migrations: [], completed: [],
        operations: [{ id: 'confirm-me', applications: ['.'], evidence: {}, supersedes: [] }],
      },
      applications: {},
    }));

    const lines: string[] = [];

    expect(await runUpgrade(root, {
      complete: 'confirm-me',
      git: repository,
      loadConfig: async () => ({}),
      log: (line) => void lines.push(line),
      instruction: () => 'Confirm.' as OperationalText,
      catalog: {
        supportedFrom: '3.2.0',
        legacyConfigCheckpoint: '3.2.0',
        migrations: [],
        operations: [{
          id: 'confirm-me', introducedIn: '4.1.0', requires: [], cancels: [], supersedes: [],
          applicability: { kind: 'always' }, verification: { kind: 'confirm' },
        }],
      },
    })).toBe(0);

    expect(lines).toEqual(['  ✓ operation confirm-me recorded as complete — 0 semantic '
      + 'operation(s) remain; run `npx blueprint upgrade` to verify and finish']);
  });
});
