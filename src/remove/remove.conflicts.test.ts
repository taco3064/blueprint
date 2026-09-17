import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from '../bootstrap';
import { vuePreset } from '../presets';
import { runRemove } from './remove';
import type { RemoveOptions } from './remove';

let root: string;
let lines: string[];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-conflict-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');
const write = (file: string, text: string) => fs.writeFileSync(path.join(root, file), text);

async function adopt(): Promise<void> {
  write('package.json', JSON.stringify({ name: 'demo', dependencies: { vue: '^3' } }));
  write('.gitignore', 'docs/\n');
  await runInit(root, { topology: 'layer-first', install: false, log: () => {} });
}

function remove(patch: Partial<RemoveOptions> = {}): Promise<number> {
  return runRemove(root, {
    log: (line) => void lines.push(line),
    loadConfig: async () => vuePreset({ name: 'demo' }),
    exec: () => {},
    ...patch,
  });
}

function tree(): string[] {
  const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? walk(path.join(directory, entry.name))
      : [`${path.relative(root, path.join(directory, entry.name))}:${fs.readFileSync(path.join(directory, entry.name), 'utf-8').length}`]);

  return walk(root).sort();
}

describe('runRemove · all-or-nothing ownership preflight', () => {
  it('previews the complete plan on a dry run without changing anything', async () => {
    await adopt();

    const before = tree();

    expect(await remove({ dryRun: true })).toBe(0);
    expect(tree()).toEqual(before);

    const plan = lines.join('\n');

    expect(plan).toContain('Blueprint remove — dry run (nothing was changed)');
    expect(plan).toContain('Scope: `.` — the whole repository');

    expect(plan).toContain('Ownership evidence: lifecycle records prove '
      + 'every Blueprint-owned file');

    expect(plan).toContain('− delete docs/architecture-handbook.md (Blueprint-generated output)');

    expect(plan).toContain('− delete CLAUDE.md (Blueprint-managed section; content outside the '
      + 'markers is kept)');

    expect(plan).toContain('− rewrite .gitignore (reverses the exact recorded Blueprint edit)');
    expect(plan).toContain('− delete .blueprint-lifecycle.json (Blueprint lifecycle state)');
    expect(plan).toContain('Next: re-run without --dry-run to apply this plan.');
  });

  it('refuses before any change while a user-owned file still wires Blueprint', async () => {
    await adopt();

    write(
      'eslint.config.mjs',
      'import { emitLint } from \'@kekkai/blueprint\';\nexport default [];\n',
    );

    write(
      'vite.config.ts',
      'import config from \'./blueprint.config.mjs\';\nexport default config;\n',
    );

    const packageJson = JSON.parse(read('package.json'));

    packageJson.scripts.arch = 'npx blueprint inspect --baseline';
    write('package.json', JSON.stringify(packageJson));

    const before = tree();

    await expect(remove()).rejects.toThrow('remove stopped before changing anything: '
      + '3 ownership conflict(s)');

    expect(tree()).toEqual(before);

    const error = await remove().catch((failure: Error) => failure.message);

    expect(error).toContain('✗ package.json: script "arch" still runs Blueprint');
    expect(error).toContain('✗ eslint.config.mjs: still imports @kekkai/blueprint');

    expect(error).toContain('✗ vite.config.ts: still loads a blueprint.config.mjs '
      + 'that removal deletes');
  });

  it('refuses diverged recorded edits instead of guessing', async () => {
    await adopt();

    const packageJson = JSON.parse(read('package.json'));

    packageJson.scripts.lint = 'eslint src --max-warnings 0';
    write('package.json', JSON.stringify(packageJson));
    write('.gitignore', `${read('.gitignore')}${read('.gitignore')}`);
    write('AGENTS.md', `${read('AGENTS.md')}<!-- BLUEPRINT:START -->\n`);

    const error = await remove().catch((failure: Error) => failure.message);

    expect(error).toContain('✗ package.json: scripts.lint is "eslint src --max-warnings 0", '
      + 'not the value Blueprint wrote ("eslint src")');

    expect(error).toContain('✗ .gitignore: text Blueprint inserted now appears 2 times');

    expect(error).toContain('✗ AGENTS.md: its BLUEPRINT:START/END markers are unbalanced '
      + 'or repeated');

    expect(fs.existsSync(path.join(root, 'blueprint.config.mjs'))).toBe(true);
  });

  it('refuses an unreadable recorded manifest', async () => {
    await adopt();
    write('package.json', '{ broken');

    await expect(remove()).rejects.toThrow('✗ package.json: not valid JSON');
  });

  it('proceeds when the user already restored the pre-Blueprint value by hand', async () => {
    await adopt();

    const packageJson = JSON.parse(read('package.json'));

    delete packageJson.scripts.lint;
    write('package.json', JSON.stringify(packageJson));

    expect(await remove()).toBe(0);

    expect(JSON.parse(read('package.json')))
      .toEqual({ name: 'demo', dependencies: { vue: '^3' }, scripts: {} });
  });
});
