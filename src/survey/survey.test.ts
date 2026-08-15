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

/**
 * The folder names the sourceless note lists, read off the rendered output. A test that
 * matched `name,` in the whole report was passing on punctuation `wrapList` strips from
 * the last entry — so the rule it claimed to guard (only a zero-source folder is listed)
 * was unguarded, and replacing the filter with every folder survived the suite.
 */
function sourcelessNames(output: string): string[] {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('was never counted:'));

  if (start === -1) {
    return [];
  }

  const end = lines.findIndex((line, index) => index > start && line.trim() === '');

  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .flatMap((line) => line.split(','))
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * A sourceless list whose second line lands exactly ON the wrap width, so the `<=`
 * boundary is exercised. `< width` survived every other fixture: none reached it.
 */
function wrapWidthProbe(): string[] {
  // indent(4) + `aaaa,` … chosen so the running candidate hits exactly 74 characters.
  // indent(4) + 20 + ',' = 25; + ' ' + 20 + ',' = 47; + ' ' + 25 + ',' = exactly 74 —
  // the boundary `<=` must accept. A fourth name follows so that line is not the last
  // one, whose trailing comma the final map strips (73, and the boundary invisible).
  const names = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(25), 'd'.repeat(10)];

  const output = renderSurvey({
    framework: null,
    typescript: false,
    packageManager: 'npm',
    aliases: {},
    rootFiles: [],
    folders: names.map((folder) => ({
      folder,
      files: 0,
      directFiles: 0,
      childFolders: 0,
      indexedChildren: 0,
      maxDepth: 0,
    })),
    edges: [],
    selfAliasImports: {},
    testEvidence: [],
    packageUsage: [],
    ownableImports: [],
    unresolved: [],
    totalFiles: 0,
  });

  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('was never counted:'));
  const end = lines.findIndex((line, index) => index > start && line.trim() === '');

  return lines.slice(start + 1, end);
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

  it('names the specifiers a package-granular row cannot support an owns clause with', () => {
    write('package.json', JSON.stringify({ name: 'demo', dependencies: { react: '^18', zod: '^3' } }));

    // The reported case: `owns: [{ package: 'react', imports: ['createContext'] }]` is a
    // clause the package row cannot verify — react reads as "three folders use it"
    // whichever specifier the clause names. An agent invented `grep` for it and said so,
    // over names `scan` was already collecting (field run #148).
    write('src/contexts/User.tsx', 'import { createContext } from "react";');
    write('src/hooks/useUser.ts', 'import { useContext, useMemo } from "react";');
    write('src/components/Card.tsx', 'import { useMemo } from "react";\nimport z from "zod";');

    const result = runSurvey(root, { log: silent });

    expect(result.ownableImports).toEqual([
      { package: 'react', name: 'createContext', folder: 'contexts' },
      { package: 'react', name: 'useContext', folder: 'hooks' },
    ]);

    // `useMemo` spans two folders — on the list it would read as ownable, which is the
    // one wrong answer this evidence can give. `zod`'s default import is in one folder
    // and so is the package, so the package row above already carries it: a second row
    // at specifier granularity would be the same fact twice.
    expect(result.ownableImports.map((entry) => entry.name)).not.toContain('useMemo');
    expect(result.ownableImports.map((entry) => entry.package)).not.toContain('zod');
  });

  it('needs the package spread across folders, and sorts the rows', () => {
    // Two rules with nothing asserting them, both survivors: `folders.size > 1` on the
    // package (relaxing it to `>= 1` or dropping the filter survived), and the row sort
    // (every rewrite of the comparator survived, because the earlier fixture's insertion
    // order already matched the sorted one).
    write('package.json', JSON.stringify({
      name: 'demo',
      dependencies: { react: '^18', zustand: '^4' },
    }));

    // zustand: a NAMED import, concentrated in one folder — and its package is in that
    // one folder too, so the package row above already says it. A specifier row would be
    // the same fact twice, which is what `spread` is for.
    write('src/hooks/useStore.ts', 'import { create } from "zustand";\nexport const s = create;');

    // react spans three folders, and its concentrated specifiers arrive in an order the
    // sort must change: `useTransition` is seen first and sorts last.
    write('src/pages/App.tsx', 'import { useTransition } from "react";\nexport const A = useTransition;');
    write('src/contexts/User.tsx', 'import { createContext } from "react";\nexport const C = createContext;');
    write('src/components/Card.tsx', 'import { useId } from "react";\nexport const D = useId;');

    const result = runSurvey(root, { log: silent });

    expect(result.ownableImports).toEqual([
      { package: 'react', name: 'createContext', folder: 'contexts' },
      { package: 'react', name: 'useId', folder: 'components' },
      { package: 'react', name: 'useTransition', folder: 'pages' },
    ]);

    // Named, in one folder, and still not a candidate — the package is not spread.
    expect(result.ownableImports.map((entry) => entry.package)).not.toContain('zustand');
    expect(result.packageUsage).toContainEqual({ package: 'zustand', folders: ['hooks'] });
  });

  it('leaves the src root out of the ownership candidates', () => {
    // `(src root)` is not a layer — this survey says as much two sections up — so a
    // specifier concentrated there is evidence for a clause `owns` cannot express.
    write('package.json', JSON.stringify({ name: 'demo', dependencies: { react: '^18' } }));
    write('src/main.tsx', 'import { StrictMode } from "react";\nexport const x = StrictMode;\n');
    write('src/hooks/useUser.ts', 'import { useMemo } from "react";\nexport const u = useMemo;\n');
    write('src/components/Card.tsx', 'import { useMemo } from "react";\nexport const C = useMemo;\n');

    const result = runSurvey(root, { log: silent });

    expect(result.ownableImports).toEqual([]);
    // …and the package row still carries the root, unchanged: that section reports
    // where a package is used, and wiring is a real answer to that.
    expect(result.packageUsage[0].folders).toContain('(src root)');
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
      ownableImports: [],
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
      ownableImports: [{ package: 'react', name: 'createContext', folder: 'contexts' }],
      unresolved: [],
      totalFiles: 12,
    });

    // Every alias, joined — a render that stops at the first one hides half
    // the wiring the agent has to reproduce.
    expect(output).toContain('Alias: ~app → src, ~lib → src/lib');
    expect(output).toContain('src/ root files (wiring, not layers): main.ts');

    // All six folder numbers reach the line the playbook reads.
    expect(output).toContain('12 source files · 3 direct · 4 child folders (2 with index) · depth 3');
    // Above zero the row stands on its own, so the note is absent entirely. The needle
    // is the renderer's opening words: this used to read `holds no SOURCE file`, a string
    // the renderer stopped emitting two commits later — an assertion that cannot fail is
    // cover, and this one covered the only rule keeping the note off a folder with files.
    // Replacing the `files === 0` filter with `result.folders` survived all 1305 tests.
    expect(output).not.toContain('0 source files means');
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
        ownableImports: [],
        unresolved: [],
        totalFiles: 0,
      });

    // Exactly at the cap every package is already on the list, so the only
    // overflow line available to print would claim "… 0 more".
    expect(render(15)).toContain('pkg-14');
    expect(render(15)).not.toContain('more (use --json');

    expect(render(16)).toContain('… 1 more (use --json for the full list)');
  });

  it('says a zero-source folder is present, not empty — once, not per row', () => {
    // The row exists because the directory does, so `0` cannot mean "no folder" — and
    // it does not mean "nothing in it" either. An adopter read `styles 0 files` as an
    // empty folder, ran `ls`, and found a directory of `.css` (field run #150).
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [
        { folder: 'styles', files: 0, directFiles: 0, childFolders: 0, indexedChildren: 0, maxDepth: 0 },
        { folder: 'assets', files: 0, directFiles: 0, childFolders: 0, indexedChildren: 0, maxDepth: 0 },
        { folder: 'components', files: 4, directFiles: 4, childFolders: 0, indexedChildren: 0, maxDepth: 1 },
      ],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      ownableImports: [],
      unresolved: [],
      totalFiles: 4,
    });

    expect(output).toContain('styles              0 source files');
    expect(output).toContain('folder is HERE and holds none');
    expect(output).toContain('This survey reads source only');

    // Once, not per folder: repeating a three-line note buries the numbers it sits
    // beside — the same reason the row itself does not carry it.
    expect(output.match(/folder is HERE and holds none/g)).toHaveLength(1);

    // Read the NAMES out of the list rather than matching `components,` in the whole
    // output: that needle depended on a trailing comma, and `wrapList` strips it from the
    // last entry — so on a fixture where `components` sorts last the assertion passed
    // whether the filter ran or not. Names, not punctuation, and order cannot break it.
    expect(sourcelessNames(output)).toEqual(['styles', 'assets']);

    // It must not read as another folder row: a blank line above it, and it opens on
    // the sentence rather than on the names, because `assets, styles: 0 source files`
    // at the rows' own indent read as a folder called "assets, styles".
    const lines = output.split('\n');
    const note = lines.findIndex((line) => line.includes('0 source files means'));

    expect(lines[note - 1]).toBe('');
    expect(lines[note].trimStart().startsWith('0 source files means')).toBe(true);
  });

  it('wraps the sourceless folder list — its length is the reader\'s repo', () => {
    // The one line in this output nothing bounded, and `public/ assets/ locales/
    // generated/` is an ordinary project. Every other line here is hand-wrapped.
    const output = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: Array.from({ length: 10 }, (_, index) => ({
        folder: `sourceless-folder-${index}`,
        files: 0,
        directFiles: 0,
        childFolders: 0,
        indexedChildren: 0,
        maxDepth: 0,
      })),
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [],
      ownableImports: [],
      unresolved: [],
      totalFiles: 0,
    });

    // The note's own lines, not the folder rows above it — those are a fixed 93 wherever
    // the folder name lands, and are not what went unbounded.
    const lines = output.split('\n');
    const start = lines.findIndex((line) => line.includes('0 source files means'));
    const note = lines.slice(start, lines.findIndex((line, index) => index > start && line === ''));

    expect(note.length).toBeGreaterThan(3); // the sentence, plus a wrapped list

    for (const line of note) {
      expect(line.length).toBeLessThanOrEqual(80);
    }

    // Every folder still named, in order, and read back as names rather than as a
    // substring — a `toContain` per name passes on a list that lost its commas.
    expect(sourcelessNames(output))
      .toEqual(Array.from({ length: 10 }, (_, index) => `sourceless-folder-${index}`));

    // The punctuation itself: every entry but the last is followed by a comma, and the
    // last by none. `line.replace(/,$/, '')` applied to EVERY line instead of the last
    // survived otherwise — it strips the commas that join one wrapped line to the next,
    // and a name-splitting read cannot tell.
    const listStart = note.findIndex((line) => line.includes('was never counted:'));
    const joined = note.slice(listStart + 1).join(' ').replace(/\s+/g, ' ').trim();

    expect(joined).toBe(Array.from({ length: 10 }, (_, index) => `sourceless-folder-${index}`).join(', '));

    // And the width is a `<=`: a candidate landing exactly ON the limit belongs on the
    // line it fits. `< width` survived, because no fixture had ever hit the boundary.
    const exact = wrapWidthProbe();

    expect(exact.some((line) => line.length === 74)).toBe(true);
  });

  it('caps the specifier list on the same rule as the package list', () => {
    // Its own section, its own cap, its own overflow line — sharing the wording
    // with the packages above does not make it the same list, and a react app
    // reaches sixteen concentrated specifiers long before sixteen packages.
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
        packageUsage: [],
        ownableImports: Array.from({ length: count }, (_, index) => ({
          package: 'react',
          name: `use-${index}`,
          folder: 'hooks',
        })),
        unresolved: [],
        totalFiles: 0,
      });

    expect(render(15)).toContain('react → use-14 — hooks only');
    expect(render(15)).not.toContain('more (use --json');

    expect(render(16)).toContain('… 1 more (use --json for the full list)');

    // The cap has to CAP: dropping `.slice(0, 15)` prints all sixteen rows AND the
    // overflow line, and an assertion on the overflow line alone passes either way.
    expect((render(16).match(/ — hooks only/g) ?? []).length).toBe(15);
    expect(render(16)).not.toContain('use-15');
  });

  it('prints no specifier section when there are no candidates', () => {
    // `if (result.ownableImports.length)` → `if (true)` survived: the heading and its
    // two-line explanation over an empty list, which every other section here refuses
    // to do (field issue #6 is the same shape one section up).
    const empty = renderSurvey({
      framework: null,
      typescript: false,
      packageManager: 'npm',
      aliases: {},
      rootFiles: [],
      folders: [],
      edges: [],
      selfAliasImports: {},
      testEvidence: [],
      packageUsage: [{ package: 'axios', folders: ['services'] }],
      ownableImports: [],
      unresolved: [],
      totalFiles: 1,
    });

    expect(empty).toContain('Package usage');
    expect(empty).not.toContain('Named imports in ONE folder');
    expect(empty).not.toContain('was never counted');
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
