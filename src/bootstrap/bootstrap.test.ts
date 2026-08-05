import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BROWNFIELD_MIN_FILES } from './authoring';
import { runInit } from './bootstrap';
import { nextPreset, vuePreset } from '../presets';

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
      'npm install -D eslint @kekkai/blueprint @eslint-community/eslint-plugin-eslint-comments'
      + ' @stylistic/eslint-plugin eslint-plugin-import-x vue-eslint-parser',
    ]);
  });

  it('claims no effect that a failed step prevented (field issue #37)', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });

    fs.writeFileSync(
      path.join(root, 'vite.config.ts'),
      'import { defineConfig } from \'vite\'\n\nexport default defineConfig({\n  plugins: [],\n})\n',
    );

    const lines: string[] = [];

    // The field repro: install sits mid-plan with the alias writes below it,
    // so an ERESOLVE used to leave an output claiming edits that never
    // reached disk — and an agent contract promising an alias that resolved
    // nowhere.
    const failing = runInit(root, {
      log: (message) => lines.push(message),
      exec: () => {
        throw new Error('npm error ERESOLVE unable to resolve dependency tree');
      },
    });

    await expect(failing).rejects.toThrow('ERESOLVE');

    const output = lines.join('\n');

    // Everything narrated with ✓ is genuinely on disk; the step that threw
    // wears ✗, and nothing below it was announced at all.
    expect(output).toContain('✓ write: eslint.config.mjs');
    expect(exists('eslint.config.mjs')).toBe(true);
    expect(output).toContain('✗ install: eslint,');
    expect(output).not.toContain('✓ install:');
    expect(output).not.toContain('vite.config.ts');
    expect(read('vite.config.ts')).not.toContain('~app');
  });

  it('names what did not happen, and how to finish (field issue #37)', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });

    const failing = runInit(root, {
      log: silent,
      exec: () => {
        throw new Error('npm error ERESOLVE');
      },
    });

    // A stopped run whose remaining plan is unnamed reads as "init is done,
    // minus one warning" — the message has to carry the missing effects and
    // a route to completion, or the adopter has no reason to look.
    await expect(failing).rejects.toThrow('init stopped at the install step above');
    await expect(failing).rejects.toThrow('did NOT happen');
    await expect(failing).rejects.toThrow('write: jsconfig.json (import alias)');
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

