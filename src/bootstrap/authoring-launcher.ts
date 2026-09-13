import { normalizeAgentEmit } from '../config';
import type { AgentEmitEntry, AgentTarget } from '../config';
import { AUTHORING_FILE, COMMAND_FILE } from '../project';
import type { Action } from './types';

export const AGENT_PROMPT
  = `Read ${AUTHORING_FILE} at the repository root and execute it end to end.`;

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

export function claudeAuthoringLauncherActions(enabled: boolean): Action[] {
  return enabled
    ? [{
        kind: 'write',
        path: COMMAND_FILE,
        content: `${AGENT_PROMPT}\n`,
        note: `${COMMAND_FILE} (/blueprint-author)`,
      }]
    : [];
}
