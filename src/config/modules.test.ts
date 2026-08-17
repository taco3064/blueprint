import { describe, expect, it } from 'vitest';

import {
  getForbiddenModules,
  getModuleEntry,
  getModuleImporters,
  getModules,
  getModuleSelfOnlyTargets,
  normalizeModuleAllowedImporters,
  splitModulesByLayers,
} from './modules';
import type { ArchitectureDef } from './types';

// Mirrors graph.test.ts's own `arch()` layer fixture position-for-position
// (pages/components/hooks/contexts/services → Combat/Lobby/Shell/Menu/Replay) —
// the module axis reuses the exact same order-and-narrow machinery, so the same
// shape proves it the same way. `validateModules` and its own leaf validators
// (also in this file) are exercised through `defineBlueprint.modules.test.ts`,
// the same convention `defineBlueprint.ts`'s other private validators follow.
function arch(): ArchitectureDef {
  return {
    alias: '~app',
    layers: [{ name: 'hooks', does: '' }],
    modules: [
      { name: 'Combat', does: '' },
      { name: 'Lobby', does: '' },
      { name: 'Shell', does: '' },
      {
        name: 'Menu',
        does: '',
        allowedImporters: [{ module: 'Shell', selfOnly: true, description: 'Menu only' }],
      },
      { name: 'Replay', does: '', allowedImporters: ['Shell', 'Menu'] },
    ],
  };
}

describe('getModules', () => {
  it('returns the declared modules, or none for the flat structure', () => {
    expect(getModules(arch())).toHaveLength(5);
    expect(getModules({ ...arch(), modules: undefined })).toEqual([]);
  });
});

describe('normalizeModuleAllowedImporters', () => {
  it('returns [] for undefined and normalizes strings', () => {
    expect(normalizeModuleAllowedImporters(undefined)).toEqual([]);

    expect(normalizeModuleAllowedImporters(['a', { module: 'b', selfOnly: true }])).toEqual([
      { module: 'a' },
      { module: 'b', selfOnly: true },
    ]);
  });
});

describe('getForbiddenModules', () => {
  it('forbids upstream modules and restricted modules that exclude the importer — the '
    + 'module-axis mirror of getForbiddenLayers', () => {
    // Lobby may reach Shell (default) but not Menu/Replay (restricted, exclude it) or
    // Combat (upstream — declared before it).
    expect(getForbiddenModules(arch(), 'Lobby').sort()).toEqual(['Combat', 'Menu', 'Replay']);
  });

  it('allows a listed importer through to a restricted module', () => {
    // Shell is listed on both Menu and Replay → only upstream stays forbidden.
    expect(getForbiddenModules(arch(), 'Shell').sort()).toEqual(['Combat', 'Lobby']);
  });

  it('never forbids a module from itself', () => {
    expect(getForbiddenModules(arch(), 'Replay')).not.toContain('Replay');
  });
});

describe('getModuleImporters', () => {
  it('resolves the default importer set, not the raw field', () => {
    // Lobby declares no allowedImporters, so the default — every module before
    // it — is what may import it. Reading the field would answer "nobody".
    expect(getModuleImporters(arch(), 'Lobby')).toEqual([{ module: 'Combat' }]);
  });

  it('is empty for the first-declared module, which nothing may import', () => {
    expect(getModuleImporters(arch(), 'Combat')).toEqual([]);
  });

  it('carries the declared list with its selfOnly flag when there is one', () => {
    expect(getModuleImporters(arch(), 'Menu')).toEqual([
      { module: 'Shell', selfOnly: true, description: 'Menu only' },
    ]);
  });

  it('answers none for a module it does not know', () => {
    expect(getModuleImporters(arch(), 'not-a-module')).toEqual([]);
  });
});

describe('splitModulesByLayers', () => {
  it('splits on the layers opt-out, in declaration order', () => {
    const architecture: ArchitectureDef = {
      ...arch(),
      modules: [
        { name: 'Shell', does: '' },
        { name: 'common', does: '', layers: false },
        { name: 'Combat', does: '' },
      ],
    };

    expect(splitModulesByLayers(architecture)).toEqual({
      layered: ['Shell', 'Combat'],
      unlayered: ['common'],
    });
  });

  it('answers two empty lists for the flat structure', () => {
    expect(splitModulesByLayers({ ...arch(), modules: undefined }))
      .toEqual({ layered: [], unlayered: [] });
  });
});

describe('getModuleSelfOnlyTargets', () => {
  it('lists modules importable-but-not-re-exportable by the module', () => {
    expect(getModuleSelfOnlyTargets(arch(), 'Shell')).toEqual(['Menu']);
    expect(getModuleSelfOnlyTargets(arch(), 'Lobby')).toEqual([]);
  });
});

describe('getModuleEntry', () => {
  it('takes the module override, else the shared architecture.folder entry', () => {
    const architecture: ArchitectureDef = {
      ...arch(),
      folder: { entry: 'main' },
      modules: [
        { name: 'Combat', does: '', entry: 'Combat' },
        { name: 'Lobby', does: '' },
      ],
    };

    expect(getModuleEntry(architecture, 'Combat')).toBe('Combat');
    expect(getModuleEntry(architecture, 'Lobby')).toBe('main');
  });

  it('falls back to the default shared entry ("index") when neither is set', () => {
    expect(getModuleEntry(arch(), 'Combat')).toBe('index');
  });

  it('falls back to the shared entry for a module it does not know', () => {
    expect(getModuleEntry(arch(), 'not-a-module')).toBe('index');
  });
});
