import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LintEntrypointAssessment } from '../project';
import { runLiveLint } from './lint-runtime';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

let root: string;

const assessment: LintEntrypointAssessment = {
  reachable: true,
  entrypoint: 'eslint .',
  scriptPath: ['lint'],
  eslint: { command: 'eslint .', args: ['.'] },
  reason: 'eslint-reachable',
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-live-failure-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.mkdirSync(path.join(root, 'node_modules'));

  fs.symlinkSync(
    path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')),
    path.join(root, 'node_modules/eslint'),
    'junction',
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.resetAllMocks();
});

function result(input: Record<string, unknown>): void {
  vi.mocked(spawnSync).mockReturnValue(input as unknown as ReturnType<typeof spawnSync>);
}

describe('runLiveLint · untrustworthy process evidence', () => {
  it('does not resolve or execute when static reachability supplies no eslint leg', () => {
    for (const unreachable of [
      { ...assessment, reachable: false },
      { ...assessment, eslint: null },
    ]) {
      expect(runLiveLint(root, ['eslint'], unreachable)).toMatchObject({
        status: 'unverified',
        command: null,
      });
    }

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('keeps spawn errors and missing numeric status unverified', () => {
    result({ error: new Error('spawn failed'), status: null });

    expect(runLiveLint(root, ['eslint'], assessment)).toMatchObject({
      status: 'unverified',
      reason: 'spawn failed',
    });

    result({ status: null });

    expect(runLiveLint(root, ['eslint'], assessment)).toMatchObject({
      status: 'unverified',
      reason: 'eslint ended without a numeric exit status',
    });
  });

  it('keeps every malformed success report unverified', () => {
    for (const stdout of [
      'not json',
      '{}',
      '[null]',
      '[{}]',
      '[{"errorCount":-1,"warningCount":0}]',
      '[{"errorCount":1e400,"warningCount":0}]',
      '[{"errorCount":null,"warningCount":0}]',
      '[{"errorCount":0,"warningCount":null}]',
    ]) {
      result({ status: 0, stdout, stderr: '' });
      expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
    }
  });

  it('makes a numeric non-lint exit incomplete even without stderr', () => {
    result({ status: 2, stdout: '', stderr: null });

    expect(runLiveLint(root, ['eslint'], assessment)).toMatchObject({
      status: 'failed',
      reason: 'eslint exited 2',
    });
  });

  it('passes exact argv before the sentinel and keeps shell execution disabled', () => {
    result({ status: 0, stdout: '[]', stderr: '' });

    const withSentinel = {
      ...assessment,
      eslint: { command: 'eslint src -- --fix', args: ['src', '--', '--fix'] },
    };

    expect(runLiveLint(root, ['eslint'], withSentinel).status).toBe('passed');

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('eslint'), 'src', '--format', 'json', '--', '--fix'],
      expect.objectContaining({ shell: false, timeout: 120_000 }),
    );

    const leadingSentinel = {
      ...assessment,
      eslint: { command: 'eslint -- --fix', args: ['--', '--fix'] },
    };

    expect(runLiveLint(root, ['eslint'], leadingSentinel).status).toBe('passed');

    vi.mocked(spawnSync).mockClear();

    const withoutSentinel = {
      ...assessment,
      eslint: {
        command: 'eslint src --max-warnings=0',
        args: ['src', '--max-warnings=0'],
      },
    };

    expect(runLiveLint(root, ['eslint'], withoutSentinel).status).toBe('passed');

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('eslint'), 'src', '--max-warnings=0', '--format', 'json'],
      expect.any(Object),
    );
  });

  it('does not mistake an option-looking filename for an output option', () => {
    result({ status: 0, stdout: '[]', stderr: '' });

    const filename = {
      ...assessment,
      eslint: { command: 'eslint foo-oops.js', args: ['foo-oops.js'] },
    };

    expect(runLiveLint(root, ['eslint'], filename).status).toBe('passed');
  });
});

describe('runLiveLint · resolution fallbacks', () => {
  it('does not borrow eslint when a declared local package cannot resolve', () => {
    fs.unlinkSync(path.join(root, 'node_modules/eslint'));

    expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
  });

  it('uses generic unsafe detail when the parser supplied none', () => {
    const unparsed = {
      ...assessment,
      eslint: { command: 'eslint .', args: null },
    };

    expect(runLiveLint(root, ['eslint'], unparsed).reason)
      .toBe('the eslint invocation could not be parsed safely');
  });

  it.each([
    'bin/eslint.js',
    null,
    {},
  ])('rejects malformed project-local eslint bin metadata: %j', (bin) => {
    fs.unlinkSync(path.join(root, 'node_modules/eslint'));
    fs.mkdirSync(path.join(root, 'node_modules/eslint'));

    fs.writeFileSync(
      path.join(root, 'node_modules/eslint/package.json'),
      JSON.stringify({ name: 'eslint', bin }),
    );

    expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
  });

  it.each([
    { name: 'not-eslint', bin: { eslint: 'bin/eslint.js' } },
    { name: 'eslint', bin: { eslint: '/tmp/eslint.js' } },
  ])('rejects an untrusted project-local eslint manifest: %j', (manifest) => {
    fs.unlinkSync(path.join(root, 'node_modules/eslint'));
    fs.mkdirSync(path.join(root, 'node_modules/eslint/bin'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'node_modules/eslint/package.json'),
      JSON.stringify(manifest),
    );

    fs.writeFileSync(path.join(root, 'node_modules/eslint/bin/eslint.js'), 'console.log("[]")');

    expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
