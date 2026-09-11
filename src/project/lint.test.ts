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
      'lint:two': 'npx eslint src',
    }))).toMatchObject({
      reachable: true,
      entrypoint: 'npm run lint:one',
      scriptPath: ['lint', 'lint:one', 'lint:two'],
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
      reason: 'missing-lint',
    });

    expect(assessLintEntrypoint(pkg({ lint: 'npm run missing' }))).toEqual({
      reachable: false,
      entrypoint: 'npm run missing',
      scriptPath: ['lint'],
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
});
