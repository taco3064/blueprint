import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { vuePreset } from '../presets';
import type { Blueprint } from '../config';
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

describe('plan · the agent contract files it stops emitting', () => {
  it('removes a stale wholly-generated contract when emit.agents narrows (batch 10)', () => {
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };
    const stale = '<!-- BLUEPRINT:START -->\nold contract\n<!-- BLUEPRINT:END -->\n';

    const actions = plan(state(), narrowed, {
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

    const actions = plan(state(), narrowed, {
      existingAgentFiles: { 'AGENTS.md': edited },
    });

    expect(actions.some((a) => a.kind === 'rm')).toBe(false);

    expect(actions.some(
      (a) => a.kind === 'instruct' && a.note.includes(
        'AGENTS.md is no longer among the emitted agent contracts',
      ),
    )).toBe(true);
  });

  it('names the true cause of the narrowing — flag, config, or default set', () => {
    const stale = '<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n';

    // --agent narrowed it: the note must not blame a config field that is
    // not there, and must say how to make the narrowing permanent — or the
    // next plain init regrows the file and the agent reads a flip-flop.
    const viaFlag = plan(state(), bp, {
      agentTarget: 'claude',
      existingAgentFiles: { 'AGENTS.md': stale },
    }).find((a) => a.kind === 'rm');

    expect(viaFlag?.note).toContain('narrowed by --agent');
    expect(viaFlag?.note).toContain('declare emit.agents in blueprint.config.mjs');

    // Config silent, no flag: a stale non-default contract (an old GEMINI.md)
    // is simply not among the default set.
    const viaDefault = plan(state(), bp, {
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

    const actions = plan(state(), narrowed, {
      existingAgentFiles: { 'AGENTS.md': trailing },
    });

    expect(actions.some((a) => a.kind === 'rm')).toBe(false);

    expect(actions.some(
      (a) => a.kind === 'instruct' && a.note.includes(
        'AGENTS.md is no longer among the emitted agent contracts',
      ),
    )).toBe(true);
  });

  it('never touches a marker-free file or one outside the default paths', () => {
    const narrowed = { ...bp, emit: { agents: ['claude' as const] } };

    const actions = plan(state(), narrowed, {
      existingAgentFiles: {
        'AGENTS.md': '# Hand-written, never init\'s\n', // no marker — not ours
        'docs/AGENTS.md': '<!-- BLUEPRINT:START -->\nx\n<!-- BLUEPRINT:END '
          + '-->', // custom path — managed by hand
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
    const actions = plan(state(), { ...bp, emit: { agents: ['claude' as const] } }, {
      existingAgentFiles: { '.cursor/rules/blueprint.mdc': '---\nfrontmatter\n---\n\ncontract' },
    });

    expect(actions).toContainEqual(expect.objectContaining({
      kind: 'rm',
      path: '.cursor/rules/blueprint.mdc',
    }));
  });
});

describe('plan · the agent contract files it writes, and the marker block inside them', () => {
  it('refreshes an existing marker block in place, per agent file', () => {
    const existing = 'top\n<!-- BLUEPRINT:START -->\nSTALE_CONTRACT\n'
      + '<!-- BLUEPRINT:END -->\nbottom';

    const actions = plan(state(), bp, {
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
    const actions = plan(
      state(),
      bp,
      { existingAgentFiles: { 'AGENTS.md': '# My project' } });

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
    const actions = plan(state(), bp, { agentTarget: 'claude' });

    expect(write(actions, 'CLAUDE.md')).toBeDefined();
    expect(write(actions, 'AGENTS.md')).toBeUndefined();
  });

  it('honors emit path overrides, merging against the overridden path', () => {
    const existing = 'intro\n<!-- BLUEPRINT:START -->\nSTALE_CONTRACT\n<!-- BLUEPRINT:END -->';

    const custom = {
      ...bp,
      emit: { handbook: 'HB.md', agents: [{ target: 'claude' as const, path: 'docs/CLAUDE.md' }] },
    };

    const actions = plan(state(), custom, {
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

    const actions = plan(state(), custom, {
      existingAgentFiles: { '.cursor/rules/blueprint.mdc': 'anything' },
    });

    const cursor = write(actions, '.cursor/rules/blueprint.mdc');

    expect(cursor?.content.startsWith('---\n')).toBe(true);
    expect(cursor?.content).not.toContain('<!-- BLUEPRINT:START -->');
  });
});

describe('plan · integrated hand-written context file', () => {
  it('leaves an already-integrated hand-written file alone — no reference, no nag', () => {
    const actions = plan(state(), bp, {
      existingAgentFiles: {
        'AGENTS.md': '# My project\n\nContract: see '
          + 'node_modules/@kekkai/blueprint/agent-contract.md',
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

    return plan(state({ hasConfig: true }), bp, {
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
