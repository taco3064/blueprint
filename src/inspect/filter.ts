import { resolveTestFiles } from '../emit/lint/patterns';
import type { ScanResult } from './types';

export function globToRegExp(glob: string): RegExp {
  let pattern = '';

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        pattern += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else if (char === '{' && glob.includes('}', i)) {
      const end = glob.indexOf('}', i);
      const body = glob.slice(i + 1, end).split(',').map(escape).join('|');

      pattern += `(?:${body})`;
      i = end;
    } else {
      pattern += escape(char);
    }
  }

  return new RegExp(`^${pattern}$`);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isTestFile(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

export function dropTestFiles(
  scan: ScanResult,
  testFiles: string | string[] | undefined,
): ScanResult {
  const patterns = resolveTestFiles(testFiles).map(globToRegExp);

  return { ...scan, files: scan.files.filter((file) => !isTestFile(file.path, patterns)) };
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
