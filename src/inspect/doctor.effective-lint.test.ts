import { describe, expect, it, vi } from 'vitest';

import { assessLintEntrypoint } from '../project';
import type { ProjectState } from '../project';
import {
  ancestorLintCoversApplication,
  lintEntrypointCheck,
  measureEffectiveLint,
} from './doctor';

const pkg = (scripts: Record<string, string>) => ({ root: '/repo', scripts, dependencies: [] });

function state(rootScript: string): ProjectState {
  return {
    root: '/repo/apps/web', applicationRoot: '/repo/apps/web', toolchainRoot: '/repo',
    localPackage: pkg({}), toolchainPackage: pkg({ lint: rootScript }),
    framework: 'react', packageManager: 'npm', hasConfig: true, hasEslintConfig: true,
    eslintConfigRoot: '/repo', eslintBasePath: 'apps/web', hasNext: false, hasNuxt: false,
    nextRouter: null, nextSrcDir: false, wiredEslintConfig: true, hasViteConfig: false,
    hasTypescript: true, tsconfigs: {}, existingSrcDirs: [], missingDeps: [], dependencies: [],
  };
}

describe('Doctor effective nested-app lint context', () => {
  it('runs a covering ancestor entrypoint from the ancestor config root', () => {
    const run = vi.fn(() => ({
      status: 'passed' as const, command: 'eslint .', errors: 0, warnings: 0,
    }));

    const result = measureEffectiveLint({
      root: '/repo/apps/web', state: state('eslint .'), dependencies: ['eslint'], run,
    });

    expect(run).toHaveBeenCalledWith('/repo', ['eslint'], result.assessment);
    expect(result.evidence.status).toBe('passed');
  });

  it('runs an ordinarily delegated covering ancestor entrypoint', () => {
    const nested = state('npm run lint:code');

    nested.toolchainPackage.scripts['lint:code'] = 'eslint apps/web';

    const run = vi.fn(() => ({
      status: 'passed' as const, command: 'eslint apps/web', errors: 0, warnings: 0,
    }));

    const result = measureEffectiveLint({
      root: '/repo/apps/web', state: nested, dependencies: ['eslint'], run,
    });

    expect(run).toHaveBeenCalledWith('/repo', ['eslint'], result.assessment);
    expect(result.evidence.status).toBe('passed');
  });

  it('leaves an ancestor command unresolved when it does not cover the application', () => {
    const run = vi.fn();

    const result = measureEffectiveLint({
      root: '/repo/apps/web', state: state('eslint src'), dependencies: ['eslint'], run,
    });

    expect(run).not.toHaveBeenCalled();

    expect(result.evidence).toMatchObject({
      status: 'unverified',
      reason: expect.stringContaining('preserving the effective config and suppressions scope'),
    });
  });

  it('reports no command when the ancestor has no reachable ESLint leg', () => {
    const result = measureEffectiveLint({
      root: '/repo/apps/web', state: state('oxlint'), dependencies: ['eslint'],
    });

    expect(result.evidence).toMatchObject({ status: 'unverified', command: null });
  });

  it('keeps an opaque ancestor unverified while a local non-eslint command is incomplete', () => {
    const assessment = assessLintEntrypoint(pkg({ lint: 'vsh lint' }));
    const ancestor = lintEntrypointCheck(assessment, true);

    const local = lintEntrypointCheck(
      assessLintEntrypoint(pkg({ lint: 'oxlint' })),
      false,
    );

    expect(ancestor).toMatchObject({
      ok: true,
      skipped: expect.stringContaining('implementation Blueprint cannot inspect'),
    });

    expect(local).toMatchObject({ ok: false, detail: expect.stringContaining('oxlint') });

    const ancestorNonEslint = lintEntrypointCheck(
      assessLintEntrypoint(pkg({ lint: 'oxlint' })),
      true,
    );

    const localOpaque = lintEntrypointCheck(assessment, false);

    expect(ancestorNonEslint).toMatchObject({
      ok: false,
      detail: expect.stringContaining('oxlint'),
    });

    expect(localOpaque).toMatchObject({
      ok: false,
      detail: expect.stringContaining('vsh lint'),
    });
  });

  it.each([
    ['eslint .', 'apps/web', true],
    ['eslint apps/web', 'apps/web', true],
    ['eslint apps', 'apps/web', true],
    ['eslint src apps/web', 'apps/web', true],
    ['eslint apps/web/', 'apps/web/', true],
    ['eslint src', 'apps/web', false],
    ['eslint .', undefined, false],
  ] as const)('classifies coverage for %s / %s', (script, basePath, expected) => {
    expect(ancestorLintCoversApplication(assessLintEntrypoint(pkg({ lint: script })), basePath))
      .toBe(expected);
  });

  it('rejects an unreachable or unsafely parsed ancestor entrypoint', () => {
    expect(ancestorLintCoversApplication(assessLintEntrypoint(pkg({ lint: 'oxlint' })), 'apps/web'))
      .toBe(false);

    expect(ancestorLintCoversApplication(
      assessLintEntrypoint(pkg({ lint: 'eslint src && tsc' })), 'apps/web',
    )).toBe(false);

    expect(ancestorLintCoversApplication({
      reachable: true,
      eslint: { command: 'eslint', args: undefined },
    } as never, 'apps/web')).toBe(false);

    expect(ancestorLintCoversApplication({
      reachable: true,
      eslint: { command: 'eslint', args: ['apps/web/'] },
    } as never, 'apps/web')).toBe(true);

    expect(ancestorLintCoversApplication({
      reachable: true,
      eslint: { command: 'eslint', args: ['apps/platform/'] },
    } as never, 'apps/platform/web')).toBe(true);
  });
});
