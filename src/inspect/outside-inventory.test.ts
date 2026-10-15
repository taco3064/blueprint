import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveArchitecture } from '../config';
import { defaultGitReader } from '../project';
import { consumerSearchRoot, outsideInventory } from './outside-inventory';
import { collectOutsideScope } from './outside-scope';
import { scan } from './scan';

let root: string;

const definition = {
  alias: '~app', sourceRoot: 'src', modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI' }],
};

function write(file: string, content = ''): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-inventory-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  write('src/auth/index.ts');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(`${root}-external.ts`, { force: true });
  fs.rmSync(`${root}-external`, { recursive: true, force: true });
});

describe('outside inventory policy boundaries', () => {
  it.each([
    'node_modules', '.next', '.nuxt', '.turbo', '.cache', 'dist', 'build', 'out', 'coverage',
  ])('does not reach existing scanner exclusion %s via Git or explicit roots', (directory) => {
    write(`${directory}/run.ts`);
    write('keep.ts');
    const resolved = resolveArchitecture({ ...definition, consumerFiles: `${directory}/**` });

    expect(outsideInventory(root, resolved, { scan: scan(root) })).toEqual({
      mode: 'git-visible', files: ['keep.ts'], directoryWalks: 0, limitations: [],
      contributions: { repositoryVisible: 1, explicitConsumerRoot: 0, governedReference: 0 },
    });
  });

  it('sorts overlapping roots and rejects unreachable roots', () => {
    write('.gitignore', 'tools/\n');
    write('tools/nested/a.ts');
    write('tools/b.ts');
    write('marker');

    const patterns = [
      'tools/nested/*.ts', 'tools/**', 'src/**', 'missing/**', '../**', 'marker/**',
    ];

    const run = (consumerFiles: string[]) => outsideInventory(root,
      resolveArchitecture({ ...definition, consumerFiles }), { scan: scan(root) });

    expect(run(patterns)).toEqual({
      mode: 'git-visible', files: ['tools/b.ts', 'tools/nested/a.ts'], directoryWalks: 2,
      limitations: ['..: directory resolves outside the application root'],
      contributions: { repositoryVisible: 0, explicitConsumerRoot: 2, governedReference: 0 },
    });

    expect(run([...patterns].reverse())).toEqual(run(patterns));
  });

  it('discards tracked deletions and rejects failed Git inventory', () => {
    write('tools/deleted.ts');
    spawnSync('git', ['add', 'tools/deleted.ts'], { cwd: root });
    fs.unlinkSync(path.join(root, 'tools/deleted.ts'));
    const resolved = resolveArchitecture(definition);

    expect(outsideInventory(root, resolved, { scan: scan(root) }).files).toEqual([]);

    const git: typeof defaultGitReader = (args, cwd) => args[0] === 'ls-files'
      ? { status: 1, stdout: '', stderr: 'failed' }
      : defaultGitReader(args, cwd);

    expect(() => outsideInventory(root, resolved, { scan: scan(root), git }))
      .toThrow('Git outside-source inventory could not be collected.');
  });

  it('test-only governed references do not expand ignored directories or degrade health', () => {
    write('.gitignore', 'tools/\n');
    write('src/auth/example.test.ts', 'import \'../../tools/run\'; import(target);');
    write('tools/run.ts', 'const = ;');

    expect(collectOutsideScope(root, resolveArchitecture(definition), scan(root))).toMatchObject({
      status: 'complete', inventoryFiles: 0, readFiles: 0, parsedFiles: 0,
      directoryWalks: 0, limitations: [],
    });
  });

  it('governed dynamic imports and parse failures make scope partial', () => {
    write('src/auth/index.ts', 'import(target);');
    write('src/auth/bad.ts', 'const = ;');

    expect(collectOutsideScope(root, resolveArchitecture(definition), scan(root))).toMatchObject({
      status: 'partial', limitations: [
        'src/auth/bad.ts: governed import parsing failed',
        'src/auth/index.ts: unresolved governed import targets',
      ],
    });
  });

  it('retains tracked internal file symlinks and marks escaping links partial', () => {
    write('tools/target.ts', 'export const x = 1;');
    fs.symlinkSync(path.join(root, 'tools/target.ts'), path.join(root, 'tools/link.ts'), 'file');

    fs.writeFileSync(`${root}-external.ts`, 'export const external = 1;');
    fs.symlinkSync(`${root}-external.ts`, path.join(root, 'tools/escape.ts'), 'file');

    spawnSync('git', ['add', 'tools/link.ts', 'tools/escape.ts'], { cwd: root });

    expect(collectOutsideScope(root, resolveArchitecture({
      ...definition, consumerFiles: 'tools/**',
    }), scan(root))).toMatchObject({
      status: 'partial', inventoryFiles: 3, readFiles: 2, parsedFiles: 2,
      files: [{ path: 'tools/link.ts' }, { path: 'tools/target.ts' }],
      limitations: ['tools/escape.ts: source resolves outside the application root'],
    });
  });

  it('does not treat special filesystem entries as source files', () => {
    fs.mkdirSync(path.join(root, 'tools'));

    vi.spyOn(fs, 'readdirSync').mockReturnValue([{
      name: 'pipe.ts', isDirectory: () => false, isFile: () => false,
      isSymbolicLink: () => false,
    }] as unknown as ReturnType<typeof fs.readdirSync>);

    expect(outsideInventory(root, resolveArchitecture({
      ...definition, consumerFiles: 'tools/**',
    }), { scan: { files: [], topDirs: [] } })).toMatchObject({ files: [], directoryWalks: 1 });
  });
});

