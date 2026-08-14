import { describe, expect, it } from 'vitest';

import { moduleZone, zoneWord } from './zone';

describe('moduleZone', () => {
  // `layers?: false` has two states and no third, so these are the whole domain.
  it('reads a layers:false module as the module zone', () => {
    expect(moduleZone({ name: 'app', does: 'routing only', layers: false })).toBe('module');
  });

  it('reads a module that kept the layer vocabulary as the root zone', () => {
    expect(moduleZone({ name: 'Fighter', does: 'the ship' })).toBe('root');
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
