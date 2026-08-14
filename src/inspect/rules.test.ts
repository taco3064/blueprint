import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_ONLY_RULES, LINT_GATED_RULE_IDS, METRIC_GATES } from '../emit/lint/patterns';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary (module cycle); the test pins the mirror to the real thing.
import { emitLint } from '../emit/lint';
import { runRules, STRUCTURAL_RULES } from './rules';
import type { LayerBans } from './rules';
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
    // The framework case now says WHY it is silent, and still says it was declared:
    // one means a line in the config does nothing, the other that adding one would.
    expect(output).toContain('✓ error(300)');
    expect(output).toMatch(/· off\s+usePrefix →/);
    expect(output).toMatch(/· declared, unavailable here deepWatch →/);
    // And the row count reconciles with inspect's denominator in place, rather than
    // by subtraction the reader has to guess at (field run #137).
    expect(output).toContain('18 listed — 2 of them unavailable on this stack');
    expect(output).toContain('deepWatch: Vue only');
    expect(output).toContain('explicitAny: `any` is a TypeScript construct');
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

  it('separates a gate the stack rules out from one the author also declared', async () => {
    // Two different instructions live in that split, and only the declared half was
    // ever asserted. "Declared, unavailable here" means a line already in the config
    // does nothing — delete it or change stacks. "Unavailable here" alone means adding
    // one would do nothing either, so there is no config decision to go looking for.
    // Collapsing them sends the undeclared reader hunting for a line that is not there.
    const undeclared: Blueprint = { ...blueprint, rules: { unusedVars: 'error' } };
    const lines: string[] = [];

    await runRules(repo(undeclared), { log: (m) => void lines.push(m) });

    const output = lines.join('\n');

    // `· unavailable here` is not a substring of `· declared, unavailable here` — the
    // comma sits where the `·` would have to be — so this tells the two apart.
    expect(output).toMatch(/· unavailable here\s+deepWatch →/);
    expect(output).not.toMatch(/· declared, unavailable here\s+deepWatch →/);
  });

  it('calls testFilename unavailable when testFiles exempts nothing', async () => {
    // The gate's emitted entry is scoped to the test globs, so `testFiles: []` leaves it
    // nothing to run on — and the emitter drops it, because `files: []` is a config
    // ESLint refuses. A drop nobody is told about is the half-truth this column exists
    // for: an adopter declared the gate `error`, watched it validate, and the rule was
    // never in the config (field run #150).
    const none: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: [] },
      rules: { ...blueprint.rules, testFilename: 'error' },
    };

    const lines: string[] = [];
    const { gates } = await runRules(repo(none), { log: (m) => void lines.push(m) });

    expect(gates.find((gate) => gate.id === 'testFilename')?.unavailable)
      .toContain('exempts nothing');

    const output = lines.join('\n');

    expect(output).toMatch(/· declared, unavailable here testFilename →/);
    expect(output).toContain('testFilename: `architecture.testFiles: []` exempts nothing');

    // And the denominator moves with it, or the note and the rows disagree again.
    expect(output).toContain('18 listed — 3 of them unavailable on this stack');
  });

  it('keeps testFilename available when testFiles names any glob at all', async () => {
    // The arm is `testFiles.length === 0`, and `&& true` in its place survived — every
    // array would have marked the gate unavailable, including the ordinary case of a
    // project that simply names its own test pattern.
    const named: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: ['**/*.spec.ts'] },
      rules: { ...blueprint.rules, testFilename: 'error' },
    };

    const { gates } = await runRules(repo(named), { log: () => {} });

    expect(gates.find((gate) => gate.id === 'testFilename')?.unavailable).toBeUndefined();
  });

  it('says the row count matches when the stack can open every gate', async () => {
    // A TypeScript Vue project is the one shape with nothing to exclude, and the note
    // has to say so rather than go quiet: silence would leave the reader comparing
    // eighteen rows to a denominator with no statement either way, which is the
    // position the disagreement put them in (field run #137).
    const dir = repo({ ...blueprint, framework: 'vue' });

    // `detect` reads TypeScript off the dependency list, not off a tsconfig — the
    // fixture's package.json has to declare it or `explicitAny` stays unavailable.
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', devDependencies: { typescript: '^5' } }),
    );

    const lines: string[] = [];
    const { gates } = await runRules(dir, { log: (m) => void lines.push(m) });

    expect(gates.every((gate) => gate.unavailable === undefined)).toBe(true);
    expect(lines.join('\n')).toContain('all of them openable on this stack');
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
      // A flat config has one kind of entry, and the row still says which —
      // a reader pasting from here should not have to infer the shape from
      // which keys happen to be absent.
      zone: 'layer',
      layer: 'components',
      forbidden: [],
      packages: ['react (useContext)', 'axios'],
      // Beside the column it is about, not once at the top: the playbook sends a
      // folding agent to `rules --json` in five places, and a consumer reading
      // `bans[i].packages` has no reason to look at a sibling key. The text output
      // carrying this caveat while `--json` did not is #117's exact shape, which came
      // back from the other channel three releases later (field run #159).
      packagesNote: expect.stringContaining('is not compared by doctor\'s survival check'),
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

    // Absent where the column is: a layer banning no package has nothing to verify, and
    // a caveat about an empty list sends the reader looking for a column that is not there.
    const owner = await runRules(repo({
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        layers: [{ name: 'components', does: 'UI' }],
      },
    }), { log: () => {} });

    expect(owner.bans[0].packages).toEqual([]);
    expect(owner.bans[0]).not.toHaveProperty('packagesNote');

    // And the text output gates on the same fact, or it becomes the counterexample to the
    // reason `--json` withholds the note: a paragraph about a column reading `(none)` all
    // the way down, which is what "nothing to verify" was supposed to prevent.
    const noOwners: string[] = [];

    await runRules(repo({
      ...blueprint,
      architecture: { ...blueprint.architecture, layers: [{ name: 'components', does: 'UI' }] },
    }), { log: (m) => void noOwners.push(m) });

    expect(noOwners.join('\n')).toContain('Per-layer bans');
    expect(noOwners.join('\n')).not.toContain('is not compared by');

    // Positively too, because the caveat is spread in from a ternary whose other arm is
    // an empty list: anything at all in that arm lands as a line between the paragraph
    // and the rows, and `not.toContain('is not compared by')` stays green for every one
    // of them. Pin the seam instead — the last line of the paragraph, then the row.
    const resolved = noOwners.join('\n');
    const section = resolved.slice(resolved.indexOf('Per-layer bans')).split('\n');

    // Matched at the end rather than whole, so a re-wrap of the paragraph does not
    // fail this — the seam is what is being pinned, not the wrapping.
    expect(section.at(-2)).toMatch(/Copy, do not retype\.$/);

    expect(section.at(-1)).toBe(
      '  components     no-import: (none) · packages: (none) · globals: (none)',
    );

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

    const note = 'copy `jsLiteral`, not `selectors`: pasted into JS source a rendered selector '
      + 'loses its \\u002F escape and the regex ends at the bare /, silently. The ban '
      + 'message text is yours to write — doctor verifies selectors, never messages';

    expect(views?.selfOnly).toEqual([{
      target: 'contexts',
      selectors: emitted,
      jsLiteral: emitted.map((selector) => JSON.stringify(selector)),
      note,
    }]);

    expect(views?.selfOnly[0].selectors).toHaveLength(2); // one per alias
    expect(views?.selfOnly[0].selectors[1]).toContain('~root\\u002Fsrc\\u002Fcontexts');

    const output = lines.join('\n');

    expect(output).toContain('Paste these verbatim, quotes included');
    // The text form prints the LITERAL, because this line exists to be copied into a
    // config and the value does not survive that copy (field run #125).
    expect(output).toContain(JSON.stringify(emitted[0]));
    // Both output shapes, one string: the caveat reached only the text form for
    // three releases, so a folding agent sent to `--json` by the playbook's merge
    // step hit the same doubt #23 already answered (field issue #117). Asserting
    // the JSON's own note against the text output is what keeps them from drifting.
    expect(output).toContain(views?.selfOnly[0].note);
  });

  it('gives the selector in a form that survives being pasted into JS (field run #125)', async () => {
    // The claim under test is about JS, so it is asserted rather than described. The
    // separators are / escapes because a raw / ends esquery's regex early — and
    // JS resolves that same escape when it parses a string literal, so the rendered
    // value pasted into '…' silently becomes /^~app/contexts// and the regex ends at
    // the bare /. No parse error, lint green, and doctor's red then reads like the
    // "equivalent respelling" false alarm it warns about, which this is not.
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
      },
      rules: {},
    };

    const { bans } = await runRules(repo(selfOnly), { log: () => {} });

    const ban = bans.find((entry) => entry.layer === 'views')?.selfOnly[0];
    const value = ban?.selectors[0] ?? '';

    // The trap: JSON's string escaping is JavaScript's, so parsing the rendered value
    // as a literal is what pasting it does — and it comes back a different string.
    expect(JSON.parse(`"${value}"`)).not.toBe(value);
    expect(JSON.parse(`"${value}"`)).toContain('/^~app/contexts/');
    // The form that survives: parse the literal and the value comes back intact.
    expect(JSON.parse(ban?.jsLiteral[0] ?? '')).toBe(value);
    expect(ban?.jsLiteral[0]).toMatch(/^".*"$/);
    expect(ban?.jsLiteral[0]).toContain('\\\\u002F');
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

    // Fixture: no selfOnly importer anywhere → syntax inactive; no `modules`
    // declared → the pass-through ban has no other module to forward, so it is
    // inactive too; an owned global bars other layers → globals active
    // (field issue #14). Named rather than counted — an id added to the
    // catalog and silently defaulted to active is the drift this pins.
    const inactive = ['no-restricted-syntax', 'blueprint/no-module-reexport'];

    expect(parsed.structural).toEqual(STRUCTURAL_RULES.map((rule) => ({
      ...rule,
      active: !inactive.includes(rule.rule),
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

describe('runRules · under modules the report IS the emitted config', () => {
  // `blueprint rules --json` is a paste source — the playbook sends an agent to
  // `jsLiteral` in four places — so a selector reported at the wrong address is
  // not a stale report. It is a rule the adopter installs on this command's
  // instruction, matching nothing, with lint green over it.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      additionalAliases: { '~root': '.' },
      modules: [{ name: 'Fighter', does: 'the ship' }, { name: 'Combat', does: 'bullets' }],
      layers: [
        { name: 'contexts', does: 'providers' },
        {
          name: 'hooks',
          does: 'state',
          allowedImporters: [{ layer: 'contexts', selfOnly: true }],
        },
      ],
    },
    rules: {},
  };

  const layerNames = modular.architecture.layers.map((layer) => layer.name);

  /**
   * Every option of `rule` in the emitted entries this row describes — found by
   * the row's own zone, so a `root` row is compared against the module-zone
   * entry rather than against whichever layer entry happened to match first.
   */
  const emittedOptions = (ban: LayerBans, rule: string): unknown[] =>
    emitLint(modular)
      .filter((entry) => (entry.files ?? []).some((glob) =>
        ban.zone === 'layer'
          ? glob.startsWith(`src/${ban.module}/${ban.layer}/`)
          : glob.startsWith(`src/${ban.module}/`)
            && !layerNames.some((name) => glob.startsWith(`src/${ban.module}/${name}/`))))
      .flatMap((entry) => {
        const setting = entry.rules?.[rule];

        // Per entry, then flattened — a `.slice(1)` on the already-flattened
        // list drops the first entry's first OPTION rather than each severity.
        return Array.isArray(setting) ? setting.slice(1) : [];
      });

  const silent = () => {};

  it('reports one row per (module, layer), not one per layer', async () => {
    const { bans } = await runRules(repo(modular), { log: silent });

    // Grouped by module, each module's layer entries followed by the zone no
    // layer glob reaches — the order a reader folding one module needs.
    expect(bans.map((ban) => [ban.module, ban.zone, ban.layer])).toEqual([
      ['Fighter', 'layer', 'contexts'],
      ['Fighter', 'layer', 'hooks'],
      ['Fighter', 'root', undefined],
      ['Combat', 'layer', 'contexts'],
      ['Combat', 'layer', 'hooks'],
      ['Combat', 'root', undefined],
    ]);

    // The count is the emitted config's, not a number typed here: two entries
    // reported against four emitted is the defect this closes.
    const emitted = emitLint(modular).filter((entry) => entry.rules?.['no-restricted-imports']);

    expect(bans).toHaveLength(emitted.length);
  });

  it('reports selectors that appear verbatim in that module\'s own emitted entry', async () => {
    const { bans } = await runRules(repo(modular), { log: silent });

    let checked = 0;

    for (const ban of bans) {
      const reported = ban.selfOnly.flatMap((entry) => entry.selectors);

      const emitted = emittedOptions(ban, 'no-restricted-syntax')
        .map((item) => (item as { selector: string }).selector);

      // Equality both ways, so neither a missing selector nor an extra one
      // passes: this is the assertion that cannot be satisfied by two wrong
      // literals agreeing with each other, which is how these drifted apart.
      expect(reported).toEqual(emitted);

      checked += reported.length;
    }

    // …and it cannot pass on a report that found nothing to compare.
    expect(checked).toBe(4); // {Fighter, Combat} × {~app, ~root/src}
  });

  it('reports forbidden layers the emitted entry really bans, at the module address', async () => {
    const { bans } = await runRules(repo(modular), { log: silent });

    for (const ban of bans) {
      const groups = emittedOptions(ban, 'no-restricted-imports')
        .flatMap((option) => (option as { patterns?: { group: string[] }[] }).patterns ?? [])
        .flatMap((pattern) => pattern.group);

      for (const forbidden of ban.forbidden) {
        expect(groups).toContain(`~app/${ban.module}/${forbidden}/**`);
      }
    }

    // The `hooks` row has something to check — `contexts` restricts its
    // importers, so hooks may not reach it.
    expect(bans.find((ban) => ban.layer === 'hooks')?.forbidden).toEqual(['contexts']);
  });

  it('carries the module segment in the paste form too', async () => {
    const lines: string[] = [];
    const { bans } = await runRules(repo(modular), { log: (m) => void lines.push(m) });

    const fighter = bans.find((ban) => ban.module === 'Fighter' && ban.layer === 'contexts');
    const combat = bans.find((ban) => ban.module === 'Combat' && ban.layer === 'contexts');

    expect(fighter?.selfOnly[0].selectors[0]).toContain('~app\\u002FFighter\\u002Fhooks\\u002F');
    expect(fighter?.selfOnly[0].selectors[0]).not.toContain('~app\\u002Fhooks');

    // Two modules, two different strings — pasting one into the other's entry
    // is the failure the playbook now names.
    expect(combat?.selfOnly[0].selectors[0]).not.toBe(fighter?.selfOnly[0].selectors[0]);

    // `jsLiteral` is the same selector as JS source: what survives the paste.
    expect(fighter?.selfOnly[0].jsLiteral[0])
      .toBe(JSON.stringify(fighter?.selfOnly[0].selectors[0]));

    // The text report addresses its rows too, or two modules print alike.
    expect(lines.join('\n')).toContain('Fighter/contexts');
    expect(lines.join('\n')).toContain('Bans per module × layer');
  });

  it('reports the zone row\'s own package and global bans, with the caveat', async () => {
    // The module-zone entry carries module-level ownership just as the layer
    // entries do, and the `packages` caveat travels with the column it is
    // about — doctor does not compare that column at either level.
    const owning: Blueprint = {
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'Fighter', does: 'the ship' },
          { name: 'Combat', does: 'bullets', owns: ['rbush', { global: 'requestAnimationFrame' }] },
        ],
      },
    };

    const { bans } = await runRules(repo(owning), { log: silent });
    const root = bans.find((ban) => ban.module === 'Fighter' && ban.zone === 'root');

    expect(root?.packages).toEqual(['rbush']);
    expect(root?.globals).toEqual(['requestAnimationFrame']);
    expect(root?.packagesNote).toContain('is not compared by doctor');

    // …and the owner's own zone is barred from neither.
    const owner = bans.find((ban) => ban.module === 'Combat' && ban.zone === 'root');

    expect(owner?.packages).toEqual([]);
    expect(owner?.packagesNote).toBeUndefined();
  });

  it('names a layers:false module\'s zone for what it governs — everything', async () => {
    // `(root)` would be a lie there: the module opted out of the layer
    // vocabulary, so its entry covers every file beneath it, not the top ones.
    const routed: Blueprint = {
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'app', does: 'routing', layers: false, imports: ['Fighter'] },
          { name: 'Fighter', does: 'the ship' },
        ],
      },
    };

    const lines: string[] = [];
    const { bans } = await runRules(repo(routed), { log: (m) => void lines.push(m) });

    // One row, and no (app, layer) rows at all — it declared no layers.
    expect(bans.filter((ban) => ban.module === 'app')).toHaveLength(1);
    expect(bans.find((ban) => ban.module === 'app')?.zone).toBe('module');
    expect(lines.join('\n')).toContain('app/(all)');
    expect(lines.join('\n')).toContain('Fighter/(root)');
  });

  it('leaves a flat config with no module key and the per-layer heading', async () => {
    const lines: string[] = [];
    const { bans } = await runRules(repo(blueprint), { log: (m) => void lines.push(m) });

    // Absent, not `undefined` spelled out: `--json` is a consumed shape, and a
    // key holding "no module" reads as one the config failed to name.
    for (const ban of bans) expect('module' in ban).toBe(false);

    expect(lines.join('\n')).toContain('Per-layer bans —');
    expect(lines.join('\n')).not.toContain('module × layer');
  });
});

