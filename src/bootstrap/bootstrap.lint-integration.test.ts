import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Blueprint } from '../config';
import { makeRepo, read, rm, wiredEslintConfig } from '../conformance';
import { runInit } from './bootstrap';

vi.mock('../inspect/lint-runtime', () => ({
  runLiveLint: vi.fn(() => ({ status: 'passed', command: 'eslint .', errors: 0, warnings: 0 })),
}));

const roots: string[] = [];

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [{ name: 'components', does: 'UI', layout: 'folder' }],
  },
};

function fixture(): string {
  const root = makeRepo({
    packageJson: {
      scripts: { lint: 'eslint .' },
      dependencies: {
        react: '^18', eslint: '^9', '@kekkai/blueprint': '*',
        '@eslint-community/eslint-plugin-eslint-comments': '*',
        '@stylistic/eslint-plugin': '*', 'eslint-plugin-import-x': '*',
      },
    },
    files: {
      'blueprint.config.mjs': `export default ${JSON.stringify(blueprint)};\n`,
      'eslint.config.mjs': wiredEslintConfig(blueprint),
      'src/components/Card/index.js': 'export const Card = 1;\n',
    },
  });

  roots.push(root);
  fs.mkdirSync(path.join(root, 'node_modules'));

  fs.symlinkSync(path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')),
    path.join(root, 'node_modules/eslint'), 'junction');

  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

describe('runInit lint integration evidence', () => {
  it('publishes verified wiring only after checking the scanned application', async () => {
    const root = fixture();

    await runInit(root, { install: false, log: () => {} });

    expect(read(root, 'AGENTS.md')).toContain('verified alive in the project\'s lint run');

    expect(read(root, 'docs/architecture-handbook.md'))
      .toContain('verified alive in the project ESLint run');
  });
});
