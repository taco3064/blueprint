import { describe, expect, it } from 'vitest';

import { renderVerdict } from './authoring-verdict';

const facts = {
  claudeDir: { hadDir: false, otherCommands: 0, commandFile: '.claude/commands/blueprint.md' },
  viteTs: null,
  tscOut: null,
  commands: { build: 'npm run build', lint: 'npm run lint' },
  topology: 'module-first' as const,
  claudeLauncher: false,
};

const empty = { scopeRequired: false, totalFiles: 0 };

describe('renderVerdict · proven-empty module-first', () => {
  it('returns the runway verdict only when the application is known not to be Next.js', () => {
    const verdict = renderVerdict(empty, { ...facts, next: false });

    expect(verdict).toContain('## Read this first — this application is proven-empty');
    expect(verdict).not.toContain('## Read this first — module-first was selected');
  });

  it.each([
    ['a Next.js application', { ...facts, next: true }],
    ['a caller that does not state next', facts],
  ])('keeps module-first authoring for %s', (_, input) => {
    const verdict = renderVerdict(empty, input);

    expect(verdict).toContain('## Read this first — module-first was selected');
    expect(verdict).not.toContain('this application is proven-empty');
  });

  it('keeps module-first authoring for existing source', () => {
    expect(renderVerdict({ scopeRequired: false, totalFiles: 4 }, { ...facts, next: false }))
      .toContain('## Read this first — module-first was selected');
  });
});