describe('runInit · brownfield authoring flow', () => {
  function brownfield(): void {
    writePkg({ name: 'legacy', dependencies: { react: '^18' } });

    for (let i = 0; i < 12; i++) {
      fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
      fs.writeFileSync(path.join(root, `src/app/file${i}.ts`), 'export const x = 1;');
    }
  }

  it('takes the authoring path at exactly the threshold, not the scaffold one', async () => {
    writePkg({ name: 'legacy', dependencies: { react: '^18' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });

    for (let i = 0; i < BROWNFIELD_MIN_FILES; i++) {
      fs.writeFileSync(path.join(root, `src/app/file${i}.ts`), 'export const x = 1;');
    }

    await runInit(root, { install: false, log: silent });

    // The two sides of this boundary are the biggest fork init makes — one
    // writes a playbook and scaffolds nothing, the other the reverse. The
    // suite bracketed it (12 files and 3) without ever landing on it.
    expect(exists('blueprint-authoring.md')).toBe(true);
  });

  it('says when --authoring forced the playbook below the threshold, and only then', async () => {
    writePkg({ name: 'legacy', dependencies: { react: '^18' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/only.ts'), 'export const x = 1;');

    const forced: string[] = [];

    await runInit(root, { install: false, authoring: true, log: (m) => forced.push(m) });

    // Unsaid, --authoring on a small repo looks like it produced a
    // self-refuting document: a playbook whose own verdict is the early exit
    // (field issues #7/#8).
    expect(forced.join('\n')).toContain('below the brownfield threshold');

    // Above the threshold the flag changed nothing, so the caveat must not
    // appear — it would name a threshold this repo is not below.
    fs.rmSync(path.join(root, 'src/app'), { recursive: true });
    brownfield();

    const plain: string[] = [];

    await runInit(root, { install: false, authoring: true, log: (m) => plain.push(m) });

    expect(plain.join('\n')).not.toContain('below the brownfield threshold');
  });

  it('lists the authoring plan up front only in dry-run', async () => {
    brownfield();

    const dry: string[] = [];

    await runInit(root, { dryRun: true, install: false, log: (m) => dry.push(m) });

    expect(dry.join('\n')).toContain('would write');

    const applied: string[] = [];

    await runInit(root, { install: false, log: (m) => applied.push(m) });

    // The authoring flow has its own dry-run report. Outside it the applied
    // lines are the record, and a "would" among them describes disk state that
    // either already happened or never will.
    expect(applied.join('\n')).not.toContain('would ');
  });

  it('emits the playbook instead of scaffolding when code exists without a config', async () => {
    brownfield();

    const actions = await runInit(root, { install: false, log: silent });

    // install downgraded to an instruct because the test passes install:false.
    expect(actions.map((action) => action.kind)).toEqual([
      'write',
      'write',
      'instruct',
      'instruct',
    ]);

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('Install skipped'),
    )).toBe(true);

    expect(read('blueprint-authoring.md')).toContain('## Survey evidence');
    expect(read('blueprint-authoring.md')).toContain('## Prerequisites');
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

  it('--authoring forces the playbook on a near-empty repo', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    await runInit(root, { install: false, authoring: true, log: silent });

    expect(exists('blueprint-authoring.md')).toBe(true);
    expect(exists('blueprint.config.mjs')).toBe(false);
  });

  it('--authoring takes over a pristine preset scaffold left by a plain init', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    // The poison sequence from the field report: plain init scaffolds a
    // preset config, then --authoring used to be a silent no-op.
    await runInit(root, { install: false, log: silent });
    expect(read('blueprint.config.mjs')).toContain('reactPreset');

    const lines: string[] = [];

    const actions = await runInit(root, {
      install: false,
      authoring: true,
      log: (message) => lines.push(message),
    });

    expect(actions[0]).toMatchObject({ kind: 'rm', path: 'blueprint.config.mjs' });
    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('blueprint-authoring.md')).toBe(true);

    // A deletion must not wear the writes' ✓ — an agent skimming init's
    // output missed its own config being reclaimed (field issue #36).
    expect(lines.join('\n')).toContain('− rm: blueprint.config.mjs (pristine preset scaffold');
    expect(lines.join('\n')).not.toContain('✓ rm:');
    expect(lines.join('\n')).toContain('✓ write: blueprint-authoring.md');
  });

  it('--authoring also takes over a pristine Next scaffold', async () => {
    writePkg({ name: 'napp', dependencies: { next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    // Plain init on a fresh Next repo scaffolds the next preset config.
    await runInit(root, { install: false, log: silent });
    expect(read('blueprint.config.mjs')).toContain('nextPreset');

    await runInit(root, { install: false, authoring: true, log: silent });

    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('blueprint-authoring.md')).toBe(true);
  });

  it('--authoring refuses to touch a hand-edited config', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    fs.writeFileSync(
      path.join(root, 'blueprint.config.mjs'),
      '// hand-tuned\nexport default { framework: \'react\' };',
    );

    await expect(
      runInit(root, { install: false, authoring: true, log: silent }),
    ).rejects.toThrow('has been edited');

    expect(read('blueprint.config.mjs')).toContain('hand-tuned');
  });

  it('rejects --preset and --authoring together', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    await expect(
      runInit(root, { install: false, preset: true, authoring: true, log: silent }),
    ).rejects.toThrow('mutually exclusive');
  });

  it('names --authoring in the preset-branch narration', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });
    const lines: string[] = [];

    await runInit(root, { install: false, log: (message) => lines.push(message) });

    expect(lines.join('\n')).toContain('no blueprint-authoring.md is written');
    expect(lines.join('\n')).toContain('init --authoring');
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

    expect(actions).toHaveLength(4);
    expect(exists('blueprint-authoring.md')).toBe(false);
  });

  it('installs the package as part of the authoring flow by default', async () => {
    brownfield();

    const commands: string[] = [];

    await runInit(root, {
      exec: (command) => {
        commands.push(command);
      },
      log: silent,
    });

    expect(commands).toEqual(['npm install -D @kekkai/blueprint']);
  });

  it('adds a template-cleanup instruct when preset scaffold code violates the rules', async () => {
    writePkg({ name: 'fresh', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'src/components/Hello'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src/components/Hello/index.js'),
      [
        'import logo from "../../assets/logo.svg";',
        'import a from "../../assets/a.svg";',
        'import b from "../../assets/b.svg";',
        'import c from "../../assets/c.svg";',
      ].join('\n'),
    );

    const actions = await runInit(root, { install: false, log: silent });

    const cleanup = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('Template cleanup'),
    );

    expect(cleanup?.note).toContain('src/components/Hello/index.js');
    expect(cleanup?.note).toContain('… and 1 more'); // capped at three listed findings
    expect(cleanup?.note).toContain('npx blueprint inspect');
  });

  it('lists every finding when three or fewer fit, with nothing left to count', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'src/components/Hello'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src/components/Hello/index.js'),
      ['import logo from "../../assets/logo.svg";', 'import a from "../../assets/a.svg";'].join('\n'),
    );

    const actions = await runInit(root, { install: false, log: silent });

    const cleanup = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('Template cleanup'),
    );

    // Two findings fit inside the cap, so an overflow line would count zero —
    // "… and 0 more" reads as a truncation that did not happen. The line count
    // pins it further: anything at all in that slot is one line too many.
    expect(cleanup?.note).toContain('(2 finding(s))');
    expect(cleanup?.note).not.toContain('more');
    expect(cleanup?.note.split('\n')).toHaveLength(5);
  });

  it('emits no cleanup instruct when the scaffold is clean', async () => {
    writePkg({ name: 'fresh', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { install: false, log: silent });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('Template cleanup'),
    )).toBe(false);
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

    expect(logs.join('\n')).toContain('--agent codex: nothing to author');
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('CLAUDE.md')).toBe(false); // --agent codex narrowed the targets
  });
});

