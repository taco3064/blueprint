import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractImports, importGraphDerivation, outsideScanReach, scan } from './scan';

describe('extractImports', () => {
  it('extracts static, re-export, side-effect, and dynamic references', () => {
    const refs = extractImports(
      [
        'import Default, { a, b as c } from \'pkg\';',
        'import Solo from \'solo\';',
        'export { x } from \'./rel\';',
        'import \'./side-effect\';',
        'const m = await import(\'dyn\');',
        'const r = require(\'req\');',
      ].join('\n'),
    );

    expect(refs.find((ref) => ref.specifier === 'pkg')).toMatchObject({
      names: ['a', 'b'],
      isExport: false,
    });

    expect(refs.find((ref) => ref.specifier === 'solo')?.names).toEqual([]);

    expect(refs.find((ref) => ref.specifier === './rel')).toMatchObject({
      names: ['x'],
      isExport: true,
    });

    expect(refs.map((ref) => ref.specifier)).toEqual(
      expect.arrayContaining(['pkg', './rel', './side-effect', 'dyn', 'req']),
    );
  });

  it('ignores imports inside comments and strips a leading type modifier', () => {
    const refs = extractImports(
      '// import x from \'commented\';\n/* import y from \'block\'; */\nimport { type T, '
      + 'U } from \'real\';',
    );

    expect(refs.map((ref) => ref.specifier)).toEqual(['real']);
    expect(refs[0].names).toEqual(['T', 'U']);
  });

  it('records the whole shape of a side-effect, dynamic, and require reference', () => {
    // The suite checked these three specifiers existed and nothing else. Both
    // of their defaults were therefore free to flip, and an `isExport: true`
    // here would make a selfOnly re-export ban fire on `import './setup'`.
    expect(extractImports('import \'./side-effect\';')).toEqual([
      { specifier: './side-effect', names: [], isExport: false },
    ]);

    expect(extractImports('const m = await import(\'dyn\');')).toEqual([
      { specifier: 'dyn', names: [], isExport: false },
    ]);

    expect(extractImports('const r = require(\'req\');')).toEqual([
      { specifier: 'req', names: [], isExport: false },
    ]);
  });

  it('drops the empty slot a trailing comma leaves behind', () => {
    // `{ a, }` splits into ['a', '']. An empty name matches no layer, so it
    // would pad every ownership comparison with a member that means nothing.
    expect(extractImports('import { a, } from \'pkg\';')[0].names).toEqual(['a']);
  });

  it('strips the type modifier only where it is the modifier', () => {
    // `type` is a modifier at the START of a member, not a substring anywhere in
    // it. `subtype` is a perfectly ordinary export name, and cutting `type ` out
    // of the middle leaves `subas x` — a name that matches no owned primitive,
    // so an ownership rule stops seeing the import it is meant to govern.
    expect(extractImports('import { subtype as x } from \'pkg\';')[0].names)
      .toEqual(['subtype']);

    expect(extractImports('import { type Only } from \'pkg\';')[0].names).toEqual(['Only']);

    // Two spaces after the modifier. Every fixture above uses exactly one, which
    // let `\s+` be tightened to `\s` unnoticed — the leftover space then had to be
    // cleaned up by a second trim further along, so the bug was repaired by an
    // operation whose stated job was something else entirely.
    expect(extractImports('import { type  Spaced } from \'pkg\';')[0].names)
      .toEqual(['Spaced']);

    // …and the same on the alias side, where the local name is discarded anyway.
    expect(extractImports('import { Wide  as  W } from \'pkg\';')[0].names)
      .toEqual(['Wide']);

    // `type` with nothing after it is a member NAMED type, not a modifier —
    // legal, and the reason the modifier arm needs a fallback rather than an
    // index that may not be there.
    expect(extractImports('import { type } from \'pkg\';')[0].names).toEqual(['type']);
  });

  it('reads the spacings a human actually writes', () => {
    // Every existing fixture puts exactly one space in each optional slot, so
    // each `\s*` could be tightened to a mandatory `\s` unnoticed. All of these
    // are legal, and a missed reference is an import invisible to every
    // structural check while emitLint still bans it.
    expect(extractImports('import { api } from\'~app/services/api\';')[0].specifier)
      .toBe('~app/services/api');

    expect(extractImports('import\'./styles.css\';')[0].specifier).toBe('./styles.css');

    for (const source of [
      'const m = await import (\'lazy\');',
      'const m = await import( \'lazy\');',
      'const m = await import(\'lazy\' );',
    ]) {
      expect(extractImports(source)[0]?.specifier).toBe('lazy');
    }
  });
});

