import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { analyze } from './analyze';
import { defineBlueprint } from '../config';
import type { Blueprint, OwnedPrimitive } from '../config';
// Test-only import of the full emit module — src keeps the leaf boundary; the
// agreement check needs the config `emitLint` really emits, not a paraphrase.
import { emitLint } from '../emit/lint';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * Package ownership, judged by both engines over one config.
 *
 * `analyze` used to re-derive ownership from raw `owns` and aggregate it: every
 * owner of anything matching the specifier went into one list, and the whole
 * import passed if the file's own net was in it. Three capabilities the emitted
 * config has are invisible to a reading like that — a package two owners split
 * by name, `pattern`, and `exempt` — and each is a case here, asked of `analyze`
 * and of the real ESLint running `emitLint`'s own output.
 *
 * `emitLint` is the authority in every row: the emitted config is what an
 * adopter's CI runs, so a disagreement is `inspect` being wrong by definition.
 */

const OWNING_LAYER = 'hooks';

/** The one exempt glob two suites below share, so the negation can quote it. */
const EXEMPT = 'src/components/legacy/**';

/** A two-layer blueprint whose `hooks` (and optionally `components`) own something. */
function owning(hooks: OwnedPrimitive[], components: OwnedPrimitive[] = []): Blueprint {
  return defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'ui', ...(components.length ? { owns: components } : {}) },
        { name: OWNING_LAYER, does: 'state', owns: hooks },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
    },
  });
}

function file(segments: string[], ref: Partial<ImportRef>): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: [{ specifier: '', names: [], isExport: false, ...ref }],
  };
}

const scanOf = (files: ScannedFile[]): ScanResult =>
  ({ topDirs: ['components', OWNING_LAYER], files });

/** Every `package-ownership` finding `analyze` makes about one file's one import. */
const inspectFindings = (blueprint: Blueprint, segments: string[], ref: Partial<ImportRef>) =>
  analyze(scanOf([file(segments, ref)]), blueprint)
    .filter((finding) => finding.rule === 'package-ownership');