describe('runInit · artifact hygiene', () => {
  it('regenerates its own eslint config in place instead of writing a reference', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, log: silent });
    expect(read('eslint.config.mjs')).toContain('Generated by @kekkai/blueprint init');

    const again = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset({ name: 'demo' }),
    });

    expect(again.some(
      (action) => action.kind === 'write' && action.path === 'eslint.config.mjs',
    )).toBe(true);

    expect(exists('eslint.config.blueprint.mjs')).toBe(false);
  });

  it('still treats a hand-made eslint config as brownfield', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default [];');

    await runInit(root, { install: false, log: silent });

    expect(read('eslint.config.mjs')).toBe('export default [];');
    expect(exists('eslint.config.blueprint.mjs')).toBe(true);
  });

  it('re-includes gitignored artifacts via negations instead of instructing (field #4)', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\ndocs\n');

    await runInit(root, { install: false, log: silent });

    const gitignore = read('.gitignore');

    // Original content preserved; negations appended (they win by coming later).
    expect(gitignore).toContain('CLAUDE.md\ndocs\n');
    expect(gitignore).toContain('!CLAUDE.md');
    expect(gitignore).toContain('!docs/architecture-handbook.md');
    expect(gitignore).toContain('keep them tracked');

    // Idempotent: the negations satisfy the matcher, so a re-run appends
    // nothing (loadConfig injected — the scaffolded config imports the
    // package, which the offline test env cannot resolve).
    await runInit(root, { install: false, log: silent, loadConfig: async () => vuePreset() });

    expect(read('.gitignore').match(/!CLAUDE\.md/g)).toHaveLength(1);
  });

  it('joins the negation block on with exactly one blank line, whatever the file ended in', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    // How many trailing newlines a .gitignore carries is an editor accident;
    // the seam this write produces must not be.
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\ndocs\n\n\n');

    await runInit(root, { install: false, log: silent });

    // Anchored at the start, with the blank lines counted: a leading blank
    // line or a surviving run of trailing ones both show up as an unexplained
    // edit in a file people read as a diff.
    expect(read('.gitignore')).toMatch(/^CLAUDE\.md\ndocs\n\n# @kekkai/);
  });

  it('states the edit and the directory-exclusion caveat in the note', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'AGENTS.md\n');

    const actions = await runInit(root, { install: false, log: silent });

    const patch = actions.find(
      (action) => action.kind === 'write' && action.path === '.gitignore',
    );

    expect(patch?.note).toContain('re-included AGENTS.md');
    // The rule that hid it, not only the file. Without it a reader can only check
    // the claim AFTER the negation lands, where `git check-ignore` answers "not
    // ignored" — the fix working, which reads exactly like a fix that was never
    // needed. A field agent filed it as a no-op on that reading.
    expect(patch?.note).toContain('hidden by `AGENTS.md`');
    expect(patch?.note).toContain('delete the appended lines to keep it hidden');
    expect(patch?.note).toContain('parent directory');
    expect(read('.gitignore')).toContain('!AGENTS.md');
  });

  it('phrases the greenfield --agent skip by what happened', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const logs: string[] = [];

    await runInit(root, {
      install: false,
      agent: 'claude',
      spawn: () => {
        throw new Error('must not spawn');
      },
      log: (message) => logs.push(message),
    });

    expect(logs.join('\n')).toContain('fresh scaffold, nothing to author');
  });
});

