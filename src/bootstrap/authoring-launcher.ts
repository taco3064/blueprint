import { normalizeAgentEmit } from '../config';
import type { AgentEmitEntry, AgentTarget } from '../config';
import { AUTHORING_FILE, COMMAND_FILE } from '../project';
import { renderAuthoringAgentPrompt, renderAuthoringLauncherNote } from '../operational-contract';
import type { Action } from './types';

export const AGENT_PROMPT
  = renderAuthoringAgentPrompt(AUTHORING_FILE);

export const REPOSITORY_AGENT_PROMPT
  = renderAuthoringAgentPrompt(AUTHORING_FILE, 'repository');

export type AuthoringAgents = readonly (AgentTarget | AgentEmitEntry)[] | undefined;

export function freshAuthoringAgents(
  agent: 'claude' | 'codex' | undefined,
): AuthoringAgents {
  return agent === undefined ? undefined : [agent === 'claude' ? 'claude' : 'agents'];
}

export function emitsClaudeAuthoringLauncher(agents: AuthoringAgents): boolean {
  return normalizeAgentEmit(agents ? [...agents] : undefined)
    .some((entry) => entry.target === 'claude');
}

export function authoringLauncherActions(agents: AuthoringAgents): Action[] {
  return claudeAuthoringLauncherActions(emitsClaudeAuthoringLauncher(agents));
}

export function claudeAuthoringLauncherActions(
  enabled: boolean,
  prompt = AGENT_PROMPT,
): Action[] {
  return enabled
    ? [{
        kind: 'write',
        path: COMMAND_FILE,
        content: `${prompt}\n`,
        note: renderAuthoringLauncherNote(COMMAND_FILE),
        ownership: 'generated',
      }]
    : [];
}
