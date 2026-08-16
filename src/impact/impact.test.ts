import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stylisticPlugin from '@stylistic/eslint-plugin';
import importsPlugin from 'eslint-plugin-import-x';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flattenProse } from '../conformance';
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

const at = (rel: string) => path.join(root, rel);

describe('runImpact · refuses what it cannot run', () => {
  it('refuses to run without an authored config', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    await expect(runImpact(root, { log: silent })).rejects.toThrow('author the config first');
  });

  it('names the missing dependency when the project cannot supply the stack', async () => {
    project({ vue: '^3' });

    const loadModule = async (name: string): Promise<unknown> => {
      throw new Error(`Cannot find package 'unrs-resolver' imported from ${name}`);
    };

    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('impact needs "eslint"');

    // The message must carry the next step, not just the miss: the two
    // brownfield agents of field issue #35 reached impact before init and the
    // only thing that got them unstuck in one hop was this pointer.
    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('`blueprint init` lists it among the required deps');

    // The loader's own words, verbatim: "installed, but its own tree is
    // incomplete" and "absent" fail here identically, and the caught error is
    // the only thing that tells them apart. A run that had the plugin and was
    // missing a transitive spent three lint runs and three package.json reads
    // reaching that name for itself (field run #145).
    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('Cannot find package \'unrs-resolver\'');

    await expect(
      runImpact(root, { loadConfig: async () => vuePreset(), loadModule, log: silent }),
    ).rejects.toThrow('If that names a DIFFERENT package');
  });

  it('reports a non-Error rejection from the loader too', async () => {
    project({ vue: '^3' });

    // A loader that rejects with a string (or anything else) still has to say
    // what it said — `error.message` on a non-Error is undefined, and printing
    // "The loader said: undefined" is the same swallowing with extra steps.
    await expect(
      runImpact(root, {
        loadConfig: async () => vuePreset(),
        loadModule: async () => Promise.reject('EACCES on the store'),
        log: silent,
      }),
    ).rejects.toThrow('EACCES on the store');
  });
});

describe('runImpact · the tally it reports', () => {
  it('aggregates hits per rule with the heaviest files first', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([
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

describe('runImpact · rules that are not blueprint\'s own', () => {
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

    const { impacts, total } = await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: silent,
    });

    const alien = impacts.find((impact) => impact.rule === 'custom/no-bad-script-literals');

    expect(alien?.foreign).toBe(true);
    expect(impacts.find((impact) => impact.rule === 'max-lines')?.foreign).toBe(false);
    // Foreign hits never inflate the wiring-red total.
    expect(total).toBe(1);
  });

  it('says what an echoed row IS, not only what it is not (field run #146)', async () => {
    project({ react: '^18' });

    const { module } = fakeEslint([
      {
        filePath: at('src/components/A.jsx'),
        messages: [{ ruleId: 'custom/no-bad-script-literals' }, { ruleId: 'max-lines' }],
      },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    await runImpact(root, {
      loadConfig: async () => reactPreset(),
      loadModule,
      log: (message) => (output = message),
    });

    expect(output).toContain('1 hit(s)');
    expect(output).toContain('Names YOUR OWN config owns');
    expect(output).toContain('custom/no-bad-script-literals');

    // What the row IS, because "echo of your own config" said what it is not.
    // ESLint reports an unresolvable rule id at the directive naming it, so the
    // count counts comments; a field agent read the count as violations of its
    // house rule and concluded impact had loaded its config and ignored an
    // inline disable — neither of which happens (field run #146).
    const prose = flattenProse(output);

    expect(prose).toContain('a count here counts mentions — not violations');
    expect(prose).toContain('not a verdict on the code beneath one');
    // The rows go, the rule stays: "these vanish once emitLint merges" read as
    // the house rule itself disappearing from the merged config.
    expect(prose).toContain('The ROWS leave this report');
    expect(prose).toContain('Your rule does not');
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
    expect(output).toContain('Names YOUR OWN config owns');
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

    const echoesAt = out.indexOf('Names YOUR OWN config owns');
    const caveatBlock = out.slice(out.indexOf('Isolation caveats'), echoesAt);
    const echoBlock = out.slice(echoesAt);

    // Fails first, and says why: a renamed heading turns the slices into
    // "everything after Isolation caveats" and "the last character", which the
    // pairs below do catch — as six lines of block diff about no-console.
    expect(echoesAt).toBeGreaterThan(-1);

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
