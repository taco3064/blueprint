import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  claudeDirState,
  detect,
  GENERATED_ESLINT_BANNER,
  quotedIn,
  readTexts,
} from './detect';
import { pathAliasKeys } from './tsconfig';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-detect-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writePkg(content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(content));
}

describe('detect · what package.json answers', () => {
  it('detects vue from dependencies and reads the project name', () => {
    writePkg({ name: 'app', dependencies: { vue: '^3' } });

    const state = detect(root);

    expect(state.framework).toBe('vue');
    expect(state.projectName).toBe('app');
  });

  it('detects react from devDependencies', () => {
    writePkg({ devDependencies: { react: '^18' } });

    expect(detect(root).framework).toBe('react');
  });

  it('is ambiguous (null) when both or neither framework is present', () => {
    writePkg({ dependencies: { vue: '1', react: '1' } });
    expect(detect(root).framework).toBeNull();

    writePkg({ dependencies: {} });
    expect(detect(root).framework).toBeNull();
  });

  it('detects the package manager from lockfiles', () => {
    writePkg({});
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
    expect(detect(root).packageManager).toBe('pnpm');

    fs.rmSync(path.join(root, 'pnpm-lock.yaml'));
    fs.writeFileSync(path.join(root, 'yarn.lock'), '');
    expect(detect(root).packageManager).toBe('yarn');
  });

  it('keeps every dependency name, prod and dev merged', () => {
    // The same read `hasTypescript` / `hasNext` / `hasNuxt` are squeezed out of.
    // Kept as names because a caller asks questions this file cannot enumerate:
    // `inspect` checks each `owns` package against this list.
    writePkg({ dependencies: { vue: '^3', axios: '^1' }, devDependencies: { typescript: '5' } });

    expect(detect(root).dependencies.sort()).toEqual(['axios', 'typescript', 'vue']);
  });

  it('reports no dependencies when package.json declares none', () => {
    // Empty, never undefined — "the read happened and found nothing" is what
    // lets a caller distinguish it from "could not read".
    writePkg({ name: 'x' });

    expect(detect(root).dependencies).toEqual([]);
  });

  it('tolerates a missing or malformed package.json', () => {
    expect(detect(root).framework).toBeNull();
    expect(detect(root).missingDeps).toContain('eslint');
    expect(detect(root).missingDeps).toHaveLength(5);
    expect(detect(root).existingSrcDirs).toEqual([]);
    expect(detect(root).hasViteConfig).toBe(false);
    expect(detect(root).hasTypescript).toBe(false);

    fs.writeFileSync(path.join(root, 'package.json'), '{ not json');
    expect(detect(root).framework).toBeNull();
  });
});

