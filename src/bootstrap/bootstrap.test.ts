import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './bootstrap';
import { vuePreset } from '../presets';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-init-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writePkg(content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(content));
}

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');
const exists = (file: string) => fs.existsSync(path.join(root, file));

const silent = () => {};

describe('runInit', () => {
  it('scaffolds a greenfield vue project end to end', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, log: silent });

    expect(read('blueprint.config.mjs')).toContain('vuePreset({ name: \'demo\' })');
    expect(read('eslint.config.mjs')).toContain('emitLint');
    expect(read('eslint.config.mjs')).toContain('vue-eslint-parser');
    expect(read('docs/architecture-handbook.md')).toContain('# demo — Architecture Handbook');
    expect(read('CLAUDE.md')).toContain('## Architecture contract');
    expect(read('AGENTS.md')).toContain('## Architecture contract');
    expect(exists('src/services/.gitkeep')).toBe(true);

    // A JS project with no tsconfig gets the alias wired via a fresh jsconfig.
    expect(JSON.parse(read('jsconfig.json'))).toEqual({
      compilerOptions: { paths: { '~app/*': ['./src/*'] } },
    });

    // The preset opts into CI generation (Day-1 doctrine).
    expect(read('.github/workflows/blueprint-ci.yml')).toContain('npx blueprint inspect');
  });

  it('patches an existing parseable tsconfig.json with the alias paths', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"include": ["src"]}');

    await runInit(root, { install: false, log: silent });

    const tsconfig = JSON.parse(read('tsconfig.json'));

    expect(tsconfig.include).toEqual(['src']);
    expect(tsconfig.compilerOptions.paths).toEqual({ '~app/*': ['./src/*'] });
    expect(exists('jsconfig.json')).toBe(false);
  });

  it('preserves hand-written content in an existing AGENTS.md', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# House rules\n\nBe nice.\n');

    await runInit(root, { install: false, log: silent });

    const agents = read('AGENTS.md');

    expect(agents.startsWith('# House rules')).toBe(true);
    expect(agents).toContain('Be nice.');
    expect(agents).toContain('<!-- BLUEPRINT:START -->');
    expect(agents).toContain('## Architecture contract');
  });

  it('writes tool-owned rule files for configured targets', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => ({
        ...vuePreset({ name: 'demo' }),
        emit: { agents: ['cursor', 'windsurf'] },
      }),
    });

    expect(read('.cursor/rules/blueprint.mdc')).toContain('alwaysApply: true');
    expect(read('.windsurf/rules/blueprint.md')).toContain('trigger: always_on');
    expect(exists('CLAUDE.md')).toBe(false);
  });

  it('is idempotent — a second run produces identical files', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    const loadConfig = async () => vuePreset({ name: 'demo' });

    const files = ['blueprint.config.mjs', 'eslint.config.mjs', 'CLAUDE.md', 'AGENTS.md', 'docs/architecture-handbook.md', 'jsconfig.json'];

    await runInit(root, { install: false, log: silent, loadConfig });
    const snapshot = files.map(read);

    await runInit(root, { install: false, log: silent, loadConfig });
    const again = files.map(read);

    expect(again).toEqual(snapshot);
  });

  it('writes nothing on a dry run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { dryRun: true, log: silent });

    expect(actions.length).toBeGreaterThan(0);
    expect(exists('blueprint.config.mjs')).toBe(false);
  });

  it('loads an existing config instead of generating one', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset({ name: 'FromConfig' }),
    });

    expect(actions.some((a) => a.kind === 'write' && a.path === 'blueprint.config.mjs')).toBe(false);
    expect(read('blueprint.config.mjs')).toBe('// user config');
    expect(read('docs/architecture-handbook.md')).toContain('FromConfig');
  });

  it('throws when the framework is ambiguous and none is forced', async () => {
    writePkg({ dependencies: {} });

    await expect(runInit(root, { log: silent })).rejects.toThrow(/framework/);
  });

  it('honors a forced framework when detection fails', async () => {
    writePkg({ dependencies: {} });

    await runInit(root, { framework: 'react', install: false, log: silent });

    expect(read('blueprint.config.mjs')).toContain('reactPreset()');
  });

  it('runs the install command through the injected exec', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    const commands: string[] = [];

    await runInit(root, { log: silent, exec: (command) => commands.push(command) });

    expect(commands).toEqual([
      'npm install -D eslint @kekkai/blueprint eslint-plugin-import @eslint-community/eslint-plugin-eslint-comments knip vue-eslint-parser',
    ]);
  });
});

describe('runInit · brownfield authoring flow', () => {
  function brownfield(): void {
    writePkg({ name: 'legacy', dependencies: { react: '^18' } });

    for (let i = 0; i < 12; i++) {
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      fs.writeFileSync(path.join(root, `src/app/file${i}.ts`), 'export const x = 1;');
    }
  }

  it('emits the playbook instead of scaffolding when code exists without a config', async () => {
    brownfield();

    const actions = await runInit(root, { install: false, log: silent });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);
    expect(read('blueprint-authoring.md')).toContain('## Survey evidence');
    expect(read('.claude/commands/blueprint-author.md')).toContain('blueprint-authoring.md');

    // Nothing of the normal scaffold happened.
    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('eslint.config.mjs')).toBe(false);
    expect(exists('CLAUDE.md')).toBe(false);
  });

  it('honors --preset as the escape hatch back to the scaffold', async () => {
    brownfield();

    await runInit(root, { install: false, preset: true, log: silent });

    expect(read('blueprint.config.mjs')).toContain('reactPreset');
    expect(exists('blueprint-authoring.md')).toBe(false);
  });

  it('keeps the preset path for a near-empty repo', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    await runInit(root, { install: false, log: silent });

    expect(read('blueprint.config.mjs')).toContain('reactPreset');
    expect(exists('blueprint-authoring.md')).toBe(false);
  });

  it('launches the agent on the playbook with --agent', async () => {
    brownfield();

    const calls: string[] = [];

    await runInit(root, {
      install: false,
      agent: 'claude',
      spawn: (bin, args, cwd) => {
        calls.push(`${bin} @ ${cwd}`);
        expect(args[0]).toContain('blueprint-authoring.md');

        return { status: 0 };
      },
      log: silent,
    });

    expect(calls).toEqual([`claude @ ${root}`]);
    expect(exists('blueprint-authoring.md')).toBe(true); // written BEFORE the spawn
  });

  it('never launches on --dry-run, and writes nothing', async () => {
    brownfield();

    const actions = await runInit(root, {
      install: false,
      dryRun: true,
      agent: 'claude',
      spawn: () => {
        throw new Error('must not spawn');
      },
      log: silent,
    });

    expect(actions).toHaveLength(3);
    expect(exists('blueprint-authoring.md')).toBe(false);
  });

  it('skips --agent with a message when a config already exists', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    fs.writeFileSync(
      path.join(root, 'blueprint.config.mjs'),
      'export default {};',
    );

    const logs: string[] = [];

    await runInit(root, {
      install: false,
      agent: 'codex',
      spawn: () => {
        throw new Error('must not spawn');
      },
      loadConfig: async () => vuePreset(),
      log: (message) => logs.push(message),
    });

    expect(logs.join('\n')).toContain('--agent codex skipped');
  });
});
