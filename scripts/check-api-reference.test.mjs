import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  apiReferenceProblems,
  documentedModules,
  documentedSymbols,
  entryPoints,
  exportedNames,
  SUBPATH_CONTROLS,
} from './check-api-reference.mjs';

const pkg = {
  name: '@kekkai/blueprint',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './operational-contract': {
      types: './dist/operational-contract/index.d.ts',
      import: './dist/operational-contract/index.js',
    },
    './package.json': './package.json',
  },
};

const SUBPATH = '@kekkai/blueprint/operational-contract/index.md';

const ROOT_PAGE = [
  '# @kekkai/blueprint',
  '',
  '## Modules',
  '',
  '- [@kekkai/blueprint/operational-contract](@kekkai/blueprint/operational-contract/index.md)',
  '',
  '## Author',
  '',
  '- [defineBlueprint](functions/defineBlueprint.md)',
  '',
].join('\n');

const SUBPATH_PAGE = [
  '[@kekkai/blueprint](../../../index.md) / @kekkai/blueprint/operational-contract',
  '',
  '# @kekkai/blueprint/operational-contract',
  '',
  '## Variables',
  '',
  '- [OPERATIONAL\\_SURFACES](variables/OPERATIONAL_SURFACES.md)',
  '',
  '## Functions',
  '',
  '- [~~renderFreshScaffoldNote~~](functions/renderFreshScaffoldNote.md)',
  '',
  '## References',
  '',
  '### defineBlueprint',
  '',
  'Re-exports [defineBlueprint](../../../functions/defineBlueprint.md)',
  '',
].join('\n');

const EXPORTS = {
  'src/index.ts': ['defineBlueprint', 'migrateLegacyBlueprint'],
  'src/operational-contract/index.ts': [
    'OPERATIONAL_SURFACES',
    'defineBlueprint',
    'renderFreshScaffoldNote',
  ],
};

function problems({ pages = {}, exportsOf = {}, entries = entryPoints(pkg) } = {}) {
  const site = { 'index.md': ROOT_PAGE, [SUBPATH]: SUBPATH_PAGE, ...pages };

  return apiReferenceProblems({
    entries,
    exportsOf: { ...EXPORTS, ...exportsOf },
    readPage: (page) => site[page],
  });
}

describe('API reference entry points', () => {
  it('follows every declaration-backed package export', () => {
    expect(entryPoints(pkg)).toEqual([
      {
        specifier: '@kekkai/blueprint',
        source: 'src/index.ts',
        page: 'index.md',
        root: true,
      },
      {
        specifier: '@kekkai/blueprint/operational-contract',
        source: 'src/operational-contract/index.ts',
        page: SUBPATH,
        root: false,
      },
    ]);
  });

  it('reads module and symbol lists from generated index pages', () => {
    expect(documentedModules(ROOT_PAGE)).toEqual(['@kekkai/blueprint/operational-contract']);
    expect(documentedModules(SUBPATH_PAGE)).toEqual([]);
    expect(documentedSymbols(ROOT_PAGE)).toEqual(['defineBlueprint']);

    expect(documentedSymbols(SUBPATH_PAGE))
      .toEqual(['OPERATIONAL_SURFACES', 'renderFreshScaffoldNote', 'defineBlueprint']);
  });
});

