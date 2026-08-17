import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { analyze } from './analyze';
import { defineBlueprint } from '../config';
// Test-only import of the full emit module — src keeps the leaf boundary; the
// agreement check needs the config `emitLint` really emits, not a paraphrase.
import { emitLint } from '../emit/lint';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * The import half of `analyze` under `architecture.modules`.
 *
 * The defect this pins was the quiet one: `importFindings` early-returned on
 * every file whose `segments[0]` was not a declared layer, which under a modular
 * structure is every file there is — so a modular repo got no import finding at
 * all, and nothing on screen said so. Each case here is also checked against the
 * real ESLint the same blueprint emits, so the two cannot tell an adopter
 * different stories about one file.
 *
 * Order is the fixture: App (0) < common (1). App may reach common; common may
 * not reach App. `common` narrows its importers to App, selfOnly.
 */
const modular = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'ui' },
      { name: 'hooks', does: 'state' },
    ],
    modules: [
      { name: 'App', does: 'the game shell' },
      {
        name: 'common',
        does: 'shared helpers',
        layers: false,
        allowedImporters: [{ module: 'App', selfOnly: true }],
      },
    ],
    folder: { layout: 'folder', entry: 'index', private: [] },
  },
});

function file(segments: string[], imports: Partial<ImportRef>[] = []): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: imports.map((ref) => ({ specifier: '', names: [], isExport: false, ...ref })),
  };
}

const scanOf = (files: ScannedFile[], topDirs = ['App', 'common']): ScanResult =>
  ({ topDirs, files });

/** Every finding one file's single reference produces, folder findings filtered out. */
function refFindings(segments: string[], ref: Partial<ImportRef>) {
  const FOLDER_RULES = [
    'undeclared-folder', 'missing-layer', 'missing-module', 'no-entry',
    'declaratory-self-only', 'owns-not-installed', 'cycle',
  ];

  return analyze(scanOf([file(segments, [ref])]), modular)
    .filter((finding) => !FOLDER_RULES.includes(finding.rule));
}

const rulesOf = (segments: string[], ref: Partial<ImportRef>) =>
  refFindings(segments, ref).map((finding) => finding.rule);

const BOARD = ['App', 'components', 'Board', 'index.tsx'];
const HOOK = ['App', 'hooks', 'useGame', 'index.ts'];
const ROOT = ['App', 'index.tsx'];
const COMMON = ['common', 'clamp.ts'];

describe('analyze · a modular repo is no longer silent about its imports', () => {
  it('finds the cross-module edge the flat reading reported nothing about', () => {
    // The one assertion the whole stage exists for: before, this list was empty.
    expect(rulesOf(COMMON, { specifier: '~app/App' })).toEqual(['flow-violation']);
  });

  it('names both modules and the rule that decided it', () => {
    const found = refFindings(COMMON, { specifier: '~app/App' })[0];

    expect(found).toMatchObject({
      severity: 'error',
      path: 'src/common/clamp.ts',
      subject: '~app/App',
    });

    expect(found.message).toBe(
      '"common" may not import module "App" ("~app/App") — a module may import only a module '
      + 'declared after it, unless that module\'s allowedImporters narrows it out.',
    );
  });

  it('reports a forbidden module once, however deep the reach into it', () => {
    // Barred outright is barred at both spellings and reported once by the
    // emitted ban — a second deep-import finding would split one debt in two.
    expect(rulesOf(COMMON, { specifier: '~app/App/hooks/useGame' })).toEqual(['flow-violation']);
  });
});

describe('analyze · another module is reachable only at its entry', () => {
  it('passes the entry and catches what is behind it', () => {
    expect(rulesOf(BOARD, { specifier: '~app/common' })).toEqual([]);

    const deep = refFindings(BOARD, { specifier: '~app/common/clamp' })[0];

    expect(deep.rule).toBe('deep-import');

    expect(deep.message).toBe(
      '"~app/common/clamp" reaches inside module "common" — import the module through its entry.',
    );
  });

  it('catches a selfOnly module re-exported onward, and allows the plain import', () => {
    expect(rulesOf(BOARD, { specifier: '~app/common', isExport: true }))
      .toEqual(['selfonly-reexport']);

    expect(rulesOf(BOARD, { specifier: '~app/common' })).toEqual([]);
  });

  it('says nothing about an alias path into a folder no module declares', () => {
    // `undeclared-folder` owns that case, the same way it owns an undeclared
    // layer under the flat structure.
    expect(rulesOf(BOARD, { specifier: '~app/nope/x' })).toEqual([]);
  });
});

describe('analyze · the alias is how a module is reached from outside it', () => {
  it('catches a file reaching its own module at its entry', () => {
    const found = refFindings(BOARD, { specifier: '~app/App' })[0];

    expect(found.rule).toBe('flow-violation');

    expect(found.message).toBe(
      'Same-module import "~app/App" via the alias — use a relative path; the alias is how a '
      + 'module is reached from outside it.',
    );
  });

  it('catches a same-module path that names no declared layer', () => {
    expect(rulesOf(BOARD, { specifier: '~app/App/utils/x' })).toEqual(['flow-violation']);
  });

  it('catches the same reach inside a module that holds its files directly', () => {
    expect(rulesOf(COMMON, { specifier: '~app/common/other' })).toEqual(['flow-violation']);
  });
});

