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
 * Compile one file glob (`**` / `*` / `?` / `{a,b}`) into an anchored RegExp —
 * the matcher ESLint gives a config entry's `files` / `ignores`, which is
 * minimatch: anchored at the base, case-sensitive, and file-by-file. Measured
 * against ESLint 9.39: an `ignores` of `src/legacy` exempts a file *named*
 * `src/legacy` and nothing under `src/legacy/`, so there is no descendant reach
 * to add here.
 */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${wildcards(glob, true)}$`);
}

/**
 * Compile one package glob into a RegExp over import specifiers — the OTHER
 * matcher, the one `no-restricted-imports` gives a `patterns[].group`. It is
 * the `ignore` package, and three of its answers differ from the file matcher
 * above; each measured against ESLint 9.39 rather than read off the docs.
 *
 * The rule passes `ignorecase: !caseSensitive` and defaults `caseSensitive` to
 * false, so `FOO*` flags `fooxyz`. A group with no `/` is unanchored, because
 * gitignore matches such a pattern against every path segment — so `foo*` flags
 * `@scope/foo`. And a match reaches everything under it, so `@scope/*` flags
 * `@scope/foo/bar`.
 *
 * `{a,b}` stays literal here on purpose: gitignore has no brace expansion, and
 * `validateOwns` refuses the form rather than letting the two engines split.
 */
export function packageGlobToRegExp(glob: string): RegExp {
  // Unanchored is the gitignore rule for a slashless pattern, not a widening.
  const anywhere = glob.includes('/') ? '' : '(?:.*/)?';

  return new RegExp(`^${anywhere}${wildcards(glob, false)}(?:/.*)?$`, 'i');
}

/**
 * The star grammar both matchers share, as a RegExp source fragment. `braces`
 * is the one place they part: minimatch expands `{a,b}`, gitignore does not.
 */
function wildcards(glob: string, braces: boolean): string {
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
    } else if (char === '{' && braces) {
      const end = glob.indexOf('}', i);
      const body = glob.slice(i + 1, end).split(',').map(escape).join('|');

      pattern += `(?:${body})`;
      i = end;
    } else {
      pattern += escape(char);
    }
  }

  return pattern;
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
