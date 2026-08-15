import { describe, expect, it } from 'vitest';

import { BROWNFIELD_MIN_FILES } from '../bootstrap';
import { COMMAND_HELP, USAGE } from './help';

const commands = Object.keys(COMMAND_HELP);

describe('COMMAND_HELP', () => {
  // One case per member: the map is what `run` looks a command up in, so a text
  // that lost its opening line, its flag list or its examples is a command whose
  // `--help` answers with prose that no longer describes it. Asserted per entry,
  // or every entry but the one a test happens to name can be emptied.
  //
  // What this file does NOT hold is MEMBERSHIP. The cases are derived from
  // `Object.keys`, so a dropped member runs one fewer case and reddens nothing
  // here. That contract lives in `cli.test.ts`, which names each command
  // literally: measured by deleting `deps` from the map — two tests go red,
  // both of them there, none of them in this file.
  it.each(commands)('%s opens by naming itself, then lists flags and examples', (command) => {
    const help = COMMAND_HELP[command];

    expect(help.split('\n')[0]).toMatch(new RegExp(`^blueprint ${command} .*— `));
    expect(help).toContain('Flags:');
    expect(help).toContain('Examples:');
    expect(help).toContain(`npx @kekkai/blueprint ${command}`);
  });
});

describe('USAGE', () => {
  it.each(commands)('names %s, so the command is discoverable without knowing it', (command) => {
    // A command with help text the usage page never lists is reachable only by
    // an agent that already knew to type it.
    expect(USAGE).toContain(`blueprint ${command}`);
  });

  it('sends the reader to the per-command help the map holds', () => {
    expect(USAGE).toContain('Run `blueprint <command> --help` for flags and details.');
  });
});

describe('the threshold the init help quotes', () => {
  it('comes from bootstrap rather than a hand-copied number', () => {
    // The playbook, `--authoring`'s description and the early-exit verdict all
    // state the same count; a literal here goes stale the moment it moves.
    expect(COMMAND_HELP.init).toContain(`${BROWNFIELD_MIN_FILES} source files`);
  });
});
