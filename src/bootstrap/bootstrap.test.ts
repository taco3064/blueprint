import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BROWNFIELD_MIN_FILES } from './authoring';
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

  it('leaves a hand-written AGENTS.md untouched and writes a reference instead', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# House rules\n\nBe nice.\n');

    const actions = await runInit(root, { install: false, log: silent });

    expect(read('AGENTS.md')).toBe('# House rules\n\nBe nice.\n');
    expect(read('AGENTS.blueprint.md')).toContain('## Architecture contract');

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('AGENTS.md is hand-written'),
    )).toBe(true);
  });

  it('refreshes its own marker block in place on re-run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, log: silent });

    const first = read('CLAUDE.md');

    expect(first).toContain('<!-- BLUEPRINT:START -->');

    await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset({ name: 'demo' }),
    });

    expect(read('CLAUDE.md')).toBe(first);
    expect(exists('CLAUDE.blueprint.md')).toBe(false);
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

    const files = [
      'blueprint.config.mjs',
      'eslint.config.mjs',
      'CLAUDE.md',
      'AGENTS.md',
      'docs/architecture-handbook.md',
      'jsconfig.json',
    ];

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

    expect(
      actions.some((a) => a.kind === 'write' && a.path === 'blueprint.config.mjs'),
    ).toBe(false);

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
      'npm install -D eslint @kekkai/blueprint @eslint-community/eslint-plugin-eslint-comments'
      + ' @stylistic/eslint-plugin eslint-plugin-import-x vue-eslint-parser',
    ]);
  });

  it('claims no effect that a failed step prevented (field issue #37)', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });

    fs.writeFileSync(
      path.join(root, 'vite.config.ts'),
      'import { defineConfig } from \'vite\'\n\nexport default defineConfig({\n  plugins: '
      + '[],\n})\n',
    );

    const lines: string[] = [];

    // The field repro was an install that threw with the alias writes below it, and
    // #37 fixed the half of it that was a lie: the output stopped claiming edits that
    // never reached disk. The other half was the state, and a codex run found it — an
    // aborted install left a config, a contract and an eslint config with no alias in
    // tsconfig or vite, so doctor said `~app resolves nowhere` (field run #131). Every
    // local write now lands ABOVE the install, so this asserts the inverse of what it
    // used to: the alias IS on disk when the install fails, and the ✓ that says so is
    // true.
    const failing = runInit(root, {
      log: (message) => lines.push(message),
      exec: () => {
        throw new Error('npm error ERESOLVE unable to resolve dependency tree');
      },
    });

    await expect(failing).rejects.toThrow('ERESOLVE');

    const output = lines.join('\n');

    expect(output).toContain('✓ write: eslint.config.mjs');
    expect(exists('eslint.config.mjs')).toBe(true);
    expect(output).toContain('✗ install: eslint,');
    expect(output).not.toContain('✓ install:');
    // The alias landed first, so it is claimed AND true — the pairing is the contract,
    // since either half alone is a state #37 or #131 already caught.
    expect(output).toContain('✓ write: vite.config.ts (import alias added');
    expect(read('vite.config.ts')).toContain('~app');
    // And the wait announced itself before the silence, which is what two runs killed.
    expect(output).toContain('→ install: eslint,');
    expect(output).toContain('the one step that needs the registry');
    expect(output.indexOf('→ install:')).toBeLessThan(output.indexOf('✗ install:'));
    // The command itself, above the silence rather than behind a flag that prints it:
    // a killed install leaves what is on screen, and two runs went reading blueprint's
    // own package.json for versions to reconstruct instead (field runs #139, #140).
    expect(output).toContain('npm install -D eslint');
    expect(output).toContain('No version list to find first');

    // And what the kill LEAVES, which only this line can say: the catch block below
    // explains the half-done tree, and a killed process never reaches it. Four runs
    // stopped this step as invited and then treated the result as damage — one
    // hand-wrote the manifest entries from blueprint's own package.json, one filed the
    // repo as unverifiable (field runs #144–#146). Both facts are computed, not
    // reassurance: the install is last in the plan, and it is what writes the manifest.
    expect(output).toContain('Stopping is safe: this is the last step');
    expect(output).toContain('What stopping omits is these packages in `package.json`');
    expect(output).toContain('a failure naming one of them is that gap');

    // And it does not claim the file itself is missing: this same run writes
    // package.json for the lint script two lines above, so "stopping leaves out
    // package.json" would be one of the paired contradictions #10–#12 are about.
    expect(output.indexOf('✓ write: package.json')).toBeLessThan(output.indexOf('→ install:'));
    expect(output).not.toContain('What it leaves out is `package.json`');
  });

  it('names what did not happen, and how to finish (field issue #37)', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });

    // A failing WRITE, not a failing install, because the install can no longer strand
    // a planned write — every one of them lands above it now, and only report-only
    // instructs sit below. So this is the shape that still reaches the missing-effects
    // list, and it is the honest one: a read-only tree or a path already taken by a
    // directory. `EISDIR` on the handbook leaves the config and the layer folders on
    // disk and everything after it unwritten.
    fs.mkdirSync(path.join(root, 'docs', 'architecture-handbook.md'), { recursive: true });

    const failing = runInit(root, { log: silent, exec: silent });

    // A stopped run whose remaining plan is unnamed reads as "init is done,
    // minus one warning" — the message has to carry the missing effects and
    // a route to completion, or the adopter has no reason to look.
    await expect(failing).rejects.toThrow('init stopped at the write step above');
    await expect(failing).rejects.toThrow('did NOT happen');
    await expect(failing).rejects.toThrow('write: eslint.config.mjs');
    await expect(failing).rejects.toThrow('blueprint init --no-install');
  });

  it('says so plainly when the failing step was the last one', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });
    // A tsconfig with paths already declared: the alias actions collapse to
    // nothing, so install is the tail of the plan.

    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
    );

    const failing = runInit(root, {
      log: silent,
      exec: () => {
        throw new Error('npm error ERESOLVE');
      },
    });

    await expect(failing).rejects.toThrow('nothing else was planned below it');
  });

  it('does not stutter the install label (field issue #34)', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    const lines: string[] = [];

    await runInit(root, { log: (message) => lines.push(message), exec: () => {} });

    // The renderer already prefixes the kind — "✓ install: install eslint …"
    // read as a bug in the tool's own output.
    expect(lines.join('\n')).toContain('✓ install: eslint,');
    expect(lines.join('\n')).not.toContain('install: install');
  });
});

