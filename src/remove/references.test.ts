import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RemovalApplication, RemovalFacts } from './facts';
import { plannedFiles, referenceConflicts, TOOL_CONFIG } from './references';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-references-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function application(key: string, manifest = key): RemovalApplication {
  fs.mkdirSync(path.join(root, key), { recursive: true });

  return {
    key,
    root: path.join(root, key),
    blueprint: null,
    installed: null,
    manifest: { root: path.join(root, manifest), section: 'devDependencies' },
    provenance: [],
  };
}

function facts(scope: RemovalApplication[], remaining: string[] = []): RemovalFacts {
  return { root, state: { status: 'missing' }, scope, remaining, mode: 'legacy' };
}

const IMPORT = 'import blueprint from \'@kekkai/blueprint\';\n';

describe('TOOL_CONFIG', () => {
  it.each([
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml',
    '.eslintrc.yaml', 'eslint.config.mjs', 'vite.config.ts', 'vitest.config.mts', 'next.config.js',
    'my-app.config.cts',
  ])('reads %s as a tool config', (name) => {
    expect(TOOL_CONFIG.test(name)).toBe(true);
  });

  it.each([
    'x.eslintrc', '.eslintrc.jsx', '.eslintrc.xml', 'vite.config.ts.bak', 'config.ts',
    'vite.config.xs', 'a b.config.ts',
  ])('ignores %s', (name) => {
    expect(TOOL_CONFIG.test(name)).toBe(false);
  });
});

describe('referenceConflicts · full removal', () => {
  it('reports Blueprint scripts, imports, and config paths that would survive removal', () => {
    write('package.json', JSON.stringify({
      scripts: {
        arch: 'blueprint doctor',
        check: 'npm test && blueprint',
        pinned: 'npx @kekkai/blueprint@latest upgrade',
        count: 3,
        near: 'blueprintish run',
        other: 'my-blueprint doctor',
      },
    }));

    write('eslint.config.mjs', IMPORT);
    write('vite.config.ts', IMPORT);
    write('vitest.config.ts', 'export default { setupFiles: [\'blueprint.config.mjs\'] };\n');
    write('notes.md', IMPORT);
    fs.mkdirSync(path.join(root, 'next.config.js'));

    const planned = plannedFiles([
      { kind: 'delete', path: 'eslint.config.mjs', reason: 'generated' },
    ]);

    expect(referenceConflicts(facts([application('.')]), planned)).toEqual([
      { kind: 'reference', path: 'package.json', detail: 'script', name: 'arch' },
      { kind: 'reference', path: 'package.json', detail: 'script', name: 'check' },
      { kind: 'reference', path: 'package.json', detail: 'script', name: 'pinned' },
      { kind: 'reference', path: 'vite.config.ts', detail: 'import' },
      { kind: 'reference', path: 'vitest.config.ts', detail: 'config-path' },
    ]);
  });

  it('reads planned rewrites instead of the files on disk', () => {
    write('package.json', JSON.stringify({ scripts: { arch: 'blueprint doctor' } }));
    write('vite.config.ts', IMPORT);

    const planned = plannedFiles([
      { kind: 'write', path: 'package.json', content: '{"scripts":{}}', reason: 'script' },
      { kind: 'write', path: 'vite.config.ts', content: 'export default {};\n', reason: 'edit' },
    ]);

    expect(referenceConflicts(facts([application('.')]), planned)).toEqual([]);
  });

  it('checks every removed application config path and each manifest owner', () => {
    write('vite.config.ts', 'export default [\'apps/admin/blueprint.config.mjs\'];\n');
    write('apps/package.json', JSON.stringify({ scripts: { arch: 'blueprint inspect' } }));
    write('package.json', JSON.stringify({ scripts: { root: 'blueprint doctor' } }));

    expect(referenceConflicts(
      facts([application('apps/web', 'apps'), application('apps/admin', 'apps')]),
      plannedFiles([]),
    )).toEqual([
      { kind: 'reference', path: 'package.json', detail: 'script', name: 'root' },
      { kind: 'reference', path: 'vite.config.ts', detail: 'config-path' },
      { kind: 'reference', path: 'apps/package.json', detail: 'script', name: 'arch' },
    ]);
  });
});

describe('referenceConflicts · partial removal', () => {
  it('leaves shared root tooling to the applications that stay adopted', () => {
    write('package.json', JSON.stringify({ scripts: { arch: 'blueprint doctor' } }));
    write('eslint.config.mjs', IMPORT);
    write('vite.config.ts', 'export default [\'apps/web/blueprint.config.mjs\'];\n');
    write('apps/web/package.json', JSON.stringify({ scripts: { lint: 'blueprint inspect' } }));

    expect(referenceConflicts(
      facts([application('apps/web', '.')], ['apps/admin']),
      plannedFiles([]),
    )).toEqual([
      { kind: 'reference', path: 'apps/web/package.json', detail: 'script', name: 'lint' },
      { kind: 'reference', path: 'vite.config.ts', detail: 'config-path' },
    ]);
  });
});
