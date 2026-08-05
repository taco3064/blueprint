import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dependencyNames, renderSurvey, ROOT_BUCKET, runSurvey } from './survey';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-survey-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = ''): void {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function scaffold(): void {
  write(
    'package.json',
    JSON.stringify({
      name: 'demo',
      dependencies: { react: '^18', axios: '^1' },
      devDependencies: { typescript: '^5' },
    }),
  );

  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
  );

  write('src/main.tsx', 'import { App } from "@/pages/App";\nimport { i18n } from "@/i18n";');
  write('src/i18n.ts', '');

  write(
    'src/pages/App.tsx',
    [
      'import { Button } from "@/components/Button";',
      'import { i18n } from "@/i18n";', // alias → src-root file
      'import { main } from "../main";', // relative → src-root file
      'import pkg from "../../package.json";', // climbs out of src — skipped
    ].join('\n'),
  );

  write('src/pages/Nav.tsx', 'import { Card } from "../components/Card";');
  write('src/components/Button.tsx', 'import { Card } from "@/components/Card";');
  write('src/components/Card.tsx', 'import { api } from "@/services/api";');
  write('src/services/api/index.ts', 'import axios from "axios";');
  write('src/hooks/useA.ts', 'import { useB } from "@/hooks/useB";');
  write('src/hooks/useB.ts', '');
  write('src/services/api/client.ts', 'import axios from "axios/lib/adapters";');
  write('src/services/api/client.test.ts', 'import { api } from "./index";');
  write('src/pages/__tests__/App.spec.tsx', '');
}

