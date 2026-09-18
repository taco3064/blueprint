import { describe, expect, it } from 'vitest';

import { PREVIEW_LINES, preview, project, type DiscussionNode } from './projection';

const node = (overrides: Partial<DiscussionNode>): DiscussionNode => ({
  number: 1,
  title: 'Title',
  bodyText: 'First line\nSecond line\nThird line\nFourth line',
  url: 'https://github.com/taco3064/blueprint/discussions/1',
  createdAt: '2026-09-15T00:00:00Z',
  updatedAt: '2026-09-15T00:00:00Z',
  ...overrides,
});

describe('preview', () => {
  it('takes exactly the first three lines', () => {
    expect(PREVIEW_LINES).toBe(3);
    expect(preview('Title', 'one\ntwo\nthree\nfour\nfive')).toEqual(['one', 'two', 'three']);
  });

  it('skips a leading line that repeats the title, as GitHub bodyText does', () => {
    const title = 'Not a folder rename: SKY-1945 Layer-first ↔ Module-first with Blueprint';

    expect(preview(title, `${title}\n\nThe same application.\n\nThe result.\nSHA:\n48ef346`))
      .toEqual(['The same application.', 'The result.', 'SHA:']);
  });

  it('compares the title ignoring case and whitespace runs', () => {
    expect(preview('A  Title', '  a title \nbody')).toEqual(['body']);
  });

  it('keeps a title repeated anywhere but the first meaningful line', () => {
    expect(preview('Title', 'Intro\nTitle\nMore')).toEqual(['Intro', 'Title', 'More']);
  });

  it('keeps a first line that only starts like the title', () => {
    expect(preview('Title', 'Title and more\nbody')).toEqual(['Title and more', 'body']);
  });

  it('drops blank, whitespace-only, and symbol-only lines', () => {
    expect(preview('Title', '\n   \n---\n→\n| |\none\r\n\r\n\ttwo  \n***\nthree'))
      .toEqual(['one', 'two', 'three']);
  });

  it('treats a symbol-only line before the title as noise, so the title is still skipped', () => {
    expect(preview('Title', '---\nTitle\nbody')).toEqual(['body']);
  });

  it('counts digits and non-Latin letters as meaningful', () => {
    expect(preview('Title', '2026\n實證\n—')).toEqual(['2026', '實證']);
  });

  it('collapses whitespace inside a line', () => {
    expect(preview('Title', 'a \t  b')).toEqual(['a b']);
  });

  it('returns fewer lines when the body has fewer', () => {
    expect(preview('Title', 'Title\nonly')).toEqual(['only']);
    expect(preview('Title', 'Title')).toEqual([]);
    expect(preview('Title', '')).toEqual([]);
  });
});

describe('project', () => {
  it('orders newest-created first regardless of GitHub order', () => {
    const projected = project([
      node({ number: 1, createdAt: '2026-01-01T00:00:00Z' }),
      node({ number: 3, createdAt: '2026-03-01T00:00:00Z' }),
      node({ number: 2, createdAt: '2026-02-01T00:00:00Z' }),
    ]);

    expect(projected.map((item) => item.number)).toEqual([3, 2, 1]);
  });

  it('breaks a creation-time tie by the higher discussion number', () => {
    const projected = project([
      node({ number: 5, createdAt: '2026-01-01T00:00:00Z' }),
      node({ number: 9, createdAt: '2026-01-01T00:00:00Z' }),
    ]);

    expect(projected.map((item) => item.number)).toEqual([9, 5]);
  });

  it('keeps every node and returns only the public projection', () => {
    const projected = project([
      node({ number: 7, title: 'Seven', bodyText: 'Seven\nsecret body a\nb\nc\nd' }),
    ]);

    expect(projected).toEqual([{
      number: 7,
      title: 'Seven',
      preview: ['secret body a', 'b', 'c'],
      url: 'https://github.com/taco3064/blueprint/discussions/1',
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    }]);

    expect(JSON.stringify(projected)).not.toContain('bodyText');
  });

  it('returns an empty list for no discussions', () => {
    expect(project([])).toEqual([]);
  });
});
