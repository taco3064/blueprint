import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isCliEntry, parseDepsArgs, parseDoctorArgs, parseImpactArgs, parseInitArgs, parseInspectArgs, parseRulesArgs, parseSurveyArgs, run, version } from './cli';

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

describe('run', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints usage and returns 0 when no command is given', async () => {
    expect(await run([])).toBe(0);
  });

  it('returns 1 for an unknown command', async () => {
    expect(await run(['bogus'])).toBe(1);
  });

  it('fails loud on an unknown flag instead of silently ignoring it (field #4)', async () => {
    // An agent tried `inspect --verbose`, saw identical output, and
    // reasonably concluded the flag was a broken no-op.
    expect(await run(['inspect', '--verbose'], root)).toBe(1);

    expect(
      (console.error as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        String(call[0]).includes('unknown flag for inspect: --verbose'),
      ),
    ).toBe(true);

    // Valued flags still consume their value without tripping the check.
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    expect(await run(['init', '--framework', 'vue', '--no-install', '--dry-run'], root)).toBe(0);
  });

  it('runs init in the given cwd and returns 0', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    expect(await run(['init', '--no-install'], root)).toBe(0);
    expect(fs.existsSync(path.join(root, 'blueprint.config.mjs'))).toBe(true);
  });

  it('returns 1 and reports when init fails', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: {} }));

    expect(await run(['init'], root)).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('runs inspect and returns 0 for a clean project', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    expect(await run(['inspect'], root)).toBe(0);
  });

  it('returns 1 from inspect when errors are found', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    fs.mkdirSync(path.join(root, 'src', 'utils'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'utils', 'x.ts'), 'export const a = 1;');

    expect(await run(['inspect'], root)).toBe(1);
  });
});

describe('isCliEntry', () => {
  // isCliEntry compares against cli.ts's own module URL — not this test file's.
  //
  // Via fileURLToPath, never `new URL(...).pathname`: on Windows the pathname of
  // a file URL is `/D:/a/repo/...`, with a leading slash and forward slashes, and
  // joining onto that yields a path no filesystem call can resolve. The old form
  // made realpathSync throw, isCliEntry answer false, and this test claim the
  // entry guard was broken on a platform where it is fine.
  const self = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.ts');

  it('recognizes the real path and — critically — an npm-style bin symlink', () => {
    // Direct invocation: node dist/bin.js
    expect(isCliEntry(self)).toBe(true);

    // npm installs the bin as a symlink; Node resolves the entry module to
    // its real path while argv[1] keeps the symlink — the 0.1.1 silent no-op.
    const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-bin-')), 'blueprint');

    fs.symlinkSync(self, link);
    expect(isCliEntry(link)).toBe(true);
    fs.rmSync(path.dirname(link), { recursive: true, force: true });
  });

  it('rejects other files, missing paths, and a missing argv[1]', () => {
    expect(isCliEntry(undefined)).toBe(false);
    expect(isCliEntry('/no/such/file.js')).toBe(false);
    expect(isCliEntry(path.join(path.dirname(self), 'cli.test.ts'))).toBe(false);
  });
});

describe('help & version flags', () => {
  it('prints usage and exits 0 on --help / -h', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run(['--help'])).toBe(0);
    expect(await run(['-h'])).toBe(0);
    expect(log.mock.calls[0][0]).toContain('Usage:');
    log.mockRestore();
  });

  it('prints the package version and exits 0 on --version / -v', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const expected = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version;

    expect(await run(['--version'])).toBe(0);
    expect(await run(['-v'])).toBe(0);
    expect(log.mock.calls[0][0]).toBe(expected);
    log.mockRestore();
  });

  it('version() walks both layouts and reports unknown when nothing is found', () => {
    expect(version()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(version('/no/such/dir')).toBe('unknown');
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

describe('per-command help', () => {
  it('prints command help and exits 0 for init/inspect --help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run(['init', '--help'])).toBe(0);
    expect(log.mock.calls[0][0]).toContain('blueprint init — scaffold');
    expect(log.mock.calls[0][0]).toContain('never overwritten');

    expect(await run(['inspect', '-h'])).toBe(0);
    expect(log.mock.calls[1][0]).toContain('read-only architecture report');
    log.mockRestore();
  });

  it('documents --structure: both values, and that a config already answered it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run(['init', '--help'])).toBe(0);

    const help = String(log.mock.calls[0][0]);

    expect(help).toContain('--structure flat|modular');
    // Both values, each with what it means — a flag whose help names only the
    // syntax hands the choice back unanswered, and this one is a day-one choice.
    expect(help).toContain('technical layers at the source root');
    expect(help).toContain('(flat, the default)');
    expect(help).toContain('feature modules there with');
    expect(help).toContain('those layers inside each one (modular)');
    // And the question it does NOT re-ask, or a re-run with the flag reads as a
    // migration that silently did nothing.
    expect(help).toContain('an existing blueprint.config.mjs already');
    expect(help).toContain('re-run with this flag changes nothing');
    log.mockRestore();
  });

  it('keeps the value proposition in the top-level usage', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await run(['--help']);
    expect(log.mock.calls[0][0]).toContain('Architecture as Code');
    expect(log.mock.calls[0][0]).toContain('AI agent contract');
    log.mockRestore();
  });
});