describe('API reference completeness', () => {
  it('accepts a reference that documents both entry points exactly', () => {
    expect(problems()).toEqual([]);
  });

  it('fails when the subpath entry is omitted while the root stays documented', () => {
    const root = ROOT_PAGE.replace(/## Modules\n\n.+\n\n/, '');

    expect(problems({ pages: { 'index.md': root, [SUBPATH]: undefined } })).toEqual([
      '@kekkai/blueprint/operational-contract is a package export with no API module.',
      '@kekkai/blueprint/operational-contract has no API page at '
      + '@kekkai/blueprint/operational-contract/index.md.',
      'Control OPERATIONAL_SURFACES is missing from the '
      + '@kekkai/blueprint/operational-contract API page.',
    ]);
  });

  it('fails when a subpath export is missing from its page', () => {
    const page = SUBPATH_PAGE.replace('- [OPERATIONAL\\_SURFACES](variables/OPERATIONAL_SURFACES.md)\n', '');

    expect(problems({ pages: { [SUBPATH]: page } })).toEqual([
      '@kekkai/blueprint/operational-contract exports OPERATIONAL_SURFACES, '
      + 'which its API page omits.',
      'Control OPERATIONAL_SURFACES is missing from the '
      + '@kekkai/blueprint/operational-contract API page.',
    ]);
  });

  it('fails when the reference exposes an internal module or symbol', () => {
    const root = ROOT_PAGE.replace(
      '## Author',
      '- [@kekkai/blueprint/operational-contract/transformation](x/index.md)\n\n## Author',
    );

    const page = `${SUBPATH_PAGE}- [LayerToModuleCandidateFact](interfaces/LayerToModuleCandidateFact.md)\n`;

    expect(problems({ pages: { 'index.md': root, [SUBPATH]: page } })).toEqual([
      'The API documents module @kekkai/blueprint/operational-contract/transformation, '
      + 'which is not a package export.',
      '@kekkai/blueprint/operational-contract documents LayerToModuleCandidateFact, '
      + 'which it does not export.',
    ]);
  });

  it('fails when the root documents a symbol it does not export, or nothing', () => {
    const extra = ROOT_PAGE.replace('## Author\n\n', '## Author\n\n- [OPERATIONAL\\_SURFACES](x.md)\n');
    const empty = ROOT_PAGE.replace(/## Author\n\n.+\n/, '');

    expect(problems({ pages: { 'index.md': extra } })).toEqual([
      '@kekkai/blueprint documents OPERATIONAL_SURFACES, which it does not export.',
    ]);

    expect(problems({ pages: { 'index.md': empty } })).toEqual([
      '@kekkai/blueprint documents no symbols.',
    ]);
  });

  it('keeps the package version out of the API title', () => {
    const versioned = ROOT_PAGE.replace('# @kekkai/blueprint\n', '# @kekkai/blueprint v4.0.0\n');

    expect(problems({ pages: { 'index.md': versioned } })).toEqual([
      'index.md must be titled "# @kekkai/blueprint" without a version.',
    ]);
  });

  it('stops at a missing root index', () => {
    expect(problems({ pages: { 'index.md': undefined } })).toEqual([
      '@kekkai/blueprint has no API index at index.md.',
    ]);
  });

  it('rejects a control that is not a subpath-only export', () => {
    expect(problems({
      exportsOf: { 'src/index.ts': ['defineBlueprint', 'OPERATIONAL_SURFACES'] },
      pages: { 'index.md': ROOT_PAGE },
    })).toEqual([
      'Control OPERATIONAL_SURFACES must be exported only by '
      + '@kekkai/blueprint/operational-contract.',
    ]);

    expect(problems({
      exportsOf: {
        'src/operational-contract/index.ts': ['defineBlueprint', 'renderFreshScaffoldNote'],
      },
      pages: { [SUBPATH]: SUBPATH_PAGE.replace(/- \[OPERATIONAL.+\n/, '') },
    })).toEqual([
      'Control OPERATIONAL_SURFACES must be exported only by '
      + '@kekkai/blueprint/operational-contract.',
    ]);

    const rootOnly = entryPoints({ ...pkg, exports: { '.': pkg.exports['.'] } });
    const root = ROOT_PAGE.replace(/## Modules\n\n.+\n\n/, '');

    expect(problems({ entries: rootOnly, pages: { 'index.md': root } })).toEqual([
      'Control OPERATIONAL_SURFACES names @kekkai/blueprint/operational-contract, '
      + 'which is not a package export.',
    ]);
  });
});

describe('API reference export authority', () => {
  it('reads each package entry point\'s exports from its TypeScript source', () => {
    const entries = entryPoints(JSON.parse(fs.readFileSync('package.json', 'utf-8')));
    const exported = exportedNames(entries.map((entry) => entry.source));
    const root = entries.find((entry) => entry.root);

    expect(entries.map((entry) => entry.specifier))
      .toEqual(['@kekkai/blueprint', '@kekkai/blueprint/operational-contract']);

    for (const [specifier, symbol] of Object.entries(SUBPATH_CONTROLS)) {
      const entry = entries.find((candidate) => candidate.specifier === specifier);

      expect(exported[entry.source]).toContain(symbol);
      expect(exported[root.source]).not.toContain(symbol);
    }

    expect(exported[root.source]).toContain('defineBlueprint');
    expect(exported['src/operational-contract/index.ts']).not.toContain('LayerToModuleCandidateFact');
  });
});
