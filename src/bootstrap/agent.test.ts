import { describe, expect, it } from 'vitest';

import { agentTargetOf, launchAgent, launchCommandLine } from './agent';
import { AGENT_PROMPT } from './authoring';

describe('launchCommandLine', () => {
  it('is the exact printable command for each agent', () => {
    expect(launchCommandLine('claude')).toBe(`claude "${AGENT_PROMPT}"`);
    expect(launchCommandLine('codex')).toBe(`codex "${AGENT_PROMPT}"`);
  });
});

describe('launchAgent', () => {
  it('spawns the agent with the entry prompt in the project root', () => {
    const calls: { bin: string; args: string[]; cwd: string }[] = [];
    const logs: string[] = [];

    const code = launchAgent('claude', '/repo', (m) => logs.push(m), (bin, args, cwd) => {
      calls.push({ bin, args, cwd });

      return { status: 0 };
    });

    expect(code).toBe(0);
    expect(calls).toEqual([{ bin: 'claude', args: [AGENT_PROMPT], cwd: '/repo' }]);
    expect(logs.join('\n')).toContain('your agent CLI, your permissions');
  });

  it('returns the agent exit status without treating it as an error', () => {
    const code = launchAgent('codex', '/repo', () => {}, () => ({ status: 130 }));

    expect(code).toBe(130);
  });

  it('defaults a null status to 0', () => {
    expect(launchAgent('codex', '/repo', () => {}, () => ({ status: null }))).toBe(0);
  });

  it('throws with the manual command when the binary cannot launch', () => {
    expect(() =>
      launchAgent('claude', '/repo', () => {}, () => ({
        status: null,
        error: new Error('ENOENT'),
      })),
    ).toThrow(/could not launch "claude".*run it yourself[\s\S]*claude "/);
  });
});

describe('agentTargetOf', () => {
  it('maps each agent CLI to the contract file it reads', () => {
    expect(agentTargetOf('claude')).toBe('claude');
    expect(agentTargetOf('codex')).toBe('agents');
  });
});
