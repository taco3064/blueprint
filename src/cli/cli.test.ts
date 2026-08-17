import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isCliEntry, run } from './cli';

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
      + ' folder: { layout: \'flat\', entry: \'index\', private: [] },'
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
      + ' folder: { layout: \'folder\', entry: \'index\', private: [] },'
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

  it('treats a command named after an Object.prototype member as unknown', async () => {
    // `COMMAND_HELP` and `KNOWN_FLAGS` are bare records, so `blueprint constructor`
    // finds a function on the prototype chain in both. Read from the first, it is
    // printed as the command's help (`[Function: Object]`, exit 0); read from the
    // second, `.has` is called on it and the run dies with a TypeError printed as a
    // blueprint error — in place of the usage page, either way.
    expect(await run(['constructor', '--help'], root)).toBe(1);
    expect(await run(['constructor', '--json'], root)).toBe(1);
    expect(errored('✗')).toBe(false);

    expect(
      (console.log as ReturnType<typeof vi.fn>).mock.calls.every((call) =>
        String(call[0]).includes('Architecture as Code'),
      ),
    ).toBe(true);
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
