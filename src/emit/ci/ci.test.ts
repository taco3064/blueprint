import { describe, expect, it } from 'vitest';

import { emitCi } from './ci';
import { vuePreset } from '../../presets';

describe('emitCi', () => {
  it('gates lint + inspect on push/PR, titled after the project', () => {
    const out = emitCi(vuePreset({ name: 'Acme' }));

    expect(out).toContain('name: Acme · Blueprint CI');
    expect(out).toContain('uses: actions/checkout@v4');
    expect(out).toContain('run: npm install');
    expect(out).toContain('run: npx eslint src');
    expect(out).toContain('run: npx blueprint inspect');
  });

  it('falls back to a bare title and adapts the install step to the package manager', () => {
    expect(emitCi(vuePreset())).toContain('name: Blueprint CI');

    expect(emitCi(vuePreset(), { packageManager: 'pnpm' })).toContain(
      'run: corepack enable && pnpm install',
    );

    expect(emitCi(vuePreset(), { packageManager: 'yarn' })).toContain(
      'run: corepack enable && yarn install',
    );
  });
});

describe('emitCi · dead-code step', () => {
  it('ships a commented knip step when deadCode is error-tier', () => {
    const out = emitCi(vuePreset()); // preset carries deadCode: 'error'

    expect(out).toContain('# - run: npx knip');
    expect(out).toContain('install knip and configure its');
  });

  it('omits the step when deadCode is absent or below error', () => {
    const bp = vuePreset();

    expect(emitCi({ ...bp, rules: { ...bp.rules, deadCode: 'warn' } })).not.toContain('knip');
    expect(emitCi({ ...bp, rules: {} })).not.toContain('knip');
  });
});