describe('runInit · wired eslint config detection', () => {
  it('stops nagging once the user config imports @kekkai/blueprint', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      [
        'import { emitLint } from \'@kekkai/blueprint\';',
        'import blueprint from \'./blueprint.config.mjs\';',
        'export default [...emitLint(blueprint)];',
      ].join('\n'),
    );

    const actions = await runInit(root, { install: false, log: silent });

    expect(exists('eslint.config.blueprint.mjs')).toBe(false);
    expect(read('eslint.config.mjs')).toContain('emitLint(blueprint)');

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('already wires'),
    )).toBe(true);
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
    expect(actions.some((action) => action.kind === 'instruct' && action.note.includes('does not fit'))).toBe(false);
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

describe('runInit · how the plan is reported', () => {
  it('lists the plan up front only in dry-run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const dry: string[] = [];

    await runInit(root, { dryRun: true, install: false, log: (m) => dry.push(m) });

    expect(dry.join('\n')).toContain('would write');

    const applied: string[] = [];

    await runInit(root, { install: false, log: (m) => applied.push(m) });

    // Outside dry-run the applied lines ARE the report. A "would" among them
    // claims something about disk that already happened, or did not.
    expect(applied.join('\n')).not.toContain('would ');
    expect(applied.join('\n')).toContain('✓ write:');
  });

  it('marks an instruction with a bullet, never with an effect mark', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const lines: string[] = [];

    await runInit(root, { install: false, log: (m) => lines.push(m) });
    const out = lines.join('\n');

    // An instruction reports nothing about disk. Wearing the ✓ of the writes
    // around it, it skims past as one more thing that happened — the same
    // confusion the − mark for deletions exists to prevent (field issue #36).
    expect(out).toContain('  · ');
    expect(out).not.toContain('✓ instruct:');
  });
});

