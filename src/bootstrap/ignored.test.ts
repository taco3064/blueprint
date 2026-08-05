import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ignoredArtifacts, toRule } from './ignored';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ignored-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function gitignore(lines: string[]): void {
  fs.writeFileSync(path.join(root, '.gitignore'), lines.join('\n'));
}

describe('ignoredArtifacts', () => {
  it('returns nothing without a .gitignore', () => {
    expect(ignoredArtifacts(root, ['CLAUDE.md'])).toEqual([]);
  });

  it('trims each line before reading it as a pattern', () => {
    // Trailing whitespace is invisible in an editor and ordinary in a
    // hand-edited file. Left on, it becomes part of the glob and matches
    // nothing — the heads-up about an invisible artifact goes missing.
    gitignore(['  docs  ']);

    expect(ignoredArtifacts(root, ['docs/architecture-handbook.md']))
      .toEqual(['docs/architecture-handbook.md']);
  });

  it('skips blank lines and comments instead of reading them as globs', () => {
    gitignore(['', '# just a note', 'unrelated.txt', '']);

    expect(ignoredArtifacts(root, ['CLAUDE.md', 'docs/handbook.md'])).toEqual([]);
  });

  it('anchors a pattern that holds a slash anywhere, not only at the front', () => {
    // `docs/api` is anchored to the repo root. Only a pattern with no slash at
    // all matches at any depth — unanchored, this would also claim a nested
    // `sub/docs/api`, and init would warn about a file git can see.
    gitignore(['docs/api']);

    expect(ignoredArtifacts(root, ['docs/api/x.md', 'sub/docs/api/y.md']))
      .toEqual(['docs/api/x.md']);
  });

  it('matches basenames at any depth, anchored paths, and directory patterns', () => {
    gitignore(['# comment', '', 'CLAUDE.md', '/docs/architecture-handbook.md', 'dist/']);

    expect(
      ignoredArtifacts(root, [
        'CLAUDE.md',
        'nested/CLAUDE.md',
        'docs/architecture-handbook.md',
        'docs/other.md',
        'dist/bundle.js',
        'AGENTS.md',
      ]),
    ).toEqual(['CLAUDE.md', 'nested/CLAUDE.md', 'docs/architecture-handbook.md', 'dist/bundle.js']);
  });

  it('covers whole ignored directories and honors negation (last match wins)', () => {
    gitignore(['docs', '!docs/architecture-handbook.md']);

    expect(
      ignoredArtifacts(root, ['docs/architecture-handbook.md', 'docs/notes.md']),
    ).toEqual(['docs/notes.md']);
  });

  it('supports wildcards in patterns', () => {
    gitignore(['*.blueprint.md']);

    expect(ignoredArtifacts(root, ['CLAUDE.blueprint.md', 'CLAUDE.md'])).toEqual([
      'CLAUDE.blueprint.md',
    ]);
  });
});

describe('toRule · the line-level decisions the artifact list cannot see', () => {
  // Measured through `ignoredArtifacts`, every guard in here looks inert: a blank
  // line's glob is `**/` — `^(?:.*\/)?$`, which matches only the empty string —
  // and a comment's glob is its own text taken literally. Both match no artifact,
  // so admitting them as rules changes nothing the aggregate reports. The guards
  // are still the difference between reading a .gitignore and guessing at it.
  it('refuses a blank line and a comment, and accepts an ordinary pattern', () => {
    expect(toRule('')).toBeNull();
    expect(toRule('   ')).toBeNull();
    expect(toRule('# a note')).toBeNull();
    expect(toRule('dist')).not.toBeNull();
  });

  it('reads the "#" at the front, not wherever it appears', () => {
    // `#` is legal in a filename. Testing the wrong end drops a real pattern
    // silently — and this is the ONLY way to see it: as a rule, `report#` is
    // simply absent, and an absent rule reports nothing either way.
    const rule = toRule('report#');

    expect(rule).not.toBeNull();
    expect(rule?.matches('report#')).toBe(true);
  });

  it('keeps the trailing-whitespace trim that a CRLF .gitignore depends on', () => {
    // The caller splits on `\n`, so on Windows every line arrives with a `\r`.
    expect(toRule('dist\r')?.matches('dist/app.js')).toBe(true);
  });

  it('marks a negation and strips its "!" from the pattern', () => {
    const rule = toRule('!keep.md');

    expect(rule?.negate).toBe(true);
    expect(rule?.matches('keep.md')).toBe(true);
  });

  it('a directory-only pattern matches what is inside it, not the name itself', () => {
    const rule = toRule('dist/');

    expect(rule?.matches('dist')).toBe(false);
    expect(rule?.matches('dist/app.js')).toBe(true);
  });
});
