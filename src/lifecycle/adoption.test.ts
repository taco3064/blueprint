import { describe, expect, it } from 'vitest';

import { adoptionProvenance } from './adoption';
import { digest } from './provenance';

describe('adoptionProvenance', () => {
  it('classifies generated, managed, created, and edited writes', () => {
    expect(adoptionProvenance([
      {
        kind: 'write',
        path: 'docs/architecture-handbook.md',
        content: 'x',
        before: 'old',
        ownership: 'generated',
      },
      { kind: 'write', path: 'CLAUDE.md', content: 'x', before: null, ownership: 'section' },
      { kind: 'write', path: 'AGENTS.md', content: 'x', before: '# mine\n', ownership: 'section' },
      { kind: 'write', path: 'jsconfig.json', content: '{}\n', before: null },
      { kind: 'write', path: '.gitignore', content: 'dist\n!docs\n', before: 'dist\n' },
    ])).toEqual({
      records: [
        { kind: 'generated', path: 'docs/architecture-handbook.md' },
        { kind: 'section', path: 'CLAUDE.md', created: true },
        { kind: 'section', path: 'AGENTS.md', created: false },
        { kind: 'created', path: 'jsconfig.json', sha256: digest('{}\n') },
        { kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' },
      ],
      removed: [],
    });
  });

  it('records package script changes as reversible values, including reformatted manifests', () => {
    expect(adoptionProvenance([
      {
        kind: 'write',
        path: 'apps/web/package.json',
        content: JSON.stringify(
          { scripts: { lint: 'eslint src', build: 'vite', test: 'x' } },
          null,
          2,
        ),
        before: '{"scripts":{"build":"vite","test":"old","count":3}}',
      },
      { kind: 'write', path: 'package.json', content: '{"name":"x"}', before: '{"name":"x"}' },
      { kind: 'write', path: 'package.json', content: '{"scripts":null}', before: '{}' },
    ]).records).toEqual([
      {
        kind: 'script',
        path: 'apps/web/package.json',
        name: 'lint',
        before: null,
        after: 'eslint src',
      },
      { kind: 'script', path: 'apps/web/package.json', name: 'test', before: 'old', after: 'x' },
    ]);
  });

  it('falls back to text edits when a manifest cannot be parsed', () => {
    expect(adoptionProvenance([
      {
        kind: 'write',
        path: 'package.json',
        content: '{ broken, "lint": 1 }',
        before: '{ broken }',
      },
      { kind: 'write', path: 'package.json', content: '"text"', before: '{"scripts":{}}' },
      { kind: 'write', path: 'package.json', content: '{"scripts":"x"}', before: '{}' },
    ]).records).toEqual([
      { kind: 'edit', path: 'package.json', before: '', after: ', "lint": 1' },
      { kind: 'edit', path: 'package.json', before: '{"scripts":{}}', after: '"text"' },
      { kind: 'edit', path: 'package.json', before: '', after: '"scripts":"x"' },
    ]);
  });

  it('records directories, installed dependencies, and removed paths', () => {
    expect(adoptionProvenance([
      { kind: 'mkdir', path: 'src/pages' },
      { kind: 'install', dependencies: ['eslint', '@kekkai/blueprint'] },
      { kind: 'rm', path: 'GEMINI.md' },
    ])).toEqual({
      records: [
        { kind: 'directory', path: 'src/pages' },
        { kind: 'dependency', name: 'eslint' },
        { kind: 'dependency', name: '@kekkai/blueprint' },
      ],
      removed: ['GEMINI.md'],
    });
  });
});
