import { describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { fileZone, moduleZone, zoneWord } from './zone';

describe('moduleZone', () => {
  // `layers?: false` has two states and no third, so these are the whole domain.
  it('reads a layers:false module as the module zone', () => {
    expect(moduleZone({ name: 'app', does: 'routing only', layers: false })).toBe('module');
  });

  it('reads a module that kept the layer vocabulary as the root zone', () => {
    expect(moduleZone({ name: 'Fighter', does: 'the ship' })).toBe('root');
  });
});

describe('fileZone', () => {
  const MODULAR: ArchitectureDef = {
    alias: '~app',
    modules: [
      { name: 'Fighter', does: 'the ship' },
      { name: 'app', does: 'routing only', layers: false },
    ],
    layers: [{ name: 'hooks', does: 'reactive state' }],
  };

  const FLAT: ArchitectureDef = {
    alias: '~app',
    layers: [{ name: 'components', does: 'render UI' }],
  };

  // Every answer, at every position that can produce it — and the three rows
  // naming a declared layer's NAME are the claim this table exists for. `hooks`
  // is a layer only where a layer glob is expanded, which is inside a declared,
  // layered module; the same six letters at the same depth under `app` or under
  // `scratch` are a folder name and nothing more. Answered by name alone, two
  // of these three read as a layer.
  it.each([
    ['a layered module\'s own composition file is the root zone', ['Fighter', 'Fighter.tsx'], 'root'],
    ['a layered module\'s entry is the root zone too', ['Fighter', 'index.ts'], 'root'],
    // Root depth is decided before the layer test, so a root FILE named after a
    // layer is still a root — the reverse order makes it a layer with no folder.
    ['a root file whose stem is a layer name is the root zone', ['Fighter', 'hooks.ts'], 'root'],
    ['a layers:false module\'s root is the module zone', ['app', 'index.tsx'], 'module'],
    ['a file nested inside a layers:false module is the module zone', ['app', 'routes', 'Game', 'screen.tsx'], 'module'],
    ['a layer folder inside a declared module is the layer zone', ['Fighter', 'hooks', 'useRun', 'index.ts'], 'layer'],
    ['a layer NAME inside a layers:false module is still that module\'s zone', ['app', 'hooks', 'useX', 'index.ts'], 'module'],
    ['an undeclared position inside a layered module is governed by nothing', ['Fighter', 'scratch', 'x.ts'], null],
    ['a file directly under an undeclared top folder is governed by nothing', ['scratch', 'notes.ts'], null],
    ['a layer NAME under an undeclared top folder is governed by nothing', ['scratch', 'hooks', 'useX', 'index.ts'], null],
  ] as const)('under modules, %s', (_label, segments, zone) => {
    expect(fileZone([...segments], MODULAR)).toBe(zone);
  });

  // Flat has no module list to consult and `depth` is 0, so the layer IS the
  // top folder. The first row is what proves the modular arm did not run: read
  // through it, `components` is an undeclared module and the answer is null.
  it.each([
    ['a file inside a declared layer is the layer zone', ['components', 'Ship', 'index.tsx'], 'layer'],
    ['an undeclared top folder is governed by nothing', ['scratch', 'x.ts'], null],
    ['a file at the source root is governed by nothing', ['main.tsx'], null],
  ] as const)('flat, %s', (_label, segments, zone) => {
    expect(fileZone([...segments], FLAT)).toBe(zone);
  });
});

describe('zoneWord', () => {
  // The words restated here rather than read from the map: one contract per
  // member, so respelling either turns exactly one case red. They are what an
  // adopter greps for across `blueprint rules` and doctor.
  it.each([
    ['root', 'root'],
    ['module', 'all'],
  ] as const)('addresses the %s zone as (%s)', (zone, word) => {
    expect(zoneWord(zone)).toBe(word);
  });
});
