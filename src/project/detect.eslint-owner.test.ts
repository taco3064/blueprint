import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { detect, GENERATED_ESLINT_BANNER } from './detect';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('detect · ancestor eslint ownership', () => {
  it('requires application scoping before an ancestor flat config counts as wired', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-owner-'));
    const app = path.join(workspace, 'apps', 'web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');

    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ devDependencies: { eslint: '^9' } }),
    );

    fs.writeFileSync(
      path.join(workspace, 'eslint.config.mjs'),
      `${GENERATED_ESLINT_BANNER}\nexport default [];\n`,
    );

    fs.mkdirSync(path.join(app, 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { vue: '^3' } }),
    );

    const state = detect(app);

    expect(state).toMatchObject({
      hasEslintConfig: true,
      eslintConfigFile: '../../eslint.config.mjs',
      eslintConfigRoot: workspace,
      eslintBasePath: 'apps/web',
      wiredEslintConfig: false,
    });

    expect(state.ownedEslintConfig).toBeUndefined();

    fs.writeFileSync(
      path.join(workspace, 'eslint.config.mjs'),
      'import { emitLint } from \'@kekkai/blueprint\';\n'
      + 'const applicationRoot = fileURLToPath(new URL(\'./apps/web/\', import.meta.url));\n'
      + 'export default emitLint({}, { basePath: applicationRoot });\n',
    );

    expect(detect(app).wiredEslintConfig).toBe(true);
  });

  it('keeps a hand-written application config ahead of an ancestor owner', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-owner-'));
    const app = path.join(workspace, 'apps', 'web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.mkdirSync(path.join(app, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
    fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
    fs.writeFileSync(path.join(workspace, 'eslint.config.mjs'), 'export default [];\n');

    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({ dependencies: { next: '^15' } }),
    );

    fs.writeFileSync(path.join(app, 'eslint.config.js'), 'export default [];\n');

    expect(detect(app)).toMatchObject({
      eslintConfigFile: 'eslint.config.js',
      eslintConfigRoot: app,
      eslintBasePath: undefined,
      shadowedEslintConfig: undefined,
    });

    fs.mkdirSync(path.join(app, 'app'));
    expect(detect(app).nextRouter).toBe('app');
    fs.mkdirSync(path.join(app, 'pages'));
    expect(detect(app).nextRouter).toBe('both');
  });

  it('falls back to an ancestor legacy config when no flat config exists', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-owner-'));
    const app = path.join(workspace, 'apps', 'web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
    fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
    fs.writeFileSync(path.join(workspace, '.eslintrc.cjs'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(app, 'package.json'), '{}');

    expect(detect(app)).toMatchObject({
      eslintConfigFile: undefined,
      eslintConfigRoot: workspace,
      eslintBasePath: 'apps/web',
      legacyEslintConfig: '../../.eslintrc.cjs',
      eslintConfigShape: 'legacy',
    });
  });
});

describe('detect · incomplete eslint evidence', () => {
  it('keeps unreadable local configs unowned even with an ancestor', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-unreadable-'));
    const app = path.join(workspace, 'apps/web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.mkdirSync(path.join(app, 'eslint.config.js'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
    fs.writeFileSync(path.join(app, 'package.json'), '{}');
    fs.writeFileSync(path.join(workspace, 'eslint.config.js'), 'export default [];');

    expect(detect(app)).toMatchObject({
      ownedEslintConfig: undefined, shadowedEslintConfig: undefined, wiredEslintConfig: false,
    });
  });

  it.each([
    'import \'@kekkai/blueprint\'; const root = \'./apps/web/\';',
    'import \'@kekkai/blueprint\'; const root = new URL(\'./apps/web/\', import.meta.url);',
    'import \'@kekkai/blueprint\'; const root = \'./apps/web/\'; '
    + 'const x = {basePath: applicationRoot};',
    'import \'@kekkai/blueprint\'; const root = \'./apps/web/\'; '
    + 'const x = {basePath: root};',
    'import \'@kekkai/blueprint\'; const other = new URL(\'./apps/other/\', import.meta.url); '
    + 'const x = {basePath: other}; const mention = \'./apps/web/\';',
  ])('requires the complete ancestor basePath expression: %s', (text) => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-incomplete-'));
    const app = path.join(workspace, 'apps/web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
    fs.writeFileSync(path.join(app, 'package.json'), '{}');
    fs.writeFileSync(path.join(workspace, 'eslint.config.js'), text);
    expect(detect(app).wiredEslintConfig).toBe(false);
  });

  it.each([
    'import \'@kekkai/blueprint\'; '
    + 'const applicationRoot = fileURLToPath(new URL(\'./apps/web/\', import.meta.url)); '
    + 'export default [...emitLint(b, { basePath: applicationRoot })];',
    'import \'@kekkai/blueprint\'; '
    + 'const webRoot = fileURLToPath(new URL(\'apps/web/\', import.meta.url)); '
    + 'export default [...emitLint(b, { basePath: webRoot })];',
    'import \'@kekkai/blueprint\'; export default [...emitLint(b, '
    + '{ basePath: fileURLToPath(new URL(\'./apps/web/\', import.meta.url)) })];',
    'import \'@kekkai/blueprint\'; '
    + 'const webRoot = fileURLToPath(new URL(\'apps/web/\', import.meta.url)); '
    + 'export default [...emitLint(b,{basePath:webRoot})];',
  ])('accepts any ancestor wiring scoped to this application: %s', (text) => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-eslint-scoped-'));
    const app = path.join(workspace, 'apps/web');

    roots.push(workspace);
    spawnSync('git', ['init'], { cwd: workspace });
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
    fs.writeFileSync(path.join(app, 'package.json'), '{}');
    fs.writeFileSync(path.join(workspace, 'eslint.config.js'), text);
    expect(detect(app).wiredEslintConfig).toBe(true);
  });
});
