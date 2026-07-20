import { describe, expect, it } from 'vitest';

import { AGENT_PROMPT, AUTHORING_FILE, authoringActions, authoringBrief, COMMAND_FILE } from './authoring';
import type { SurveyResult } from '../survey';

const survey: SurveyResult = {
  framework: 'react',
  typescript: true,
  packageManager: 'npm',
  aliases: { '@': 'src' },
  rootFiles: ['main.tsx'],
  folders: [
    {
      folder: 'resources',
      files: 100,
      directFiles: 0,
      childFolders: 20,
      indexedChildren: 17,
      maxDepth: 5,
    },
  ],
  edges: [{ from: 'resources', to: 'components', count: 42 }],
  selfAliasImports: { components: 7 },
  testEvidence: [{ pattern: '**/*.test.*', files: 12 }],
  packageUsage: [{ package: 'axios', folders: ['services'] }],
  totalFiles: 120,
};

describe('authoringActions', () => {
  it('writes the playbook, the /blueprint-author command, and the launch instruct', () => {
    const actions = authoringActions(survey);

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);

    const [playbook, command, instruct] = actions;

    expect(playbook).toMatchObject({ path: AUTHORING_FILE });
    expect(command).toMatchObject({ path: COMMAND_FILE });
    expect(command.kind === 'write' && command.content).toBe(`${AGENT_PROMPT}\n`);

    // The instruct carries both launch commands and the preset escape hatch.
    expect(instruct.note).toContain(`claude "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain(`codex "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain('init --preset');
  });
});

describe('authoringBrief', () => {
  const brief = authoringBrief(survey);

  it('carries the goal boundary: author and baseline, never refactor', () => {
    expect(brief).toContain('Out of scope: fixing the debt');
    expect(brief).toContain('--update-baseline');
  });

  it('encodes the method: intent over zero-findings, per-layer shapes, ownership', () => {
    expect(brief).toContain('never contort the order to make findings zero');
    expect(brief).toContain('module: { layout: \'folder\', entry: \'index\' }');
    expect(brief).toContain('owns');
    expect(brief).toContain('findings explosion');
  });

  it('embeds the survey evidence and the schema sketch', () => {
    expect(brief).toContain('resources → components');
    expect(brief).toContain('defineBlueprint');
    expect(brief).toContain('allowedImporters');
  });

  it('states the failure semantics: resumable, nothing lost', () => {
    expect(brief).toContain('Nothing is lost');
    expect(brief).toContain(COMMAND_FILE);
  });
});
