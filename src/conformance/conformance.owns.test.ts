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

describe('one owns entry, one verdict — the glob halves agree too', () => {
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

  it('refuses a glob it could only approximate, naming the construct and the subset', async () => {
    // `foo[A-Z]*` is a form ESLint's own documentation uses, and the emitted
    // group would enforce it while inspect read the brackets literally. There is
    // no runtime dependency to borrow a matcher from — README promises none — so
    // the narrow contract is declared and the broad one refused.
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
        'src/components/Btn.jsx': 'export const Btn = () => null;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('"[…]" character class');
    expect(inspect.output).toContain('A pattern glob may use');
  });
});
