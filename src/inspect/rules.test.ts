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
    // Static catalog: no config to resolve against, so NEITHER verdict may
    // appear. "· not emitted" is the worse of the two to get wrong — it reads
    // as a resolved answer about this repo, and the reader goes looking for the
    // config decision that turned the rule off.
    expect(output).not.toContain('✓ emits');
    expect(output).not.toContain('· not emitted');
    expect(output).toContain('· not declared');
    expect(output).toContain('deadCode');
    expect(output).toContain('static catalog');

    // Gates without a metric fallback print no default at all. "(default
    // undefined)" reads as a threshold the reader cannot look up.
    expect(output).not.toContain('(default undefined)');

    // No config → no resolved per-layer view, so the docs-only block runs
    // straight into the closing note. Anything between them is an unlabelled
    // line under a heading that does not describe it.
    expect(output).toContain('cannot run under flat config\n\n(no blueprint.config.mjs');
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

    // Both silent verdicts appear whichever way round they are assigned, so
    // `toContain` on the wording alone cannot tell them apart. `usePrefix` is
    // off by the author's choice; `deepWatch` is declared error and silenced by
    // the framework — swap the two and the reader is told to look for a config
    // decision that is not there, and that a rule they switched off is live.
    expect(output).toContain('✓ error(300)');
    expect(output).toMatch(/· off\s+usePrefix →/);
    expect(output).toMatch(/· declared, never emits here deepWatch →/);
    expect(output).not.toContain('static catalog');

    // `unusedVars` is a bare tier: no number behind it, so none is printed.
    expect(output).toMatch(/✓ error\s+unusedVars →/);
    expect(output).not.toContain('(undefined)');
  });

  it('keeps deepWatch live on the framework it was written for', async () => {
    // Only React silences it. Silencing it everywhere reports a declared,
    // active Vue gate as never emitting — and the author, told the rule is
    // inert, stops relying on it while emitLint keeps enforcing it.
    const vue: Blueprint = { ...blueprint, framework: 'vue' };
    const { gates } = await runRules(repo(vue), { log: () => {} });

    expect(gates.find((gate) => gate.id === 'deepWatch')).toMatchObject({
      declared: { tier: 'error' },
      active: true,
    });
  });

  it('defaults the structural severity when the config declares emit but no lint', async () => {
    // `emit` carrying only `agents` is the common shape — `init --agent claude`
    // writes exactly that. Reaching through it for `lint.severity` without
    // guarding crashes the whole command on a perfectly ordinary config.
    const agentsOnly: Blueprint = { ...blueprint, emit: { agents: ['claude'] } };
    const { severity } = await runRules(repo(agentsOnly), { log: () => {} });

    expect(severity).toBe('error');
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
      // Travels with the selectors on purpose: an entry rebuilt from selector
      // strings alone silently loses the emitted block's test exemption, and
      // the loss is invisible where nothing collides (field issue #60).
      testExemptions: ['**/*.test.{js,jsx,ts,tsx,vue}', '**/*.spec.{js,jsx,ts,tsx,vue}'],
    });

    // services owns its primitives — only the hooks-owned import stays banned.
    expect(bans.find((entry) => entry.layer === 'services')).toMatchObject({
      packages: ['react (useContext)'],
      globals: [],
    });

    const output = lines.join('\n');

    expect(output).toContain('Per-layer bans');
    expect(output).toContain('axios');

    // Each of the three ban fields prints its own "(none)", so one unqualified
    // toContain('(none)') is satisfied by whichever field happens to be empty —
    // leaving the other two free to print anything at all. Name the field.
    // And naming the field is still not enough on its own: with three layers on
    // the board, a "(none)" for one field is printed by SOME row whatever the
    // other rows say. Assert the whole row, so each field is pinned against the
    // layer it belongs to — an empty ban list and a real one are opposite
    // instructions to whoever folds these into their own config.
    expect(output).toContain(
      '  components     no-import: (none) · packages: react (useContext), axios · globals: fetch',
    );

    expect(output).toContain(
      '  services       no-import: components, hooks · packages: react (useContext) · globals: (none)',
    );

    // The resolved view is the last thing the report prints. Anything after it
    // sits below a per-layer table and reads as one more layer's row.
    expect(output.endsWith(
      '  services       no-import: components, hooks · packages: react (useContext) · globals: (none)',
    )).toBe(true);

    // No config → no resolved view, just the static catalog.
    const bare: string[] = [];
    const empty = await runRules(repo(), { log: (m) => void bare.push(m) });

    expect(empty.bans).toEqual([]);
    expect(bare.join('\n')).not.toContain('Per-layer bans');
  });

  it('carries the exact selfOnly selectors a merge fold needs (field #20)', async () => {
    // '~root' targets the repo root, so its selectors carry the src offset
    // (field #29); a subfolder alias would have no layer surface at all.
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        additionalAliases: { '~root': '.' },
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
    const note = 'the message text is yours to write — doctor verifies selectors, never messages';

    expect(views?.selfOnly).toEqual([{ target: 'contexts', selectors: emitted, note }]);
    expect(views?.selfOnly[0].selectors).toHaveLength(2); // one per alias
    expect(views?.selfOnly[0].selectors[1]).toContain('~root\\u002Fsrc\\u002Fcontexts');

    const output = lines.join('\n');

    expect(output).toContain('Copy these selectors verbatim');
    expect(output).toContain(emitted[0]);
    // Both output shapes, one string: the caveat reached only the text form for
    // three releases, so a folding agent sent to `--json` by the playbook's merge
    // step hit the same doubt #23 already answered (field issue #117). Asserting
    // the JSON's own note against the text output is what keeps them from drifting.
    expect(output).toContain(views?.selfOnly[0].note);
  });

  it('withholds the ban message rather than omitting it by accident (field #117)', async () => {
    // The emitted entry is { selector, message }. The catalog ships the selector
    // and states that the message is the adopter's — an agent that read "carry
    // everything the emitted one did" as including the text went to an emitLint
    // dump for it, which is the one source the merge step forbids.
    const selfOnly: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
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

    const { bans } = await runRules(repo(selfOnly), { log: () => {} });

    const messages = emitLint(selfOnly)
      .flatMap((entry) => entry.rules?.['no-restricted-syntax'] as unknown[] ?? [])
      .slice(1)
      .map((item) => (item as { message: string }).message);

    expect(messages[0]).toContain('Cannot re-export from "contexts"');

    const ban = bans.find((entry) => entry.layer === 'views')?.selfOnly[0];

    expect(JSON.stringify(ban)).not.toContain('Cannot re-export');
    expect(ban?.note).toContain('yours to write');
    expect(ban?.note).toContain('never messages');
  });

  it('reads a narrowed importer list as no reason to emit the syntax ban', async () => {
    // `allowedImporters` narrows WHO may import; `selfOnly` additionally bars
    // re-export, and only the second needs no-restricted-syntax. A list without
    // it claims a rule this config never emits — the row then contradicts the
    // emitted bundle, which is the exact drift field issue #14 reported.
    const narrowed: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages' },
          { name: 'contexts', does: 'state seam', allowedImporters: ['views'] },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];

    await runRules(repo(narrowed), { json: true, log: (m) => void lines.push(m) });

    const { structural } = JSON.parse(lines.join('')) as {
      structural: { rule: string; active: boolean }[];
    };

    expect(structural.find((rule) => rule.rule === 'no-restricted-syntax')?.active).toBe(false);
  });

  it('withholds the globals ban when every layer may use the global', async () => {
    // The ban exists to keep a global inside its owning layer. With every layer
    // owning it, there is nobody to ban — and reading the condition the other
    // way round emits the rule exactly when nothing is restricted, while
    // staying silent for the one config that does restrict something.
    const shared: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'views', does: 'pages', owns: [{ global: 'fetch' }] },
          { name: 'lib', does: 'plumbing', owns: [{ global: 'fetch' }] },
        ],
        module: { layout: 'flat', entry: 'index' },
      },
      rules: {},
    };

    const lines: string[] = [];

    await runRules(repo(shared), { json: true, log: (m) => void lines.push(m) });

    const { structural } = JSON.parse(lines.join('')) as {
      structural: { rule: string; active: boolean }[];
    };

    expect(structural.find((rule) => rule.rule === 'no-restricted-globals')?.active).toBe(false);
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
