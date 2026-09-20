import { describe, expect, it } from 'vitest';

import { generatedFormattingNote } from './plan';
import type { Action } from './types';

function write(path: string, ownership?: 'generated' | 'section'): Action {
  return {
    kind: 'write',
    path,
    content: '',
    note: 'written' as never,
    ...(ownership ? { ownership } : {}),
  };
}

function noted(installed: string[], actions: Action[]): string {
  return generatedFormattingNote(installed, actions).map((action) => action.note).join('\n');
}

describe('generatedFormattingNote · which documents a formatter will fight', () => {
  it('names every Blueprint-owned Markdown and JSON document, whole-file or section', () => {
    const note = noted(['prettier'], [
      write('docs/handbook.md', 'generated'),
      write('CLAUDE.md', 'section'),
      write('.blueprint/state.json', 'generated'),
    ]);

    expect(note).toContain('docs/handbook.md');
    expect(note).toContain('CLAUDE.md');
    expect(note).toContain('.blueprint/state.json');
  });

  it('leaves out a document Blueprint writes but does not own', () => {
    expect(noted(['prettier'], [
      write('docs/handbook.md', 'generated'),
      write('README.md'),
    ])).not.toContain('README.md');
  });

  it('leaves out a path that only contains a document extension', () => {
    expect(noted(['prettier'], [
      write('docs/handbook.md', 'generated'),
      write('.cursor/rules/blueprint.mdc', 'generated'),
    ])).not.toContain('.mdc');
  });

  it('leaves out a document this plan removes rather than writes', () => {
    expect(noted(['prettier'], [
      write('docs/handbook.md', 'generated'),
      { kind: 'rm', path: 'AGENTS.md', note: 'stale' as never },
      { kind: 'instruct', note: 'nothing to format' as never },
    ])).not.toContain('AGENTS.md');
  });
});

describe('generatedFormattingNote · when nothing would fight', () => {
  it('says nothing when no formatter is installed', () => {
    expect(generatedFormattingNote(
      ['eslint', 'vite'],
      [write('docs/handbook.md', 'generated')],
    )).toEqual([]);
  });

  it('says nothing when the plan owns no formattable document', () => {
    expect(generatedFormattingNote(['prettier'], [
      write('eslint.config.mjs', 'generated'),
      write('README.md'),
      { kind: 'instruct', note: 'nothing to format' as never },
    ])).toEqual([]);
  });

  it('says nothing about an empty plan', () => {
    expect(generatedFormattingNote(['prettier'], [])).toEqual([]);
  });
});

describe.each(['prettier', '@biomejs/biome', 'oxfmt', 'dprint'])(
  'generatedFormattingNote · %s',
  (formatter) => {
    it('is recognised as the installed formatter', () => {
      expect(noted([formatter], [write('docs/handbook.md', 'generated')])).toContain(formatter);
    });
  },
);