describe('runSurvey', () => {
  it('builds the matrix, self-alias counts, and package usage', () => {
    scaffold();

    const result = runSurvey(root, { log: silent });

    expect(result.framework).toBe('react');
    expect(result.typescript).toBe(true);
    expect(result.aliases).toEqual({ '@': 'src' });
    expect(result.rootFiles).toEqual(['i18n.ts', 'main.tsx']);

    // Every count asserted, in files-descending order. These six numbers are
    // the evidence the authoring playbook reasons about — "does this folder
    // look like a module layer?" is answered by directFiles vs childFolders
    // vs indexedChildren, so an off-by-one or a flipped comparator here
    // misinforms the architecture decision downstream, not just a report.
    expect(result.folders).toEqual([
      { folder: 'pages', files: 3, directFiles: 2, childFolders: 1, indexedChildren: 0, maxDepth: 2 },
      { folder: 'services', files: 3, directFiles: 0, childFolders: 1, indexedChildren: 1, maxDepth: 2 },
      { folder: 'components', files: 2, directFiles: 2, childFolders: 0, indexedChildren: 0, maxDepth: 1 },
      { folder: 'hooks', files: 2, directFiles: 2, childFolders: 0, indexedChildren: 0, maxDepth: 1 },
    ]);

    // Alias and relative imports both land in the matrix; root files bucket.
    // Whole and in order, not by membership: the matrix is sorted by count
    // descending, an edge that should not exist is as wrong as a missing one,
    // and the playbook reads this list top-down. Membership assertions see
    // none of that — they also cannot say that (src root) → (src root) and
    // components → components are absent, which is the point of the two
    // buckets below.
    expect(result.edges).toEqual([
      { from: 'pages', to: 'components', count: 2 },
      { from: 'pages', to: ROOT_BUCKET, count: 2 },
      { from: 'components', to: 'services', count: 1 },
      { from: ROOT_BUCKET, to: 'pages', count: 1 },
    ]);

    // Same-folder alias imports are separated out, not edges.
    expect(result.selfAliasImports).toEqual({ components: 1, hooks: 1 });

    // axios: exact and subpath specifiers both attribute to the dependency.
    // react and typescript are declared but never imported — absent, not zero.
    expect(result.packageUsage).toEqual([{ package: 'axios', folders: ['services'] }]);

    // Declaration order of TEST_PATTERNS, minus the patterns that matched
    // nothing — `src/test/**` is dropped rather than reported as 0.
    expect(result.testEvidence).toEqual([
      { pattern: '**/*.test.*', files: 1 },
      { pattern: '**/*.spec.*', files: 1 },
      { pattern: '**/__tests__/**', files: 1 },
    ]);
  });

  it('counts both src/test spellings, and leads package usage with the most concentrated', () => {
    write('package.json', JSON.stringify({ name: 'demo', dependencies: { axios: '^1', zod: '^3' } }));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));

    // One convention, two spellings — neither is a typo for the other, and
    // the scaffold above matches neither, so this pattern went unexercised.
    write('src/test/setup.ts', '');
    write('src/tests/helpers.ts', '');

    // axios spans two folders and zod one, while the alphabetical order runs
    // the opposite way. That opposition is the whole point: it is what
    // separates the `||` tiebreaker from an `&&`, which agree on any pair
    // sorted the same way by both keys. And hooks reaches axios only through
    // a subpath, which pins `startsWith` against `endsWith`.
    write('src/services/api.ts', 'import axios from "axios";\nimport z from "zod";');
    write('src/hooks/useX.ts', 'import axios from "axios/lib/adapters";');

    const result = runSurvey(root, { log: silent });

    expect(result.testEvidence).toEqual([{ pattern: 'src/test/**', files: 2 }]);

    expect(result.packageUsage).toEqual([
      { package: 'zod', folders: ['services'] },
      { package: 'axios', folders: ['hooks', 'services'] },
    ]);
  });

  it('matches the test patterns against the filename, not anywhere in the path', () => {
    write('package.json', JSON.stringify({ name: 'edges' }));

    // `.test.` or `.spec.` inside a DIRECTORY name is not a test file, which
    // is the whole reason both patterns are anchored at the end of the path.
    write('src/views/a.test.fixtures/data.ts', '');
    write('src/views/b.spec.fixtures/data.ts', '');

    expect(runSurvey(root, { log: silent }).testEvidence).toEqual([]);
  });

  it('reads an entry as index.<ext> exactly, and climbs deep relative imports from the file', () => {
    write('package.json', JSON.stringify({ name: 'edges' }));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));

    // `index.test.ts` tests the entry, it is not the entry. `foo.index.ts`
    // is not an entry at all. A directory *named* `index.x` sits one level
    // too deep to be one, which is what the depth check is there for.
    write('src/services/api/index.test.ts', '');
    write('src/services/lib/foo.index.ts', '');
    write('src/services/deep/index.x/leaf.ts', '');

    // Two levels down, reaching a sibling layer. The climb starts at the
    // file's own directory, so `../..` lands exactly on the source root —
    // starting from one segment instead overshoots and the edge disappears.
    write('src/components/Button.tsx', '');
    write('src/services/api/deep.ts', 'import { Button } from "../../components/Button";');

    const result = runSurvey(root, { log: silent });

    expect(result.folders.every((folder) => folder.indexedChildren === 0)).toBe(true);
    expect(result.edges).toEqual([{ from: 'services', to: 'components', count: 1 }]);
  });

  it('reports module-shape evidence per folder', () => {
    scaffold();

    const services = runSurvey(root, { log: silent }).folders.find(
      (folder) => folder.folder === 'services',
    );

    expect(services).toMatchObject({
      files: 3,
      directFiles: 0,
      childFolders: 1,
      indexedChildren: 1,
      maxDepth: 2,
    });
  });

  it('honors an alias override and renders a readable report', () => {
    scaffold();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    let output = '';
    const result = runSurvey(root, { alias: '@', log: (message) => (output = message) });

    expect(result.aliases).toEqual({ '@': 'src' });
    expect(output).toContain('Import matrix');
    // The matrix counts test files while inspect skips them — say so in place.
    expect(output).toContain('inspect excludes them, so its counts run lower');
    expect(output).toContain('pages → components');
    expect(output).toContain('Same-folder imports via the alias');
    expect(output).toContain('ownership candidates');
  });

  it('reports no alias when detection finds nothing', () => {
    scaffold();
    fs.rmSync(path.join(root, 'tsconfig.json'));

    let output = '';

    runSurvey(root, { log: (message) => (output = message) });

    expect(output).toContain('none detected');
  });

  it('emits JSON with --json and handles an empty repo', () => {
    write('package.json', JSON.stringify({ name: 'empty' }));

    let output = '';
    const result = runSurvey(root, { json: true, log: (message) => (output = message) });

    expect(result.totalFiles).toBe(0);
    expect(JSON.parse(output).folders).toEqual([]);
  });

  it('truncates the rendered package list past fifteen entries', () => {
    write(
      'package.json',
      JSON.stringify({
        name: 'many',
        dependencies: Object.fromEntries(
          Array.from({ length: 17 }, (_, i) => [`pkg-${String(i).padStart(2, '0')}`, '1']),
        ),
      }),
    );

    for (let i = 0; i < 17; i++) {
      write(`src/app/file${i}.ts`, `import x from "pkg-${String(i).padStart(2, '0')}";`);
    }

    let output = '';

    runSurvey(root, { log: (message) => (output = message) });

    expect(output).toContain('… 2 more');

    // Truncated, not just annotated — the count line without the cut is a
    // lie in the other direction.
    expect(output).toContain('pkg-14');
    expect(output).not.toContain('pkg-15');
  });

  it('survives a missing package.json', () => {
    write('src/app/a.ts', 'import x from "left-pad";');

    const result = runSurvey(root, { log: silent });

    expect(result.packageUsage).toEqual([]);
  });

  it('reports alias-like specifiers that resolve to nothing', () => {
    scaffold();

    write(
      'src/pages/Extra.tsx',
      [
        // #internal appears once, and FIRST; ~root twice, after it. The list
        // sorts by count descending, so inserting the low count first is what
        // makes `b.count - a.count` and `b.count + a.count` land on opposite
        // sides of zero — with two rows the other way round, those two
        // comparators produce the identical order and neither can be told
        // apart by any assertion.
        'import c from "#internal/x";',
        'import a from "~root/tests/fixture";',
        'import b from "~root/tests/other";',
        'import d from "plain-unknown-pkg";', // bare name — not alias-like, not reported
        'import e from "weird~pkg";', // `~` mid-specifier — the prefix test is anchored
      ].join('\n'),
    );

    let output = '';
    const result = runSurvey(root, { log: (message) => (output = message) });

    expect(result.unresolved).toEqual([
      { prefix: '~root', count: 2 },
      { prefix: '#internal', count: 1 },
    ]);

    expect(output).toContain('Unresolved alias-like imports');
    expect(output).toContain('~root/…');
  });
});

