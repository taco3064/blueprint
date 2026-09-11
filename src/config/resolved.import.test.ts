import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { resolveImportReference } from './import-reference';
import type { ArchitectureDef } from './types';
import { resolveArchitecture } from './resolved';

function architecture(): ArchitectureDef {
  return {
    alias: '~app',
    sourceRoot: 'src',
    additionalAliases: {
      '~root': '.',
      '~source': 'src',
      '~billing': 'src/billing',
      '~billingHooks': 'src/billing/hooks',
      '~useBill': 'src/billing/hooks/useBill',
      '~outside': 'packages/shared',
    },
    modules: [
      { name: 'account', does: 'accounts', dependsOn: ['billing'] },
      { name: 'billing', does: 'billing' },
    ],
    layers: [
      { name: 'components', does: 'UI', layout: 'folder' },
      { name: 'hooks', does: 'state', layout: 'folder' },
      { name: 'services', does: 'I/O' },
    ],
  };
}

// eslint-disable-next-line max-lines-per-function
describe('resolveArchitecture · import contract', () => {
  it.each([
    ['~root/src/billing/hooks/useBill', '~app/billing/hooks/useBill', '~root'],
    ['~source/billing/hooks/useBill', '~app/billing/hooks/useBill', '~source'],
    ['~billing/hooks/useBill', '~app/billing/hooks/useBill', '~billing'],
    ['~billingHooks/useBill', '~app/billing/hooks/useBill', '~billingHooks'],
    ['~useBill', '~app/billing/hooks/useBill', '~useBill'],
  ])('resolves %s for diagnosis and supplies its canonical spelling', (
    specifier,
    canonicalSpecifier,
    alias,
  ) => {
    const reference = resolveArchitecture(architecture()).resolveImport(
      'src/account/components/Profile/index.tsx',
      specifier,
    );

    expect(reference).toMatchObject({
      alias,
      canonicalSpecifier,
      kind: 'additional-alias',
      crossesBoundary: true,
      dependency: { allowed: true, module: true, inner: true },
    });

    expect(reference.target).toMatchObject({ kind: 'unit', unit: 'useBill' });
  });

  it('keeps target resolution separate from alias permission and dependency permission', () => {
    const resolved = resolveArchitecture(architecture());

    const canonical = resolved.resolveImport(
      'src/account/hooks/useAccount.ts',
      '~app/billing/components/Price/index.tsx',
    );

    const reverseModule = resolved.resolveImport(
      'src/billing/components/Price/index.tsx',
      '~app/account/hooks/useAccount',
    );

    expect(canonical).toMatchObject({
      kind: 'canonical-alias',
      crossesBoundary: true,
      dependency: { allowed: false, module: true, inner: false },
    });

    expect(reverseModule).toMatchObject({
      kind: 'canonical-alias',
      crossesBoundary: true,
      dependency: { allowed: false, module: false, inner: true },
    });
  });

  it('distinguishes same-position, relative, external, and unresolved aliases', () => {
    const resolved = resolveArchitecture(architecture());
    const importer = 'src/account/hooks/useAccount.ts';

    expect(resolved.resolveImport(importer, '~billingHooks/useBill'))
      .toMatchObject({ kind: 'additional-alias', crossesBoundary: true });

    expect(resolved.resolveImport(importer, '~app/account/hooks/useOther'))
      .toMatchObject({ kind: 'canonical-alias', crossesBoundary: false });

    expect(resolved.resolveImport(importer, './useOther'))
      .toMatchObject({ kind: 'relative', crossesBoundary: false });

    expect(resolved.resolveImport(importer, 'react'))
      .toMatchObject({ kind: 'external', target: null, dependency: null });

    expect(resolved.resolveImport(importer, '~outside/value'))
      .toMatchObject({ kind: 'external', target: null, dependency: null });

    expect(resolved.resolveImport('src/index.ts', '~app/billing/hooks/useBill'))
      .toMatchObject({ crossesBoundary: true, dependency: null });
  });

  it('uses the most specific configured alias when aliases overlap', () => {
    const definition = architecture();

    definition.additionalAliases = {
      '~scope': 'src',
      '~scope/billing': 'src/billing',
    };

    expect(resolveArchitecture(definition).resolveImport(
      'src/account/components/Profile/index.tsx',
      '~scope/billing/hooks/useBill',
    )).toMatchObject({
      alias: '~scope/billing',
      targetSegments: ['billing', 'hooks', 'useBill'],
      canonicalSpecifier: '~app/billing/hooks/useBill',
    });
  });

  it('keeps the canonical alias authoritative for its descendants', () => {
    const definition = architecture();

    definition.additionalAliases = { '~app/billing': 'src/billing' };

    expect(resolveArchitecture(definition).resolveImport(
      'src/account/components/Profile/index.tsx',
      '~app/billing/hooks/useBill',
    )).toMatchObject({
      alias: '~app',
      kind: 'canonical-alias',
      targetSegments: ['billing', 'hooks', 'useBill'],
      canonicalSpecifier: '~app/billing/hooks/useBill',
    });
  });

  it('keeps source-root wiring outside the dependency verdict', () => {
    const reference = resolveArchitecture(architecture()).resolveImport(
      'src/index.ts',
      '~billing/hooks/useBill',
    );

    expect(reference).toMatchObject({ crossesBoundary: true, dependency: null });
  });

  it('rejects an alias target that does not reach the configured source offset', () => {
    const reference = resolveArchitecture(architecture()).resolveImport(
      'src/account/hooks/useAccount.ts',
      '~root/package.json',
    );

    expect(reference).toMatchObject({
      alias: '~root',
      target: null,
      targetSegments: null,
      canonicalSpecifier: null,
    });
  });

  it('selects the canonical alias by identity rather than alias-array order', () => {
    const definition = architecture();
    const resolved = resolveArchitecture(definition);
    const canonical = resolved.aliases.find((root) => root.alias === definition.alias)!;
    const overlapping = { alias: '~app/billing', prefix: [], prepend: ['billing'] };

    const reference = resolveImportReference(
      'src/account/hooks/useAccount.ts',
      '~app/billing/hooks/useBill',
      {
        definition,
        sourceSegments: ['src'],
        aliases: [overlapping, canonical],
        classify: resolved.classify,
        canImport: resolved.canImport,
        canImportModule: resolved.canImportModule,
      },
    );

    expect(reference).toMatchObject({ alias: '~app', kind: 'canonical-alias' });
  });

  it('preserves import semantics when path separators contain inert segments', () => {
    const resolved = resolveArchitecture(architecture());

    const clean = resolved.resolveImport(
      'src/account/hooks/useAccount.ts',
      './useOther',
    );

    fc.assert(fc.property(
      fc.integer({ min: 2, max: 5 }),
      fc.constantFrom('/', '\\'),
      (separatorCount, separator) => {
        const repeated = separator.repeat(separatorCount);

        const importer = `src${repeated}account${separator}.${separator}hooks`
          + `${separator}useAccount.ts`;

        const specifier = `.//./useOther`;
        const noisy = resolved.resolveImport(importer, specifier);

        expect(noisy.target).toEqual(clean.target);
        expect(noisy.crossesBoundary).toBe(clean.crossesBoundary);
        expect(noisy.dependency).toEqual(clean.dependency);
      },
    ), { numRuns: 20 });
  });
});
