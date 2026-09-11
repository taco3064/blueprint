import { describe, expect, it } from 'vitest';

import { resolveArchitecture } from '../../config';
import {
  aliasSubtreeSpecifier,
  buildContainerPatterns,
  buildModuleContainerPaths,
  buildModuleContainerPatterns,
  buildModuleContainerRestrictions,
  buildStructuralPatterns,
  moduleImportScope,
} from './structural';

describe('structural alias boundaries', () => {
  it('resolves string, root, matching subtree, and unrelated aliases', () => {
    expect(aliasSubtreeSpecifier('~app', 'hooks')).toBe('~app/hooks');

    expect(aliasSubtreeSpecifier({ alias: '~src', prefix: ['src'] }, 'hooks'))
      .toBe('~src/src/hooks');

    expect(aliasSubtreeSpecifier({
      alias: '~auth', prefix: [], prepend: ['auth'],
    }, 'auth')).toBe('~auth');

    expect(aliasSubtreeSpecifier({
      alias: '~auth-unit', prefix: [], prepend: ['auth', 'components'],
    }, 'auth')).toBe('~auth-unit');

    expect(aliasSubtreeSpecifier({
      alias: '~billing', prefix: [], prepend: ['billing'],
    }, 'auth')).toBeNull();
  });

  it('emits each folder-entry depth and ignores an unrelated subtree alias', () => {
    const patterns = buildContainerPatterns({
      module: 'auth',
      aliases: [
        { alias: '~short', prefix: [], prepend: ['auth'] },
        { alias: '~unit', prefix: [], prepend: ['auth', 'components'] },
        { alias: '~child', prefix: [], prepend: ['auth', 'components', 'Button'] },
        {
          alias: '~deep',
          prefix: [],
          prepend: ['auth', 'components', 'Button', 'internal'],
        },
        { alias: '~other', prefix: [], prepend: ['billing'] },
      ],
      folderTargets: ['components'],
    });

    expect(patterns).toEqual([
      expect.objectContaining({ group: ['./../**', '././**'] }),
      expect.objectContaining({
        group: [
          '~short/components/*/**',
          '~unit/*/**',
          '~child/*',
          '~deep',
          '~deep/**',
        ],
      }),
    ]);
  });

  it('normalizes empty segments before comparing a subtree', () => {
    const patterns = buildContainerPatterns({
      module: 'auth',
      aliases: [{
        alias: '~child',
        prefix: [],
        prepend: ['auth', 'components', 'Button'],
      }],
      folderTargets: ['//components'],
    });

    expect(patterns[1].group).toEqual(['~child/*']);
  });
});

describe('module container restrictions', () => {
  it('builds paths only for resolvable module roots', () => {
    expect(buildModuleContainerPaths([
      '~app',
      { alias: '~auth', prefix: [], prepend: ['auth'] },
      { alias: '~billing', prefix: [], prepend: ['billing'] },
    ], ['auth'])).toEqual([
      expect.objectContaining({ name: '~app/auth' }),
      expect.objectContaining({ name: '~auth' }),
    ]);

    expect(buildModuleContainerPaths(['~app'], undefined)).toEqual([]);
  });

  it('recognizes only a module container file alias', () => {
    const aliases = [
      { alias: '~valid', prefix: [], prepend: ['auth', 'index.ts'] },
      { alias: '~short', prefix: [], prepend: ['auth'] },
      { alias: '~long', prefix: [], prepend: ['auth', 'index.ts', 'internal'] },
      { alias: '~wrong-module', prefix: [], prepend: ['billing', 'index.ts'] },
      { alias: '~layer', prefix: [], prepend: ['auth', 'components'] },
      { alias: '~no-extension', prefix: [], prepend: ['auth', 'entry'] },
      { alias: '~suffix', prefix: [], prepend: ['auth', 'index.ts.backup'] },
    ];

    expect(buildModuleContainerPatterns(aliases, ['auth'], ['components'])).toEqual([
      expect.objectContaining({ group: ['~valid', '~valid/**'] }),
      expect.objectContaining({
        group: ['~short/*', '!~short/components', '!~short/components/**'],
      }),
    ]);
  });

  it('preserves exact allowed-layer exceptions in a module pattern', () => {
    expect(buildModuleContainerPatterns(['~app'], ['auth'], ['components', 'hooks']))
      .toEqual([expect.objectContaining({
        group: [
          '~app/auth/*',
          '!~app/auth/components',
          '!~app/auth/components/**',
          '!~app/auth/hooks',
          '!~app/auth/hooks/**',
        ],
      })]);

    expect(buildModuleContainerPatterns(['~app'], undefined, ['components'])).toEqual([]);
  });

  it('combines path and pattern restrictions without losing either side', () => {
    const restrictions = buildModuleContainerRestrictions(
      ['~app'],
      ['auth'],
      ['components'],
    );

    expect(restrictions.paths).toEqual([expect.objectContaining({ name: '~app/auth' })]);

    expect(restrictions.patterns).toEqual([expect.objectContaining({
      group: ['~app/auth/*', '!~app/auth/components', '!~app/auth/components/**'],
    })]);
  });
});

describe('container dependency restrictions', () => {
  it('emits fixtures, entry rules, and every forbidden module alias', () => {
    const patterns = buildContainerPatterns({
      module: 'auth',
      targetModules: ['auth', 'profile'],
      forbiddenModules: ['billing'],
      aliases: [
        '~app',
        { alias: '~billing', prefix: [], prepend: ['billing'] },
        { alias: '~other', prefix: [], prepend: ['other'] },
      ],
      folderTargets: ['components'],
      fixtures: ['**/fixtures/**'],
    });

    expect(patterns).toEqual([
      expect.objectContaining({ group: ['./../**', '././**'] }),
      expect.objectContaining({ group: ['**/fixtures/**'] }),
      expect.objectContaining({
        group: [
          '~app/auth/components/*/**',
          '~app/profile/components/*/**',
        ],
      }),
      expect.objectContaining({
        group: ['~app/billing', '~app/billing/**', '~billing', '~billing/**'],
      }),
    ]);
  });
});

describe('module import scope', () => {
  it('returns no constraints outside a module and graph constraints inside one', () => {
    const resolved = resolveArchitecture({
      alias: '~app',
      modules: [
        { name: 'auth', does: 'auth', dependsOn: ['shared'] },
        { name: 'shared', does: 'shared' },
        { name: 'billing', does: 'billing' },
      ],
      layers: [{ name: 'components', does: 'components' }],
    });

    expect(moduleImportScope(resolved, undefined)).toEqual({});

    expect(moduleImportScope(resolved, 'auth')).toEqual({
      targetModules: ['auth', 'shared'],
      forbiddenModules: ['billing'],
    });
  });
});

describe('structural pattern composition', () => {
  it('preserves forbidden flow, modules, fixtures, and folder entries', () => {
    const patterns = buildStructuralPatterns({
      layer: 'components',
      module: 'auth',
      targetModules: ['auth'],
      forbiddenModules: ['billing'],
      aliases: ['~app'],
      forbidden: ['pages'],
      unitLayout: 'folder',
      folderTargets: ['hooks'],
      fixtures: ['**/fixtures/**'],
    });

    expect(patterns.map(({ group }) => group)).toEqual([
      ['./../**', '././**'],
      ['~app/auth/components', '~app/auth/components/**'],
      ['~app/auth/pages', '~app/auth/pages/**'],
      ['~app/billing', '~app/billing/**'],
      ['**/fixtures/**'],
      ['~app/auth/hooks/*/**'],
    ]);
  });
});
