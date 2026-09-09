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
      { name: 'hooks', does: 'state', layout: 'folder', entry: 'public' },
      {
        name: 'services',
        does: 'network',
        owns: ['axios'],
        allowedImporters: [{ layer: 'pages', selfOnly: true }],
      },
    ],
  };
}

function moduleArchitecture(): ArchitectureDef {
  return {
    alias: '~app',
    modules: [
      { name: 'auth', does: 'authentication' },
      { name: 'checkout', does: 'checkout' },
      { name: 'shared', does: 'shared product surface' },
      { name: 'common', does: 'common product surface' },
      { name: 'app', does: 'application product surface' },
    ],
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'hooks', does: 'state', layout: 'folder', entry: 'public' },
      { name: 'services', does: 'network' },
    ],
  };
}

describe('resolveArchitecture · layer-first compatibility', () => {
  it.each([
    [undefined, 'src/pages'],
    ['src', 'src/pages'],
    ['.', 'pages'],
    ['apps/web/src', 'apps/web/src/pages'],
  ])('normalizes sourceRoot %s and layer roots', (sourceRoot, pageRoot) => {
    const definition = architecture(sourceRoot);
    const resolved = resolveArchitecture(definition);

    expect(resolved.definition).toBe(definition);
    expect(resolved.moduleFirst).toBe(false);
    expect(resolved.resolveLayerRoot('pages')).toBe(pageRoot);
    expect(resolved.resolveLayerRoot('unknown')).toBeNull();
    expect(resolved.matchLayer(`${pageRoot}/Home.tsx`)?.name).toBe('pages');
    expect(resolved.matchLayer(['pages', 'Home.tsx'])?.name).toBe('pages');
    expect(resolved.matchLayer('outside/file.ts')).toBeNull();
  });

  it('resolves layer-first unit shapes and importer metadata', () => {
    const first = resolveArchitecture(architecture());

    expect(first.layerNames).toEqual(['pages', 'hooks', 'services']);

    expect(first.layers.map((layer) => layer.unit)).toEqual([
      { layout: 'file', entry: 'index' },
      { layout: 'folder', entry: 'public' },
      { layout: 'file', entry: 'index' },
    ]);

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

describe('resolveArchitecture · module-first topology', () => {
  it('keeps the same layer vocabulary distinct inside each declared module', () => {
    const resolved = resolveArchitecture(moduleArchitecture());
    const auth = resolved.classify('src/auth/hooks/useSession.ts');
    const checkout = resolved.classify('src/checkout/hooks/useCart.ts');

    expect(resolved.moduleFirst).toBe(true);
    expect(resolved.moduleNames).toEqual(['auth', 'checkout', 'shared', 'common', 'app']);
    expect(auth.kind).toBe('unit');
    expect(auth.module?.name).toBe('auth');
    expect(auth.layer?.name).toBe('hooks');
    expect(auth.unit).toBe('useSession');
    expect(checkout.kind).toBe('unit');
    expect(checkout.module?.name).toBe('checkout');
    expect(checkout.layer?.name).toBe('hooks');
    expect(checkout.unit).toBe('useCart');
  });

  it('classifies source-root wiring, module roots, layers, units and undeclared folders', () => {
    const resolved = resolveArchitecture(moduleArchitecture());

    expect(resolved.classify('src/main.tsx').kind).toBe('source-root');
    expect(resolved.classify('src/auth').kind).toBe('module');
    expect(resolved.classify('src/auth/hooks').kind).toBe('layer');
    expect(resolved.classify('src/auth/hooks/useAuth.ts').kind).toBe('unit');
    expect(resolved.classify('src/not-declared/hooks/x.ts').kind).toBe('undeclared-module');
    expect(resolved.matchModule('src/auth/hooks/useAuth.ts')?.name).toBe('auth');
    expect(resolved.matchModule('src/not-declared/hooks/x.ts')).toBeNull();
  });

  it('treats common, shared and app as ordinary configured module names', () => {
    const resolved = resolveArchitecture(moduleArchitecture());

    for (const name of ['shared', 'common', 'app']) {
      const position = resolved.classify(`src/${name}/hooks/useThing.ts`);

      expect(position.module?.name).toBe(name);
      expect(position.layer?.name).toBe('hooks');
      expect(position.kind).toBe('unit');
    }
  });

  it('preserves root module files as container source without requiring an inner layer', () => {
    const resolved = resolveArchitecture(moduleArchitecture());
    const position = resolved.classify('src/auth/index.ts');

    expect(position.kind).toBe('container');
    expect(position.inner).toBe('container');
    expect(position.module?.name).toBe('auth');
    expect(position.layer).toBeNull();
  });

  it('uses explicit Next App Router context for nested container descendants', () => {
    const resolved = resolveArchitecture(moduleArchitecture());

    expect(resolved.classify('src/app/(shop)/cart/page.tsx').kind).toBe('module');

    const route = resolved.classify('src/app/(shop)/cart/page.tsx', {
      nextAppRouterModules: ['app'],
    });

    expect(route.kind).toBe('container');
    expect(route.inner).toBe('container');
    expect(route.module?.name).toBe('app');
    expect(route.layer).toBeNull();
  });

  it('normalizes POSIX and Windows paths through the same classification', () => {
    const resolved = resolveArchitecture(moduleArchitecture());
    const posix = resolved.classify('src/auth/hooks/useAuth.ts');
    const windows = resolved.classify('src\\auth\\hooks\\useAuth.ts');

    expect(windows.kind).toBe(posix.kind);
    expect(windows.module?.name).toBe(posix.module?.name);
    expect(windows.layer?.name).toBe(posix.layer?.name);
    expect(windows.unit).toBe(posix.unit);
  });

  it('expands layer file nets over declared modules only', () => {
    const resolved = resolveArchitecture(moduleArchitecture());

    expect(resolved.layerFiles('hooks', 'react')).toEqual([
      'src/auth/hooks/**/*.{js,jsx,ts,tsx}',
      'src/checkout/hooks/**/*.{js,jsx,ts,tsx}',
      'src/shared/hooks/**/*.{js,jsx,ts,tsx}',
      'src/common/hooks/**/*.{js,jsx,ts,tsx}',
      'src/app/hooks/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolved.moduleLayerFiles('auth', 'hooks', 'vue'))
      .toEqual(['src/auth/hooks/**/*.{js,ts,vue}']);

    expect(resolved.moduleLayerFiles('ghost', 'hooks', 'vue')).toEqual([]);
  });

  it('supports custom module/layer file nets and aliases rooted inside one module', () => {
    const definition = moduleArchitecture();

    definition.layerFiles = 'src/{module}/{layer}/**/*.ts';
    definition.additionalAliases = { '~auth': './src/auth' };
    const resolved = resolveArchitecture(definition);

    expect(resolved.layerFiles('hooks', 'auto')).toEqual([
      'src/auth/hooks/**/*.ts',
      'src/checkout/hooks/**/*.ts',
      'src/shared/hooks/**/*.ts',
      'src/common/hooks/**/*.ts',
      'src/app/hooks/**/*.ts',
    ]);

    expect(resolved.aliasSpecifiers('hooks', 'auth')).toEqual(['~app/auth/hooks', '~auth/hooks']);
  });

  it('does not require every declared layer to exist physically in every module', () => {
    const resolved = resolveArchitecture(moduleArchitecture());

    expect(resolved.resolveModuleLayerRoot('checkout', 'services')).toBe('src/checkout/services');
    expect(resolved.resolveModuleLayerRoot('checkout', 'missing')).toBeNull();
  });
});
