import { globToRegExp, resolveTestFiles } from '../config';
import type { ScanResult } from './types';

export { globToRegExp } from '../config';

export function isTestFile(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

export function dropTestFiles(
  scan: ScanResult,
  testFiles: string | string[] | undefined,
): ScanResult {
  const patterns = resolveTestFiles(testFiles).architectureExemptions.map(globToRegExp);
  const governed = scan.files.filter((file) => !isTestFile(file.path, patterns));

  return {
    ...scan,
    files: governed,
    ...(scan.outsideScope && 'files' in scan.outsideScope
      ? {
          outsideScope: {
            ...scan.outsideScope,
            files: scan.outsideScope.files.filter((file) => !isTestFile(file.path, patterns)),
          },
        }
      : {}),
  };
}

export function dropLayerFilesIgnored(
  scan: ScanResult,
  layerFilesIgnore: string | string[] | undefined,
): ScanResult {
  const globs = layerFilesIgnore === undefined
    ? []
    : Array.isArray(layerFilesIgnore) ? layerFilesIgnore : [layerFilesIgnore];

  const patterns = globs.map(globToRegExp);

  return { ...scan, files: scan.files.filter((file) => !isTestFile(file.path, patterns)) };
}