describe('detect · what the files on disk answer', () => {
  it('reports the config files, tsconfig variants and src dirs it finds', () => {
    writePkg({ name: 'x', devDependencies: { eslint: '9', typescript: '5' } });

    for (const [file, text] of Object.entries({
      'blueprint.config.mjs': '',
      'eslint.config.js': '',
      'vite.config.ts': '',
      'tsconfig.json': '{}',
    })) {
      fs.writeFileSync(path.join(root, file), text);
    }

    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });

    const state = detect(root);

    expect(state.hasConfig).toBe(true);
    expect(state.hasEslintConfig).toBe(true);
    expect(state.hasViteConfig).toBe(true);
    expect(state.hasTypescript).toBe(true);

    expect(state.tsconfigs).toEqual({
      'tsconfig.json': '{}',
      'tsconfig.app.json': null,
      'jsconfig.json': null,
    });

    expect(state.existingSrcDirs).toEqual(['components']);

    // A bare flat config (no tseslint.config call) reads as a flat array.
    expect(state.eslintConfigShape).toBe('flat-array');
    expect(state.legacyEslintConfig).toBeUndefined();
  });

  it('names the install set, and the runner a repo with no lockfile gets', () => {
    writePkg({ name: 'x', devDependencies: { eslint: '9', typescript: '5' } });

    const state = detect(root);

    // typescript in devDependencies pulls the ts parser into the install set.
    expect(state.missingDeps).toEqual([
      '@kekkai/blueprint',
      '@eslint-community/eslint-plugin-eslint-comments',
      '@stylistic/eslint-plugin',
      'eslint-plugin-import-x',
      'typescript-eslint',
    ]);

    expect(state.packageManager).toBe('npm');
  });

  it('detects the eslint config shape: tseslint vs legacy .eslintrc', () => {
    writePkg({ name: 'x', dependencies: { vue: '^3' } });

    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      'import tseslint from \'typescript-eslint\';\nexport default tseslint.config();',
    );

    expect(detect(root).eslintConfigShape).toBe('tseslint');

    fs.rmSync(path.join(root, 'eslint.config.mjs'));
    fs.writeFileSync(path.join(root, '.eslintrc.cjs'), 'module.exports = {};');

    const legacy = detect(root);

    expect(legacy.hasEslintConfig).toBe(false);
    expect(legacy.legacyEslintConfig).toBe('.eslintrc.cjs');
    expect(legacy.eslintConfigShape).toBe('legacy');
  });

  it('adds the vue parser to the install set for vue projects', () => {
    writePkg({ name: 'v', dependencies: { vue: '^3' } });
    expect(detect(root).missingDeps).toContain('vue-eslint-parser');
    expect(detect(root).missingDeps).not.toContain('typescript-eslint');

    writePkg({ name: 'v', dependencies: { vue: '^3' }, devDependencies: { typescript: '5' } });
    expect(detect(root).missingDeps).toContain('typescript-eslint');
  });

  it('reports a vite config that exists but cannot be read', () => {
    // A DIRECTORY named vite.config.ts: `existsSync` says yes, `readFileSync`
    // throws. The two facts are deliberately separate — the file IS there, so
    // `hasViteConfig` stands, while `viteConfig` (its contents) does not. An
    // alias check that reads `viteConfig.text` would otherwise crash on a repo
    // whose config is unreadable for any reason.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'vite.config.ts'));

    const state = detect(root);

    expect(state.hasViteConfig).toBe(true);
    expect(state.viteConfig).toBeUndefined();
  });
});

describe('readTexts', () => {
  it('reads present files and nulls absent ones, keyed by the given path', () => {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'CLAUDE.md'), 'hi');

    expect(readTexts(root, ['docs/CLAUDE.md', 'AGENTS.md'])).toEqual({
      'docs/CLAUDE.md': 'hi',
      'AGENTS.md': null,
    });
  });
});

