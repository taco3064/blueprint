import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';
import { GENERATED_ESLINT_BANNER } from '../project';

let root: string;

const silent = () => {};

const load = async () => vuePreset();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (rel: string, content = '') => {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

/** A finished adoption: config, wired eslint config + alias, no reference files. */
function adopted(): void {
  write('blueprint.config.mjs', '// user config');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');

  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
  );
}

describe('runDoctor · the checks', () => {
  it('fails fast with a single check when there is no config', async () => {
    let output = '';

    const { ok, checks } = await runDoctor(root, { log: (m) => (output = m) });

    expect(ok).toBe(false);
    expect(checks).toHaveLength(1);
    expect(checks[0].detail).toContain('blueprint init');
    expect(output).toContain('✗ blueprint.config.mjs present');
  });

  it('passes every check on a finished adoption', async () => {
    adopted();
    let output = '';

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });

    expect(ok).toBe(true);
    expect(checks.every((check) => check.ok)).toBe(true);
    // Not "all 7 passed", and this fixture is why the claim was worth checking: with no
    // eslint resolvable here the survival check cannot run, and the banner used to fold
    // that skip into the pass count — so this suite asserted a verdict resting on a check
    // that never ran, exactly as a field agent found in the wild (#129).
    expect(output).toContain('⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run');
    expect(output).toContain('nothing here proves the emitted rules are alive in it');
    expect(output).not.toContain('all 7 checks passed');
    // Truly clean, no baseline — the label stays plain instead of claiming
    // coverage by a ledger that does not exist (field run #10).
    expect(checks.map((c) => c.label)).toContain('architecture clean');

    // No source files at all: an empty net is not "vacuous" — there is nothing
    // for it to catch. Calling it vacuous names a wiring gap that is not there
    // and sends the reader to move code that does not exist.
    expect(checks.find((c) => c.label.includes('architecture'))?.detail)
      .not.toContain('vacuous');

    // Nothing is leftover, so the check carries no detail at all. An empty
    // string in its place still renders a detail line — a green check followed
    // by a blank explanation reads as an explanation doctor failed to print.
    expect(checks.find((c) => c.label.includes('leftover'))?.detail).toBeUndefined();
  });

  it('stays silent about an owns package that is not installed', async () => {
    // The fixture installs `vue` only, so `inspect` reports `pinia` and `axios`
    // as declared-not-installed. doctor runs the same analysis and says nothing:
    // ownership declared ahead of the install is most legitimate at adoption,
    // which is exactly when doctor runs. `inspect` is the surface that is still
    // there four issues later, and that is where the note belongs.
    adopted();
    let output = '';

    const result = await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });

    expect(result.ok).toBe(true);
    expect(output).not.toContain('owns-not-installed');
    expect(output).not.toContain('pinia');
    expect(output).not.toContain('axios');

    expect(result.checks.find((c) => c.label.includes('architecture'))?.detail)
      .not.toContain('not in package.json');
  });

  it('flags leftover authoring artifacts — doctor has the final word, '
    + 'not a mid-flow one', async () => {
    adopted();
    write('blueprint-authoring.md', '# playbook');
    write('.claude/commands/blueprint-author.md', 'prompt');

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const check = checks.find((c) => c.label.includes('leftover'));

    expect(ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('blueprint-authoring.md');
    expect(check?.detail).toContain('.claude/commands/blueprint-author.md');
    expect(check?.detail).toContain('EXPECTED to fail');

    // Only the authoring artifacts are on disk, so this clause is the whole
    // detail: it opens on the filenames and closes on the caveat. The other two
    // slots are joined either side of it, and anything landing in one describes
    // files that are not there — which `toContain` cannot see.
    expect(check?.detail).toMatch(/^(blueprint-authoring\.md|\.claude\/commands)/);
    expect(check?.detail?.endsWith('EXPECTED to fail here')).toBe(true);
  });

  it('flags a leftover reference file', async () => {
    adopted();
    write('CLAUDE.blueprint.md', '# reference');
    let output = '';

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: (m) => (output = m) });

    expect(ok).toBe(false);

    const detail = checks.find((c) => c.label.includes('reference'))?.detail;

    expect(detail).toContain('CLAUDE.blueprint.md');
    expect(output).toContain('Adoption incomplete');

    // This fixture also SKIPS the survival check (no eslint resolvable here), and the
    // red arm used to count only failures — so the banner said "1 of 7 failed" while
    // the JSON said `skipped: 1`. An agent reads the banner and stops (#129): fixing
    // the ✗ would have handed it a green it was never told was partly unproven.
    expect(output).toContain('could not run (⊘ above)');
    expect(output).toContain('fixing the ✗ leaves those still unproven');

    // Only a reference is on disk, so its clause is the whole detail. The
    // authoring and stale-contract slots sit after it, and a doctor claiming a
    // live playbook or a stale contract sends the reader hunting for neither.
    expect(detail?.startsWith('merge and delete: CLAUDE.blueprint.md')).toBe(true);
    expect(detail?.endsWith('adoption is not done while a reference remains')).toBe(true);
  });

  it('flags eslint not wired to emitLint', async () => {
    write('blueprint.config.mjs', '// user config');
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const detail = checks.find((c) => c.label.includes('eslint'))?.detail;

    expect(ok).toBe(false);
    expect(detail).toContain('...emitLint(blueprint)');
    // Both wordings end on the same spread, so the shared clause cannot tell
    // them apart. There is no eslint config here at all — naming a migration
    // sends the reader to convert a file that does not exist, and the legacy
    // wording interpolates the absent filename as "undefined is legacy".
    expect(detail).not.toContain('is legacy');
  });

  it('names the flat-config migration for a legacy .eslintrc', async () => {
    write('blueprint.config.mjs', '// user config');
    write('.eslintrc.cjs', 'module.exports = {};');
    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(
      checks.find((c) => c.label.includes('eslint'))?.detail,
    ).toContain('migrate to flat config');
  });

  it('flags a declared alias no toolchain resolves, with the wiring snippet', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });

    const check = checks.find((c) => c.label.includes('alias'));

    expect(ok).toBe(false);
    expect(check?.ok).toBe(false);
    // The detail opens by naming which aliases resolve nowhere. Without the
    // names, the reader is told something is unwired and left to work out
    // which of the declared aliases it is.
    expect(check?.detail?.startsWith('"~app" resolves nowhere')).toBe(true);
    expect(check?.detail).toContain('"~app/*": ["./src/*"]');
    expect(check?.detail).toContain('unresolvable imports');
    // No unreadable tsconfig here, so the remedy stands alone — the clause below
    // must not appear on a repo whose configs all parse.
    expect(check?.detail).not.toContain('could not read');
  });

  it('blames an unreadable tsconfig before it blames the alias', async () => {
    adopted();
    // The alias IS declared — inside a tsconfig with a missing quote. Every
    // reader of `paths` skips the file, so the check cannot see the declaration.
    // Telling the reader to declare what is already there sends them to the
    // wrong file; the broken one is the whole problem.
    write('tsconfig.json', '{ "compilerOptions": { "paths": { "~app: ["./src/x"] } } }');
    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    const detail = checks.find((c) => c.label.includes('alias'))?.detail;

    expect(detail).toContain('tsconfig.json could not be read (a string literal never closes');
    expect(detail).toContain('an alias already declared in there would not have been seen');
  });

  it('targets the project root in the wiring snippet when sourceRoot is "."', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    const flat = async () => {
      const preset = vuePreset();

      return { ...preset, architecture: { ...preset.architecture, sourceRoot: '.' } };
    };

    const { checks } = await runDoctor(root, { loadConfig: flat, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.detail).toContain('"~app/*": ["./*"]');
  });

  it('accepts an alias wired through the vite config text', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));
    write('vite.config.ts', 'export default { resolve: { alias: { \'~app\': \'/src\' } } };');

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.ok).toBe(true);
  });

  it('accepts an alias wired through a webpack-era bundler config', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    // vue-cli style: no vite config at all, alias lives in vue.config.js.
    write(
      'vue.config.js',
      'module.exports = { chainWebpack: (c) => c.resolve.alias.set(\'~app\', \'/src\') };',
    );

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.ok).toBe(true);
  });

  it('demands the vite alias as a quoted token — '
    + 'a scoped-package import is no wiring', async () => {
    adopted();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    const at = async () => {
      const preset = vuePreset();

      return { ...preset, architecture: { ...preset.architecture, alias: '@' } };
    };

    // '@' appears in every scoped import — a substring match would pass vacuously.
    write('vite.config.ts', 'import vue from \'@vitejs/plugin-vue\';\nexport default {};');

    let { checks } = await runDoctor(root, { loadConfig: at, log: silent });

    expect(checks.find((c) => c.label.includes('alias'))?.ok).toBe(false);

    // The real wiring is a quoted token — that one counts.
    write(
      'vite.config.ts',
      'import vue from \'@vitejs/plugin-vue\';\n'
      + 'export default { resolve: { alias: { \'@\': \'/src\' } } };',
    );

    ({ checks } = await runDoctor(root, { loadConfig: at, log: silent }));

    expect(checks.find((c) => c.label.includes('alias'))?.ok).toBe(true);
  });

  it('states the coverage on a clean gate, and calls out a vacuous one', async () => {
    adopted();
    write('src/components/Button.vue', 'export default {};');

    let { checks } = await runDoctor(root, { loadConfig: load, log: silent });
    let check = checks.find((c) => c.label.includes('architecture'));

    expect(check?.ok).toBe(true);
    expect(check?.detail).toContain('1/1 source files inside layer nets');

    // Only root wiring exists → the net catches nothing, and the green says so.
    fs.rmSync(path.join(root, 'src/components/Button.vue'));
    write('src/main.ts', 'export {};');

    ({ checks } = await runDoctor(root, { loadConfig: load, log: silent }));
    check = checks.find((c) => c.label.includes('architecture'));

    expect(check?.ok).toBe(true);
    expect(check?.detail).toContain('clean, but vacuous');
    // "Adoption complete" + "proves nothing" would read as a contradiction —
    // the detail closes the gap by naming the step that arms the net.
    expect(check?.detail).toContain('the wiring is done — next: move code into a declared layer');
  });

  it('fails when a later config entry swallowed the emitted structural rules', async () => {
    adopted();
    write('src/views/Home/index.vue', 'export default {};');

    const selfOnly = async () => {
      const preset = vuePreset();
      // usePrefix targets the preset's hooks layer — gone with the relayout.
      const { usePrefix: _usePrefix, ...rules } = preset.rules ?? {};

      return {
        ...preset,
        rules,
        architecture: {
          ...preset.architecture,
          layers: [
            { name: 'views', does: 'pages' },
            {
              name: 'contexts',
              does: 'shared state',
              allowedImporters: [{ layer: 'views', selfOnly: true }],
            },
          ],
        },
      };
    };

    // The merged config kept nothing of blueprint's — the codex scenario.
    const loadModule = async (): Promise<unknown> => ({
      ESLint: class {
        async calculateConfigForFile(): Promise<unknown> {
          return { rules: { 'no-restricted-syntax': [2, 'CallExpression[callee.name=Date]'] } };
        }
      },
    });

    const { ok, checks } = await runDoctor(root, { loadConfig: selfOnly, loadModule, log: silent });

    const check = checks.find((c) => c.label.includes('survive'));

    expect(ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('selfOnly selector(s)');
    expect(check?.detail).toContain('combine both option sets into ONE');
  });

  it('flags findings without claiming a baseline that does not exist', async () => {
    adopted();
    write('src/random/x.ts', 'export const x = 1;'); // undeclared folder → error finding
    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const check = checks.find((c) => c.label.includes('architecture'));

    expect(ok).toBe(false);
    // No baseline file — neither label nor detail may mention one as if it
    // were in play (field run #10: doctor and inspect told opposite stories).
    expect(check?.label).toBe('architecture clean');
    expect(check?.detail).toContain('fix, or lock as accepted debt');
  });

  it('names fresh findings as outside the baseline when one is covering', async () => {
    adopted();
    write('src/random/x.ts', 'export const x = 1;'); // covered by the baseline below
    write('src/stray/y.ts', 'export const y = 1;'); // fresh — outside it

    write(
      '.blueprint-baseline.json',
      JSON.stringify({
        version: 2,
        findings: [
          {
            rule: 'undeclared-folder',
            path: 'src/random',
            subject: '',
            message:
              '"random" is not a declared layer — declare it, '
              + 'or move its code into a module of an existing layer.',
          },
        ],
      }),
    );

    const { ok, checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const check = checks.find((c) => c.label.includes('architecture'));

    expect(ok).toBe(false);
    expect(check?.label).toContain('covered by the baseline');
    expect(check?.detail).toContain('outside the baseline');
  });

  it('counts baselined findings as clean', async () => {
    adopted();
    write('src/random/x.ts', 'export const x = 1;'); // undeclared folder → 1 finding

    // Record that finding as accepted debt — doctor should now read clean.
    write(
      '.blueprint-baseline.json',
      JSON.stringify({
        version: 2,
        findings: [
          {
            rule: 'undeclared-folder',
            path: 'src/random',
            subject: '',
            message:
              '"random" is not a declared layer — declare it, '
              + 'or move its code into a module of an existing layer.',
          },
        ],
      }),
    );

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const check = checks.find((c) => c.label.includes('architecture'));

    expect(check?.ok).toBe(true);
    // Only NOW may the label claim coverage — the ledger is doing work.
    expect(check?.label).toContain('covered by the baseline');
  });

  it('flags a marker-bearing contract outside the emitted set (field issues #2/#3)', async () => {
    adopted();

    // vuePreset default emits claude + agents — a GEMINI.md with our marker
    // block is a contract nothing declares anymore. Init only instructs when
    // the file carries hand-written content; doctor must not stay green.
    write('GEMINI.md', '# team doc\n\n<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n');

    let { checks } = await runDoctor(root, { loadConfig: load, log: silent });
    let check = checks.find((c) => c.label.includes('stale contract'));

    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('GEMINI.md');
    expect(check?.detail).toContain('not among the emitted targets');

    // An own-strategy rules file is wholly generated by construction.
    fs.rmSync(path.join(root, 'GEMINI.md'));
    write('.cursor/rules/blueprint.mdc', '---\nrules\n---');

    ({ checks } = await runDoctor(root, { loadConfig: load, log: silent }));
    check = checks.find((c) => c.label.includes('stale contract'));

    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('.cursor/rules/blueprint.mdc');

    // A marker-free file at a default path is the user's own — never ours.
    fs.rmSync(path.join(root, '.cursor'), { recursive: true });
    write('GEMINI.md', '# hand-written, no marker\n');

    ({ checks } = await runDoctor(root, { loadConfig: load, log: silent }));

    expect(checks.find((c) => c.label.includes('stale contract'))?.ok).toBe(true);
  });

  it('names several stale contracts in a stable order', async () => {
    // The target catalog is ordered by how common each agent is, not
    // alphabetically — GEMINI.md is declared before the copilot path. Reporting
    // in catalog order makes the detail (and the JSON) reshuffle whenever the
    // catalog gains a target, so a doctor run diffs against itself for a reason
    // that has nothing to do with the repo.
    adopted();
    const marked = '# doc\n\n<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n';

    write('GEMINI.md', marked);
    write('.github/copilot-instructions.md', marked);

    const { checks } = await runDoctor(root, { loadConfig: load, log: silent });
    const detail = checks.find((c) => c.label.includes('stale contract'))?.detail;

    expect(detail?.startsWith('.github/copilot-instructions.md, GEMINI.md:')).toBe(true);
  });

  it('passes the suppressions check when the ledger is absent, current, '
    + 'or fails when stale', async () => {
    adopted();

    // Absent: not in use — fine.
    let result = await runDoctor(root, { loadConfig: load, log: silent });

    expect(result.checks.find((c) => c.label.includes('suppressions'))?.ok).toBe(true);

    // Current: every suppressed file still exists.
    write('src/components/Big.vue', 'x');

    write('eslint-suppressions.json', JSON.stringify({
      'src/components/Big.vue': { 'max-lines': { count: 1 } },
    }));

    result = await runDoctor(root, { loadConfig: load, log: silent });

    const current = result.checks.find((c) => c.label.includes('suppressions'));

    expect(current?.ok).toBe(true);
    // A ledger with real entries is doing its job — there is nothing to say
    // about it. Calling it ceremony here tells the reader to delete a file that
    // is holding the repo's whole lint debt.
    expect(current?.detail).toBeUndefined();

    // Stale: a suppressed file is gone.
    write('eslint-suppressions.json', JSON.stringify({
      'src/components/Gone.vue': { 'max-lines': { count: 1 } },
    }));

    result = await runDoctor(root, { loadConfig: load, log: silent });

    const check = result.checks.find((c) => c.label.includes('suppressions'));

    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('prune-suppressions');

    // Unreadable: not JSON.
    write('eslint-suppressions.json', 'not json');
    result = await runDoctor(root, { loadConfig: load, log: silent });

    const unreadable = result.checks.find((c) => c.label.includes('suppressions'));

    // Green on an unparseable ledger is the worst of the three: eslint cannot
    // read it either, so nothing is actually suppressed and doctor says the
    // suppressions are fine.
    expect(unreadable?.ok).toBe(false);
    expect(unreadable?.detail).toContain('not valid JSON');

    // Empty: --suppress-all ran on a clean lint (first live field run) —
    // green, but the detail names the ceremony and the fix.
    write('eslint-suppressions.json', '{}');
    result = await runDoctor(root, { loadConfig: load, log: silent });

    const empty = result.checks.find((c) => c.label.includes('suppressions'));

    expect(empty?.ok).toBe(true);
    expect(empty?.detail).toContain('ceremony');
    expect(empty?.detail).toContain('delete it');
  });

  it('tells the wiring check WHICH config it is about to read', async () => {
    // `merged` is doctor's answer, not the check's, and nothing asserted it here: the
    // mutation `merged: true` — every repo's config called merged — survived the whole
    // suite, which is the #148 fix left unguarded one layer up.
    adopted();

    let wired = '';

    await runDoctor(root, { loadConfig: load, log: (m) => (wired = m) });

    // A hand-maintained config that imports the package: a merge really happened.
    expect(wired).toContain('survive the merged eslint config');

    // Init's own generated file, identified by the banner it writes: nothing was merged
    // into it, and that is the word an adopter checked against its own repo.
    write('eslint.config.mjs', `${GENERATED_ESLINT_BANNER}\nexport default [];`);

    let generated = '';

    await runDoctor(root, { loadConfig: load, log: (m) => (generated = m) });

    expect(generated).toContain('survive the generated eslint config');
    expect(generated).not.toContain('merged eslint config');
  });
});