describe('deps command dispatch', () => {
  it('runs the leaderboard and per-command help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-deps-'));

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    fs.mkdirSync(path.join(dir, 'src', 'hooks', 'useX'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'hooks', 'useX', 'useX.ts'), 'export const a = 1;');

    expect(await run(['deps'], dir)).toBe(0);
    expect(await run(['deps', 'hooks/ghost'], dir)).toBe(1);
    expect(await run(['deps', '--help'])).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
  });
});

describe('rules command dispatch', () => {
  it('prints the catalog (config-optional, always exit 0) and its help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-rules-'));

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));

    // No config — the static catalog is a complete, valid answer.
    expect(await run(['rules'], dir)).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('emitted-rule catalog'))).toBe(true);

    expect(await run(['rules', '--help'], dir)).toBe(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('queryable'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
  });

  it('parses json only — rules resolves the config, so --framework is not a flag', () => {
    expect(parseRulesArgs(['--json', '--framework', 'vue', '--nope'])).toEqual({ json: true });
    expect(parseRulesArgs([])).toEqual({});
  });
});

describe('run · impact', () => {
  it('prints its help, and errors loud (exit 1) without a config', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-impact-'));

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));

    expect(await run(['impact', '--help'], dir)).toBe(0);
    expect(log.mock.calls[0][0]).toContain('dry-run the emitted lint rules');

    // The dry-run needs an authored config to measure — fail loud, not empty.
    expect(await run(['impact'], dir)).toBe(1);
    expect(error.mock.calls[0][0]).toContain('author the config first');

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 0 with real counts through the project stack', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-impact-run-'));

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { react: '^18' } }),
    );

    // A self-contained config (no bare imports) so the real dynamic import in
    // resolveBlueprint resolves from a bare temp dir; eslint itself resolves
    // through defaultLoadModule's bare-import fallback (this repo's devDep).
    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      'export default { framework: \'react\', architecture: { alias: \'~app\','
      + ' layers: [{ name: \'components\', does: \'ui\' }] },'
      + ' rules: { unusedVars: \'error\' } };',
    );

    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'src/components/f.jsx'),
      'export const f = (unused) => 1;\n',
    );

    expect(await run(['impact'], dir)).toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toContain('no-unused-vars');

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
  });
});

describe('run · doctor', () => {
  it('exits 1 when adoption is unfinished and 0 when help is asked', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-doctor-'));

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    // No config yet → the first check fails → exit 1.
    expect(await run(['doctor'], dir)).toBe(1);
    expect(await run(['doctor', '--help'])).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
  });

  it('exits 0 when every check passes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-doctor-ok-'));

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    // A self-contained config (no bare imports) so the real dynamic import in
    // resolveBlueprint resolves from a bare temp dir.
    fs.writeFileSync(
      path.join(dir, 'blueprint.config.mjs'),
      'export default { framework: \'vue\', architecture: { alias: \'~app\','
      + ' layers: [{ name: \'components\', does: \'ui\', layout: \'folder\' }] } };',
    );

    // The alias check wants the declared alias resolvable by the toolchain.
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
    );

    fs.writeFileSync(
      path.join(dir, 'eslint.config.mjs'),
      'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];',
    );

    expect(await run(['doctor'], dir)).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
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

describe('parseInitArgs · --structure', () => {
  // One case per member: with a single one covered, the other can be deleted
  // from the accepted list and the suite stays green.
  it.each([['flat'], ['modular']] as const)('parses --structure %s', (value) => {
    expect(parseInitArgs(['--structure', value])).toEqual({ structure: value });
  });

  it('refuses a bad value and a missing one, naming both values', () => {
    // Not `--framework`'s silent fallback: an unparsed value there leaves the
    // option undefined, so a run asked for `modular` would scaffold flat and say
    // nothing — and the config is the artifact nobody re-reads.
    expect(() => parseInitArgs(['--structure', 'banana'])).toThrow(/flat \| modular/);
    expect(() => parseInitArgs(['--structure'])).toThrow(/flat \| modular/);
  });
});

describe('parseSurveyArgs', () => {
  it('parses --json and --alias', () => {
    expect(parseSurveyArgs(['--json', '--alias', '@'])).toEqual({ json: true, alias: '@' });
    expect(parseSurveyArgs(['--wat'])).toEqual({});
  });
});

