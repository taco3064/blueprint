import { ESLint } from 'eslint';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { emitLint } from '../emit/lint';
import { vuePreset } from '../presets';
import { GENERATED_ESLINT_BANNER } from '../project';
import { cli, read, rm, write } from './conformance';

const roots: string[] = [];

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  roots.push(root);

  return root;
}

function applicationRoot(root: string): string {
  return path.join(root, 'apps', 'web');
}

function seedNestedApp(root: string, app: string, eslintConfig: string): void {
  write(root, 'pnpm-workspace.yaml', 'packages: [apps/*]\n');
  write(root, 'package.json', JSON.stringify({ devDependencies: { eslint: '^9' } }));
  write(root, 'eslint.config.mjs', eslintConfig);
  write(app, 'package.json', JSON.stringify({ name: 'web', dependencies: { vue: '^3' } }));

  write(app, 'jsconfig.json', JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } },
  }));

  write(app, 'src/main.js', 'export {};\n');
}

function expectRootReadyReference(reference: string): void {
  expect(reference).toContain('import blueprint from \'./blueprint.config.mjs\'');
  expect(reference).not.toContain('basePath: applicationRoot');
  expect(reference).toContain('files: [\'src/**/*.{js,jsx,ts,tsx,vue}\']');
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

describe('nested application eslint ownership', () => {
  it('keeps the ancestor config authoritative and emits its application base path', async () => {
    const root = tempRoot('bp-eslint-owner-');
    const app = path.join(root, 'apps', 'web');
    const existing = 'export default [{ rules: { \'no-console\': \'error\' } }];\n';

    seedNestedApp(root, app, existing);
    write(app, 'eslint.config.mjs', `${GENERATED_ESLINT_BANNER}\nexport default [];\n`);

    const result = await cli(app, ['init', '--topology', 'layer-first', '--no-install']);
    const reference = read(app, 'eslint.config.blueprint.mjs') ?? '';

    expect(result.code).toBe(0);
    expect(read(root, 'eslint.config.mjs')).toBe(existing);
    expect(read(app, 'eslint.config.mjs')).toBeNull();
    expectRootReadyReference(reference);

    expect(result.output).toContain(
      'const applicationRoot = fileURLToPath(new URL(\'./apps/web/\', import.meta.url));',
    );

    expect(result.output).toContain('basePath: applicationRoot');
    expect(result.output).toContain('import blueprint from \'./apps/web/blueprint.config.mjs\';');
  });

  it('keeps adopter and Blueprint rules alive in one repository-root config', async () => {
    const root = tempRoot('bp-eslint-merged-');
    const blueprint = vuePreset();

    const config = [
      { basePath: applicationRoot(root), rules: { 'no-console': 'error' as const } },
      ...emitLint(blueprint, { basePath: applicationRoot(root) }),
    ];

    const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config });
    const forbidden = path.join(root, 'apps/web/src/services/api.js');
    const legal = path.join(root, 'apps/web/src/containers/Feature/index.js');
    const effective = await eslint.calculateConfigForFile(forbidden);

    write(root, 'apps/web/src/services/api.js', 'export {};\n');
    write(root, 'apps/web/src/containers/Feature/index.js', 'export {};\n');

    expect(effective?.rules?.['no-console']).toBeDefined();
    expect(effective?.rules?.['blueprint/import-boundary']).toBeDefined();

    const [negative] = await eslint.lintText(
      'import Card from \'~app/components/Card\'; console.log(Card);\n',
      { filePath: forbidden },
    );

    const [positive] = await eslint.lintText(
      'import api from \'~app/services/api\'; export default api;\n',
      { filePath: legal },
    );

    expect(negative.messages.map((message) => message.ruleId))
      .toEqual(expect.arrayContaining(['no-restricted-imports', 'no-console']));

    expect(positive.messages).toEqual([]);
  });
});
