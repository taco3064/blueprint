import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BROWNFIELD_MIN_FILES } from './authoring';
import { runInit } from './bootstrap';
import { runDoctor, runInspect } from '../inspect';
import { NEXT_STRUCTURE_REFUSAL, nextPreset, reactPreset, vuePreset } from '../presets';
import type { Action } from './types';

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

    await runInit(root, { structure: 'flat', install: false, log: silent });

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

    await runInit(root, { structure: 'flat', install: false, log: silent });

    const tsconfig = JSON.parse(read('tsconfig.json'));

    expect(tsconfig.include).toEqual(['src']);
    expect(tsconfig.compilerOptions.paths).toEqual({ '~app/*': ['./src/*'] });
    expect(exists('jsconfig.json')).toBe(false);
  });

  it('leaves a hand-written AGENTS.md untouched and writes a reference instead', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# House rules\n\nBe nice.\n');

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(read('AGENTS.md')).toBe('# House rules\n\nBe nice.\n');
    expect(read('AGENTS.blueprint.md')).toContain('## Architecture contract');

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('AGENTS.md is hand-written'),
    )).toBe(true);
  });

  it('refreshes its own marker block in place on re-run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { structure: 'flat', install: false, log: silent });

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

    await runInit(root, { structure: 'flat', install: false, log: silent, loadConfig });
    const snapshot = files.map(read);

    await runInit(root, { install: false, log: silent, loadConfig });
    const again = files.map(read);

    expect(again).toEqual(snapshot);
  });

  it('writes nothing on a dry run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const actions = await runInit(root, { structure: 'flat', dryRun: true, log: silent });

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

    await expect(runInit(root, { structure: 'flat', log: silent })).rejects.toThrow(/framework/);
  });

  it('honors a forced framework when detection fails', async () => {
    writePkg({ dependencies: {} });

    await runInit(root, { structure: 'flat', framework: 'react', install: false, log: silent });

    expect(read('blueprint.config.mjs')).toContain('reactPreset()');
  });

  it('runs the install command through the injected exec', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    const commands: string[] = [];

    await runInit(root, { structure: 'flat', log: silent, exec: (command) => commands.push(command) });

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

    // The field repro was an install that threw with the alias writes below it, and
    // #37 fixed the half of it that was a lie: the output stopped claiming edits that
    // never reached disk. The other half was the state, and a codex run found it — an
    // aborted install left a config, a contract and an eslint config with no alias in
    // tsconfig or vite, so doctor said `~app resolves nowhere` (field run #131). Every
    // local write now lands ABOVE the install, so this asserts the inverse of what it
    // used to: the alias IS on disk when the install fails, and the ✓ that says so is
    // true.
    const failing = runInit(root, {
      structure: 'flat',
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

    const failing = runInit(root, { structure: 'flat', log: silent, exec: silent });

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
      structure: 'flat',
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

    await runInit(root, { structure: 'flat', log: (message) => lines.push(message), exec: () => {} });

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

  it('does not call a --preset run over real code a fresh scaffold', async () => {
    brownfield();

    const lines: string[] = [];

    await runInit(root, { install: false, preset: true, log: (m) => lines.push(m) });

    expect(read('blueprint.config.mjs')).toContain('reactPreset');

    // The fork note reads its count against the threshold — printed here it
    // would say "Fresh scaffold (12 source files < 10)", which is false and
    // arithmetically absurd in the same breath.
    expect(lines.join('\n')).not.toContain('Fresh scaffold');
  });

  it('says a --structure passed here reached nothing, and where it would', async () => {
    brownfield();

    const lines: string[] = [];

    await runInit(root, { install: false, structure: 'modular', log: (m) => lines.push(m) });

    const out = lines.join('\n');

    // The playbook is written and the flag is dropped on the floor. An adopter
    // who stated a preference and saw no acknowledgement of it reads the run as
    // having taken it — so the run says which document decides instead.
    expect(exists('blueprint-authoring.md')).toBe(true);
    expect(out).toContain('--structure modular was not used on this path');
    expect(out).toContain('the playbook authors architecture from the shape this repo already has');
    expect(out).toContain('blueprint init --preset --structure modular');
  });

  it('says nothing about the flag when none was passed', async () => {
    brownfield();

    const lines: string[] = [];

    await runInit(root, { install: false, log: (m) => lines.push(m) });

    // The note answers a question the adopter asked. Printed unasked it is a
    // paragraph about a flag they have never typed.
    expect(lines.join('\n')).not.toContain('was not used on this path');
  });

  it('keeps the preset path for a near-empty repo', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    await runInit(root, { structure: 'flat', install: false, log: silent });

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
    await runInit(root, { structure: 'flat', install: false, log: silent });
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

  it('--authoring also takes over a pristine MODULAR scaffold', async () => {
    // The coupling this flag is most likely to break, and it breaks in another
    // command: isPristineScaffold enumerates what buildConfigSource can produce,
    // so an axis missing from that list makes --authoring refuse init's own
    // output with "differs from what init would scaffold".
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    await runInit(root, { install: false, structure: 'modular', log: silent });
    expect(read('blueprint.config.mjs')).toContain('structure: \'modular\'');

    await runInit(root, { install: false, authoring: true, log: silent });

    expect(exists('blueprint.config.mjs')).toBe(false);
    expect(exists('blueprint-authoring.md')).toBe(true);
  });

  it('--authoring refuses a config that is not init\'s own output', async () => {
    writePkg({ name: 'fresh', dependencies: { react: '^18' } });

    fs.writeFileSync(
      path.join(root, 'blueprint.config.mjs'),
      '// hand-tuned\nexport default { framework: \'react\' };',
    );

    const refusal = runInit(root, { install: false, authoring: true, log: silent });

    // Not "has been edited" — all init knows is that the file differs from what it
    // would scaffold, and a config a previous agent authored differs without anyone
    // editing it. A field run was told it had edited a config it had only committed.
    await expect(refusal).rejects.toThrow('differs from what init would scaffold');

    // And what re-authoring actually costs: it rewrites rather than merges, so the
    // structure comes back and the rationale does not. "Discard your work" reads as
    // recoverable when the recoverable half is not the half worth keeping.
    await expect(refusal).rejects.toThrow('The structure is reproducible');
    await expect(refusal).rejects.toThrow('Copy anything you want to keep');

    // …and where they go back to. Saving the WHY was the whole point of this guard,
    // and it used to stop at "copy" — a field agent put them beside the clauses they
    // explain and marked that as its own invention, having found no stance (#110).
    await expect(refusal).rejects.toThrow('back into the rewritten config');
    await expect(refusal).rejects.toThrow('beside the clause it explains');
    await expect(refusal).rejects.toThrow('read once while the config is what the next');

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

    await runInit(root, { structure: 'flat', install: false, log: (message) => lines.push(message) });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    await runInit(root, { structure: 'flat', install: false, log: silent });
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

    await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(read('eslint.config.mjs')).toBe('export default [];');
    expect(exists('eslint.config.blueprint.mjs')).toBe(true);
  });

  it('re-includes gitignored artifacts via negations instead of instructing (field #4)', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'CLAUDE.md\ndocs\n');

    await runInit(root, { structure: 'flat', install: false, log: silent });

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

    await runInit(root, { structure: 'flat', install: false, log: silent });

    // Anchored at the start, with the blank lines counted: a leading blank
    // line or a surviving run of trailing ones both show up as an unexplained
    // edit in a file people read as a diff.
    expect(read('.gitignore')).toMatch(/^CLAUDE\.md\ndocs\n\n# @kekkai/);
  });

  it('states the edit and the directory-exclusion caveat in the note', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.gitignore'), 'AGENTS.md\n');

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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
      structure: 'flat',
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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

  it('does not ask a Next repo which structure to build, and says why not', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    const lines: string[] = [];

    await runInit(root, { install: false, log: (message) => lines.push(message) });

    // Every other fresh scaffold is asked and this one is not, so silence here
    // reads as a question that was answered on the adopter's behalf.
    const out = lines.join('\n');

    expect(read('blueprint.config.mjs')).toContain('nextPreset');
    expect(out).toContain('No --structure question on this run');
    expect(out).toContain('init resolved the Next preset from the route tree it detected');

    // What each value does HERE, before the shared text — which closes by telling
    // the reader to drop the option, a line addressed to the modular case while
    // this run passed none. Getting it wrong is what makes a note advertise a
    // value this repo would refuse.
    expect(out).toContain('flat is what this preset builds, and modular is refused if you pass it');

    // The explanation is nextPreset's own, not a second copy of it.
    expect(out).toContain(NEXT_STRUCTURE_REFUSAL);
  });

  it('accepts --structure flat on a Next repo, and refuses modular with the Next reason', async () => {
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default () => null;');

    // The pair is the point: a Next repo below the threshold must have a legal
    // invocation. `modular` has no Next layer list, so it is refused; `flat` is
    // the shape nextPreset already builds, so it is answered. Refused first,
    // because a refusal that had written a config is its own defect.
    await expect(runInit(root, { install: false, log: silent, structure: 'modular' }))
      .rejects.toThrow(NEXT_STRUCTURE_REFUSAL);

    expect(exists('blueprint.config.mjs')).toBe(false);

    await runInit(root, { install: false, log: silent, structure: 'flat' });

    expect(read('blueprint.config.mjs')).toContain('nextPreset');
  });

  it('asks a Next repo whose route tree could not be placed, since react is what it resolves', async () => {
    // --preset is the only way to reach the fork in this state: without it a
    // routerless Next repo returns through the authoring branch. The react
    // preset DOES take a structure, so this one is asked like any other.
    writePkg({ name: 'next-demo', dependencies: { react: '^19', next: '^15' } });

    await expect(runInit(root, { install: false, preset: true, log: silent }))
      .rejects.toThrow('blueprint init needs --structure here');
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

    await runInit(root, { structure: 'flat', install: false, log: (message) => lines.push(message) });

    expect(lines.join('\n')).toContain('Fresh scaffold (0 source files < 10)');
    expect(lines.join('\n')).toContain('authoring playbook');
  });
});

describe('runInit · how the plan is reported', () => {
  it('lists the plan up front only in dry-run', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const dry: string[] = [];

    await runInit(root, { structure: 'flat', dryRun: true, install: false, log: (m) => dry.push(m) });

    expect(dry.join('\n')).toContain('would write');

    const applied: string[] = [];

    await runInit(root, { structure: 'flat', install: false, log: (m) => applied.push(m) });

    // Outside dry-run the applied lines ARE the report. A "would" among them
    // claims something about disk that already happened, or did not.
    expect(applied.join('\n')).not.toContain('would ');
    expect(applied.join('\n')).toContain('✓ write:');
  });

  it('marks an instruction with a bullet, never with an effect mark', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const lines: string[] = [];

    await runInit(root, { structure: 'flat', install: false, log: (m) => lines.push(m) });
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

    await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint && eslint src');
  });

  it('lands the package.json patch before the install action', async () => {
    prettyPkg('oxlint');

    const actions = await runInit(root, { structure: 'flat', log: silent, exec: () => {} });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: true, exec: () => {}, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('eslint .');
    expect(actions.some((action) => action.note.includes('&& eslint'))).toBe(false);
  });

  it('adds the missing lint script on a fresh scaffold (field issue #1)', async () => {
    // The generated rules need a lint script to run through, but the starter
    // shipped none — the field agent had to invent one; init owns it now.
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent, agent: 'claude' });

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

describe('runInit · --structure reaches the config init writes', () => {
  it('declares the modular structure in the scaffolded config', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, log: silent, structure: 'modular' });

    // The config is the artifact every later command reads, so it — not the run's
    // narration — is what has to carry the answer.
    expect(read('blueprint.config.mjs'))
      .toContain('export default vuePreset({ name: \'demo\', structure: \'modular\' });');
  });

  it('plans the modular config under --dry-run and writes nothing', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const lines: string[] = [];

    const actions = await runInit(root, {
      install: false,
      dryRun: true,
      structure: 'modular',
      log: (message) => lines.push(message),
    });

    const config = actions.find(
      (action) => action.kind === 'write' && action.path === 'blueprint.config.mjs',
    );

    // Both halves. A dry run that planned a FLAT config would still print this
    // line and still leave the tree clean, so the plan's content is the half
    // that reads what the flag did.
    expect(config).toMatchObject({ content: expect.stringContaining('structure: \'modular\'') });
    expect(lines.join('\n')).toContain('would write: blueprint.config.mjs');
    expect(exists('blueprint.config.mjs')).toBe(false);
  });
});

