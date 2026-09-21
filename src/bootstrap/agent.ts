import { spawnSync } from 'node:child_process';

import { AGENT_PROMPT } from './authoring-launcher';
import {
  renderAgentCommand,
  renderAgentCommandOutput,
  renderAgentLaunchFailure,
  renderAgentLaunchHeader,
} from '../operational-contract';
import type { OperationalText } from '../operational-contract';

export const AGENT_KINDS = ['claude', 'codex'] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export function agentTargetOf(agent: AgentKind): 'claude' | 'agents' {
  return agent === 'claude' ? 'claude' : 'agents';
}

export function launchCommandLine(agent: AgentKind, prompt = AGENT_PROMPT): string {
  return renderAgentCommand(agent, prompt);
}

export type Spawner = (
  bin: string,
  args: string[],
  cwd: string,
) => { status: number | null; error?: Error };

/* v8 ignore start -- real child process; tests inject a spawner */
const defaultSpawner: Spawner = (bin, args, cwd) => {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit' });

  return { status: result.status, error: result.error };
};
/* v8 ignore stop */

export function launchAgent(
  agent: AgentKind,
  root: string,
  effects: { log: (message: string) => void; spawner?: Spawner; prompt?: OperationalText },
): number {
  const { log, spawner = defaultSpawner, prompt = AGENT_PROMPT } = effects;

  log(renderAgentLaunchHeader(agent));
  log(renderAgentCommandOutput(launchCommandLine(agent, prompt)));

  const result = spawner(agent, [prompt], root);

  if (result.error) {
    throw new Error(renderAgentLaunchFailure(
      agent,
      result.error.message,
      launchCommandLine(agent, prompt),
    ));
  }

  return result.status ?? 0;
}
