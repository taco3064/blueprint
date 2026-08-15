import { describe, expect, it } from 'vitest';

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
  const MODULES = [
    { name: 'Fighter', does: 'the ship' },
    { name: 'app', does: 'routing only', layers: false as const },
  ];

  // Every answer, at every depth that can produce it. The pairs are the claim:
  // each zone has a depth it holds at and a depth it must not be confused with,
  // and `null` arrives by two different routes that a single case cannot tell
  // apart.
  it.each([
    ['a layered module\'s own composition file', ['Fighter', 'Fighter.tsx'], 'root'],
    ['a layered module\'s entry', ['Fighter', 'index.ts'], 'root'],
    ['a layers:false module\'s root', ['app', 'index.tsx'], 'module'],
    ['a file nested inside a layers:false module', ['app', 'routes', 'Game', 'screen.tsx'], 'module'],
  ] as const)('governs %s by its module\'s own entry', (_label, segments, zone) => {
    expect(fileZone([...segments], MODULES, 1)).toBe(zone);
  });

  it.each([
    // A layer entry governs it — the zone functions answer for the module's own
    // entry only, and this is the case that must not read as a root.
    ['a file inside a declared layer', ['Fighter', 'hooks', 'useRun', 'index.ts']],
    // No entry governs these two at all, and the second is why the module
    // lookup is inside this function: it sits at root depth, so a test that
    // reads the depth alone calls an undeclared folder a module root.
    ['an undeclared position inside a layered module', ['Fighter', 'scratch', 'x.ts']],
    ['a file directly under an undeclared top folder', ['scratch', 'notes.ts']],
  ])('leaves %s to no module entry', (_label, segments) => {
    expect(fileZone(segments, MODULES, 1)).toBeNull();
  });

  it('answers null on a flat project, without consulting the depth', () => {
    // `modules` is absent there, so the lookup fails before any segment count
    // is read — which is why this function carries no `depth > 0` guard.
    expect(fileZone(['components', 'Ship', 'index.tsx'], [], 0)).toBeNull();
    expect(fileZone(['components'], [], 0)).toBeNull();
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
