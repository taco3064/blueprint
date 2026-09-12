import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assessLintEntrypoint } from '../project';
import { runLiveLint } from './lint-runtime';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-live-lint-'));
  fs.mkdirSync(path.join(root, 'node_modules'));

  fs.symlinkSync(
    path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')),
    path.join(root, 'node_modules/eslint'),
    'junction',
  );

  write('package.json', JSON.stringify({ name: 'fixture', devDependencies: { eslint: '^9' } }));

  write('eslint.config.mjs', [
    'export default [{',
    '  files: ["**/*.js"],',
    '  rules: {',
    '    "no-debugger": "error",',
    '    "no-warning-comments": ["warn", { terms: ["todo"], location: "anywhere" }]',
    '  }',
    '}];',
  ].join('\n'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  fs.writeFileSync(path.join(root, relative), content);
}

function run(args: string, dependencies = ['eslint']) {
  const assessment = assessLintEntrypoint({ scripts: { lint: `eslint ${args}` } });

  return runLiveLint(root, dependencies, assessment);
}

function files(): Record<string, string> {
  return Object.fromEntries(
    fs.readdirSync(root)
      .filter((name) => name !== 'node_modules')
      .map((name) => [name, fs.readFileSync(path.join(root, name), 'utf-8')]),
  );
}

describe('runLiveLint', () => {
  it('reports the real project-local eslint result and preserves max-warnings', () => {
    write('clean.js', 'export const answer = 42;\n');

    expect(run('clean.js')).toEqual({
      status: 'passed',
      command: 'eslint clean.js',
      errors: 0,
      warnings: 0,
    });

    write('debt.js', 'debugger; // TODO later\n');

    expect(run('debt.js')).toMatchObject({
      status: 'failed',
      errors: 1,
      warnings: 1,
      reason: 'the native ESLint gate failed',
    });

    write('warning.js', '// TODO later\nexport const answer = 42;\n');

    expect(run('warning.js --max-warnings=0')).toMatchObject({
      status: 'failed',
      errors: 0,
      warnings: 1,
    });
  });

  it('fails closed when local ownership or safe argv cannot be proven', () => {
    write('clean.js', 'export const answer = 42;\n');

    expect(run('clean.js', [])).toMatchObject({
      status: 'unverified',
      reason: expect.stringContaining('declared project-local eslint'),
    });

    for (const option of [
      '--fix', '--cache=true', '--cache-file=.cache', '--output-file=report.json',
      '-h', '-v', '-o', '-oreport.json', '-f', '-fjson', '--quiet', '--inspect-config', '--mcp',
    ]) {
      expect(run(`clean.js ${option}`)).toMatchObject({
        status: 'unverified',
        reason: expect.stringContaining(option),
      });
    }
  });

  it('treats a numeric eslint configuration or argv failure as incomplete evidence', () => {
    write('clean.js', 'export const answer = 42;\n');

    expect(run('clean.js --definitely-invalid')).toMatchObject({
      status: 'failed',
      reason: expect.stringMatching(/Invalid option|eslint exited 2/),
    });
  });

  it('does not run compound script segments or mutate project bytes', () => {
    write('clean.js', 'export const answer = 42;\n');

    const assessment = assessLintEntrypoint({
      scripts: { lint: 'node touch.js && eslint clean.js' },
    });

    const before = files();

    expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
    expect(runLiveLint(root, ['eslint'], assessment).status).toBe('unverified');
    expect(fs.existsSync(path.join(root, 'touched'))).toBe(false);
    expect(files()).toEqual(before);
  });

  it('does not follow an eslint bin path or symlink outside its package', () => {
    fs.rmSync(path.join(root, 'node_modules/eslint'), { recursive: true, force: true });
    fs.mkdirSync(path.join(root, 'node_modules/eslint/bin'), { recursive: true });

    const unrelated = path.join(root, 'unrelated.mjs');

    write('unrelated.mjs', [
      'import fs from "node:fs";',
      'fs.writeFileSync(new URL("./touched", import.meta.url), "written");',
      'console.log("[]");',
    ].join('\n'));

    for (const bin of ['../../unrelated.mjs', 'bin/eslint.js']) {
      write('node_modules/eslint/package.json', JSON.stringify({
        name: 'eslint',
        bin: { eslint: bin },
      }));

      if (bin.startsWith('bin/')) {
        fs.symlinkSync(unrelated, path.join(root, 'node_modules/eslint/bin/eslint.js'));
      }

      expect(run('clean.js')).toMatchObject({ status: 'unverified' });
      expect(fs.existsSync(path.join(root, 'touched'))).toBe(false);
    }
  });

  it('keeps option-like targets after the sentinel in the lint argv', () => {
    write('--target.js', 'debugger;\n');

    expect(run('-- --target.js')).toMatchObject({ status: 'failed', errors: 1 });
  });
});
