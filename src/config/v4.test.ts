import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateBlueprint } from './defineBlueprint';
import type { Blueprint } from './types';

function blueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'auth', does: 'authentication' },
        { name: 'checkout', does: 'checkout' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
        { name: 'hooks', does: 'state', layout: 'file' },
      ],
    },
  };
}

describe('Blueprint 4.0 architecture validation', () => {
  it('ships the generic agent contract with Module → Layer → Unit vocabulary', () => {
    const contract = readFileSync(
      fileURLToPath(new URL('../../agent-contract.md', import.meta.url)),
      'utf8',
    );

    expect(contract).toContain('Module → Layer → Unit');
    expect(contract).toContain('Folder-layout units');
    expect(contract).not.toMatch(/Folder-layout modules|layer\/module|module inside one|module shapes/);
  });

  it('accepts module-first and layer-first declarations with layer-level unit shapes', () => {
    expect(validateBlueprint(blueprint())).toEqual(blueprint());

    const layerFirst = blueprint();

    delete layerFirst.architecture.modules;

    expect(validateBlueprint(layerFirst)).toEqual(layerFirst);
  });

  it.each(['architecture', 'layer'])('rejects retired %s.module with migration guidance', (at) => {
    const config = blueprint() as Blueprint & Record<string, unknown>;

    if (at === 'architecture') {
      (config.architecture as unknown as Record<string, unknown>).module = {
        layout: 'folder', entry: 'index', private: ['hooks'],
      };
    } else {
      (config.architecture.layers[0] as unknown as Record<string, unknown>).module = {
        layout: 'folder', entry: 'index',
      };
    }

    expect(() => validateBlueprint(config)).toThrow(/retired in Blueprint 4\.0.*layout.*entry/s);
  });

  it('rejects flat with the targeted file-layout migration', () => {
    (blueprint().architecture.layers[0] as unknown as Record<string, unknown>).layout = 'flat';

    expect(() => validateBlueprint(blueprint())).not.toThrow();

    const config = blueprint();

    (config.architecture.layers[0] as unknown as Record<string, unknown>).layout = 'flat';

    expect(() => validateBlueprint(config)).toThrow(/retired layout "flat".*"file"/s);
  });

  it('keeps the omitted unit shape equivalent to file plus index', () => {
    const config = blueprint();

    delete config.architecture.layers[1].layout;
    delete config.architecture.layers[1].entry;

    expect(validateBlueprint(config)).toBe(config);
  });

  it('requires both dimensions only for custom module-first layer nets', () => {
    const moduleConfig = blueprint();

    moduleConfig.architecture.layerFiles = 'src/{layer}/**/*.ts';

    expect(() => validateBlueprint(moduleConfig)).toThrow(/both "{module}" and "{layer}"/);

    moduleConfig.architecture.layerFiles = 'src/{module}/{layer}/**/*.ts';
    expect(validateBlueprint(moduleConfig)).toBe(moduleConfig);

    const layerConfig = blueprint();

    delete layerConfig.architecture.modules;
    layerConfig.architecture.layerFiles = 'src/{layer}/**/*.ts';
    expect(validateBlueprint(layerConfig)).toBe(layerConfig);

    layerConfig.architecture.layerFiles = 'src/{module}/{layer}/**/*.ts';

    expect(() => validateBlueprint(layerConfig))
      .toThrow(/Layer-first layerFiles entry.*must not include "\{module\}"/);
  });

  it('rejects an empty module collection', () => {
    const empty = blueprint();

    empty.architecture.modules = [];
    expect(() => validateBlueprint(empty)).toThrow(/modules must be a non-empty array/);
  });

  it('rejects invalid module names', () => {
    const path = blueprint();

    path.architecture.modules![1].name = 'feature/auth';
    expect(() => validateBlueprint(path)).toThrow(/glob or path characters/);

    const traversal = blueprint();

    traversal.architecture.modules![0].name = '..';
    expect(() => validateBlueprint(traversal)).toThrow(/glob or path characters/);

    const current = blueprint();

    current.architecture.modules![0].name = '.';
    expect(() => validateBlueprint(current)).toThrow(/glob or path characters/);

    const unnamed = blueprint();

    unnamed.architecture.modules![0].name = '';
    expect(() => validateBlueprint(unnamed)).toThrow(/non-empty name/);

    const corrupt = blueprint();

    corrupt.architecture.modules![0].name = 'auth team';
    expect(() => validateBlueprint(corrupt)).toThrow(/corrupt paths or generated artifacts/);
  });

  it('requires a module responsibility', () => {
    const config = blueprint();

    config.architecture.modules![0].does = ' ';
    expect(() => validateBlueprint(config)).toThrow(/non-empty does/);
  });

  it('rejects case-colliding module names', () => {
    const config = blueprint();

    config.architecture.modules![1].name = 'AUTH';
    expect(() => validateBlueprint(config)).toThrow(/same source-root folder/);
  });
});
