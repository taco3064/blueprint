import { describe, expect, it } from 'vitest';
import type { ArchitectureDef, Blueprint } from '../../config';
import {
  barredIn,
  netModuleSelfOnly,
  netPatterns,
  netSelfBanPaths,
  netSelfOnly,
  resolveBanScope,
} from './bans';
import { resolveFileNets } from './nets';

const architecture: ArchitectureDef = {
  alias: '~app',
  layers: [
    { name: 'hooks', does: '' },
    { name: 'components', does: '', folder: { layout: 'folder' } },
  ],
  modules: [
    { name: 'Combat', does: '', owns: [{ global: 'requestAnimationFrame' }] },
    { name: 'Lobby', does: '', layers: false },
  ],
};

const blueprint: Blueprint = { framework: 'react', architecture };

function netFor(module: string, layer: string | null) {
  const net = resolveFileNets(architecture, 'react').find(
    (candidate) => candidate.module === module && candidate.layer === layer,
  );

  if (!net) {
    throw new Error(`no net for ${module}/${layer}`);
  }

  return net;
}

describe('resolveBanScope', () => {
  it('cascades owns from a layer AND its owning module into one owner list', () => {
    const scope = resolveBanScope(blueprint);

    expect(scope.globalRules).toEqual([
      { global: 'requestAnimationFrame', allowedIn: ['Combat'], modules: ['Combat'] },
    ]);
  });

  it('carries the declared modules and the folder-layout layer names', () => {
    const scope = resolveBanScope(blueprint);

    expect(scope.modules.map((m) => m.name)).toEqual(['Combat', 'Lobby']);
    expect(scope.folderLayers).toEqual(['components']);
  });
});

describe('barredIn · ownership cascades to every layer inside the owning module (AC11)', () => {
  it('passes a net whose MODULE owns the primitive, regardless of its own layer', () => {
    const scope = resolveBanScope(blueprint);
    const rule = scope.globalRules[0];

    expect(barredIn(netFor('Combat', 'hooks'), rule)).toBe(false);
    expect(barredIn(netFor('Combat', null), rule)).toBe(false);
  });

  it('bars a net in a DIFFERENT module even on the very same layer', () => {
    const scope = resolveBanScope(blueprint);
    const rule = scope.globalRules[0];

    // Lobby has no net named "hooks" (layers: false), so its own single net is
    // the one to check — a different module, same primitive, still barred.
    expect(barredIn(netFor('Lobby', null), rule)).toBe(true);
  });

  it('flat: unaffected, checks the layer alone', () => {
    const flat: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'services', does: '', owns: ['axios'] }],
    };

    const scope = resolveBanScope({ framework: 'react', architecture: flat });
    const net = resolveFileNets(flat, 'react')[0];

    expect(barredIn(net, scope.packageRules[0])).toBe(false);
  });
});

describe('netPatterns · a module root-file net (layered module)', () => {
  it('carries the generic bans plus the folder-target ban for its OWN declared layers', () => {
    const scope = resolveBanScope(blueprint);
    const groups = netPatterns(netFor('Combat', null), scope);

    // components uses folder layout, so Combat's root files reach it entry-only —
    // the same protection an inner layer gets, one level up.
    expect(groups.some((g) => g.group.includes('~app/Combat/components/*/**'))).toBe(true);
  });
});

describe('netPatterns · an inner layer net carries the module self-ban too', () => {
  it('includes the self-ban patterns alongside the structural and module-flow bans', () => {
    const scope = resolveBanScope(blueprint);
    const groups = netPatterns(netFor('Combat', 'hooks'), scope);

    expect(groups.some((g) => g.group.includes('~app/Combat/*'))).toBe(true);
  });
});

describe('netPatterns / netSelfBanPaths · a net naming a module the scope does not carry', () => {
  // `NetScope` is a plain `{ module, layer }` pair — `resolveFileNets` always
  // derives one that matches `scope.modules`, but nothing type-level enforces
  // that a caller's net and scope came from the same architecture. Both
  // `moduleLayerScope` and `netSelfBan` look the module up by name and treat a
  // miss the same as `layers !== false`: nothing declared says otherwise, so
  // the folder-target / self-ban shape defaults to the layered case.
  it('falls back to the layered-module shape when the module def cannot be found', () => {
    const scope = resolveBanScope(blueprint);
    const orphan = { module: 'Ghost', layer: 'hooks' };

    expect(() => netPatterns(orphan, scope)).not.toThrow();

    expect(netSelfBanPaths(orphan, scope)).toEqual([
      { name: '~app/Ghost', message: expect.any(String) },
    ]);
  });
});

describe('netSelfBanPaths', () => {
  it('is empty for a flat net (module null)', () => {
    const scope = resolveBanScope(blueprint);
    const net = resolveFileNets({ alias: '~app', layers: [{ name: 'x', does: '' }] }, 'react')[0];

    expect(netSelfBanPaths(net, scope)).toEqual([]);
  });

  it('bans the bare module entry for every net inside that module', () => {
    const scope = resolveBanScope(blueprint);

    expect(netSelfBanPaths(netFor('Combat', 'hooks'), scope)).toEqual([
      { name: '~app/Combat', message: expect.any(String) },
    ]);
  });
});

describe('netSelfOnly (layer-level, within a module) and netModuleSelfOnly (cross-module)', () => {
  const withSelfOnly: ArchitectureDef = {
    alias: '~app',
    layers: [
      { name: 'hooks', does: '' },
      { name: 'contexts', does: '', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
    ],
    modules: [
      { name: 'Combat', does: '' },
      {
        name: 'Lobby',
        does: '',
        allowedImporters: [{ module: 'Combat', selfOnly: true }],
      },
    ],
  };

  it('netSelfOnly prefixes a layer target with the module it sits inside', () => {
    const net = resolveFileNets(withSelfOnly, 'react').find(
      (candidate) => candidate.module === 'Combat' && candidate.layer === 'hooks',
    )!;

    expect(netSelfOnly(net, withSelfOnly)).toContainEqual({
      target: 'contexts',
      path: 'Combat/contexts',
    });
  });

  it('netSelfOnly returns [] for a net with no layer — nothing to prefix', () => {
    const net = resolveFileNets(withSelfOnly, 'react').find(
      (candidate) => candidate.module === 'Combat' && candidate.layer === null,
    )!;

    expect(netSelfOnly(net, withSelfOnly)).toEqual([]);
  });

  it('netModuleSelfOnly carries a module target at its own bare entry, no prefix', () => {
    const net = resolveFileNets(withSelfOnly, 'react').find(
      (candidate) => candidate.module === 'Combat' && candidate.layer === null,
    )!;

    expect(netModuleSelfOnly(net, withSelfOnly)).toEqual([{ target: 'Lobby', path: 'Lobby' }]);
  });

  it('netModuleSelfOnly returns [] for a flat net (module null)', () => {
    expect(netModuleSelfOnly({ module: null, layer: 'hooks' }, withSelfOnly)).toEqual([]);
  });
});
