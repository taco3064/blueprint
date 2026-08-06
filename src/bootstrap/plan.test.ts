import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { reactPreset, vuePreset } from '../presets';
import type { Blueprint } from '../config';
import type { Action } from './types';
import { SUPPORTED_ESLINT_MAJORS } from '../project';
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
    ...over,
  };
}

const bp = vuePreset();

type WriteAction = Extract<Action, { kind: 'write' }>;

const write = (actions: Action[], path: string): WriteAction | undefined =>
  actions.find(
    (action): action is WriteAction => action.kind === 'write' && action.path === path,
  );

describe('plan', () => {
  it('puts every filesystem effect above the install, on every path', () => {
    // The install is the only action here that can hang for minutes or fail on a
    // network the adopter does not have, and the alias writes used to sit below it.
    // #37 stopped the output CLAIMING them; the state stayed half-done, and a codex
    // run aborted a registry-less install and was left with a config, a contract and
    // an eslint config but no alias in tsconfig or vite — `~app resolves nowhere`,
    // two toolchain files hand-edited (field run #131). Asserting the boundary rather
    // than the alias's position: any future effect added below the install strands the
    // same way, whatever it writes.
    const cases = [
      ['fresh scaffold', plan(state(), bp, 'CONFIG SOURCE', {})],
      ['existing config', plan(state(), bp, null, {})],
      ['no install', plan(state(), bp, 'CONFIG SOURCE', { install: false })],
    ] as const;

    for (const [name, actions] of cases) {
      const effects = actions
        .map((action, index) => ({ index, kind: action.kind }))
        .filter((entry) => entry.kind !== 'instruct' && entry.kind !== 'install');

      const install = actions.findIndex((action) => action.kind === 'install');

      expect(effects.length, name).toBeGreaterThan(0);

      if (install !== -1) {
        expect(Math.max(...effects.map((entry) => entry.index)), name).toBeLessThan(install);
      }
    }
  });

  it('writes config, scaffolds every layer, emits artifacts, and installs', () => {
    const actions = plan(state(), bp, 'CONFIG SOURCE', {});

    expect(write(actions, 'blueprint.config.mjs')).toMatchObject({ content: 'CONFIG SOURCE' });
    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(6);
    expect(write(actions, 'docs/architecture-handbook.md')).toBeDefined();
    expect(write(actions, 'CLAUDE.md')).toBeDefined();
    expect(write(actions, 'AGENTS.md')).toBeDefined();
    expect(write(actions, 'eslint.config.mjs')).toBeDefined();

    expect(
      actions.find((a) => a.kind === 'install'),
    ).toMatchObject({ command: 'npm install -D eslint @kekkai/blueprint' });

    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('~app'))).toBe(true);
    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('install knip'))).toBe(true);
    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('stylelint'))).toBe(true);
  });

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
      'import imports from \'eslint-plugin-import-x\';\nimport blueprint from \'./blueprint.config.mjs\';',
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

  it('omits the config write when configSource is null', () => {
    expect(write(plan(state({ hasConfig: true }), bp, null, {}), 'blueprint.config.mjs')).toBeUndefined();
  });

  it('provisions the anti-bypass plugin on every path — ADOPT is the paved road (field #9)', () => {
    const missing = ['eslint', '@kekkai/blueprint', '@eslint-community/eslint-plugin-eslint-comments'];

    // The guard defaults to ADOPT; an agent following the bold default on
    // the merge path must not hit "Cannot find package".
    for (const over of [{}, { hasEslintConfig: true }]) {
      const actions = plan(state({ missingDeps: missing, ...over }), bp, 'SRC', {});
      const install = actions.find((a) => a.kind === 'install');

      expect(install?.kind === 'install' && install.command).toContain('eslint-comments');
    }
  });

  it('scaffolds no empty layer dirs when the tree already holds code (batch 11)', () => {
    // Root-only starter taking the early exit: .gitkeep shells would be the
    // physical twin of the manufactured net the playbook forbids.
    const actions = plan(state(), bp, 'CONFIG SOURCE', { hasSourceFiles: true });

    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(0);
    expect(write(actions, 'blueprint.config.mjs')).toBeDefined(); // the rest of the plan is intact
  });

  it('removes a stale wholly-generated contract when emit.agents narrows (batch 10)', () => {
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };
    const stale = '<!-- BLUEPRINT:START -->\nold contract\n<!-- BLUEPRINT:END -->\n';

    const actions = plan(state(), narrowed, null, {
      existingAgentFiles: { 'AGENTS.md': stale, 'CLAUDE.md': stale },
    });

    // CLAUDE.md is still emitted — refreshed, never flagged stale.
    expect(write(actions, 'CLAUDE.md')).toBeDefined();

    expect(actions).toContainEqual({
      kind: 'rm',
      path: 'AGENTS.md',
      note: 'AGENTS.md (stale agent contract — no longer in emit.agents)',
    });
  });

  it('only tells about a stale contract wrapped in hand-written content', () => {
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };
    const edited = '# Our agents doc\n\n<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n';

    const actions = plan(state(), narrowed, null, {
      existingAgentFiles: { 'AGENTS.md': edited },
    });

    expect(actions.some((a) => a.kind === 'rm')).toBe(false);

    expect(actions.some(
      (a) => a.kind === 'instruct' && a.note.includes('AGENTS.md is no longer among the emitted agent contracts'),
    )).toBe(true);
  });

  it('names the true cause of the narrowing — flag, config, or default set', () => {
    const stale = '<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n';

    // --agent narrowed it: the note must not blame a config field that is
    // not there, and must say how to make the narrowing permanent — or the
    // next plain init regrows the file and the agent reads a flip-flop.
    const viaFlag = plan(state(), bp, null, {
      agentTarget: 'claude',
      existingAgentFiles: { 'AGENTS.md': stale },
    }).find((a) => a.kind === 'rm');

    expect(viaFlag?.note).toContain('narrowed by --agent');
    expect(viaFlag?.note).toContain('declare emit.agents in blueprint.config.mjs');

    // Config silent, no flag: a stale non-default contract (an old GEMINI.md)
    // is simply not among the default set.
    const viaDefault = plan(state(), bp, null, {
      existingAgentFiles: { 'GEMINI.md': stale },
    }).find((a) => a.kind === 'rm');

    expect(viaDefault?.note).toContain('not among the emitted targets');
  });

  it('never removes a file with content after the first marker block', () => {
    // Trailing hand-written notes (or a second block) mean the file is not
    // wholly generated — deleting it would eat user content.
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };

    const trailing
      = '<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n\nMy own notes.\n';

    const actions = plan(state(), narrowed, null, {
      existingAgentFiles: { 'AGENTS.md': trailing },
    });

    expect(actions.some((a) => a.kind === 'rm')).toBe(false);

    expect(actions.some(
      (a) => a.kind === 'instruct' && a.note.includes('AGENTS.md is no longer among the emitted agent contracts'),
    )).toBe(true);
  });

  it('never touches a marker-free file or one outside the default paths', () => {
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };

    const actions = plan(state(), narrowed, null, {
      existingAgentFiles: {
        'AGENTS.md': '# Hand-written, never init\'s\n', // no marker — not ours
        'docs/AGENTS.md': '<!-- BLUEPRINT:START -->\nx\n<!-- BLUEPRINT:END -->', // custom path — managed by hand
      },
    });

    expect(actions.some((a) => a.kind === 'rm')).toBe(false);

    expect(actions.some(
      (a) => a.kind === 'instruct' && a.note.includes('no longer in emit.agents'),
    )).toBe(false);
  });

  it('removes a stale own-strategy rules file by construction', () => {
    // .cursor/rules/blueprint.mdc has no merge markers — the whole file is
    // generated, so its presence outside emit.agents is stale by definition.
    const actions = plan(state(), { ...bp, emit: { agents: ['claude' as const] } }, null, {
      existingAgentFiles: { '.cursor/rules/blueprint.mdc': '---\nfrontmatter\n---\n\ncontract' },
    });

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'rm',
      path: '.cursor/rules/blueprint.mdc',
    }));
  });

  it('skips layer dirs that already exist', () => {
    const actions = plan(state({ existingSrcDirs: ['pages', 'services'] }), bp, null, {});

    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(4);
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
    const actions = plan(state({ hasEslintConfig: true, eslintConfigShape: 'tseslint' }), bp, null, {});
    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('tseslint.config()'));

    expect(note?.note).toContain('export default tseslint.config(');
    // A tseslint.config() shape IS a TS project — the TS plugin rides along
    // even when the dep scan did not see `typescript`.
    expect(note?.note).toContain('emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports })');
    expect(note?.note).toContain('DELETE the reference');
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

  it('surfaces the install command as an instruct under --no-install', () => {
    const actions = plan(state(), bp, null, { install: false });

    expect(actions.some((a) => a.kind === 'install')).toBe(false);

    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('Install skipped'));

    expect(note?.note).toContain('npm install -D eslint @kekkai/blueprint');

    // Nothing missing → neither an install action nor the instruct.
    const clean = plan(state({ missingDeps: [] }), bp, null, {});

    expect(clean.some((a) => a.kind === 'install')).toBe(false);
    expect(clean.some((a) => a.kind === 'instruct' && a.note.includes('Install skipped'))).toBe(false);
  });

  it('says the eslint it installs is unpinned, and which majors are tested', () => {
    // `eslint` goes in unpinned, so npm resolves the newest supported major — newer
    // than this package's own devDependency. A field agent watched ESLint 10 arrive
    // from a tool developed on 9 and could only report "worked today" (#100): the
    // support range is a decision in the source that never reached any output.
    const install = plan(state(), bp, null, {}).find((a) => a.kind === 'install');

    expect(install?.kind === 'install' && install.note).toContain('eslint unpinned');

    for (const major of SUPPORTED_ESLINT_MAJORS) {
      expect(install?.kind === 'install' && install.note).toContain(String(major));
    }

    // A repo that already has eslint gets the plain list — the sentence explains a
    // resolution about to happen, so with nothing to resolve it is noise.
    const partial = plan(state({ missingDeps: ['@kekkai/blueprint'] }), bp, null, {})
      .find((a) => a.kind === 'install');

    expect(partial?.kind === 'install' && partial.note).toBe('@kekkai/blueprint');
  });

  it('refreshes an existing marker block in place, per agent file', () => {
    const existing = 'top\n<!-- BLUEPRINT:START -->\nSTALE_CONTRACT\n<!-- BLUEPRINT:END -->\nbottom';

    const actions = plan(state(), bp, null, {
      existingAgentFiles: { 'CLAUDE.md': existing, 'AGENTS.md': null },
    });

    const claude = write(actions, 'CLAUDE.md');

    expect(claude?.content).toContain('top');
    expect(claude?.content).toContain('bottom');
    expect(claude?.content).not.toContain('STALE_CONTRACT');
    expect(claude?.content).toContain('## Architecture contract');
    expect(write(actions, 'AGENTS.md')?.content.startsWith('<!-- BLUEPRINT:START -->')).toBe(true);
  });

  it('writes a reference next to a hand-written context file instead of appending', () => {
    const actions = plan(state(), bp, null, { existingAgentFiles: { 'AGENTS.md': '# My project' } });

    // The hand-written file is not written at all; the reference carries the block.
    expect(write(actions, 'AGENTS.md')).toBeUndefined();

    const reference = write(actions, 'AGENTS.blueprint.md')?.content;

    expect(reference).toContain('## Architecture contract');
    // The reference ships WITH its markers: pasted verbatim it stays
    // refreshable, and the header's marker talk points at something the
    // reader can actually see (field issue #26).
    expect(reference?.startsWith('<!-- BLUEPRINT:START -->')).toBe(true);
    expect(reference?.trimEnd().endsWith('<!-- BLUEPRINT:END -->')).toBe(true);

    const note = actions.find(
      (action): action is Extract<Action, { kind: 'instruct' }> =>
        action.kind === 'instruct' && action.note.includes('AGENTS.md is hand-written'),
    );

    expect(note?.note).toContain('KEEP the');
    expect(note?.note).toContain('marker comments');
  });

  it('narrows the default targets to the tool in use via agentTarget', () => {
    const actions = plan(state(), bp, null, { agentTarget: 'claude' });

    expect(write(actions, 'CLAUDE.md')).toBeDefined();
    expect(write(actions, 'AGENTS.md')).toBeUndefined();
  });

  it('honors emit path overrides, merging against the overridden path', () => {
    const existing = 'intro\n<!-- BLUEPRINT:START -->\nSTALE_CONTRACT\n<!-- BLUEPRINT:END -->';

    const custom = {
      ...bp,
      emit: { handbook: 'HB.md', agents: [{ target: 'claude' as const, path: 'docs/CLAUDE.md' }] },
    };

    const actions = plan(state(), custom, null, {
      existingAgentFiles: { 'docs/CLAUDE.md': existing },
    });

    expect(write(actions, 'HB.md')).toBeDefined();
    expect(write(actions, 'CLAUDE.md')).toBeUndefined();

    const claude = write(actions, 'docs/CLAUDE.md');

    expect(claude?.content).toContain('intro');
    expect(claude?.content).not.toContain('STALE_CONTRACT');
  });

  it('overwrites own-strategy rule files without marker merging', () => {
    const custom = { ...bp, emit: { agents: ['cursor' as const] } };

    const actions = plan(state(), custom, null, {
      existingAgentFiles: { '.cursor/rules/blueprint.mdc': 'anything' },
    });

    const cursor = write(actions, '.cursor/rules/blueprint.mdc');

    expect(cursor?.content.startsWith('---\n')).toBe(true);
    expect(cursor?.content).not.toContain('<!-- BLUEPRINT:START -->');
  });

  it('uses the package manager add syntax for pnpm/yarn', () => {
    const pnpm = plan(state({ packageManager: 'pnpm' }), bp, null, {}).find((a) => a.kind === 'install');

    expect(pnpm).toMatchObject({ command: 'pnpm add -D eslint @kekkai/blueprint' });
  });
});

