import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  describeUnreadable,
  detect,
  detectAliases,
  GENERATED_ESLINT_BANNER,
  parseJsonc,
  pathAliasKeys,
  quotedIn,
  readTexts,
  unreadableTsconfigs,
  ALLOWED_CARRIER_PEERS,
  REQUIRED_DEPS,
  STACK_DEPS,
  claudeDirState,
  SUPPORTED_ESLINT_MAJORS,
  tscArtifactsOutOfTree,
  viteTsCoverage,
} from './detect';

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

/**
 * `parseJsonc`'s value, or null when it could not be read. The failures are
 * asserted directly further down — reason and offset both — so the cases that are
 * about the VALUE read it through one place instead of unwrapping inline.
 */
const readJsonc = (text: string): unknown => {
  const result = parseJsonc(text);

  return result.ok ? result.value : null;
};

describe('detect', () => {
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

  it('reports existing files, src dirs, and missing deps', () => {
    writePkg({ name: 'x', devDependencies: { eslint: '9', typescript: '5' } });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '');
    fs.writeFileSync(path.join(root, 'eslint.config.js'), '');
    fs.writeFileSync(path.join(root, 'vite.config.ts'), '');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
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

    // typescript in devDependencies pulls the ts parser into the install set.
    expect(state.missingDeps).toEqual([
      '@kekkai/blueprint',
      '@eslint-community/eslint-plugin-eslint-comments',
      '@stylistic/eslint-plugin',
      'eslint-plugin-import-x',
      'typescript-eslint',
    ]);

    expect(state.packageManager).toBe('npm');
    // A bare flat config (no tseslint.config call) reads as a flat array.
    expect(state.eslintConfigShape).toBe('flat-array');
    expect(state.legacyEslintConfig).toBeUndefined();
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

describe('detectAliases', () => {
  it('keeps only src-targeting path entries, first declaration wins', () => {
    expect(
      detectAliases({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['./src/*'],
              '~app/*': ['src/*'],
              '#shared/*': ['./packages/shared/*'],
            },
          },
        }),
        'tsconfig.app.json': JSON.stringify({
          compilerOptions: { paths: { '@/*': ['./other/*'] } },
        }),
      }),
    ).toEqual({ '@': 'src', '~app': 'src' });
  });

  it('skips truly broken files and shapeless configs', () => {
    expect(
      detectAliases({
        'tsconfig.json': '{ "compilerOptions": ',
        'jsconfig.json': JSON.stringify({ compilerOptions: {} }),
        'tsconfig.app.json': null,
      }),
    ).toEqual({});

    expect(
      detectAliases({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': [42] } } }),
      }),
    ).toEqual({});
  });

  it('reads JSONC — the Vite + TS starter tsconfig is commented by default', () => {
    // Comments, trailing commas, AND `/*` living inside the very strings we
    // need (`"@/*"`) — a naive regex strip would destroy the data.
    const jsonc = `{
      // path aliases for the app
      "compilerOptions": {
        /* keep in sync with vite.config.ts */
        "paths": {
          "@/*": ["./src/*"], // primary
          "~app/*": ["./src/*"],
        },
      },
    }`;

    expect(detectAliases({ 'tsconfig.app.json': jsonc })).toEqual({ '@': 'src', '~app': 'src' });
    expect([...pathAliasKeys({ 'tsconfig.app.json': jsonc })].sort()).toEqual(['@', '~app']);
  });

  it('returns null on degenerate input — unterminated string, trailing backslash', () => {
    expect(readJsonc('{ "a": "b\\')).toBeNull();
  });

  it('honors escapes and comment-looking content inside strings', () => {
    const jsonc = '{ "compilerOptions": { "paths": { "@//*": ["./src/*"], '
      + '"quoted\\"x/*": ["./x/*"] } } } // tail';

    expect([...pathAliasKeys({ 'tsconfig.json': jsonc })].sort()).toEqual(['@/', 'quoted"x']);
  });
});

describe('pathAliasKeys', () => {
  it('collects every declared alias regardless of target', () => {
    const keys = pathAliasKeys({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '~app/*': ['./src/*'],
            '#shared/*': ['./packages/shared/*'],
            '/*': ['./nope/*'],
          },
        },
      }),
      'tsconfig.app.json': null,
    });

    // The doctor's question is resolvability, so non-src targets count too;
    // an empty alias (the `/*` key) is never a usable prefix.
    expect([...keys].sort()).toEqual(['#shared', '~app']);
  });

  it('returns an empty set when no config declares paths', () => {
    expect(pathAliasKeys({ 'tsconfig.json': '{ broken', 'jsconfig.json': null }).size).toBe(0);
  });
});

