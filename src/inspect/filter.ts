// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { resolveTestFiles } from '../emit/lint/patterns';
import type { ScanResult } from './types';

/**
 * Test files are exempt from structural analysis, symmetric with the lint side's
 * per-entry ignores — a co-located test reaching a sibling is plumbing.
 */

/**
 * Compile one glob (`**` / `*` / `?` / `{a,b}`) into an anchored RegExp. A `{`
 * with no `}` after it compiles as a literal brace rather than opening a group:
 * callers hand this lines from files blueprint does not own — a root
 * `.gitignore`, whose syntax has no brace expansion at all — so an unclosed one
 * is an ordinary path character, not an error to raise.
 */
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
    } else if (char === '{' && glob.includes('}', i)) {
      // Searched from the cursor, never from 0: `a}b{c` holds a `}` that closes
      // nothing, and a group opened on it walks the cursor backwards and never
      // terminates. Any `{` this guard turns away falls through to the literal.
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