describe('plan · wired eslint config', () => {
  it('emits no reference when the hand-made config already imports the package', () => {
    const actions = plan(
      state({ hasEslintConfig: true, wiredEslintConfig: true }),
      bp,
      null,
      {},
    );

    expect(write(actions, 'eslint.config.blueprint.mjs')).toBeUndefined();
    expect(write(actions, 'eslint.config.mjs')).toBeUndefined();

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('already wires'),
    )).toBe(true);
  });
});

describe('plan · integrated hand-written context file', () => {
  it('leaves an already-integrated hand-written file alone — no reference, no nag', () => {
    const actions = plan(state(), bp, null, {
      existingAgentFiles: {
        'AGENTS.md': '# My project\n\nContract: see node_modules/@kekkai/blueprint/agent-contract.md',
      },
    });

    expect(write(actions, 'AGENTS.md')).toBeUndefined();
    expect(write(actions, 'AGENTS.blueprint.md')).toBeUndefined();

    // "Left as is" names its price: a marker-less integration is frozen —
    // init can never refresh it after config changes (field issue #26).
    const note = actions.find(
      (action): action is Extract<Action, { kind: 'instruct' }> =>
        action.kind === 'instruct' && action.note.includes('already integrates'),
    );

    expect(note?.note).toContain('never refresh');
    expect(note?.note).toContain('<!-- BLUEPRINT:START -->');
  });
});