describe('consumer literal roots follow the portable glob dialect', () => {
  it.each([
    ['tools[demo]/consumer.ts', 'tools[demo]'],
    ['tools{demo/consumer.ts', 'tools{demo'],
    ['tools}demo/consumer.ts', 'tools}demo'],
    ['tools/{demo,other}/consumer.ts', 'tools'],
    ['tools/{nested/demo,other}/consumer.ts', 'tools'],
    ['tools/demo*/consumer.ts', 'tools'],
    ['tools/demo?/consumer.ts', 'tools'],
  ])('retains the narrow literal root of %s', (pattern, expected) => {
    expect(consumerSearchRoot(pattern)).toBe(expected);
  });

  it.each(['tools[demo]', 'tools{demo', 'tools}demo'])(
    'does not expand ignored noise for literal directory %s', (directory) => {
      write('.gitignore', '*\n');
      write(`${directory}/consumer.ts`, 'import \'../src/auth\';');
      write(`${directory}/ordinary.ts`);
      write('unrelated/noise.ts', 'const = ;');

      const resolved = resolveArchitecture({
        ...definition, consumerFiles: `${directory}/consumer.ts`,
      });

      expect(collectOutsideScope(root, resolved, scan(root))).toMatchObject({
        status: 'complete', inventoryFiles: 2, readFiles: 2, parsedFiles: 2,
        directoryWalks: 1, limitations: [],
        files: [{ path: `${directory}/consumer.ts` }, { path: `${directory}/ordinary.ts` }],
        contributions: { repositoryVisible: 0, explicitConsumerRoot: 2, governedReference: 0 },
      });
    },
  );
});

describe('outside inventory mutation witnesses', () => {
  it.each([
    ['tools//nested/entry.ts', 'tools/nested'],
    ['tools/nested/entry.ts', 'tools/nested'],
    ['entry.ts', ''], ['a', ''], ['tools/nested/a', 'tools/nested'],
    ['t*/nested/entry.ts', ''],
  ])('preserves literal-root boundaries for %s', (pattern, expected) => {
    expect(consumerSearchRoot(pattern)).toBe(expected);
  });

  it('does not inventory a physically existing escaping explicit root', () => {
    fs.mkdirSync(`${root}-external`);
    fs.writeFileSync(path.join(`${root}-external`, 'noise.ts'), 'not parsed');

    const resolved = resolveArchitecture({
      ...definition, consumerFiles: `../${path.basename(root)}-external/**`,
    });

    expect(outsideInventory(root, resolved, { scan: scan(root) })).toMatchObject({
      files: [], directoryWalks: 0,
      contributions: { repositoryVisible: 0, explicitConsumerRoot: 0, governedReference: 0 },
    });
  });

  it('does not expand empty directory identities from package and governed references', () => {
    write('.gitignore', 'noise/\n');
    write('noise/ignored.ts');
    write('src/auth/index.ts', 'import \'react\'; import \'~app/auth\';');

    expect(outsideInventory(root, resolveArchitecture(definition), { scan: scan(root) }))
      .toMatchObject({ files: [], directoryWalks: 0 });
  });

  it.each(['explicit', 'referenced'])(
    'visits %s directories in deterministic sorted order', (mode) => {
      write('.gitignore', 'z/\na/\n');
      write('z/run.ts');
      write('a/run.ts');
      write('src/auth/index.ts', 'import \'../../z/run\'; import \'../../a/run\';');

      const resolved = resolveArchitecture({
        ...definition, consumerFiles: mode === 'explicit' ? ['z/**', 'a/**'] : [],
      });

      const source = scan(root);
      const canonicalRoot = fs.realpathSync.native(root);
      const read = vi.spyOn(fs, 'readdirSync');

      expect(outsideInventory(root, resolved, { scan: source }).files)
        .toEqual(['a/run.ts', 'z/run.ts']);

      expect(read.mock.calls.map(([directory]) => directory))
        .toEqual([path.join(canonicalRoot, 'a'), path.join(canonicalRoot, 'z')]);
    },
  );
});
