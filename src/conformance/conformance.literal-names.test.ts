import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { lintFixture, makeRepo, react, rm } from './conformance';
import type { Verdict } from './conformance';

/**
 * A layer or module name carrying a replacement pattern, enforced by the real
 * linter over real files on disk (AC21) — one fixture per axis, each linted once.
 *
 * `lint.literal-names.test.ts` reads the emitted config and proves its three
 * positions spell one name one way. That is a claim about a data structure, and
 * it is satisfied by any implementation that makes the strings match — including
 * one that escapes the name into a shape ESLint then reads differently, where
 * the glob assertion stays green and the rules still reach no file. So the same
 * layer is asked again here through `ESLint#lintFiles`: a violation inside
 * `src/price$$tag/` that a collapsed glob cannot see, and the legal imports
 * beside it that refuse a net which simply fires on everything.
 *
 * `price$$tag` is a legal layer name — `validateLayerName` turns away glob,
 * path, quote and diagram characters, and `$` is in neither set.
 */

const blueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'price$$tag', does: 'pricing' },
    ],
    folder: { layout: 'flat', entry: 'index', private: [] },
  },
};

const FILES: Record<string, string> = {
  // Legal, and downstream: `components` is declared first, so reaching the
  // pricing layer through the alias is the flow, not a violation.
  'src/components/Button.js': [
    'import \'~app/price$$tag/rate\';',
    'export const Button = 1;',
    '',
  ].join('\n'),
  // The violation: an upstream layer, reached from inside the `$`-named folder.
  'src/price$$tag/rate.js': [
    'import \'~app/components/Button\';',
    'export const rate = 1;',
    '',
  ].join('\n'),
  // Legal in the same folder — a sibling by relative path, which is what the
  // same-layer ban tells the adopter to write.
  'src/price$$tag/index.js': [
    'import \'./rate\';',
    'export const price = 1;',
    '',
  ].join('\n'),
};

let dir = '';
let byFile: Map<string, Verdict[]>;

beforeAll(async () => {
  dir = makeRepo({ packageJson: react(), files: FILES });
  byFile = await lintFixture(dir, blueprint, ['src/**/*.js']);
});

afterAll(() => {
  rm(dir);
});

/** One file's verdicts — absent (never linted) is a different answer from clean. */
const at = (file: string): Verdict[] => byFile.get(file) as Verdict[];

describe('a layer name carrying a replacement pattern, as real ESLint reads it', () => {
  it('reaches every file of the fixture — the run these verdicts come from', () => {
    // A fixture file that never reached the run is what this catches — written
    // where `['src/**/*.js']` does not select it, or not written at all.
    expect([...byFile.keys()].sort()).toEqual(Object.keys(FILES).sort());
  });

  it('catches the flow violation inside src/price$$tag/', () => {
    const verdicts = at('src/price$$tag/rate.js');

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].rule).toBe('no-restricted-imports');
    expect(verdicts[0].message).toContain('violates the dependency flow');
  });

  it('leaves the legal imports on either side of it alone', () => {
    // Without these, a net matching everything passes the assertion above.
    expect(at('src/price$$tag/index.js')).toEqual([]);
    expect(at('src/components/Button.js')).toEqual([]);
  });
});

/**
 * The module axis of the same claim, and the same two questions asked of it.
 *
 * A module name reaches the emitted nets by two substitutions, not one: the
 * descent collapse cuts its root-file net, and the placeholder pass cuts the net
 * of every layer inside it. So this fixture carries a violation only the first
 * net can see and a violation only the second can — a collapse in either leaves
 * its file governed by nothing and its import unanswered.
 *
 * `Price$$Tag` is legal for the reason `price$$tag` is: `validateModuleName`
 * turns away glob, path, quote and diagram characters, and `$` is in neither set.
 */
const moduleBlueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'hooks', does: 'state' },
    ],
    modules: [
      { name: 'Shell', does: 'app frame' },
      { name: 'Price$$Tag', does: 'pricing' },
    ],
    folder: { layout: 'flat', entry: 'index', private: [] },
  },
};

const MODULE_FILES: Record<string, string> = {
  // Legal, from outside the module: `Shell` is declared first, so it may reach
  // a module declared after it — at that module's bare entry and no deeper.
  'src/Shell/index.js': [
    'import \'~app/Price$$Tag\';',
    'export const Shell = 1;',
    '',
  ].join('\n'),
  // The violation the ROOT-FILE net answers: an upstream module, reached from
  // the module's own entry. That net is the descent collapse's own output.
  'src/Price$$Tag/index.js': [
    'import \'~app/Shell\';',
    'export const Price = 1;',
    '',
  ].join('\n'),
  // Legal, one depth in: the alias route across its own module's layers, which
  // the same-module ban deliberately leaves open at a declared layer name.
  'src/Price$$Tag/components/Tag.js': [
    'import \'~app/Price$$Tag/hooks/useRate\';',
    'export const Tag = 1;',
    '',
  ].join('\n'),
  // The violation the LAYER net answers: an upstream layer of the same module.
  // That net is the placeholder pass, over `Price$$Tag/hooks`.
  'src/Price$$Tag/hooks/useRate.js': [
    'import \'~app/Price$$Tag/components/Tag\';',
    'export const useRate = 1;',
    '',
  ].join('\n'),
};

describe('a module name carrying a replacement pattern, as real ESLint reads it', () => {
  let moduleDir = '';
  let byModuleFile: Map<string, Verdict[]>;

  beforeAll(async () => {
    moduleDir = makeRepo({ packageJson: react(), files: MODULE_FILES });
    byModuleFile = await lintFixture(moduleDir, moduleBlueprint, ['src/**/*.js']);
  });

  afterAll(() => {
    rm(moduleDir);
  });

  const moduleAt = (file: string): Verdict[] => byModuleFile.get(file) as Verdict[];

  it('reaches every file of the fixture — the run these verdicts come from', () => {
    // The staging guard again, for this fixture's own files.
    expect([...byModuleFile.keys()].sort()).toEqual(Object.keys(MODULE_FILES).sort());
  });

  it('catches the module-flow violation in the module\'s own root file', () => {
    const verdicts = moduleAt('src/Price$$Tag/index.js');

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].rule).toBe('no-restricted-imports');
    expect(verdicts[0].message).toContain('"Price$$Tag" may not import this module');
  });

  it('catches the layer-flow violation inside a layer of that module', () => {
    const verdicts = moduleAt('src/Price$$Tag/hooks/useRate.js');

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].rule).toBe('no-restricted-imports');
    expect(verdicts[0].message).toContain('violates the dependency flow');
  });

  it('leaves the legal imports on either side of them alone', () => {
    // Without these, a net matching everything passes both assertions above.
    expect(moduleAt('src/Price$$Tag/components/Tag.js')).toEqual([]);
    expect(moduleAt('src/Shell/index.js')).toEqual([]);
  });
});
