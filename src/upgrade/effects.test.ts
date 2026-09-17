import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultReconciler, verificationPassed, verifyApplication } from './effects';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-effects-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = 'export default { framework: \'react\', architecture: { alias: \'~app\', '
  + 'layers: [{ name: \'components\', does: \'render UI\' }] } };\n';

function adopt(): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    dependencies: { react: '^18.0.0' },
    devDependencies: {
      eslint: '^9.0.0',
      '@kekkai/blueprint': '^4.0.0',
      '@eslint-community/eslint-plugin-eslint-comments': '^4.0.0',
      '@stylistic/eslint-plugin': '^5.0.0',
      'eslint-plugin-import-x': '^4.0.0',
    },
  }));

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), CONFIG);
}

describe('upgrade effects', () => {
  it('reconciles an adopted application through init', async () => {
    adopt();

    const lines: string[] = [];

    await defaultReconciler(root, (line) => void lines.push(line));

    expect(fs.existsSync(path.join(root, 'docs/architecture-handbook.md'))).toBe(true);
    expect(lines.join('\n')).toContain('docs/architecture-handbook.md');
  });

  it('reports inspect and doctor results without printing their reports', async () => {
    adopt();

    const result = await verifyApplication(root, '.');

    expect(result.application).toBe('.');
    expect(result.inspect).toEqual({ ok: true, findings: 1 });
    expect(result.doctor.verdict).toBe('incomplete');
    expect(result.doctor.failed).toEqual(['eslint wired to emitLint']);
    expect(verificationPassed(result)).toBe(false);
  });

  it('passes only when inspect passes and doctor is complete', () => {
    const passing = {
      application: '.',
      inspect: { ok: true, findings: 0 },
      doctor: { verdict: 'complete' as const, failed: [], skipped: [] },
    };

    expect(verificationPassed(passing)).toBe(true);
    expect(verificationPassed({ ...passing, inspect: { ok: false, findings: 1 } })).toBe(false);

    expect(verificationPassed({ ...passing, doctor: { ...passing.doctor, verdict: 'unverified' } }))
      .toBe(false);
  });
});
