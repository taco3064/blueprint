import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ignoredArtifacts } from './ignored';

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
