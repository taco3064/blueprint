import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { reactPreset } from '../presets';
import { cli, configSource, makeRepo, react, rm, write } from './conformance';

const directories: string[] = [];
const hookFile = 'src/hooks/useDailyLogs/useDailyLogs.js';
const aspectFile = 'src/hooks/useDailyLogs/useDailyLogs.persistence.test.js';
const exactFile = 'src/hooks/useDailyLogs/useDailyLogs.test.js';
const contractFile = 'test/contracts/records.contract.test.js';
const hookRule = 'blueprint/use-prefix-needs-reactivity';
const testRule = 'blueprint/test-filename-matches-source';

const blueprint: Blueprint = {
  ...reactPreset(),
  rules: {
    usePrefixReactivity: 'error',
    testFilename: {
      tier: 'error',
      allowAspectSuffix: true,
      suiteRoots: [{ directory: 'test/contracts', kind: 'contract' }],
    },
  },
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rm(directory);
  }
});

function fixture(config = blueprint) {
  const directory = makeRepo({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(config),
      'src/hooks/useCollection/index.js': 'export { useCollection } from "./useCollection";',
      'src/hooks/useCollection/useCollection.js':
        'import { useState } from "react"; '
        + 'export function useCollection() { return useState([]); }',
      'src/hooks/useDailyLogs/index.js': 'export { useDailyLogs } from "./useDailyLogs";',
      [hookFile]: 'import { useCollection } from "../useCollection"; '
        + 'export function useDailyLogs() { return useCollection(); }',
      [exactFile]: 'export const exactSibling = true;',
      [aspectFile]: 'export const persistenceContract = true;',
      [contractFile]: 'export const sharedRecordsContract = true;',
    },
  });

  directories.push(directory);

  return {
    directory,
    eslint: new ESLint({
      cwd: directory,
      overrideConfigFile: true,
      overrideConfig: emitLint(config),
    }),
  };
}

describe('strict LF adoption with composed hooks and classified tests', () => {
  it('accepts the emitted rules without weakening either error gate', async () => {
    const { directory, eslint } = fixture();
    const results = await eslint.lintFiles(['src/**/*.js', 'test/**/*.js']);

    expect(results).toHaveLength(7);
    expect(results.flatMap((result) => result.messages)).toEqual([]);

    const hookConfig = await eslint.calculateConfigForFile(path.join(directory, hookFile));
    const testConfig = await eslint.calculateConfigForFile(path.join(directory, contractFile));

    expect(hookConfig.rules[hookRule]).toEqual([2]);

    expect(testConfig.rules[testRule]).toEqual([2, {
      allowAspectSuffix: true,
      suiteRoots: [{ directory: 'test/contracts', kind: 'contract' }],
    }]);

    const rules = await cli(directory, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain(hookRule);
    expect(rules.output).toContain(testRule);
  });

  it.each([
    ['a pure lookalike', 'export function useCollection() { return []; }'],
    ['an uncalled nested hook', 'import { useState } from "react"; '
    + 'export function useCollection() { const unused = () => useState([]); return unused; }'],
  ])('rejects delegation to %s at error severity', async (_name, implementation) => {
    const { directory, eslint } = fixture();

    write(directory, 'src/hooks/useCollection/useCollection.js', implementation);
    const [result] = await eslint.lintFiles([hookFile]);

    expect(result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })))
      .toEqual([{ ruleId: hookRule, severity: 2 }]);
  });

  it.each([
    'test/contracts/records.test.js',
    'src/hooks/useDailyLogs/missing.persistence.test.js',
    'src/hooks/useDailyLogs/missing.test.js',
  ])('rejects misclassification or missing source in %s', async (filename) => {
    const { directory, eslint } = fixture();

    write(directory, filename, 'export const assertion = true;');
    const [result] = await eslint.lintFiles([filename]);

    expect(result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })))
      .toEqual([{ ruleId: testRule, severity: 2 }]);
  });

  it('keeps exact sibling matching as the default when classification is absent', async () => {
    const { eslint } = fixture({ ...blueprint, rules: { testFilename: 'error' } });
    const results = await eslint.lintFiles([exactFile, aspectFile, contractFile]);
    const byFile = new Map(results.map((result) => [path.basename(result.filePath), result]));

    expect(byFile.get(path.basename(exactFile))?.messages).toEqual([]);

    for (const filename of [aspectFile, contractFile]) {
      expect(byFile.get(path.basename(filename))?.messages
        .map(({ ruleId, severity }) => ({ ruleId, severity })))
        .toEqual([{ ruleId: testRule, severity: 2 }]);
    }
  });
});