describe('plan · what licenses a greenfield edit', () => {
  const withVite = {
    hasViteConfig: true,
    viteConfig: {
      file: 'vite.config.ts',
      text: 'export default defineConfig({\n  plugins: [],\n})\n',
    },
  };

  it('edits vite.config only when init wrote the blueprint config itself', () => {
    // The surgery is licensed by init OWNING that setup moment. With a config
    // already in the repo, the vite file is the user's — instruct, never edit.
    expect(write(plan(state(withVite), bp, 'source', {}), 'vite.config.ts')).toBeDefined();
    expect(write(plan(state(withVite), bp, null, {}), 'vite.config.ts')).toBeUndefined();
  });

  it('closes the marker block directly after the contract body', () => {
    // The emitted contract ends with a newline. Left on, the block gains a blank
    // line before its END marker, and every re-init diffs that line back and
    // forth depending on which end got trimmed.
    const content = write(plan(state(), bp, 'source', {}), 'CLAUDE.md')?.content ?? '';

    expect(content).toMatch(/\S\n<!-- BLUEPRINT:END -->/);
  });
});

describe('plan · every action is labelled so the reader can locate it', () => {
  // `note` is the line init prints to say what it just did. The long instruct
  // notes were asserted; the short ones on write / mkdir / rm never were, so
  // each could go empty — and the plan then prints a run of blank rows above a
  // set of writes the reader cannot attribute to any file.
  //
  // Asserted as an invariant rather than a list of expected strings: a new
  // action inherits the requirement instead of slipping past a fixture that
  // predates it.
  const scenarios: [string, Partial<ProjectState>, string | null][] = [
    ['greenfield, nothing installed', {}, 'export default {};'],
    ['an existing config and a wired eslint', { hasConfig: true, wiredEslintConfig: true }, null],
    [
      'a hand-written flat config to merge into',
      { hasConfig: true, hasEslintConfig: true, eslintConfigFile: 'eslint.config.mjs', eslintConfigShape: 'flat-array' },
      null,
    ],
    ['a legacy eslintrc', { hasConfig: true, legacyEslintConfig: '.eslintrc.cjs', eslintConfigShape: 'legacy' }, null],
    ['a TypeScript project with vite', { hasTypescript: true, hasViteConfig: true }, 'export default {};'],
  ];

  it.each(scenarios)('%s', (_label, over, configSource) => {
    const actions = plan(state(over), bp, configSource, {});

    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.note.trim(), `a ${action.kind} action carries a blank note`).not.toBe('');

      // A file-touching action has to name the file it touched. Anything else
      // leaves the reader matching rows against a filesystem by hand.
      if (action.kind === 'write' || action.kind === 'mkdir' || action.kind === 'rm') {
        expect(action.note, `${action.kind} ${action.path} does not name its own path`)
          .toContain(action.path);
      }
    }
  });
});

