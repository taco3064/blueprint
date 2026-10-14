import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { cli, configSource, makeRepo, rm, write } from './conformance';

const directories: string[] = [];

afterEach(() => directories.splice(0).forEach(rm));

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'babyoasis', does: 'coordinate nearby room selection' },
      { name: 'app', does: 'compose routes', dependsOn: ['babyoasis'] },
    ],
    layers: [{ name: 'components', does: 'render presentation', layout: 'folder' }],
  },
  rules: {},
};

function fixture(): string {
  const directory = makeRepo({
    files: {
      'blueprint.config.mjs': configSource(blueprint),
      'src/app/routes/nearby.js': 'export { BabyOasisPage } from "~app/babyoasis";',
      'src/babyoasis/index.js': 'export { BabyOasisPage } from "./BabyOasisPage";',
      'src/babyoasis/BabyOasisPage.js':
        'import { AccountSheet } from "~app/babyoasis/components/AccountSheet"; '
        + 'export const BabyOasisPage = AccountSheet;',
      'src/babyoasis/components/AccountSheet/index.js': 'export const AccountSheet = 1;',
    },
  });

  directories.push(directory);

  return directory;
}

async function lint(directory: string, file: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: emitLint(blueprint, { basePath: directory }),
  });

  const [result] = await eslint.lintFiles([path.join(directory, file)]);

  expect(result.messages.filter((message) => message.fatal)).toEqual([]);

  return result.messages.map((message) => message.ruleId ?? 'unmatched');
}

describe('LittleSteps-equivalent module root replay', () => {
  it('exposes the page through one entry while keeping presentation in its layer', async () => {
    const directory = fixture();
    const report = await cli(directory, ['inspect', '--json']);

    expect(report.code).toBe(0);
    expect(JSON.parse(report.output).findings).toEqual([]);
    expect(await lint(directory, 'src/app/routes/nearby.js')).toEqual([]);
    expect(await lint(directory, 'src/babyoasis/index.js')).toEqual([]);
    expect(await lint(directory, 'src/babyoasis/BabyOasisPage.js')).toEqual([]);
  });

  it.each([
    'export { BabyOasisPage } from "~app/babyoasis/BabyOasisPage";',
    'export { BabyOasisPage } from "~app/babyoasis/index";',
    'const target = "~app/babyoasis/BabyOasisPage"; import(target);',
    'require("~app/babyoasis/BabyOasisPage");',
  ])('rejects private access in both actual analyzers: %s', async (source) => {
    const directory = fixture();

    write(directory, 'src/app/routes/nearby.js', source);

    const report = await cli(directory, ['inspect', '--json']);

    expect(report.code).toBe(1);

    expect(JSON.parse(report.output).findings).toContainEqual(expect.objectContaining({
      rule: 'deep-import', path: 'src/app/routes/nearby.js',
    }));

    expect(await lint(directory, 'src/app/routes/nearby.js'))
      .toContain('blueprint/import-boundary');
  });

  it('identifies disconnected fragments without publishing new architectural units', async () => {
    const directory = fixture();

    write(directory, 'src/babyoasis/Detached.js', 'export const fragment = 1;');

    const report = await cli(directory, ['inspect', '--json']);
    const findings = JSON.parse(report.output).findings;

    expect(findings.filter((finding: { rule: string }) => finding.rule === 'orphan-root-file'))
      .toEqual([expect.objectContaining({ path: 'src/babyoasis/Detached.js' })]);

    const deps = await cli(directory, ['deps', 'babyoasis']);

    expect(deps.code).toBe(0);
    expect(deps.output).not.toContain('babyoasis/Detached');
    expect(deps.output).not.toContain('babyoasis/BabyOasisPage');
  });
});