describe('runInit · Next.js routing', () => {
  it('persists --agent into a scaffolded Next config too', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    await runInit(root, { install: false, log: silent, agent: 'codex' });

    expect(read('blueprint.config.mjs')).toContain('emit: { agents: [\'agents\'] }');
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('CLAUDE.md')).toBe(false);
  });

  it('scaffolds a fresh App-Router repo with nextPreset, never an empty src/pages', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    await runInit(root, { install: false, log: silent });

    const config = read('blueprint.config.mjs');

    expect(config).toContain('nextPreset');
    expect(config).toContain('router: \'app\'');
    expect(config).toContain('srcDir: true');
    expect(exists('blueprint-authoring.md')).toBe(false); // preset, not authoring
    expect(exists('src/pages')).toBe(false);
  });

  it('renders a nextPreset config without a name when package.json has none', async () => {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { react: '^19', next: '^15' } }),
    );

    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    await runInit(root, { install: false, log: silent });

    const config = read('blueprint.config.mjs');

    expect(config).toContain('nextPreset({ router: \'app\', srcDir: true })');
    expect(config).not.toContain('name:');
  });

  it('detects a no-srcDir App Router at the project root', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app/page.tsx'), 'export default () => null;');

    await runInit(root, { install: false, log: silent });

    const config = read('blueprint.config.mjs');

    expect(config).toContain('router: \'app\'');
    expect(config).not.toContain('srcDir'); // root layout — no srcDir
  });

  it('surveys the project root when a Next app keeps its routes there', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'app/dashboard'), { recursive: true });

    for (let i = 0; i < BROWNFIELD_MIN_FILES + 2; i++) {
      fs.writeFileSync(path.join(root, `app/dashboard/p${i}.tsx`), 'export default () => null;');
    }

    await runInit(root, { install: false, log: silent });

    // The layers live at the root in this layout, so surveying src/ counts zero
    // files and reads a full route tree as a fresh scaffold — scaffolding over
    // a real app instead of reading it.
    expect(exists('blueprint-authoring.md')).toBe(true);
  });

  it('uses nextPreset for --preset on a Next repo (no react-preset warning)', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    const actions = await runInit(root, { install: false, preset: true, log: silent });

    expect(read('blueprint.config.mjs')).toContain('nextPreset');
    expect(read('blueprint.config.mjs')).not.toContain('reactPreset');

    expect(
      actions.some((action) => action.kind === 'instruct' && action.note.includes('does not fit')),
    ).toBe(false);
  });
});

describe('runInit · Nuxt is unsupported', () => {
  it('refuses to init a Nuxt project, explaining why', async () => {
    writePkg({ name: 'nuxt-demo', dependencies: { nuxt: '^3', vue: '^3' } });

    await expect(runInit(root, { install: false, log: silent })).rejects.toThrow(
      /Nuxt is not supported[\s\S]*auto-imports/,
    );
  });
});

