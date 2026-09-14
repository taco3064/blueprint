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
    })).toMatchObject({
      ok: true,
      consumer: 'typescript',
      status: 'verified',
      aliases: ['~app'],
      files: ['tsconfig.json'],
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