describe('runInit · lint-script wiring', () => {
  const prettyPkg = (lint: string) =>
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify(
        { name: 'demo', dependencies: { vue: '^3' }, scripts: { lint } },
        null,
        2,
      ),
    );

  it('patches a fresh scaffold whose lint script misses eslint', async () => {
    prettyPkg('oxlint');

    await runInit(root, { install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint && eslint src');
  });

  it('lands the package.json patch before the install action', async () => {
    prettyPkg('oxlint');

    const actions = await runInit(root, { log: silent, exec: () => {} });

    const writeAt = actions.findIndex(
      (action) => action.kind === 'write' && action.path === 'package.json',
    );

    const installAt = actions.findIndex((action) => action.kind === 'install');

    expect(writeAt).toBeGreaterThan(-1);
    expect(writeAt).toBeLessThan(installAt);
    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint && eslint src');
  });

  it('falls back to an instruction when the script cannot be patched safely', async () => {
    // Compact JSON — the `"lint": "…"` needle (pretty formatting) misses.
    writePkg({ name: 'demo', dependencies: { vue: '^3' }, scripts: { lint: 'oxlint' } });

    const actions = await runInit(root, { install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint');

    expect(
      actions.some(
        (action) => action.kind === 'instruct' && action.note.includes('oxlint && eslint src'),
      ),
    ).toBe(true);
  });

  it('instructs — never edits — on an existing project, honoring sourceRoot', async () => {
    writePkg({ name: 'demo', dependencies: { next: '^15' }, scripts: { lint: 'oxlint' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => nextPreset({ router: 'app' }),
    });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint');

    expect(
      actions.some(
        (action) => action.kind === 'instruct' && action.note.includes('oxlint && eslint .'),
      ),
    ).toBe(true);
  });

  it('lands the lint-script patch before the install that would clobber it', async () => {
    prettyPkg('oxlint');

    const actions = await runInit(root, { install: true, exec: () => {}, log: silent });

    const patchAt = actions.findIndex(
      (action) => action.kind === 'write' && action.path === 'package.json',
    );

    const installAt = actions.findIndex((action) => action.kind === 'install');

    // npm install rewrites package.json and preserves scripts, so
    // write-then-install composes while the reverse loses the patch. Only the
    // final file was asserted before, and that reads the same either way when
    // the install is a no-op in tests.
    expect(patchAt).toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(-1);
    expect(patchAt).toBeLessThan(installAt);
  });

  it('appends the lint instruction rather than splicing it ahead of the install', async () => {
    // Only a package.json WRITE has to precede the install, because npm rewrites
    // that file. An instruction is just text, and putting advice in front of the
    // step it talks about is what the kind check prevents.
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
    prettyPkg('oxlint');

    const actions = await runInit(root, {
      install: true,
      exec: () => {},
      log: silent,
      loadConfig: async () => vuePreset(),
    });

    const installAt = actions.findIndex((action) => action.kind === 'install');

    const noteAt = actions.findIndex(
      (action) => action.kind === 'instruct' && action.note.includes('lint` script runs'),
    );

    expect(noteAt).toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(installAt);
  });

  it('appends the patch when there is no install for it to precede', async () => {
    prettyPkg('oxlint');

    const actions = await runInit(root, { install: false, log: silent });

    const patchAt = actions.findIndex(
      (action) => action.kind === 'write' && action.path === 'package.json',
    );

    const skippedAt = actions.findIndex(
      (action) => action.kind === 'instruct' && action.note.includes('Install skipped'),
    );

    // -1 is "no install action", not an index. Splicing at -1 drops the patch
    // in front of the last action queued so far — here, the skipped-install
    // note — rather than after it.
    expect(skippedAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(skippedAt);
  });

  it('leaves a lint script that already runs eslint alone', async () => {
    prettyPkg('eslint .');

    const actions = await runInit(root, { install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('eslint .');
    expect(actions.some((action) => action.note.includes('&& eslint'))).toBe(false);
  });

  it('adds the missing lint script on a fresh scaffold (field issue #1)', async () => {
    // The generated rules need a lint script to run through, but the starter
    // shipped none — the field agent had to invent one; init owns it now.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('eslint src');
  });

  it('instructs about a missing lint script on an existing project', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset(),
    });

    expect(JSON.parse(read('package.json')).scripts).toBeUndefined();

    expect(
      actions.some(
        (action) => action.kind === 'instruct' && action.note.includes('has no `lint` script'),
      ),
    ).toBe(true);
  });
});

describe('runInit · default agent targets are surfaced', () => {
  it('suggests emit.agents when both default contracts are written', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { install: false, log: silent });

    expect(
      actions.some(
        (action) => action.kind === 'instruct' && action.note.includes('emit.agents'),
      ),
    ).toBe(true);
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

describe('runInit · an introduced alias is named as a decision', () => {
  it('says the preset introduced the repo\'s first alias — and stays quiet when one existed', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const introduced = await runInit(root, { install: false, log: silent });

    expect(
      introduced.some(
        (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
      ),
    ).toBe(true);

    // A repo that already resolves an alias made that call itself.
    fs.rmSync(path.join(root, 'blueprint.config.mjs'));

    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
    );

    const detected = await runInit(root, { install: false, log: silent });

    expect(
      detected.some(
        (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
      ),
    ).toBe(false);
  });

  it('does not claim "first" on a repo whose tsconfig it could not read', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    // The alias may well be declared in here — the reader cannot tell, because a
    // missing quote makes the whole file unparseable and every `paths` reader
    // skips it. "This repo's first alias" is then a claim about a file nobody
    // read, and the note has to say so or the adopter keeps an alias that
    // duplicates one they already have.
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      '{ "compilerOptions": { "paths": { "~app: ["./src/x"] } } }',
    );

    const actions = await runInit(root, { install: false, log: silent });

    const note = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
    );

    expect(note?.kind === 'instruct' && note.note).toContain(
      'tsconfig.json could not be read (a string literal never closes at character 58)',
    );

    expect(note?.kind === 'instruct' && note.note).toContain(
      'so "first" is read from the configs that could be',
    );
  });

  it('leaves the caveat off when every config parses', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{ "compilerOptions": {} }');

    const actions = await runInit(root, { install: false, log: silent });

    const note = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
    );

    expect(note?.kind === 'instruct' && note.note).not.toContain('could not be read');
  });
});

describe('runInit · which config --authoring is allowed to take over', () => {
  it('does not re-fork on a second run over its own scaffold', async () => {
    // The config init wrote IS pristine, and that alone must not send the next
    // run back through the fork. Without --authoring there is nothing to take
    // over, and re-forking surveys the repo and re-narrates the greenfield
    // decision — on a repo that now has a config.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    await runInit(root, { install: false, log: silent });

    const lines: string[] = [];

    await runInit(root, {
      install: false,
      log: (m) => lines.push(m),
      loadConfig: async () => vuePreset(),
    });

    expect(lines.join('\n')).not.toContain('Fresh scaffold');
    expect(exists('blueprint-authoring.md')).toBe(false);
  });

  it('recognizes a scaffold written by --agent codex', async () => {
    // `--agent codex` persists `emit: { agents: ['agents'] }`, and that is still
    // init's own byte-identical output. Missing the variant makes --authoring
    // refuse to take over a config init wrote thirty seconds earlier.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    await runInit(root, { install: false, log: silent, agent: 'codex' });

    expect(read('blueprint.config.mjs')).toContain('emit: { agents: [\'agents\'] }');

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

describe('runInit · what a second run must not repeat', () => {
  const secondRun = async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    await runInit(root, { install: false, log: silent });

    const lines: string[] = [];

    const actions = await runInit(root, {
      install: false,
      log: (m) => lines.push(m),
      loadConfig: async () => vuePreset(),
    });

    return { actions, out: lines.join('\n') };
  };

  it('narrates no fork, no template cleanup, and no introduced alias', async () => {
    const { actions, out } = await secondRun();

    // The fork note only exists on the path that made the fork decision. Logging
    // it unconditionally prints "· null" — a bullet with no content, which reads
    // as a message init failed to fill in.
    expect(out).not.toContain('· null');

    // Template cleanup describes starter-template code the PRESET just landed
    // on. On a repo whose config already existed, nothing was scaffolded, so a
    // cleanup to-do points at violations init did not introduce.
    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('starter template'),
    )).toBe(false);

    // Same for the alias: this repo has no tsconfig alias, but init introduced
    // nothing on this run — the alias came from the config that was already here.
    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('first import alias'),
    )).toBe(false);
  });

  it('does not report an agent flag that was not passed', async () => {
    const { out } = await secondRun();

    // The line explains what `--agent` did. Printing it without the flag says
    // "--agent undefined", which reads as a flag init mangled.
    expect(out).not.toContain('--agent undefined');
    expect(out).not.toContain('nothing to author');
  });

  it('stays quiet about the default target set once the config declares one', async () => {
    // The note exists to surface a narrowing the user has not made yet. Once
    // `emit.agents` is in the config, repeating it tells them to declare
    // something they already declared.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    await runInit(root, { install: false, log: silent, agent: 'claude' });

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => ({ ...vuePreset(), emit: { agents: ['claude' as const] } }),
    });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('Wrote both'),
    )).toBe(false);
  });
});