describe('runInit · the greenfield/brownfield fork is narrated', () => {
  it('says why a fresh scaffold gets the preset instead of the playbook', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    const lines: string[] = [];

    await runInit(root, { install: false, log: (message) => lines.push(message) });

    expect(lines.join('\n')).toContain('Fresh scaffold (0 source files < 10)');
    expect(lines.join('\n')).toContain('authoring playbook');
  });
});

describe('runInit · --agent persists into the scaffolded config', () => {
  it('scaffolds emit.agents so the narrowing survives the next plain init (field #5)', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { install: false, log: silent, agent: 'claude' });

    // The chicken-and-egg is gone: first run, one contract, persisted choice.
    expect(read('blueprint.config.mjs')).toContain('emit: { agents: [\'claude\'] }');
    expect(exists('CLAUDE.md')).toBe(true);
    expect(exists('AGENTS.md')).toBe(false);

    // No both-files note — nothing was over-emitted.
    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('Wrote both'),
    )).toBe(false);

    // The scaffold is still recognized as init's own: --authoring takes over.
    const takeover = await runInit(root, { install: false, log: silent, authoring: true });

    expect(takeover.some((action) => action.kind === 'rm')).toBe(true);
    expect(exists('blueprint-authoring.md')).toBe(true);
  });
});

describe('runInit · where the fork survey looks', () => {
  it('counts the source root, not the repo root, on a project that is not Next', async () => {
    // Only a Next project with its routes at the repo root gets surveyed from
    // there. Surveying every repo that way folds root-level tooling files into
    // the count, and the fork decision — playbook or preset — moves with it.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/components/A.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(root, 'src/components/B.ts'), 'export const b = 1;');
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default {};');

    const lines: string[] = [];

    await runInit(root, { install: false, log: (m) => lines.push(m) });

    expect(lines.join('\n')).toContain('Fresh scaffold (2 source files < 10)');
  });

  it('sends a Next project with no placeable route tree to the playbook', async () => {
    // `next` is a dependency but there is no app/ or pages/ anywhere, so init
    // cannot say where the routes live. Scaffolding the Next preset anyway
    // declares a route layer the repo does not have — and this repo is far
    // below the brownfield threshold, so nothing else routes it here.
    writePkg({ name: 'demo', dependencies: { next: '^14', react: '^18' } });

    await runInit(root, { install: false, log: silent });

    expect(exists('blueprint-authoring.md')).toBe(true);
    expect(exists('blueprint.config.mjs')).toBe(false);
  });
});

describe('runInit · --authoring at the threshold itself', () => {
  it('does not claim the flag forced anything when the repo qualifies anyway', async () => {
    // At exactly the threshold the repo IS brownfield, so --authoring changed
    // nothing. Saying it forced the playbook tells the reader the document is
    // about to refute itself (field issues #7/#8) when it is not.
    writePkg({ name: 'legacy', dependencies: { react: '^18' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });

    for (let i = 0; i < BROWNFIELD_MIN_FILES; i++) {
      fs.writeFileSync(path.join(root, `src/app/file${i}.ts`), 'export const x = 1;');
    }

    const lines: string[] = [];

    await runInit(root, { install: false, authoring: true, log: (m) => lines.push(m) });

    expect(lines.join('\n')).toContain(`${BROWNFIELD_MIN_FILES} source files surveyed`);
    expect(lines.join('\n')).not.toContain('below the brownfield threshold');
  });
});

describe('runInit · what belongs to a fresh scaffold only', () => {
  /** A config that already exists but was NOT written by init. */
  const handWritten = () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// hand-written\n');
  };

  it('does not blame the starter template for code it did not scaffold', async () => {
    // Template cleanup describes violations the PRESET just landed. On a repo
    // whose config was already there, init scaffolded nothing — so the to-do
    // hands the reader a list of their own long-standing violations under a
    // heading that says init introduced them.
    handWritten();
    fs.mkdirSync(path.join(root, 'src/components/Btn'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src/components/Btn/Btn.ts'),
      'import { api } from \'~app/services/api\';\n',
    );

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset(),
    });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('Template cleanup'),
    )).toBe(false);
  });

  it('does not claim it introduced an alias the config already declared', async () => {
    // The note is about a decision the PRESET made. With a config already on
    // disk, the alias came from it — telling the owner init chose it invites
    // them to change a convention that is already theirs (field issue #2).
    handWritten();

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset(),
    });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
    )).toBe(false);
  });
});