describe('scan', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-scan-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns empty when there is no src/', () => {
    expect(scan(root)).toEqual({ topDirs: [], files: [] });
  });

  it('walks src/ and records files with segments and imports', () => {
    const dir = path.join(root, 'src', 'components', 'Button');

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Button.ts'), 'import { useX } from \'~app/hooks/useX\';');
    fs.writeFileSync(path.join(root, 'src', 'README.md'), 'not source');
    // A source extension has to END the filename. An editor backup is not a
    // source file, and scanning it declares a module that the alias cannot
    // resolve and that no import ever names.
    fs.writeFileSync(path.join(dir, 'Button.vue.bak'), 'export default {};');

    const result = scan(root);

    expect(result.topDirs).toEqual(['components']);

    const button = result.files.find((file) => file.path.endsWith('Button.ts'));

    expect(button?.segments).toEqual(['components', 'Button', 'Button.ts']);
    expect(button?.imports[0].specifier).toBe('~app/hooks/useX');
    expect(result.files).toHaveLength(1); // README.md skipped
  });

  it('scans the project root when sourceRoot is "." and skips non-source dirs', () => {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'react'), { recursive: true });
    fs.mkdirSync(path.join(root, '.next'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'export default () => null;');
    fs.writeFileSync(path.join(root, 'node_modules', 'react', 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(root, '.next', 'build.js'), 'export const x = 1;');

    const result = scan(root, '.');

    expect(result.topDirs).toContain('app');
    expect(result.topDirs).not.toContain('node_modules');
    expect(result.topDirs).not.toContain('.next');

    const page = result.files.find((file) => file.segments[0] === 'app');

    expect(page?.path).toBe('app/page.tsx'); // no src/ prefix at the root
    expect(result.files.every((file) => file.segments[0] === 'app')).toBe(true);
  });

  it('honors a custom sourceRoot directory', () => {
    fs.mkdirSync(path.join(root, 'source', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'source', 'lib', 'x.ts'), 'export const x = 1;');

    const result = scan(root, 'source');

    expect(result.topDirs).toEqual(['lib']);
    expect(result.files[0].path).toBe('source/lib/x.ts');
    expect(result.files[0].segments).toEqual(['lib', 'x.ts']);
  });
});

describe('scan · every directory on the skip list', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-skip-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // One entry stood in for the whole set (`node_modules` and `.next`), so the
  // other eight could be dropped with the suite green. Each is its own contract,
  // and the build outputs are the expensive ones to lose: `dist/`, `build/`,
  // `out/` and `coverage/` hold compiled copies of the very files being scanned,
  // so every module would be counted twice and every import in the emitted
  // bundle judged as if a human wrote it.
  it.each([
    'node_modules', '.git', '.next', '.nuxt', '.turbo', '.cache',
    'dist', 'build', 'out', 'coverage',
  ])('never walks into %s', (dir) => {
    fs.mkdirSync(path.join(root, 'src', dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', dir, 'noise.ts'), 'export const x = 1;');
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'components', 'Real.ts'), 'export const y = 1;');

    const result = scan(root);

    expect(result.files.map((file) => file.path)).toEqual(['src/components/Real.ts']);
    expect(result.topDirs).not.toContain(dir);
  });
});

