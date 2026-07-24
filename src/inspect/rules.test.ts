import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_ONLY_RULES, LINT_GATED_RULE_IDS, METRIC_GATES } from '../emit/lint/patterns';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary (module cycle); the test pins the mirror to the real thing.
import { emitLint } from '../emit/lint';
import { runRules, STRUCTURAL_RULES } from './rules';
import type { Blueprint } from '../config';

const dirs: string[] = [];

function repo(config?: Blueprint): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rules-'));

  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));

  if (config) {
    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      `export default ${JSON.stringify(config)};\n`,
    );
  }

  return dir;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }] },
      { name: 'services', does: 'net', owns: ['axios', { global: 'fetch' }] },
    ],
    module: { layout: 'flat', entry: 'index', private: [] },
  },
  rules: {
    maxLines: { tier: 'error', value: 300 },
    maxStatements: { tier: 'warn' }, // object form without a value — fallback applies
    unusedVars: 'error',
    cycles: 'warn',
    deepWatch: 'error', // silenced by construction on react
    usePrefix: 'off',
  },
  emit: { lint: { severity: 'warn' } },
};

describe('runRules', () => {
  it('covers every machine-gated id — a new gate cannot ship without a row', async () => {
    const { gates } = await runRules(repo(), { log: () => {} });
    const ids = new Set(gates.map((gate) => gate.id));

    for (const id of LINT_GATED_RULE_IDS) {
      expect(ids.has(id)).toBe(true);
    }

    // Metric fallbacks come straight from METRIC_GATES — never hand-copied.
    for (const metric of METRIC_GATES) {
      expect(gates.find((gate) => gate.id === metric.id)?.fallback).toBe(metric.fallback);
    }
  });

  it('prints the static catalog without a config, tiers unannotated', async () => {
    const lines: string[] = [];
    const { severity, gates } = await runRules(repo(), { log: (m) => void lines.push(m) });

    expect(severity).toBe('error');
    expect(gates.every((gate) => gate.declared === null && !gate.active)).toBe(true);

    const output = lines.join('\n');

    expect(output).toContain('Structural — dependency flow & ownership · severity: error');
    expect(output).toContain('no-restricted-imports');
    // Static catalog: no config to resolve against, so no emit column.
    expect(output).not.toContain('✓ emits');
    expect(output).toContain('· not declared');
    expect(output).toContain('deadCode');
    expect(output).toContain('static catalog');
  });

  it('annotates the declared tiers, values, and framework silencing', async () => {
    const lines: string[] = [];
    const { severity, gates } = await runRules(repo(blueprint), { log: (m) => void lines.push(m) });
    const byId = new Map(gates.map((gate) => [gate.id, gate]));

    expect(severity).toBe('warn'); // emit.lint.severity travels into the header

    expect(byId.get('maxLines')).toMatchObject({
      declared: { tier: 'error', value: 300 },
      active: true,
    });

    expect(byId.get('unusedVars')).toMatchObject({ declared: { tier: 'error' }, active: true });
    expect(byId.get('cycles')).toMatchObject({ declared: { tier: 'warn' }, active: true });

    // Object form without a value: declared carries no value, fallback shows.
    expect(byId.get('maxStatements')).toMatchObject({
      declared: { tier: 'warn' },
      fallback: 15,
      active: true,
    });

    expect(byId.get('maxStatements')?.declared).not.toHaveProperty('value');

    // Declared but structurally silent: deepWatch on React, usePrefix off.
    expect(byId.get('deepWatch')).toMatchObject({ declared: { tier: 'error' }, active: false });
    expect(byId.get('usePrefix')).toMatchObject({ declared: { tier: 'off' }, active: false });
    expect(byId.get('maxParams')).toMatchObject({ declared: null, active: false });

    const output = lines.join('\n');

    expect(output).toContain('✓ error(300)');
    expect(output).toContain('· declared, never emits here');
    expect(output).toContain('· off');
    expect(output).not.toContain('static catalog');
  });

  it('resolves per-layer bans so nobody parses print-config by hand (field #7)', async () => {
    const lines: string[] = [];
    const { bans } = await runRules(repo(blueprint), { log: (m) => void lines.push(m) });

    // components may not import hooks/services and owns nothing — every
    // ownership ban applies to it.
    expect(bans.find((entry) => entry.layer === 'components')).toEqual({
      layer: 'components',
      forbidden: [],
      packages: ['react (useContext)', 'axios'],
      globals: ['fetch'],
      selfOnly: [],
    });

    // services owns its primitives — only the hooks-owned import stays banned.
    expect(bans.find((entry) => entry.layer === 'services')).toMatchObject({
      packages: ['react (useContext)'],
      globals: [],
    });

    const output = lines.join('\n');

    expect(output).toContain('Per-layer bans');
    expect(output).toContain('axios');
    expect(output).toContain('(none)');

    // No config → no resolved view, just the static catalog.
    const bare: string[] = [];
    const empty = await runRules(repo(), { log: (m) => void bare.push(m) });

    expect(empty.bans).toEqual([]);
    expect(bare.join('\n')).not.toContain('Per-layer bans');
  });

  it('carries the exact selfOnly selectors a merge fold needs (field #20)', async () => {
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        additionalAliases: { '~shared': './src/shared' },
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'state seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];
    const { bans } = await runRules(repo(selfOnly), { log: (m) => void lines.push(m) });

    // The strings must be emitLint's own, not a paraphrase — the whole point
    // is a fold that survives doctor's exact-text survival check.
    const emitted = emitLint(selfOnly)
      .flatMap((entry) => entry.rules?.['no-restricted-syntax'] as unknown[] ?? [])
      .slice(1)
      .map((item) => (item as { selector: string }).selector);

    const views = bans.find((entry) => entry.layer === 'views');

    expect(views?.selfOnly).toEqual([{ target: 'contexts', selectors: emitted }]);
    expect(views?.selfOnly[0].selectors).toHaveLength(2); // one per alias

    const output = lines.join('\n');

    expect(output).toContain('Copy these selectors verbatim');
    expect(output).toContain(emitted[0]);
  });

  it('emits the machine-readable catalog under --json', async () => {
    const lines: string[] = [];

    await runRules(repo(blueprint), { json: true, log: (m) => void lines.push(m) });

    const parsed = JSON.parse(lines.join('')) as {
      severity: string;
      structural: unknown[];
      gates: { id: string }[];
      docsOnly: unknown[];
    };

    expect(parsed.severity).toBe('warn');

    // Fixture: no selfOnly importer anywhere → syntax inactive; an owned
    // global bars other layers → globals active (field issue #14).
    expect(parsed.structural).toEqual(STRUCTURAL_RULES.map((rule) => ({
      ...rule,
      active: rule.rule !== 'no-restricted-syntax',
    })));

    expect(parsed.docsOnly).toEqual(DOC_ONLY_RULES);
    expect(parsed.gates.length).toBeGreaterThan(0);
  });

  it('structural annotation mirrors emitLint exactly — never probe the bundle (field #14)', async () => {
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          {
            name: 'contexts',
            does: 'provide/inject seam',
            allowedImporters: [{ layer: 'views', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    // rules.ts mirrors emitLint's conditions instead of calling it (module
    // cycle) — this pin is what keeps the mirror from drifting.
    for (const bp of [blueprint, selfOnly]) {
      const emitted = new Set(
        emitLint(bp).flatMap((entry) => Object.keys(entry.rules ?? {})),
      );

      const lines: string[] = [];

      await runRules(repo(bp), { json: true, log: (m) => void lines.push(m) });

      const parsed = JSON.parse(lines.join('')) as {
        structural: { rule: string; active: boolean }[];
      };

      for (const row of parsed.structural) {
        expect(`${row.rule}=${String(row.active)}`).toBe(`${row.rule}=${String(emitted.has(row.rule))}`);
      }
    }
  });
});