describe('detect · Next router detection', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-next-'));

    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'n', dependencies: { next: '^15', react: '^19' } }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects both route trees during a migration', () => {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'pages'), { recursive: true });

    const state = detect(root);

    expect(state.nextRouter).toBe('both');
    expect(state.nextSrcDir).toBe(false);
  });

  it('detects a src-dir pages router', () => {
    fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true });

    const state = detect(root);

    expect(state.nextRouter).toBe('pages');
    expect(state.nextSrcDir).toBe(true);
  });

  it('reports no router when neither tree exists', () => {
    expect(detect(root).nextRouter).toBe(null);
  });

  it('skips the router probe entirely on a project that is not Next', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-plain-'));

    try {
      fs.writeFileSync(
        path.join(plain, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3' } }),
      );

      // `src/app` is an ordinary layer folder in a Vue repo. Probing it as a
      // Next route tree would report a router this project does not have.
      fs.mkdirSync(path.join(plain, 'src', 'app'), { recursive: true });

      const state = detect(plain);

      // Both fields need their absent VALUES, not just absence: an undefined
      // nextSrcDir reads as false everywhere it is consumed, so the wrong shape
      // stays invisible until something compares it.
      expect(state.hasNext).toBe(false);
      expect(state.nextRouter).toBe(null);
      expect(state.nextSrcDir).toBe(false);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('detect · workspace-aware package manager', () => {
  it('finds the pnpm lockfile at the workspace root above the package', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ws-'));

    try {
      fs.writeFileSync(path.join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
      const pkg = path.join(workspace, 'apps', 'web');

      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'web' }));

      expect(detect(pkg).packageManager).toBe('pnpm');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('stops at an npm lockfile found on the way up', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ws-'));

    try {
      fs.writeFileSync(path.join(workspace, 'package-lock.json'), '{}');
      const pkg = path.join(workspace, 'apps', 'web');

      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'web' }));

      expect(detect(pkg).packageManager).toBe('npm');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('finds a yarn lockfile upward, and next flags the framework state', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ws-'));

    try {
      fs.writeFileSync(path.join(workspace, 'yarn.lock'), '');
      const pkg = path.join(workspace, 'packages', 'ui');

      fs.mkdirSync(pkg, { recursive: true });

      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({ name: 'ui', dependencies: { react: '^19', next: '^15' } }),
      );

      const state = detect(pkg);

      expect(state.packageManager).toBe('yarn');
      expect(state.hasNext).toBe(true);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('detect · the states a config file can be in', () => {
  it('does not call blueprint\'s own generated config a hand-wired one', () => {
    // `ownedEslintConfig` means init wrote it, so it names the package by
    // construction. Counting that as "the owner wired it in" makes init skip the
    // reference file on a repo that never wired anything by hand — and the
    // reference is what tells the owner what to merge.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });

    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      `${GENERATED_ESLINT_BANNER}\nexport default [];\n`,
    );

    const state = detect(root);

    expect(state.ownedEslintConfig).toBe('eslint.config.mjs');
    expect(state.wiredEslintConfig).toBe(false);
  });

  it('reports a legacy .eslintrc only when there is no flat config', () => {
    // A repo mid-migration has both. The flat config is the one eslint reads, so
    // naming the .eslintrc as legacy routes the owner to a migration they have
    // already done — and past the flat-array merge instruction they need.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, '.eslintrc.cjs'), 'module.exports = {};');
    fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default [];');

    const both = detect(root);

    expect(both.legacyEslintConfig).toBeUndefined();
    expect(both.eslintConfigShape).toBe('flat-array');

    // Without the flat config, the .eslintrc is the whole story.
    fs.rmSync(path.join(root, 'eslint.config.mjs'));

    const legacyOnly = detect(root);

    expect(legacyOnly.legacyEslintConfig).toBe('.eslintrc.cjs');
    expect(legacyOnly.eslintConfigShape).toBe('legacy');
  });

  it('leaves the config shape undefined when there is no config at all', () => {
    // Nothing to merge into, so there is no shape to describe. Claiming
    // `flat-array` sends the owner to spread into an array that is not there.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });

    const state = detect(root);

    expect(state.eslintConfigShape).toBeUndefined();
    expect(state.hasEslintConfig).toBe(false);
  });

  it('carries the vite config only when its text could be read', () => {
    // The alias check reads this text. Reporting a config whose text is null
    // makes every reader handle an absent string for a file that is present,
    // and a directory named vite.config.ts is exactly that case.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'vite.config.ts'));

    const unreadable = detect(root);

    expect(unreadable.hasViteConfig).toBe(true); // the path exists…
    expect(unreadable.viteConfig).toBeUndefined(); // …but there is no text

    fs.rmdirSync(path.join(root, 'vite.config.ts'));
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default {};');

    expect(detect(root).viteConfig).toEqual({
      file: 'vite.config.ts',
      text: 'export default {};',
    });
  });

  it('ignores a package name that is not a string', () => {
    // A hand-edited manifest can hold anything. The name titles the handbook and
    // lands in the generated config as a quoted literal — a number there emits
    // `name: '42'`, and an object emits `[object Object]`.
    writePkg({ name: 42, dependencies: { vue: '^3' } });

    expect(detect(root).projectName).toBeUndefined();
  });

  it('lists only directories under src/, never the files beside them', () => {
    // `existingSrcDirs` answers "which layers already exist". A file counted as
    // a folder makes init believe a layer is present and skip scaffolding it.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.ts'), 'export {};');

    expect(detect(root).existingSrcDirs).toEqual(['components']);
  });

  it('stops at the nearest lockfile rather than the outermost one', () => {
    // A package with its own package-lock.json inside a pnpm workspace installs
    // with npm. Walking past it reports pnpm, and every install command init
    // prints is for the wrong package manager.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ws-mixed-'));

    try {
      fs.writeFileSync(path.join(workspace, 'pnpm-lock.yaml'), '');

      const pkg = path.join(workspace, 'apps', 'web');

      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'web' }));
      fs.writeFileSync(path.join(pkg, 'package-lock.json'), '{}');

      expect(detect(pkg).packageManager).toBe('npm');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('quotedIn · escaping the alias before it becomes a pattern', () => {
  it('escapes a regex metacharacter in the alias name', () => {
    // `$lib` is an ordinary alias (SvelteKit ships it), and `$` is an anchor in
    // a regular expression. Unescaped, the pattern demands end-of-line right
    // after the alias and matches nothing — doctor then reports a wired alias
    // as resolving nowhere, on a bundler config that declares it.
    expect(quotedIn('resolve: { alias: { \'$lib\': \'/src/lib\' } }', '$lib')).toBe(true);

    // And a plain alias still has to match — escaping the wrong half of the
    // character set breaks these instead.
    expect(quotedIn('alias: { \'~app\': \'/src\' }', '~app')).toBe(true);
    expect(quotedIn('import x from \'@scope/pkg\';', '~app')).toBe(false);
  });
});

describe('detect · every filename on each config allowlist', () => {
  // One name per list stood in for all of them, so the rest could be dropped and
  // nothing would fail. Each is a real file an adopter has: missing one makes
  // detect report "no eslint config" on a repo that has one, and init then writes
  // a second config beside the first — two configs, two ledgers, which is the
  // exact state the legacy check exists to prevent.
  //
  // `eslint.config.ts` is the sharp one: it is what THIS repo uses.
  it.each(['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts'])(
    'finds a flat config named %s',
    (file) => {
      writePkg({ name: 'x', dependencies: { vue: '^3' } });
      fs.writeFileSync(path.join(root, file), 'export default [];');

      const state = detect(root);

      expect(state.hasEslintConfig).toBe(true);
      expect(state.eslintConfigFile).toBe(file);
      expect(state.legacyEslintConfig).toBeUndefined();
    },
  );

  it.each([
    '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc',
  ])('recognises %s as a legacy config needing migration', (file) => {
    // A legacy config missed here routes the owner to a fresh flat config written
    // next to their .eslintrc — instead of to the migration the state requires.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, file), '{}');

    const state = detect(root);

    expect(state.legacyEslintConfig).toBe(file);
    expect(state.eslintConfigShape).toBe('legacy');
  });

  it.each(['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts'])(
    'reads the alias out of %s',
    (file) => {
      // The vite config is one of the two places an alias can be wired. A name
      // missed here makes doctor report a declared alias as resolving nowhere on
      // a repo whose bundler resolves it fine.
      writePkg({ name: 'x', dependencies: { vue: '^3' } });

      fs.writeFileSync(
        path.join(root, file),
        'export default { resolve: { alias: { \'~app\': \'/src\' } } };',
      );

      const state = detect(root);

      expect(state.hasViteConfig).toBe(true);
      expect(state.viteConfig?.file).toBe(file);
    },
  );

  it.each(['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json'])(
    'reads path aliases out of %s',
    (file) => {
      writePkg({ name: 'x', dependencies: { vue: '^3' } });

      fs.writeFileSync(
        path.join(root, file),
        JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
      );

      expect([...pathAliasKeys(detect(root).tsconfigs)]).toEqual(['~app']);
    },
  );
});

describe('claudeDirState · both halves of the cleanup sentence, measured', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-claude-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const commands = () => path.join(dir, '.claude', 'commands');

  it('reads a repo with neither the directory nor any command', () => {
    expect(claudeDirState(dir)).toEqual({ hadDir: false, otherCommands: 0 });
  });

  it('counts the owner commands beside blueprint own, and not blueprint own', () => {
    // The sentence said "the now-empty `.claude/commands/` directory" while measuring
    // its parent, so a repo with the owner's commands beside blueprint's was told to
    // delete a directory that would not be empty (field run #139). blueprint's own
    // file does not count: it is the one being deleted.
    fs.mkdirSync(commands(), { recursive: true });
    fs.writeFileSync(path.join(commands(), 'blueprint-author.md'), '');

    expect(claudeDirState(dir)).toEqual({ hadDir: true, otherCommands: 0 });

    fs.writeFileSync(path.join(commands(), 'my-existing-command.md'), '');

    expect(claudeDirState(dir)).toEqual({ hadDir: true, otherCommands: 1 });
  });

  it('reads a `.claude/` with no commands directory at all', () => {
    // The owner uses Claude Code for settings only. `.claude/` is theirs; the
    // commands directory is init's to make and to remove.
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{}');

    expect(claudeDirState(dir)).toEqual({ hadDir: true, otherCommands: 0 });
  });
});
