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

    // Cycles are inspect's job — import/no-cycle re-checks the whole graph
    // per file (measured 92s on an 850-file repo) and is deliberately absent.
    expect(content).not.toContain('import/no-cycle');
    expect(content).not.toContain('eslint-plugin-import');
    // deadCode emits no ESLint line — flat config cannot run no-unused-modules.
    expect(content).not.toContain('import/no-unused-modules');
    expect(content).toContain('no-unlimited-disable\': \'error\'');
    expect(content).toContain('require-description');

    // The comments block is the anti-bypass guard, not emitLint's output —
    // an agent reading the reference must see both the boundary and the
    // default (adopt; dropping is the justified exception) stated in place.
    expect(content).toContain('anti-bypass guard — NOT part of emitLint');
    expect(content).toContain('Default: ADOPT');
    expect(content).toContain('dropping is the exception');
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

    // react + typescript: ts parser plus espree JSX; no vue parser.
    const reactTs = config(reactPreset(), { hasTypescript: true });

    expect(reactTs).toContain('parser: tseslint.parser');
    expect(reactTs).toContain('ecmaFeatures: { jsx: true }');
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

  it('writes the CI workflow only when emit.ci is github', () => {
    const workflow = write(plan(state(), bp, null, {}), '.github/workflows/blueprint-ci.yml');

    expect(workflow?.content).toContain('npx blueprint inspect');

    const none = { ...bp, emit: { ...bp.emit, ci: 'none' as const } };

    expect(
      write(plan(state(), none, null, {}), '.github/workflows/blueprint-ci.yml'),
    ).toBeUndefined();
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
    expect(note?.note).toContain('...emitLint(blueprint)');
    // The reference is a merge source with an obligation, not a keepsake.
    expect(note?.note).toContain('DELETE the reference');
  });

  it('tailors the wiring note to a tseslint.config() shape', () => {
    const actions = plan(state({ hasEslintConfig: true, eslintConfigShape: 'tseslint' }), bp, null, {});
    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('tseslint.config()'));

    expect(note?.note).toContain('export default tseslint.config(');
    expect(note?.note).toContain('emitLint(blueprint, { typescript: tseslint.plugin })');
    expect(note?.note).toContain('DELETE the reference');
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
    expect(write(actions, 'AGENTS.blueprint.md')?.content).toContain('## Architecture contract');

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('AGENTS.md is hand-written'),
    )).toBe(true);
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

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('already integrates'),
    )).toBe(true);
  });
});