describe('plan · the reference beside a hand-written contract', () => {
  // The whole point of this branch is to leave the author's document alone and
  // put the generated block in a file NEXT to it. That only holds if the
  // reference path differs from the original — and `emit.agents` accepts any
  // path, so the extension is not guaranteed to be `.md`.
  const handWritten = (contractPath: string) => {
    const bp: Blueprint = {
      ...vuePreset(),
      emit: { agents: [{ target: 'claude', path: contractPath }] },
    };

    return plan(state({ hasConfig: true }), bp, null, {
      existingAgentFiles: { [contractPath]: '# notes I maintain by hand\n' },
    });
  };

  it.each([
    ['ctx.md', 'ctx.blueprint.md'],
    // A Cursor rules folder, and a docs site — both ordinary places to point a
    // contract at, and neither ends in `.md`.
    ['.cursor/rules/context.mdc', '.cursor/rules/context.blueprint.mdc'],
    ['docs/context.mdx', 'docs/context.blueprint.mdx'],
    // No extension at all: the suffix still has to go somewhere.
    ['CONTEXT', 'CONTEXT.blueprint'],
  ])('writes the reference for %s to %s', (contractPath, expected) => {
    const actions = handWritten(contractPath);
    const written = actions.filter((action) => action.kind === 'write').map((a) => a.path);

    expect(written).toContain(expected);

    // The load-bearing half: the hand-written file is NOT among the writes.
    // A reference path that collapses onto the original turns "leave it alone,
    // put a copy beside it" into "overwrite it", and the author's document is
    // gone with no warning — the plan even announces it as a reference.
    expect(written).not.toContain(contractPath);
  });

  it('names the reference in both the write note and the integrate instruct', () => {
    const actions = handWritten('.cursor/rules/context.mdc');
    const write = actions.find((a) => a.kind === 'write' && a.path.includes('blueprint.mdc'));
    const instruct = actions.find((a) => a.kind === 'instruct' && a.note.includes('hand-written'));

    // Both messages carry the derived name, so a reader who only sees one of
    // them can still find the file — and neither can drift from the path above.
    expect(write?.note).toContain('.cursor/rules/context.blueprint.mdc');
    expect(instruct?.note).toContain('.cursor/rules/context.blueprint.mdc');
    expect(instruct?.note).toContain('.cursor/rules/context.mdc');
  });
});
