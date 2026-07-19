import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detect, readTexts } from './detect';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-detect-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writePkg(content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(content));
}

describe('detect', () => {
  it('detects vue from dependencies and reads the project name', () => {
    writePkg({ name: 'app', dependencies: { vue: '^3' } });

    const state = detect(root);

    expect(state.framework).toBe('vue');
    expect(state.projectName).toBe('app');
  });

  it('detects react from devDependencies', () => {
    writePkg({ devDependencies: { react: '^18' } });

    expect(detect(root).framework).toBe('react');
  });

  it('is ambiguous (null) when both or neither framework is present', () => {
    writePkg({ dependencies: { vue: '1', react: '1' } });
    expect(detect(root).framework).toBeNull();

    writePkg({ dependencies: {} });
    expect(detect(root).framework).toBeNull();
  });

  it('detects the package manager from lockfiles', () => {
    writePkg({});
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
    expect(detect(root).packageManager).toBe('pnpm');

    fs.rmSync(path.join(root, 'pnpm-lock.yaml'));
    fs.writeFileSync(path.join(root, 'yarn.lock'), '');
    expect(detect(root).packageManager).toBe('yarn');
  });

  it('reports existing files, src dirs, and missing deps', () => {
    writePkg({ name: 'x', devDependencies: { eslint: '9', typescript: '5' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '');
    fs.writeFileSync(path.join(root, 'eslint.config.js'), '');
    fs.writeFileSync(path.join(root, 'vite.config.ts'), '');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });

    const state = detect(root);

    expect(state.hasConfig).toBe(true);
    expect(state.hasEslintConfig).toBe(true);
    expect(state.hasViteConfig).toBe(true);
    expect(state.hasTypescript).toBe(true);

    expect(state.tsconfigs).toEqual({
      'tsconfig.json': '{}',
      'tsconfig.app.json': null,
      'jsconfig.json': null,
    });

    expect(state.existingSrcDirs).toEqual(['components']);

    expect(state.missingDeps).toEqual([
      '@kekkai/blueprint',
      'eslint-plugin-import',
      '@eslint-community/eslint-plugin-eslint-comments',
      'knip',
    ]);

    expect(state.packageManager).toBe('npm');
  });

  it('tolerates a missing or malformed package.json', () => {
    expect(detect(root).framework).toBeNull();
    expect(detect(root).missingDeps).toContain('eslint');
    expect(detect(root).missingDeps).toHaveLength(5);
    expect(detect(root).existingSrcDirs).toEqual([]);
    expect(detect(root).hasViteConfig).toBe(false);
    expect(detect(root).hasTypescript).toBe(false);

    fs.writeFileSync(path.join(root, 'package.json'), '{ not json');
    expect(detect(root).framework).toBeNull();
  });
});

describe('readTexts', () => {
  it('reads present files and nulls absent ones, keyed by the given path', () => {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'CLAUDE.md'), 'hi');

    expect(readTexts(root, ['docs/CLAUDE.md', 'AGENTS.md'])).toEqual({
      'docs/CLAUDE.md': 'hi',
      'AGENTS.md': null,
    });
  });
});