describe('every carrier init installs can resolve on the adopter\'s stack', () => {
  // `npm install -D <all of them>` is all-or-nothing, so ONE carrier the
  // project cannot satisfy takes the whole install down — and with it the
  // rest of init's plan. Two field runs proved it from both directions:
  // eslint-plugin-import capped its eslint peer at 9 (#37), and
  // eslint-plugin-import-x peered on @typescript-eslint/utils@^8.56 for
  // resolvers importBlock never uses, walling a repo pinned at 8.47 (#41).
  // So both halves are asserted here, read from the installed manifests
  // rather than trusted from the list.
  const peers = (dep: string): Record<string, string> => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join('node_modules', dep, 'package.json'), 'utf-8'),
    ) as { peerDependencies?: Record<string, string> };

    return manifest.peerDependencies ?? {};
  };

  // eslint is the host, not a carrier; the package under test is not
  // installed into its own node_modules.
  const carriers = [
    ...REQUIRED_DEPS.filter((dep) => dep !== 'eslint' && dep !== '@kekkai/blueprint'),
    ...Object.values(STACK_DEPS),
  ];

  it.each(carriers)('%s admits every supported ESLint major', (dep) => {
    const range = peers(dep).eslint ?? null;

    expect(range, `${dep} declares no eslint peer range`).not.toBeNull();

    const unsupported = SUPPORTED_ESLINT_MAJORS.filter(
      (major) => !new RegExp(`\\^${major}(\\.|\\s|\\||$)`).test(range as string),
    );

    expect(unsupported, `${dep} peer range "${range}" excludes ESLint ${unsupported.join(', ')}`)
      .toEqual([]);
  });

  it.each(carriers)('%s constrains nothing else the adopter owns', (dep) => {
    // An optional peer is still version-checked when the package is PRESENT,
    // and a peer cannot be satisfied by a nested copy — so every name here
    // is a version blueprint imposes on a repo from the outside.
    const extra = Object.keys(peers(dep))
      .filter((name) => name !== 'eslint')
      .filter((name) => !(ALLOWED_CARRIER_PEERS[dep] ?? []).includes(name));

    expect(extra, `${dep} peers on ${extra.join(', ')} — that constraint reaches into the adopter's `
    + 'tree and fails their install when it cannot be met. Allow it deliberately in '
    + 'ALLOWED_CARRIER_PEERS, or pick a carrier without it.').toEqual([]);
  });

  it('names at least one supported major, or every check above is vacuous', () => {
    // Each assertion in this block filters SUPPORTED_ESLINT_MAJORS and expects
    // nothing left over. An empty list satisfies all of them while checking no
    // package at all — the same vacuous green inspect warns about for an empty
    // layer net, and the reason blueprint names that state instead of passing it.
    expect(SUPPORTED_ESLINT_MAJORS.length).toBeGreaterThan(0);
    expect(SUPPORTED_ESLINT_MAJORS).toContain(9);
  });

  it('every carrier is a devDependency here, so the manifests above are real', () => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      devDependencies: Record<string, string>;
    };

    expect(carriers.filter((dep) => !manifest.devDependencies[dep])).toEqual([]);
  });
});