describe('analyze · inside a module the layer model applies verbatim', () => {
  it('allows the cross-layer alias reach its own layers are declared at', () => {
    expect(rulesOf(BOARD, { specifier: '~app/App/hooks' })).toEqual([]);
  });

  it('catches the upstream layer edge, one depth in', () => {
    const found = refFindings(HOOK, { specifier: '~app/App/components/Card' })[0];

    expect(found.rule).toBe('flow-violation');
    expect(found.message).toBe('"hooks" may not import "components" ("~app/App/components/Card").');
  });

  it('catches the same-layer alias edge, one depth in', () => {
    expect(rulesOf(BOARD, { specifier: '~app/App/components/Other' })).toEqual(['flow-violation']);
  });

  it('catches reaching past a folder\'s entry, one depth in', () => {
    expect(rulesOf(BOARD, { specifier: '~app/App/hooks/useGame/impl' })).toEqual(['deep-import']);
  });

  it('lets a module root file reach its own layers through the alias', () => {
    expect(rulesOf(ROOT, { specifier: '~app/App/components/Board' })).toEqual([]);
  });
});

describe('analyze · relative imports under a module, judged by modularVerdict', () => {
  it('says which module a relative path left, in the embedded rule\'s own words', () => {
    const found = refFindings(BOARD, { specifier: '../../../common/clamp' })[0];

    expect(found.rule).toBe('relative-escape');

    expect(found.message).toBe(
      'Relative import "../../../common/clamp" leaves module "App" — another module is reachable '
      + 'only at its entry, through the project alias, and only if that module allows this one to '
      + 'import it.',
    );
  });

  it('still judges the layer boundary inside the module', () => {
    const found = refFindings(BOARD, { specifier: '../../hooks/useGame' })[0];

    expect(found.message).toContain('leaves this layer');
  });

  it('names the right entry when a relative path reaches past a sibling folder', () => {
    const found = refFindings(BOARD, { specifier: '../Card/internals' })[0];

    expect(found.message).toContain('reaches past a sibling\'s entry');
    expect(found.message).toContain('import "index"');
  });

  it('leaves a module root file and a layerless module free inside their own folder', () => {
    expect(rulesOf(ROOT, { specifier: './components/Board' })).toEqual([]);
    expect(rulesOf(COMMON, { specifier: './math/deep' })).toEqual([]);
  });
});

describe('analyze · one file, one story — inspect and the emitted ESLint agree', () => {
  const config = [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(modular),
  ];

  const linter = new Linter({ configType: 'flat' });

  const linted = (segments: string[], specifier: string, isExport: boolean): boolean =>
    linter
      .verify(
        `${isExport ? 'export' : 'import'} { x } from "${specifier}";`,
        config,
        { filename: ['src', ...segments].join('/') },
      )
      .length > 0;

  // Each row is one import, judged twice: once by `analyze`, once by the real
  // ESLint running the config this same blueprint emits. Both booleans are
  // asserted, so a row cannot pass by being silent on both sides when it should
  // have fired on both.
  type Case = [name: string, from: string[], specifier: string];

  const FLAGGED: Case[] = [
    ['an upstream module reach', COMMON, '~app/App'],
    ['past another module\'s entry', BOARD, '~app/common/clamp'],
    ['a file reaching its own module\'s entry', BOARD, '~app/App'],
    ['the upstream layer edge inside a module', HOOK, '~app/App/components/Card'],
    ['a relative path into another module', BOARD, '../../../common/clamp'],
  ];

  const CLEAN: Case[] = [
    ['another module at its entry', BOARD, '~app/common'],
    ['the intra-module cross-layer reach', BOARD, '~app/App/hooks'],
    ['a root file reaching its own layer', ROOT, '~app/App/components/Board'],
    ['a root file reaching its own layer, bare', ROOT, '~app/App/components'],
    ['a relative path inside the same folder', BOARD, './helper'],
  ];

  it.each(FLAGGED)('both channels flag %s', (_name, from, specifier) => {
    expect(rulesOf(from, { specifier }).length).toBeGreaterThan(0);
    expect(linted(from, specifier, false)).toBe(true);
  });

  it.each(CLEAN)('both channels pass %s', (_name, from, specifier) => {
    expect(rulesOf(from, { specifier })).toEqual([]);
    expect(linted(from, specifier, false)).toBe(false);
  });

  it('agrees about a selfOnly re-export, which only the export form trips', () => {
    expect(rulesOf(BOARD, { specifier: '~app/common', isExport: true }))
      .toEqual(['selfonly-reexport']);

    expect(linted(BOARD, '~app/common', true)).toBe(true);
    expect(linted(BOARD, '~app/common', false)).toBe(false);
  });
});

describe('analyze · a folder no net covers gets no import verdict', () => {
  it('says nothing about imports from a folder inside a module that names no layer', () => {
    // The emitted config writes no entry for `App/utils/**`, so a finding here
    // would be a story ESLint never tells. `undeclared-folder` reports the
    // folder itself instead.
    expect(rulesOf(['App', 'utils', 'x.ts'], { specifier: '~app/common/clamp' })).toEqual([]);
  });

  it('says nothing about imports from a top-level folder no module declares', () => {
    expect(
      analyze(
        scanOf([file(['nope', 'x.ts'], [{ specifier: '~app/App' }])], ['App', 'common', 'nope']),
        modular,
      ).map((finding) => finding.rule),
    ).not.toContain('flow-violation');
  });
});