describe('runInit · a fresh tree is asked which structure to build', () => {
  /** A Vite-shaped starter: real files, and still below the brownfield threshold. */
  function starter(deps: Record<string, string> = { vue: '^3' }): void {
    writePkg({ name: 'demo', dependencies: deps });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(root, 'src/App.ts'), 'export const y = 1;');
  }

  it('refuses, naming the flag, both values, and the count against the threshold', async () => {
    starter();

    const failing = runInit(root, { install: false, log: silent });

    // The criterion, computed rather than asserted: a hard-coded count or a
    // threshold read from somewhere else turns this line red.
    await expect(failing).rejects.toThrow(
      `2 source files, below the brownfield threshold (${BROWNFIELD_MIN_FILES})`,
    );

    // The clause that stops an adopting agent hunting for a detection fix.
    await expect(failing).rejects.toThrow('not a detection failure');

    // Both values, each as a command that can be pasted — the refusal's whole
    // job is to be satisfiable from what it printed.
    await expect(failing).rejects.toThrow('blueprint init --structure flat');
    await expect(failing).rejects.toThrow('blueprint init --structure modular');

    // And why it refuses instead of defaulting, or the next reader files it as
    // a tool that forgot to have a default.
    await expect(failing).rejects.toThrow('the config migration is free, the file migration is not');

    expect(exists('blueprint.config.mjs')).toBe(false);
  });

  it.each([
    ['flat', 'export default vuePreset({ name: \'demo\' });'],
    ['modular', 'export default vuePreset({ name: \'demo\', structure: \'modular\' });'],
  ] as const)('proceeds once the answer is %s', async (structure, expected) => {
    starter();

    await runInit(root, { install: false, log: silent, structure });

    expect(read('blueprint.config.mjs')).toContain(expected);
  });

  it('does not ask again once a config answers it', async () => {
    starter();

    await runInit(root, { install: false, log: silent, structure: 'flat' });

    // The re-run an adopter actually types: same tree, same size, no flag. The
    // config on disk is the answer, so a second question would be one the repo
    // has already answered in writing.
    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => vuePreset({ name: 'demo' }),
    });

    expect(actions.length).toBeGreaterThan(0);
    expect(read('blueprint.config.mjs')).toContain('vuePreset');
  });

  it('refuses on --preset too — that flag skips the playbook, not the question', async () => {
    starter();

    await expect(runInit(root, { install: false, preset: true, log: silent }))
      .rejects.toThrow('blueprint init needs --structure here');

    expect(exists('blueprint.config.mjs')).toBe(false);
  });

  it('never reaches the question under --authoring: the playbook returns first', async () => {
    starter();

    await runInit(root, { install: false, authoring: true, log: silent });

    expect(exists('blueprint-authoring.md')).toBe(true);
    expect(exists('blueprint.config.mjs')).toBe(false);
  });

  it('does not ask a brownfield repo scaffolding a preset', async () => {
    writePkg({ name: 'legacy', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });

    for (let i = 0; i < BROWNFIELD_MIN_FILES; i++) {
      fs.writeFileSync(path.join(root, `src/app/file${i}.ts`), 'export const x = 1;');
    }

    // "There is nothing here to measure" is false on a repo this size, and a
    // refusal whose stated reason is false is worse than a default. So --preset
    // above the threshold scaffolds flat, unasked.
    await runInit(root, { install: false, preset: true, log: silent });

    expect(read('blueprint.config.mjs')).toContain('export default vuePreset({ name: \'legacy\' });');
  });

  it('refuses before printing any of the plan under --dry-run', async () => {
    starter();

    const lines: string[] = [];

    await expect(runInit(root, { dryRun: true, log: (message) => lines.push(message) }))
      .rejects.toThrow('blueprint init needs --structure here');

    // A plan printed above the refusal reads as a run that was going to work —
    // the banner alone ("blueprint init --dry-run · vue · npm") is enough to.
    expect(lines).toEqual([]);
  });
});