describe('every supported ESLint major is one something here executes', () => {
  // `init`'s install note tells every adopter that `@kekkai/blueprint`'s CI runs its
  // own suite on each major in SUPPORTED_ESLINT_MAJORS. Nothing bound that sentence
  // to what CI does, and two changes already in view would have made it lie with the
  // whole suite green. Adding a major to the list: the carrier-peer checks above go
  // green the moment the peers admit it, and admitting a version says nothing about
  // running it. Bumping the devDependency to 10: from that day nothing runs 9, and
  // the note still says "each". Both are field run #150 returning in the same shape —
  // a claim in output with no test underneath it.
  //
  // A major is covered one of two ways, and one of them has to hold:
  //   - the devDependency range admits it, so the main matrix runs it, or
  //   - a ci.yml job installs that exact major, the way `eslint-10` does.
  //
  // Read off the two files rather than restated, so a change to either is what turns
  // this red — the list is the contract, and this is one case per member of it.
  const eslintRange = (): string => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      devDependencies: Record<string, string>;
    };

    return manifest.devDependencies.eslint;
  };

  it.each(SUPPORTED_ESLINT_MAJORS)('ESLint %i is executed, not merely permitted', (major) => {
    const range = eslintRange();
    // Same shape as the peer-range check above: `^9` matches `^9.39.2` and not `^10`.
    const mainMatrix = new RegExp(`\\^${major}(\\.|\\s|\\||$)`).test(range);

    // Comment lines are stripped before the match, because this check is about what
    // CI RUNS and a comment runs nothing. Read whole, `# TODO: a leg for eslint@11
    // once the carriers admit it.` satisfies it — and that sentence is the single most
    // likely thing to be written at the exact moment this test first goes red, by
    // someone who saw it and meant to come back. The red would vanish on the way to
    // the fix. This repo's ci.yml comments are long and name versions and packages
    // constantly, so the collision is ordinary rather than contrived.
    //
    // Residual, unguarded on purpose: a trailing comment on a step line
    // (`run: … # eslint@11`) still counts. Splitting on `#` mid-line would misread a
    // `#` inside a quoted yaml scalar, and the failure mode above is a comment LINE.
    // `(?!\\d)` so a list containing 1 is not satisfied by a job installing 10.
    const steps = fs.readFileSync('.github/workflows/ci.yml', 'utf-8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    const ownLeg = new RegExp(`eslint@${major}(?!\\d)`).test(steps);

    expect(
      mainMatrix || ownLeg,
      `SUPPORTED_ESLINT_MAJORS names ${major} and the install note tells adopters CI runs `
      + `the suite on each of them — but the eslint devDependency is "${range}" and no ci.yml `
      + `job installs eslint@${major}. Widen the devDependency or add a leg beside `
      + '`eslint-10`; do not leave that note claiming a major nothing here executes.',
    ).toBe(true);
  });
});

describe('parseJsonc · where a comment starts and stops', () => {
  it('strips a line comment that has no newline after it', () => {
    // A tsconfig whose last line is a comment has no terminator, so the scan
    // has to stop at the end of the text rather than run past it.
    expect(readJsonc('{"a": 1} // tail')).toEqual({ a: 1 });
    expect(readJsonc('{"a": 1}\n// tail\n')).toEqual({ a: 1 });
  });

  it('strips a block comment wherever it sits', () => {
    expect(readJsonc('{/* lead */ "a": 1}')).toEqual({ a: 1 });
    expect(readJsonc('{"a": 1 /* trail */}')).toEqual({ a: 1 });
    expect(readJsonc('{"a": /* mid */ 1}')).toEqual({ a: 1 });
  });

  it('does not read a lone slash as the start of a comment', () => {
    // A slash appears in every path. Only a doubled one, or one followed by a
    // star, opens a comment — reading a bare slash as one swallows the rest of
    // the file and false-reds the alias check on a config that is fine.
    expect(readJsonc('{"a": "x/y"}')).toEqual({ a: 'x/y' });
    expect(readJsonc('{"a": 1, "b": 2}')).toEqual({ a: 1, b: 2 });
  });

  it('leaves an unterminated block comment unparseable instead of looping', () => {
    expect(readJsonc('{"a": 1 /* never closed')).toBeNull();
  });
});

