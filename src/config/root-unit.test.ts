import { describe, expect, it } from 'vitest';

import { resolveArchitecture } from './resolved';
import { resolveRootUnitImport } from './root-unit';
import type { ArchitectureDef, Framework } from './types';

function architecture(sourceRoot = 'src'): ArchitectureDef {
  return {
    sourceRoot,
    alias: '~app',
    additionalAliases: { '~root': '.', '~shop': `${sourceRoot}/shop` },
    modules: [
      { name: 'shop', does: 'shopping', dependsOn: ['shared'] },
      { name: 'shared', does: 'shared behavior' },
      { name: 'app', does: 'routing' },
    ],
    layers: [{ name: 'components', does: 'UI', layout: 'folder', entry: 'public' }],
  };
}

describe('ordinary module root-unit contract', () => {
  it('exposes ordinary descriptors without app and retains container classification', () => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.rootUnits.map(({ root, entry, module }) => [root, entry, module.name]))
      .toEqual([['src/shop', 'index', 'shop'], ['src/shared', 'index', 'shared']]);

    expect(resolved.rootUnits[0].module).toBe(resolved.modules[0]);

    expect(resolved.classify('src/shop/FeaturePage.helper.ts')).toEqual({
      kind: 'container', module: resolved.modules[0],
    });

    expect(resolved.classify('src/shop/components/Button/public.ts')).toMatchObject({
      kind: 'unit', unit: 'Button', layer: { name: 'components' },
    });
  });

  it('has no root-unit descriptors in layer-first or module runway', () => {
    const definition = architecture();

    delete definition.modules;
    expect(resolveArchitecture(definition).rootUnits).toEqual([]);
    expect(resolveArchitecture({ ...definition, modules: [] }).rootUnits).toEqual([]);

    expect(resolveArchitecture({
      ...definition, modules: [{ name: 'app', does: 'routing' }],
    }).rootUnits).toEqual([]);
  });

  it.each(['js', 'jsx', 'ts', 'tsx', 'vue'])('governs direct %s source in Vue and auto', (ext) => {
    const unit = resolveArchitecture(architecture()).rootUnits[0];

    for (const framework of ['vue', 'auto'] as const) {
      expect(unit.contains(`src/shop/FeaturePage.helper.${ext}`, framework)).toBe(true);

      expect(unit.resolve([`src/shop/index.${ext}`], framework)).toEqual({
        members: [`src/shop/index.${ext}`], entries: [`src/shop/index.${ext}`],
        entry: `src/shop/index.${ext}`,
      });
    }
  });

  it.each(['js', 'jsx', 'ts', 'tsx'])('governs direct %s source in React', (ext) => {
    expect(resolveArchitecture(architecture()).rootUnits[0]
      .contains(`src/shop/member.${ext}`, 'react')).toBe(true);
  });

  it.each([
    'src/shopping/index.ts', 'src/shared/index.ts', 'shop/index.ts',
    'src/shop/components/Button.tsx', 'src/shop/unknown/child.ts',
    'src/shop/file.ts/child.ts', 'src/shop/', 'src/shop',
    'src/shop/style.css', 'src/shop/a.mjs', 'src/shop/a.cjs',
  ])('excludes %s from root membership', (file) => {
    expect(resolveArchitecture(architecture()).rootUnits[0].contains(file, 'auto')).toBe(false);
  });

  it('does not govern Vue source under React', () => {
    const unit = resolveArchitecture(architecture()).rootUnits[0];

    expect(unit.contains('src/shop/index.vue', 'react')).toBe(false);
    expect(unit.resolve(['src/shop/index.vue'], 'react')).toBeNull();
  });

  it.each([
    ['react', 'js,jsx,ts,tsx'], ['vue', 'js,jsx,ts,tsx,vue'], ['auto', 'js,jsx,ts,tsx,vue'],
  ] as [Framework, string][])('emits one immediate source glob for %s', (framework, exts) => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.rootUnits[0].files(framework)).toEqual([`src/shop/*.{${exts}}`]);
    expect(resolved.sourceRootFiles(framework)).toEqual([`src/*.{${exts}}`]);
  });

  it.each(['.', 'apps/web/src'])('supports sourceRoot %s', (sourceRoot) => {
    const resolved = resolveArchitecture(architecture(sourceRoot));
    const prefix = sourceRoot === '.' ? '' : `${sourceRoot}/`;

    expect(resolved.rootUnits[0].root).toBe(`${prefix}shop`);
    expect(resolved.rootUnits[0].contains(`${prefix}shop/index.ts`, 'react')).toBe(true);
    expect(resolved.sourceRootFiles('react')).toEqual([`${prefix}*.{js,jsx,ts,tsx}`]);
  });

  it('distinguishes rootless, missing, unique, and ambiguous entries', () => {
    const unit = resolveArchitecture(architecture()).rootUnits[0];

    expect(unit.resolve([], 'react')).toBeNull();
    expect(unit.resolve(['src/shop/components/Button.tsx'], 'react')).toBeNull();
    const members = ['src/shop/FeaturePage.helper.ts', 'src/shop/index.helper.ts'];

    expect(unit.resolve(members, 'react')).toEqual({ members, entries: [], entry: null });

    expect(unit.resolve([...members, 'src/shop/index.tsx'], 'react')).toEqual({
      members: [...members, 'src/shop/index.tsx'], entries: ['src/shop/index.tsx'],
      entry: 'src/shop/index.tsx',
    });

    expect(unit.resolve(['src/shop/index.tsx', 'src/shop/index.ts'], 'react')).toEqual({
      members: ['src/shop/index.tsx', 'src/shop/index.ts'],
      entries: ['src/shop/index.tsx', 'src/shop/index.ts'], entry: null,
    });
  });
});

