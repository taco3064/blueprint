import { describe, expect, it } from 'vitest';

import {
  renderDependencyLeaderboard,
  renderDependencyTestExemption,
  renderDependencyUnit,
  renderUnknownDependencyTarget,
} from './deps';

describe('dependency operational prose', () => {
  it('keeps unknown and outside targets distinct', () => {
    expect(renderUnknownDependencyTarget({ key: 'hooks/missing' }))
      .toContain('Unknown unit "hooks/missing"');

    expect(renderUnknownDependencyTarget({ key: 'legacy/x', outsideFolder: 'legacy' }))
      .toContain('"legacy/" is outside the declared architecture');
  });

  it('renders unit and leaderboard facts without changing their granularity', () => {
    const units = [{
      unit: 'features',
      importedBy: ['pages/Home'],
      imports: ['services/api'],
      fileLayer: true,
    }];

    const unit = renderDependencyUnit(units[0], {
      testExemption: 'tests excluded',
      importGraph: { unknownDynamicImports: 0, parseFailures: [] },
    });

    const leaderboard = renderDependencyLeaderboard(units, {
      skipped: ['legacy'],
      testExemption: null,
      importGraph: { unknownDynamicImports: 0, parseFailures: [] },
    });

    expect(unit).toContain('features (file-layout layer — answers at layer granularity)');
    expect(unit).toContain('· tests excluded');
    expect(leaderboard).toContain('1 ← features (file-layout layer)');
    expect(leaderboard).toContain('invisible to deps: legacy/');
  });

  it('renders the empty and test-exemption paths explicitly', () => {
    expect(renderDependencyLeaderboard([], {
      skipped: [], testExemption: null,
      importGraph: { unknownDynamicImports: 0, parseFailures: [] },
    })).toBe('No units found inside the declared architecture.');

    expect(renderDependencyTestExemption('the test glob matched nothing'))
      .toContain('nothing in it was exempted');
  });
});
