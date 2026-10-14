import { describe, expect, it } from 'vitest';
import { defineBlueprint } from '../config';
import { analyze } from './analyze';
import { analyzeModuleImports } from '../plugin';
import { extractImportAnalysis } from './scan';
import type { ScannedFile } from './types';

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'app', does: 'composition', dependsOn: ['shop'] },
      { name: 'shop', does: 'commerce' },
      { name: 'other', does: 'other' },
    ],
    layers: [{ name: 'domain', does: 'logic', layout: 'folder' }],
  },
});

function file(name: string, source = ''): ScannedFile {
  const extracted = extractImportAnalysis(source, name);

  return {
    path: `src/${name}`, segments: name.split('/'), imports: extracted.imports,
    importAnalysis: extracted.analysis,
    moduleSpecifiers: analyzeModuleImports(source, name).specifiers,
    unknownModuleSpecifiers: analyzeModuleImports(source, name).unknown,
  };
}

function findings(files: ScannedFile[]) {
  return analyze({ files, topDirs: ['app', 'shop', 'other'] }, blueprint);
}

function rules(files: ScannedFile[]) {
  return findings(files).map(({ rule, path, subject }) => ({ rule, path, subject }));
}

describe('ordinary root units', () => {
  it('requires an entry only for direct governed root source and exempts recursive app', () => {
    expect(rules([
      file('shop/Feature.tsx'), file('other/domain/Foo/index.ts'),
      file('app/routes/page.tsx'),
    ])).toEqual([{ rule: 'no-entry', path: 'src/shop', subject: '' }]);
  });

  it('ignores excluded files when determining root existence', () => {
    const value = defineBlueprint({
      ...blueprint,
      architecture: {
        ...blueprint.architecture,
        layerFilesIgnore: ['src/shop/ignored.ts'],
        testFiles: ['**/*.spec.ts'],
      },
    });

    expect(analyze({
      files: [file('shop/ignored.ts'), file('shop/Feature.spec.ts')],
      topDirs: ['app', 'shop', 'other'],
    }, value)).toEqual([]);
  });

  it('terminates reachable cycles and does not confuse another root with the same basename', () => {
    expect(rules([
      file('shop/index.ts', 'import "./Feature";'),
      file('shop/Feature.ts', 'import "./index";'),
      file('other/index.ts'), file('other/Feature.ts'),
    ])).toEqual([{ rule: 'orphan-root-file', path: 'src/other/Feature.ts', subject: '' }]);
  });

  it('fails closed for multiple entries and does not guess orphan membership', () => {
    expect(rules([
      file('shop/index.ts'), file('shop/index.tsx'), file('shop/Feature.tsx'),
      file('app/page.tsx', 'import shop from "~app/shop";'),
    ])).toEqual([
      { rule: 'ambiguous-root-entry', path: 'src/shop', subject: '' },
      { rule: 'missing-root-entry', path: 'src/app/page.tsx', subject: '~app/shop' },
    ]);
  });

  it('traverses transitive imports and re-exports while rejecting disconnected cycles', () => {
    expect(rules([
      file('shop/index.ts', 'export * from "./Feature";'),
      file('shop/Feature.tsx', 'import "./Helper";'), file('shop/Helper.ts'),
      file('shop/A.ts', 'import "./B";'), file('shop/B.ts', 'import "./A";'),
      file('shop/domain/Foo/index.ts'),
    ])).toEqual([
      { rule: 'orphan-root-file', path: 'src/shop/A.ts', subject: '' },
      { rule: 'orphan-root-file', path: 'src/shop/B.ts', subject: '' },
    ]);
  });
});