describe('renderSurvey', () => {
  it('renders the unknown-framework header without folders', () => {
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      unresolved: [],
      totalFiles: 0,
    });

    expect(output).toContain('unknown framework');
    // The same-folder section always prints — the playbook cites it, so an
    // absent row read as a gap two field agents had to puzzle out (#25, #28).
    expect(output).toContain('Same-folder imports via the alias');
    expect(output).toContain('0  (none found)');
    expect(output).not.toContain('Unresolved');

    // Field issue #6: a bare heading over nothing reads as a render failure,
    // so every empty section says so out loud — and the sections that have
    // nothing to say stay out entirely rather than heading an empty list.
    expect(output).toContain('Alias: none detected in tsconfig paths');
    expect(output).toContain('Folders (module-shape evidence):\n  — none —');
    expect(output).toContain('its counts run lower):\n  — none —');
    expect(output).not.toContain('src/ root files');
    expect(output).not.toContain('Test conventions:');
    expect(output).not.toContain('Package usage');
  });

  it('renders the alias list, the folder row, and same-folder counts heaviest first', () => {
    const output = renderSurvey({
      framework: 'vue',
      typescript: true,
      packageManager: 'pnpm',
      aliases: { '~app': 'src', '~lib': 'src/lib' },
      rootFiles: ['main.ts'],
      folders: [
        { folder: 'views', files: 12, directFiles: 3, childFolders: 4, indexedChildren: 2, maxDepth: 3 },
      ],
      edges: [{ from: 'views', to: 'services', count: 7 }],
      selfAliasImports: { services: 2, views: 9 },
      testEvidence: [{ pattern: '**/*.test.*', files: 4 }],
      packageUsage: [{ package: 'axios', folders: ['services'] }],
      unresolved: [],
      totalFiles: 12,
    });

    // Every alias, joined — a render that stops at the first one hides half
    // the wiring the agent has to reproduce.
    expect(output).toContain('Alias: ~app → src, ~lib → src/lib');
    expect(output).toContain('src/ root files (wiring, not layers): main.ts');

    // All six folder numbers reach the line the playbook reads.
    expect(output).toContain('12 files · 3 direct · 4 child folders (2 with index) · depth 3');
    expect(output).toContain('7  views → services');

    // Heaviest first — object key order would have put services first.
    expect(output.indexOf('9  views')).toBeLessThan(output.indexOf('2  services'));

    expect(output).toContain('Test conventions:');
    expect(output).toContain('4  **/*.test.*');
    expect(output).toContain('axios — services');

    // Nothing in this fixture is empty, so no section may claim it is.
    expect(output).not.toContain('— none —');
  });

  it('adds the overflow line only past the 15-package cap, not at it', () => {
    const render = (count: number) =>
      renderSurvey({
        framework: null,
        typescript: false,
        packageManager: 'npm',
        aliases: {},
        rootFiles: [],
        folders: [],
        edges: [],
        selfAliasImports: {},
        testEvidence: [],
        packageUsage: Array.from({ length: count }, (_, index) => ({
          package: `pkg-${index}`,
          folders: ['services'],
        })),
        unresolved: [],
        totalFiles: 0,
      });

    // Exactly at the cap every package is already on the list, so the only
    // overflow line available to print would claim "… 0 more".
    expect(render(15)).toContain('pkg-14');
    expect(render(15)).not.toContain('more (use --json');

    expect(render(16)).toContain('… 1 more (use --json for the full list)');
  });
});

