import { afterEach, describe, expect, it } from 'vitest';

import { cli, configSource, makeRepo, react, reactBlueprint, rm } from './conformance';
import type { RepoSpec } from './conformance';

/**
 * An `owns` entry's two glob halves, each against the ESLint matcher it is
 * emitted into — the aspect of the agreement suite that needed its own file.
 */

const dirs: string[] = [];

const repo = (spec: RepoSpec = {}): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

describe('one owns entry, one verdict — the pattern half', () => {
  const grouping = {
    ...reactBlueprint,
    architecture: {
      ...reactBlueprint.architecture,
      layers: [
        { name: 'components', does: 'render UI' },
        {
          name: 'services',
          does: 'data access',
          owns: [{ package: '@scope/*', pattern: true }],
        },
      ],
    },
  };

  it('flags a scoped, deep, differently-cased import in both engines', async () => {
    // Three things at once, and each was invisible to inspect before this pass:
    // the group is a glob (compared as an exact string), the specifier reaches
    // past the package name, and its case differs — `no-restricted-imports`
    // matches a group with `ignorecase` on by default. ESLint banned all three;
    // inspect saw none of them and printed a clean report beside a red lint.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(grouping),
        'src/components/Btn.jsx':
          'import ui from \'@SCOPE/Ui/Button\';\n\nexport const Btn = () => ui;\n',
        'src/services/api.jsx': 'export const api = 1;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('[package-ownership]');
    expect(inspect.output).toContain('"@SCOPE/Ui/Button" is owned by services');

    // The other engine, on the config this same blueprint emits.
    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-restricted-imports');
    expect(impact.output).toContain('1 hit(s)');
  });

  it('says nothing in either engine about a scope the group does not reach', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(grouping),
        'src/components/Btn.jsx':
          'import ui from \'@other/ui\';\n\nexport const Btn = () => ui;\n',
        'src/services/api.jsx': 'export const api = 1;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).not.toContain('[package-ownership]');

    const impact = await cli(dir, ['impact']);

    expect(impact.output).not.toContain('no-restricted-imports');
  });

  it('reads a character class in a pattern group the way the linter does', async () => {
    // `foo[A-Z]*` is a form ESLint's own documentation uses. A compiler that read
    // the brackets literally enforced a ban it could not see, so the fix is to
    // ask the rule's own matcher — which expands the class AND is case-insensitive,
    // so `fooabc` is reached too.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...grouping,
          architecture: {
            ...grouping.architecture,
            layers: [
              { name: 'components', does: 'render UI' },
              {
                name: 'services',
                does: 'data access',
                owns: [{ package: 'foo[A-Z]*', pattern: true }],
              },
            ],
          },
        }),
        'src/components/Btn.jsx':
          'import x from \'fooABC\';\n\nexport const Btn = () => x;\n',
        'src/services/api.jsx': 'export const api = 1;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('"fooABC" is owned by services');

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('no-restricted-imports');
    expect(impact.output).toContain('1 hit(s)');
  });
});

describe('one owns entry, one verdict — the exempt half', () => {
  it('exempts through braces carrying wildcards, in both engines', async () => {
    // The `exempt` half's own version of the same defect: braces are split and
    // the `*` INSIDE each branch escaped, where minimatch expands the braces and
    // then honours it. So `src/components/{legacy*,vendor*}/**` exempted nothing
    // in inspect and a whole tree in eslint — three files with two verdicts.
    const dir = repo({
      packageJson: react({ axios: '^1.0.0' }),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: {
            ...reactBlueprint.architecture,
            layers: [
              { name: 'components', does: 'render UI' },
              {
                name: 'services',
                does: 'data access',
                owns: [{ package: 'axios', exempt: ['src/components/{legacy*,vendor*}/**'] }],
              },
            ],
          },
        }),
        'src/components/legacy/Old.jsx':
          'import axios from \'axios\';\n\nexport const Old = () => axios;\n',
        'src/components/vendorX/Wrap.jsx':
          'import axios from \'axios\';\n\nexport const Wrap = () => axios;\n',
        'src/components/modern/New.jsx':
          'import axios from \'axios\';\n\nexport const New = () => axios;\n',
        'src/services/api.jsx': 'export const api = 1;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('src/components/modern/New.jsx');
    expect(inspect.output).not.toContain('src/components/legacy/Old.jsx');
    expect(inspect.output).not.toContain('src/components/vendorX/Wrap.jsx');

    // One hit in the other engine too — the exempted pair reach the entry that
    // carries no axios restriction, exactly as inspect just read them.
    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('no-restricted-imports');
    expect(impact.output).toContain('1 hit(s)');
  });

  it('reports the file a testFiles negation puts back inside the restriction', async () => {
    // The exemption and the test globs are ONE ordered `ignores` on the emitted
    // entry, so a `!` in `testFiles` re-includes what the exempt glob excused.
    // Reading the exempt half alone made `inspect` call this file exempt while
    // eslint flagged it — the false-NEGATIVE direction, a real violation with
    // nothing on screen. Both engines are asked here for that reason.
    const dir = repo({
      packageJson: react({ axios: '^1.0.0' }),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: {
            ...reactBlueprint.architecture,
            layers: [
              { name: 'components', does: 'render UI' },
              {
                name: 'services',
                does: 'data access',
                owns: [{ package: 'axios', exempt: ['src/components/legacy/**'] }],
              },
            ],
            testFiles: ['**/*.test.{js,jsx}', '!src/components/legacy/**'],
          },
        }),
        'src/components/legacy/Old.test.jsx':
          'import axios from \'axios\';\n\nexport const Old = () => axios;\n',
        'src/components/Fresh.test.jsx':
          'import axios from \'axios\';\n\nexport const Fresh = () => axios;\n',
        'src/services/api.jsx': 'export const api = 1;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('src/components/legacy/Old.test.jsx');
    // Still a test file everywhere the negation does not reach, so still silent.
    expect(inspect.output).not.toContain('src/components/Fresh.test.jsx');

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('src/components/legacy/Old.test.jsx');
    expect(impact.output).toContain('1 hit(s)');
  });
});
