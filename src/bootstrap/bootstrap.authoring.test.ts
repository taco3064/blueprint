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
      [
        'import logo from "../../assets/logo.svg";',
        'import a from "../../assets/a.svg";',
      ].join('\n'),
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