describe('scan · the order it promises, whatever the filesystem answers', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-order-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** A reader that answers in the reverse of name order — what ext4 may do. */
  const reversed = (dir: string) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? 1 : -1));

  it('walks files and top dirs in name order even when the reader does not', () => {
    // macOS answers in name order already, and so does a small ext4 directory —
    // which is why an unsorted walk looks fine on every machine that runs the
    // suite and reorders every downstream list on the ones that do not. Every
    // consumer that sorts its own output (deps' skipped folders, survey's root
    // files) is downstream of this order, so it has to be settled here.
    fs.mkdirSync(path.join(root, 'src', 'zebra'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'apple'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'zebra', 'z.ts'), 'export const z = 1;');
    fs.writeFileSync(path.join(root, 'src', 'apple', 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(root, 'src', 'main.ts'), 'export const m = 1;');

    const result = scan(root, 'src', { readdir: reversed });

    expect(result.topDirs).toEqual(['apple', 'zebra']);

    expect(result.files.map((file) => file.path)).toEqual([
      'src/apple/a.ts',
      'src/main.ts',
      'src/zebra/z.ts',
    ]);
  });

  it('reads the same tree the same way through the real reader', () => {
    fs.mkdirSync(path.join(root, 'src', 'beta'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'beta', 'b.ts'), 'export const b = 1;');

    expect(scan(root, 'src').files.map((file) => file.path)).toEqual(['src/beta/b.ts']);
  });
});

describe('importGraphDerivation · one text, wherever a graph-derived fact is reported', () => {
  const text = importGraphDerivation();

  it('names the mechanism, the three things it cannot see, and where the gate really is', () => {
    // Each clause is load-bearing and each was absent before. "Source text, not a
    // parsed AST" is the mechanism, so a reader knows what class of thing is missed
    // rather than being told to distrust the output generally. The three instances
    // are what a reader can check their own repo for. And the correction is what
    // stops "the graph is approximate" from being read as "the gates are
    // approximate" — false, and the more expensive belief of the two.
    expect(text).toContain('source text, not a parsed AST');
    expect(text).toContain('computed specifier');
    expect(text).toContain('import * as');
    expect(text).toContain('inside a string');
    expect(text).toContain('survey');
    expect(text).toContain('ESLint, on the AST');
  });

  it('indents every line, so it can sit inside an indented block', () => {
    // The `printConfigCaveats` shape: one text at two indents. `deps` nests it under
    // a module heading and `inspect` closes a flush report with it, and a version
    // that only indented its first line would look like a broken paragraph in one of
    // them — which is how a second copy gets written.
    const indented = importGraphDerivation('  ').split('\n');

    expect(indented.every((line) => line.startsWith('  '))).toBe(true);
    expect(indented.map((line) => line.slice(2))).toEqual(text.split('\n'));
  });
});

describe('outsideScanReach · the class of dead glob the tree does not have to explain', () => {
  it.each(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue'])(
    'settles nothing against a glob pinned to .%s, which this walk reads',
    (ext) => {
      // One contract per member of `SOURCE_EXT`: drop one and doctor starts telling an
      // adopter that a live ignore entry names a file type it does not read.
      expect(outsideScanReach(`src/**/*.${ext}`)).toBeNull();
    },
  );

  it.each(['css', 'json', 'md', 'snap', 'mts'])(
    'names .%s as a type this walk does not read',
    (ext) => {
      expect(outsideScanReach(`src/**/*.${ext}`)).toBe(
        `a file type this scan does not read (\`.${ext}\`)`,
      );
    },
  );

  it.each([
    'node_modules', '.git', '.next', '.nuxt', '.turbo', '.cache',
    'dist', 'build', 'out', 'coverage',
  ])('names %s as a directory this walk never descends into', (dir) => {
    // One contract per member of `NON_SOURCE_DIRS`: drop one and the walk starts
    // descending into it, and this sentence becomes the false statement it replaced.
    // Under a `.` root, which is the layout where these sit inside the scanned tree.
    expect(outsideScanReach(`${dir}/**`, '.')).toBe(
      `a directory this scan never descends into (\`${dir}\`)`,
    );

    // And below a named root, where the prefix test cannot reach it.
    expect(outsideScanReach(`src/${dir}/**/*.ts`)).toBe(
      `a directory this scan never descends into (\`${dir}\`)`,
    );
  });
});

