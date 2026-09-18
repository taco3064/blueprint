import { describe, expect, expectTypeOf, it } from 'vitest';

import { KNOWN_FLAGS } from '../cli/args';
import {
  renderCliCommandHelp,
  renderInvalidAgent,
  renderUnknownFlag,
} from './index';
import type { OperationalText } from './index';

type Command = keyof typeof KNOWN_FLAGS;

const COMMANDS = Object.keys(KNOWN_FLAGS) as Command[];
const DISCLAIMED_FLAGS: Partial<Record<Command, string[]>> = { upgrade: ['--to'] };

function unsupportedFlags(command: Command, help: string): string[] {
  const invocation = new RegExp(`blueprint (${COMMANDS.join('|')})\\b|(--[a-z][a-z-]*)`, 'g');

  return help.split('\n').flatMap((line) => {
    let owner = command;

    return [...line.matchAll(invocation)].flatMap(([, invoked, flag]) => {
      if (invoked) {
        owner = invoked as Command;

        return [];
      }

      const disclaimed = owner === command && DISCLAIMED_FLAGS[command]?.includes(flag);

      return KNOWN_FLAGS[owner].has(flag) || disclaimed ? [] : [`${owner} ${flag}`];
    });
  });
}

describe('CLI help teaches only flags the parser accepts', () => {
  const help = renderCliCommandHelp({ brownfieldMinFiles: 10 });

  it.each(COMMANDS)('%s --help', (command) => {
    expect(unsupportedFlags(command, help[command])).toEqual([]);
  });

  it('attributes a flag to the command invoked before it on the same line', () => {
    expect(unsupportedFlags('init', 'a multi-app workspace must choose --source-root first.'))
      .toEqual(['init --source-root']);

    expect(unsupportedFlags('init', 'run `blueprint survey --source-root <path>` first.'))
      .toEqual([]);

    expect(unsupportedFlags('survey', 'then `blueprint init --alias x`.'))
      .toEqual(['init --alias']);

    expect(unsupportedFlags('init', 'see `blueprint upgrade` for --to.')).toEqual(['upgrade --to']);
  });

  it.each(Object.entries(DISCLAIMED_FLAGS))('%s disclaims %j and rejects it', (command, flags) => {
    for (const flag of flags ?? []) {
      expect(KNOWN_FLAGS[command as Command].has(flag)).toBe(false);
      expect(help[command as Command]).toContain(`there is no ${flag} flag`);
    }
  });
});

describe('CLI operational contract', () => {
  it('covers exactly every command that owns a flag contract', () => {
    const help = renderCliCommandHelp({ brownfieldMinFiles: 20 });

    expect(Object.keys(help).sort()).toEqual(Object.keys(KNOWN_FLAGS).sort());
    expectTypeOf(help).toMatchTypeOf<Record<keyof typeof KNOWN_FLAGS, OperationalText>>();
    expectTypeOf<string>().not.toMatchTypeOf<OperationalText>();
  });

  it('renders runtime facts instead of freezing one error or threshold', () => {
    const small = renderCliCommandHelp({ brownfieldMinFiles: 7 });
    const large = renderCliCommandHelp({ brownfieldMinFiles: 70 });

    expect(small.init).toContain('threshold, 7 source files');
    expect(large.init).toContain('threshold, 70 source files');
    expect(small.init).not.toBe(large.init);

    expect(renderInvalidAgent(['claude', 'codex'])).toContain('claude | codex');
    expect(renderInvalidAgent(['codex'])).not.toContain('claude');

    expect(renderUnknownFlag('inspect', '--verbose'))
      .toBe('unknown flag for inspect: --verbose — see: blueprint inspect --help');

    expect(renderUnknownFlag('doctor', '--fix'))
      .toBe('unknown flag for doctor: --fix — see: blueprint doctor --help');
  });

  it('describes init from resolved topology, source root, and output policy', () => {
    const init = renderCliCommandHelp({ brownfieldMinFiles: 10 }).init;

    expect(init).toContain('fresh layer-first preset only');
    expect(init).toContain('under the resolved\n    sourceRoot');
    expect(init).toContain('a module-first runway creates no module folder');
    expect(init).toContain('handbook at emit.handbook');
    expect(init).toContain('only the Agent contracts selected by resolved emit.agents');
    expect(init).not.toContain('src/<layer>/');
    expect(init).not.toContain('and AI agent contracts (CLAUDE.md, AGENTS.md)');
  });
});
