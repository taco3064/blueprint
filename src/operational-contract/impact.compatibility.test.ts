import { describe, expect, it } from 'vitest';

import { renderImpactUnavailable } from './impact';

describe('impact compatibility guidance', () => {
  it.each([
    [null, 'this project-local ESLint API', 'Use a supported ESLint 9 or 10 release'],
    [8, 'ESLint 8', 'Migrate the project to ESLint 9 or 10'],
    [9, 'ESLint 9', 'Use a supported ESLint 9 or 10 release'],
    [10, 'ESLint 10', 'Use a supported ESLint 9 or 10 release'],
    [11, 'ESLint 11', 'Use a supported ESLint 9 or 10 release'],
  ] as const)('names the unavailable API and remedy for %s', (eslintMajor, version, remedy) => {
    expect(renderImpactUnavailable({ eslintMajor, supportedMajors: [9, 10] })).toBe(
      `⊘ Rule impact unavailable — Blueprint's isolated flat-config analysis does not support `
      + `${version}. ${remedy}, then rerun \`blueprint impact\`. Until `
      + 'then no impact count was measured; this result does not mean the emitted rules have zero '
      + 'hits.',
    );
  });
});
