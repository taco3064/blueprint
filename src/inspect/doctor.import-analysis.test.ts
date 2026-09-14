import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vuePreset } from '../presets';
import { runDoctor } from './doctor';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-doctor-import-analysis-'));
  spawnSync('git', ['init'], { cwd: root });

  write('package.json', JSON.stringify({
    name: 'x', scripts: { lint: 'eslint .' }, dependencies: { vue: '^3' },
  }));

  write('blueprint.config.mjs', '// user config');

  write(
    'eslint.config.mjs',
    'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];',
  );

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

describe('runDoctor import-analysis authority', () => {
  it('cannot report adoption complete when every scanned AST parse fails', async () => {
    write('src/components/Broken.ts', 'const broken: = 1;');
    let output = '';

    const result = await runDoctor(root, {
      loadConfig: async () => vuePreset(),
      log: (message) => (output = message),
    });

    const architecture = result.checks.find((check) => check.label.includes('architecture'));

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('incomplete');

    expect(architecture).toMatchObject({
      label: 'architecture nets clean; import analysis failed',
      ok: false,
    });

    expect(architecture?.detail).toContain('1/1 source files inside architecture nets');
    expect(architecture?.detail).toContain('import analysis failed (0/1 scanned files parsed)');
    expect(output).toContain('Adoption incomplete');
    expect(output).not.toContain('Adoption complete');
  });
});
