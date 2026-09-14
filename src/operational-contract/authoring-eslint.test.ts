import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { eslintConfigSource } from './authoring-eslint';

interface ConfigEntry {
  basePath?: string;
  files?: string[];
  name?: string;
  rules?: Record<string, string>;
}

function loadConfig(source: string, url: string): ConfigEntry[] {
  const exports = { default: [] as ConfigEntry[] };

  const dependencies: Record<string, unknown> = {
    '@kekkai/blueprint': {
      emitLint: (_blueprint: unknown, options: { basePath?: string }) => [
        { name: 'blueprint', basePath: options.basePath },
      ],
    },
    'node:url': { fileURLToPath },
    '@eslint-community/eslint-plugin-eslint-comments': {},
    '@stylistic/eslint-plugin': {},
    'eslint-plugin-import-x': {},
    'vue-eslint-parser': {},
    'typescript-eslint': { parser: {}, plugin: {} },
    './blueprint.config.mjs': {},
    './apps/web/blueprint.config.mjs': {},
  };

  const compiled = ts.transpileModule(source.replaceAll('import.meta.url', JSON.stringify(url)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });

  runInNewContext(compiled.outputText, {
    exports,
    URL,
    require: (name: string) => {
      expect(Object.hasOwn(dependencies, name)).toBe(true);

      return dependencies[name];
    },
  });

  return exports.default;
}

describe('generated ESLint application scope', () => {
  it.each([
    ['vue', true, ['**/*.vue', '**/*.{ts,tsx,mts,cts}']],
    ['vue', false, ['**/*.vue']],
    ['react', true, ['**/*.{ts,tsx,mts,cts}', '**/*.{js,jsx}']],
    ['react', false, ['**/*.{js,jsx}']],
  ] as const)('scopes all entries for %s with TS=%s', (framework, hasTypescript, files) => {
    const configPath = path.resolve('authoring-fixture', 'eslint.config.mjs');
    const url = pathToFileURL(configPath).href;

    for (const basePath of [undefined, 'apps/web']) {
      const source = eslintConfigSource({
        framework, hasTypescript, guardExtensions: 'js,ts,vue', sourceRoot: 'src',
        generatedBanner: '// generated', basePath,
      });

      const entries = loadConfig(source, url);
      const expectedRoot = basePath ? fileURLToPath(new URL('./apps/web/', url)) : undefined;

      expect(entries).toHaveLength(files.length + 2);

      expect(entries.slice(0, files.length).map((entry) => entry.files))
        .toEqual(files.map((file) => [file]));

      expect(entries.map((entry) => entry.basePath)).toEqual(entries.map(() => expectedRoot));
      expect(entries[files.length].name).toBe('blueprint');
      expect(entries.at(-1)?.files).toEqual(['src/**/*.{js,ts,vue}']);

      expect(entries.at(-1)?.rules).toEqual({
        '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
        '@eslint-community/eslint-comments/require-description': 'error',
      });
    }
  });
});
