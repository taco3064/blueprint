import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stylisticPlugin from '@stylistic/eslint-plugin';
import importsPlugin from 'eslint-plugin-import-x';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LintConfigEntry } from '../emit/lint';
import { reactPreset, vuePreset } from '../presets';
import { runImpact } from './impact';

let root: string;

const silent = () => {};

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-impact-'));
});

function project(deps: Record<string, string>): void {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: deps }),
  );

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
}

interface LintResult {
  filePath: string;
  messages: { ruleId: string | null; fatal?: boolean }[];
}

/** A fake eslint module capturing what impact hands the real one. */
function fakeEslint(results: LintResult[]) {
  const captured: { options?: Record<string, unknown>; patterns?: string[] } = {};

  class ESLint {
    constructor(options: Record<string, unknown>) {
      captured.options = options;
    }

    async lintFiles(patterns: string[]): Promise<LintResult[]> {
      captured.patterns = patterns;

      return results;
    }
  }

  return { module: { ESLint }, captured };
}

const tsParser = { parseForESLint: () => ({}) };
const tsPlugin = { rules: {} };
const vueParser = { parseForESLint: () => ({}) };

function loader(eslintModule: unknown) {
  const loaded: string[] = [];

  const loadModule = async (name: string): Promise<unknown> => {
    loaded.push(name);

    if (name === 'eslint') {
      return eslintModule;
    }

    // Wrapped in `default` on purpose — exercises the CJS/ESM interop unwrap.
    if (name === 'typescript-eslint') {
      return { default: { parser: tsParser, plugin: tsPlugin } };
    }

    if (name === 'vue-eslint-parser') {
      return { default: vueParser };
    }

    // The real plugins, not stubs: codeStyle reads stylistic's customize()
    // factory, so a `{ rules: {} }` stand-in would not exercise the path the
    // adopting project actually runs.
    if (name === '@stylistic/eslint-plugin') {
      return { default: stylisticPlugin };
    }

    if (name === 'eslint-plugin-import-x') {
      return { default: importsPlugin };
    }

    throw new Error(`unexpected module ${name}`);
  };

  return { loadModule, loaded };
}

describe('runImpact · the parser the stack asks for', () => {
  it('wires the project parsers on a Vue + TypeScript stack', async () => {
    project({ vue: '^3', typescript: '^5' });

    const { module, captured } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    await runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent });

    expect(loaded).toEqual(
      expect.arrayContaining(['eslint', 'typescript-eslint', 'vue-eslint-parser']),
    );

    const entries = captured.options?.overrideConfig as LintConfigEntry[];
    const vueEntry = entries.find((e) => e.files?.[0] === '**/*.vue');
    const tsEntry = entries.find((e) => e.files?.[0] === '**/*.{ts,tsx,mts,cts}');

    // The .vue entry chains the TS parser for script blocks, like the
    // generated eslint config does.
    expect(vueEntry?.languageOptions?.parser).toBe(vueParser);
    expect(vueEntry?.languageOptions?.parserOptions?.parser).toBe(tsParser);
    expect(tsEntry?.languageOptions?.parser).toBe(tsParser);
  });

  it('keeps a plain-JS Vue stack on the vue parser alone', async () => {
    project({ vue: '^3' });

    const { module, captured } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    await runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent });

    expect(loaded).not.toContain('typescript-eslint');
    // Both carriers load because this preset turns their gates ON, and skipping a
    // carrier under an active gate reports 0 hits — indistinguishable from a clean
    // repo. Neither is stack-dependent, which is why the vue/ts arms above do not
    // decide them; the gates do.
    expect(loaded).toContain('@stylistic/eslint-plugin');
    expect(loaded).toContain('eslint-plugin-import-x');

    const entries = captured.options?.overrideConfig as LintConfigEntry[];
    const vueEntry = entries.find((e) => e.files?.[0] === '**/*.vue');

    expect(vueEntry?.languageOptions?.parser).toBe(vueParser);
    expect(vueEntry?.languageOptions?.parserOptions).toBeUndefined();
  });

  it('resolves framework `auto` from the detected project', async () => {
    project({ react: '^18' });

    const { module, captured } = fakeEslint([]);
    const { loadModule } = loader(module);

    await runImpact(root, {
      loadConfig: async () => ({ ...reactPreset(), framework: 'auto' as const }),
      loadModule,
      log: silent,
    });

    const entries = captured.options?.overrideConfig as LintConfigEntry[];

    expect(entries.some((e) => e.languageOptions?.parserOptions?.ecmaFeatures?.jsx)).toBe(true);
  });

  it('lets the authored framework outrank what the repo happens to have installed', async () => {
    // `auto` is the only value that defers to detection. A declared framework
    // is the contract, and a repo can be mid-migration — vue in the blueprint
    // before the dependency lands, or a package.json that says nothing at all.
    // Re-deriving it from detection drops the vue parser, every .vue file then
    // parse-errors, and its rule hits are reported as caveats instead of hits.
    project({});

    const { module, captured } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    await runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent });

    expect(loaded).toContain('vue-eslint-parser');

    const entries = captured.options?.overrideConfig as LintConfigEntry[];

    expect(entries.find((e) => e.files?.[0] === '**/*.vue')?.languageOptions?.parser)
      .toBe(vueParser);
  });

  it('falls back to the auto glob set when nothing pins the framework', async () => {
    project({});

    const { module, captured } = fakeEslint([]);
    const { loadModule } = loader(module);

    await runImpact(root, {
      loadConfig: async () => ({ ...reactPreset(), framework: 'auto' as const }),
      loadModule,
      log: silent,
    });

    // No detected framework → the widest extension glob, no parser entries.
    expect(captured.patterns?.[0]).toContain('vue');

    const entries = captured.options?.overrideConfig as LintConfigEntry[];

    expect(entries.every((e) => e.languageOptions === undefined)).toBe(true);
  });
});

