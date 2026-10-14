import { describe, expect, it } from 'vitest';
import { defineBlueprint } from '../config';
import { analyze } from './analyze';
import { extractImportAnalysis } from './scan';
import { analyzeModuleImports } from '../plugin';
import type { ScannedFile } from './types';

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [{ name: 'shop', does: 'commerce' }, { name: 'auth', does: 'identity' }],
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
  return analyze({ files, topDirs: ['shop', 'auth'] }, blueprint);
}

describe('root-only AST reference supplementation', () => {
  it('supplements known root loaders alongside unrelated pre-existing references', () => {
    expect(findings([
      file('auth/index.ts', 'import "external"; const target = "~app/shop"; require(target);'),
      file('shop/index.ts'),
    ])).toEqual([expect.objectContaining({
      rule: 'flow-violation', path: 'src/auth/index.ts', subject: '~app/shop',
      message: expect.stringContaining('module reachability forbids "auth" → "shop"'),
    })]);
  });

  it('keeps duplicate reference evidence as one finding', () => {
    const importer = file('auth/index.ts', 'import "~app/shop";');
    const original = findings([importer, file('shop/index.ts')]);

    importer.moduleSpecifiers!.push('~app/shop', '~app/shop');

    expect(original).toEqual([expect.objectContaining({
      rule: 'flow-violation', path: 'src/auth/index.ts', subject: '~app/shop',
    })]);

    expect(findings([importer, file('shop/index.ts')])).toEqual(original);
  });

  it('does not broaden supplemental root analysis to an inner-layer loader', () => {
    expect(findings([
      file('auth/index.ts', 'const target = "~app/shop/domain/value"; require(target);'),
      file('shop/domain/value/index.ts'),
    ])).toEqual([]);
  });

  it('retains static violations without AST metadata', () => {
    const importer = file('auth/index.ts', 'import "~app/shop";');

    delete importer.moduleSpecifiers;

    expect(findings([importer, file('shop/index.ts')])).toEqual([expect.objectContaining({
      rule: 'flow-violation', subject: '~app/shop',
    })]);
  });
});