describe('runSurvey · which dependency claims a subpath', () => {
  it('attributes a subpath import to the longest matching dependency', () => {
    // Two deps where one is a `/`-prefix of the other. The longer name has to be
    // tried first, or `axios/lib/x` is attributed to `axios` and the more
    // specific ownership disappears from the report. npm would reject this
    // manifest — survey reads what is on disk, not what npm would accept.
    write('package.json', JSON.stringify({
      name: 'demo',
      dependencies: { axios: '^1', 'axios/lib': '^1' },
    }));

    write('src/services/api.ts', 'import x from "axios/lib/adapters";');

    expect(runSurvey(root, { log: silent }).packageUsage)
      .toEqual([{ package: 'axios/lib', folders: ['services'] }]);
  });
});

describe('dependencyNames · what "no package.json" answers', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers nothing for a missing or malformed package.json', () => {
    // The exact list, not its emptiness. Through `runSurvey` this arm is
    // undecidable: the names exist to be matched against import specifiers, so a
    // wrong name matches nothing and reads exactly like no names at all.
    expect(dependencyNames(dir)).toEqual([]);

    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
    expect(dependencyNames(dir)).toEqual([]);
  });

  it('reads prod and dev dependencies together, scoped names included', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { vue: '^3' }, devDependencies: { '@vitejs/plugin-vue': '^5' } }),
    );

    expect(dependencyNames(dir)).toEqual(['vue', '@vitejs/plugin-vue']);
  });
});
