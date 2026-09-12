import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import {
  cli,
  configSource,
  makeRepo,
  read,
  rm,
  wiredEslintConfig,
  write,
} from './conformance';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) {
    rm(roots.pop() as string);
  }
});

const blueprint: Blueprint = {
  name: 'live-lint-fixture',
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'data access' },
    ],
  },
  emit: { agents: [] },
  rules: {},
};

const lintOnlyRules = '  { files: ["**/*.js"], rules: { '
  + '"no-debugger": "error", '
  + '"no-warning-comments": ["warn", { terms: ["TODO"], location: "anywhere" }] '
  + '} },';

function fixture(): string {
  const root = makeRepo({
    packageJson: {
      name: 'live-lint-fixture',
      scripts: { lint: 'eslint src --max-warnings=0' },
      dependencies: { react: '^19' },
      devDependencies: { eslint: '^9' },
    },
    files: {
      'blueprint.config.mjs': configSource(blueprint),
      'eslint.config.mjs': wiredEslintConfig(blueprint, lintOnlyRules),
      'jsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~app/*': ['./src/*'] } },
      }),
      'src/legacy/old.js': 'debugger;\n',
    },
  });

  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.symlinkSync(eslintRoot(), path.join(root, 'node_modules/eslint'), 'junction');

  roots.push(root);

  return root;
}

function suppress(root: string): void {
  const executable = path.join(eslintRoot(), 'bin/eslint.js');

  const result = spawnSync(process.execPath, [executable, 'src', '--suppress-all'], {
    cwd: root,
    encoding: 'utf-8',
  });

  expect(result.status, result.stderr).toBe(0);
}

function eslintRoot(): string {
  return path.dirname(createRequire(import.meta.url).resolve('eslint/package.json'));
}

function snapshot(root: string, relative = ''): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, item.name);

    if (item.name === 'node_modules') {
      continue;
    }

    if (item.isDirectory()) {
      Object.assign(entries, snapshot(root, name));
    } else {
      entries[name] = fs.readFileSync(path.join(root, name), 'utf-8');
    }
  }

  return entries;
}

