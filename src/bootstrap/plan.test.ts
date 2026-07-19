import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { vuePreset } from '../presets';
import type { Action, ProjectState } from './types';

function state(over: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/x',
    framework: 'vue',
    packageManager: 'npm',
    projectName: 'app',
    hasConfig: false,
    hasEslintConfig: false,
    claudeMd: null,
    existingSrcDirs: [],
    missingDeps: ['eslint', '@kekkai/blueprint'],
    ...over,
  };
}

const bp = vuePreset();

const write = (actions: Action[], path: string) =>
  actions.find((action) => action.kind === 'write' && action.path === path);

describe('plan', () => {
  it('writes config, scaffolds every layer, emits artifacts, and installs', () => {
    const actions = plan(state(), bp, 'CONFIG SOURCE', {});

    expect(write(actions, 'blueprint.config.mjs')).toMatchObject({ content: 'CONFIG SOURCE' });
    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(6);
    expect(write(actions, 'docs/architecture-handbook.md')).toBeDefined();
    expect(write(actions, 'CLAUDE.md')).toBeDefined();
    expect(write(actions, 'eslint.config.mjs')).toBeDefined();

    expect(
      actions.find((a) => a.kind === 'install'),
    ).toMatchObject({ command: 'npm install -D eslint @kekkai/blueprint' });

    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('~app'))).toBe(true);
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

  it('refreshes an existing CLAUDE.md marker block in place', () => {
    const existing = 'top\n<!-- BLUEPRINT:START -->\nSTALE_CONTRACT\n<!-- BLUEPRINT:END -->\nbottom';
    const claude = write(plan(state({ claudeMd: existing }), bp, null, {}), 'CLAUDE.md');

    expect(claude?.content).toContain('top');
    expect(claude?.content).toContain('bottom');
    expect(claude?.content).not.toContain('STALE_CONTRACT');
    expect(claude?.content).toContain('## Architecture contract');
  });

  it('appends a marker block to a CLAUDE.md without one', () => {
    const claude = write(plan(state({ claudeMd: '# My project' }), bp, null, {}), 'CLAUDE.md');

    expect(claude?.content.startsWith('# My project')).toBe(true);
    expect(claude?.content).toContain('<!-- BLUEPRINT:START -->');
  });

  it('honors emit path overrides', () => {
    const custom = { ...bp, emit: { handbook: 'HB.md', claudeMd: 'AGENTS.md' } };
    const actions = plan(state(), custom, null, {});

    expect(write(actions, 'HB.md')).toBeDefined();
    expect(write(actions, 'AGENTS.md')).toBeDefined();
  });

  it('uses the package manager add syntax for pnpm/yarn', () => {
    const pnpm = plan(state({ packageManager: 'pnpm' }), bp, null, {}).find((a) => a.kind === 'install');

    expect(pnpm).toMatchObject({ command: 'pnpm add -D eslint @kekkai/blueprint' });
  });
});
