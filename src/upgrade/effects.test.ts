import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInspect } from '../inspect';
import {
  defaultHandoff,
  defaultReconciler,
  verificationPassed,
  verifyApplication,
} from './effects';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upgrade-effects-'));
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('gates inspect on the recorded baseline, lists doctor skips, and prints nothing', async () => {
    adopt();
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src/components/Button.ts'),
      'import { x } from \'../../outside\';\nexport const y = x;\n',
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const before = await verifyApplication(root, '.');

    await runInspect(root, { updateBaseline: true, log: () => {} });

    const after = await verifyApplication(root, '.');

    expect(log).not.toHaveBeenCalled();
    expect(before.inspect).toEqual({ ok: false, findings: 1 });

    expect(after).toEqual({
      application: '.',
      inspect: { ok: true, findings: 0 },
      doctor: {
        verdict: 'incomplete',
        failed: ['eslint wired to emitLint'],
        skipped: [
          'normal lint entrypoint reaches eslint',
          'reachable eslint leg passes live (skipped — no reachable eslint leg)',
          'emitted rules survive the eslint config (skipped — eslint not wired)',
        ],
      },
    });
  });

  it('hands off to the installed bin with the upgrade command in the project', () => {
    const installed = path.join(root, 'node_modules/@kekkai/blueprint');
    const cwd = JSON.stringify(fs.realpathSync(root));
    const script = `process.exit(process.argv[2] === 'upgrade' && process.cwd() === ${cwd} ? 0 : 3);\n`;

    fs.mkdirSync(path.join(installed, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(installed, 'dist/bin.js'), script);
    fs.writeFileSync(path.join(installed, 'dist/fail.js'), 'process.exit(5);\n');

    for (const bin of ['dist/bin.js', { blueprint: 'dist/bin.js' }]) {
      fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ bin }));

      expect(defaultHandoff({ root: installed, version: '4.1.0' }, root)).toBe(0);
    }

    fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ bin: 'dist/fail.js' }));

    expect(defaultHandoff({ root: installed, version: '4.1.0' }, root)).toBe(1);
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
