import { describe, expect, it } from 'vitest';

import {
  parseDepsArgs,
  parseDoctorArgs,
  parseImpactArgs,
  parseInitArgs,
  parseInspectArgs,
  parseRulesArgs,
  parseSurveyArgs,
} from './args';

describe('parseInitArgs', () => {
  it('parses known flags', () => {
    expect(parseInitArgs(['--no-install', '--dry-run', '--framework', 'react'])).toEqual({
      install: false,
      dryRun: true,
      framework: 'react',
    });
  });

  it('ignores an invalid framework value and unknown flags', () => {
    expect(parseInitArgs(['--framework', 'svelte', '--nope'])).toEqual({});
  });
});

describe('parseInspectArgs', () => {
  it('parses --json and --framework', () => {
    expect(parseInspectArgs(['--json', '--framework', 'vue'])).toEqual({
      json: true,
      framework: 'vue',
    });
  });

  it('ignores unknown flags and an invalid framework value', () => {
    expect(parseInspectArgs(['--wat'])).toEqual({});
    expect(parseInspectArgs(['--framework', 'svelte'])).toEqual({});
  });
});

describe('parseInspectArgs · baseline flags', () => {
  it('parses --baseline and --update-baseline', () => {
    expect(parseInspectArgs(['--baseline'])).toEqual({ baseline: true });
    expect(parseInspectArgs(['--update-baseline'])).toEqual({ updateBaseline: true });
  });
});

describe('parseDepsArgs', () => {
  it('takes the first non-flag argument as the target', () => {
    expect(parseDepsArgs(['hooks/useCart', '--json'])).toEqual({
      target: 'hooks/useCart',
      json: true,
    });

    expect(parseDepsArgs(['--framework', 'vue', 'a', 'b'])).toEqual({
      framework: 'vue',
      target: 'a',
    });

    expect(parseDepsArgs([])).toEqual({});
    expect(parseDepsArgs(['--framework', 'nope'])).toEqual({ framework: undefined });

    // doctor requires a config, where the config wins — --framework was an
    // inert flag that lied, so the parser no longer knows it.
    expect(parseDoctorArgs(['--json', '--framework', 'vue'])).toEqual({ json: true });
    expect(parseDoctorArgs(['--unknown'])).toEqual({});

    expect(parseInitArgs(['--authoring'])).toEqual({ authoring: true });
  });
});

describe('parseImpactArgs', () => {
  it('parses json only — impact requires a config, so --framework is not a flag', () => {
    expect(parseImpactArgs(['--json', '--framework', 'react', '--nope'])).toEqual({ json: true });
    expect(parseImpactArgs([])).toEqual({});
  });
});

describe('parseInitArgs · authoring flags', () => {
  it('parses --agent and --preset', () => {
    expect(parseInitArgs(['--agent', 'claude', '--preset'])).toEqual({
      agent: 'claude',
      preset: true,
    });

    expect(parseInitArgs(['--agent', 'codex'])).toEqual({ agent: 'codex' });
  });

  it('rejects an unknown agent', () => {
    expect(() => parseInitArgs(['--agent', 'skynet'])).toThrow(/claude \| codex/);
    expect(() => parseInitArgs(['--agent'])).toThrow(/claude \| codex/);
  });
});

describe('parseSurveyArgs', () => {
  it('parses --json and --alias', () => {
    expect(parseSurveyArgs(['--json', '--alias', '@'])).toEqual({ json: true, alias: '@' });
    expect(parseSurveyArgs(['--wat'])).toEqual({});
  });
});

describe('parse*Args · argument boundaries', () => {
  it('reads a positional target, and only a positional one', () => {
    // A flag-shaped argument is never a target: `--nope` opens with a dash, so
    // it is an unknown flag, not the module to trace.
    expect(parseDepsArgs(['hooks/useX'])).toEqual({ target: 'hooks/useX' });
    expect(parseDepsArgs(['--nope'])).toEqual({});
    expect(parseImpactArgs(['--nope'])).toEqual({});
  });

  it('takes the first positional and leaves later ones alone', () => {
    // The second bare word is not a second target — silently replacing the
    // first would trace a module the user did not ask about.
    expect(parseDepsArgs(['hooks/useX', 'hooks/useY'])).toEqual({ target: 'hooks/useX' });
  });

  it('ignores a value-taking flag with nothing after it', () => {
    // Walking one index past the array hands the next branch `undefined`, and
    // `undefined.startsWith` throws inside the CLI instead of reporting a usage
    // error the caller can act on.
    expect(parseDepsArgs(['--framework'])).toEqual({});
    expect(parseImpactArgs(['--framework'])).toEqual({});
    expect(parseInitArgs(['--framework'])).toEqual({});
    expect(parseInspectArgs(['--framework'])).toEqual({});
    expect(parseSurveyArgs(['--alias'])).toEqual({});
  });
});

describe('parse*Args · a bare word is never a flag\'s value', () => {
  it('does not read a positional as the --framework value', () => {
    // `blueprint init vue` is the mistake a user makes when they forget the flag
    // name. Treating any unmatched argument as the framework value silently
    // accepts it — so the run scaffolds a Vue contract from a command that never
    // said `--framework`, and the user has no way to know why.
    // Two arguments, so the value the mutant would reach for is a real one — a
    // single positional leaves it undefined, and `toEqual({})` cannot see a key
    // whose value is undefined.
    expect(parseInitArgs(['junk', 'vue'])).toEqual({});
    expect(parseInspectArgs(['junk', 'vue'])).toEqual({});
    expect(parseSurveyArgs(['junk', '~app'])).toEqual({});
  });
});

describe('parseRulesArgs', () => {
  it('parses json only — rules resolves the config, so --framework is not a flag', () => {
    expect(parseRulesArgs(['--json', '--framework', 'vue', '--nope'])).toEqual({ json: true });
    expect(parseRulesArgs([])).toEqual({});
  });
});
