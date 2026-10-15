import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { collectOutsideScope, collectOutsideScopeWith } from './outside-scope';
import { consumerSearchRoot } from './outside-inventory';
import { readSourceFile, scan } from './scan';
import { applicationScopeFindings } from './scope';
import type { ScannedFile } from './types';

const roots: string[] = [];

const architecture: ArchitectureDef = {
  alias: '~app', sourceRoot: 'src',
  modules: [{ name: 'auth', does: 'authentication' }],
  layers: [{ name: 'components', does: 'UI' }],
};

function fixture(files: Record<string, string>, git = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-scope-'));

  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  if (git) {
    spawnSync('git', ['init', '-q'], { cwd: root });
  }

  return root;
}

function collect(root: string, patch: Partial<ArchitectureDef> = {}) {
  const resolved = resolveArchitecture({ ...architecture, ...patch });

  return collectOutsideScope(root, resolved, scan(root, resolved.sourceRoot));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('outside scope collection', () => {
  it('bounds Git inventory and deduplicates mixed ignored directories', () => {
    const root = fixture({
      '.gitignore': 'vendor/\nignored/\nlinked/\n',
      'src/auth/index.ts': '',
      'src/auth/components/Button/index.ts': 'import \'../../../../linked/run\';',
      'vendor/tracked.ts': 'import \'~app/auth\';',
      'ignored/consumer.ts': 'import \'~app/auth\';',
      'ignored/ordinary.ts': 'import \'~app/auth\';',
      'ignored/example.test.ts': 'invalid )',
      'linked/run.ts': 'import \'~app/auth\';',
      'linked/other.ts': '',
      'noise.ts': '',
      'vendor/noise.ts': 'invalid )',
      'node_modules/never.ts': 'invalid )',
    });

    spawnSync('git', ['add', '-f', 'vendor/tracked.ts'], { cwd: root });
    const evidence = collect(root, { consumerFiles: ['ignored/consumer.ts', 'linked/run.ts'] });

    expect(evidence).toMatchObject({
      status: 'complete', inventoryMode: 'git-visible', inventoryFiles: 7,
      readFiles: 6, parsedFiles: 6, testFilesExcluded: 1,
      contributions: { repositoryVisible: 2, explicitConsumerRoot: 5, governedReference: 0 },
      limitations: [],
    });

    expect('files' in evidence && evidence.files.map((file) => file.path)).toEqual([
      'ignored/consumer.ts',
      'ignored/ordinary.ts',
      'linked/other.ts',
      'linked/run.ts',
      'noise.ts',
      'vendor/tracked.ts',

    ]);

    expect(applicationScopeFindings({ ...scan(root), outsideScope: evidence }, {
      ...architecture, consumerFiles: ['ignored/consumer.ts', 'linked/run.ts'],
    }).map((finding) => finding.subject)).toEqual(['ignored linked vendor']);
  });

  it('includes ignored governed targets without explicit consumer roots', () => {
    const root = fixture({
      '.gitignore': 'tools/\n',
      'src/auth/index.ts': 'import \'../../tools/run\';',
      'tools/run.ts': '',

    });

    expect(collect(root)).toMatchObject({
      status: 'complete', inventoryFiles: 1, parsedFiles: 1,
      contributions: { repositoryVisible: 0, explicitConsumerRoot: 0, governedReference: 1 },
    });
  });

  it('uses Git nested ignore negation and scopes a nested application', () => {
    const root = fixture({
      '.gitignore': 'noise/\n', 'sibling/a.ts': 'invalid )', 'noise/a.ts': 'invalid )',
      'apps/web/src/auth/index.ts': '', 'apps/web/tool/.gitignore': '*.ts\n!keep.ts\n',
      'apps/web/tool/keep.ts': '', 'apps/web/tool/drop.ts': 'invalid )',
    });

    expect(collect(path.join(root, 'apps/web'))).toMatchObject({
      status: 'complete', inventoryFiles: 1, parsedFiles: 1,
      files: [{ path: 'tool/keep.ts' }],
    });
  });

  it('walks complete filesystem fallback and excludes tests before reads', () => {
    const root = fixture({
      'src/auth/index.ts': '', 'tools/run.ts': '', 'tools/run.test.ts': 'invalid )',
      'dist/run.ts': 'invalid )',
    }, false);

    const readFile = vi.fn(readSourceFile);

    const result = collectOutsideScopeWith(root,
      resolveArchitecture(architecture),
      { scan: scan(root),
        options: { readFile } });

    expect(result).toMatchObject({
      status: 'complete', inventoryMode: 'filesystem-fallback', inventoryFiles: 2,
      readFiles: 1, parsedFiles: 1, testFilesExcluded: 1, directoryWalks: 2,
      fallbackReason: 'Git repository visibility is unavailable.',
    });

    expect(readFile.mock.calls).toEqual([[root, 'tools/run.ts']]);
  });
});

describe('outside scope evidence health', () => {
  it('makes parse errors and dynamic targets partial while preserving parsed files', () => {
    const root = fixture({ 'src/auth/index.ts': '',
      'tools/bad.ts': 'const = ;',
      'tools/dynamic.ts': 'import(target);' });

    const result = collect(root);

    expect(result).toMatchObject({ status: 'partial',
      inventoryFiles: 2,
      readFiles: 2,
      parsedFiles: 2 });

    expect('limitations' in result && result.limitations).toEqual([
      'tools/bad.ts: import parsing failed', 'tools/dynamic.ts: unresolved import targets',
    ]);
  });

  it('records unreadable candidates as partial and inventory failure as unavailable', () => {
    const root = fixture({ 'tools/run.ts': '' });
    const resolved = resolveArchitecture(architecture);

    const result = collectOutsideScopeWith(root,
      resolved,
      { scan: scan(root),
        options: { readFile: () => {
          throw new Error('read');
        } } });

    expect(result).toMatchObject({ status: 'partial',
      readFiles: 1,
      parsedFiles: 0,
      limitations: ['tools/run.ts: source could not be read'] });

    expect(collectOutsideScopeWith(root, resolved, { scan: scan(root), options: { git: () => {
      throw new Error('inventory');
    } } }))
      .toEqual({ status: 'unavailable',
        inventoryMode: 'none',
        reason: 'Outside-source inventory could not be collected.' });
  });

  it('never requests outside work for source-only and not-applicable topology', () => {
    const root = fixture({ 'src/auth/index.ts': '', 'tools/bad.ts': 'const = ;' });
    const source = scan(root);
    const git = vi.fn();
    const readFile = vi.fn();

    expect(source.outsideScope).toEqual({ status: 'not-requested' });
    expect(source.governedWork).toEqual({ inventoryFiles: 1, readFiles: 1, parsedFiles: 1 });

    expect(() => applicationScopeFindings(source,
      architecture)).toThrow('requires outside-scope evidence');

    expect(collectOutsideScopeWith(root,
      resolveArchitecture({ ...architecture,
        modules: undefined }),
      { scan: source,
        options: { git,
          readFile } }))
      .toEqual({ status: 'not-applicable', reason: 'layer-first' });

    expect(collectOutsideScopeWith(root,
      resolveArchitecture({ ...architecture,
        sourceRoot: '.' }),
      { scan: source,
        options: { git,
          readFile } }))
      .toEqual({ status: 'not-applicable', reason: 'source-root-is-application-root' });

    expect(git).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    ['tools/consumer.ts', 'tools'], ['tools/**/*.ts', 'tools'], ['**/*.ts', ''],
    ['./tools\\entry.ts', 'tools'], ['tools/a?/run.ts', 'tools'],
  ])('derives narrow literal root for %s', (pattern, expected) => {
    expect(consumerSearchRoot(pattern)).toBe(expected);
  });
});

describe('outside evidence independent limitations', () => {
  const cases: { name: string; facts: Partial<ScannedFile>; partial: boolean }[] = [
    { name: 'absent optional analysis', facts: {}, partial: false },
    { name: 'dynamic imports alone',
      facts: { importAnalysis: { unknownDynamicImports: 1 }, unknownModuleSpecifiers: 0 },
      partial: true },
    { name: 'module specifiers alone',
      facts: { importAnalysis: { unknownDynamicImports: 0 }, unknownModuleSpecifiers: 1 },
      partial: true },
  ];

  it.each(cases)('$name preserves outside read evidence', ({ facts, partial }) => {
    const root = fixture({ 'tools/run.ts': '' }, false);

    const file: ScannedFile = {
      path: 'tools/run.ts', segments: ['tools', 'run.ts'], imports: [], ...facts,
    };

    const result = collectOutsideScopeWith(root, resolveArchitecture(architecture), {
      scan: { topDirs: [], files: [] }, options: { readFile: () => file },
    });

    expect(result).toMatchObject({
      status: partial ? 'partial' : 'complete', files: [file], readFiles: 1, parsedFiles: 1,
      limitations: partial ? ['tools/run.ts: unresolved import targets'] : [],
    });
  });

  it.each(cases)('$name preserves governed evidence', ({ facts, partial }) => {
    const root = fixture({ 'src/auth/index.ts': '' }, false);

    const file: ScannedFile = {
      path: 'src/auth/index.ts', segments: ['auth', 'index.ts'], imports: [], ...facts,
    };

    const result = collectOutsideScopeWith(root, resolveArchitecture(architecture), {
      scan: { topDirs: ['auth'], files: [file] },
    });

    expect(result).toMatchObject({
      status: partial ? 'partial' : 'complete', files: [], readFiles: 0, parsedFiles: 0,
      limitations: partial ? ['src/auth/index.ts: unresolved governed import targets'] : [],
    });
  });

  it('refuses a source-named symlink to the exact parent before calling the reader', () => {
    const parent = fixture({ 'app/src/auth/index.ts': '' }, false);
    const root = path.join(parent, 'app');

    fs.symlinkSync(parent, path.join(root, 'escape.ts'), 'junction');
    const readFile = vi.fn(readSourceFile);

    const result = collectOutsideScopeWith(root, resolveArchitecture(architecture), {
      scan: scan(root), options: { readFile },
    });

    expect(result).toMatchObject({
      status: 'partial', inventoryFiles: 1, readFiles: 0, parsedFiles: 0, files: [],
      limitations: ['escape.ts: source resolves outside the application root'],
    });

    expect(readFile).not.toHaveBeenCalled();
  });
});
