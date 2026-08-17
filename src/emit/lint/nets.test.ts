import { describe, expect, it } from 'vitest';
import type { ArchitectureDef } from '../../config';
import { allNetFiles, resolveFileNets } from './nets';

describe('resolveFileNets · flat structure', () => {
  it('returns one net per layer, module null, layer named', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'components', does: '' }, { name: 'hooks', does: '' }],
    };

    expect(resolveFileNets(architecture, 'react')).toEqual([
      { module: null, layer: 'components', files: ['src/components/**/*.{js,jsx,ts,tsx}'] },
      { module: null, layer: 'hooks', files: ['src/hooks/**/*.{js,jsx,ts,tsx}'] },
    ]);
  });
});

describe('resolveFileNets · modular structure, a layered module', () => {
  it('returns the module root-file net first, then one net per declared layer inside it', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'hooks', does: '' }],
      modules: [{ name: 'Combat', does: '' }],
    };

    expect(resolveFileNets(architecture, 'react')).toEqual([
      { module: 'Combat', layer: null, files: ['src/Combat/*.{js,jsx,ts,tsx}'] },
      { module: 'Combat', layer: 'hooks', files: ['src/Combat/hooks/**/*.{js,jsx,ts,tsx}'] },
    ]);
  });
});

describe('resolveFileNets · modular structure, a layers: false module', () => {
  it('returns exactly one net standing for the whole module — no layer depth inside it', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'hooks', does: '' }],
      modules: [{ name: 'Lobby', does: '', layers: false }],
    };

    expect(resolveFileNets(architecture, 'react')).toEqual([
      { module: 'Lobby', layer: null, files: ['src/Lobby/**/*.{js,jsx,ts,tsx}'] },
    ]);
  });
});

describe('resolveFileNets · a mix of layered and layers: false modules', () => {
  it('resolves each module by its own shape, in declaration order', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'hooks', does: '' }],
      modules: [
        { name: 'Combat', does: '' },
        { name: 'Lobby', does: '', layers: false },
      ],
    };

    const nets = resolveFileNets(architecture, 'vue');

    expect(nets.map((net) => [net.module, net.layer])).toEqual([
      ['Combat', null],
      ['Combat', 'hooks'],
      ['Lobby', null],
    ]);
  });
});

describe('allNetFiles', () => {
  it('deduplicates every net glob into the whole enforced surface', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [{ name: 'components', does: '' }, { name: 'hooks', does: '' }],
    };

    expect(allNetFiles(architecture, 'react')).toEqual([
      'src/components/**/*.{js,jsx,ts,tsx}',
      'src/hooks/**/*.{js,jsx,ts,tsx}',
    ]);
  });
});
