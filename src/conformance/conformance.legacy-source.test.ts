import fs from 'node:fs';
import { afterEach, expect, it } from 'vitest';

import { reactPreset } from '../presets';
import { cli, makeRepo, read, rm, write } from './conformance';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

const topologies = [
  { topology: [], path: 'without topology movement' },
  { topology: ['--topology', 'module-first'], path: 'Blueprint 3.2 phase 1: migrated the config' },
];

function repository(config: string): string {
  const root = makeRepo({
    packageJson: { name: 'legacy', dependencies: { react: '^18' } },
    files: { 'blueprint.config.mjs': config },
  });

  roots.push(root);
  write(root, 'node_modules/@kekkai/blueprint/package.json', '{"exports":"./i.mjs"}');

  write(root, 'node_modules/@kekkai/blueprint/i.mjs', [
    'export const defineBlueprint = (config) => config;',
    `export const reactPreset = (options) => ({ ...${JSON.stringify(reactPreset())}, ...options });`,
    '',
  ].join('\n'));

  return root;
}

const backups = (root: string) => fs.readdirSync(root).filter((name) => name.includes('.pre-v4-'));

it.each(topologies)('rewrites a preset-spreading 3.2 source in place: %j', async ({
  topology,
  path,
}) => {
  const original = [
    'import { defineBlueprint, reactPreset } from \'@kekkai/blueprint\';',
    '',
    '// Only the architecture is replaced.',
    'export default defineBlueprint({',
    '  ...reactPreset({ name: \'legacy\' }),',
    '  architecture: {',
    '    alias: \'~app\',',
    '    layers: [',
    '      { name: \'pages\', does: \'routes\' },',
    '      { name: \'hooks\', does: \'state\' },',
    '    ],',
    '    module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] }, // retired',
    '  },',
    '});',
    '',
  ].join('\n');

  const root = repository(original);
  const result = await cli(root, ['init', '--no-install', ...topology]);

  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain(path);

  expect(read(root, 'blueprint.config.mjs')).toBe(original
    .replace('    module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] }, ', '    ')
    .replace('\'pages\', does', '\'pages\', layout: \'folder\', does')
    .replace('\'hooks\', does', '\'hooks\', layout: \'folder\', does'));

  expect(backups(root).map((backup) => read(root, backup))).toEqual([original]);
});

it.each(topologies)('names the keys it cannot rewrite and leaves the source: %j', async ({
  topology,
}) => {
  const original = 'const layers = [\'pages\', \'hooks\'].map((name) => ({ name, does: name }));\n'
    + 'export default { framework: \'react\', '
    + 'architecture: { alias: \'~app\', module: { layout: \'folder\' }, layers } };\n';

  const root = repository(original);
  const result = await cli(root, ['init', '--no-install', ...topology]);

  expect(result.code, result.output).toBe(0);
  expect(read(root, 'blueprint.config.mjs')).toBe(original);
  expect(backups(root)).toEqual([]);
  expect(result.output).toContain('blueprint.config.mjs is unchanged');
  expect(result.output).toContain('declare `layout: \'folder\'` on `pages`, `hooks`');
  expect(result.output).not.toContain('migrated');
});