describe('runInit · the codeStyle heads-up is scoped to a fresh scaffold', () => {
  it('announces what codeStyle will demand when init generated the config', async () => {
    writePkg({ name: 'demo', dependencies: { react: '^18' } });

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('`codeStyle` on at error tier'),
    )).toBe(true);
  });

  it('says nothing when the config was already the repo\'s own', async () => {
    // The owner already chose; there is nothing to announce. Both halves matter — a
    // repo with its own config and codeStyle at error tier must stay quiet, which is
    // what stops the condition collapsing to its second half.
    writePkg({ name: 'demo', dependencies: { react: '^18' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');

    const actions = await runInit(root, {
      install: false,
      log: silent,
      loadConfig: async () => reactPreset({ name: 'demo' }),
    });

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('codeStyle` on at error tier'),
    )).toBe(false);
  });
});

describe('runInit · the codeStyle reason branches on what the run put inside the net', () => {
  // The byte baseline for the arm this ticket must not touch, restated here because
  // the source keeps the text private. Rendered from `origin/main` at d35c04e and
  // diffed against this string — a character moving in EITHER arm's shared halves
  // turns this red, which is the only thing that can see a shared-text refactor.
  const FLAT_NOTE
    = 'The preset turned `codeStyle` on at error tier: it pins indent (2), quotes (single), '
      + 'semicolons (required) and line width (90) across ~68 rules. Nearly all are auto-fixable, '
      + 'so when there IS code inside a layer, run `npx eslint . --fix` once and land that pass as '
      + 'its own commit — the formatting churn never mixes with a real change. While the layers '
      + 'are still empty that pass is a no-op: the gate reaches only files a layer glob matches, '
      + 'and a starter\'s root files sit outside every one of them. It exempts nothing by style '
      + 'either: a starter written without semicolons is silent today and fails the day its first '
      + 'file moves into a layer, which is when the --fix pass earns its commit. Already have a '
      + 'formatter you trust? Set `codeStyle: \'off\'` in the config and keep yours — blueprint '
      + 'does not need it to enforce structure.';

  const noteOf = (actions: Action[]): string | undefined =>
    actions.find(
      (action): action is Extract<Action, { kind: 'instruct' }> =>
        action.kind === 'instruct' && action.note.includes('`codeStyle` on at error tier'),
    )?.note;

  const fresh = (): void => writePkg({
    name: 'demo',
    dependencies: { react: '^19' },
    devDependencies: { typescript: '^5' },
  });

  const starter = (): void => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/main.tsx'), 'export const x = 1;');
    fs.writeFileSync(path.join(root, 'src/App.tsx'), 'export const y = 1;');
  };

  // What `inspect` reports inside the layer nets, read off the line an adopter
  // reads. `renderCoverage` has two shapes and both are taken; anything else
  // answers null, so a third shape fails the count assertion instead of skipping.
  const insideNets = (output: string): number | null => {
    const counted = /Coverage: (\d+)\/\d+ source files inside layer nets/.exec(output);

    if (counted) return Number(counted[1]);

    return /layer globs match 0 of \d+ source file\(s\)/.test(output) ? 0 : null;
  };

  it('leaves the flat arm byte for byte', async () => {
    fresh();

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(noteOf(actions)).toBe(FLAT_NOTE);
  });

  it('gives a modular scaffold the reason its own writes support', async () => {
    fresh();

    const actions = await runInit(root, { structure: 'modular', install: false, log: silent });
    const note = noteOf(actions) ?? '';

    // The conclusion survives — it is the reason underneath it that changes.
    expect(note).toContain('That pass is a no-op');
    expect(note).toContain('the module entries above are inside the gate, not outside it');
    expect(note).toContain('already conforming to all ~68 rules');
    expect(note).toContain('earns its commit when the first real code lands in a layer');

    // The false clause, and the one this arm must not claim either way: the three
    // entries sit at the MODULE roots, so `inspect` still reports one missing-layer
    // per declared layer on this same tree.
    expect(note).not.toContain('sit outside every one of them');
    expect(note).not.toContain('While the layers are still empty');

    // A starter's own files are what that sentence is about, and there is no starter
    // here — the only files in reach are the ones init just wrote.
    expect(note).not.toContain('written without semicolons');
  });

  it('takes the flat arm where a modular config scaffolded nothing', async () => {
    // Keyed on what this run wrote into the net, not on `modules` being declared:
    // `plan`'s hasSourceFiles guard scaffolds nothing here, so the files in reach
    // are the starter's own at the source root — which is what the flat arm says.
    // Compared against the same constant, so the two arms can never drift into two
    // texts saying one thing.
    fresh();
    starter();

    const actions = await runInit(root, { structure: 'modular', install: false, log: silent });

    expect(noteOf(actions)).toBe(FLAT_NOTE);
  });

  // The composition, not the sentence: whether init may print a reason that says the
  // gate reaches nothing is decided by what `inspect` measures on the tree init just
  // built — computed per tree, never read off the fixture's name.
  const trees = [
    ['flat, empty', 'flat', 0, () => {}],
    ['modular, empty', 'modular', 3, () => {}],
    ['modular, already holding files', 'modular', 0, starter],
  ] as const;

  it.each(trees)(
    '%s: no sentence in the init run contradicts what inspect reports for that tree',
    async (_label, structure, expectedInside, seed) => {
      fresh();
      seed();

      const initLines: string[] = [];

      await runInit(root, { structure, install: false, log: (line) => initLines.push(line) });

      const inspectLines: string[] = [];

      await runInspect(root, {
        log: (line) => inspectLines.push(line),
        loadConfig: async () => reactPreset({ name: 'demo', structure }),
      });

      const inside = insideNets(inspectLines.join('\n'));

      // The count itself, or the rule below is satisfied by a scaffold that stopped
      // writing files: 0/0 would let every tree take the flat arm and stay green.
      expect(inside, 'files inside the layer nets').toBe(expectedInside);

      // The flat arm's reason, clause by clause. Together they claim the gate reaches
      // nothing that exists — a claim `inspect` settles for this tree, so it may
      // appear only where nothing is measured inside the nets.
      const denied = [
        'While the layers are still empty',
        'the gate reaches only files a layer glob matches',
        'a starter\'s root files sit outside every one of them',
      ];

      const output = initLines.join('\n');

      for (const clause of denied) {
        expect(output.includes(clause), `"${clause}" with ${inside} file(s) inside the nets`)
          .toBe(inside === 0);
      }
    },
  );
});

