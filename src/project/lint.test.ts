import { describe, expect, it } from 'vitest';

import { assessLintEntrypoint } from './lint';

const pkg = (scripts: Record<string, string>) => ({ scripts });

describe('assessLintEntrypoint', () => {
  it('recognizes direct and ordinary delegated eslint paths', () => {
    expect(assessLintEntrypoint(pkg({ lint: 'eslint src' }))).toMatchObject({
      reachable: true,
      scriptPath: ['lint'],
    });

    for (const lint of ['npm run lint:code', 'pnpm lint:code', 'yarn run lint:code']) {
      expect(assessLintEntrypoint(pkg({ lint, 'lint:code': 'eslint .' }))).toMatchObject({
        reachable: true,
        scriptPath: ['lint', 'lint:code'],
      });
    }

    expect(assessLintEntrypoint(pkg({
      lint: 'npm run lint:one',
      'lint:one': 'yarn lint:two',
      'lint:two': 'npx eslint src --max-warnings=0',
    }))).toMatchObject({
      reachable: true,
      entrypoint: 'npm run lint:one',
      scriptPath: ['lint', 'lint:one', 'lint:two'],
      eslint: { args: ['src', '--max-warnings=0'] },
      reason: 'eslint-reachable',
    });

    expect(assessLintEntrypoint(pkg({
      lint: 'npm run dead && pnpm lint:code',
      dead: 'oxlint',
      'lint:code': 'eslint .',
    })).reachable).toBe(true);

    for (const lint of [
      'npm  run lint:code',
      'pnpm  run lint:code',
      'yarn  run lint:code',
      'npm run  lint:code',
    ]) {
      expect(assessLintEntrypoint(pkg({ lint, 'lint:code': 'eslint' }))).toMatchObject({
        reachable: true,
        scriptPath: ['lint', 'lint:code'],
        eslint: { args: [] },
      });
    }

    expect(assessLintEntrypoint(pkg({ lint: 'npx  eslint' })).reachable).toBe(true);
  });

  it('keeps absent, non-eslint, missing, and cyclic delegations incomplete', () => {
    const cases: Record<string, string>[] = [
      {},
      { lint: 'oxlint' },
      { lint: 'npm run missing' },
      { lint: 'pnpm lint:code', 'lint:code': 'pnpm lint' },
    ];

    for (const scripts of cases) {
      expect(assessLintEntrypoint(pkg(scripts)).reachable).toBe(false);
    }

    expect(assessLintEntrypoint(pkg({}))).toEqual({
      reachable: false,
      entrypoint: null,
      scriptPath: [],
      eslint: null,
      reason: 'missing-lint',
    });

    expect(assessLintEntrypoint(pkg({ lint: 'npm run missing' }))).toEqual({
      reachable: false,
      entrypoint: 'npm run missing',
      scriptPath: ['lint'],
      eslint: null,
      reason: 'eslint-unreachable',
    });
  });
});

describe('assessLintEntrypoint · command positions', () => {
  it.each([
    'fooeslint',
    'npxeslint src',
    'npx-eslint src',
    'eslintx src',
    'echo (fooeslint)',
    'echo eslint',
    'node scripts/check.js eslint',
    'echo "prepared; eslint src"',
    'echo escaped\\; eslint src',
    'eslint\\ src',
    'eslint"-plugin" src',
    ';;&|\n',
  ])('does not mistake `%s` for an eslint executable', (lint) => {
    expect(assessLintEntrypoint(pkg({ lint })).reachable).toBe(false);
  });

  it.each([
    'xnpm run lint:code',
    'npmrun lint:code',
    'pnpmrun lint:code',
    'yarnrun lint:code',
    'echo npm run lint:code',
    'node scripts/check.js pnpm lint:code',
    'echo "prepared && npm run lint:code"',
    'npm run lint:code$invalid',
  ])('does not mistake `%s` for ordinary script delegation', (lint) => {
    expect(assessLintEntrypoint(pkg({ lint, 'lint:code': 'eslint .' })).reachable).toBe(false);
  });

  it('preserves reachability when unrelated scripts and command order are added', () => {
    const direct = assessLintEntrypoint(pkg({
      lint: 'pnpm lint:code && pnpm lint:types',
      'lint:code': 'eslint src',
      'lint:types': 'tsc --noEmit',
    }));

    const extended = assessLintEntrypoint(pkg({
      build: 'vite build',
      'lint:types': 'tsc --noEmit',
      lint: 'pnpm lint:types && pnpm lint:code',
      test: 'vitest',
      'lint:code': 'eslint src',
    }));

    expect(direct.reachable).toBe(true);
    expect(extended.reachable).toBe(true);
    expect(extended.scriptPath).toEqual(['lint', 'lint:code']);
  });

  it('recognizes executables at the start of compound command segments', () => {
    expect(assessLintEntrypoint(pkg({ lint: 'echo prepare && eslint src' })).reachable)
      .toBe(true);

    expect(assessLintEntrypoint(pkg({ lint: 'echo escaped\\; value && eslint src' })).reachable)
      .toBe(true);

    expect(assessLintEntrypoint(pkg({ lint: 'echo "prepared; safely" && eslint src' })).reachable)
      .toBe(true);

    expect(assessLintEntrypoint(pkg({
      lint: 'echo prepare; npm run lint:code',
      'lint:code': 'eslint src',
    })).scriptPath).toEqual(['lint', 'lint:code']);
  });

  it.each([
    'echo \'prepared; eslint src\'',
    'echo `prepared; eslint src`',
  ])('keeps separators inside the quoted argument in `%s` inert', (lint) => {
    expect(assessLintEntrypoint(pkg({ lint })).reachable).toBe(false);
  });
});

