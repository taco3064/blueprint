import { describe, expect, it } from 'vitest';
import { scopeLintEntries, scopeLintOptions } from './scope';

describe('application lint scope', () => {
  it('preserves unscoped options without adding an undefined basePath property', () => {
    const options = { sourceRoot: 'src' };

    expect(scopeLintOptions(options)).toBe(options);
    expect(scopeLintOptions(options)).toStrictEqual({ sourceRoot: 'src' });

    expect(scopeLintOptions(options, 'apps/web')).toStrictEqual({
      sourceRoot: 'src', basePath: 'apps/web',
    });
  });

  it('scopes each entry without mutating the original', () => {
    const entries = [{ files: ['**/*.ts'] }, { rules: {} }];

    expect(scopeLintEntries(entries)).toBe(entries);

    expect(scopeLintEntries(entries, 'apps/web')).toStrictEqual([
      { files: ['**/*.ts'], basePath: 'apps/web' },
      { rules: {}, basePath: 'apps/web' },
    ]);

    expect(entries).toStrictEqual([{ files: ['**/*.ts'] }, { rules: {} }]);
  });
});
