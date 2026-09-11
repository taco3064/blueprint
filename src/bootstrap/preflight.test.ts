import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runTransformationPreflight } from './preflight';
import type { GitReader, GitReadResult } from './preflight';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-preflight-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const ok = (stdout = ''): GitReadResult => ({ status: 0, stdout, stderr: '' });
const failed = (stderr = ''): GitReadResult => ({ status: 1, stdout: '', stderr });
const inspected = async () => ({ findings: [] });

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);

  return result.stdout.trim();
}

function write(relative: string, content: string): void {
  const file = path.join(root, relative);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function initRepository(): void {
  git(root, 'init', '--quiet');
}

function commitAll(): string {
  git(root, 'add', '.');

  git(
    root,
    '-c',
    'user.name=Blueprint Test',
    '-c',
    'user.email=blueprint@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'baseline',
  );

  return git(root, 'rev-parse', 'HEAD');
}

function initInspectableProject(): { head: string; repositoryRoot: string } {
  write('package.json', JSON.stringify({ dependencies: { vue: '^3' } }));

  write('blueprint.config.mjs', [
    'export default {',
    '  framework: \'vue\',',
    '  architecture: { alias: \'~app\', layers: [',
    '    { name: \'pages\', does: \'Routes.\' },',
    '    { name: \'services\', does: \'External access.\' },',
    '  ] },',
    '};',
    '',
  ].join('\n'));

  write('src/pages/Home.vue', '<template />\n');
  write('src/undeclared/value.ts', 'export const value = 1;\n');
  initRepository();

  return {
    head: commitAll(),
    repositoryRoot: git(root, 'rev-parse', '--show-toplevel'),
  };
}

describe('runTransformationPreflight · injected effects', () => {
  it.each([[[]], [['apps/web', 'apps/admin']]])(
    'requires exactly one selected application for %#',
    async (selected) => {
      let calls = 0;

      const neverGit: GitReader = () => {
        calls += 1;

        return ok();
      };

      const result = await runTransformationPreflight(root, selected, {
        git: neverGit,
        inspect: async () => {
          calls += 1;

          return { findings: [] };
        },
      });

      expect(result.ok).toBe(false);

      expect(result.scope).toEqual({
        ok: false,
        reason: `Exactly one application scope must be selected; received ${selected.length}.`,
      });

      expect(result.repository.ok).toBe(false);
      expect(result.worktree.ok).toBe(false);
      expect(result.head.ok).toBe(false);
      expect(result.inspection.ok).toBe(false);
      expect(calls).toBe(0);
    },
  );

  it(
    'reads Git with argv, checks the worktree, and keeps findings usable',
    async () => {
      const calls: { args: string[]; cwd: string }[] = [];

      const readGit: GitReader = (args, cwd) => {
        calls.push({ args, cwd });

        if (args.includes('--is-inside-work-tree')) {
          return ok('true\n');
        }

        if (args.includes('--show-toplevel')) {
          return ok(`${root}\n`);
        }

        if (args[0] === 'status') {
          return ok(' M src/pages/Home.ts\n?? src/pages/New.ts\n');
        }

        return ok('abc123\n');
      };

      const finding = {
        severity: 'error' as const,
        rule: 'flow-violation',
        path: 'src/pages/Home.ts',
        subject: '~app/pages/Other',
        message: 'Existing architecture debt.',
      };

      const result = await runTransformationPreflight(root, ['src'], {
        git: readGit,
        inspect: async () => ({ findings: [finding] }),
      });

      expect(result.ok).toBe(false);
      expect(result.repository).toEqual({ ok: true, root });
      expect(result.scope).toEqual({ ok: true, selected: 'src' });

      expect(result.worktree).toEqual({
        ok: false,
        changes: [' M src/pages/Home.ts', '?? src/pages/New.ts'],
        reason: 'The Git worktree has uncommitted changes.',
      });

      expect(result.head).toEqual({ ok: true, commit: 'abc123' });
      expect(result.inspection).toEqual({ ok: true, findings: [finding] });
      expect(calls.every((call) => call.cwd === root)).toBe(true);

      expect(calls.map((call) => call.args)).toContainEqual([
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignore-submodules=none',
        '--',
        '.',
      ]);
    },
  );
});

describe('runTransformationPreflight · injected failures', () => {
  it('reports Git execution and inspection failures without throwing', async () => {
    const readGit: GitReader = (args) => args.includes('--is-inside-work-tree')
      ? { ...failed(), status: null, error: new Error('git unavailable') }
      : failed('not reached');

    const result = await runTransformationPreflight(root, ['.'], {
      git: readGit,
      inspect: async () => {
        throw new Error('blueprint.config.mjs: invalid architecture');
      },
    });

    expect(result.repository).toEqual({ ok: false, reason: 'git unavailable' });
    expect(result.worktree.reason).toContain('outside a Git worktree');
    expect(result.head.reason).toContain('outside a Git worktree');

    expect(result.inspection).toEqual({
      ok: false,
      reason: 'Pre-transform inspection could not produce usable evidence: '
        + 'blueprint.config.mjs: invalid architecture',
    });
  });

  it('reports failed status and HEAD probes using Git stderr', async () => {
    const readGit: GitReader = (args) => {
      if (args.includes('--is-inside-work-tree')) {
        return ok('true');
      }

      if (args.includes('--show-toplevel')) {
        return ok(root);
      }

      if (args[0] === 'status') {
        return failed('status failed');
      }

      return failed('unknown revision');
    };

    const result = await runTransformationPreflight(root, ['.'], {
      git: readGit,
      inspect: inspected,
    });

    expect(result.worktree).toEqual({ ok: false, reason: 'status failed' });
    expect(result.head).toEqual({ ok: false, reason: 'unknown revision' });
  });
});

describe('runTransformationPreflight · injected boundary failures', () => {
  it.each([
    [{ status: 1, stdout: 'true', stderr: '' }, 'repository'],
    [{ status: 0, stdout: 'true', stderr: '', error: new Error('spawn failed') }, 'repository'],
  ] satisfies [GitReadResult, string][])('requires a successful inside probe for %#', async (
    inside,
    _label,
  ) => {
    const result = await runTransformationPreflight(root, ['.'], {
      git: () => inside,
      inspect: inspected,
    });

    expect(result.repository.ok).toBe(false);
  });

  it('rejects a successful inside probe whose answer is not true', async () => {
    const result = await runTransformationPreflight(root, ['.'], {
      git: () => ok('false'),
      inspect: inspected,
    });

    expect(result.repository.ok).toBe(false);
  });

  it('rejects whitespace-only roots and HEAD output from failed commands', async () => {
    const topWhitespace: GitReader = (args) => args.includes('--is-inside-work-tree')
      ? ok('true')
      : ok('   ');

    const rootResult = await runTransformationPreflight(root, ['.'], {
      git: topWhitespace,
      inspect: inspected,
    });

    expect(rootResult.repository).toEqual({
      ok: false,
      reason: 'The Git worktree root could not be resolved.',
    });

    const failedHead: GitReader = (args) => {
      if (args.includes('--is-inside-work-tree')) {
        return ok('true');
      }

      if (args.includes('--show-toplevel')) {
        return ok(root);
      }

      if (args[0] === 'status') {
        return ok();
      }

      return { status: 1, stdout: 'abc123', stderr: '' };
    };

    const headResult = await runTransformationPreflight(root, ['.'], {
      git: failedHead,
      inspect: inspected,
    });

    expect(headResult.head).toEqual({
      ok: false,
      reason: 'No committed, recoverable HEAD exists.',
    });
  });

  it('falls back when Git only returns whitespace on stderr', async () => {
    const result = await runTransformationPreflight(root, ['.'], {
      git: () => ({ status: 1, stdout: '', stderr: '   ' }),
      inspect: inspected,
    });

    expect(result.repository).toEqual({
      ok: false,
      reason: 'The selected application is not inside a Git worktree.',
    });
  });

  it.each([
    [failed('root failed'), 'root failed'],
    [ok(), 'The Git worktree root could not be resolved.'],
    [{ ...ok(), error: new Error('root unavailable') }, 'root unavailable'],
  ] satisfies [GitReadResult, string][])(
    'requires a readable Git worktree root for %#',
    async (topLevel, reason) => {
      const readGit: GitReader = (args) => args.includes('--is-inside-work-tree')
        ? ok('true')
        : topLevel;

      const result = await runTransformationPreflight(root, ['.'], {
        git: readGit,
        inspect: inspected,
      });

      expect(result.repository).toEqual({ ok: false, reason });
    },
  );

  it('describes non-Error inspection failures', async () => {
    const result = await runTransformationPreflight(root, ['.'], {
      git: () => failed(),
      inspect: async () => Promise.reject('analysis stopped'),
    });

    expect(result.inspection.reason).toContain('analysis stopped');
  });
});

describe('runTransformationPreflight · child process failure', () => {
  it('reports a selected application whose working directory does not exist', async () => {
    const missing = path.join(root, 'missing');
    const result = await runTransformationPreflight(missing, ['src'], { inspect: inspected });

    expect(result.repository.ok).toBe(false);
    expect(result.repository.reason).toContain('ENOENT');
  });
});

describe('runTransformationPreflight · real Git controls', () => {
  it('distinguishes a plain directory from an unborn Git worktree', async () => {
    const plain = await runTransformationPreflight(root, ['.'], { inspect: inspected });

    expect(plain.repository.ok).toBe(false);
    expect(plain.repository.reason).toContain('not a git repository');
    expect(plain.head.ok).toBe(false);

    initRepository();
    const repositoryRoot = git(root, 'rev-parse', '--show-toplevel');

    const unborn = await runTransformationPreflight(root, ['.'], { inspect: inspected });

    expect(unborn.repository).toEqual({ ok: true, root: repositoryRoot });
    expect(unborn.worktree).toEqual({ ok: true, changes: [] });
    expect(unborn.head.ok).toBe(false);
  });

  it(
    'accepts a clean committed application and runs real inspection despite findings',
    async () => {
      const { head, repositoryRoot } = initInspectableProject();

      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await runTransformationPreflight(root, ['.']);

      expect(result.ok).toBe(true);
      expect(result.repository).toEqual({ ok: true, root: repositoryRoot });
      expect(result.worktree).toEqual({ ok: true, changes: [] });
      expect(result.head).toEqual({ ok: true, commit: head });
      expect(result.inspection.ok).toBe(true);

      expect(result.inspection.findings?.some((finding) => finding.rule === 'undeclared-folder'))
        .toBe(true);

      expect(consoleLog).not.toHaveBeenCalled();

      consoleLog.mockRestore();
    },
  );

  it(
    'rejects dirtiness anywhere in a nested application worktree, including untracked files',
    async () => {
      write('apps/web/package.json', '{}');
      write('apps/web/src/main.ts', 'export const value = 1;\n');
      write('apps/admin/package.json', '{}');
      initRepository();
      commitAll();
      write('apps/admin/outside.ts', 'export {};\n');
      const applicationRoot = path.join(root, 'apps/web');

      const dirtySibling = await runTransformationPreflight(applicationRoot, ['src'], {
        inspect: inspected,
      });

      expect(dirtySibling.worktree).toEqual({
        ok: false,
        changes: ['?? apps/admin/outside.ts'],
        reason: 'The Git worktree has uncommitted changes.',
      });

      commitAll();

      write('apps/web/src/main.ts', 'export const value = 2;\n');
      write('apps/web/src/new.ts', 'export const added = true;\n');

      const dirty = await runTransformationPreflight(applicationRoot, ['src'], {
        inspect: inspected,
      });

      expect(dirty.worktree.ok).toBe(false);

      expect(dirty.worktree.changes).toEqual([
        ' M apps/web/src/main.ts',
        '?? apps/web/src/new.ts',
      ]);
    },
  );
});
