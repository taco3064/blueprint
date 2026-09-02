import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run, version } from './cli';

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

describe('per-command help · the exemption carries its condition', () => {
  // `--help` is read before any run measures anything, so these two sentences are
  // the whole of what an adopter knows about the exemption at that moment. The
  // published pages carry the limit; a help text that drops it is the same promise
  // on the channel `CLAUDE.md` calls the only guaranteed one.
  it.each([
    ['inspect', 'are exempt, matching\nthe lint side — as far as the globs reach'],
    ['inspect', 'a scanned file no declared glob\nmatches is inspected as ordinary source'],
    ['deps', 'The exclusion holds as far as the globs reach'],
    ['deps', 'glob matches is ordinary source on both sides, so its import counts'],
  ])('%s --help states the limit: %s', async (command, fragment) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run([command, '--help'])).toBe(0);
    expect(log.mock.calls[0][0]).toContain(fragment);
    log.mockRestore();
  });
});
