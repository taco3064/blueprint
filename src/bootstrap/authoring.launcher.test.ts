import { describe, expect, it } from 'vitest';

import type { SurveyResult } from '../survey';
import { AGENT_PROMPT, authoringActions, COMMAND_FILE } from './authoring';

const survey: SurveyResult = {
  framework: 'react',
  typescript: true,
  packageManager: 'npm',
  aliases: {},
  rootFiles: [],
  folders: [],
  edges: [],
  selfAliasImports: {},
  testEvidence: [],
  ownableImports: [],
  packageUsage: [],
  unresolved: [],
  totalFiles: 3,
};

function actions(agents: Parameters<typeof authoringActions>[1]['agents']) {
  return authoringActions(survey, {
    packageManager: 'npm',
    needsInstall: false,
    claudeDir: { hadDir: false, otherCommands: 0 },
    viteTs: null,
    tscOut: null,
    agents,
  });
}

describe('authoring launcher policy', () => {
  it('separates the neutral playbook from the Claude launcher for agents-only authoring', () => {
    const planned = actions(['agents']);
    const playbook = planned[0];
    const instruction = planned[1].note;

    expect(planned.map((action) => action.kind)).toEqual(['write', 'instruct']);
    expect(planned).not.toContainEqual(expect.objectContaining({ path: COMMAND_FILE }));
    expect(playbook.kind === 'write' && playbook.content).not.toContain(COMMAND_FILE);
    expect(playbook.kind === 'write' && playbook.content).not.toContain('the command file');
    expect(instruction).not.toContain('/blueprint-author');
    expect(instruction).toContain(`claude "${AGENT_PROMPT}"`);
    expect(instruction).toContain(`codex "${AGENT_PROMPT}"`);
  });

  it.each([undefined, ['claude'] as const])(
    'retains the Claude launcher for the default and Claude-inclusive policies',
    (agents) => {
      const planned = actions(agents);

      expect(planned).toContainEqual(expect.objectContaining({ path: COMMAND_FILE }));
      expect(planned.at(-1)?.note).toContain('/blueprint-author');
    },
  );
});
