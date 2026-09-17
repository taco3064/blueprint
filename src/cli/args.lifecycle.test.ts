import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KNOWN_FLAGS, parseRemoveArgs, parseUpgradeArgs } from './args';
import { run } from './cli';

const WITHOUT_ID = [[['--complete']], [['--complete', '--dry-run']]];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseUpgradeArgs', () => {
  it('reads --dry-run and --complete <operation-id>', () => {
    expect(parseUpgradeArgs([])).toEqual({});
    expect(parseUpgradeArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect(parseUpgradeArgs(['stray', '--dry-run'])).toEqual({ dryRun: true });

    expect(parseUpgradeArgs(['--complete', 'review-retired-module-private']))
      .toEqual({ complete: 'review-retired-module-private' });
  });

  it.each(WITHOUT_ID)('requires an operation id: %j', (args) => {
    expect(() => parseUpgradeArgs(args)).toThrow('--complete expects the id of a pending upgrade');
  });

  it('declares exactly the upgrade flags', () => {
    expect([...KNOWN_FLAGS.upgrade]).toEqual(['--dry-run', '--complete']);
  });
});

describe('run · upgrade', () => {
  it('prints its own help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run(['upgrade', '--help'])).toBe(0);

    const help = String(log.mock.calls[0][0]);

    expect(help)
      .toContain('blueprint upgrade — move this repository to the running Blueprint release.');

    expect(help).toContain('there is no --to flag, and upgrade never downgrades');
    expect(help).toContain('`npm update` only moves the dependency');
    expect(help).toContain('--complete <operation-id>');
  });

  it('lists upgrade in the top-level usage', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await run(['--help']);
    expect(String(log.mock.calls[0][0])).toContain('blueprint upgrade   Move the repository');
  });

  it('treats the --complete value as a value and rejects unknown flags', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await run(['upgrade', '--to', '4.1.0'])).toBe(1);
    expect(String(error.mock.calls[0][0])).toContain('unknown flag for upgrade: --to');
  });

  it('dispatches to the upgrade runtime and reports its refusal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-upgrade-'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await run(['upgrade', '--complete', 'x', '--dry-run'], root)).toBe(1);
      expect(String(error.mock.calls[0][0])).toContain('cannot be combined with --dry-run');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('run · remove', () => {
  it('parses only --dry-run', () => {
    expect(parseRemoveArgs([])).toEqual({});
    expect(parseRemoveArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect([...KNOWN_FLAGS.remove]).toEqual(['--dry-run']);
  });

  it('prints its own help and appears in the top-level usage', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await run(['remove', '--help'])).toBe(0);
    expect(String(log.mock.calls[0][0])).toContain('blueprint remove — de-adopt Blueprint');

    await run(['--help']);
    expect(String(log.mock.calls[1][0])).toContain('blueprint remove    De-adopt Blueprint');
  });

  it('removes an adopted application through the CLI defaults', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-remove-adopted-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};\n');

      expect(await run(['remove'], root)).toBe(0);
      expect(fs.existsSync(path.join(root, 'blueprint.config.mjs'))).toBe(false);
      expect(String(log.mock.calls.at(-1)?.[0])).toContain('Blueprint removed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('dispatches to the remove runtime and reports its refusal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cli-remove-'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await run(['remove', '--dry-run'], root)).toBe(1);
      expect(String(error.mock.calls[0][0])).toContain('no adopted application was found');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