describe('runInit · the gitignore heads-up counts what it re-included', () => {
  it('says "them" for more than one hidden artifact', async () => {
    // The note names the files it re-included and then tells the reader how to
    // undo it. A singular pronoun over a list of two reads as advice about one
    // of them, and the other silently stays re-included.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), '*.md\nCLAUDE.md\nAGENTS.md\n');

    const actions = await runInit(root, { install: false, log: silent });

    const note = actions.find(
      (action) => action.kind === 'write' && action.path === '.gitignore',
    )?.note;

    expect(note).toContain('re-included');
    expect(note).toContain('keep them hidden');
    expect(note).not.toContain('keep it hidden');
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

describe('runInit · reading the contract files at their declared paths', () => {
  const customPath = async (over: { agent?: 'claude' } = {}) => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// hand-written\n');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

    // Hand-written content the merge has to preserve, at a path the default
    // catalog knows nothing about.
    fs.writeFileSync(path.join(root, 'docs/CLAUDE.md'), '# our own notes\n');

    return runInit(root, {
      install: false,
      log: silent,
      ...over,
      loadConfig: async () => ({
        ...vuePreset(),
        emit: { agents: [{ target: 'claude' as const, path: 'docs/CLAUDE.md' }] },
      }),
    });
  };

  it('leaves a hand-written merge target at a custom path untouched', async () => {
    // The merge targets are read so plan can tell hand-written from generated.
    // A target missing from that read looks ABSENT, so plan writes it fresh and
    // the owner's file is replaced — instead of the reference-file route it
    // takes for anything it did not author.
    const actions = await customPath();

    expect(read('docs/CLAUDE.md')).toBe('# our own notes\n');
    expect(exists('docs/CLAUDE.blueprint.md')).toBe(true);

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('docs/CLAUDE.md is hand-written'),
    )).toBe(true);
  });

  it('still reads it when --agent narrowed the target set', async () => {
    // Narrowing to one target narrows WHICH contracts are emitted; it must not
    // erase the list. An empty target list reads every declared path as
    // undeclared, and the same overwrite follows.
    await customPath({ agent: 'claude' });

    expect(read('docs/CLAUDE.md')).toBe('# our own notes\n');
    expect(exists('docs/CLAUDE.blueprint.md')).toBe(true);
  });

  it('re-includes a gitignored contract at a custom path', async () => {
    // The ignore check is fed the same list. Losing the declared path means a
    // gitignored contract is never noticed, and whoever clones the repo gets the
    // dead links this note exists to prevent.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// hand-written\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'docs/\n');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => ({
        ...vuePreset(),
        emit: { agents: [{ target: 'claude' as const, path: 'docs/CLAUDE.md' }] },
      }),
    });

    const note = actions.find(
      (action) => action.kind === 'write' && action.path === '.gitignore',
    )?.note;

    expect(note).toContain('docs/CLAUDE.md');
  });
});

