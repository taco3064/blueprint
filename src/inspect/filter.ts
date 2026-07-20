import { resolveTestFiles } from '../emit/lint';
import type { ScanResult } from './types';

/**
 * Test files are exempt from structural analysis, symmetric with the lint
 * side's per-entry ignores — a co-located `Foo.test.js` importing its sibling
 * through the alias is test plumbing, not an architecture violation.
 */

/** Compile one glob (`**` / `*` / `?` / `{a,b}`) into an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        // `**/` spans any number of directories (including none); a bare
        // `**` matches anything.
        pattern += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else if (char === '{') {
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

/** True when `path` matches any of the test-file globs. */
export function isTestFile(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

/** A scan with every test file removed, per `architecture.testFiles`. */
export function dropTestFiles(
  scan: ScanResult,
  testFiles: string | string[] | undefined,
): ScanResult {
  const patterns = resolveTestFiles(testFiles).map(globToRegExp);

  return { ...scan, files: scan.files.filter((file) => !isTestFile(file.path, patterns)) };
}
