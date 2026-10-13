import { activeSetting } from '../../config';
import type { Blueprint } from '../../config';
import { plugin } from '../../plugin';
import type { LintConfigEntry } from './types';

export function testFilenameEntry(
  rules: Blueprint['rules'], testGlobs: string[],
): LintConfigEntry[] {
  const testFilename = activeSetting(rules?.testFilename);

  if (!testFilename || !testGlobs.length) {
    return [];
  }

  return [{
    files: testGlobs,
    plugins: { blueprint: plugin },
    rules: {
      'blueprint/test-filename-matches-source': Object.keys(testFilename.opts).length > 1
        ? [testFilename.tier, Object.fromEntries(
            Object.entries(testFilename.opts).filter(([key]) => key !== 'tier'),
          )]
        : testFilename.tier,
    },
  }];
}
