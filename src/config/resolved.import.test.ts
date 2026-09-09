import { describe, expect, it } from 'vitest';

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
});
