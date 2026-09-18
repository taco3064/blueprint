import { describe, expect, it } from 'vitest';

import { versionIdentity } from './version-identity';

describe('docs site version identity', () => {
  it.each(['en-US', 'zh-TW'])('%s names the main snapshot, not the package version', (lang) => {
    const identity = versionIdentity('4.0.0', lang);

    expect(identity.label).toMatch(/^main · \S/);
    expect(identity.label).not.toContain('4.0.0');
    expect(identity.title).toContain('package.json');
    expect(identity.title).toContain('4.0.0');
  });

  it('reads unreleased in the reader\'s locale', () => {
    expect(versionIdentity('4.0.0', 'en-US')).toEqual({
      label: 'main · unreleased',
      title: 'Built from the main branch; it may describe changes that are not in a published '
        + 'release yet. package.json version: 4.0.0',
    });

    expect(versionIdentity('4.1.0', 'zh-TW')).toEqual({
      label: 'main · 尚未發布',
      title: '這份文件由 main 分支建置，可能包含尚未正式發布的變更。package.json 版本：4.1.0',
    });
  });
});
