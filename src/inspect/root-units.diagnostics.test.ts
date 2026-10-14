import { describe, expect, it } from 'vitest';
import { defineBlueprint } from '../config';
import { rootUnitFindings } from './root-units';
import { extractImportAnalysis } from './scan';
import { analyzeModuleImports } from '../plugin';
import type { ScannedFile } from './types';

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app', additionalAliases: { '~secondary': './src' },
    modules: [
      { name: 'app', does: 'composition', dependsOn: ['shop'] },
      { name: 'shop', does: 'commerce' },
    ],
    layers: [{ name: 'domain', does: 'logic', layout: 'folder' }],
  },
});

function file(name: string, source = ''): ScannedFile {
  const extracted = extractImportAnalysis(source, name);
  const modules = analyzeModuleImports(source, name);

  return {
    path: `src/${name}`, segments: name.split('/'), imports: extracted.imports,
    importAnalysis: extracted.analysis, moduleSpecifiers: modules.specifiers,
    unknownModuleSpecifiers: modules.unknown,
  };
}

function findings(files: ScannedFile[]) {
  return rootUnitFindings({ files, topDirs: ['app', 'shop'] }, blueprint);
}

describe('root-unit diagnostic fact delivery', () => {
  it.each([
    {
      files: [file('shop/Feature.ts')], rule: 'no-entry',
      fragments: ['"shop"', 'no supported index entry', 'review its public API'],
    },
    {
      files: [file('shop/index.ts'), file('shop/index.tsx')], rule: 'ambiguous-root-entry',
      fragments: ['src/shop/index.ts, src/shop/index.tsx', 'exactly one'],
    },
    {
      files: [file('shop/index.ts', 'import(runtime());'), file('shop/Feature.ts')],
      rule: 'root-reachability-unknown', fragments: ['"shop"', 'orphan conclusions are withheld'],
    },
    {
      files: [file('shop/index.ts'), file('shop/Feature.ts')], rule: 'orphan-root-file',
      fragments: ['"src/shop/index.ts"', 'remove, relocate, or connect'],
    },
    {
      files: [file('shop/index.ts', 'import "~app/shop";')], rule: 'flow-violation',
      fragments: ['"~app/shop"', 'use a relative path'],
    },
    {
      files: [file('main.ts', 'import "./shop";'), file('shop/index.ts')], rule: 'canonical-alias',
      fragments: ['"./shop"', 'bare canonical alias "~app/shop"'],
    },
    {
      files: [file('main.ts', 'import "~app/shop";')], rule: 'missing-root-entry',
      fragments: ['"~app/shop"', 'no uniquely resolvable root entry', 'exactly one'],
    },
  ])('delivers identity and corrective action for $rule', ({ files, rule, fragments }) => {
    const result = findings(files);

    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe(rule);

    for (const fragment of fragments) {
      expect(result[0].message).toContain(fragment);
    }
  });
});

describe('root canonical spelling responsibility', () => {
  it('accepts canonical source-root wiring without an invented alias violation', () => {
    expect(findings([file('main.ts', 'import "~app/shop";'), file('shop/index.ts')])).toEqual([]);
  });

  it('enforces canonical spelling for relative bare imports from another module', () => {
    expect(findings([file('app/page.ts', 'import "../shop";'), file('shop/index.ts')]))
      .toEqual([expect.objectContaining({ rule: 'canonical-alias', subject: '../shop' })]);
  });

  it('leaves noncanonical alias checks for non-root-wiring callers to dependency findings', () => {
    expect(findings([file('app/page.ts', 'import "~secondary/shop";'), file('shop/index.ts')]))
      .toEqual([]);
  });

  it('reports source-root deep imports when no dependency verdict applies', () => {
    const result = findings([
      file('main.ts', 'import "~app/shop/index";'), file('shop/index.ts'),
    ]);

    expect(result).toEqual([expect.objectContaining({ rule: 'deep-import' })]);
    expect(result[0].message).toContain('"~app/shop/index" reaches inside a unit');
  });
});

describe('bounded traversal and exact extension suffixes', () => {
  it('visits converging cycles fully without repeating members', () => {
    expect(findings([
      file('shop/index.ts', 'import "./a"; import "./a"; import "./b";'),
      file('shop/a.ts', 'import "./index"; import "./b";'),
      file('shop/b.ts', 'import "./c";'),
      file('shop/c.ts', 'import "./d";'),
      file('shop/d.ts', 'require(runtime());'),
    ])).toEqual([expect.objectContaining({
      rule: 'root-reachability-unknown', path: 'src/shop/d.ts',
    })]);
  });

  it.each([
    ['Feature.js.helper.js', 'Feature.js.helper.ts'],
    ['Feature.js.helper.js', 'Feature.js.helper.tsx'],
    ['Feature.jsx.helper.jsx', 'Feature.jsx.helper.tsx'],
  ])('substitutes only the suffix of %s', (specifier, target) => {
    expect(findings([
      file('shop/index.ts', `import "./${specifier}";`), file(`shop/${target}`),
    ])).toEqual([]);
  });
});
