import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LINT_GATED_RULE_IDS, METRIC_GATES } from '../emit/lint/patterns';
import { runRules } from './rules';
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

/** The same fixture with one real source file, so a dead glob is dead against a tree. */
function repoWithSource(config: Blueprint): string {
  const dir = repo(config);

  fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'components', 'a.ts'), 'export const a = 1;\n');

  return dir;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
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

describe('runRules · the catalog it prints', () => {
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

  it('annotates the declared tiers and values on the gates it returns', async () => {
    const { severity, gates } = await runRules(repo(blueprint), { log: () => {} });
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
  });

  it('prints each tier, why a silent gate is silent, and the row count', async () => {
    const lines: string[] = [];

    await runRules(repo(blueprint), { log: (m) => void lines.push(m) });

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
    expect(output).toContain('18 listed — 2 of them unavailable here');
    // Each cause on its own line, under the count rather than inside it: the count
    // sentence would need one predicate for all of them, and the causes are not of
    // one kind.
    expect(output).toContain('\n· deepWatch: Vue only');
    expect(output).toContain('\n· explicitAny: `any` is a TypeScript construct');
    expect(output).not.toContain('static catalog');

    // `unusedVars` is a bare tier: no number behind it, so none is printed.
    expect(output).toMatch(/✓ error\s+unusedVars →/);
    expect(output).not.toContain('(undefined)');
  });

  it('defaults the structural severity when the config declares emit but no lint', async () => {
    // `emit` carrying only `agents` is the common shape — `init --agent claude`
    // writes exactly that. Reaching through it for `lint.severity` without
    // guarding crashes the whole command on a perfectly ordinary config.
    const agentsOnly: Blueprint = { ...blueprint, emit: { agents: ['claude'] } };
    const { severity } = await runRules(repo(agentsOnly), { log: () => {} });

    expect(severity).toBe('error');
  });
});

describe('runRules · gates that are unavailable here', () => {
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
    expect(output).toContain('\n· testFilename: `architecture.testFiles: []` exempts nothing');

    // And the denominator moves with it, or the note and the rows disagree again.
    expect(output).toContain('18 listed — 3 of them unavailable here');
  });

  it('keeps testFilename available for a declared net, reached or not', async () => {
    // The `[]` arm is `testFiles.length === 0`, and `&& true` in its place survived —
    // every array would have marked the gate unavailable, including the ordinary case
    // of a project that simply names its own test pattern. The fixture carries NO file
    // for the glob to reach, deliberately: `emitLint` writes this net into the gate's
    // `files` whatever the tree holds, so a predicate keyed on reach would close a gate
    // the emitted config has armed, and a fixture file would hide exactly that.
    const named: Blueprint = {
      ...blueprint,
      architecture: { ...blueprint.architecture, testFiles: ['**/*.spec.ts'] },
      rules: { ...blueprint.rules, testFilename: 'error' },
    };

    const { gates } = await runRules(repoWithSource(named), { log: () => {} });

    expect(gates.find((gate) => gate.id === 'testFilename')?.unavailable).toBeUndefined();
  });

  it('reads no layer folder when the config declares no test globs', async () => {
    // The scan feeds one thing here — a count per DECLARED glob — so a config that
    // declares none buys a full-tree read with no sentence to show for it.
    // `reactPreset` declares none, so that is the ordinary run of this command, and the
    // absence is what has to be asserted: the output cannot tell the two apart.
    const dir = repo(blueprint);

    fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'components', 'a.ts'), 'export const a = 1;\n');

    const readdir = vi.spyOn(fs, 'readdirSync');
    const { gates } = await runRules(dir, { log: () => {} });
    const read = readdir.mock.calls.map(([target]) => String(target));

    readdir.mockRestore();

    // `detect` reads `src` itself for the layer names whatever else runs, so the walk is
    // the only thing that descends INTO a layer folder — and the positive half is what
    // keeps this from passing on a run that read nothing at all.
    expect(read).toContain(path.join(dir, 'src'));
    expect(read).not.toContain(path.join(dir, 'src', 'components'));

    // And skipping the walk costs the output nothing: an undeclared field has no dead
    // entry to name, and the gate this repo ships open stays open.
    expect(gates.find((gate) => gate.id === 'testFilename')?.unavailable).toBeUndefined();
  });

  it('says the row count matches when no gate is unavailable here', async () => {
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
    expect(lines.join('\n')).toContain('none of them unavailable here');
  });
});