describe('runInit · an introduced alias is named as a decision', () => {
  it('says the preset introduced the repo\'s first alias — and stays quiet when one existed', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    const introduced = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const detected = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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
    await runInit(root, { structure: 'flat', install: false, log: silent });

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
    await runInit(root, { structure: 'flat', install: false, log: silent, agent: 'codex' });

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

    await runInit(root, { structure: 'flat', install: false, log: (m) => lines.push(m) });

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
    await runInit(root, { structure: 'flat', install: false, log: silent });

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
    await runInit(root, { structure: 'flat', install: false, log: silent, agent: 'claude' });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

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

    const actions = await runInit(root, { structure: 'flat', install: false, log: silent });

    const patchAt = actions.findIndex(
      (action) => action.kind === 'write' && action.path === 'package.json',
    );

    const planTailAt = actions.findIndex(
      (action) => action.kind === 'instruct' && action.note.includes('in your bundler'),
    );

    expect(patchAt).toBeGreaterThan(planTailAt);

    // After the LAST action the plan had produced, which is where the assertion above
    // is blind: `splice(-1, …)` moves the patch exactly one place, so it clears the
    // bundler instruct either way and only the final optional instruct changes sides.
    // "Last overall" is not the contract — the preset's own notes are appended after
    // the wiring — so the pin is the action `splice(-1, …)` jumps ahead of.
    const optionalTailAt = actions.findIndex(
      (action) => action.kind === 'instruct' && action.note.includes('CSS token governance'),
    );

    expect(optionalTailAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(optionalTailAt);
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

    await runInit(root, { structure: 'flat', install: false, log: silent });

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

    await runInit(root, { structure: 'flat', install: false, log: silent });

    expect(read('.gitignore')).not.toContain('\r');
  });
});

