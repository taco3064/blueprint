import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isCliEntry, parseDepsArgs, parseDoctorArgs, parseImpactArgs, parseInitArgs, parseInspectArgs, parseRetireArgs, parseRulesArgs, parseSurveyArgs, run, version } from './cli';

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
  const self = path.join(path.dirname(new URL(import.meta.url).pathname), 'cli.ts');

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

describe('retire command dispatch', () => {
  it('exits 1 while references remain, 0 when swept, loud without a name', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-retire-'));

    fs.writeFileSync(path.join(dir, 'README.md'), 'gate: structure-lint\n');

    expect(await run(['retire', 'structure-lint'], dir)).toBe(1); // sweep not done

    fs.writeFileSync(path.join(dir, 'README.md'), 'gate: blueprint\n');

    expect(await run(['retire', 'structure-lint'], dir)).toBe(0); // clean

    expect(await run(['retire'], dir)).toBe(1); // no name — fail-loud floor
    expect(error.mock.calls.some((c) => String(c[0]).includes('needs the name'))).toBe(true);

    expect(await run(['retire', '--help'], dir)).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
    error.mockRestore();
  });

  it('parses the name and --json', () => {
    expect(parseRetireArgs(['structure-lint', '--json'])).toEqual({
      token: 'structure-lint',
      json: true,
    });

    expect(parseRetireArgs(['a', 'b'])).toEqual({ token: 'a' });
    expect(parseRetireArgs([])).toEqual({});
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
      'export default { framework: \'react\', architecture: { alias: \'~app\', flow: \'one-way\','
      + ' module: { layout: \'flat\', entry: \'index\', private: [] },'
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
      'export default { framework: \'vue\', architecture: { alias: \'~app\', flow: \'one-way\','
      + ' module: { layout: \'folder\', entry: \'index\', private: [] },'
      + ' layers: [{ name: \'components\', does: \'ui\' }] } };',
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
