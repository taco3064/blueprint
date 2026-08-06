import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stylisticPlugin from '@stylistic/eslint-plugin';
import importsPlugin from 'eslint-plugin-import-x';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LintConfigEntry } from '../emit/lint';
import { reactPreset, vuePreset } from '../presets';
import { renderImpact, runImpact } from './impact';
import type { ImpactOptions, RuleImpact } from './impact';

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
    // The real plugins, not stubs: codeStyle reads stylistic's customize()
    // factory, so a `{ rules: {} }` stand-in would not exercise the path the
    // adopting project actually runs.
    if (name === '@stylistic/eslint-plugin') return { default: stylisticPlugin };
    if (name === 'eslint-plugin-import-x') return { default: importsPlugin };

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

    // The message must carry the next step, not just the miss: the two
    // brownfield agents of field issue #35 reached impact before init and the
    // only thing that got them unstuck in one hop was this pointer.
    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('blueprint init lists it among the required deps');
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
  it('keeps caveats, echoes, and own findings in separate blocks', () => {
    const impact = (rule: string, foreign: boolean): RuleImpact => ({
      rule,
      count: 1,
      files: 1,
      top: [{ path: `${rule}.ts`, count: 1 }],
      foreign,
    });

    const out = renderImpact(
      [
        impact('blueprint/relative-escape', false),
        impact('parse-error', false),
        impact('no-console', true),
      ],
      3,
      10,
    );

    const echoesAt = out.indexOf('Echoes of YOUR OWN');
    const caveatBlock = out.slice(out.indexOf('Isolation caveats'), echoesAt);
    const echoBlock = out.slice(echoesAt);

    // Each block carries only its own kind. A caveat block that also listed
    // the blueprint hits would present isolation artifacts as
    // wiring-introduced red — the very confusion the split exists to end.
    expect(caveatBlock).toContain('parse-error');
    expect(caveatBlock).not.toContain('relative-escape');
    expect(caveatBlock).not.toContain('no-console');

    expect(echoBlock).toContain('no-console');
    expect(echoBlock).not.toContain('relative-escape');
    expect(echoBlock).not.toContain('parse-error');
  });

  it('renders the calm zero-hit line when files were actually linted', () => {
    const out = renderImpact([], 0, 2);

    expect(out).toContain('0 hits — wiring emitLint introduces no red today');
    expect(out).not.toContain('vacuous');
    // The zero states its reach — the guard is not emitLint's to measure
    // (field issue #17: 0 hits, then five guard findings in the real lint).
    expect(out).toContain('scope: emitLint only — the anti-bypass guard is separate');
  });

  it('names a vacuous zero — no file matched, no rule ever ran (field issue #12)', () => {
    const out = renderImpact([], 0, 0);

    expect(out).toContain('0 hits — vacuous: the layer globs match no files');
    expect(out).toContain('proves nothing until code lands in a layer');
  });

  it('ends on the tally when there is nothing to caveat and no echo', () => {
    // Both trailing blocks render nothing on a clean isolated run. Whatever
    // lands there sits under the tally with no heading above it — and an
    // unlabelled row is exactly what the two headings exist to prevent: the
    // reader cannot tell a blueprint finding from an isolation artifact.
    const out = renderImpact(
      [{
        rule: 'blueprint/relative-escape',
        count: 3,
        files: 2,
        top: [{ path: 'src/a.ts', count: 2 }],
        foreign: false,
      }],
      3,
      10,
    );

    expect(out.endsWith('new violations still fail.')).toBe(true);
  });

  it('ends on the scope note when the report has no findings at all', () => {
    // Same two blocks, the other exit — a zero-hit report closes on the line
    // that bounds the claim, and an appended row would read as a finding the
    // headline just said does not exist.
    expect(renderImpact([], 0, 2).endsWith('judges its findings)')).toBe(true);
  });
});
