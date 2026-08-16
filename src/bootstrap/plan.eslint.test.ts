import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { reactPreset, vuePreset } from '../presets';
import type { Action } from './types';
import type { ProjectState } from '../project';

function state(over: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/x',
    framework: 'vue',
    packageManager: 'npm',
    projectName: 'app',
    hasConfig: false,
    hasEslintConfig: false,
    wiredEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    hasViteConfig: false,
    hasTypescript: false,
    tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': null },
    existingSrcDirs: [],
    missingDeps: ['eslint', '@kekkai/blueprint'],
    dependencies: [],
    ...over,
  };
}

const bp = vuePreset();

type WriteAction = Extract<Action, { kind: 'write' }>;

const write = (actions: Action[], path: string): WriteAction | undefined =>
  actions.find(
    (action): action is WriteAction => action.kind === 'write' && action.path === path,
  );

describe('plan · the eslint config it writes, and how it says to wire one\'s already there', () => {
  it('generates the third-party CORE in eslint.config.mjs, tier-driven', () => {
    const content = write(plan(state(), bp, null, {}), 'eslint.config.mjs')?.content;

    // eslint-plugin-import-x IS wired now (importBlock rides it), but only for
    // import-x/first + import-x/no-duplicates. Two of its rules stay rejected on
    // their own merits, and shipping the plugin must not smuggle them in:
    // cycles are inspect's job — import/no-cycle re-checks the whole graph
    // per file (measured 92s on an 850-file repo) …
    expect(content).toContain('eslint-plugin-import-x');
    expect(content).not.toContain('import/no-cycle');
    // … and deadCode emits no ESLint line — flat config cannot run
    // no-unused-modules at all.
    expect(content).not.toContain('import/no-unused-modules');
    expect(content).toContain('no-unlimited-disable\': \'error\'');
    expect(content).toContain('require-description');

    // The comments block is the anti-bypass guard, not emitLint's output —
    // an agent reading the reference must see both the boundary and the
    // default (adopt; dropping is the justified exception) stated in place.
    expect(content).toContain('anti-bypass guard — NOT part of emitLint');
    expect(content).toContain('Default: ADOPT');
    expect(content).toContain('dropping is the exception');
    // Merge-order doubt closed in place: the sets never intersect (field #30).
    expect(content).toContain('position relative to the');
  });

  it('scopes the guard glob to the detected stack, like the parser blocks (field #30)', () => {
    const config = (blueprint = bp, over = {}) =>
      write(plan(state(over), blueprint, null, {}), 'eslint.config.mjs')?.content ?? '';

    // vue stack: no jsx/tsx exts, the Vue-template scope caveat applies.
    const vueGuard = config();

    expect(vueGuard).toContain('files: [\'src/**/*.{js,ts,vue}\']');
    expect(vueGuard).toContain('Vue template');

    // react stack: `.vue` gone — four field agents used to trim it by hand —
    // and the Vue-template caveat goes with it.
    const reactGuard = config(reactPreset(), { framework: 'react' });

    expect(reactGuard).toContain('files: [\'src/**/*.{js,jsx,ts,tsx}\']');
    expect(reactGuard).not.toContain('Vue template');

    // Unknown stack keeps the full set — narrowing on a guess loses coverage.
    const unknown = config({ ...bp, framework: 'auto' as const }, { framework: null });

    expect(unknown).toContain('files: [\'src/**/*.{js,jsx,ts,tsx,vue}\']');
  });

  it('wires parsers for the detected stack, parsers only', () => {
    const config = (blueprint = bp, over = {}) =>
      write(plan(state(over), blueprint, null, {}), 'eslint.config.mjs')?.content ?? '';

    // vue without typescript: the vue parser alone.
    const vueJs = config();

    expect(vueJs).toContain('import vueParser from \'vue-eslint-parser\';');
    expect(vueJs).toContain('languageOptions: { parser: vueParser },');
    expect(vueJs).not.toContain('tseslint');

    // vue + typescript: ts parser inside the SFC parser.
    const vueTs = config(bp, { hasTypescript: true });

    expect(vueTs).toContain('parserOptions: { parser: tseslint.parser }');
    expect(vueTs).toContain('files: [\'**/*.{ts,tsx,mts,cts}\'],');

    // react + typescript: ts parser plus espree JSX; no vue parser. The jsx
    // block carries its own skip criterion — without one, the TS-parser
    // rule above it read as the only guidance and the js/jsx merge call
    // was a judgment nobody backed (field #21).
    const reactTs = config(reactPreset(), { hasTypescript: true });

    expect(reactTs).toContain('parser: tseslint.parser');
    expect(reactTs).toContain('ecmaFeatures: { jsx: true }');
    expect(reactTs).toContain('dormant');
    expect(reactTs).not.toContain('vueParser');

    // react without typescript: espree JSX only — zero extra packages.
    const reactJs = config(reactPreset());

    expect(reactJs).toContain('ecmaFeatures: { jsx: true }');
    expect(reactJs).not.toContain('tseslint');

    // auto framework falls back to the detected one (null → no parser blocks).
    const bare = config({ ...bp, framework: 'auto' as const }, { framework: null });

    expect(bare).not.toContain('vueParser');
    expect(bare).not.toContain('ecmaFeatures');
  });

  it('closes every conditional slot cleanly when its condition is false', () => {
    const config = (blueprint = bp, over = {}) =>
      write(plan(state(over), blueprint, null, {}), 'eslint.config.mjs')?.content ?? '';

    // Each slot below is a spread over `[]`. Anything landing in one is a bare
    // line in a config the project's lint really loads, and no `not.toContain`
    // of known text can see arbitrary content — the seam can.
    const bare = config({ ...bp, framework: 'auto' as const }, { framework: null });

    // No parser imports: the import block runs straight from import-x into the
    // blueprint config.
    expect(bare).toContain(
      'import imports from \'eslint-plugin-import-x\';\nimport blueprint from '
      + '\'./blueprint.config.mjs\';',
    );

    // No parser blocks: the array opens straight onto the emitLint spread, and
    // the header that explains those blocks stays out along with them.
    expect(bare).toContain('export default [\n  ...emitLint(blueprint, { stylistic, imports }),');

    // vue without typescript: the header appears, its TS-only paragraph does
    // not, so the header runs straight into the first parser block.
    expect(config()).toContain(
      '  // later init treats it as required for the stack and re-installs it.\n  {',
    );

    // react: the guard scopes to js/ts extensions, so the Vue-template caveat
    // above it is absent and the comment block runs into the entry itself.
    expect(config(reactPreset())).toContain(
      '  // emitLint spread does not matter — the rule sets never intersect.\n  {',
    );
  });

  it('fills each conditional slot when its condition holds', () => {
    const config = (blueprint = bp, over = {}) =>
      write(plan(state(over), blueprint, null, {}), 'eslint.config.mjs')?.content ?? '';

    // On a TS stack the parser import and the header's TS-only paragraph both
    // land. The paragraph answers "does my config already wire parsers?" where
    // the merge decision is made — dropped, the question comes back in the field.
    const vueTs = config(bp, { hasTypescript: true });

    expect(vueTs).toContain('import tseslint from \'typescript-eslint\';');
    expect(vueTs).toContain('// "Already wires" includes presets that do it internally');

    // `auto` defers to the DETECTED framework, so a detected vue still gets the
    // vue parser. Taking the literal 'auto' instead wires no parser at all.
    expect(config({ ...bp, framework: 'auto' as const }, { framework: 'vue' }))
      .toContain('vueParser');

    // A root layout has no `src/` to scope the guard to, so the glob starts at
    // the repo root rather than at `./`.
    expect(config({ ...bp, architecture: { ...bp.architecture, sourceRoot: '.' } }))
      .toContain('files: [\'**/*.{');
  });

  it('provisions the anti-bypass plugin on every path — ADOPT is the paved road (field #9)', () => {
    const missing = [
      'eslint',
      '@kekkai/blueprint',
      '@eslint-community/eslint-plugin-eslint-comments',
    ];

    // The guard defaults to ADOPT; an agent following the bold default on
    // the merge path must not hit "Cannot find package".
    for (const over of [{}, { hasEslintConfig: true }]) {
      const actions = plan(state({ missingDeps: missing, ...over }), bp, 'SRC', {});
      const install = actions.find((a) => a.kind === 'install');

      expect(install?.kind === 'install' && install.command).toContain('eslint-comments');
    }
  });

  it('writes a diffable reference config instead of touching an existing one', () => {
    const actions = plan(state({ hasEslintConfig: true }), bp, null, {});

    expect(write(actions, 'eslint.config.mjs')).toBeUndefined();

    // Copy-ready hand-off: the full generated config, clearly marked unwired.
    const reference = write(actions, 'eslint.config.blueprint.mjs');

    expect(reference?.content).toContain('emitLint');
    expect(reference?.note).toContain('not wired in');

    const note = actions.find(
      (a) => a.kind === 'instruct' && a.note.includes('blueprint never edits it'),
    );

    expect(note?.note).toContain('eslint.config.blueprint.mjs');
    // Non-TS repo: stylistic still rides along — two gates depend on it.
    expect(note?.note).toContain('...emitLint(blueprint, { stylistic, imports })');
    expect(note?.note).toContain('import stylistic from \'@stylistic/eslint-plugin\';');
    // Not a TS repo — the TS variant stays a prose hint, not the snippet.
    expect(note?.note).toContain('On a TypeScript');
    // A dropped plugin is silent, so the snippet says so where it is copied.
    expect(note?.note).toContain('emits NOTHING while lint still');
    // The reference is a merge source with an obligation, not a keepsake.
    expect(note?.note).toContain('DELETE the reference');
    // Two channels say LAST about two different entries and a reader holds both:
    // this note means last of the configs the repo already has, the playbook means
    // the combined no-restricted-* entry, which follows the spread. The bare
    // "emitLint goes LAST —" read as last of everything and contradicted it.
    expect(note?.note).toContain('emitLint goes LAST of the configs you already have');
    // Whitespace-insensitive: the sentence wraps differently in the two copies,
    // and a re-wrap is not a regression — losing the clause is.
    expect(note?.note?.replace(/\s+/g, ' ')).toContain('the one thing that goes after the spread');
    expect(note?.note).not.toContain('emitLint goes LAST —');
  });

  it('the flat-array wiring snippet IS the TS version on a TypeScript repo', () => {
    const actions = plan(
      state({ hasEslintConfig: true, eslintConfigShape: 'flat-array', hasTypescript: true }),
      bp,
      null,
      {},
    );

    const note = actions.find(
      (a) => a.kind === 'instruct' && a.note.includes('blueprint never edits it'),
    );

    // The copied line must be the correct one — prose four lines later
    // does not save a copy-the-first-snippet agent (field issue #12).
    expect(note?.note)
      .toContain('...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }) ];');

    expect(note?.note).toContain('import tseslint from \'typescript-eslint\';');
    expect(note?.note).toContain('import stylistic from \'@stylistic/eslint-plugin\';');
    expect(note?.note).not.toContain('On a TypeScript');
  });

  it('tailors the wiring note to a tseslint.config() shape', () => {
    const actions = plan(
      state({ hasEslintConfig: true, eslintConfigShape: 'tseslint' }),
      bp,
      null,
      {},
    );

    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('tseslint.config()'));

    expect(note?.note).toContain('export default tseslint.config(');

    // A tseslint.config() shape IS a TS project — the TS plugin rides along
    // even when the dep scan did not see `typescript`.
    expect(note?.note).toContain(
      'emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports })',
    );

    expect(note?.note).toContain('DELETE the reference');
    // Same LAST disambiguation as the flat-array note, asserted separately because
    // this passage is a hand-copied twin of that one and has drifted from it before
    // — `defineConfig([...])` reached only the other copy.
    expect(note?.note).toContain('emitLint goes LAST of the configs you already have');
    // Whitespace-insensitive: the sentence wraps differently in the two copies,
    // and a re-wrap is not a regression — losing the clause is.
    expect(note?.note?.replace(/\s+/g, ' ')).toContain('the one thing that goes after the spread');
    expect(note?.note).not.toContain('emitLint goes LAST —');
  });

  it('carries the TS7016 caveat exactly when the existing config is a .ts file (field #22)', () => {
    // eslint.config.ts importing ./blueprint.config.mjs has no declaration
    // file — the repo's own tsc gate goes red unless the covering tsconfig
    // allows JS, and the field agent had to invent that fix unprompted.
    const tsConfig = plan(
      state({
        hasEslintConfig: true,
        eslintConfigFile: 'eslint.config.ts',
        eslintConfigShape: 'flat-array',
        hasTypescript: true,
      }),
      bp,
      null,
      {},
    ).find((a) => a.kind === 'instruct' && a.note.includes('blueprint never edits it'));

    expect(tsConfig?.note).toContain('TS7016');
    expect(tsConfig?.note).toContain('allowJs');
    expect(tsConfig?.note).toContain('blueprint.config.d.mts');

    // A .mjs config parses the import natively — no caveat, no noise.
    const mjsConfig = plan(
      state({
        hasEslintConfig: true,
        eslintConfigFile: 'eslint.config.mjs',
        eslintConfigShape: 'flat-array',
      }),
      bp,
      null,
      {},
    ).find((a) => a.kind === 'instruct' && a.note.includes('blueprint never edits it'));

    expect(mjsConfig?.note).not.toContain('TS7016');

    // The tseslint.config() shape reaches the same shared tail.
    const tseslintTs = plan(
      state({
        hasEslintConfig: true,
        eslintConfigFile: 'eslint.config.ts',
        eslintConfigShape: 'tseslint',
        hasTypescript: true,
      }),
      bp,
      null,
      {},
    ).find((a) => a.kind === 'instruct' && a.note.includes('tseslint.config()'));

    expect(tseslintTs?.note).toContain('TS7016');
  });

  it('names defineConfig arrays as spread-equivalent in the flat-array note (field #21)', () => {
    const actions = plan(
      state({ hasEslintConfig: true, eslintConfigShape: 'flat-array' }),
      bp,
      null,
      {},
    );

    const note = actions.find(
      (a) => a.kind === 'instruct' && a.note.includes('blueprint never edits it'),
    );

    expect(note?.note).toContain('defineConfig([...])');
    expect(note?.note).toContain('IS the flat-config array');
  });

  it('routes a legacy .eslintrc to the migration note, not a fresh flat config', () => {
    const actions = plan(
      state({ legacyEslintConfig: '.eslintrc.cjs', eslintConfigShape: 'legacy' }),
      bp,
      null,
      {},
    );

    // A reference is written, but never a fresh eslint.config.mjs next to it.
    expect(write(actions, 'eslint.config.mjs')).toBeUndefined();
    expect(write(actions, 'eslint.config.blueprint.mjs')).toBeDefined();

    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('.eslintrc.cjs'));

    expect(note?.note).toContain('flat-config / ESLint-9 migration');
    expect(note?.note).toContain('inspect --baseline');
  });
});