describe('runInit · where the package.json patch lands', () => {
  it('appends it after the plan when there is no install action to precede', async () => {
    // `findIndex` answers -1 for "no install action here", and -1 is a sentinel,
    // not a position. Handing it to `splice` inserts the patch second-to-last —
    // ahead of the last line plan itself produced. The report then narrates the
    // patch before the work it is meant to follow.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { install: false, log: silent });

    const patchAt = actions.findIndex(
      (action) => action.kind === 'write' && action.path === 'package.json',
    );

    const planTailAt = actions.findIndex(
      (action) => action.kind === 'instruct' && action.note.includes('in your bundler'),
    );

    expect(patchAt).toBeGreaterThan(planTailAt);
  });
});

describe('runInit · the ignore check sees the narrowed contract', () => {
  it('notices a gitignored CLAUDE.md when --agent narrowed to it', async () => {
    // With a config already on disk, `--agent` narrows the run without being
    // persisted — so the target list is the only thing naming CLAUDE.md here.
    // Losing it means a gitignored contract goes unnoticed, and whoever clones
    // the repo gets the dead links this note exists to prevent.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// hand-written\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\n');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      agent: 'claude',
      loadConfig: async () => vuePreset(),
    });

    const note = actions.find(
      (action) => action.kind === 'write' && action.path === '.gitignore',
    )?.note;

    expect(note).toContain('CLAUDE.md');
  });
});

describe('runInit · a .gitignore that arrived with CRLF', () => {
  it('detects the ignored artifacts and appends on the file\'s own line ending', async () => {
    // A .gitignore on Windows is usually CRLF, and two things had to hold for
    // this to work at all. The rules are parsed per line, so a stray `\r` on the
    // pattern would stop `CLAUDE.md` matching itself and the artifacts would look
    // un-ignored — the whole field #4 detection going quiet. And the appended
    // block has to take the file's ending rather than LF, or blueprint is the
    // reason a tracked file ends up with two conventions in it.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\r\ndocs\r\n');

    await runInit(root, { install: false, log: silent });

    const gitignore = read('.gitignore');

    // Detection still fired: the negations are there.
    expect(gitignore).toContain('!CLAUDE.md');
    expect(gitignore).toContain('!docs/architecture-handbook.md');
    expect(gitignore).toContain('keep them tracked');

    // And the whole file is on one convention — no lone LF anywhere.
    expect(gitignore).not.toMatch(/[^\r]\n/);
    expect(gitignore.startsWith('CLAUDE.md\r\ndocs\r\n')).toBe(true);
  });

  it('leaves an LF .gitignore on LF', async () => {
    // The other direction: the ending is read off the file, so neither
    // convention is imposed on the other.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\ndocs\n');

    await runInit(root, { install: false, log: silent });

    expect(read('.gitignore')).not.toContain('\r');
  });
});
