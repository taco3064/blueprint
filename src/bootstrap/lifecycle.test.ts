import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './bootstrap';
import { adoptionRecorder } from './lifecycle';
import { detect } from '../project';
import { digest, runningPackage } from '../lifecycle';
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

function git(...args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

function commit(message: string): void {
  git('add', '.');

  git(
    '-c',
    'user.name=Blueprint Test',
    '-c',
    'user.email=blueprint@example.invalid',
    'commit',
    '--quiet',
    '-m',
    message,
  );
}

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
      {
        kind: 'script', path: 'package.json', name: 'lint', before: null,
        after: 'eslint src --no-error-on-unmatched-pattern',
      },
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

    await runInit(root, { topology: 'layer-first', exec: () => {}, log });
    const first = lifecycle();
    const loadConfig = async () => vuePreset({ name: 'demo' });

    await runInit(root, { install: false, log, loadConfig });
    const second = lifecycle();

    expect(first.blueprint).toBe(runningPackage()!.version);
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
});

describe('init lifecycle recording · failures', () => {
  it('keeps ownership of actions that landed before an install failure', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await expect(runInit(root, {
      topology: 'layer-first',
      exec: () => {
        throw new Error('offline');
      },
      log,
    })).rejects.toThrow('offline');

    expect(lifecycle()).toMatchObject({ blueprint: null, provenance: 'complete' });

    expect(lifecycle().applications['.'].provenance)
      .toContainEqual({ kind: 'generated', path: 'docs/architecture-handbook.md' });

    expectLogged('the lifecycle checkpoint stays unestablished because adoption did not finish');

    const loadConfig = async () => vuePreset({ name: 'demo' });

    await runInit(root, { exec: () => {}, log, loadConfig });

    expect(lifecycle().blueprint).toBe(runningPackage()!.version);

    expect(lifecycle().applications['.'].provenance)
      .toContainEqual(created('blueprint.config.mjs'));
  });

  it('refuses a pre-lifecycle application when a sibling proves lost state', async () => {
    git('init', '--quiet');
    fs.writeFileSync(path.join(root, '.blueprint-lifecycle.json'), '{}\n');
    commit('record lifecycle state');
    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));

    for (const [app, version] of [['apps/old', '4.0.0'], ['apps/new', '4.1.0']]) {
      const dir = path.join(root, app);

      fs.mkdirSync(path.join(dir, 'node_modules/@kekkai/blueprint'), { recursive: true });

      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3' } }),
      );

      fs.writeFileSync(path.join(dir, 'blueprint.config.mjs'), ADOPTED_CONFIG);

      fs.writeFileSync(
        path.join(dir, 'node_modules/@kekkai/blueprint/package.json'),
        JSON.stringify({ name: '@kekkai/blueprint', version }),
      );
    }

    await expect(runInit(path.join(root, 'apps/old'), { install: false, log }))
      .rejects.toThrow('.blueprint-lifecycle.json is missing, and @kekkai/blueprint 4.1.0 always '
        + 'writes it');

    expect(fs.existsSync(path.join(root, 'apps/old/docs'))).toBe(false);
  });

  it('dates a 4.0 adoption updated past lifecycle state from its installed package when the '
    + 'state never entered Git', async () => {
    git('init', '--quiet');
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), ADOPTED_CONFIG);
    commit('adopt Blueprint 4.0');
    fs.mkdirSync(path.join(root, 'node_modules/@kekkai/blueprint'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'node_modules/@kekkai/blueprint/package.json'),
      JSON.stringify({ name: '@kekkai/blueprint', version: '4.1.0' }),
    );

    await runInit(root, { install: false, log });

    expect(lifecycle()).toMatchObject({ blueprint: '4.1.0', provenance: 'partial' });
    expectLogged('lifecycle checkpoint established from the installed package');
  });

  it('cannot tell never-committed lifecycle-aware state from a dependency update, so both '
    + 'take the same bootstrap', async () => {
    git('init', '--quiet');
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    commit('baseline');
    fs.mkdirSync(path.join(root, 'node_modules/@kekkai/blueprint'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'node_modules/@kekkai/blueprint/package.json'),
      JSON.stringify({ name: '@kekkai/blueprint', version: '4.1.0' }),
    );

    const loadConfig = async () => vuePreset({ name: 'demo' });

    await runInit(root, { topology: 'layer-first', install: false, log, loadConfig });

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(true);
    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));
    lines = [];

    await runInit(root, { install: false, log, loadConfig });

    expect(lifecycle()).toMatchObject({ blueprint: '4.1.0', provenance: 'partial' });
    expectLogged('lifecycle checkpoint established from the installed package');
  });

  it('refuses to run when a lifecycle-aware adoption outside Git lost its state file', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), ADOPTED_CONFIG);
    fs.mkdirSync(path.join(root, 'node_modules/@kekkai/blueprint'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'node_modules/@kekkai/blueprint/package.json'),
      JSON.stringify({ name: '@kekkai/blueprint', version: '4.1.0' }),
    );

    await expect(runInit(root, { install: false, log }))
      .rejects.toThrow('.blueprint-lifecycle.json is missing, and @kekkai/blueprint 4.1.0 always '
        + 'writes it');

    expect(fs.existsSync(path.join(root, 'docs/architecture-handbook.md'))).toBe(false);
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

