import { describe, expect, it } from 'vitest';

import { renderDoctorCheck } from './doctor';

describe('renderDoctorCheck · alias consumers', () => {
  it('retains consumer evidence as structural JSON fields', () => {
    expect(renderDoctorCheck({
      kind: 'alias-consumer',
      sourceRoot: 'src',
      evidence: {
        consumer: 'typescript',
        status: 'verified',
        aliases: ['~app'],
        files: ['tsconfig.json'],
      },
    })).toEqual({
      label: 'import alias · typescript',
      ok: true,
      consumer: 'typescript',
      status: 'verified',
      aliases: ['~app'],
      files: ['tsconfig.json'],
    });
  });

  it.each([
    ['.', './*'],
    ['src', './src/*'],
  ])('renders the missing TypeScript alias relative to %s', (sourceRoot, target) => {
    const result = renderDoctorCheck({
      kind: 'alias-consumer',
      sourceRoot,
      evidence: {
        consumer: 'typescript', status: 'missing', aliases: ['~app'], files: ['tsconfig.json'],
      },
    });

    expect(result.detail).toBe(`"~app" is missing — declare compilerOptions.paths ("~app/*": ["${target}"])`);
    expect(result.ok).toBe(false);
  });

  it('explains non-applicability without implying unreadable configuration', () => {
    expect(renderDoctorCheck({
      kind: 'alias-consumer',
      sourceRoot: 'src',
      evidence: {
        consumer: 'package-subpath', status: 'not-applicable', aliases: ['~app'], files: [],
      },
    })).toEqual({
      label: 'import alias · package-subpath',
      ok: true,
      detail: 'the configured aliases are not package # subpaths',
      consumer: 'package-subpath', status: 'not-applicable', aliases: ['~app'], files: [],
    });
  });

  it('distinguishes a missing declaration from evidence that cannot be verified', () => {
    const missing = renderDoctorCheck({
      kind: 'alias-consumer',
      sourceRoot: 'src',
      evidence: {
        consumer: 'bundler-runtime',
        status: 'missing',
        aliases: ['~app'],
        files: ['vite.config.ts'],
      },
    });

    const unknown = renderDoctorCheck({
      kind: 'alias-consumer',
      sourceRoot: 'src',
      evidence: {
        consumer: 'test-runner',
        status: 'unverified',
        aliases: ['~app'],
        files: ['vitest.config.ts'],
        unreadable: ['vitest.config.ts'],
      },
    });

    expect(missing).toMatchObject({ ok: false, status: 'missing' });
    expect(unknown).toMatchObject({ ok: true, status: 'unverified' });
    expect(unknown.skipped).toContain('could not be read statically');
  });
});