describe('root member reachability', () => {
  it.each([
    'const value = require("./Feature");',
    'import value = require("./Feature");',
    'const target = "./Feature"; const value = require(target);',
    'const value = import("./Feature");',
    'const name = "./Feature"; const value = import(name);',
    'export { default } from "./Feature.tsx";',
  ])('connects a root member through supported import forms: %s', (source) => {
    expect(rules([file('shop/index.ts', source), file('shop/Feature.tsx')])).toEqual([]);
  });

  it.each([
    'export const broken = ;',
    'export const load = (name: string) => import(name);',
  ])('withholds orphan proofs when a reachable file has incomplete analysis: %s', (source) => {
    expect(rules([
      file('shop/index.ts', 'import "./Feature";'), file('shop/Feature.ts', source),
      file('shop/Unused.ts'),
    ])).toEqual([
      { rule: 'root-reachability-unknown', path: 'src/shop/Feature.ts', subject: 'shop' },
    ]);
  });

  it('preserves dynamic limitations in scan evidence without module metadata', () => {
    const entry = file('shop/index.ts', 'import(runtime());');

    delete entry.unknownModuleSpecifiers;

    expect(rules([entry, file('shop/Feature.ts')])).toEqual([
      { rule: 'root-reachability-unknown', path: 'src/shop/index.ts', subject: 'shop' },
    ]);
  });

  it('does not credit import-shaped text inside a string as a graph edge', () => {
    expect(rules([
      file('shop/index.ts', `const example = 'import "./Unused";';`), file('shop/Unused.ts'),
    ])).toEqual([{ rule: 'orphan-root-file', path: 'src/shop/Unused.ts', subject: '' }]);
  });

  it('does not let an unreachable parse failure hide a proven disconnected member', () => {
    expect(rules([file('shop/index.ts'), file('shop/Unused.ts', 'const broken = ;')]))
      .toEqual([{ rule: 'orphan-root-file', path: 'src/shop/Unused.ts', subject: '' }]);
  });

  it('resolves dotted private basenames and prefers an exact file target', () => {
    expect(rules([
      file('shop/index.ts', 'import "./Feature.helper"; import "./Feature.ts";'),
      file('shop/Feature.helper.ts'), file('shop/Feature.ts'), file('shop/Feature.ts.ts'),
    ])).toEqual([{ rule: 'orphan-root-file', path: 'src/shop/Feature.ts.ts', subject: '' }]);
  });

  it.each([
    ['./Feature.js', 'Feature.ts'], ['./Feature.js', 'Feature.tsx'],
    ['./Feature.jsx', 'Feature.tsx'],
  ])('recognizes TypeScript extension substitution %s to %s', (specifier, target) => {
    expect(rules([
      file('shop/index.ts', `import "${specifier}";`), file(`shop/${target}`),
    ])).toEqual([]);
  });

  it('withholds orphan proofs for ambiguous extension substitution', () => {
    expect(rules([
      file('shop/index.ts', 'import "./Feature.js";'),
      file('shop/Feature.ts'), file('shop/Feature.tsx'), file('shop/Unused.ts'),
    ])).toEqual([
      { rule: 'root-reachability-unknown', path: 'src/shop/index.ts', subject: 'shop' },
    ]);
  });

  it('exposes ambiguous private extension resolution without proving orphan files', () => {
    expect(rules([
      file('shop/index.ts', 'import "./Feature";'),
      file('shop/Feature.ts'), file('shop/Feature.tsx'), file('shop/Unused.ts'),
    ])).toEqual([
      { rule: 'root-reachability-unknown', path: 'src/shop/index.ts', subject: 'shop' },
    ]);
  });

  it('retains undeclared nested directories outside root membership', () => {
    expect(rules([file('shop/index.ts'), file('shop/private/helper.ts')])).toEqual([
      { rule: 'undeclared-folder', path: 'src/shop/private', subject: '' },
    ]);
  });
});

describe('root import boundaries', () => {
  it.each([
    'import value from "~app/shop/Feature";',
    'export * from "~app/shop/Feature";',
    'const value = require("~app/shop/Feature");',
    'const value = import("~app/shop/Feature");',
    'const target = "~app/shop/Feature"; const value = import(target);',
    'import value from "~app/shop/index";',
  ])('rejects private root paths and suggests legal canonical bare import: %s', (source) => {
    const result = findings([
      file('app/page.tsx', source),
      file('shop/index.ts', 'import "./Feature";'), file('shop/Feature.tsx'),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rule: 'deep-import', path: 'src/app/page.tsx' });
    expect(result[0].message).toContain('"~app/shop"');
  });

  it('accepts the canonical bare alias and same-root relative imports', () => {
    expect(rules([
      file('app/page.tsx', 'import "~app/shop";'),
      file('shop/index.ts', 'import "./Feature";'), file('shop/Feature.tsx'),
    ])).toEqual([]);
  });

  it('keeps alias-reachable members separate from spelling violations', () => {
    expect(rules([
      file('shop/index.ts', 'import "~app/shop/Feature";'), file('shop/Feature.ts'),
    ])).toEqual([
      { rule: 'flow-violation', path: 'src/shop/index.ts', subject: '~app/shop/Feature' },
    ]);
  });

  it('rejects same-root alias access while preserving inner-layer upward rejection', () => {
    const result = rules([
      file('shop/index.ts', 'import "./Feature";'),
      file('shop/Feature.ts', 'import "~app/shop";'),
      file('shop/domain/Foo/index.ts', 'import "~app/shop";'),
    ]);

    expect(result).toEqual([
      { rule: 'flow-violation', path: 'src/shop/Feature.ts', subject: '~app/shop' },
      { rule: 'flow-violation', path: 'src/shop/domain/Foo/index.ts', subject: '~app/shop' },
    ]);
  });

  it.each(['./shop', '~secondary/shop'])('rejects noncanonical root wiring: %s', (specifier) => {
    const value = defineBlueprint({
      ...blueprint,
      architecture: { ...blueprint.architecture, additionalAliases: { '~secondary': './src' } },
    });

    const result = analyze({
      files: [file('main.ts', `import "${specifier}";`), file('shop/index.ts')],
      topDirs: ['app', 'shop', 'other'],
    }, value);

    expect(result.map((item) => item.rule)).toEqual(['canonical-alias']);
  });

  it('reports bare missing target when a module has only inner layers', () => {
    expect(rules([
      file('app/page.tsx', 'import "~app/shop";'), file('shop/domain/Foo/index.ts'),
    ])).toEqual([
      { rule: 'missing-root-entry', path: 'src/app/page.tsx', subject: '~app/shop' },
    ]);
  });

  it.each([
    'const target = "~app/shop"; require(target);',
    'import value = require("~app/shop");',
  ])('preserves dependency verdict for AST-resolved CommonJS: %s', (source) => {
    expect(rules([file('other/index.ts', source), file('shop/index.ts')])).toEqual([
      { rule: 'flow-violation', path: 'src/other/index.ts', subject: '~app/shop' },
    ]);
  });

  it('does not suggest an illegal module dependency as the fix for a deep import', () => {
    const result = findings([
      file('other/index.ts', 'import "~app/shop/index";'), file('shop/index.ts'),
    ]);

    expect(result.map((item) => item.rule)).toEqual(['deep-import', 'flow-violation']);
    expect(result[0].message).not.toContain('bare canonical alias');
  });
});