describe('assessLintEntrypoint · deterministic paths', () => {
  it('keeps the first discovered path when two scripts delegate to the same target', () => {
    expect(assessLintEntrypoint(pkg({
      lint: 'pnpm lint:first && pnpm lint:second',
      'lint:first': 'pnpm lint:code',
      'lint:second': 'pnpm lint:code',
      'lint:code': 'eslint',
    })).scriptPath).toEqual(['lint', 'lint:first', 'lint:code']);
  });

  it('does not revisit lint through a delegated cycle and invent a second eslint leg', () => {
    const assessment = assessLintEntrypoint(pkg({
      lint: 'pnpm lint:cycle && eslint src',
      'lint:cycle': 'pnpm lint',
    }));

    expect(assessment.eslint?.unsafe)
      .toBe('other shell segments may change the eslint execution context');
  });
});

describe('assessLintEntrypoint · live execution plan', () => {
  it('preserves direct and delegated eslint arguments', () => {
    expect(assessLintEntrypoint(pkg({ lint: 'eslint "src/**/*.ts" --max-warnings=0' })).eslint)
      .toEqual({
        command: 'eslint "src/**/*.ts" --max-warnings=0',
        args: ['src/**/*.ts', '--max-warnings=0'],
      });

    expect(assessLintEntrypoint(pkg({
      lint: 'npm run lint:code -- --max-warnings=0',
      'lint:code': 'eslint src',
    })).eslint).toEqual({
      command: 'eslint src',
      args: ['src', '--max-warnings=0'],
    });

    for (const lint of ['pnpm lint:code --quiet', 'yarn lint:code --quiet']) {
      expect(assessLintEntrypoint(pkg({ lint, 'lint:code': 'eslint src' })).eslint?.args)
        .toEqual(['src', '--quiet']);
    }
  });

  it.each([
    ['eslint src/*.ts', 'shell expansion'],
    ['eslint src && tsc --noEmit', 'other shell segments'],
    ['cd packages/app && eslint .', 'other shell segments'],
    ['npm run lint:code --silent', 'could not be replayed'],
  ])('keeps `%s` statically reachable but live-unverified', (lint, reason) => {
    const scripts = { lint, 'lint:code': 'eslint src' };
    const assessment = assessLintEntrypoint(pkg(scripts));

    expect(assessment.reachable).toBe(true);
    expect(assessment.eslint?.args).toBeNull();
    expect(assessment.eslint?.unsafe).toContain(reason);
  });

  it('does not select one green eslint leg when several are reachable', () => {
    const assessment = assessLintEntrypoint(pkg({ lint: 'eslint src && eslint tests' }));

    expect(assessment.reachable).toBe(true);

    expect(assessment.eslint).toMatchObject({
      args: null,
      unsafe: 'multiple reachable eslint legs cannot be replayed as one lint gate',
    });
  });

  it.each([
    'eslint $FILES',
    'eslint src\\file.js',
    'eslint "unterminated',
    'eslint # --no-error-on-unmatched-pattern src/components/clean.js',
    'eslint %BP_LINT_TARGET% --no-error-on-unmatched-pattern',
    'eslint "%BP_LINT_TARGET%" --no-error-on-unmatched-pattern',
    'eslint ^--fix src',
  ])('does not manufacture argv for shell-dependent `%s`', (lint) => {
    const assessment = assessLintEntrypoint(pkg({ lint }));

    expect(assessment.reachable).toBe(true);
    expect(assessment.eslint?.args).toBeNull();
  });

  it('joins adjacent quoted and unquoted fragments without shell expansion', () => {
    expect(assessLintEntrypoint(pkg({ lint: 'eslint "src"/file.js' })).eslint?.args)
      .toEqual(['src/file.js']);

    expect(assessLintEntrypoint(pkg({ lint: 'eslint "src/#fixture.js"' })).eslint?.args)
      .toEqual(['src/#fixture.js']);
  });

  it('keeps unparseable delegated forwarding unverified', () => {
    const assessment = assessLintEntrypoint(pkg({
      lint: 'npm run lint:code $FILES',
      'lint:code': 'eslint src',
    }));

    expect(assessment.reachable).toBe(true);
    expect(assessment.eslint?.args).toBeNull();
  });
});