describe('doctor · architecture baseline × native eslint ledger', () => {
  it('never lets either ledger hide new debt owned by the other', async () => {
    const root = fixture();

    await expectArchitectureBaselineCannotHideLint(root);
    await expectBothLedgersCurrent(root);
    await expectNewLintOnlyDebtCrossesLedgers(root);
  });

  it('does not replay argv hidden behind a shell comment as a narrower green lint', async () => {
    const root = fixture();

    fs.rmSync(path.join(root, 'src/legacy'), { recursive: true, force: true });
    write(root, 'src/components/clean.js', 'export const clean = true;\n');
    write(root, 'src/components/hidden.js', 'debugger;\n');

    write(root, 'package.json', JSON.stringify({
      name: 'live-lint-fixture',
      scripts: {
        lint: 'eslint # --no-error-on-unmatched-pattern src/components/clean.js',
      },
      dependencies: { react: '^19' },
      devDependencies: { eslint: '^9' },
    }));

    const npmCli = process.env.npm_execpath;

    expect(npmCli).toBeTruthy();

    const native = spawnSync(process.execPath, [npmCli as string, 'run', 'lint'], {
      cwd: root,
      encoding: 'utf-8',
    });

    const doctor = await cli(root, ['doctor']);

    expectNativeShellComment(native);

    expect(doctor.code).toBe(0);
    expect(doctor.output).toContain('⊘ reachable eslint leg passes live');
    expect(doctor.output).toContain('⊘ Adoption unverified');
    expect(doctor.output).not.toContain('Adoption complete');
  });

  it('does not replay a Windows environment expansion as a literal green target', async () => {
    const root = fixture();

    fs.rmSync(path.join(root, 'src/legacy'), { recursive: true, force: true });
    write(root, 'src/hidden.js', 'debugger;\n');

    write(root, 'package.json', JSON.stringify({
      name: 'live-lint-fixture',
      scripts: {
        lint: 'eslint %BP_LINT_TARGET% --no-error-on-unmatched-pattern',
      },
      dependencies: { react: '^19' },
      devDependencies: { eslint: '^9' },
    }));

    const npmCli = process.env.npm_execpath;

    expect(npmCli).toBeTruthy();

    const native = spawnSync(process.execPath, [npmCli as string, 'run', 'lint'], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, BP_LINT_TARGET: 'src' },
    });

    const doctor = await cli(root, ['doctor']);

    expect(native.status).toBe(process.platform === 'win32' ? 1 : 0);

    if (process.platform === 'win32') {
      expect(native.stdout).toContain('hidden.js');
    }

    expect(doctor.code).toBe(0);
    expect(doctor.output).toContain('⊘ reachable eslint leg passes live');
    expect(doctor.output).toContain('⊘ Adoption unverified');
    expect(doctor.output).not.toContain('Adoption complete');
  });

  it('does not replay shell grouping syntax as a literal green target', async () => {
    const root = fixture();

    fs.rmSync(path.join(root, 'src/legacy'), { recursive: true, force: true });

    write(root, 'package.json', JSON.stringify({
      name: 'live-lint-fixture',
      scripts: {
        lint: 'eslint (src) --no-error-on-unmatched-pattern',
      },
      dependencies: { react: '^19' },
      devDependencies: { eslint: '^9' },
    }));

    const npmCli = process.env.npm_execpath;

    expect(npmCli).toBeTruthy();

    const native = spawnSync(process.execPath, [npmCli as string, 'run', 'lint'], {
      cwd: root,
      encoding: 'utf-8',
    });

    const doctor = await cli(root, ['doctor']);

    if (process.platform === 'win32') {
      expect(native.status).toBe(0);
    } else {
      expect(native.status).not.toBe(0);
    }

    expect(doctor.code).toBe(0);
    expect(doctor.output).toContain('⊘ reachable eslint leg passes live');
    expect(doctor.output).toContain('⊘ Adoption unverified');
    expect(doctor.output).not.toContain('Adoption complete');
  });
});

function expectNativeShellComment(native: { status: number | null; stdout: string }): void {
  expect(native.status).toBe(process.platform === 'win32' ? 0 : 1);

  if (process.platform !== 'win32') {
    expect(native.stdout).toContain('hidden.js');
  }
}

async function expectArchitectureBaselineCannotHideLint(root: string): Promise<void> {
  expect((await cli(root, ['inspect', '--update-baseline'])).code).toBe(0);
  expect(read(root, '.blueprint-baseline.json')).toContain('undeclared-folder');

  const result = await cli(root, ['doctor']);

  expect(result.code).toBe(1);
  expect(result.output).toContain('✓ architecture clean (findings covered');
  expect(result.output).toContain('✓ lint suppressions ledger current (not in use)');
  expect(result.output).toContain('✗ reachable eslint leg passes live');
}

async function expectBothLedgersCurrent(root: string): Promise<void> {
  suppress(root);

  const result = await cli(root, ['doctor']);

  expect(result.code).toBe(0);
  expect(result.output).toContain('✓ Adoption complete — all 9 checks passed');
}

async function expectNewLintOnlyDebtCrossesLedgers(root: string): Promise<void> {
  write(root, 'src/components/new.js', '// TODO new lint-only debt\nexport const x = 1;\n');
  const before = snapshot(root);
  const text = await cli(root, ['doctor']);
  const json = await cli(root, ['doctor', '--json']);

  expect(text.code).toBe(1);
  expect(text.output).toContain('✓ architecture clean (findings covered');
  expect(text.output).toContain('✓ lint suppressions ledger current');
  expect(text.output).toContain('✗ reachable eslint leg passes live');
  expect(text.output).toContain('0 error(s), 1 warning(s)');
  expect(json.code).toBe(1);

  expect(JSON.parse(json.output)).toMatchObject({
    ok: false,
    verdict: 'incomplete',
    counts: { total: 9, failed: 1, skipped: 0 },
  });

  expect(snapshot(root)).toEqual(before);
}
