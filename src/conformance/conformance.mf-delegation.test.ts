import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import { makeRepo, rm, write } from './conformance';

const roots: string[] = [];
const ruleId = 'blueprint/use-prefix-needs-reactivity';

const reactive = 'import { useState } from "react"; '
  + 'export function useCollection() { return useState([]); }';

const entry = 'export { useCollection } from "./useCollection";';

const hook = 'import { useCollection } from "~app/common/hooks/useCollection"; '
  + 'export function useDailyLogs() { return useCollection(); }';

function blueprint(sourceRoot: string): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app', sourceRoot,
      modules: [
        { name: 'littlesteps', does: 'Daily logs', dependsOn: ['common'] },
        { name: 'common', does: 'Shared state' },
      ],
      layers: [{ name: 'hooks', does: 'Reactive state', layout: 'folder' }],
    },
    rules: { usePrefixReactivity: 'error' },
  };
}

function fixture(options: { sourceRoot?: string; basePath?: string; absolute?: boolean } = {}) {
  const directory = makeRepo();
  const { sourceRoot = 'src', basePath } = options;
  const root = path.join(basePath ?? '.', sourceRoot);
  const source = path.join(root, 'littlesteps/hooks/useDailyLogs/useDailyLogs.js');
  const collection = path.join(root, 'common/hooks/useCollection/useCollection.js');
  const barrel = path.join(root, 'common/hooks/useCollection/index.js');
  const scopedBase = options.absolute ? path.join(directory, basePath!) : basePath;

  roots.push(directory);
  write(directory, source, hook);
  write(directory, collection, reactive);
  write(directory, barrel, entry);

  return { directory, source, collection, barrel,
    eslint: new ESLint({ cwd: directory, overrideConfigFile: true,
      overrideConfig: emitLint(blueprint(sourceRoot), { basePath: scopedBase }) }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rm(root);
  }
});

describe('MF composed hook canonical alias evidence', () => {
  it.each([
    {}, { sourceRoot: '.' }, { sourceRoot: 'features' },
    { sourceRoot: 'features', basePath: 'apps/web' },
    { sourceRoot: 'features', basePath: 'apps/web', absolute: true },
  ])('uses the emitted source and app roots: %j', async (options) => {
    const { eslint, source, directory } = fixture(options);
    const [result] = await eslint.lintFiles([source]);

    expect(result.messages).toEqual([]);
    const config = await eslint.calculateConfigForFile(path.join(directory, source));

    expect(config.rules[ruleId]).toEqual([2, {
      alias: '~app', sourceRoot: options.sourceRoot ?? 'src',
      ...(options.basePath
        ? {
            basePath: options.absolute ? path.join(directory, options.basePath) : options.basePath,
          }
        : {}),
    }]);
  });

  it.each([
    'export { useCollection } from "~app/common/hooks/useCollection/useCollection";',
    'import { useCollection } from "~app/common/hooks/useCollection/useCollection"; '
    + 'export { useCollection };',
    'export * from "~app/common/hooks/useCollection/useCollection";',
  ])('follows an alias through barrel binding %s', async (barrelCode) => {
    const { directory, barrel, source, eslint } = fixture();

    write(directory, barrel, barrelCode);
    const [result] = await eslint.lintFiles([source]);

    expect(result.messages).toEqual([]);
  });

  it.each([
    'import * as hooks from "~app/common/hooks/useCollection"; '
    + 'export function useDailyLogs() { return hooks.useCollection(); }',
    'import { useCollection as collect } from "~app/common/hooks/useCollection"; '
    + 'export function useDailyLogs() { return collect(); }',
  ])('follows the actual called alias binding %s', async (code) => {
    const { directory, source, eslint } = fixture();

    write(directory, source, code);
    const [result] = await eslint.lintFiles([source]);

    expect(result.messages).toEqual([]);
  });

  it.each([
    'export function useCollection() { return []; }',
    'import { useState } from "other"; export function useCollection() { return useState(); }',
    'import { useState } from "react"; '
    + 'export function useCollection(useState) { return useState(); }',
    'import { useState } from "react"; export function useCollection() { '
    + 'const unused = () => useState([]); return unused; }',
    'import { useCollection } from "~app/common/hooks/useCollection"; '
    + 'export { useCollection };',
    'export { useCollection } from "~app/missing";',
    'export { useCollection } from "~application/common/hooks/useCollection";',
  ])('keeps non-evidence diagnostic: %s', async (implementation) => {
    const { directory, collection, source, eslint } = fixture();

    write(directory, collection, implementation);
    const [result] = await eslint.lintFiles([source]);

    expect(result.messages.map(({ ruleId: id, severity }) => ({ ruleId: id, severity })))
      .toEqual([{ ruleId, severity: 2 }]);
  });
});
