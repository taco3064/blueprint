import fs from 'node:fs';
import path from 'node:path';

import { globToRegExp } from '../inspect/filter';

/**
 * Best-effort root-`.gitignore` matching — enough to warn when init's own
 * artifacts (the handbook the contract links to, the contract files) are
 * invisible to version control. Reads only the root `.gitignore`; nested
 * ignore files and exotic patterns are out of scope: a false negative costs
 * one missing heads-up, never a wrong write.
 */

interface IgnoreRule {
  negate: boolean;
  matches: (relPath: string) => boolean;
}

/**
 * Exported for its own tests, because the decision it makes is invisible from
 * outside. A blank line's glob is `**\/`, which compiles to `^(?:.*\/)?$` and
 * matches only the empty string; a comment's is the comment text taken literally.
 * So letting either through as a rule changes nothing an artifact list can see —
 * `ignoredArtifacts` answers the same either way, and every guard in here reads as
 * dead weight when measured only through it. The guards are real; the aggregate
 * was the wrong place to ask.
 */
export function toRule(line: string): IgnoreRule | null {
  // The trim is also what makes a CRLF .gitignore work. The caller splits on
  // `\n`, so on Windows every line arrives with a trailing `\r`, and a pattern
  // carrying one matches nothing — the artifact detection would go quiet on the
  // platform where a .gitignore is CRLF by default. Removing this as redundant
  // takes that with it, silently.
  let pattern = line.trim();

  if (!pattern || pattern.startsWith('#')) return null;

  const negate = pattern.startsWith('!');

  if (negate) pattern = pattern.slice(1);

  const dirOnly = pattern.endsWith('/');

  if (dirOnly) pattern = pattern.slice(0, -1);

  // A slash anywhere (after trimming) anchors the pattern to the repo root;
  // otherwise it matches at any depth. A LEADING slash is not a second case to
  // test for: it is a slash, so `includes` has already answered — spelling it out
  // as `startsWith('/') || includes('/')` made the first half undecidable, since
  // no pattern can start with a slash and not contain one.
  const anchored = pattern.includes('/');
  const body = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  const glob = anchored ? body : `**/${body}`;

  const self = globToRegExp(glob);
  const descendants = globToRegExp(`${glob}/**`);

  return {
    negate,
    matches: (relPath) => (!dirOnly && self.test(relPath)) || descendants.test(relPath),
  };
}

/** Paths (among `candidates`) the root `.gitignore` hides — last match wins. */
export function ignoredArtifacts(root: string, candidates: string[]): string[] {
  let text: string;

  try {
    text = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  } catch {
    return [];
  }

  const rules = text
    .split('\n')
    .map(toRule)
    .filter((rule): rule is IgnoreRule => rule !== null);

  return candidates.filter((candidate) => {
    const rel = candidate.split(path.sep).join('/');
    let ignored = false;

    for (const rule of rules) {
      if (rule.matches(rel)) ignored = !rule.negate;
    }

    return ignored;
  });
}