/**
 * The invariant the three limbs above all rest on, and the only one here asserted by a
 * test rather than by a sentence: NO POSITIONAL LIMB EVER TESTS A SEGMENT LYING INSIDE
 * `sourceRoot`. Its own describe because it is a different claim — those cases ask what
 * each limb answers, these ask what no limb may touch.
 *
 * The axis is varied MECHANICALLY. A list of spellings is what failed three times: each
 * repair normalised the one spelling in front of it, and the next spelling walked
 * through. So the spellings here are GENERATED from the two rules `canonicalSegments`
 * normalises by — a segment that denotes no directory (`.`) and the empties a leading,
 * trailing or doubled separator leaves — composed over each other. Adding a rule to the
 * canonicaliser means adding a transform here, not a row.
 */
const SPELLINGS: [name: string, spell: (path: string) => string][] = [
  ['plain', (path) => path],
  ['leading ./', (path) => `./${path}`],
  ['trailing /', (path) => `${path}/`],
  ['wrapped', (path) => `./${path}/`],
  ['doubled separators', (path) => `//${path.split('/').join('//')}`],
  ['interleaved .', (path) => `./${path.split('/').join('/./')}/.`],
];

/** Both root shapes: one segment, and nested — the second is where an offset can slip. */
const ROOT_PATHS = ['src', 'out/app'];

describe('outsideScanReach · the segments no limb may test', () => {
  /** Every spelling of `path`, paired with a glob whose literal prefix is that same path. */
  const cells = (path: string, tail: string) =>
    SPELLINGS.flatMap(([rootName, spellRoot]) =>
      SPELLINGS.map(([globName, spellGlob]): [string, string | null] => [
        `root ${rootName} × glob ${globName}`,
        outsideScanReach(`${spellGlob(path)}/${tail}`, spellRoot(path)),
      ]));

  it.each(ROOT_PATHS)('reads every spelling of %s as the same root, on both sides', (path) => {
    // Equal roots FIRST, before anything about limbs: a glob whose literal prefix names
    // the declared root is inside it, so a readable file under it settles nothing at all.
    // Any spelling the canonicaliser fails to collapse fires a positional limb here.
    const answers = cells(path, '**/*.ts');

    expect(answers.filter(([, reason]) => reason !== null)).toEqual([]);
  });

  it.each(ROOT_PATHS)('gives one answer for every spelling of %s', (path) => {
    // And with the extension limb — the one limb that is root-independent — the answer
    // must be not merely non-positional but IDENTICAL in every cell.
    const answers = cells(path, '**/*.css');

    expect([...new Set(answers.map(([, reason]) => reason))])
      .toEqual(['a file type this scan does not read (`.css`)']);
  });

  it('places a skipped directory the same way however the root is spelled', () => {
    // The offset reads the root's segment COUNT, so a spelling that leaves a phantom
    // segment moves where the limb starts looking. `dist` sits one below each root.
    const answers = SPELLINGS.map(
      ([, spell]) => outsideScanReach('src/dist/**/*.ts', spell('src')),
    );

    expect([...new Set(answers)])
      .toEqual(['a directory this scan never descends into (`dist`)']);
  });

  it('names the root the way the config spells it, not the way it was compared', () => {
    // The comparison needs every spelling to be one path; the adopter needs to find the
    // string their own config holds.
    expect(outsideScanReach('scripts/**', './src/')).toBe('outside the source root `./src/`');
  });
});

