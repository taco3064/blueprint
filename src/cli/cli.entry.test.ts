import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USAGE } from './help';

describe('live CLI entry', () => {
  const self = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.ts');
  let argv: string[];
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    argv = process.argv;
    exitCode = process.exitCode;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('CLI must allow pending output to drain');
    });
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = exitCode;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each([
    { args: [], code: 0 },
    { args: ['--help'], code: 0 },
    { args: ['unknown-command'], code: 1 },
  ])('dispatches only user arguments $args and sets exit code $code', async ({ args, code }) => {
    process.argv = [process.execPath, self, ...args];
    process.exitCode = 73;

    await import('./cli');

    expect(process.exitCode).toBe(code);
    expect(console.log).toHaveBeenCalledExactlyOnceWith(USAGE);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('preserves failure diagnostics and sets exit 1 without terminating the process', async () => {
    process.argv = [process.execPath, self, 'inspect', '--unknown'];
    process.exitCode = 73;

    await import('./cli');

    expect(process.exitCode).toBe(1);
    expect(console.log).not.toHaveBeenCalled();

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('unknown flag for inspect: --unknown'),
    );

    expect(process.exit).not.toHaveBeenCalled();
  });

  it('does not dispatch or change the exit code when imported by another entry', async () => {
    process.argv = [process.execPath, fileURLToPath(import.meta.url), '--help'];
    process.exitCode = 73;

    await import('./cli');

    expect(process.exitCode).toBe(73);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
