import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReader } from '../project';
import { runRemove } from './remove';
import type { RemoveOptions } from './remove';

let root: string;
let lines: string[];
let gitCalls: string[][];

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-scope-')));
  lines = [];
  gitCalls = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const exists = (rel: string) => fs.existsSync(path.join(root, rel));

const CONFIG = 'export default {};\n';

function lifecycle(applications: Record<string, unknown>): void {
  write('.blueprint-lifecycle.json', JSON.stringify({
    schema: 1, blueprint: '4.1.0', provenance: 'complete', operations: [], pending: null,
    applications,
  }));
}

const git: GitReader = (args) => {
  gitCalls.push(args);

  if (args[0] === 'rev-parse') {
    return { status: 0, stdout: args[1] === '--show-toplevel' ? root : 'true', stderr: '' };
  }

  const deleted = gitCalls.some((call) =>
    call[0] === 'update-ref' && call[1] === '-d' && call[2] === args[2]);

  return {
    status: 0,
    stdout: args[0] === 'for-each-ref' && !deleted ? `${args[2]}\n` : '',
    stderr: '',
  };
};

function remove(cwd: string, patch: Partial<RemoveOptions> = {}): Promise<number> {
  return runRemove(cwd, {
    log: (line) => void lines.push(line),
    git,
    loadConfig: async () => ({
      framework: 'react',
      architecture: { alias: '~app', layers: [{ name: 'pages', does: 'x' }] },
    }),
    exec: () => {},
    ...patch,
  });
}

function adoptWorkspace(): void {
  write('package.json', JSON.stringify({
    devDependencies: { '@kekkai/blueprint': '^4.1.0', eslint: '^9' },
  }));

  for (const app of ['apps/admin', 'apps/web']) {
    write(`${app}/package.json`, '{}');
    write(`${app}/blueprint.config.mjs`, CONFIG);
    write(`${app}/docs/architecture-handbook.md`, '# Handbook\n\n> Generated from `blueprint.config` by `@kekkai/blueprint` — edit the blueprint, not this file.\n');
  }

  lifecycle({
    'apps/admin': { provenance: [{ kind: 'dependency', name: 'eslint' }] },
    'apps/web': { provenance: [{ kind: 'dependency', name: 'eslint' }] },
  });
}

describe('runRemove · repository scope', () => {
  it('de-adopts one application but keeps the shared package for its adopted sibling', async () => {
    adoptWorkspace();

    const commands: string[] = [];

    expect(await remove(path.join(root, 'apps/web'), {
      exec: (command) => void commands.push(command),
    })).toBe(0);

    expect(exists('apps/web/blueprint.config.mjs')).toBe(false);
    expect(exists('apps/web/docs')).toBe(false);
    expect(exists('apps/admin/blueprint.config.mjs')).toBe(true);
    expect(commands).toEqual([]);

    const state = path.join(root, '.blueprint-lifecycle.json');

    expect(JSON.parse(fs.readFileSync(state, 'utf-8')).applications)
      .toEqual({ 'apps/admin': { provenance: [{ kind: 'dependency', name: 'eslint' }] } });

    const output = lines.join('\n');

    expect(output).toContain('Scope: `apps/web`; still adopted and kept: `apps/admin`');

    expect(output).toContain('· @kekkai/blueprint in .: adopted applications outside this '
      + 'removal still use it');

    expect(output).toContain('✓ remove folder apps/web/docs (left empty by removing '
      + 'Blueprint files)');

    expect(output).toContain('✓ delete Git ref refs/blueprint/transformations/');
    expect(gitCalls).toContainEqual(expect.arrayContaining(['update-ref', '-d']));
  });

  it('removes every application, the lifecycle state, then the dependency last', async () => {
    adoptWorkspace();

    const order: string[] = [];

    expect(await remove(root, {
      exec: (command) => {
        order.push(`exec:${command}`);
        order.push(`state:${exists('.blueprint-lifecycle.json')}`);
      },
    })).toBe(1);

    expect(order).toEqual(['exec:npm uninstall @kekkai/blueprint eslint', 'state:false']);
    expect(lines.at(-1)).toContain('./package.json → @kekkai/blueprint');
  });

  it('keeps a recorded carrier that remaining project wiring still uses', async () => {
    adoptWorkspace();

    write('package.json', JSON.stringify({
      devDependencies: { '@kekkai/blueprint': '^4.1.0', eslint: '^9' },
      scripts: { check: 'eslint .' },
    }));

    const commands: string[] = [];

    await remove(root, { exec: (command) => void commands.push(command) });

    expect(commands).toEqual(['npm uninstall @kekkai/blueprint']);
    expect(lines.join('\n')).toContain('· eslint in .: remaining project files still reference it');
  });

  it('refuses to guess when nothing is adopted under the working directory', async () => {
    await expect(remove(root)).rejects.toThrow(`no adopted application was found at or below ${root}`);
  });
});

