import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader } from '../project';
import { runRemove } from './remove';
import type { RemoveOptions } from './remove';
import { parseManifest } from './documents';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-edges-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const output = () => lines.join('\n');

const BLUEPRINT: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] },
};

function state(applications: Record<string, unknown>, provenance = 'complete'): void {
  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, blueprint: '4.1.0', provenance, operations: [], pending: null, applications,
  }));
}

function remove(cwd: string, patch: Partial<RemoveOptions> = {}): Promise<number> {
  return runRemove(cwd, {
    log: (line) => void lines.push(line),
    loadConfig: async () => BLUEPRINT,
    exec: () => {},
    ...patch,
  });
}

describe('runRemove · scope edges', () => {
  it('selects the adopted application that contains the working directory', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    write('src/pages/index.ts', 'export {};\n');

    expect(await remove(path.join(root, 'src/pages'), { dryRun: true })).toBe(0);
    expect(output()).toContain('Scope: `.` — the whole repository');
    expect(output()).toContain('− delete blueprint.config.mjs (Blueprint architecture config)');
  });

  it('finishes a removal whose config is already gone but whose records remain', async () => {
    state({ 'apps/web': { provenance: [{ kind: 'generated', path: 'CLAUDE.md' }] } });
    write('apps/web/CLAUDE.md', '## Architecture contract (generated from blueprint)\n');

    const loadConfig = async () => Promise.reject(new Error('gone'));

    expect(await remove(root, { loadConfig })).toBe(0);
    expect(exists('apps/web/CLAUDE.md')).toBe(false);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
  });

  it('treats an adopted application without records in present state as unrecorded', async () => {
    state({}, 'partial');
    write('blueprint.config.mjs', 'export default {};\n');
    write('blueprint-upgrade.md', '# pending\n');

    expect(await remove(root)).toBe(0);
    expect(exists('blueprint-upgrade.md')).toBe(false);
  });
});

describe('runRemove · refusals that protect the repository', () => {
  it('never lets recorded paths reach outside the application', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    write('secret.txt', 'keep me\n');

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '4.1.0', provenance: 'complete', operations: [], pending: null,
      applications: { '.': { provenance: [{ kind: 'generated', path: '../secret.txt' }] } },
    }));

    await expect(remove(path.join(root, 'app')))
      .rejects.toThrow('.blueprint-lifecycle.json is unreadable: its `applications` field is '
        + 'invalid');

    expect(exists('secret.txt')).toBe(true);
    expect(exists('blueprint.config.mjs')).toBe(true);
  });

  it('refuses to remove one application while an upgrade is pending', async () => {
    for (const app of ['apps/web', 'apps/admin']) {
      write(`${app}/blueprint.config.mjs`, 'export default {};\n');
    }

    write('.blueprint-lifecycle.json', JSON.stringify({
      schema: 1, blueprint: '4.0.0', provenance: 'complete', operations: [],
      pending: {
        from: '4.0.0', to: '4.1.0', migrations: [], completed: [],
        operations: [{
          id: 'review', applications: ['apps/web', 'apps/admin'], evidence: {}, supersedes: [],
        }],
      },
      applications: { 'apps/web': { provenance: [] }, 'apps/admin': { provenance: [] } },
    }));

    write('blueprint-upgrade.md', '# pending\n');

    const git: GitReader = (args) => ({
      status: 0,
      stdout: args[1] === '--show-toplevel' ? root : 'true',
      stderr: '',
    });

    await expect(remove(path.join(root, 'apps/web'), { git }))
      .rejects.toThrow('records an upgrade in progress, and apps/admin stay adopted');

    expect(exists('apps/web/blueprint.config.mjs')).toBe(true);

    expect(await remove(root, { git })).toBe(0);
    expect(exists('.blueprint-lifecycle.json')).toBe(false);
    expect(exists('blueprint-upgrade.md')).toBe(false);
  });
});

describe('runRemove · evidence edges', () => {
  it('uses configured merge targets, extension-less references, and the default '
    + 'handbook', async () => {
    write('blueprint.config.mjs', 'export default {};\n');
    write('docs/AGENT_NOTES', '<!-- BLUEPRINT:START -->\nx\n<!-- BLUEPRINT:END -->\n');
    write('docs/AGENT_NOTES.blueprint', 'reference\n');
    write('.cursor/custom.mdc', 'kept\n');

    const configured: Blueprint = {
      ...BLUEPRINT,
      emit: {
        agents: [
          { target: 'claude', path: 'docs/AGENT_NOTES' },
          { target: 'cursor', path: '.cursor/custom.mdc' },
        ],
      },
    };

    expect(await remove(root, { loadConfig: async () => configured })).toBe(0);
    expect(exists('docs')).toBe(false);
    expect(exists('.cursor/custom.mdc')).toBe(true);

    write('blueprint.config.mjs', 'export default {};\n');
    write('docs/architecture-handbook.md', 'hand-written\n');

    expect(await remove(root, { loadConfig: async () => Promise.reject(new Error('x')) })).toBe(0);
    expect(exists('docs/architecture-handbook.md')).toBe(true);
  });

  it('keeps recorded alias wiring when the config cannot be read to prove it unused', async () => {
    state({
      '.': { provenance: [{ kind: 'edit', path: 'tsconfig.json', before: '', after: '"x": 1, ' }] },
    });

    write('blueprint.config.mjs', 'export default {};\n');
    write('tsconfig.json', '{ "x": 1, "compilerOptions": {} }\n');
    write('package.json', '{ not json');

    const loadConfig = async () => Promise.reject(new Error('x'));

    expect(await remove(root, { dryRun: true, loadConfig })).toBe(0);

    expect(output())
      .toContain('· tsconfig.json: application source still imports `the configured alias`');
  });
});

describe('runRemove · Git and verification edges', () => {
  it('leaves transformation refs alone when Git does not list them', async () => {
    write('blueprint.config.mjs', 'export default {};\n');

    const git = (status: number): GitReader => (args) => ({
      status: args[0] === 'rev-parse' ? 0 : status,
      stdout: args[0] !== 'rev-parse'
        ? 'refs/other\n'
        : args[1] === '--show-toplevel' ? root : 'true',
      stderr: '',
    });

    for (const status of [0, 1]) {
      lines = [];
      write('blueprint.config.mjs', 'export default {};\n');
      expect(await remove(root, { dryRun: true, git: git(status) })).toBe(0);
      expect(output()).not.toContain('Git ref');
    }
  });

  it('reports a lifecycle state that reappeared before verification', async () => {
    state({ '.': { provenance: [] } });

    write('package.json', JSON.stringify({
      devDependencies: { '@kekkai/blueprint': '4.1.0', eslint: '9' },
    }));

    write('pnpm-lock.yaml', '');
    write('blueprint.config.mjs', 'export default {};\n');

    const commands: string[] = [];

    expect(await remove(root, {
      exec: (command) => {
        commands.push(command);
        write('package.json', '{ broken');
        write('blueprint.config.mjs', 'export default {};\n');
        state({});
      },
    })).toBe(1);

    expect(commands).toEqual(['pnpm remove @kekkai/blueprint']);
    expect(lines.at(-1)).toContain('✗ .blueprint-lifecycle.json');
    expect(lines.at(-1)).toContain('✗ blueprint.config.mjs');
  });

  it('parses unreadable manifests as empty', () => {
    expect(parseManifest(null)).toEqual({});
    expect(parseManifest('{')).toEqual({});
    expect(parseManifest('{"scripts":{"a":"b"}}')).toEqual({ scripts: { a: 'b' } });
  });
});