describe('runImpact · the carrier plugins a gate needs', () => {
  it('does not require a carrier no gate would use (field run #133)', async () => {
    // A repo translating only structural flow declares no gates, and impact refused
    // the whole command over `@stylistic/eslint-plugin` — a formatting carrier nothing
    // in that config would have emitted. The agent lost the verification and rebuilt
    // it from `eslint --print-config` runs by hand. Requiring a plugin is right where
    // a gate rides it and wrong where none does, and the tool already computes which:
    // the same list doctor's survival check reads.
    project({ vue: '^3' });

    const { module } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    const bare = { ...vuePreset(), rules: {} };

    await expect(
      runImpact(root, { loadConfig: async () => bare, loadModule, log: silent }),
    ).resolves.toBeDefined();

    expect(loaded).not.toContain('@stylistic/eslint-plugin');
    expect(loaded).not.toContain('eslint-plugin-import-x');
    // eslint is not optional — the run cannot happen without it.
    expect(loaded).toContain('eslint');
  });

  it('still requires the carrier when one gate rides it', async () => {
    // The half that must not regress: `importBlock` alone brings import-x back, and
    // asking for it is correct there — dropping it would report 0 hits for a gate
    // that is on. One gate, one carrier, and the other stays unrequested.
    project({ vue: '^3' });

    const { module } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    const oneGate = { ...vuePreset(), rules: { importBlock: 'error' as const } };

    await runImpact(root, { loadConfig: async () => oneGate, loadModule, log: silent });

    expect(loaded).toContain('eslint-plugin-import-x');
    expect(loaded).not.toContain('@stylistic/eslint-plugin');
  });
});

describe('runImpact · the config it hands eslint', () => {
  it('hands eslint the layer globs and a config the preset can parse', async () => {
    project({ react: '^18' });

    const { module, captured } = fakeEslint([]);
    const { loadModule } = loader(module);

    await runImpact(root, { loadConfig: async () => reactPreset(), loadModule, log: silent });

    // Layer globs travel to lintFiles; the react preset stays parseable via jsx.
    expect(captured.patterns?.some((p) => p.includes('components'))).toBe(true);
    expect(captured.options).toMatchObject({ cwd: root, errorOnUnmatchedPattern: false });

    const entries = captured.options?.overrideConfig as LintConfigEntry[];

    expect(entries.some((e) => e.languageOptions?.parserOptions?.ecmaFeatures?.jsx)).toBe(true);
  });

  it('measures the injected-plugin gates instead of silently reporting zero', async () => {
    project({ react: '^18' });

    const { module, captured } = fakeEslint([]);
    const { loadModule } = loader(module);

    await runImpact(root, { loadConfig: async () => reactPreset(), loadModule, log: silent });

    const entries = captured.options?.overrideConfig as LintConfigEntry[];
    const gate = entries.find((e) => e.rules?.['@stylistic/max-statements-per-line']);

    expect(gate?.rules?.['@stylistic/padding-line-between-statements']).toBeDefined();
    expect(gate?.rules?.['@stylistic/indent']).toBeDefined(); // the codeStyle bundle
    expect(gate?.rules?.['import-x/no-duplicates']).toBeDefined();
    expect(gate?.plugins?.['@stylistic']).toBe(stylisticPlugin);
    expect(gate?.plugins?.['import-x']).toBe(importsPlugin);
  });
});