describe('survey command dispatch', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-survey-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('runs survey and always returns 0', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    expect(await run(['survey'], root)).toBe(0);
    expect(vi.mocked(console.log).mock.calls.join('\n')).toContain('Survey ·');
  });

  it('surfaces a bad --agent through the error path with exit 1', async () => {
    expect(await run(['init', '--agent', 'skynet'], root)).toBe(1);
  });

  it('prints survey help', async () => {
    expect(await run(['survey', '--help'])).toBe(0);
    expect(vi.mocked(console.log).mock.calls.join('\n')).toContain('deterministic evidence');
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

describe('run · flag validation reaches the right arguments', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-flags-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const errored = (fragment: string) =>
    (console.error as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
      String(call[0]).includes(fragment),
    );

  it('never mistakes a positional argument for a flag', async () => {
    // `deps hooks/useCart` is the command's whole point. Running the flag check
    // over positionals rejects the module name as an unknown flag, and the
    // command becomes unusable in the shape its own help documents.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    await run(['deps', 'hooks/useCart'], root);

    expect(errored('unknown flag')).toBe(false);
  });

  it('lets a valued flag swallow the token after it', async () => {
    // `--framework --json` is a user who forgot the value. The token after a
    // valued flag IS its value, however flag-shaped it looks — checking it
    // separately reports an unknown flag for an argument that was consumed.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    await run(['inspect', '--framework', '--bogus'], root);

    expect(errored('unknown flag')).toBe(false);
  });

  it('checks every flag, not only the one after a valued flag', async () => {
    // Skipping a token unconditionally makes the check blind to every other
    // argument: `--json --verbose` passes because `--verbose` was consumed as
    // `--json`'s value, and `--json` takes no value.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    await run(['inspect', '--json', '--verbose'], root);

    expect(errored('unknown flag for inspect: --verbose')).toBe(true);
  });

  it('accepts each command\'s own documented flags', async () => {
    // Every per-command flag set had at least one flag no test passed, so the
    // whole set could be emptied: the command then rejects the flags its own
    // --help documents.
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    await run(['survey', '--alias', '~app', '--json'], root);
    await run(['doctor', '--json'], root);
    await run(['deps', '--json', '--framework', 'vue'], root);
    await run(['impact', '--json'], root);
    await run(['rules', '--json'], root);

    expect(errored('unknown flag')).toBe(false);
  });

  it('lets init through with --structure and its value', async () => {
    // KNOWN_FLAGS.init: without the entry the flag dies at the check, before the
    // parser it was written for ever sees it.
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { vue: '^3' } }),
    );

    expect(await run(['init', '--structure', 'modular', '--no-install', '--dry-run'], root))
      .toBe(0);

    expect(errored('unknown flag')).toBe(false);
  });

  it('reads the token after --structure as its value, however flag-shaped', async () => {
    // This is the ONLY case the VALUED_FLAGS entry decides. The check skips any
    // argument not starting with a dash, so `--structure modular` is accepted
    // with or without the entry — measured on the built bin with the valued flag
    // that already exists (`survey --alias --json` consumes `--json` as the
    // value). A flag-shaped value is where the entry is the difference: without
    // it the run dies on `--bogus` as an unknown flag, and the usage error the
    // caller can act on never gets printed.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    expect(await run(['init', '--structure', '--bogus'], root)).toBe(1);
    expect(errored('--structure expects one of: flat | modular.')).toBe(true);
    expect(errored('unknown flag')).toBe(false);
  });

  it('points a mistyped --structure at init --help', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    expect(await run(['init', '--sturcture', 'modular'], root)).toBe(1);
    expect(errored('unknown flag for init: --sturcture — see: blueprint init --help')).toBe(true);
  });

  it('does not run the flag check for a command it knows nothing about', async () => {
    // An unrecognised command has no flag set to check against. Checking anyway
    // reads `undefined.has(...)`, so the run dies with a TypeError printed as a
    // blueprint error — in place of the usage page that lists the real commands.
    expect(await run(['bogus', '--json'], root)).toBe(1);
    expect(errored('✗')).toBe(false);

    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        String(call[0]).includes('Architecture as Code'),
      ),
    ).toBe(true);
  });
});

describe('run · --help belongs to the command that has one', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logged = (fragment: string) =>
    (console.log as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
      String(call[0]).includes(fragment),
    );

  it('does not answer --help for an unknown command', async () => {
    // There is no help text to print, so the branch logs `undefined` and exits
    // 0 — a mistyped command reads as a successful run with no output.
    expect(await run(['bogus', '--help'])).toBe(1);
    expect(logged('undefined')).toBe(false);
  });

  it('prints help only when --help was actually asked for', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-help-'));

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    await run(['rules'], root);

    // `rules` without --help resolves the catalog. Printing the help text
    // instead swaps the command's whole output for its usage page. (Both open
    // on "blueprint rules — the emitted-rule catalog", so the fragment has to
    // come from the part only the help carries.)
    expect(logged('Read-only, config-optional')).toBe(false);
    expect(logged('the emitted-rule catalog')).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('documents deps and doctor in their own help text', async () => {
    // Both help bodies were only ever asserted to exist, never read, so either
    // could be emptied — and `--help` then prints nothing at all.
    await run(['deps', '--help']);
    expect(logged('reverse dependencies / blast radius')).toBe(true);

    await run(['doctor', '--help']);
    expect(logged('is adoption actually finished?')).toBe(true);
    // The exit-code gate this help invites has one blind spot, and the help owes it:
    // a skipped check keeps exit 0, so `--json`'s `skipped` is what a gate reads
    // (field run #129 — the skip that was counted as a pass).
    expect(logged('Exit stays')).toBe(true);
    expect(logged('look for `skipped` on a check')).toBe(true);
  });
});
