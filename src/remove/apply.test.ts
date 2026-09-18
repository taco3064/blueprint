import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitReader } from '../project';
import { applyRemoval } from './apply';
import type { RemovalAction } from './types';

let root: string;
let lines: string[];
let refs: string[][];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-apply-')));
  lines = [];
  refs = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const exists = (rel: string) => fs.existsSync(path.join(root, rel));

const git: GitReader = (args, cwd) => {
  refs.push([...args, cwd]);

  return { status: 0, stdout: '', stderr: '' };
};

function apply(actions: RemovalAction[], boundaries: string[] = [root]): void {
  applyRemoval(actions, { root, boundaries, git, log: (line) => void lines.push(line) });
}

describe('applyRemoval', () => {
  it('writes, deletes, removes folders, and drops refs before the config and lifecycle '
    + 'state, keeping plan order within a phase', () => {
    write('.blueprint-lifecycle.json');
    write('blueprint.config.mjs');
    write('src/pages/.gitkeep');
    write('docs/a.md');
    write('docs/b.md');
    write('CLAUDE.md', 'old');

    apply([
      { kind: 'delete', path: '.blueprint-lifecycle.json', reason: 'lifecycle-state' },
      { kind: 'delete', path: 'blueprint.config.mjs', reason: 'config' },
      { kind: 'ref', ref: 'refs/blueprint/transformations/abc', application: '.' },
      { kind: 'rmdir', path: 'src/pages', reason: 'directory' },
      { kind: 'delete', path: 'docs/b.md', reason: 'generated' },
      { kind: 'delete', path: 'docs/a.md', reason: 'generated' },
      { kind: 'write', path: 'CLAUDE.md', content: 'new', reason: 'section' },
    ]);

    expect(lines).toEqual([
      '  ✓ rewrite CLAUDE.md (Blueprint-managed section; content outside the markers is kept)',
      '  ✓ delete docs/b.md (Blueprint-generated output)',
      '  ✓ delete docs/a.md (Blueprint-generated output)',
      '  ✓ remove folder docs (left empty by removing Blueprint files)',
      '  ✓ remove folder src/pages (empty layer folder Blueprint created)',
      '  ✓ remove folder src (left empty by removing Blueprint files)',
      '  ✓ delete Git ref refs/blueprint/transformations/abc (retained transformation origin '
      + 'for `.`)',
      '  ✓ delete blueprint.config.mjs (Blueprint architecture config)',
      '  ✓ delete .blueprint-lifecycle.json (Blueprint lifecycle state)',
    ]);

    expect(refs).toEqual([['update-ref', '-d', 'refs/blueprint/transformations/abc', root]]);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8')).toBe('new');
    expect(fs.readdirSync(root)).toEqual(['CLAUDE.md']);
  });

  it('tolerates targets that are already gone and folders that still hold files', () => {
    write('docs/kept.md');
    write('src/pages/Home.tsx');

    apply([
      { kind: 'delete', path: 'gone/file.md', reason: 'generated' },
      { kind: 'delete', path: 'docs/missing.md', reason: 'generated' },
      { kind: 'rmdir', path: 'src/pages', reason: 'directory' },
      { kind: 'rmdir', path: 'src/absent', reason: 'directory' },
    ]);

    expect(exists('docs/kept.md')).toBe(true);
    expect(exists('src/pages')).toBe(false);

    expect(lines).toEqual([
      '  ✓ delete gone/file.md (Blueprint-generated output)',
      '  ✓ delete docs/missing.md (Blueprint-generated output)',
      '  ✓ remove folder src/pages (empty layer folder Blueprint created)',
      '  ✓ remove folder src (left empty by removing Blueprint files)',
      '  ✓ remove folder src/absent (empty layer folder Blueprint created)',
    ]);
  });

  it('replaces the lifecycle state through its draft instead of rewriting it in place', () => {
    write('.blueprint-lifecycle.json', 'old');

    const rename = vi.spyOn(fs, 'renameSync');

    apply([{
      kind: 'write', path: '.blueprint-lifecycle.json', content: 'kept', reason: 'lifecycle-state',
    }]);

    expect(rename).toHaveBeenCalledWith(
      path.join(root, '.blueprint-lifecycle.json.tmp'),
      path.join(root, '.blueprint-lifecycle.json'),
    );

    expect(fs.readFileSync(path.join(root, '.blueprint-lifecycle.json'), 'utf-8')).toBe('kept');
    expect(exists('.blueprint-lifecycle.json.tmp')).toBe(false);
    rename.mockRestore();
  });

  it('never removes an adopted application root that became empty', () => {
    write('apps/web/docs/a.md');

    apply(
      [{ kind: 'delete', path: 'apps/web/docs/a.md', reason: 'generated' }],
      [root, path.join(root, 'apps/web')],
    );

    expect(exists('apps/web')).toBe(true);
    expect(exists('apps/web/docs')).toBe(false);
  });
});
