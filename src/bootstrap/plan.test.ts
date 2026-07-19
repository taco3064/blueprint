import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { vuePreset } from '../presets';
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
    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('npx knip'))).toBe(true);
    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('stylelint'))).toBe(true);
  });

  it('generates the third-party CORE in eslint.config.mjs, tier-driven', () => {
    const content = write(plan(state(), bp, null, {}), 'eslint.config.mjs')?.content;

    expect(content).toContain('import importPlugin from \'eslint-plugin-import\';');
    expect(content).toContain('\'import/no-cycle\': [\'error\', { maxDepth: Infinity }],');
    expect(content).toContain('\'import/no-unused-modules\': [\'warn\', { unusedExports: true }],');
    expect(content).toContain('no-unlimited-disable\': \'error\'');

    const warned = { ...bp, rules: { cycles: { tier: 'warn' as const } } };
    const warnedContent = write(plan(state(), warned, null, {}), 'eslint.config.mjs')?.content;

    expect(warnedContent).toContain('\'import/no-cycle\': [\'warn\', { maxDepth: Infinity }],');
    expect(warnedContent).not.toContain('import/no-unused-modules');

    const off = { ...bp, rules: { cycles: 'off' as const } };
    const offContent = write(plan(state(), off, null, {}), 'eslint.config.mjs')?.content;

    expect(offContent).not.toContain('import/no-cycle');
    expect(offContent).toContain('require-description');
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

  it('skips layer dirs that already exist', () => {
    const actions = plan(state({ existingSrcDirs: ['pages', 'services'] }), bp, null, {});

    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(4);
  });

  it('instructs instead of writing eslint config when one exists', () => {
    const actions = plan(state({ hasEslintConfig: true }), bp, null, {});

    expect(write(actions, 'eslint.config.mjs')).toBeUndefined();
    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('already exists'))).toBe(true);
  });

  it('omits install when disabled or nothing is missing', () => {
    expect(plan(state(), bp, null, { install: false }).some((a) => a.kind === 'install')).toBe(false);
    expect(plan(state({ missingDeps: [] }), bp, null, {}).some((a) => a.kind === 'install')).toBe(false);
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

  it('appends a marker block to an existing context file without one', () => {
    const actions = plan(state(), bp, null, { existingAgentFiles: { 'AGENTS.md': '# My project' } });
    const agents = write(actions, 'AGENTS.md');

    expect(agents?.content.startsWith('# My project')).toBe(true);
    expect(agents?.content).toContain('<!-- BLUEPRINT:START -->');
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
