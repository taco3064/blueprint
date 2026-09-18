export interface VersionIdentity {
  label: string;
  title: string;
}

export function versionIdentity(packageVersion: string, lang: string): VersionIdentity {
  return lang.startsWith('zh')
    ? {
        label: 'main · 未發布',
        title: `由 main 分支建置，可能包含尚未發布的變更。package.json 版本：${packageVersion}`,
      }
    : {
        label: 'main · unreleased',
        title: 'Built from the main branch; it may describe changes that are not in a published '
          + `release yet. package.json version: ${packageVersion}`,
      };
}
