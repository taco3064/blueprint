import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseInitArgs, run } from './main';

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
});