describe('root-unit import boundary metadata', () => {
  it.each([
    ['src/main.ts', '~app/shop', false, true],
    ['src/main.ts', '~app/shop/index', false, false],
    ['src/main.ts', '~app/shop/Page', false, false],
    ['src/shop/index.ts', './Page', true, false],
    ['src/shop/index.ts', './FeaturePage.helper.ts', true, false],
    ['src/main.ts', '~app/shop/FeaturePage.helper', false, false],
    ['src/shop/index.ts', './FeaturePage.helper', true, false],
    ['src/shop/index.ts', './helper.js', true, false],
    ['src/shop/index.ts', '~app/shop/Page', true, false],
    ['src/shop/file.ts/nested.ts', '~app/shop/Page', false, false],
    ['src/shop/index.ts', '~app/shop', true, true],
    ['src/shop/components/Button.tsx', '~app/shop', false, true],
    ['src/shared/index.ts', '~app/shop/Page', false, false],
    ['src/main.ts', '~shop/index', false, false],
    ['src/main.ts', '~root/src/shop', false, true],
    ['src/main.ts', './shop', false, true],
  ])('%s -> %s identifies one root boundary', (...args) => {
    const [importer, specifier, sameUnit, bare] = args;
    const resolved = resolveArchitecture(architecture());
    const reference = resolved.resolveImport(importer, specifier);

    expect(reference.rootUnit).toEqual({ target: resolved.rootUnits[0], sameUnit, bare });
    expect(reference.target).toMatchObject({ module: { name: 'shop' } });

    if (importer === 'src/main.ts') {
      expect(reference.dependency).toBeNull();
    } else {
      expect(reference.dependency).not.toBeNull();
    }
  });

  it.each([
    '~app/app', '~app/app/Page', '~app/shop/components', '~app/shop/components/Button',
    '~app/shop/file.ts/child', '~app/missing',
    '~app', '~root', 'react', '../../external',
  ])('does not manufacture an ordinary root for %s', (specifier) => {
    expect(resolveArchitecture(architecture()).resolveImport('src/shop/index.ts', specifier)
      .rootUnit).toBeNull();
  });

  it('resolves source-relative array importers and dotted root paths', () => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.resolveImport(['shop', 'index.ts'], './Page').rootUnit)
      .toEqual({ target: resolved.rootUnits[0], sameUnit: true, bare: false });
  });

  it('retains upward and cross-module prohibitions for extensionless private imports', () => {
    const resolved = resolveArchitecture(architecture());

    expect(resolved.resolveImport('src/shop/components/Button.tsx', '~app/shop/Page').dependency)
      .toMatchObject({ allowed: false });

    expect(resolved.resolveImport('src/shared/index.ts', '~app/shop/Page').dependency)
      .toMatchObject({ allowed: false });

    expect(resolved.resolveImport('src/shop/index.ts', '~app/shared/Page').dependency)
      .toMatchObject({ allowed: true });
  });
});

describe('root-unit boundary nullable inputs', () => {
  const resolved = resolveArchitecture(architecture());

  const scope = {
    units: resolved.rootUnits,
    layers: ['components'],
    importerSegments: ['shop', 'index.ts'],
  };

  it('has no source target for null or empty targets', () => {
    expect(resolveRootUnitImport(scope, null, null)).toBeNull();
    expect(resolveRootUnitImport(scope, null, [])).toBeNull();
  });

  it('does not treat missing importer context as a same-unit import', () => {
    expect(resolveRootUnitImport(scope, null, ['shop'])).toEqual({
      target: resolved.rootUnits[0], bare: true, sameUnit: false,
    });
  });

  it('does not treat a module position as a root member', () => {
    const importer = { kind: 'module' as const, module: resolved.modules[0] };

    expect(resolveRootUnitImport(scope, importer, ['shop', 'Page'])).toEqual({
      target: resolved.rootUnits[0], bare: false, sameUnit: false,
    });
  });

  it('does not treat an inner layer position as a root member', () => {
    const importer = resolved.classify(['shop', 'components']);

    expect(resolveRootUnitImport(scope, importer, ['shop', 'Page'])).toEqual({
      target: resolved.rootUnits[0], bare: false, sameUnit: false,
    });
  });

  it('keeps dotted direct files private beside the exact index entry', () => {
    const members = ['src/shop/index.helper.ts', 'src/shop/index.d.ts', 'src/shop/index.tsx'];

    expect(resolved.rootUnits[0].resolve(members, 'react')).toEqual({
      members, entries: ['src/shop/index.tsx'], entry: 'src/shop/index.tsx',
    });
  });
});
