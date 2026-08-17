import ignore from 'ignore';
import type { Ignore } from 'ignore';
import { Minimatch } from 'minimatch';
import type { IMinimatch, IOptions } from 'minimatch';

// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { resolveTestFiles } from '../emit/lint/patterns';
import type { ScanResult } from './types';

/**
 * The two matchers ESLint itself uses, so `inspect` cannot answer a question
 * about a glob differently from the config `emitLint` writes.
 *
 * One blueprint reaches ESLint through two libraries with two grammars.
 * `no-restricted-imports` matches a `patterns[].group` with the `ignore`
 * package — gitignore semantics, case-insensitive by default, unanchored when
 * the pattern carries no `/`. A config entry's `files` / `ignores` is matched by
 * minimatch through `@eslint/config-array` — anchored, case-sensitive,
 * brace-expanding, and for `ignores` an ORDERED list where a later `!` entry
 * re-includes what an earlier entry excluded. Both libraries are devDependencies
 * bundled into `dist`, so this is the real thing rather than a model of it, and
 * `package.json` still declares no runtime dependency.
 *
 * Test files are exempt from structural analysis, symmetric with the lint side's
 * per-entry ignores — a co-located test reaching a sibling is plumbing.
 */

/**
 * `@eslint/config-array`'s own minimatch options, verbatim. Its
 * `@types/minimatch` predates `allowWindowsEscape` and `flipNegate`, which
 * minimatch 3.1 reads and the config array passes.
 */
type MatchOptions = IOptions & { allowWindowsEscape?: boolean; flipNegate?: boolean };

const MINIMATCH_OPTIONS: MatchOptions = { dot: true, allowWindowsEscape: true };

const matchers = new Map<string, IMinimatch>();
const negatedMatchers = new Map<string, IMinimatch>();
const groups = new Map<string, Ignore>();

/**
 * One compiled minimatch, cached per pattern — the same two caches
 * `@eslint/config-array` keeps, because a negated pattern compiles differently
 * under `flipNegate` and would otherwise collide with its own plain form.
 */
function compiled(pattern: string, flipNegate: boolean): IMinimatch {
  const cache = flipNegate ? negatedMatchers : matchers;
  const hit = cache.get(pattern);

  if (hit) {
    return hit;
  }

  const options = flipNegate ? { ...MINIMATCH_OPTIONS, flipNegate } : MINIMATCH_OPTIONS;
  const made = new Minimatch(pattern, options);

  cache.set(pattern, made);

  return made;
}

/**
 * A leading `./` off a pattern, as the config array strips it once at
 * normalization time — so `./src/**` and `src/**` are one pattern here too.
 */
function normalizePattern(pattern: string): string {
  if (pattern.startsWith('./')) {
    return pattern.slice(2);
  }

  return pattern.startsWith('!./') ? `!${pattern.slice(3)}` : pattern;
}

/**
 * Whether one `files` glob matches a repo-relative path — `pathMatches`' own
 * `doMatch`, which is what decides whether a config entry governs a file at all.
 */
export function fileGlobMatches(glob: string, path: string): boolean {
  return compiled(normalizePattern(glob), false).match(path);
}

/**
 * Whether an `ignores` LIST ignores a path — `shouldIgnorePath`'s reduce, not a
 * `.some()` over the entries.
 *
 * The difference is the whole reason this is a list function: `ignores` is
 * ordered, and a later `!` entry re-includes what an earlier entry excluded.
 * `['**\/*.gen.ts', '!src/keep.gen.ts']` ignores one and not the other, which no
 * per-entry test can express. A negation is skipped while nothing has matched
 * yet, and once something has, only negations are consulted.
 */
export function ignoresFile(globs: string[], path: string): boolean {
  return globs.reduce<boolean>((ignored, glob) => {
    const pattern = normalizePattern(glob);
    const negated = pattern.startsWith('!');

    if (!ignored) {
      // Not ignored yet, so a negation has nothing to re-include.
      return negated ? false : compiled(pattern, false).match(path);
    }

    return negated ? !compiled(pattern, true).match(path) : ignored;
  }, false);
}

/**
 * Whether a `no-restricted-imports` group reaches an import specifier — the
 * rule's own `ignore` instance, built with the options it builds one with.
 *
 * `allowRelativePaths` because a specifier may be `./x`, and `ignorecase: true`
 * because the rule passes `ignorecase: !caseSensitive` and its schema leaves
 * `caseSensitive` undefined — so owning `axios` reaches an import of `AXIOS`.
 * The whole group goes in at once, as the rule adds it, which is what gives a
 * multi-entry group its gitignore ordering.
 */
export function groupReaches(group: string[], specifier: string): boolean {
  // Serialized rather than joined: `ignore` splits a multi-line STRING into
  // separate rules but keeps a multi-line array ENTRY whole, so `['a\nb']` and
  // `['a', 'b']` are two different rule sets that a newline join would collide.
  const key = JSON.stringify(group);
  const hit = groups.get(key);

  if (hit) {
    return hit.ignores(specifier);
  }

  const made = ignore({ allowRelativePaths: true, ignorecase: true }).add(group);

  groups.set(key, made);

  return made.ignores(specifier);
}

/**
 * Compile one glob (`**` / `*` / `?` / `{a,b}`) into an anchored RegExp.
 *
 * Not an ESLint matcher, and no longer used as one: its only caller is
 * `bootstrap/ignored.ts`, which reads real `.gitignore` lines and does its own
 * anchoring, negation and directory handling around this.
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

/** A scan with every test file removed, per `architecture.testFiles`. */
export function dropTestFiles(
  scan: ScanResult,
  testFiles: string | string[] | undefined,
): ScanResult {
  const globs = resolveTestFiles(testFiles);

  return { ...scan, files: scan.files.filter((file) => !ignoresFile(globs, file.path)) };
}
