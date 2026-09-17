import { describe, expect, it } from 'vitest';

import { removeIgnoreGroup, restoreScript, reverseEdit, stripManagedSection } from './documents';

const START = '<!-- BLUEPRINT:START -->';
const END = '<!-- BLUEPRINT:END -->';

describe('stripManagedSection', () => {
  it('removes only the managed section and keeps surrounding content', () => {
    expect(stripManagedSection(`# Mine\n\n${START}\nbody\n${END}\n\nAfter.\n`))
      .toEqual({ status: 'stripped', text: '# Mine\n\n\nAfter.\n', empty: false });

    expect(stripManagedSection(`# Mine\n\n${START}\nbody\n${END}\n`))
      .toEqual({ status: 'stripped', text: '# Mine\n', empty: false });

    expect(stripManagedSection(`# Mine\r\n\r\n${START}\r\nbody\r\n${END}\r\n`))
      .toEqual({ status: 'stripped', text: '# Mine\r\n', empty: false });
  });

  it('drops only the line break that ended the section and collapses trailing blank lines', () => {
    expect(stripManagedSection(`# Mine\n${START}\nbody\n${END}After\nmore\n`))
      .toEqual({ status: 'stripped', text: '# Mine\nAfter\nmore\n', empty: false });

    expect(stripManagedSection(`# Mine\n\n\n\n${START}\nbody\n${END}\n`))
      .toEqual({ status: 'stripped', text: '# Mine\n', empty: false });

    expect(stripManagedSection(`\n\n${START}\nbody\n${END}\n`))
      .toEqual({ status: 'stripped', text: '\n', empty: true });
  });

  it('reports a file that held nothing but the section', () => {
    expect(stripManagedSection(`${START}\nbody\n${END}\n`)).toEqual({ status: 'stripped', text: '', empty: true });
    expect(stripManagedSection(`${START}\nbody\n${END}`)).toEqual({ status: 'stripped', text: '', empty: true });
  });

  it('distinguishes absent markers from broken ones', () => {
    expect(stripManagedSection('# Mine\n')).toEqual({ status: 'absent' });
    expect(stripManagedSection(`${END}\n`)).toEqual({ status: 'malformed' });
    expect(stripManagedSection(`${START}\n`)).toEqual({ status: 'malformed' });
    expect(stripManagedSection(`${START}\n${END}\n${START}\n${END}\n`)).toEqual({ status: 'malformed' });
  });
});

describe('reverseEdit', () => {
  it('replaces the unique inserted text with what it replaced', () => {
    expect(reverseEdit('a\n!docs\nb\n', { before: '', after: '!docs\n' }))
      .toEqual({ status: 'reversed', text: 'a\nb\n' });

    expect(reverseEdit('"lint": "tsc && eslint src"', { before: '', after: ' && eslint src' }))
      .toEqual({ status: 'reversed', text: '"lint": "tsc"' });
  });

  it('never guesses a missing, repeated, or deletion-only edit', () => {
    expect(reverseEdit('a\n', { before: '', after: '!docs\n' })).toEqual({ status: 'absent' });

    expect(reverseEdit('x x', { before: '', after: 'x' }))
      .toEqual({ status: 'ambiguous', occurrences: 2 });

    expect(reverseEdit('a\n', { before: 'gone', after: '' })).toEqual({ status: 'irreversible' });
  });
});

describe('restoreScript', () => {
  it('restores a changed value with the manifest indentation', () => {
    expect(restoreScript('{\n    "scripts": {\n        "lint": "tsc && eslint src"\n    }\n}\n', {
      name: 'lint', before: 'tsc', after: 'tsc && eslint src',
    })).toEqual({
      status: 'restored', text: '{\n    "scripts": {\n        "lint": "tsc"\n    }\n}\n',
    });
  });

  it('falls back to two-space indentation for a single-line manifest', () => {
    expect(restoreScript('{"scripts": {"lint": "tsc && eslint src"}}', {
      name: 'lint', before: 'tsc', after: 'tsc && eslint src',
    })).toEqual({ status: 'restored', text: '{\n  "scripts": {\n    "lint": "tsc"\n  }\n}\n' });
  });

  it('removes an added script and an emptied scripts object, keeping key order', () => {
    expect(restoreScript('{"name":"x","scripts":{"lint":"eslint src"},"private":true}', {
      name: 'lint', before: null, after: 'eslint src',
    })).toEqual({ status: 'restored', text: '{\n  "name": "x",\n  "private": true\n}\n' });

    expect(restoreScript('{"scripts":{"lint":"eslint src","build":"vite"}}', {
      name: 'lint', before: null, after: 'eslint src',
    })).toEqual({ status: 'restored', text: '{\n  "scripts": {\n    "build": "vite"\n  }\n}\n' });
  });

  it('treats the pre-Blueprint value as already reversed and anything else as diverged', () => {
    const record = { name: 'lint', before: 'tsc', after: 'tsc && eslint src' };

    expect(restoreScript('{"scripts":{"lint":"tsc"}}', record)).toEqual({ status: 'absent' });
    expect(restoreScript('{}', { ...record, before: null })).toEqual({ status: 'absent' });

    expect(restoreScript('{"scripts":{"lint":"vitest"}}', record))
      .toEqual({ status: 'diverged', current: 'vitest' });

    expect(restoreScript('{"scripts":{"lint":3}}', record))
      .toEqual({ status: 'diverged', current: null });

    expect(restoreScript('{', record)).toEqual({ status: 'unreadable' });
  });
});

describe('removeIgnoreGroup', () => {
  const comment = '# blueprint';

  it('removes the marked group, its exceptions, and the blank line before it', () => {
    expect(removeIgnoreGroup(`dist\n\n${comment}\n!a.md\n!b.md\n`, comment)).toBe('dist\n');
    expect(removeIgnoreGroup(`${comment}\r\n!a.md\r\nlogs\r\n`, comment)).toBe('logs\r\n');
    expect(removeIgnoreGroup(`dist\n${comment}\n`, comment)).toBe('dist\n');
    expect(removeIgnoreGroup(`${comment}  \n!a.md\n`, comment)).toBe('');
    expect(removeIgnoreGroup(`dist\n\n${comment}\n!a.md\n\nlogs\n`, comment)).toBe('dist\n\nlogs\n');
    expect(removeIgnoreGroup(`dist\n  ${comment}\n!a.md\n`, comment)).toBeNull();
  });

  it('returns null when the group is not there', () => {
    expect(removeIgnoreGroup('dist\n', comment)).toBeNull();
  });
});
