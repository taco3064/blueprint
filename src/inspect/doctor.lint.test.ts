import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { assessLintEntrypoint } from '../project';
import { runDoctor } from './doctor';
import { liveLintCheck } from './doctor-lint';
import type { LiveLintEvidence } from './lint-runtime';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-lint-'));
  spawnSync('git', ['init'], { cwd: root });
  write('blueprint.config.mjs', '// fixture');
  write('eslint.config.mjs', 'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];');

  write('tsconfig.json', JSON.stringify({
    compilerOptions: { paths: { '~app/*': ['./src/*'] } },
  }));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  const file = path.join(root, relative);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

async function lintCheck(
  scripts?: Record<string, string>,
  runLint?: () => LiveLintEvidence,
) {
  write('package.json', JSON.stringify({
    name: 'x',
    ...(scripts ? { scripts } : {}),
    dependencies: { vue: '^3' },
  }));

  const result = await runDoctor(root, {
    loadConfig: async () => vuePreset(),
    ...(runLint ? { runLint } : {}),
    log: () => {},
  });

  return {
    result,
    check: result.checks.find((entry) => entry.label.includes('normal lint')),
  };
}

describe('runDoctor · normal lint reachability', () => {
  it('keeps adoption incomplete when the normal lint path cannot reach eslint', async () => {
    const { result, check } = await lintCheck({ lint: 'oxlint' });
    const live = result.checks.find((entry) => entry.label.includes('passes live'));

    expect(result.verdict).toBe('incomplete');

    expect(check).toEqual({
      label: 'normal lint entrypoint reaches eslint',
      ok: false,
      detail: 'package.json lint runs `oxlint`, but no reachable delegated script runs eslint — '
        + 'wire eslint into lint or an ordinary npm/pnpm/yarn script it calls',
    });

    expect(live).toEqual({
      label: 'reachable eslint leg passes live (skipped — no reachable eslint leg)',
      ok: true,
      skipped: 'the normal lint entrypoint check above is the red for that',
    });
  });

  it('does not ask a live executor to run an unreachable lint path', async () => {
    let calls = 0;

    await lintCheck({ lint: 'oxlint' }, () => {
      calls++;

      return { status: 'passed', command: 'eslint .', errors: 0, warnings: 0 };
    });

    expect(calls).toBe(0);
  });

  it('keeps adoption incomplete when package.json has no lint entrypoint', async () => {
    const { result, check } = await lintCheck();

    expect(result.verdict).toBe('incomplete');

    expect(check).toEqual({
      label: 'normal lint entrypoint reaches eslint',
      ok: false,
      detail: 'package.json has no `lint` script — add one that runs eslint so the generated '
        + 'architecture rules execute on the normal lint path',
    });
  });

  it('accepts a delegated normal lint path that reaches eslint', async () => {
    const { check } = await lintCheck({
      lint: 'pnpm lint:code',
      'lint:code': 'eslint src',
    });

    expect(check).toEqual({ label: 'normal lint entrypoint reaches eslint', ok: true });
  });
});

describe('runDoctor · live eslint evidence', () => {
  it('makes a reachable native lint failure incomplete', async () => {
    const { result } = await lintCheck({ lint: 'eslint src' }, () => ({
      status: 'failed',
      command: 'eslint src',
      errors: 1,
      warnings: 0,
      reason: 'the native ESLint gate failed',
    }));

    const check = result.checks.find((entry) => entry.label.includes('passes live'));

    expect(result.verdict).toBe('incomplete');

    expect(check).toEqual({
      label: 'reachable eslint leg passes live',
      ok: false,
      detail: '`eslint src` — 1 error(s), 0 warning(s); the native ESLint gate failed',
    });
  });

  it('marks unsafe reachable execution unverified without claiming it passed', async () => {
    const { result } = await lintCheck({ lint: 'eslint src --fix' }, () => ({
      status: 'unverified',
      command: 'eslint src --fix',
      errors: 0,
      warnings: 0,
      reason: 'unsafe option --fix',
    }));

    const check = result.checks.find((entry) => entry.label.includes('passes live'));

    expect(result.verdict).toBe('unverified');

    expect(check).toMatchObject({
      ok: true,
      skipped: '`eslint src --fix` — unsafe option --fix',
    });
  });

  it('renders adapter fallbacks without inventing missing evidence', () => {
    const assessment = assessLintEntrypoint({ scripts: { lint: 'eslint .' } });

    expect(liveLintCheck({
      status: 'failed',
      command: 'eslint .',
      errors: 1,
      warnings: 0,
    }, assessment).detail).toContain('the native ESLint gate failed');

    expect(liveLintCheck({
      status: 'unverified',
      command: null,
      errors: 0,
      warnings: 0,
      reason: 'adapter unavailable',
    }, assessment).skipped).toBe('adapter unavailable');
  });
});
