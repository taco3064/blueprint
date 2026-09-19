import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader } from '../project';
import { gatherRemovalFacts, missingStateInstall } from './facts';

let root: string;

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-facts-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const git: GitReader = (args) => ({
  status: 0,
  stdout: args[1] === '--show-toplevel' ? root : 'true',
  stderr: '',
});

const history = (commits: string): GitReader => (args, cwd) => args[0] === 'rev-list'
  ? { status: 0, stdout: commits, stderr: '' }
  : args[1] === '--is-shallow-repository'
    ? { status: 0, stdout: 'false\n', stderr: '' }
    : git(args, cwd);

const LEGACY = {
  framework: 'react',
  architecture: {
    alias: '~legacy',
    layers: [{ name: 'pages', does: 'routes' }],
    module: { layout: 'folder', entry: 'index', private: ['hooks'] },
  },
} as unknown as Blueprint;

function lifecycle(applications: Record<string, unknown>): void {
  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, blueprint: '4.1.0', provenance: 'partial', operations: [], pending: null,
    applications,
  }));
}

function install(rel: string, version: string): void {
  write(path.posix.join(rel, 'node_modules/@kekkai/blueprint/package.json'), JSON.stringify({
    name: '@kekkai/blueprint', version,
  }));
}

describe('gatherRemovalFacts', () => {
  it('orders recorded and configured applications and migrates a 3.2 config', async () => {
    write('apps/web/blueprint.config.mjs', 'export default {};\n');
    lifecycle({ 'apps/admin': { provenance: [{ kind: 'dependency', name: 'eslint' }] } });

    const facts = await gatherRemovalFacts(root, { git, loadConfig: async () => LEGACY });

    expect(facts.scope.map((application) => application.key)).toEqual(['apps/admin', 'apps/web']);
    expect(facts.scope[0].provenance).toEqual([{ kind: 'dependency', name: 'eslint' }]);
    expect(facts.scope[1].blueprint?.architecture.alias).toBe('~legacy');
    expect(facts).toMatchObject({ root, remaining: [], mode: 'partial' });
  });

  it('selects the deepest adopted application that contains the working directory', async () => {
    for (const key of ['.', 'apps/web', 'apps/zeta']) {
      write(path.posix.join(key, 'blueprint.config.mjs'), 'export default {};\n');
    }

    const facts = await gatherRemovalFacts(path.join(root, 'apps/web/src'), {
      git, loadConfig: async () => LEGACY,
    });

    expect(facts.scope.map((application) => application.key)).toEqual(['apps/web']);
    expect(facts.remaining).toEqual(['.', 'apps/zeta']);
  });
});

describe('missingStateInstall', () => {
  it('names a lifecycle-aware install only when the lifecycle state is missing', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    install('.', '4.1.0');

    const missing = await gatherRemovalFacts(root, { git, loadConfig: async () => LEGACY });

    expect(missingStateInstall(missing, history('abc\n'))).toBe('4.1.0');
    expect(missingStateInstall(missing, git)).toBe('4.1.0');

    lifecycle({});

    const present = await gatherRemovalFacts(root, { git, loadConfig: async () => LEGACY });

    expect(missingStateInstall(present, history('abc\n'))).toBeNull();

    install('.', '4.0.0');
    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

    const legacy = await gatherRemovalFacts(root, { git, loadConfig: async () => LEGACY });

    expect(missingStateInstall(legacy, history('abc\n'))).toBeNull();
  });

  it('lets state that never entered Git history fall back to a pre-lifecycle removal', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    install('.', '4.1.0');

    const facts = await gatherRemovalFacts(root, { git, loadConfig: async () => LEGACY });

    expect(facts.mode).toBe('legacy');
    expect(missingStateInstall(facts, history(''))).toBeNull();
  });
});