describe('runRules · the ban table\'s label column', () => {
  it('widens for module labels, so a modular table does not step raggedly', async () => {
    const lines: string[] = [];

    const modular: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        modules: [{ name: 'Fighter', does: '' }, { name: 'Combat', does: '' }],
        layers: [{ name: 'contexts', does: '' }, { name: 'hooks', does: '' }],
      },
      rules: {},
    };

    await runRules(repo(modular), { log: (m) => void lines.push(m) });

    const rows = lines.join('\n').split('\n').filter((line) => line.includes('no-import:'));

    expect(rows).toHaveLength(6);

    // Every row's `no-import:` starts at the same column — the property a fixed
    // width sized for layer names cannot give a label like `Fighter/contexts`.
    const columns = new Set(rows.map((row) => row.indexOf('no-import:')));

    expect(columns.size).toBe(1);
  });

  it('leaves a flat config\'s column where a long layer name already put it', async () => {
    // The width is measured only where a module exists. Measured on a flat
    // config it would come from its own longest name, and every row of a config
    // with a layer past the fixed 14 would shift — an unrelated table moving.
    const lines: string[] = [];

    const longNames: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'infrastructureAdapters', does: '' }, { name: 'ui', does: '' }],
      },
      rules: {},
    };

    await runRules(repo(longNames), { log: (m) => void lines.push(m) });

    const rows = lines.join('\n').split('\n').filter((line) => line.includes('no-import:'));

    expect(rows.some((row) => row.startsWith('  ui             no-import:'))).toBe(true);
  });
});
