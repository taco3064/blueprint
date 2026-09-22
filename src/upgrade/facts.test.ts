import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UPGRADE_CATALOG } from '../lifecycle';
import { legacyMigrationFacts, migrateLegacyBlueprint } from '../config';
import type { GitReader } from '../project';
import { gatherUpgradeFacts } from './facts';

let root: string;

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-facts-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function adopt(app: string): void {
  write(`${app}/blueprint.config.mjs`, 'export default {};\n');

  write(`${app}/node_modules/@kekkai/blueprint/package.json`, JSON.stringify({
    name: '@kekkai/blueprint', version: '4.0.0',
  }));
}

const git = (changes: string): GitReader => (args) => ({
  status: 0,
  stdout: args[0] === 'status' ? changes : args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

const LEGACY = {
  framework: 'react',
  architecture: { alias: '~app', layers: [], module: { private: ['hooks', 3] } },
};

const CURRENT = { framework: 'react', architecture: { alias: '~app', layers: [] } };

describe('gatherUpgradeFacts', () => {
  it('reads each application config and dates the repository by any legacy one', async () => {
    adopt('apps/admin');
    adopt('apps/web');

    const facts = await gatherUpgradeFacts(root, {
      git: git(' M a.ts\r\n?? docs/b.md\r\n'),
      loadConfig: async (file) => path.basename(path.dirname(file)) === 'admin' ? LEGACY : CURRENT,
      catalog: UPGRADE_CATALOG,
    });

    expect(facts.unreadable).toBeNull();

    expect(facts.applications.map((entry) => entry.facts)).toEqual([
      { root: 'apps/admin', legacyShape: true, legacyKeys: { 'module.private': ['hooks', '3'] } },
      { root: 'apps/web', legacyShape: false, legacyKeys: {} },
    ]);

    expect(facts.checkpoint)
      .toEqual({
        kind: 'unproven-legacy-source', installed: '4.0.0', checkpoint: '3.2.0',
      });

    expect(facts.git).toEqual({ repository: true, changes: ['a.ts', 'docs/b.md'] });
    expect(facts.upgradePlaybook).toBeNull();
  });

  it('reports a repository-root upgrade playbook separately from active workflows', async () => {
    adopt('.');
    write('blueprint-upgrade.md', '# stale\n');

    const facts = await gatherUpgradeFacts(root, {
      git: git(''), loadConfig: async () => CURRENT, catalog: UPGRADE_CATALOG,
    });

    expect(facts.upgradePlaybook).toBe('blueprint-upgrade.md');
    expect(facts.workflows).toEqual([]);
  });

  it('treats a config without an architecture as current', async () => {
    adopt('.');

    const facts = await gatherUpgradeFacts(root, {
      git: git(''), loadConfig: async () => ({}), catalog: UPGRADE_CATALOG,
    });

    expect(facts.applications[0].facts).toEqual({ root: '.', legacyShape: false, legacyKeys: {} });

    expect(facts.checkpoint)
      .toEqual({ kind: 'bootstrap', version: '4.0.0', evidence: 'installed-package' });
  });

  it('recognizes the boolean marker emitted by an older loaded runtime', () => {
    const marked = {} as never;

    Object.defineProperty(marked, Symbol.for('@kekkai/blueprint/legacy-migration'), {
      value: true,
    });

    expect(legacyMigrationFacts(marked)).toEqual({ privateNames: [] });
  });

  it('preserves legacy checkpoint evidence after the installed runtime normalizes the config',
    async () => {
      adopt('.');
      const normalized = migrateLegacyBlueprint(LEGACY as never).blueprint;

      const facts = await gatherUpgradeFacts(root, {
        git: git(''), loadConfig: async () => normalized, catalog: UPGRADE_CATALOG,
      });

      expect(facts.applications[0].facts).toEqual({
        root: '.', legacyShape: true, legacyKeys: { 'module.private': ['hooks', '3'] },
      });

      expect(facts.checkpoint)
        .toEqual({
          kind: 'unproven-legacy-source', installed: '4.0.0', checkpoint: '3.2.0',
        });
    });
});