describe('runRules · the dead test glob measured against the declared root', () => {
  it('classifies it against the DECLARED sourceRoot, not the default one', async () => {
    // The third runtime carrying `sourceRoot` into `testFileReach`. Read at `src` this
    // glob leaves the root; read at `app` it is inside and the extension is the
    // disqualifier — so a hardcoded `'src'` on this path turns the catalog's note into a
    // different sentence, and the repo would hold two answers for one glob.
    const dir = repo({
      ...blueprint,
      architecture: { ...blueprint.architecture, sourceRoot: 'app', testFiles: ['app/**/*.css'] },
      rules: { ...blueprint.rules, testFilename: 'error' },
    });

    fs.mkdirSync(path.join(dir, 'app', 'components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'app', 'components', 'Card.ts'), 'export const c = 1;\n');

    const lines: string[] = [];

    await runRules(dir, { log: (message) => void lines.push(message) });

    const printed = lines.join('\n');

    expect(printed).toContain('Measured: `app/**/*.css` — a file type this scan does not read');
    expect(printed).not.toContain('outside the source root');
  });

  it('walks the DECLARED root too, so a net healthy there is not reported dead', async () => {
    // The case above moves `sourceRoot` through the CLASSIFIER only: its glob is dead
    // under either root, so nothing it prints can see which root the WALK was handed.
    // This net reaches a file at `app` and nothing at the default, so a walk that reads
    // the default finds an empty tree, every entry matches 0, and the catalog prints the
    // dead-net sentence — a working config reported as one an adopter must fix.
    const dir = repo({
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        sourceRoot: 'app',
        testFiles: ['app/**/*.spec.ts'],
      },
      rules: { ...blueprint.rules, testFilename: 'error' },
    });

    fs.mkdirSync(path.join(dir, 'app', 'components'), { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'app', 'components', 'Card.spec.ts'),
      'export const c = 1;\n',
    );

    const lines: string[] = [];
    const { gates } = await runRules(dir, { log: (message) => void lines.push(message) });
    const gate = gates.find((entry) => entry.id === 'testFilename');

    expect(gate?.unavailable).toBeUndefined();
    expect(gate?.active).toBe(true);

    // And the row an adopter reads says so.
    expect(lines.join('\n')).toMatch(/✓ error\s+testFilename/);

    // The load-bearing half now that the row is `✓` under either root: the note is what
    // the walk's root reaches, so a walk handed `src` prints a dead net for a net that
    // is not dead. Without this the whole case passes on a hardcoded default.
    expect(lines.join('\n')).not.toContain('no file here matches');
  });

  it('gives each unavailable gate its own cause, saying what `--json` says', async () => {
    // Two gates out for two different KINDS of reason: `explicitAny` because the
    // dependency list carries no typescript, `testFilename` because this config's own
    // net is empty and `files: []` is refused by ESLint — which is a fact about the
    // config, not about the machine. Any one predicate over the pair is false for one
    // of them, so the count line carries none and each cause sits on the gate it
    // belongs to, which is the shape `--json` has had all along.
    const dir = repoWithSource({
      ...blueprint,
      framework: 'vue',
      architecture: { ...blueprint.architecture, testFiles: [] },
      rules: { ...blueprint.rules, testFilename: 'error', explicitAny: 'error' },
    });

    const text: string[] = [];
    const payload: string[] = [];

    await runRules(dir, { log: (message) => void text.push(message) });
    await runRules(dir, { json: true, log: (message) => void payload.push(message) });

    const printed = text.join('\n');

    const parsed = JSON.parse(payload.join('\n')) as {
      gates: { id: string; unavailable?: string }[];
    };

    const out = parsed.gates.filter((gate) => gate.unavailable !== undefined);

    expect(out.map((gate) => gate.id)).toEqual(['explicitAny', 'testFilename']);
    expect(printed).toContain(`18 listed — ${out.length} of them unavailable here`);
    expect(printed).not.toContain('unavailable on this stack');

    // Gate for gate, the text carries the JSON's own string — not a paraphrase, and
    // not a cause the other channel does not have.
    for (const gate of out) {
      expect(printed).toContain(`\n· ${gate.id}: ${gate.unavailable}`);
    }

    // And the JSON did not move for it: the causes did not become a payload key of
    // their own, and no aggregate note followed them across.
    expect(Object.keys(parsed)).toEqual(['severity', 'structural', 'gates', 'bans', 'docsOnly']);
  });
});
