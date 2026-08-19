import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

const prettyPkg = (lint: string) =>
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      { name: 'demo', dependencies: { vue: '^3' }, scripts: { lint } },
      null,
      2,
    ),
  );

describe('runInit · lint-script wiring', () => {
  it('patches a fresh scaffold whose lint script misses eslint', async () => {
    prettyPkg('oxlint');

    await runInit(root, { install: false, log: silent });

    expect(JSON.parse(read('package.json')).scripts.lint).toBe('oxlint && eslint src');
  });

  // The existing script is spliced into the replacement, and a string
  // replacement is a pattern language: `$&` there means "whatever the needle
  // matched" and re-inserts the whole `"lint": "…"` line inside its own value,
  // while `$$` collapses to one `$`. npm hands a script to the shell verbatim,
  // so both spellings are legal in one — `$$` is the shell's own PID.
  it.each([
    // Loud: the re-inserted quotes leave a package.json that no longer parses.
    ['$&', 'oxlint && echo "$&"'],
    // Quiet, and worse: still valid JSON, one character short of what was there.
    ['$$', 'oxlint --output /tmp/lint.$$.log'],
  ])('keeps %s in an existing lint script as text when it patches around it', async (_, script) => {
    prettyPkg(script);

    await runInit(root, { install: false, log: silent });

    // The raw text first — a corrupted file fails `JSON.parse` before any
    // assertion about the value it holds can be read.
    expect(read('package.json')).toContain(
      `"lint": ${JSON.stringify(`${script} && eslint src`)}`,
    );

    expect(JSON.parse(read('package.json')).scripts.lint).toBe(`${script} && eslint src`);
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

describe('runInit · where the lint-script action lands in the plan', () => {
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
});

describe('runInit · an introduced alias is named as a decision', () => {
  it('says the preset introduced the repo\'s first alias — '
    + 'and stays quiet when one existed', async () => {
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
      (action) => action.kind === 'instruct' && action.note.includes(
        'docs/CLAUDE.md is hand-written',
      ),
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
