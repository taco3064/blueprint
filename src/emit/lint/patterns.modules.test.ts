import { describe, expect, it } from 'vitest';

import {
  buildModulePatterns,
  buildModuleSelfBan,
  buildPackagePatterns,
  buildStructuralPatterns,
  derivePackageRules,
  deriveGlobalRules,
  ownerPhrase,
  resolveModuleRootFiles,
} from './patterns';
import type { PrimitiveOwner } from './patterns';
import type { ModuleDef } from '../../config';

describe('resolveModuleRootFiles', () => {
  it('collapses the layer glob\'s descent into the module name, one level deep', () => {
    expect(resolveModuleRootFiles('Combat', 'react')).toEqual(['src/Combat/*.{js,jsx,ts,tsx}']);
  });

  it('honors a configured layerFiles template, keeping its extensions', () => {
    expect(
      resolveModuleRootFiles('Combat', 'vue', { layerFiles: 'app/{layer}/**/*.{ts,vue}' }),
    ).toEqual(['app/Combat/*.{ts,vue}']);
  });

  it('honors sourceRoot "." the same way resolveLayerFiles does', () => {
    expect(resolveModuleRootFiles('Combat', 'react', { sourceRoot: '.' }))
      .toEqual(['Combat/*.{js,jsx,ts,tsx}']);
  });
});

describe('ownerPhrase', () => {
  it('says "its owning layer" when no module owns it — the only flat-blueprint case', () => {
    expect(ownerPhrase({ allowedIn: ['services'] })).toBe('its owning layer');
    expect(ownerPhrase({ allowedIn: ['services'], modules: [] })).toBe('its owning layer');
  });

  it('names a single owning module', () => {
    expect(ownerPhrase({ allowedIn: ['Combat'], modules: ['Combat'] })).toBe('module "Combat"');
  });

  it('names multiple owning modules, plural', () => {
    expect(ownerPhrase({ allowedIn: ['Combat', 'Lobby'], modules: ['Combat', 'Lobby'] }))
      .toBe('modules "Combat", "Lobby"');
  });

  it('appends "and its owning layer" when a layer ALSO owns it, not just modules', () => {
    expect(ownerPhrase({ allowedIn: ['Combat', 'services'], modules: ['Combat'] }))
      .toBe('module "Combat" and its owning layer');
  });
});

describe('derivePackageRules / deriveGlobalRules · module cascade tagging', () => {
  const module: ModuleDef = { name: 'Combat', does: '', owns: ['axios', { global: 'fetch' }] };
  const owners: PrimitiveOwner[] = [{ name: 'services', does: '', owns: ['axios'] }, module];

  it('tags only the owners that are modules, leaving a layer-only rule untouched', () => {
    const rules = derivePackageRules(owners, ['Combat']);

    expect(rules).toEqual([
      { package: 'axios', allowedIn: ['services', 'Combat'], modules: ['Combat'] },
    ]);
  });

  it('omits the modules key entirely when moduleNames is omitted — the flat call site', () => {
    const rules = derivePackageRules([{ name: 'services', does: '', owns: ['axios'] }]);

    expect(rules).toEqual([{ package: 'axios', allowedIn: ['services'] }]);
    expect(rules[0]).not.toHaveProperty('modules');
  });

  it('tags a module-owned global the same way', () => {
    const rules = deriveGlobalRules(owners, ['Combat']);

    expect(rules).toEqual([{ global: 'fetch', allowedIn: ['Combat'], modules: ['Combat'] }]);
  });
});

describe('buildStructuralPatterns · layer omitted', () => {
  it('has no same-layer edge to ban — a root-files group belongs to no layer', () => {
    const groups = buildStructuralPatterns({ aliases: ['~app'], forbidden: [] });

    // Only the generic redundant-segments ban survives with nothing else declared.
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toEqual(['./../**', '././**']);
  });

  it('still carries forbidden / fixtures / folderTargets bans without a layer identity', () => {
    const groups = buildStructuralPatterns({
      aliases: ['~app'],
      forbidden: ['services'],
      folderTargets: ['hooks'],
      fixtures: ['~app/fixtures', '~app/fixtures/**'],
    });

    expect(groups.map((g) => g.group)).toEqual([
      ['./../**', '././**'],
      ['~app/services/**'],
      ['~app/fixtures', '~app/fixtures/**'],
      ['~app/hooks/*/**'],
    ]);
  });
});

describe('buildModulePatterns', () => {
  it('bans a forbidden module at both the bare entry and past it', () => {
    const groups = buildModulePatterns({
      module: 'Combat',
      aliases: ['~app'],
      forbidden: ['Menu'],
      allowed: [],
    });

    expect(groups).toEqual([{
      group: ['~app/Menu', '~app/Menu/**'],
      message: expect.stringContaining('"Combat" may not import this module'),
    }]);
  });

  it('bans an allowed module only past its entry — the entry itself stays legal', () => {
    const groups = buildModulePatterns({
      module: 'Combat',
      aliases: ['~app'],
      forbidden: [],
      allowed: ['Replay'],
    });

    expect(groups).toEqual([{
      group: ['~app/Replay/**'],
      message: expect.stringContaining('Import a module through its entry'),
    }]);
  });

  it('emits nothing when there is nothing to say either way', () => {
    expect(buildModulePatterns({ module: 'Combat', aliases: ['~app'], forbidden: [], allowed: [] }))
      .toEqual([]);
  });
});

describe('buildModuleSelfBan · a layered module', () => {
  it('bans the bare alias entry (exact paths, not a glob) and any other root-level '
    + 'file, but leaves a declared layer\'s own alias spelling alone', () => {
    const { paths, patterns } = buildModuleSelfBan({
      module: 'Combat',
      aliases: ['~app'],
      layers: ['hooks', 'components'],
    });

    expect(paths).toEqual([{
      name: '~app/Combat',
      message: expect.stringContaining('Same-module imports must be relative'),
    }]);

    expect(patterns).toEqual([{
      group: ['~app/Combat/*', '!~app/Combat/hooks', '!~app/Combat/components'],
      message: expect.stringContaining('Same-module imports must be relative'),
    }]);
  });
});

describe('buildModuleSelfBan · a layers: false module', () => {
  it('bans the whole subtree wholesale — no declared layer to wrongly catch', () => {
    const { paths, patterns } = buildModuleSelfBan({
      module: 'Lobby',
      aliases: ['~app'],
      layers: [],
    });

    expect(paths).toEqual([{ name: '~app/Lobby', message: expect.any(String) }]);
    expect(patterns).toEqual([{ group: ['~app/Lobby/**'], message: expect.any(String) }]);
  });
});

describe('buildPackagePatterns · module-owned wording (AC11)', () => {
  it('names the owning module instead of the generic "in this layer"', () => {
    const { paths } = buildPackagePatterns([
      { package: 'axios', allowedIn: ['Combat'], modules: ['Combat'] },
    ]);

    expect(paths[0].message).toContain('owned by module "Combat"');
  });

  it('keeps the flat wording unchanged when nothing is module-owned', () => {
    const { paths } = buildPackagePatterns([{ package: 'axios', allowedIn: ['services'] }]);

    expect(paths[0].message).toBe('\n🚫 Do not import "axios" in this layer.');
  });
});