describe('outsideScanReach · the limbs, on shapes the axis does not generate', () => {
  it('never tests a segment lying inside the source root, however the glob spells it', () => {
    // The pair that was never formed: a NESTED root whose FIRST segment is itself in
    // `NON_SOURCE_DIRS`. Offset by whether the glob spells the whole root, `out` falls
    // back to index 0 and gets tested — and the same run reports files found under it.
    // The operative disqualifier here is the extension, and that is what must be said.
    expect(outsideScanReach('out/**/*.css', 'out/app'))
      .toBe('a file type this scan does not read (`.css`)');

    expect(outsideScanReach('out/**/*.ts', 'out/app')).toBeNull();
    expect(outsideScanReach('build/**/*.ts', 'build/src')).toBeNull();
    expect(outsideScanReach('coverage/**', 'coverage/app')).toBeNull();

    // Past the root, the limb still fires — the offset shortens its reach, it does not
    // switch it off.
    expect(outsideScanReach('out/app/dist/**/*.ts', 'out/app'))
      .toBe('a directory this scan never descends into (`dist`)');
  });

  it('reads `./x` and `x` as one path, so a glob inside the root is not called outside', () => {
    // `./src/**/*.css` points INSIDE `src`. Compared segment for segment, `.` is not
    // `src`, the root limb fires first and the true reason behind it never runs.
    expect(outsideScanReach('./src/**/*.css'))
      .toBe('a file type this scan does not read (`.css`)');

    expect(outsideScanReach('./src/**/*.ts')).toBeNull();

    expect(outsideScanReach('./src/dist/**/*.ts'))
      .toBe('a directory this scan never descends into (`dist`)');

    // And a normalised glob that really does leave the root still says so.
    expect(outsideScanReach('./scripts/**')).toBe('outside the source root `src`');
  });

  it('settles nothing positional about a glob carrying `..`', () => {
    // Resolving `..` needs the root as a real path, and this is told only how it is
    // spelled — `out/../src/**` reads as leaving `src` while landing inside it. The
    // extension limb does not depend on position, so it still answers.
    expect(outsideScanReach('../src/**/*.ts')).toBeNull();
    expect(outsideScanReach('out/../src/**/*.ts')).toBeNull();

    expect(outsideScanReach('out/../src/**/*.css'))
      .toBe('a file type this scan does not read (`.css`)');
  });

  it('reads the skipped directory past the source root, never as the root itself', () => {
    // The walk STARTS at the root and only tests entries below it, so a root that is
    // itself called `dist` is descended into. Read from segment zero, this fixture
    // would report a repo whose sources live in `dist/` as unreachable.
    expect(outsideScanReach('dist/**/*.ts', 'dist')).toBeNull();
    expect(outsideScanReach('dist/pages/**/*.ts', 'dist')).toBeNull();

    // One level down under that same root is skipped again.
    expect(outsideScanReach('dist/dist/**/*.ts', 'dist'))
      .toBe('a directory this scan never descends into (`dist`)');
  });

  it('reaches a skipped directory named after a wildcard, and not in file position', () => {
    // Every path `**/dist/**` matches carries a `dist` component, so the walk cannot
    // produce one — decidable even though the literal prefix is empty.
    expect(outsideScanReach('**/dist/**')).toBe(
      'a directory this scan never descends into (`dist`)',
    );

    // Last segment is a filename, not a directory, so the name decides nothing there.
    expect(outsideScanReach('src/pages/dist')).toBeNull();
  });

  it('names a literal prefix that leaves the source root, and names the root it left', () => {
    expect(outsideScanReach('scripts/**')).toBe('outside the source root `src`');
    expect(outsideScanReach('scripts/**', 'app')).toBe('outside the source root `app`');

    expect(outsideScanReach('packages/lib/**', 'packages/app'))
      .toBe('outside the source root `packages/app`');
  });

  it('settles nothing a wildcard could still carry back into the root', () => {
    // Conservative in one direction only: the caller states this class as fact and hands
    // everything else back, so a wrong reason is a fabrication where a null is a
    // hand-back. Each of these could match a scanned path.
    expect(outsideScanReach('**/scripts/**')).toBeNull();
    expect(outsideScanReach('src/generated/**')).toBeNull();
    expect(outsideScanReach('packages/**', 'packages/app')).toBeNull();
    // A root of `.` is the whole project, so nothing is outside it — the fork `scan`
    // takes when it decides the prefix it puts back on each path.
    expect(outsideScanReach('scripts/**', '.')).toBeNull();
  });

  it('leaves an extension a brace could still expand undecided', () => {
    // The shape this ticket is about. `**/*.{gen` compiles to a literal brace and
    // reaches nothing, but the type it pins cannot be read off the text — calling it a
    // type this walk does not read reports a typo as an entry that is working.
    expect(outsideScanReach('src/**/*.{gen')).toBeNull();
    expect(outsideScanReach('src/**/*.{ts,tsx}')).toBeNull();
  });

  it('reads the extension off the last segment, and only when the glob pins one', () => {
    expect(outsideScanReach('src/a.b/**')).toBeNull();
    expect(outsideScanReach('src/**/*.d.ts')).toBeNull();
    expect(outsideScanReach('src/pages/a.')).toBeNull();
    expect(outsideScanReach('src/.eslintrc')).toBeNull();
  });
});
