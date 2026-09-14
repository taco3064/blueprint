import fs from 'node:fs';
import { afterEach, expect, it } from 'vitest';

import { cli, configSource, makeRepo, read, rm } from './conformance';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

it.each([{ topology: [] }, { topology: ['--topology', 'module-first'] }])(
  'preserves exactly one legacy backup: %j', async ({ topology }) => {
    const original = '// Owner policy must remain recoverable.\r\n'
      + 'export default { framework: "react", '
      + 'architecture: { alias: "~app", module: { layout: "folder", private: ["hooks"] }, '
      + 'layers: [{ name: "components", does: "UI" }] } };\r\n';

    const root = makeRepo({
      packageJson: { name: 'legacy', dependencies: { react: '^18' } },
      files: { 'blueprint.config.mjs': original },
    });

    roots.push(root);
    const dry = await cli(root, ['init', '--no-install', '--dry-run', ...topology]);

    expect(dry.code, dry.output).toBe(0);
    expect(read(root, 'blueprint.config.mjs')).toBe(original);
    expect(fs.readdirSync(root).filter((name) => name.includes('.pre-v4-'))).toEqual([]);
    expect(dry.output).toContain('module.private has no 4.0 replacement');
    const applied = await cli(root, ['init', '--no-install', ...topology]);

    expect(applied.code, applied.output).toBe(0);
    const backups = fs.readdirSync(root).filter((name) => name.includes('.pre-v4-'));

    expect(backups).toHaveLength(1);
    expect(read(root, backups[0]!)).toBe(original);
    expect(read(root, 'blueprint.config.mjs')).not.toContain('"private"');

    expect(applied.output.indexOf('original config preserved')).toBeLessThan(
      applied.output.indexOf('✓ write: blueprint.config.mjs\n'),
    );
  });

it.each([{}, { eslint: 'eslint src' }])('keeps legacy lint unchanged: %j', async (scripts) => {
  const root = makeRepo({
    packageJson: { name: 'legacy', scripts, dependencies: { react: '^18' } },
    files: {
      '.eslintrc.cjs': 'module.exports = {};',
      'blueprint.config.mjs': configSource({ framework: 'react', architecture: {
        alias: '~app', layers: [{ name: 'components', does: 'UI', layout: 'file' }],
      } }),
    },
  });

  roots.push(root);
  const before = read(root, 'package.json');
  const result = await cli(root, ['init', '--no-install']);

  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain('deliberate decision');
  expect(result.output).not.toContain('add one so lint runs the generated rules');
  expect(read(root, 'package.json')).toBe(before);
  expect(read(root, 'eslint.config.blueprint.mjs')).not.toBeNull();
});

it('keeps a working eslint entrypoint when no lint script is declared', async () => {
  const root = makeRepo({
    packageJson: { name: 'modern', scripts: { eslint: 'eslint src' } },
    files: { 'blueprint.config.mjs': configSource({ framework: 'react', architecture: {
      alias: '~app', layers: [{ name: 'ui', does: 'UI', layout: 'file' }],
    } }) },
  });

  roots.push(root);
  const result = await cli(root, ['init', '--no-install']);

  expect(result.code, result.output).toBe(0);
  expect(result.output).not.toContain('has no `lint` script');
});

it.each([false, true])('diagnoses a direct layer barrel in MF=%s', async (moduleFirst) => {
  const prefix = moduleFirst ? 'src/auth/ui' : 'src/ui';

  const root = makeRepo({ files: {
    'blueprint.config.mjs': configSource({ framework: 'react', architecture: {
      alias: '~app',
      ...(moduleFirst ? { modules: [{ name: 'auth', does: 'Authentication' }] } : {}),
      layers: [{ name: 'ui', does: 'UI', layout: 'folder', entry: 'index' }],
    } }),
    [`${prefix}/index.ts`]: 'export * from \'./button\';',
    [`${prefix}/button/index.ts`]: 'export const button = 1;',
  } });

  roots.push(root);
  const result = await cli(root, ['inspect']);

  expect(result.output).toContain(`File "${prefix}/index.ts"`);
  expect(result.output).toContain('not a folder unit missing an entry');
  expect(result.output).not.toContain(`Unit "${moduleFirst ? 'auth/' : ''}ui/index"`);
});
