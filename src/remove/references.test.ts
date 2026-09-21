import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { GitReader } from '../project';
import { gatherRemovalFacts } from './facts';
import type { RemovalApplication, RemovalFacts } from './facts';
import {
  emittedRuleInventory, plannedFiles, referenceConflicts, TOOL_CONFIG,
} from './references';

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
  it('blocks executable workflow references but ignores workflow comments', () => {
    write('.github/workflows/ci.yml', [
      '# run: npx blueprint doctor',
      'jobs:',
      '  check:',
      '    steps:',
      '      - run: npx blueprint doctor',
      '',
    ].join('\n'));

    write('.github/workflows/comment-only.yaml', '# @kekkai/blueprint was removed\n');

    expect(referenceConflicts(facts([application('.')]), plannedFiles([]))).toEqual([{
      kind: 'reference', path: '.github/workflows/ci.yml', detail: 'script', name: 'workflow',
    }]);

    expect(referenceConflicts(facts([application('.')]), plannedFiles([{
      kind: 'delete', path: '.github/workflows/ci.yml', reason: 'workflow',
    }]))).toEqual([]);
  });

  it('only scans YAML files and exact workflow run keys', () => {
    write('.github/workflows/plain.yml', 'run: npx blueprint doctor\n');
    write('.github/workflows/spaced.yaml', '-   run: npx @kekkai/blueprint doctor\n');
    write('.github/workflows/notes.txt', 'run: npx blueprint doctor\n');
    write('.github/workflows/backup.yml.bak', 'run: npx blueprint doctor\n');

    write('.github/workflows/near.yml', [
      'name: run: npx blueprint doctor',
      'pre-run: npx blueprint doctor',
      'runner: npx blueprint doctor',
      '',
    ].join('\n'));

    fs.mkdirSync(path.join(root, '.github/workflows/directory.yml'));

    expect(referenceConflicts(facts([application('.')]), plannedFiles([]))).toEqual([
      {
        kind: 'reference', path: '.github/workflows/plain.yml', detail: 'script', name: 'workflow',
      },
      {
        kind: 'reference',
        path: '.github/workflows/spaced.yaml',
        detail: 'script',
        name: 'workflow',
      },
    ]);
  });

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

describe('referenceConflicts · surviving source imports', () => {
  const conflicts = (actions: Parameters<typeof plannedFiles>[0] = []) =>
    referenceConflicts(facts([application('.')]), plannedFiles(actions));

  it.each([
    ['static', 'import { defineBlueprint } from \'@kekkai/blueprint\';'],
    ['public subpath', 'export * from \'@kekkai/blueprint/operational-contract\';'],
    ['CommonJS', 'const blueprint = require(\'@kekkai/blueprint\');'],
    ['dynamic', 'const blueprint = import(\'@kekkai/blueprint/operational-contract\');'],
    ['type', 'type Text = import(\'@kekkai/blueprint/operational-contract\').OperationalText;'],
  ])('reports a real %s reference', (_label, source) => {
    write('src/use-blueprint.ts', `${source}\n`);

    expect(conflicts()).toEqual([{
      kind: 'reference', path: 'src/use-blueprint.ts', detail: 'import',
    }]);
  });

  it('ignores comments, prose, inert strings, and similarly named packages', () => {
    write('src/notes.ts', [
      '// import value from "@kekkai/blueprint";',
      'const prose = "import value from \'@kekkai/blueprint/operational-contract\'";',
      'const packageName = "@kekkai/blueprint";',
      'const other = import("@kekkai/blueprintish");',
      '',
    ].join('\n'));

    expect(conflicts()).toEqual([]);
  });

  it('evaluates the content that survives planned deletion or rewriting', () => {
    write('src/deleted.ts', 'import value from "@kekkai/blueprint";\n');
    write('src/rewritten.ts', 'import value from "@kekkai/blueprint";\n');

    expect(conflicts([
      { kind: 'delete', path: 'src/deleted.ts', reason: 'generated' },
      { kind: 'write', path: 'src/rewritten.ts', content: 'export {};\n', reason: 'edit' },
    ])).toEqual([]);
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
        {
          kind: 'reference',
          path: 'eslint.config.mjs',
          detail: 'import',
          rules: { total: expect.any(Number), exclusive: expect.any(Number) },
        },
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

function config(layerFilesIgnore?: string[]): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
      ...(layerFilesIgnore ? { layerFilesIgnore } : {}),
    },
  };
}

describe('emittedRuleInventory', () => {
  it('counts each emitted rule once across applications and separates Blueprint\'s own', () => {
    const one = emittedRuleInventory(facts([{ ...application('a'), blueprint: config() }]))!;

    const two = emittedRuleInventory(facts([
      { ...application('b'), blueprint: config() },
      { ...application('c'), blueprint: config() },
    ]));

    expect(two).toEqual(one);
    expect(one.exclusive).toBeGreaterThan(0);
    expect(one.exclusive).toBeLessThan(one.total);
  });

  it('passes over an entry that emits no rules, and an application with no blueprint', () => {
    expect(emittedRuleInventory(facts([
      { ...application('d'), blueprint: config(['**/*.css']) },
      application('e'),
    ]))).toEqual(emittedRuleInventory(facts([{ ...application('f'), blueprint: config() }])));
  });

  it('reports no inventory when no application in scope carries a blueprint', () => {
    expect(emittedRuleInventory(facts([application('g')]))).toBeUndefined();
  });
});