describe('runRemove · the lifecycle authority during a scoped removal', () => {
  it('keeps the complete authority until a failed scoped removal can be retried', async () => {
    adoptWorkspace();
    const application = path.join(root, 'apps/web');

    await expect(remove(application, {
      log: (line) => {
        lines.push(line);

        if (line.includes('✓ delete apps/web/blueprint.config.mjs')) {
          write('apps/web/blueprint.config.mjs', CONFIG);
        }
      },
    })).rejects.toThrow('apps/web/blueprint.config.mjs still exists');

    const authority = JSON.parse(fs.readFileSync(
      path.join(root, '.blueprint-lifecycle.json'), 'utf8',
    ));

    expect(Object.keys(authority.applications)).toEqual(['apps/admin', 'apps/web']);
    expect(await remove(application)).toBe(0);

    const narrowed = JSON.parse(fs.readFileSync(
      path.join(root, '.blueprint-lifecycle.json'), 'utf8',
    ));

    expect(Object.keys(narrowed.applications)).toEqual(['apps/admin']);
  });

  it('replaces the state only with the complete narrowed state, through its draft', async () => {
    adoptWorkspace();

    const authority = path.join(root, '.blueprint-lifecycle.json');
    const before = fs.readFileSync(authority, 'utf-8');
    const rename = fs.renameSync;
    const seen: { authority: string; draft: string }[] = [];

    const replace = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      seen.push({
        authority: fs.readFileSync(to, 'utf-8'), draft: fs.readFileSync(from, 'utf-8'),
      });

      rename(from, to);
    });

    expect(await remove(path.join(root, 'apps/web'))).toBe(0);

    const calls = [...replace.mock.calls];

    replace.mockRestore();

    expect(calls).toEqual([[`${authority}.tmp`, authority]]);
    expect(seen[0].authority).toBe(before);

    expect(JSON.parse(seen[0].draft).applications)
      .toEqual({ 'apps/admin': { provenance: [{ kind: 'dependency', name: 'eslint' }] } });

    expect(fs.readFileSync(authority, 'utf-8')).toBe(seen[0].draft);
    expect(exists('.blueprint-lifecycle.json.tmp')).toBe(false);
  });
});

describe('runRemove · lifecycle state guards', () => {
  it('fails closed on unreadable lifecycle state', async () => {
    write('blueprint.config.mjs', CONFIG);
    write('.blueprint-lifecycle.json', '{');

    await expect(remove(root)).rejects.toThrow('.blueprint-lifecycle.json is unreadable');
  });

  it('fails closed when a lifecycle-aware install lost its state', async () => {
    write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': '4.1.0' } }));
    write('blueprint.config.mjs', CONFIG);

    write('node_modules/@kekkai/blueprint/package.json', JSON.stringify({
      name: '@kekkai/blueprint', version: '4.1.0',
    }));

    await expect(remove(root)).rejects.toThrow('.blueprint-lifecycle.json is missing, but '
      + '@kekkai/blueprint 4.1.0 always records it');
  });

  it('removes only proven artifacts when the state file never entered Git history', async () => {
    write('package.json', JSON.stringify({ devDependencies: { '@kekkai/blueprint': '4.1.0' } }));
    write('blueprint.config.mjs', CONFIG);

    write('node_modules/@kekkai/blueprint/package.json', JSON.stringify({
      name: '@kekkai/blueprint', version: '4.1.0',
    }));

    const neverRecorded: GitReader = (args, cwd) => args[0] === 'rev-list'
      ? { status: 0, stdout: '', stderr: '' }
      : args[1] === '--is-shallow-repository'
        ? { status: 0, stdout: 'false\n', stderr: '' }
        : git(args, cwd);

    await remove(root, { dryRun: true, git: neverRecorded });

    expect(lines.join('\n')).toContain('no lifecycle records, so only name- or content-proven '
      + 'Blueprint artifacts are removed');
  });
});
