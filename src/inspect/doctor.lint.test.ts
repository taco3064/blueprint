import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

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

async function lintCheck(scripts?: Record<string, string>) {
  write('package.json', JSON.stringify({
    name: 'x',
    ...(scripts ? { scripts } : {}),
    dependencies: { vue: '^3' },
  }));

  const result = await runDoctor(root, {
    loadConfig: async () => vuePreset(),
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

    expect(result.verdict).toBe('incomplete');

    expect(check).toEqual({
      label: 'normal lint entrypoint reaches eslint',
      ok: false,
      detail: 'package.json lint runs `oxlint`, but no reachable delegated script runs eslint — '
        + 'wire eslint into lint or an ordinary npm/pnpm/yarn script it calls',
    });
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
