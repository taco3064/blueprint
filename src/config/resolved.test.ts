import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from './types';
import { resolveArchitecture } from './resolved';
import type { ResolvedSourcePosition } from './resolved';

function layerFirst(sourceRoot?: string): ArchitectureDef {
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

function moduleFirst(): ArchitectureDef {
  return {
    alias: '~app',
    sourceRoot: 'src',
    modules: [
      { name: 'auth', does: 'authentication' },
      { name: 'checkout', does: 'checkout' },
      { name: 'shared', does: 'shared code' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
      { name: 'hooks', does: 'state' },
      { name: 'services', does: 'I/O' },
    ],
  };
}

function identity(position: ResolvedSourcePosition | null): object | null {
  if (!position) {
    return null;
  }

  return {
    kind: position.kind,
    ...('module' in position ? { module: position.module?.name ?? null } : {}),
    ...('layer' in position ? { layer: position.layer.name } : {}),
    ...('unit' in position ? { unit: position.unit } : {}),
  };
}

describe('resolveArchitecture · layer-first compatibility', () => {
  it.each([
    [undefined, 'src/pages'],
    ['src', 'src/pages'],
    ['.', 'pages'],
    ['apps/web/src', 'apps/web/src/pages'],
  ])('normalizes sourceRoot %s and layer roots', (sourceRoot, pageRoot) => {
    const definition = layerFirst(sourceRoot);
    const resolved = resolveArchitecture(definition);

    expect(resolved.definition).toBe(definition);
    expect(resolved.topology).toBe('layer-first');
    expect(resolved.resolveLayerRoot('pages')).toBe(pageRoot);
    expect(resolved.resolveLayerRoot('unknown')).toBeNull();
    expect(resolved.matchLayer(`${pageRoot}/Home.tsx`)?.name).toBe('pages');
    expect(resolved.matchLayer(['pages', 'Home.tsx'])?.name).toBe('pages');
    expect(resolved.matchLayer('outside/file.ts')).toBeNull();
  });

  it('preserves flow, unit shapes, aliases, and file nets', () => {
    const resolved = resolveArchitecture(layerFirst());

    expect(resolved.layers.map((layer) => layer.unit)).toEqual([
      { layout: 'file', entry: 'index' },
      { layout: 'folder', entry: 'public' },
      { layout: 'file', entry: 'index' },
    ]);

    expect(resolved.layerFiles('pages', 'react')).toEqual(['src/pages/**/*.{js,jsx,ts,tsx}']);
    expect(resolved.canImport('pages', 'hooks')).toBe(true);
    expect(resolved.canImport('pages', 'pages')).toBe(false);
    expect(resolved.canImport('pages', 'unknown')).toBe(false);
    expect(resolved.canImport('hooks', 'services')).toBe(false);
    expect(resolved.forbiddenLayers('hooks')).toEqual(['pages', 'services']);
    expect(resolved.selfOnlyTargets('pages')).toEqual(['services']);
    expect(resolved.aliasSpecifiers('hooks')).toEqual(['~app/hooks', '~root/src/hooks', '~hooks']);
    expect(resolved.resolveLayerRoots('pages')).toEqual(['src/pages']);
  });

  it('resolves aliases and relative imports through the same classifier', () => {
    const resolved = resolveArchitecture(layerFirst());

    expect(identity(resolved.resolveImportTarget('src/pages/Home.tsx', '~root/src/services')))
      .toEqual({ kind: 'layer', module: null, layer: 'services' });

    expect(identity(resolved.resolveImportTarget(['pages', 'Home.tsx'], '../hooks/useCart')))
      .toEqual({ kind: 'unit', module: null, layer: 'hooks', unit: 'useCart' });

    expect(resolved.resolveImportTarget('pages', '~app')).toBeNull();
    expect(resolved.resolveImportTarget('pages', 'react')).toBeNull();
    expect(resolved.resolveImportTarget('outside/file.ts', '~app/services')).toBeNull();
  });
});

describe('resolveArchitecture · module-first identity', () => {
  it('reserves app as a recursive container without shared layer positions', () => {
    const architecture = moduleFirst();

    architecture.modules = [
      { name: 'app', does: 'router composition', dependsOn: ['auth'] },
      { name: 'auth', does: 'authentication' },
    ];

    const resolved = resolveArchitecture(architecture);

    for (const path of ['src/app/index.tsx', 'src/app/routes.tsx', 'src/app/dashboard/page.tsx']) {
      expect(identity(resolved.classify(path)))
        .toEqual({ kind: 'container', module: 'app' });
    }

    expect(resolved.layerPositions.map((position) => position.root)).not.toContain('src/app/hooks');
    expect(resolved.resolveLayerRoots('hooks')).toEqual(['src/auth/hooks']);
    expect(resolved.resolveLayerRoot('hooks', 'app')).toBeNull();
    expect(resolved.layerFiles('hooks', 'react', 'app')).toEqual([]);

    expect(resolved.containerFiles('react')).toEqual([
      'src/app/**/*.{js,jsx,ts,tsx}',
      'src/auth/*.{js,jsx,ts,tsx}',
    ]);
  });

  it('does not require app and keeps layer-first app semantics unchanged', () => {
    expect(resolveArchitecture(moduleFirst()).modules.map((module) => module.name))
      .not.toContain('app');

    const architecture = layerFirst();

    architecture.layers[0] = { name: 'app', does: 'application' };

    expect(identity(resolveArchitecture(architecture).classify('src/app/dashboard/page.tsx')))
      .toEqual({ kind: 'unit', module: null, layer: 'app', unit: 'dashboard' });
  });

  it('classifies module, container, repeated layer, and unit positions', () => {
    const resolved = resolveArchitecture(moduleFirst());

    expect(resolved.topology).toBe('module-first');
    expect(resolved.modules.map((module) => module.name)).toEqual(['auth', 'checkout', 'shared']);
    expect(identity(resolved.classify('src/auth'))).toEqual({ kind: 'module', module: 'auth' });

    expect(identity(resolved.classify('src/auth/index.tsx')))
      .toEqual({ kind: 'container', module: 'auth' });

    expect(identity(resolved.classify('src/auth/hooks/x.ts')))
      .toEqual({ kind: 'unit', module: 'auth', layer: 'hooks', unit: 'x' });

    expect(identity(resolved.classify('src/checkout/hooks/x.ts')))
      .toEqual({ kind: 'unit', module: 'checkout', layer: 'hooks', unit: 'x' });

    expect(identity(resolved.classify('src/auth/components/LoginForm/index.tsx')))
      .toEqual({ kind: 'unit', module: 'auth', layer: 'components', unit: 'LoginForm' });
  });

  it('keeps wiring and undeclared module-level folders outside governed positions', () => {
    const resolved = resolveArchitecture(moduleFirst());

    expect(identity(resolved.classify('src/index.ts'))).toEqual({ kind: 'source-root' });
    expect(resolved.classify('src/unknown/hooks/x.ts')).toBeNull();
    expect(resolved.classify('src/auth/unknown/x.ts')).toBeNull();
  });

  it('expands shared layers across modules without requiring every folder to exist', () => {
    const resolved = resolveArchitecture(moduleFirst());

    expect(resolved.resolveLayerRoots('hooks')).toEqual([
      'src/auth/hooks',
      'src/checkout/hooks',
      'src/shared/hooks',
    ]);

    expect(resolved.resolveLayerRoots('missing')).toEqual([]);

    expect(resolved.layerFiles('hooks', 'react')).toEqual([
      'src/auth/hooks/**/*.{js,jsx,ts,tsx}',
      'src/checkout/hooks/**/*.{js,jsx,ts,tsx}',
      'src/shared/hooks/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolved.containerFiles('react')).toEqual([
      'src/auth/*.{js,jsx,ts,tsx}',
      'src/checkout/*.{js,jsx,ts,tsx}',
      'src/shared/*.{js,jsx,ts,tsx}',
    ]);

    expect(resolved.resolveLayerRoot('hooks')).toBeNull();
    expect(resolved.resolveLayerRoot('hooks', 'auth')).toBe('src/auth/hooks');
  });

  it('resolves aliases and relative targets without collapsing repeated layers', () => {
    const architecture = moduleFirst();

    architecture.additionalAliases = {
      '~auth': 'src/auth',
      '~outside': 'packages/shared',
    };

    const resolved = resolveArchitecture(architecture);

    expect(resolved.aliasSpecifiers('hooks', 'auth')).toEqual([
      '~app/auth/hooks',
      '~auth/hooks',
    ]);

    expect(resolved.aliasSpecifiers('hooks', 'shop')).toEqual(['~app/shop/hooks']);

    expect(identity(resolved.resolveImportTarget(
      'src/auth/components/Login/index.tsx',
      '~app/checkout/hooks/useCart',
    ))).toEqual({ kind: 'unit', module: 'checkout', layer: 'hooks', unit: 'useCart' });

    expect(identity(resolved.resolveImportTarget(
      'src/auth/components/Login/index.tsx',
      '../../hooks/useAuth',
    ))).toEqual({ kind: 'unit', module: 'auth', layer: 'hooks', unit: 'useAuth' });
  });
});

describe('resolveArchitecture · module dependency graph', () => {
  it('resolves direct edges and transitive module reachability without using array order', () => {
    const architecture = moduleFirst();

    architecture.modules = [
      { name: 'history', does: 'history', dependsOn: ['order'] },
      { name: 'auth', does: 'authentication' },
      { name: 'order', does: 'orders', dependsOn: ['checkout'] },
      { name: 'checkout', does: 'checkout', dependsOn: ['auth'] },
    ];

    const resolved = resolveArchitecture(architecture);
    const history = resolved.modules.find((module) => module.name === 'history');

    expect(history?.dependsOn).toEqual(['order']);
    expect(history?.reachable).toEqual(['order', 'checkout', 'auth']);
    expect(resolved.canImportModule('history', 'auth')).toBe(true);
    expect(resolved.canImportModule('auth', 'checkout')).toBe(false);
  });

  it('resolves converging paths once and supports a project-root source', () => {
    const architecture = moduleFirst();

    architecture.sourceRoot = '.';

    architecture.modules = [
      { name: 'leaf', does: 'leaf' },
      { name: 'left', does: 'left', dependsOn: ['leaf'] },
      { name: 'right', does: 'right', dependsOn: ['leaf'] },
      { name: 'root', does: 'root', dependsOn: ['left', 'right'] },
    ];

    const resolved = resolveArchitecture(architecture);

    expect(resolved.modules.find((module) => module.name === 'root')?.reachable)
      .toEqual(['left', 'leaf', 'right']);

    expect(resolved.modules[0].root).toBe('leaf');
  });

  it('composes module reachability with container and layer positions', () => {
    const architecture = moduleFirst();

    architecture.modules = [
      { name: 'auth', does: 'authentication' },
      { name: 'checkout', does: 'checkout', dependsOn: ['auth'] },
      { name: 'profile', does: 'profile' },
    ];

    architecture.layers[2].allowedImporters = ['hooks'];
    const resolved = resolveArchitecture(architecture);

    const verdict = (from: string, to: string) => resolved.dependencyVerdict(
      resolved.classify(from)!,
      resolved.classify(to)!,
    );

    expect(verdict('src/checkout/hooks/useCart.ts', 'src/auth/services/api.ts'))
      .toMatchObject({ allowed: true, module: true, inner: true });

    expect(verdict('src/auth/hooks/useAuth.ts', 'src/checkout/services/api.ts'))
      .toMatchObject({ allowed: false, module: false, inner: true });

    expect(verdict('src/checkout/components/Cart.tsx', 'src/auth/services/api.ts'))
      .toMatchObject({ allowed: false, module: true, inner: false });

    expect(verdict('src/checkout/components/Cart.tsx', 'src/auth/components/Login.tsx'))
      .toMatchObject({ allowed: true, module: true, inner: true });

    expect(verdict('src/checkout/index.tsx', 'src/auth/index.tsx'))
      .toMatchObject({ allowed: true, module: true, inner: true });

    expect(verdict('src/checkout/hooks/useCart.ts', 'src/auth/index.tsx'))
      .toMatchObject({ allowed: false, module: true, inner: false });
  });

  it('leaves source-root wiring outside the verdict and supports resolved layer identities', () => {
    const resolved = resolveArchitecture(moduleFirst());
    const sourceRoot = resolved.classify('src/index.ts')!;
    const moduleLayer = resolved.classify('src/auth/hooks/useAuth.ts')!;
    const layerFirstPosition = resolveArchitecture(layerFirst()).classify('src/hooks/useX.ts')!;

    expect(resolved.dependencyVerdict(sourceRoot, moduleLayer)).toBeNull();
    expect(resolved.dependencyVerdict(moduleLayer, sourceRoot)).toBeNull();

    expect(resolved.dependencyVerdict(moduleLayer, layerFirstPosition))
      .toMatchObject({ module: true });
  });
});

describe('resolveArchitecture · module-first path contexts', () => {
  it.each([
    'src/auth/hooks/x.ts',
    'src\\auth\\hooks\\x.ts',
  ])('classifies POSIX and Windows separators: %s', (file) => {
    expect(identity(resolveArchitecture(moduleFirst()).classify(file)))
      .toEqual({ kind: 'unit', module: 'auth', layer: 'hooks', unit: 'x' });
  });

  it('does not mistake a source-relative array module name for the source root', () => {
    const architecture = moduleFirst();

    architecture.modules![0] = { name: 'src', does: 'source application' };
    const resolved = resolveArchitecture(architecture);
    const expected = { kind: 'unit', module: 'src', layer: 'hooks', unit: 'x' };

    expect(identity(resolved.classify('src/src/hooks/x.ts'))).toEqual(expected);
    expect(identity(resolved.classify(['src', 'hooks', 'x.ts']))).toEqual(expected);
  });

  it('reserves app independently of explicit Next App Router context', () => {
    const architecture = moduleFirst();

    architecture.modules![0] = { name: 'app', does: 'routes' };
    const ordinary = resolveArchitecture(architecture);
    const next = resolveArchitecture(architecture, { nextAppRouter: { module: 'app' } });

    expect(identity(ordinary.classify('src/app/dashboard/page.tsx')))
      .toEqual({ kind: 'container', module: 'app' });

    expect(identity(next.classify('src/app/page.tsx')))
      .toEqual({ kind: 'container', module: 'app' });

    expect(identity(next.classify('src/app/dashboard/page.tsx')))
      .toEqual({ kind: 'container', module: 'app' });

    expect(identity(next.classify('src/app/settings/page.tsx')))
      .toEqual({ kind: 'container', module: 'app' });
  });

  it('resolves custom module-first file nets across both placeholders', () => {
    const architecture = moduleFirst();

    architecture.layerFiles = 'src/{ module }/{layer}/**/*.ts';

    expect(resolveArchitecture(architecture).layerFiles('hooks', 'auto')).toEqual([
      'src/auth/hooks/**/*.ts',
      'src/checkout/hooks/**/*.ts',
      'src/shared/hooks/**/*.ts',
    ]);
  });

  it('keeps an unresolved module placeholder visible to unchecked resolver callers', () => {
    const architecture = layerFirst();

    architecture.layerFiles = 'src/{module}/{layer}/**/*.ts';

    expect(resolveArchitecture(architecture).layerFiles('hooks', 'auto'))
      .toEqual(['src/{module}/hooks/**/*.ts']);
  });
});
