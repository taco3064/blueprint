import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './bootstrap';
import { adoptionRecorder } from './lifecycle';
import { detect } from '../project';
import { digest } from '../lifecycle';
import { vuePreset } from '../presets';

let root: string;
let lines: string[];

const log = (line: string) => void lines.push(line);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-init-lifecycle-'));
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writePkg(content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(content));
}

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');
const lifecycle = () => JSON.parse(read('.blueprint-lifecycle.json'));
const created = (file: string) => ({ kind: 'created', path: file, sha256: digest(read(file)) });

const RECORD_NOTE = '.blueprint-lifecycle.json (Blueprint ownership records — '
  + 'upgrade and remove reverse only what these records prove)';

const ADOPTED_CONFIG = 'export default { framework: \'vue\', architecture: { alias: \'~app\', '
  + 'layers: [{ name: \'pages\', does: \'routes\' }] } };\n';

function expectLogged(fragment: string): void {
  expect(lines.some((line) => line.includes(fragment))).toBe(true);
}

function writeSources(): void {
  for (let index = 0; index < 12; index++) {
    fs.mkdirSync(path.join(root, 'src', `f${index}`), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', `f${index}`, 'index.ts'), 'export const x = 1;\n');
  }
}

describe('init lifecycle recording', () => {
  it('records the first adoption checkpoint and every proven ownership fact', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'docs/\n');

    await runInit(root, { topology: 'layer-first', exec: () => {}, log });

    const state = lifecycle();
    const provenance = state.applications['.'].provenance;

    expect(state)
      .toMatchObject({ schema: 1, provenance: 'complete', operations: [], pending: null });

    expect(provenance).toEqual(expect.arrayContaining([
      created('blueprint.config.mjs'),
      { kind: 'generated', path: 'docs/architecture-handbook.md' },
      { kind: 'section', path: 'CLAUDE.md', created: true },
      { kind: 'section', path: 'AGENTS.md', created: true },
      { kind: 'generated', path: 'eslint.config.mjs' },
      created('jsconfig.json'),
      { kind: 'directory', path: 'src/pages' },
      { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
      { kind: 'dependency', name: 'eslint' },
      { kind: 'dependency', name: '@kekkai/blueprint' },
      {
        kind: 'edit', path: '.gitignore', before: '',
        after: expect.stringContaining('!docs/architecture-handbook.md'),
      },
    ]));

    expectLogged('.blueprint-lifecycle.json (lifecycle checkpoint');
  });

  it('merges a repair run without duplicating or forgetting creation', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { topology: 'layer-first', install: false, log });
    const first = lifecycle();
    const loadConfig = async () => vuePreset({ name: 'demo' });

    await runInit(root, { install: false, log, loadConfig });
    const second = lifecycle();

    expect(second.blueprint).toBe(first.blueprint);
    expect(second.applications['.'].provenance).toEqual(first.applications['.'].provenance);
    expectLogged('Blueprint ownership records — upgrade and remove');
  });

  it('previews the lifecycle write on a dry run without writing it', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { topology: 'layer-first', dryRun: true, log });

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expect(lines).toContain(`  would write: ${RECORD_NOTE}`);
  });

  it('previews the lifecycle write on an authoring dry run too', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });
    writeSources();

    await runInit(root, { topology: 'layer-first', dryRun: true, log });

    expectLogged('would write: .blueprint-lifecycle.json');
  });

  it('records authoring handoff artifacts as Blueprint-generated', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });
    writeSources();

    await runInit(root, { topology: 'layer-first', exec: () => {}, log });

    expect(lifecycle().applications['.'].provenance).toEqual([
      { kind: 'generated', path: 'blueprint-authoring.md' },
      { kind: 'generated', path: '.claude/commands/blueprint-author.md' },
      { kind: 'dependency', name: '@kekkai/blueprint' },
    ]);
  });

  it('fails closed before any write when lifecycle state is unreadable', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.blueprint-lifecycle.json'), '{ nope');

    await expect(runInit(root, { topology: 'layer-first', install: false, log }))
      .rejects.toThrow('.blueprint-lifecycle.json is unreadable: it is not valid JSON.');

    expect(fs.existsSync(path.join(root, 'blueprint.config.mjs'))).toBe(false);
  });

  it('keeps ownership of actions that landed before an install failure', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await expect(runInit(root, {
      topology: 'layer-first',
      exec: () => {
        throw new Error('offline');
      },
      log,
    })).rejects.toThrow('offline');

    expect(lifecycle().applications['.'].provenance)
      .toContainEqual({ kind: 'generated', path: 'docs/architecture-handbook.md' });
  });

  it('explains why an adopted repository without a provable checkpoint '
    + 'was not recorded', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), ADOPTED_CONFIG);

    await runInit(root, { install: false, log });

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expectLogged('Lifecycle state not recorded — the installed @kekkai/blueprint version');
  });
});

describe('adoption recorder', () => {
  it.each([
    [`blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`, '3.2.0'],
    [`old.blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`, '4.1.0'],
    [`blueprint.config.mjs.pre-v4-${'a'.repeat(64)}.bak`, '4.1.0'],
  ])('dates an unrecorded adoption beside %s from %s', (backup, version) => {
    writePkg({ name: 'demo' });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), ADOPTED_CONFIG);
    fs.writeFileSync(path.join(root, backup), ADOPTED_CONFIG);
    fs.mkdirSync(path.join(root, 'node_modules/@kekkai/blueprint'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'node_modules/@kekkai/blueprint/package.json'),
      JSON.stringify({ name: '@kekkai/blueprint', version: '4.1.0' }),
    );

    const recorder = adoptionRecorder(root, detect(root), []);

    recorder.landed({ kind: 'mkdir', path: 'src/pages', note: 'x' as never });
    recorder.finish(log);

    expect(lifecycle()).toMatchObject({ blueprint: version, provenance: 'partial' });
  });

  it('diffs a later write to the same file against the earlier write', () => {
    writePkg({ name: 'demo' });

    const actions = [
      { kind: 'write', path: 'notes.txt', content: 'one\n', note: 'x' as never },
      { kind: 'write', path: 'notes.txt', content: 'one\ntwo\n', note: 'x' as never },
    ] as const;

    const recorder = adoptionRecorder(root, detect(root), actions);

    actions.forEach((action) => recorder.landed(action));
    recorder.finish(log);

    expect(lifecycle().applications['.'].provenance).toEqual([
      { kind: 'created', path: 'notes.txt', sha256: digest('one\n') },
      { kind: 'edit', path: 'notes.txt', before: '', after: 'two\n' },
    ]);
  });

  it('records nothing when no action landed and ignores instructions', () => {
    writePkg({ name: 'demo' });

    const recorder = adoptionRecorder(root, detect(root), []);

    recorder.landed({ kind: 'instruct', note: 'x' as never });
    recorder.finish(log);

    expect(lines).toEqual([]);

    recorder.landed({ kind: 'install', command: 'npm install', note: 'x' as never });
    recorder.finish(log);

    expect(lines).toHaveLength(1);
    expect(lifecycle().applications['.'].provenance).toEqual([]);
  });
});