describe('parseJsonc · the boundaries the scan must not cross', () => {
  it('parses a document with no comments or trailing commas at all', () => {
    // Both passes walk to `< length`. Walking one index further reads
    // `text[length]` — undefined — and appends the string "undefined" to the
    // output, so an ordinary tsconfig stops parsing entirely.
    expect(readJsonc('{"a":1}')).toEqual({ a: 1 });

    expect(readJsonc('{"compilerOptions":{"paths":{"~app/*":["./src/*"]}}}'))
      .toEqual({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } });
  });

  it('keeps a comma the object still needs', () => {
    // Only a comma whose next non-space is `}` or `]` is trailing. Dropping the
    // `]` half leaves `[1, 2, ]`, which JSON.parse rejects — a commented Vite
    // starter tsconfig with an array is the mainstream case (field batch 10).
    expect(readJsonc('{"a": [1, 2, ]}')).toEqual({ a: [1, 2] });
    expect(readJsonc('{"a": [1, 2], "b": 3}')).toEqual({ a: [1, 2], b: 3 });
  });

  it('protects a string in the trailing-comma pass too, not only the comment pass', () => {
    // The second pass re-scans the comment-free text, and it has to skip string
    // literals for the same reason the first one does: `,}` inside a value is
    // data. Dropping that guard silently rewrites the string.
    expect(readJsonc('{"a": ",}"}')).toEqual({ a: ',}' });
    expect(readJsonc('{"a": [",]"]}')).toEqual({ a: [',]'] });
  });

  it('does not treat a stray slash or star as opening a block comment', () => {
    // Both halves of the `/*` test matter. Matching on either character alone
    // turns a typo into a comment that swallows the rest of the file — and the
    // file then parses clean, so nothing ever reports the typo.
    expect(readJsonc('{"a": 1} /')).toBeNull();
    expect(readJsonc('{"a": 1} *')).toBeNull();
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

  // One case per tell, with the list restated because `detect` keeps it private
  // — drop one and exactly one case goes red. Each fixture carries its own tell
  // and NOT the other, so neither case can pass on the strength of the other's
  // arm. Both are shapes an adopter really has: a config that reached `emitLint`
  // through a shared config package never names this one, and a config that
  // renamed the import on the way in never spells the call.
  it.each([
    [
      'the emitLint call',
      'import { emitLint } from \'@acme/eslint-config\';\n\nexport default [...emitLint(bp)];\n',
    ],
    [
      'the package name',
      'import { emitLint as lint } from \'@kekkai/blueprint\';\n\nexport default [...lint(bp)];\n',
    ],
  ])('reads %s as a config its owner wired', (_tell, source) => {
    writePkg({ name: 'x', dependencies: { vue: '^3' } });
    fs.writeFileSync(path.join(root, 'eslint.config.mjs'), source);

    expect(detect(root).wiredEslintConfig).toBe(true);
  });

  it('does not call a config carrying neither tell wired', () => {
    // The negative is what keeps the two arms above from being vacuous: a flat
    // config that never reaches these rules has to stay unwired, or `init` skips
    // the reference file that is the owner's only instruction for merging.
    writePkg({ name: 'x', dependencies: { vue: '^3' } });

    fs.writeFileSync(
      path.join(root, 'eslint.config.mjs'),
      'import js from \'@eslint/js\';\n\nexport default [js.configs.recommended];\n',
    );

    const state = detect(root);

    expect(state.hasEslintConfig).toBe(true);
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

describe('eachPathAlias · the shapes a paths block comes back as', () => {
  it('skips a paths key explicitly set to null', () => {
    // `typeof null === 'object'`, so the null check is the only thing standing
    // between a hand-written `"paths": null` and `Object.entries(null)` — which
    // throws out of detect and takes doctor's whole alias check with it.
    expect(detectAliases({ 'tsconfig.json': '{"compilerOptions":{"paths":null}}' })).toEqual({});
    expect(pathAliasKeys({ 'tsconfig.json': '{"compilerOptions":{"paths":null}}' }).size).toBe(0);
  });

  it('cuts the trailing wildcard off a key, not the first one it finds', () => {
    // A workspace tsconfig writes several wildcards in one key. Only the
    // trailing one is the "everything under here" suffix; cutting the first
    // yields a prefix TypeScript never declared, so doctor reports the alias
    // the config DOES declare as unwired.
    expect([...pathAliasKeys({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~pkg/*/inner/*': ['./src/*'] } },
      }),
    })]).toEqual(['~pkg/*/inner']);
  });

  it('cuts the trailing wildcard off a target, not the first one it finds', () => {
    // Same anchor on the target side, and here it decides whether the alias
    // counts as pointing at the source root. A wildcard mid-path is part of the
    // path — cutting it can turn a target that is NOT src into one that reads
    // like it, and the alias is reported wired to src while it resolves
    // somewhere else.
    expect(detectAliases({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~odd/*': ['./sr/*c'] } },
      }),
    })).toEqual({});
  });

  it('cuts a leading ./ only where it leads', () => {
    // A redundant `./` inside a path is part of the path, not the prefix this
    // strip removes. Cutting it anywhere turns `src/./*` into a plain `src`, and
    // an alias pointing at a directory literally named `.` is reported as wired
    // to the source root.
    expect(detectAliases({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~dot/*': ['src/./*'] } },
      }),
    })).toEqual({});
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
      fs.writeFileSync(path.join(root, file), 'export default { resolve: { alias: { \'~app\': \'/src\' } } };');

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

describe('parseJsonc · why it gave up, and where', () => {
  // The failure used to be one null for three different problems, which left every
  // bound in the scanner unanswerable: reading a character too far produced the
  // same null. The offset is what turns those bounds into assertions — and it is
  // the only version an adopter can act on, since "unreadable" does not say where
  // to look.
  it('names an unterminated string and the offset the scan reached', () => {
    const text = '{ "a": "b';

    expect(parseJsonc(text)).toEqual({
      ok: false,
      reason: 'unterminated-string',
      at: text.length,
    });
  });

  it('counts an escaped character as part of the literal when reporting the offset', () => {
    // A trailing backslash consumes the character after it, so the scan ends one
    // further along than counting quotes would suggest.
    expect(parseJsonc('{ "a": "b\\')).toEqual({
      ok: false,
      reason: 'unterminated-string',
      at: 10,
    });
  });

  it('names an unclosed block comment and where it ran out', () => {
    const text = '{"a": 1 /* never closed';

    expect(parseJsonc(text)).toEqual({ ok: false, reason: 'unclosed-comment', at: text.length });
  });

  it('separates a JSON mistake from a JSONC one, and omits the offset it does not have', () => {
    // Comments and trailing commas are gone by now, so what remains is plain
    // invalid JSON — a different thing to report, and with no honest offset.
    // `at` is ABSENT rather than 0: offset 0 is a real position (a file whose
    // first character is already wrong), so a zero here would be read as one.
    expect(parseJsonc('{"a": 1} /')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseJsonc('{ "compilerOptions": ')).toEqual({ ok: false, reason: 'not-json' });

    const result = parseJsonc('{"a": 1} /');

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : 'at' in result).toBe(false);
  });

  it('answers ok with the parsed value for a document it can read', () => {
    expect(parseJsonc('{"a": 1} // tail')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reads a closed block comment and keeps what follows it', () => {
    // The reason this parser exists — every Vite + TS starter ships a commented
    // tsconfig — and nothing asked it to skip a comment that CLOSES. Without a
    // fixture like this, the jump past `*/` could land anywhere.
    expect(parseJsonc('{ /* note */ "a": 1, /* and */ "b": 2 }'))
      .toEqual({ ok: true, value: { a: 1, b: 2 } });
  });

  it('does not read "/*/" as a comment that closed', () => {
    // The `*/` a naive search finds here is the opener's own `*` with the next
    // `/`. Reading it as closed would resume INSIDE the comment and parse its
    // text as data.
    expect(parseJsonc('{ "a": 1 /*/ }')).toEqual({
      ok: false,
      reason: 'unclosed-comment',
      at: 14,
    });
  });

  it('drops a line comment without eating the line under it', () => {
    expect(parseJsonc('{\n  // note\n  "a": 1\n}')).toEqual({ ok: true, value: { a: 1 } });

    // …and a file whose last line IS the comment still parses.
    expect(parseJsonc('{ "a": 1 }\n// trailing')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('separates a comment opener from a bare "*" in broken text', () => {
    // `x*/` is not a comment: the `*` has no `/` before it. Treating any `*` as
    // an opener sends the scan looking for a close that was never opened, and the
    // reader is told the wrong thing about their file.
    expect(parseJsonc('{"a":1} x*/')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('reads a trailing comma across whitespace, and a dangling one as invalid', () => {
    expect(parseJsonc('{ "a": 1,   \n }')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonc('[ 1, 2,\t]')).toEqual({ ok: true, value: [1, 2] });

    // A comma with nothing but whitespace after it is kept, so JSON.parse gets to
    // call it what it is.
    expect(parseJsonc('{"a": 1,   ')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('does not read a document of "null" as an object', () => {
    // `JSON.parse('null')` is a legal parse whose value is null. A tsconfig
    // holding just that reaches every reader as `ok: true`, and reaching for
    // `.compilerOptions` on it throws — one unreadable file taking down the whole
    // alias check.
    expect(parseJsonc('null')).toEqual({ ok: true, value: null });
    expect(pathAliasKeys({ 'tsconfig.json': 'null' })).toEqual(new Set());
    expect(detectAliases({ 'tsconfig.json': 'null' })).toEqual({});
  });

  it('keeps a comma that separates two members', () => {
    expect(parseJsonc('{ "a": 1, "b": 2 }')).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });
});

describe('unreadableTsconfigs · the failures a paths reader would otherwise swallow', () => {
  it('names each present-but-unparseable file and skips the readable and absent ones', () => {
    expect(unreadableTsconfigs({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "~app/*": ["./src/*"] } } }',
      'tsconfig.app.json': '{ "compilerOptions": { "paths: {} } }',
      'jsconfig.json': null,
    })).toEqual([
      { file: 'tsconfig.app.json', reason: 'unterminated-string', at: 37 },
    ]);
  });

  it('is empty when every config present can be read', () => {
    expect(unreadableTsconfigs({ 'tsconfig.json': '{}', 'jsconfig.json': null })).toEqual([]);
  });

  it('reports every unreadable file, not just the first', () => {
    const failures = unreadableTsconfigs({
      'tsconfig.json': '{ /* open',
      'tsconfig.app.json': '{"a": 1} /',
    });

    expect(failures.map(({ file }) => file))
      .toEqual(['tsconfig.json', 'tsconfig.app.json']);
  });
});

describe('describeUnreadable · one clause per file, and only an offset it has', () => {
  it('names the file, what is wrong, and where to look', () => {
    expect(describeUnreadable([
      { file: 'tsconfig.json', reason: 'unterminated-string', at: 42 },
    ])).toBe('tsconfig.json could not be read (a string literal never closes at character 42)');

    expect(describeUnreadable([
      { file: 'tsconfig.app.json', reason: 'unclosed-comment', at: 9 },
    ])).toBe('tsconfig.app.json could not be read (a block comment never closes at character 9)');
  });

  it('leaves the position out for a failure that has none', () => {
    const sentence = describeUnreadable([{ file: 'jsconfig.json', reason: 'not-json' }]);

    expect(sentence).toBe(
      'jsconfig.json could not be read (it is not valid JSON once the comments are stripped)',
    );

    expect(sentence).not.toContain('character');
  });

  it('joins several files into one sentence', () => {
    expect(describeUnreadable([
      { file: 'tsconfig.json', reason: 'not-json' },
      { file: 'jsconfig.json', reason: 'unclosed-comment', at: 4 },
    ])).toBe(
      'tsconfig.json could not be read (it is not valid JSON once the comments are stripped); '
      + 'jsconfig.json could not be read (a block comment never closes at character 4)',
    );
  });
});

describe('viteTsCoverage · the fact that used to be three releases of prose', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-vitets-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (file: string, text: string) => {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };

  it('reads the referenced project that pulls the vite config in', () => {
    // The modern Vite + TS template: a root of pure references, and the node
    // project lists the vite config by name. This is the shape the playbook used
    // to ASSERT was universal (field #21–#22, still a finding at #99).
    write('vite.config.ts', 'export default {}\n');
    // `"files": []` is what makes a solution config compile nothing of its own —
    // the real template carries it, and the test below shows why it matters here.
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }] }');
    write('tsconfig.node.json', '{ "include": ["vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toEqual({
      verdict: 'covered',
      viteFile: 'vite.config.ts',
      tsconfig: 'tsconfig.node.json',
    });
  });

  it('reads a single root config whose include leaves the vite config out', () => {
    // The other real shape, and the one this repo's own harness stages — where a
    // field agent proved `tsc -b` never reads the file by injecting a type error.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "include": ["src"], "compilerOptions": { "noEmit": true } }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside', tsconfig: 'tsconfig.json' });
  });

  it('counts a project with no files and no include as covering everything under it', () => {
    // TypeScript's own default. Reading this as "not covered" would tell an adopter
    // to run two builds where one reads both files.
    write('vite.config.mts', 'export default {}\n');
    write('tsconfig.json', '{ "compilerOptions": { "strict": true } }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', viteFile: 'vite.config.mts' });
  });

  it('matches a star glob against the root file', () => {
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "include": ["**/*.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered' });

    // `"src"` is the same bare-directory shape as above and must NOT reach a root file.
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "include": ["src/**/*"] }');
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });
  });

  it('declines rather than guesses, once per shape it does not resolve', () => {
    // Each of these is a real tsconfig feature whose semantics this reader does not
    // reimplement. A wrong verdict is worse than none: the whole point is that the
    // report must not claim a build verified an edit it never read.
    write('vite.config.ts', 'export default {}\n');

    const declines: [string, string][] = [
      ['an exclude list can remove what include pulled in', '{ "include": ["**/*"], "exclude": ["vite.config.ts"] }'],
      ['an extends base may carry the globs', '{ "extends": "./base.json" }'],
      ['a brace expansion', '{ "include": ["vite.config.{ts,mts}"] }'],
      ['a character class', '{ "include": ["vite.config.?s"] }'],
      ['an unparseable config', '{ "include": [ '],
      ['a non-string include entry', '{ "include": [42] }'],
      ['a reference chain deeper than one level', '{ "references": [{ "path": "./a.json" }] }'],
    ];

    for (const [why, text] of declines) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      fs.writeFileSync(path.join(dir, 'a.json'), '{ "references": [{ "path": "./b.json" }] }');
      expect(viteTsCoverage(dir), `should decline: ${why}`).toBeNull();
    }
  });

  it('declines when there is nothing to answer about', () => {
    // No vite config: the build clause has nothing to specialise.
    write('tsconfig.json', '{ "include": ["src"] }');
    expect(viteTsCoverage(dir)).toBeNull();

    // A vite config but no root tsconfig: a JS project, same non-answer.
    fs.rmSync(path.join(dir, 'tsconfig.json'));
    write('vite.config.js', 'export default {}\n');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('resolves a reference that names a directory rather than a file', () => {
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tools" }] }');
    write('tools/tsconfig.json', '{ "include": ["../vite.config.ts"] }');

    // The vite config sits above the referenced project's directory, and a
    // project's globs cannot reach upward — so this is `outside`, not covered.
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });
  });

  it('reads a solution config missing `files: []` as covering everything, because it does', () => {
    // Not a quirk of this reader — TypeScript's default include applies whenever a
    // config has neither `files` nor `include`, references or not. So `tsc -b` on
    // such a root really does compile the vite config, and answering `outside` here
    // would send an adopter to run a second build it does not need. The real Vite
    // template avoids this by carrying `files: []`.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "references": [{ "path": "./tsconfig.node.json" }] }');
    write('tsconfig.node.json', '{ "include": ["src"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', tsconfig: 'tsconfig.json' });
  });

  it('declines when the root config parses to something that is not an object', () => {
    // `parseJsonc` succeeding says the text was valid JSON, not that it was a config.
    // A bare string and a literal `null` are the two shapes that reach the record
    // guard from opposite sides — without them the guard reads as decoration.
    write('vite.config.ts', 'export default {}\n');

    for (const text of ['"just a string"', 'null', '[]', '42']) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      expect(viteTsCoverage(dir), text).toBeNull();
    }
  });

  it('will not read a subdirectory project as covering the root file of the same name', () => {
    // `tools/tsconfig.json` listing `vite.config.ts` means `tools/vite.config.ts`.
    // Resolving its globs against the ROOT-relative path would read a file that does
    // not exist as covering the one that does — and hand back `tsc -b` alone for a
    // build that never reads the vite config.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tools/tsconfig.json" }] }');
    write('tools/tsconfig.json', '{ "include": ["vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside', tsconfig: 'tsconfig.json' });
  });

  it('declines on every malformed shape of `references` itself', () => {
    // These are the arms a `references` reader can only get wrong silently: a
    // non-array, an entry that is not an object or carries no string `path`, a path
    // that resolves to nothing, and a referenced file that will not parse. Each one
    // is a config someone hand-edited, and each returns no answer rather than a
    // partial graph read as "none of them covers it".
    write('vite.config.ts', 'export default {}\n');

    const malformed = [
      ['references is not an array', '{ "files": [], "references": "./tsconfig.node.json" }'],
      // An object is the shape that separates this guard from the entry guard below:
      // dropping it, a `for…of` over a non-iterable throws instead of declining.
      ['references is an object', '{ "files": [], "references": { "path": "./x.json" } }'],
      ['an entry is not an object', '{ "files": [], "references": ["./tsconfig.node.json"] }'],
      ['an entry carries no path', '{ "files": [], "references": [{ "prepend": true }] }'],
      ['a path that resolves to nothing', '{ "files": [], "references": [{ "path": "./missing.json" }] }'],
      ['a directory with no tsconfig.json in it', '{ "files": [], "references": [{ "path": "./tools" }] }'],
    ];

    for (const [why, text] of malformed) {
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), text);
      expect(viteTsCoverage(dir), `should decline: ${why}`).toBeNull();
    }

    // …and a referenced config that parses to nothing usable.
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      '{ "files": [], "references": [{ "path": "./broken.json" }] }',
    );

    write('broken.json', '{ "include": [ ');
    expect(viteTsCoverage(dir)).toBeNull();

    // A referenced config that parses to a NON-object is the other half of that arm.
    fs.writeFileSync(path.join(dir, 'broken.json'), '["not", "a", "config"]');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('reads `files` as an exact list, and declines when it is not strings', () => {
    // `files` names paths verbatim — no globs — so a hit there is the cheapest
    // `covered` there is. A non-string entry is a hand-edit this will not interpret.
    write('vite.config.ts', 'export default {}\n');
    write('tsconfig.json', '{ "files": ["src/main.ts", "./vite.config.ts"] }');

    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'covered', tsconfig: 'tsconfig.json' });

    // Listed, but not this file: `files` present and no include means nothing else
    // is pulled in, so the answer is a definite `outside` rather than a decline.
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "files": ["src/main.ts"] }');
    expect(viteTsCoverage(dir)).toMatchObject({ verdict: 'outside' });

    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "files": [42] }');
    expect(viteTsCoverage(dir)).toBeNull();
  });

  it('names the file it found, whichever extension it is', () => {
    write('tsconfig.json', '{ "include": ["src"] }');

    for (const file of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']) {
      for (const stale of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']) {
        fs.rmSync(path.join(dir, stale), { force: true });
      }

      write(file, 'export default {}\n');
      expect(viteTsCoverage(dir), file).toMatchObject({ viteFile: file });
    }
  });
});

describe('tscArtifactsOutOfTree · the artifact premise, measured instead of asserted', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-tscout-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (file: string, text: string) => {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };

  /** What `npm create vite` writes for React + TS, which is the shape that matters. */
  const viteTemplate = (over: { app?: string; node?: string } = {}) => {
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }');
    write('tsconfig.app.json', over.app ?? '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo" }, "include": ["src"] }');
    write('tsconfig.node.json', over.node ?? '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo" }, "include": ["vite.config.ts"] }');
  };

  it('reads the default Vite + TS template as leaving the tree untouched', () => {
    // The premise the artifact paragraph opened on — "this step produced untracked
    // files in your working tree" — is false here, and this is not an exotic repo:
    // it is what the React + TS template generates (field run #135). Both projects
    // set noEmit and send the build info under node_modules, so `tsc -b` writes
    // nothing anyone tracks.
    viteTemplate();

    expect(tscArtifactsOutOfTree(dir)).toEqual({
      buildInfo: 'node_modules/.tmp/tsconfig.app.tsbuildinfo',
      tsconfig: 'tsconfig.app.json',
    });
  });

  it('declines when one project would still write into the tree', () => {
    // The whole claim is "nothing landed", so one project that emits breaks it. Both
    // arms of that are checked, because each is a different way to land a file:
    // emitting program output, and dropping the build info beside the config.
    viteTemplate({ node: '{ "compilerOptions": { "tsBuildInfoFile": "./node_modules/.tmp/n.tsbuildinfo" }, "include": ["vite.config.ts"] }' });
    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    viteTemplate({ node: '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./.cache/n.tsbuildinfo" }, "include": ["vite.config.ts"] }' });
    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('declines on a single root config that says nothing about either', () => {
    // The common JS-ish shape, and the honest answer is no answer: absent options
    // mean tsc's defaults, which put the build info beside the config.
    write('tsconfig.json', '{ "include": ["src"] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('declines with no tsconfig, and on one that does not parse', () => {
    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    write('tsconfig.json', '{ "files": [], ');
    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  it('reads a root config that redirects on its own, with no references', () => {
    // No solution stub to skip — the one-project shape has to work too, or the
    // measurement only ever fires on the template it was written from.
    write('tsconfig.json', '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "node_modules/.cache/t.tsbuildinfo" }, "include": ["src"] }');

    expect(tscArtifactsOutOfTree(dir)).toEqual({
      buildInfo: 'node_modules/.cache/t.tsbuildinfo',
      tsconfig: 'tsconfig.json',
    });
  });

  it('declines when a referenced project cannot be read at all', () => {
    write('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });

  // Skipping the solution config rests on three facts together — `files` is an array,
  // it is empty, and there is no `include` — and each can be lost on its own. Any of
  // those losses widens "builds nothing" to cover a config that does build, and a
  // config that is skipped is never asked about its artifact: its in-tree build info
  // stops counting and the answer flips from "declines" to a location. Both fixtures
  // keep a well-behaved project alongside, because a wrong skip only changes the
  // answer when something else is left to supply one.
  it('skips only a config that builds nothing, not one that merely resembles it', () => {
    const solution = '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.lib.json" }] }';
    const app = '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./node_modules/.tmp/app.tsbuildinfo" }, "include": ["src"] }';

    // Files listed and non-empty: it builds them, and its build info lands beside the
    // config rather than under node_modules.
    write('tsconfig.json', solution);
    write('tsconfig.app.json', app);
    write('tsconfig.lib.json', '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./lib.tsbuildinfo" }, "files": ["src/lib.ts"] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();

    // Empty `files`, but an `include` that gives it something to build anyway — which
    // is why the empty list alone cannot decide this.
    write('tsconfig.lib.json', '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./lib.tsbuildinfo" }, "files": [], "include": ["lib"] }');

    expect(tscArtifactsOutOfTree(dir)).toBeNull();
  });
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
