import { spawnSync } from 'node:child_process';

import { AGENT_PROMPT } from './authoring';

/**
 * The `--agent` launcher — deliberately the thinnest layer of the authoring
 * flow. It spawns the user's own agent CLI in the foreground (interactive,
 * stdio inherited), feeding it the same entry prompt init already printed.
 * Every artifact is on disk *before* the spawn, so a launch failure — or an
 * agent that gives up midway — degrades to exactly the manual path. Blueprint
 * itself still makes no network calls and holds no credentials; the agent
 * session runs under the user's own CLI permissions.
 */

export const AGENT_KINDS = ['claude', 'codex'] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** The exact command line the launcher runs — also printed for manual use. */
export function launchCommandLine(agent: AgentKind): string {
  return `${agent} "${AGENT_PROMPT}"`;
}

/** Injectable spawn seam so tests never start a real agent. */
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

/**
 * Spawn the agent CLI in `root`. Throws when the binary cannot be launched
 * (the message carries the manual command — the fallback IS the manual path).
 * The agent's own exit status is returned but not treated as an error: the
 * session belongs to the user, and quitting it is not a launcher failure.
 */
export function launchAgent(
  agent: AgentKind,
  root: string,
  log: (message: string) => void,
  spawner: Spawner = defaultSpawner,
): number {
  log(`\nLaunching ${agent} (interactive — your agent CLI, your permissions):`);
  log(`  ${launchCommandLine(agent)}`);

  const result = spawner(agent, [AGENT_PROMPT], root);

  if (result.error) {
    throw new Error(
      `could not launch "${agent}" (${result.error.message}). `
      + `Everything is already on disk — run it yourself:\n    ${launchCommandLine(agent)}`,
    );
  }

  return result.status ?? 0;
}
