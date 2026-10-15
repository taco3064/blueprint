import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveArchitecture } from '../config';
import { collectOutsideScopeWith } from './outside-scope';
import { readSourceFile, scan } from './scan';

let parent: string;
let root: string;

const architecture = {
  alias: '~app', sourceRoot: 'src', modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI' }],
};

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-links-'));
  root = path.join(parent, 'app');
  fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/auth/index.ts'), '');
  fs.writeFileSync(path.join(root, '.gitignore'), 'linked/\n');
  fs.mkdirSync(path.join(parent, 'sibling/deep'), { recursive: true });
  fs.writeFileSync(path.join(parent, 'sibling/deep/run.ts'), 'export const value = 1;');
  spawnSync('git', ['init', '-q'], { cwd: root });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(parent, { recursive: true, force: true });
});

function collect(consumerFiles: string[], reference = false) {
  if (reference) {
    fs.writeFileSync(path.join(root, 'src/auth/index.ts'), 'import \'../../linked/deep/run\';');
  }

  const source = scan(root);
  const readFile = vi.fn(readSourceFile);
  const directories = vi.spyOn(fs, 'readdirSync');

  const result = collectOutsideScopeWith(root, resolveArchitecture({
    ...architecture, consumerFiles,
  }), { scan: source, options: { readFile } });

  return { result, readFile, directories };
}

describe('outside inventory physical boundaries', () => {
  it.each([
    { consumerFiles: ['linked/deep/*.ts'], reference: false },
    { consumerFiles: ['linked/**/*.ts'], reference: false },
    { consumerFiles: [], reference: true },
  ])('refuses escaping roots before traversal: %j', ({ consumerFiles, reference }) => {
    fs.symlinkSync(path.join(parent, 'sibling'), path.join(root, 'linked'), 'junction');
    const { result, readFile, directories } = collect(consumerFiles, reference);

    expect(result).toMatchObject({
      status: 'partial', files: [], inventoryFiles: 0, readFiles: 0, parsedFiles: 0,
      directoryWalks: 0,
    });

    expect(directories).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();

    expect('limitations' in result && result.limitations).toContain(
      `${consumerFiles[0] === 'linked/deep/*.ts' ? 'linked/deep' : 'linked'}: directory resolves outside the application root`,
    );

    if (reference) {
      expect('limitations' in result && result.limitations).toContain(
        'src/auth/index.ts: unresolved project reference linked/deep/run',
      );
    }
  });

  it.each([false, true])('collects a normal application directory, referenced=%s', (reference) => {
    fs.mkdirSync(path.join(root, 'linked/deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'linked/deep/run.ts'), 'export const value = 1;');
    const consumers = reference ? [] : ['linked/deep/*.ts'];
    const { result, readFile, directories } = collect(consumers, reference);

    expect(result).toMatchObject({
      status: 'complete', files: [{ path: 'linked/deep/run.ts' }], inventoryFiles: 1,
      readFiles: 1, parsedFiles: 1, directoryWalks: reference ? 2 : 1, limitations: [],
    });

    expect(readFile.mock.calls).toEqual([[root, 'linked/deep/run.ts']]);

    expect(directories.mock.calls.map(([directory]) => directory)).toEqual(
      (reference ? ['linked', 'linked/deep'] : ['linked/deep'])
        .map((directory) => path.join(fs.realpathSync.native(root), directory)),
    );
  });
});

describe('outside inventory symlink completeness', () => {
  it('reports an internal directory symlink without silently certifying collection', () => {
    fs.mkdirSync(path.join(root, 'safe/deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'safe/deep/run.ts'), '');
    fs.writeFileSync(path.join(root, '.gitignore'), 'linked/\nsafe/\n');
    fs.symlinkSync(path.join(root, 'safe'), path.join(root, 'linked'), 'junction');
    const { result, readFile, directories } = collect(['linked/**']);

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 0, readFiles: 0, directoryWalks: 0,
      limitations: ['linked: symbolic-link directory could not be inventoried'],
    });

    expect(directories).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('allows an intermediate symlink whose physical directory stays inside the application', () => {
    fs.mkdirSync(path.join(root, 'safe/deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'safe/deep/run.ts'), '');
    fs.writeFileSync(path.join(root, '.gitignore'), 'linked/\nsafe/\n');
    fs.symlinkSync(path.join(root, 'safe'), path.join(root, 'linked'), 'junction');
    const { result, readFile } = collect(['linked/deep/*.ts']);

    expect(result).toMatchObject({
      status: 'complete', inventoryFiles: 1, readFiles: 1, parsedFiles: 1, directoryWalks: 1,
      limitations: [],
    });

    expect(readFile.mock.calls).toEqual([[root, 'linked/deep/run.ts']]);
  });

  it('rejects a directory resolving to the exact application parent', () => {
    fs.symlinkSync(parent, path.join(root, 'linked'), 'junction');
    const { result, readFile, directories } = collect(['linked/**']);

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 0, directoryWalks: 0,
      limitations: ['linked: directory resolves outside the application root'],
    });

    expect(directories).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects a different-volume directory before traversal', () => {
    fs.mkdirSync(path.join(root, 'linked'));
    const relative = path.relative;
    const canonical = fs.realpathSync.native(path.join(root, 'linked'));

    vi.spyOn(path, 'relative').mockImplementation((from, to) =>
      to === canonical ? path.resolve(path.sep, 'other-volume') : relative(from, to));

    const { result, readFile, directories } = collect(['linked/**']);

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 0, directoryWalks: 0,
      limitations: ['linked: directory resolves outside the application root'],
    });

    expect(directories).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('records a nested directory link but leaves non-source file links alone', () => {
    fs.mkdirSync(path.join(root, 'linked'));
    fs.symlinkSync(path.join(parent, 'sibling'), path.join(root, 'linked/escape'), 'junction');
    fs.writeFileSync(path.join(root, 'asset.svg'), '<svg/>');
    fs.symlinkSync(path.join(root, 'asset.svg'), path.join(root, 'linked/asset.svg'), 'file');
    const { result, readFile, directories } = collect(['linked/**']);

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 0, readFiles: 0, directoryWalks: 1,
      limitations: ['linked/escape: directory resolves outside the application root'],
    });

    expect(directories.mock.calls.map(([directory]) => directory))
      .toEqual([path.join(fs.realpathSync.native(root), 'linked')]);

    expect(readFile).not.toHaveBeenCalled();
  });

  it('preserves incomplete evidence for a broken directory link', () => {
    fs.mkdirSync(path.join(root, 'linked'));
    fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'linked/broken'), 'junction');
    const { result, readFile, directories } = collect(['linked/**']);

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 0, readFiles: 0, directoryWalks: 1,
      limitations: ['linked/broken: symbolic-link directory could not be inventoried'],
    });

    expect(directories.mock.calls.map(([directory]) => directory))
      .toEqual([path.join(fs.realpathSync.native(root), 'linked')]);

    expect(readFile).not.toHaveBeenCalled();
  });
});
