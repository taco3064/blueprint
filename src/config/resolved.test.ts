import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from './types';
import { resolveArchitecture } from './resolved';

function architecture(sourceRoot?: string): ArchitectureDef {
  return {
    alias: '~app',
    additionalAliases: {
      '~root': '.',
      '~hooks': sourceRoot === '.' ? 'hooks' : `${sourceRoot ?? 'src'}/hooks`,
      '~elsewhere': 'packages/shared',
    },
    ...(sourceRoot === undefined ? {} : { sourceRoot }),
    layers: [
      { name: 'pages', does: 'routes' },
      {
        name: 'hooks',
        does: 'state',
        module: { layout: 'folder', entry: 'public' },
      },
      {
        name: 'services',
        does: 'network',
        owns: ['axios'],
        allowedImporters: [{ layer: 'pages', selfOnly: true }],
      },
    ],
    module: { layout: 'flat', entry: 'index', private: ['types'] },
  };
}

describe('resolveArchitecture', () => {
  it.each([
    [undefined, 'src/pages'],
    ['src', 'src/pages'],
    ['.', 'pages'],
    ['apps/web/src', 'apps/web/src/pages'],
  ])('normalizes sourceRoot %s and layer roots', (sourceRoot, pageRoot) => {
    const definition = architecture(sourceRoot);
    const resolved = resolveArchitecture(definition);

    expect(resolved.definition).toBe(definition);
    expect(resolved.resolveLayerRoot('pages')).toBe(pageRoot);
    expect(resolved.resolveLayerRoot('unknown')).toBeNull();
    expect(resolved.matchLayer(`${pageRoot}/Home.tsx`)?.name).toBe('pages');
    expect(resolved.matchLayer(['pages', 'Home.tsx'])?.name).toBe('pages');
    expect(resolved.matchLayer('outside/file.ts')).toBeNull();
  });

  it('resolves the complete current architecture', () => {
    const definition = architecture();
    const first = resolveArchitecture(definition);

    expect(first.layerNames).toEqual(['pages', 'hooks', 'services']);

    expect(first.layers.map((layer) => layer.module)).toEqual([
      { layout: 'flat', entry: 'index' },
      { layout: 'folder', entry: 'public' },
      { layout: 'flat', entry: 'index' },
    ]);

    expect(first.folderShape).toEqual({ layout: 'flat', entry: 'index', private: ['types'] });
    expect(first.ownership.map((layer) => layer.name)).toEqual(['services']);
    expect(first.layerFiles('pages', 'react')).toEqual(['src/pages/**/*.{js,jsx,ts,tsx}']);
    expect(first.layerFiles('unknown', 'vue')).toEqual(['src/unknown/**/*.{js,ts,vue}']);
    expect(first.hasSelfOnly).toBe(true);

    expect(first.diagramEdges).toEqual([
      { from: 'pages', to: 'hooks', ordered: true },
      { from: 'pages', to: 'services', selfOnly: true, description: undefined },
    ]);
  });

  it('resolves explicit layer file nets at the same boundary', () => {
    const definition = architecture('.');

    definition.layerFiles = ['app/{ layer }/**/*.ts', 'legacy/{layer}/**/*.js'];

    expect(resolveArchitecture(definition).layerFiles('pages', 'auto')).toEqual([
      'app/pages/**/*.ts',
      'legacy/pages/**/*.js',
    ]);
  });

  it('answers flow, narrowing, selfOnly and alias queries', () => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.canImport('pages', 'hooks')).toBe(true);
    expect(resolved.canImport('hooks', 'services')).toBe(false);
    expect(resolved.canImport('pages', 'pages')).toBe(false);
    expect(resolved.canImport('unknown', 'unknown-target')).toBe(false);
    expect(resolved.forbiddenLayers('hooks')).toEqual(['pages', 'services']);
    expect(resolved.selfOnlyTargets('pages')).toEqual(['services']);
    expect(resolved.aliasSpecifiers('hooks')).toEqual(['~app/hooks', '~root/src/hooks', '~hooks']);
    expect(resolved.aliasSpecifiers('unknown')).toEqual(['~app/unknown', '~root/src/unknown']);
  });

  it('resolves primary, root, direct and relative imports from an importer context', () => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.resolveImportTarget('pages', '~app/hooks/useCart')?.name).toBe('hooks');

    expect(resolved.resolveImportTarget('src/pages/Home.tsx', '~root/src/services')?.name)
      .toBe('services');

    expect(resolved.resolveImportTarget(['pages', 'Home.tsx'], '../hooks/useCart')?.name)
      .toBe('hooks');

    expect(resolved.resolveImportTarget('pages', '~hooks/useCart')?.name).toBe('hooks');
    expect(resolved.resolveImportTarget('pages', '~app')).toBeNull();
    expect(resolved.resolveImportTarget('pages', '~root/wrong/hooks')).toBeNull();
    expect(resolved.resolveImportTarget('pages', '~app/unknown')).toBeNull();
    expect(resolved.resolveImportTarget('pages', 'react')).toBeNull();
    expect(resolved.resolveImportTarget('unknown/file.ts', '~app/hooks')).toBeNull();

    expect(resolved.resolveImportTarget(['src', 'pages', 'Home.tsx'], './Home')?.name)
      .toBe('pages');

    expect(resolved.resolveImportTarget('src/pages/Home.tsx', '../hooks/useCart')?.name)
      .toBe('hooks');

    expect(resolved.resolveImportTarget(['pages', 'Home.tsx'], '././Home')?.name).toBe('pages');
    expect(resolved.resolveImportTarget(['pages', 'Home.tsx'], '../unknown/file')).toBeNull();
    expect(resolved.resolveImportTarget(['pages', 'Home.tsx'], '../../../outside')).toBeNull();
  });
});