/** The same import, judged by the real ESLint running what this blueprint emits. */
function lintMessages(blueprint: Blueprint, segments: string[], ref: Partial<ImportRef>): string[] {
  const names = ref.names?.length ? `{ ${ref.names.join(', ')} }` : '* as ns';
  const source = `import ${names} from "${ref.specifier}";\n`;

  return new Linter({ configType: 'flat' })
    .verify(
      source,
      [
        { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
        ...emitLint(blueprint),
      ],
      { filename: ['src', ...segments].join('/') },
    )
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

/** Whether each engine says this import is barred — the two claims a row compares. */
const verdicts = (blueprint: Blueprint, segments: string[], ref: Partial<ImportRef>) => ({
  inspect: inspectFindings(blueprint, segments, ref).length > 0,
  eslint: lintMessages(blueprint, segments, ref).length > 0,
});

describe('analyze · one package, two owners, split by name', () => {
  // The measured divergence this suite exists for, and it needs no modules at all:
  // `components` owns createContext, `hooks` owns useState, and one file imports
  // both. Aggregated, `components` landed in the owner list and laundered the
  // useState half of its own import — `inspect` green, `eslint` red.
  const split = owning(
    [{ package: 'react', imports: ['useState'] }],
    [{ package: 'react', imports: ['createContext'] }],
  );

  const BOTH = { specifier: 'react', names: ['createContext', 'useState'] };

  const reaching = (segments: string[], names: string[]) =>
    verdicts(split, segments, { specifier: 'react', names });

  it('flags the half this layer does not own, as the emitted config does', () => {
    expect(verdicts(split, ['components', 'W.tsx'], BOTH)).toEqual({ inspect: true, eslint: true });
  });

  it('names only the restricted half, and the owner that holds it', () => {
    const [found, ...rest] = inspectFindings(split, ['components', 'W.tsx'], BOTH);

    expect(rest).toEqual([]);

    // `createContext` is this layer's own and stays out of both the sentence and
    // the subject — baselining the debt must not baseline the legal import beside it.
    expect(found.subject).toBe('react useState');

    expect(found.message).toBe(
      '"react" (useState) is owned by hooks — not importable from "components".',
    );
  });

  it('says nothing about the half this layer does own', () => {
    expect(reaching(['components', 'W.tsx'], ['createContext']))
      .toEqual({ inspect: false, eslint: false });
  });

  it('lets the owning layer reach its own half', () => {
    expect(reaching([OWNING_LAYER, 'useThing.ts'], ['useState']))
      .toEqual({ inspect: false, eslint: false });
  });
});

describe('analyze · a pattern owns a group of packages', () => {
  // `pattern: true` compiles to a `no-restricted-imports` PATTERNS group rather
  // than a paths entry. Matching the declared string against the specifier
  // verbatim, as the raw-`owns` reading did, means a glob never matches anything.
  const glob = owning([{ package: '@scope/*', pattern: true }]);

  const reaching = (segments: string[], specifier: string) =>
    verdicts(glob, segments, { specifier, names: ['thing'] });

  it('flags a package inside the owned group', () => {
    expect(reaching(['components', 'W.tsx'], '@scope/foo'))
      .toEqual({ inspect: true, eslint: true });
  });

  it('flags a path under a package inside the group', () => {
    // Measured: a group is gitignore-shaped, so it reaches descendants too.
    expect(reaching(['components', 'W.tsx'], '@scope/foo/bar'))
      .toEqual({ inspect: true, eslint: true });
  });

  it('leaves a package outside the group alone', () => {
    expect(reaching(['components', 'W.tsx'], '@other/foo'))
      .toEqual({ inspect: false, eslint: false });
  });

  it('lets the owning layer reach the group', () => {
    expect(reaching([OWNING_LAYER, 'useThing.ts'], '@scope/foo'))
      .toEqual({ inspect: false, eslint: false });
  });

  it('names the pattern the owner declared, not the specifier that tripped it', () => {
    const [found] = inspectFindings(glob, ['components', 'W.tsx'], {
      specifier: '@scope/foo',
      names: ['thing'],
    });

    expect(found.subject).toBe('@scope/foo thing');
    expect(found.message).toContain('is owned by hooks');
  });
});

describe('analyze · an exempt glob lifts the restriction off a file', () => {
  // `emitLint` emits the exemption as a second entry the exempt files never
  // reach; the raw-`owns` reading did not know the field existed, so `inspect`
  // reported a file its own emitted config deliberately lets through.
  const exempting = owning([{ package: 'lodash', exempt: ['src/components/legacy/**'] }]);

  it('says nothing about a file the exemption covers', () => {
    expect(verdicts(exempting, ['components', 'legacy', 'W.tsx'], { specifier: 'lodash' }))
      .toEqual({ inspect: false, eslint: false });
  });

  it('still flags a file beside it that the exemption does not cover', () => {
    expect(verdicts(exempting, ['components', 'Fresh.tsx'], { specifier: 'lodash' }))
      .toEqual({ inspect: true, eslint: true });
  });

  it('keeps a non-exempt restriction in force on the exempt file', () => {
    // The two-entry shape `emitLint` writes turns the exemption into a property of
    // the NET: the exempt file reaches only the entry carrying the restrictions
    // that declared no `exempt` at all, and those still apply to it.
    const mixed = owning([
      { package: 'lodash', exempt: ['src/components/legacy/**'] },
      { package: 'axios' },
    ]);

    expect(verdicts(mixed, ['components', 'legacy', 'W.tsx'], { specifier: 'axios' }))
      .toEqual({ inspect: true, eslint: true });

    expect(verdicts(mixed, ['components', 'legacy', 'W.tsx'], { specifier: 'lodash' }))
      .toEqual({ inspect: false, eslint: false });
  });
});

describe('analyze · a testFiles negation re-includes what the exempt glob excused', () => {
  // The exemption and the test globs ride ONE ordered `ignores` on the emitted
  // entry, so a `!` in `testFiles` re-includes a file the exempt glob before it
  // excluded — and reading the exempt half alone called that file exempt while
  // eslint linted it. A false NEGATIVE: a real violation, on screen nowhere.
  const negated = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'ui' },
        { name: OWNING_LAYER, does: 'state', owns: [{ package: 'lodash', exempt: [EXEMPT] }] },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
      testFiles: ['**/*.test.{js,jsx}', `!${EXEMPT}`],
    },
  });

  it('flags the re-included test file, in both engines', () => {
    expect(verdicts(negated, ['components', 'legacy', 'Old.test.jsx'], { specifier: 'lodash' }))
      .toEqual({ inspect: true, eslint: true });
  });

  it('re-includes the whole excused subtree, not only the tests in it', () => {
    // The negation is the LAST entry of one list, so it re-includes everything
    // the exempt glob matched — a plain file included. The same file under the
    // same exempt glob with no negation declared is exempt, which is what makes
    // the ordering (not the exempt half alone) the thing that decides.
    const plain = ['components', 'legacy', 'Old.jsx'];

    expect(verdicts(negated, plain, { specifier: 'lodash' }))
      .toEqual({ inspect: true, eslint: true });

    expect(verdicts(owning([{ package: 'lodash', exempt: [EXEMPT] }]), plain, {
      specifier: 'lodash',
    })).toEqual({ inspect: false, eslint: false });
  });

  it('leaves a test file the negation does not reach exempt from everything', () => {
    expect(verdicts(negated, ['components', 'Fresh.test.jsx'], { specifier: 'lodash' }))
      .toEqual({ inspect: false, eslint: false });
  });
});
