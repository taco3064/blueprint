import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GitReader } from '../project';
import { gatherRemovalFacts } from './facts';
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

describe('referenceConflicts · comments', () => {
  const COMMENTED = [
    '// Moved off @kekkai/blueprint; blueprint.config.mjs is gone.',
    '/* was: import blueprint from \'@kekkai/blueprint\'; */',
    'export default [];',
    '',
  ].join('\n');

  const conflicts = () => referenceConflicts(facts([application('.')]), plannedFiles([]));

  it('ignores a mention inside a comment and still reports the same file once it imports', () => {
    write('eslint.config.mjs', COMMENTED);
    write('vite.config.ts', COMMENTED);

    expect(conflicts()).toEqual([]);

    write('eslint.config.mjs', `${COMMENTED}import blueprint from '@kekkai/blueprint';\n`);
    write('vite.config.ts', `${COMMENTED}import config from './blueprint.config.mjs';\n`);

    expect(conflicts()).toEqual([
      { kind: 'reference', path: 'eslint.config.mjs', detail: 'import' },
      { kind: 'reference', path: 'vite.config.ts', detail: 'config-path' },
    ]);
  });

  it('keeps an import that shares its line with a URL string', () => {
    write(
      'eslint.config.mjs',
      'const docs = \'https://example.com\'; import blueprint from \'@kekkai/blueprint\';\n',
    );

    write(
      'vite.config.ts',
      'const docs = \'https://example.com\'; import config from \'./blueprint.config.mjs\';\n',
    );

    expect(conflicts()).toEqual([
      { kind: 'reference', path: 'eslint.config.mjs', detail: 'import' },
      { kind: 'reference', path: 'vite.config.ts', detail: 'config-path' },
    ]);
  });

  it.each([
    [
      '.eslintrc.yml',
      '# extends @kekkai/blueprint\nextends: base\n',
      'extends: \'@kekkai/blueprint\'\n',
    ],
    [
      '.eslintrc.yaml',
      'extends: base # was @kekkai/blueprint\n',
      'extends: "@kekkai/blueprint"\n',
    ],
    [
      '.eslintrc.json',
      '{ // was @kekkai/blueprint\n  "extends": "base" }',
      '{ "extends": "@kekkai/blueprint" }',
    ],
    [
      '.eslintrc',
      '# was @kekkai/blueprint\n// and before that too\nextends: base\n',
      'extends: "@kekkai/blueprint"\n',
    ],
    [
      '.eslintrc',
      '# was @kekkai/blueprint\nextends: base\n',
      'extends: \'@kekkai/blueprint\'\n',
    ],
    [
      'vite.config.ts',
      '// was @kekkai/blueprint\nexport default {\n',
      'import \'@kekkai/blueprint\';\nexport default {\n',
    ],
  ])('ignores a comment-only mention in %s and still reports a real one', (file, comment, real) => {
    write(file, comment);

    expect(conflicts()).toEqual([]);

    write(file, real);

    expect(conflicts()).toEqual([{ kind: 'reference', path: file, detail: 'import' }]);
  });
});

describe('referenceConflicts · one directory under two spellings', () => {
  let link: string;

  beforeEach(() => {
    link = `${root}-link`;
    fs.symlinkSync(root, link, 'junction');
  });

  afterEach(() => {
    fs.rmSync(link, { recursive: true, force: true });
  });

  it.each([
    ['a trailing separator', (directory: string) => `${directory}${path.sep}`],
    ['a dot segment', (directory: string) => `${directory}${path.sep}.`],
    ['forward slashes, as Git prints a Windows root', (directory: string) =>
      directory.split(path.sep).join('/')],
  ])('reports each conflict once when Git spells the root with %s', async (_, spell) => {
    write('blueprint.config.mjs', 'export default {};\n');

    write('package.json', JSON.stringify({
      scripts: { arch: 'blueprint doctor' },
      devDependencies: { '@kekkai/blueprint': '4.1.0' },
    }));

    write('eslint.config.mjs', IMPORT);
    write('vite.config.ts', 'import config from \'./blueprint.config.mjs\';\n');

    const git: GitReader = (args) => ({
      status: 0, stdout: args[1] === '--show-toplevel' ? `${spell(root)}\n` : 'true\n', stderr: '',
    });

    for (const cwd of [root, link]) {
      const gathered = await gatherRemovalFacts(cwd, {
        git,
        loadConfig: async () => ({
          framework: 'react',
          architecture: { alias: '~app', layers: [{ name: 'pages', does: 'x' }] },
        }),
      });

      expect(gathered.scope.map((entry) => entry.key), cwd).toEqual(['.']);

      expect(referenceConflicts(gathered, plannedFiles([])), cwd).toEqual([
        { kind: 'reference', path: 'package.json', detail: 'script', name: 'arch' },
        { kind: 'reference', path: 'eslint.config.mjs', detail: 'import' },
        { kind: 'reference', path: 'vite.config.ts', detail: 'config-path' },
      ]);
    }
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
