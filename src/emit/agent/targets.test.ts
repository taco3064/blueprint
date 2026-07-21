import { describe, expect, it } from 'vitest';

import { defaultAgentPaths, emitAgentFiles } from './targets';
import { emitAgentContract } from './agent';
import { vuePreset } from '../../presets';
import type { Blueprint, EmitDef } from '../../config';

const bp = (agents?: EmitDef['agents']): Blueprint => ({
  ...vuePreset({ name: 'Demo' }),
  emit: agents === undefined ? undefined : { agents },
});

describe('emitAgentFiles', () => {
  it('defaults to claude + agents, both merge, carrying the compact block', () => {
    const files = emitAgentFiles(bp());

    expect(files.map((file) => [file.target, file.path, file.strategy])).toEqual([
      ['claude', 'CLAUDE.md', 'merge'],
      ['agents', 'AGENTS.md', 'merge'],
    ]);

    // Shared context files are documents people maintain — they get the
    // compact pointer block, not the full contract dump.
    const compact = emitAgentContract(bp(), { compact: true });

    for (const file of files) expect(file.content).toBe(compact);

    expect(compact).toContain('docs/architecture-handbook.md');
    expect(compact).toContain('node_modules/@kekkai/blueprint/agent-contract.md');
    expect(compact).not.toContain('### Where code goes');
  });

  it('narrows the default targets when the tool in use is known', () => {
    const files = emitAgentFiles(bp(), ['claude']);

    expect(files.map((file) => file.path)).toEqual(['CLAUDE.md']);

    // An explicit emit.agents in the config still wins over the narrowing.
    const explicit = emitAgentFiles(bp(['agents']), ['claude']);

    expect(explicit.map((file) => file.path)).toEqual(['AGENTS.md']);
  });

  it('emits nothing for an explicit empty list', () => {
    expect(emitAgentFiles(bp([]))).toEqual([]);
  });

  it('maps every target to its tool file', () => {
    const files = emitAgentFiles(bp(['claude', 'agents', 'gemini', 'copilot', 'cursor', 'windsurf']));

    expect(files.map((file) => file.path)).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
      '.github/copilot-instructions.md',
      '.cursor/rules/blueprint.mdc',
      '.windsurf/rules/blueprint.md',
    ]);

    expect(files.map((file) => file.strategy)).toEqual([
      'merge', 'merge', 'merge', 'merge', 'own', 'own',
    ]);
  });

  it('exposes every default path for stale-contract cleanup', () => {
    // init scans these locations for contracts a previous run emitted that
    // the current emit.agents no longer names.
    expect(defaultAgentPaths().map(({ target, path }) => [target, path])).toEqual([
      ['claude', 'CLAUDE.md'],
      ['agents', 'AGENTS.md'],
      ['gemini', 'GEMINI.md'],
      ['copilot', '.github/copilot-instructions.md'],
      ['cursor', '.cursor/rules/blueprint.mdc'],
      ['windsurf', '.windsurf/rules/blueprint.md'],
    ]);
  });

  it('wraps the cursor rule in MDC frontmatter with the project name', () => {
    const [cursor] = emitAgentFiles(bp(['cursor']));

    expect(cursor.content).toMatch(/^---\ndescription: "Demo architecture contract"\nalwaysApply: true\n---\n\n/);
    expect(cursor.content).toContain('## Architecture contract');
  });

  it('escapes quotes in the name and falls back to "Project" without one', () => {
    const quoted = { ...vuePreset({ name: 'My "X"' }), emit: { agents: ['cursor' as const] } };

    expect(emitAgentFiles(quoted)[0].content).toContain('description: "My \\"X\\" architecture contract"');

    const unnamed: Blueprint = { ...vuePreset(), name: undefined, emit: { agents: ['cursor'] } };

    expect(emitAgentFiles(unnamed)[0].content).toContain('description: "Project architecture contract"');
  });

  it('wraps the windsurf rule with an always-on trigger', () => {
    const [windsurf] = emitAgentFiles(bp(['windsurf']));

    expect(windsurf.content).toMatch(/^---\ntrigger: always_on\n---\n\n/);
  });

  it('honors a per-target path override', () => {
    const files = emitAgentFiles(bp([{ target: 'claude', path: 'docs/CLAUDE.md' }, 'agents']));

    expect(files.map((file) => file.path)).toEqual(['docs/CLAUDE.md', 'AGENTS.md']);
  });
});
