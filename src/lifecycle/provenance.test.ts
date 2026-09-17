import { describe, expect, it } from 'vitest';

import { digest, forgetPaths, mergeProvenance, parseProvenance } from './provenance';
import type { ProvenanceRecord } from './types';

describe('provenance records', () => {
  it('digests content with sha256', () => {
    expect(digest('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it.each([
    { kind: 'generated', path: 'docs/architecture-handbook.md' },
    { kind: 'created', path: 'jsconfig.json', sha256: 'abc' },
    { kind: 'section', path: 'CLAUDE.md', created: false },
    { kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' },
    { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
    {
      kind: 'script', path: 'package.json', name: 'lint', before: 'tsc', after: 'tsc && eslint src',
    },
    { kind: 'directory', path: 'src/pages' },
    { kind: 'dependency', name: 'eslint' },
  ])('parses %j', (record) => {
    expect(parseProvenance([record])).toEqual([record]);
  });

  it.each([
    'not a list',
    [null],
    [{ kind: 'unknown', path: 'x' }],
    [{ kind: 'toString', path: 'x' }],
    [{ kind: 'generated' }],
    [{ kind: 'created', path: 'x' }],
    [{ kind: 'section', path: 'x', created: 'no' }],
    [{ kind: 'edit', path: 'x', before: 1, after: '' }],
    [{ kind: 'edit', path: 'x', before: '', after: 1 }],
    [{ kind: 'script', path: 'x', name: 'lint', before: 1, after: 'y' }],
    [{ kind: 'script', path: 'x', name: 'lint', before: null }],
    [{ kind: 'script', path: 'x', before: null, after: 'y' }],
    [{ kind: 'directory', path: 3 }],
    [{ kind: 'dependency' }],
  ])('rejects %j', (value) => {
    expect(parseProvenance(value)).toBeNull();
  });
});

describe('mergeProvenance', () => {
  it('adds new targets and keeps the first whole-file record for an existing target', () => {
    const existing: ProvenanceRecord[] = [
      { kind: 'created', path: 'jsconfig.json', sha256: 'first' },
      { kind: 'generated', path: 'docs/a.md' },
      { kind: 'dependency', name: 'eslint' },
    ];

    expect(mergeProvenance(existing, [
      { kind: 'created', path: 'jsconfig.json', sha256: 'second' },
      { kind: 'generated', path: 'docs/a.md' },
      { kind: 'generated', path: 'docs/b.md' },
      { kind: 'dependency', name: 'eslint' },
      { kind: 'dependency', name: 'typescript-eslint' },
      { kind: 'directory', path: 'src/pages' },
    ])).toEqual([
      ...existing,
      { kind: 'generated', path: 'docs/b.md' },
      { kind: 'dependency', name: 'typescript-eslint' },
      { kind: 'directory', path: 'src/pages' },
    ]);
  });

  it('remembers that Blueprint created a shared document across later refreshes', () => {
    expect(mergeProvenance(
      [{ kind: 'section', path: 'CLAUDE.md', created: true }],
      [{ kind: 'section', path: 'CLAUDE.md', created: false }],
    )).toEqual([{ kind: 'section', path: 'CLAUDE.md', created: true }]);

    expect(mergeProvenance(
      [{ kind: 'section', path: 'AGENTS.md', created: false }],
      [{ kind: 'section', path: 'AGENTS.md', created: false }],
    )).toEqual([{ kind: 'section', path: 'AGENTS.md', created: false }]);
  });

  it('chains consecutive script edits back to the original value', () => {
    expect(mergeProvenance(
      [{ kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' }],
      [{
        kind: 'script',
        path: 'package.json',
        name: 'lint',
        before: 'eslint src',
        after: 'eslint app',
      }],
    )).toEqual([
      { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint app' },
    ]);
  });

  it('restarts a script record when the value changed outside Blueprint in between', () => {
    expect(mergeProvenance(
      [
        { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
        { kind: 'script', path: 'apps/package.json', name: 'lint', before: null, after: 'x' },
        { kind: 'script', path: 'package.json', name: 'test', before: null, after: 'x' },
      ],
      [{
        kind: 'script',
        path: 'package.json',
        name: 'lint',
        before: 'tsc',
        after: 'tsc && eslint src',
      }],
    )[0]).toEqual({
      kind: 'script', path: 'package.json', name: 'lint', before: 'tsc', after: 'tsc && eslint src',
    });
  });

  it('appends distinct text edits and drops exact duplicates', () => {
    const edit: ProvenanceRecord = { kind: 'edit', path: '.gitignore', before: '', after: '!a\n' };

    expect(mergeProvenance([edit], [
      edit,
      { kind: 'edit', path: '.gitignore', before: '', after: '!b\n' },
      { kind: 'edit', path: '.gitignore', before: 'x', after: '!a\n' },
      { kind: 'edit', path: 'other', before: '', after: '!a\n' },
    ])).toEqual([
      edit,
      { kind: 'edit', path: '.gitignore', before: '', after: '!b\n' },
      { kind: 'edit', path: '.gitignore', before: 'x', after: '!a\n' },
      { kind: 'edit', path: 'other', before: '', after: '!a\n' },
    ]);
  });

  it('forgets path records Blueprint removed, keeping dependencies', () => {
    expect(forgetPaths([
      { kind: 'generated', path: 'CLAUDE.md' },
      { kind: 'generated', path: 'AGENTS.md' },
      { kind: 'dependency', name: 'eslint' },
    ], ['CLAUDE.md'])).toEqual([
      { kind: 'generated', path: 'AGENTS.md' },
      { kind: 'dependency', name: 'eslint' },
    ]);
  });
});