describe('init lifecycle recording · unfinished adoption', () => {
  const loadConfig = async () => vuePreset({ name: 'demo' });

  it('keeps a deferred install from claiming a completed adoption', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { topology: 'layer-first', install: false, log });

    expect(lifecycle()).toMatchObject({ blueprint: null, provenance: 'complete' });
    expectLogged('unestablished because the dependencies adoption requires are not installed yet');

    await runInit(root, { install: false, log, loadConfig });

    expect(lifecycle().blueprint).toBeNull();

    await runInit(root, { exec: () => {}, log, loadConfig });

    expect(lifecycle().blueprint).toBe(runningPackage()!.version);

    expect(lifecycle().applications['.'].provenance)
      .toContainEqual(created('blueprint.config.mjs'));
  });

  it('establishes nothing for an authoring handoff until init adopts the authored '
    + 'config', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    writeSources();

    await runInit(root, { topology: 'layer-first', install: false, log });

    expect(lifecycle().blueprint).toBeNull();
    expectLogged('unestablished because authoring is still in progress');

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), ADOPTED_CONFIG);
    await runInit(root, { exec: () => {}, log, loadConfig });

    expect(lifecycle().blueprint).toBe(runningPackage()!.version);

    expect(lifecycle().applications['.'].provenance).toEqual(expect.arrayContaining([
      { kind: 'generated', path: 'blueprint-authoring.md' },
      { kind: 'generated', path: 'docs/architecture-handbook.md' },
    ]));
  });
});

describe('adoption recorder', () => {
  function adoptedBeside(backup: string): void {
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
    recorder.finish(log, true);
  }

  it('does not date a pre-lifecycle adoption from an ambiguous legacy config backup', () => {
    git('init', '--quiet');
    adoptedBeside(`blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`);

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expectLogged('legacy config shape overlaps supported and unsupported 3.x releases');
  });

  it('never rebuilds lost or unprovable state from a 3.2 config backup', () => {
    adoptedBeside(`blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`);

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expectLogged('a missing file is lost history, not a fresh adoption');

    git('init', '--quiet');
    fs.writeFileSync(path.join(root, '.blueprint-lifecycle.json'), '{}\n');
    commit('record lifecycle state');
    fs.rmSync(path.join(root, '.blueprint-lifecycle.json'));
    lines = [];
    adoptedBeside(`blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`);

    expect(fs.existsSync(path.join(root, '.blueprint-lifecycle.json'))).toBe(false);
    expectLogged('a missing file is lost history, not a fresh adoption');
  });

  it.each([
    `old.blueprint.config.mjs.pre-v4-${'a'.repeat(64)}`,
    `blueprint.config.mjs.pre-v4-${'a'.repeat(64)}.bak`,
  ])('does not date the source from %s', (backup) => {
    git('init', '--quiet');
    adoptedBeside(backup);

    expect(lifecycle()).toMatchObject({ blueprint: '4.1.0', provenance: 'partial' });
  });

  it('diffs a later write to the same file against the earlier write', () => {
    writePkg({ name: 'demo' });

    const actions = [
      { kind: 'write', path: 'notes.txt', content: 'one\n', note: 'x' as never },
      { kind: 'write', path: 'notes.txt', content: 'one\ntwo\n', note: 'x' as never },
    ] as const;

    const recorder = adoptionRecorder(root, detect(root), actions);

    actions.forEach((action) => recorder.landed(action));
    recorder.finish(log, true);

    expect(lifecycle().applications['.'].provenance).toEqual([
      { kind: 'created', path: 'notes.txt', sha256: digest('one\n') },
      { kind: 'edit', path: 'notes.txt', before: '', after: 'two\n' },
    ]);
  });

  it('names the unfinished work that keeps the checkpoint unestablished', () => {
    writePkg({ name: 'demo' });

    const actions = [{ kind: 'instruct', note: 'x' as never, defers: 'install' }] as const;
    const recorder = adoptionRecorder(root, detect(root), actions);

    recorder.landed({ kind: 'mkdir', path: 'src/pages', note: 'x' as never });
    recorder.finish(log, false);

    expect(lines.at(-1)).toContain('unestablished because adoption did not finish');

    recorder.finish(log, true);

    expect(lines.at(-1))
      .toContain('unestablished because the dependencies adoption requires are not installed');

    expect(lifecycle().blueprint).toBeNull();
  });

  it('records nothing when no action landed and ignores instructions', () => {
    writePkg({ name: 'demo' });

    const recorder = adoptionRecorder(root, detect(root), []);

    recorder.landed({ kind: 'instruct', note: 'x' as never });
    recorder.finish(log, true);

    expect(lines).toEqual([]);

    recorder.landed({ kind: 'install', command: 'npm install', note: 'x' as never });
    recorder.finish(log, true);

    expect(lines).toHaveLength(1);
    expect(lifecycle().applications['.'].provenance).toEqual([]);
  });
});
