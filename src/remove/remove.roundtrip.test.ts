import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from '../bootstrap';
import { nextPreset, reactPreset } from '../presets';
import { runRemove } from './remove';

const FIXTURES = fileURLToPath(new URL('../../fixtures/adoption', import.meta.url));

let root: string;
let lines: string[];

const log = (line: string) => void lines.push(line);

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-roundtrip-')));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function snapshot(directory = root): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    return entry.isDirectory()
      ? Object.entries(snapshot(full))
      : [[path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf-8')]];
  }));
}

function uninstallInManifest(command: string, cwd: string): void {
  const file = path.join(cwd, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const names = command.split(' ').slice(2);

  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of names) {
      delete manifest[section]?.[name];
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function installInManifest(command: string, cwd: string): void {
  const file = path.join(cwd, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));

  manifest.devDependencies = Object.fromEntries([
    ...Object.entries(manifest.devDependencies ?? {}),
    ...command.split(' ').slice(3).map((name) => [name, '*']),
  ]);

  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('before → init → remove', () => {
  it('restores every pre-existing file of a Vite React app and removes all Blueprint '
    + 'output', async () => {
    fs.cpSync(path.join(FIXTURES, 'vite-react-ts'), root, { recursive: true });

    const before = snapshot();
    const { 'package.json': manifest, ...files } = before;

    await runInit(root, { topology: 'layer-first', exec: installInManifest, log });

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(true);
    expect(snapshot()['vite.config.ts']).not.toBe(before['vite.config.ts']);

    lines = [];

    const commands: string[] = [];

    expect(await runRemove(root, {
      log,
      loadConfig: async () => reactPreset({ name: 'vite-react-ts' }),
      exec: (command, cwd) => {
        commands.push(command);
        uninstallInManifest(command, cwd);
      },
    })).toBe(0);

    const { 'package.json': restored, ...remaining } = snapshot();

    expect(remaining).toEqual(files);
    expect(JSON.parse(restored)).toEqual(JSON.parse(manifest));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatch(/^npm uninstall @kekkai\/blueprint eslint /);
    expect(lines.at(-1)).toContain('Blueprint removed: no proven Blueprint config');
  });

  it('keeps hand-written Agent documents untouched and removes only Blueprint '
    + 'references', async () => {
    fs.cpSync(path.join(FIXTURES, 'next-app'), root, { recursive: true });

    const { 'package.json': manifest, ...before } = snapshot();

    await runInit(root, { topology: 'layer-first', preset: true, install: false, log });

    expect(fs.existsSync(path.join(root, 'CLAUDE.blueprint.md'))).toBe(true);

    expect(await runRemove(root, {
      log,
      loadConfig: async () => nextPreset({ router: 'app', srcDir: true }),
      exec: () => {},
    })).toBe(0);

    const { 'package.json': restored, ...after } = snapshot();

    expect(after).toEqual(before);
    expect(JSON.parse(restored)).toEqual(JSON.parse(manifest));
  });
});
