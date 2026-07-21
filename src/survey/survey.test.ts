import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderSurvey, ROOT_BUCKET, runSurvey } from './survey';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-survey-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = ''): void {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function scaffold(): void {
  write(
    'package.json',
    JSON.stringify({
      name: 'demo',
      dependencies: { react: '^18', axios: '^1' },
      devDependencies: { typescript: '^5' },
    }),
  );

  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
  );

  write('src/main.tsx', 'import { App } from "@/pages/App";\nimport { i18n } from "@/i18n";');
  write('src/i18n.ts', '');

  write(
    'src/pages/App.tsx',
    [
      'import { Button } from "@/components/Button";',
      'import { i18n } from "@/i18n";', // alias → src-root file
      'import { main } from "../main";', // relative → src-root file
      'import pkg from "../../package.json";', // climbs out of src — skipped
    ].join('\n'),
  );

  write('src/pages/Nav.tsx', 'import { Card } from "../components/Card";');
  write('src/components/Button.tsx', 'import { Card } from "@/components/Card";');
  write('src/components/Card.tsx', 'import { api } from "@/services/api";');
  write('src/services/api/index.ts', 'import axios from "axios";');
  write('src/hooks/useA.ts', 'import { useB } from "@/hooks/useB";');
  write('src/hooks/useB.ts', '');
  write('src/services/api/client.ts', 'import axios from "axios/lib/adapters";');
  write('src/services/api/client.test.ts', 'import { api } from "./index";');
  write('src/pages/__tests__/App.spec.tsx', '');
}

describe('runSurvey', () => {
  it('builds the matrix, self-alias counts, and package usage', () => {
    scaffold();

    const result = runSurvey(root, { log: silent });

    expect(result.framework).toBe('react');
    expect(result.typescript).toBe(true);
    expect(result.aliases).toEqual({ '@': 'src' });
    expect(result.rootFiles).toEqual(['i18n.ts', 'main.tsx']);

    // Alias and relative imports both land in the matrix; root files bucket.
    expect(result.edges).toContainEqual({ from: 'pages', to: 'components', count: 2 });
    expect(result.edges).toContainEqual({ from: 'components', to: 'services', count: 1 });
    expect(result.edges).toContainEqual({ from: ROOT_BUCKET, to: 'pages', count: 1 });

    // Alias and relative imports of src-root files bucket to (src root);
    // a root file importing another root file via the alias is not an edge.
    expect(result.edges).toContainEqual({ from: 'pages', to: ROOT_BUCKET, count: 2 });

    expect(result.edges).not.toContainEqual(
      expect.objectContaining({ from: ROOT_BUCKET, to: ROOT_BUCKET }),
    );

    // Same-folder alias imports are separated out, not edges.
    expect(result.selfAliasImports).toEqual({ components: 1, hooks: 1 });

    expect(result.edges).not.toContainEqual(
      expect.objectContaining({ from: 'components', to: 'components' }),
    );

    // axios: exact and subpath specifiers both attribute to the dependency.
    expect(result.packageUsage).toContainEqual({ package: 'axios', folders: ['services'] });

    expect(result.testEvidence).toContainEqual({ pattern: '**/*.test.*', files: 1 });
    expect(result.testEvidence).toContainEqual({ pattern: '**/*.spec.*', files: 1 });
    expect(result.testEvidence).toContainEqual({ pattern: '**/__tests__/**', files: 1 });
  });

  it('reports module-shape evidence per folder', () => {
    scaffold();

    const services = runSurvey(root, { log: silent }).folders.find(
      (folder) => folder.folder === 'services',
    );

    expect(services).toMatchObject({
      files: 3,
      directFiles: 0,
      childFolders: 1,
      indexedChildren: 1,
      maxDepth: 2,
    });
  });

  it('honors an alias override and renders a readable report', () => {
    scaffold();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    let output = '';
    const result = runSurvey(root, { alias: '@', log: (message) => (output = message) });

    expect(result.aliases).toEqual({ '@': 'src' });
    expect(output).toContain('Import matrix');
    // The matrix counts test files while inspect skips them — say so in place.
    expect(output).toContain('inspect excludes them, so its counts run lower');
    expect(output).toContain('pages → components');
    expect(output).toContain('Same-folder imports via the alias');
    expect(output).toContain('ownership candidates');
  });

  it('reports no alias when detection finds nothing', () => {
    scaffold();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    let output = '';

    runSurvey(root, { log: (message) => (output = message) });

    expect(output).toContain('none detected');
  });

  it('emits JSON with --json and handles an empty repo', () => {
    write('package.json', JSON.stringify({ name: 'empty' }));

    let output = '';
    const result = runSurvey(root, { json: true, log: (message) => (output = message) });

    expect(result.totalFiles).toBe(0);
    expect(JSON.parse(output).folders).toEqual([]);
  });

  it('truncates the rendered package list past fifteen entries', () => {
    write(
      'package.json',
      JSON.stringify({
        name: 'many',
        dependencies: Object.fromEntries(
          Array.from({ length: 17 }, (_, i) => [`pkg-${String(i).padStart(2, '0')}`, '1']),
        ),
      }),
    );

    for (let i = 0; i < 17; i++) {
      write(`src/app/file${i}.ts`, `import x from "pkg-${String(i).padStart(2, '0')}";`);
    }

    let output = '';

    runSurvey(root, { log: (message) => (output = message) });

    expect(output).toContain('… 2 more');
  });

  it('survives a missing package.json', () => {
    write('src/app/a.ts', 'import x from "left-pad";');

    const result = runSurvey(root, { log: silent });

    expect(result.packageUsage).toEqual([]);
  });

  it('reports alias-like specifiers that resolve to nothing', () => {
    scaffold();

    write(
      'src/pages/Extra.tsx',
      [
        'import a from "~root/tests/fixture";',
        'import b from "~root/tests/other";',
        'import c from "#internal/x";',
        'import d from "plain-unknown-pkg";', // bare name — not alias-like, not reported
      ].join('\n'),
    );

    let output = '';
    const result = runSurvey(root, { log: (message) => (output = message) });

    expect(result.unresolved).toEqual([
      { prefix: '~root', count: 2 },
      { prefix: '#internal', count: 1 },
    ]);

    expect(output).toContain('Unresolved alias-like imports');
    expect(output).toContain('~root/…');
  });
});

describe('renderSurvey', () => {
  it('renders the unknown-framework header without folders', () => {
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      unresolved: [],
      totalFiles: 0,
    });

    expect(output).toContain('unknown framework');
    expect(output).not.toContain('Same-folder');
    expect(output).not.toContain('Unresolved');
  });
});
