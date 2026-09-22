export interface VersionIdentity {
  label: string;
  title: string;
}

export function versionIdentity(packageVersion: string, lang: string, releaseTag?: string): VersionIdentity {
  if (releaseTag) {
    if (releaseTag !== `v${packageVersion}`) {
      throw new Error(`Documentation tag ${releaseTag} does not match package version ${packageVersion}`);
    }
    return {
      label: releaseTag,
      title: lang.startsWith('zh')
        ? `這份文件對應 ${releaseTag} 正式發布版本。`
        : `Documentation for the ${releaseTag} release.`,
    };
  }
  return lang.startsWith('zh')
    ? {
        label: 'main · 開發版文件',
        title: `這份文件由 main 分支建置，可能包含尚未正式發布的變更。package.json 版本：${packageVersion}`,
      }
    : {
        label: 'main · development docs',
        title: 'Built from the main branch; it may describe changes that are not in a published '
          + `release yet. package.json version: ${packageVersion}`,
      };
}
