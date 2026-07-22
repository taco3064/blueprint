import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LintConfigEntry } from '../emit/lint';
import { reactPreset, vuePreset } from '../presets';
import { renderImpact, runImpact } from './impact';
import type { ImpactOptions } from './impact';

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

    if (name === 'eslint') return eslintModule;
    // Wrapped in `default` on purpose — exercises the CJS/ESM interop unwrap.
    if (name === 'typescript-eslint') return { default: { parser: tsParser, plugin: tsPlugin } };
    if (name === 'vue-eslint-parser') return { default: vueParser };

    throw new Error(`unexpected module ${name}`);
  };

  return { loadModule, loaded };
}

const at = (rel: string) => path.join(root, rel);

describe('runImpact', () => {
  it('refuses to run without an authored config', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    await expect(runImpact(root, { log: silent })).rejects.toThrow('author the config first');
  });

  it('aggregates hits per rule with the heaviest files first', async () => {
    project({ react: '^18' });

    const { module, captured } = fakeEslint([
      {
        filePath: at('src/components/A.jsx'),
        messages: [{ ruleId: 'max-lines' }, { ruleId: 'no-restricted-imports' }],
      },
      { filePath: at('src/components/B.jsx'), messages: [{ ruleId: 'max-lines' }] },
      {
        filePath: at('src/components/C.jsx'),
        messages: [{ ruleId: 'max-lines' }, { ruleId: 'max-lines' }],
      },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    const options: ImpactOptions = {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: (message) => (output = message),
    };

    const { impacts, total } = await runImpact(root, options);

    expect(total).toBe(5);
    expect(impacts[0]).toMatchObject({ rule: 'max-lines', count: 4, files: 3 });

    // Heaviest file first; equal counts fall back to path order.
    expect(impacts[0].top.map((t) => t.path)).toEqual([
      'src/components/C.jsx',
      'src/components/A.jsx',
      'src/components/B.jsx',
    ]);

    expect(impacts[1]).toMatchObject({ rule: 'no-restricted-imports', count: 1, files: 1 });
    expect(output).toContain('max-lines — 3 file(s)');
    expect(output).toContain('worst: src/components/C.jsx (2)');
    expect(output).toContain('5 hit(s)');
    expect(output).toContain('--suppress-all');

    // Layer globs travel to lintFiles; the react preset stays parseable via jsx.
    expect(captured.patterns?.some((p) => p.includes('components'))).toBe(true);
    expect(captured.options).toMatchObject({ cwd: root, errorOnUnmatchedPattern: false });

    const entries = captured.options?.overrideConfig as LintConfigEntry[];

    expect(entries.some((e) => e.languageOptions?.parserOptions?.ecmaFeatures?.jsx)).toBe(true);
  });

  it('wires the project parsers on a Vue + TypeScript stack', async () => {
    project({ vue: '^3', typescript: '^5' });

    const { module, captured } = fakeEslint([]);
    const { loadModule, loaded } = loader(module);

    await runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent });

    expect(loaded).toEqual(expect.arrayContaining(['eslint', 'typescript-eslint', 'vue-eslint-parser']));

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

  it('splits null ruleIds by fatality: parse failures vs stale disables', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([
      { filePath: at('src/components/broken.jsx'), messages: [{ ruleId: null, fatal: true }] },
      // A stale eslint-disable comment — the file parses fine.
      { filePath: at('src/components/stale.jsx'), messages: [{ ruleId: null }] },
      { filePath: at('src/components/big.jsx'), messages: [{ ruleId: 'max-lines' }] },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    const { impacts, total } = await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: (message) => (output = message),
    });

    // Equal counts fall back to rule-name order — both special rows surface.
    expect(impacts.map((impact) => impact.rule)).toEqual([
      'max-lines',
      'parse-error',
      'unused-disable-directive',
    ]);

    // Neither special row is red the wiring introduces — counting them under
    // "would flag today" contradicted the caveat beneath them (batch 8).
    expect(total).toBe(1);
    expect(output).toContain('1 hit(s)');
    expect(output).toContain('Isolation caveats — not wiring-introduced red');
    expect(output).toContain('vanishes after the merge');
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

  it('reports zero hits on the default log and emits JSON when asked', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([]);
    const { loadModule } = loader(module);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runImpact(root, { loadConfig: async () => reactPreset(), loadModule });
    expect(log.mock.calls[0][0]).toContain('0 hits');
    log.mockRestore();

    let output = '';

    await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      json: true,
      log: (message) => (output = message),
    });

    expect(JSON.parse(output)).toEqual({ total: 0, linted: 0, impacts: [] });
  });

  it('names the missing dependency when the project cannot supply the stack', async () => {
    project({ vue: '^3' });

    const loadModule = async (name: string): Promise<unknown> => {
      throw new Error(`no ${name}`);
    };

    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('impact needs "eslint"');
  });

  it('quarantines rules that are not blueprint\'s own — isolation artifacts', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([
      {
        filePath: at('src/components/A.jsx'),
        // An existing `eslint-disable custom/...` comment under the isolated
        // config: ESLint reports the unknown rule id — not a blueprint hit.
        messages: [{ ruleId: 'custom/no-bad-script-literals' }, { ruleId: 'max-lines' }],
      },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    const { impacts, total } = await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: (message) => (output = message),
    });

    const alien = impacts.find((impact) => impact.rule === 'custom/no-bad-script-literals');

    expect(alien?.foreign).toBe(true);
    expect(impacts.find((impact) => impact.rule === 'max-lines')?.foreign).toBe(false);
    // Foreign hits never inflate the wiring-red total.
    expect(total).toBe(1);
    expect(output).toContain('1 hit(s)');
    expect(output).toContain('Echoes of YOUR OWN config');
    expect(output).toContain('custom/no-bad-script-literals');
  });

  it('keeps the zero-hit verdict even when isolation artifacts exist', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([
      { filePath: at('src/components/A.jsx'), messages: [{ ruleId: 'custom/x' }] },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    const { total } = await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: (message) => (output = message),
    });

    expect(total).toBe(0);
    expect(output).toContain('0 hits — wiring emitLint introduces no red today');
    expect(output).toContain('Echoes of YOUR OWN config');
  });

  it('caps the worst-file list at five', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
        filePath: at(`src/components/${name}.jsx`),
        messages: [{ ruleId: 'max-lines' }],
      })),
    );

    const { loadModule } = loader(module);

    const { impacts } = await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: silent,
    });

    expect(impacts[0].files).toBe(6);
    expect(impacts[0].top).toHaveLength(5);
  });
});

describe('renderImpact', () => {
  it('renders the calm zero-hit line when files were actually linted', () => {
    const out = renderImpact([], 0, 2);

    expect(out).toContain('0 hits — wiring emitLint introduces no red today');
    expect(out).not.toContain('vacuous');
  });

  it('names a vacuous zero — no file matched, no rule ever ran (field issue #12)', () => {
    const out = renderImpact([], 0, 0);

    expect(out).toContain('0 hits — vacuous: the layer globs match no files');
    expect(out).toContain('proves nothing until code lands in a layer');
  });
});