describe('runInit · a modular scaffold builds the modules, not the layers', () => {
  const blueprint = () => reactPreset({ name: 'demo', structure: 'modular' });

  // Injected: the real path dynamic-imports blueprint.config.mjs, which resolves
  // `@kekkai/blueprint` from a temp dir that has no node_modules.
  const loadConfig = async () => blueprint();

  function fresh(): void {
    writePkg({
      name: 'demo',
      dependencies: { react: '^19' },
      devDependencies: { typescript: '^5' },
    });
  }

  async function scaffold(): Promise<void> {
    fresh();

    await runInit(root, { install: false, structure: 'modular', log: silent });
  }

  it('creates the declared modules and their entries on an empty tree', async () => {
    await scaffold();

    expect(read('src/app/index.ts')).toContain('export {};');
    expect(read('src/app/main.tsx')).toContain('export {};');
    expect(read('src/common/index.ts')).toContain('export {};');
  });

  it('creates no layer folder under the config it wrote in the same run', async () => {
    await scaffold();

    // Every one of these was created by init until #261, under the modular config
    // init wrote seconds earlier — and each is an `undeclared-module` in it, the
    // exact position #240's note tells the adopter not to create.
    for (const layer of blueprint().architecture.layers) {
      expect(exists(`src/${layer.name}`), `src/${layer.name}`).toBe(false);
    }
  });

  it('is clean under inspect, with the module notes gone and the layer notes runway', async () => {
    await scaffold();

    const { findings, ok } = await runInspect(root, { log: silent, loadConfig });

    expect(ok).toBe(true);
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(findings.filter((finding) => finding.severity === 'warn')).toEqual([]);

    // Scoped by rule, and counted off the preset: the report carries other notes
    // here (declaratory-self-only, owns-not-installed), so a total would read
    // green while these moved.
    expect(findings.filter((finding) => finding.rule === 'missing-layer'))
      .toHaveLength(blueprint().architecture.layers.length);

    // The load-bearing one: 2 before this ticket, 0 after. It is the only
    // assertion here that the modules were really created — `missing-layer`
    // could be 3 or 5 without moving it.
    expect(findings.filter((finding) => finding.rule === 'missing-module')).toEqual([]);
  });

  it('leaves doctor\'s architecture check green on the tree it built', async () => {
    await scaffold();

    const { checks } = await runDoctor(root, { log: silent, loadConfig });
    const architecture = checks.find((check) => check.label.includes('architecture'));

    expect(architecture, 'doctor has no architecture check').toBeDefined();
    expect(architecture).toMatchObject({ ok: true });
    // A skip rides on `ok: true` by design, so the green has to be read twice.
    expect(architecture?.skipped).toBeUndefined();
  });

  it('lists the modules as would-write under --dry-run and touches nothing', async () => {
    fresh();

    const lines: string[] = [];

    await runInit(root, {
      install: false,
      dryRun: true,
      structure: 'modular',
      log: (message) => lines.push(message),
    });

    const out = lines.join('\n');

    expect(out).toContain('would write: src/app/index.ts');
    expect(out).toContain('would write: src/app/main.tsx');
    expect(out).toContain('would write: src/common/index.ts');
    expect(exists('src')).toBe(false);
  });

  it('scaffolds nothing on a tree that already holds code, and says why in the same run', async () => {
    fresh();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/main.tsx'), 'export const x = 1;');
    fs.writeFileSync(path.join(root, 'src/App.tsx'), 'export const y = 1;');

    const lines: string[] = [];

    await runInit(root, {
      install: false,
      structure: 'modular',
      log: (message) => lines.push(message),
    });

    expect(exists('src/app')).toBe(false);
    expect(exists('src/common')).toBe(false);

    const out = lines.join('\n');

    // All three jobs, on the arm where the third is the whole answer.
    expect(out).toContain('No module folder was created');
    expect(out).toContain('a net that catches nothing');
    expect(out).toContain('cannot name a domain it has never seen');
    expect(out).toContain('nothing on disk demonstrates it');
  });

  it('leaves a flat scaffold building layer folders and no module entry', async () => {
    writePkg({ name: 'demo', dependencies: { vue: '^3' } });

    await runInit(root, { install: false, structure: 'flat', log: silent });

    expect(exists('src/services/.gitkeep')).toBe(true);
    expect(exists('src/app')).toBe(false);
    expect(exists('src/common')).toBe(false);
  });
});
