import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { digest } from '../lifecycle';
import type { ProvenanceRecord } from '../lifecycle';
import { renderAgentHeader } from '../operational-contract';
import { GENERATED_ESLINT_BANNER } from '../project';
import { recordedRemoval } from './recorded';
import { carriesBlueprintSignature, HANDBOOK_MARK } from './signatures';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-recorded-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

type AliasProbe = (file: string) => string | null;

function removal(records: ProvenanceRecord[], aliasInUse: AliasProbe = () => null) {
  return recordedRemoval({ root, prefix: 'apps/web', records, aliasInUse });
}

describe('carriesBlueprintSignature', () => {
  it('recognizes each generated signature only where Blueprint writes it', () => {
    expect(carriesBlueprintSignature(`${GENERATED_ESLINT_BANNER}\nexport default [];\n`)).toBe(true);
    expect(carriesBlueprintSignature(`# Handbook\n\n${HANDBOOK_MARK}\n`)).toBe(true);
    expect(carriesBlueprintSignature(`---\n---\n${renderAgentHeader()}\n`)).toBe(true);
    expect(carriesBlueprintSignature(`export default [];\n${GENERATED_ESLINT_BANNER}`)).toBe(false);
    expect(carriesBlueprintSignature('# Written by hand\n')).toBe(false);
  });
});

describe('recordedRemoval', () => {
  it('ignores records whose files are already gone', () => {
    expect(removal([
      { kind: 'generated', path: 'docs/handbook.md' },
      { kind: 'created', path: 'jsconfig.json', sha256: 'x' },
      { kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' },
      { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
      { kind: 'directory', path: 'src/pages' },
      { kind: 'dependency', name: 'eslint' },
    ])).toEqual({ actions: [], conflicts: [], residues: [] });
  });

  it('keeps alias wiring that application source still imports', () => {
    write('tsconfig.json', '{"compilerOptions":{"paths":{"~app/*":["./src/*"]}}}');
    write('jsconfig.json', '{}');

    expect(removal([
      { kind: 'edit', path: 'tsconfig.json', before: '', after: '"paths":{"~app/*":["./src/*"]}' },
      { kind: 'created', path: 'jsconfig.json', sha256: digest('{}') },
    ], (file) => file.endsWith('.json') ? '~app' : null)).toEqual({
      actions: [],
      conflicts: [],
      residues: [
        { kind: 'required-by-source', path: 'apps/web/jsconfig.json', alias: '~app' },
        { kind: 'required-by-source', path: 'apps/web/tsconfig.json', alias: '~app' },
      ],
    });
  });

  it('reverses what remains, skips what is already reversed, and reports what cannot be '
    + 'located', () => {
    write('.gitignore', 'dist\n!docs\n');

    expect(removal([
      { kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' },
      { kind: 'edit', path: '.gitignore', before: '', after: '!gone\n' },
      { kind: 'edit', path: '.gitignore', before: 'lost', after: '' },
    ])).toEqual({
      actions: [{ kind: 'write', path: 'apps/web/.gitignore', content: 'dist\n', reason: 'edit' }],
      conflicts: [{ kind: 'irreversible-edit', path: 'apps/web/.gitignore' }],
      residues: [],
    });
  });
});

describe('recordedRemoval · composed ownership', () => {
  it('deletes a file Blueprint created once its later Blueprint edits are reversed', () => {
    write('jsconfig.json', '{"paths":{"~app/*":["./src/*"]}}');
    write('tsconfig.json', '{"strict":true,"paths":{}}');

    expect(removal([
      { kind: 'created', path: 'jsconfig.json', sha256: digest('{}') },
      { kind: 'edit', path: 'jsconfig.json', before: '', after: '"paths":{"~app/*":["./src/*"]}' },
      { kind: 'created', path: 'tsconfig.json', sha256: digest('{}') },
      { kind: 'edit', path: 'tsconfig.json', before: '', after: ',"paths":{}' },
    ])).toEqual({
      actions: [
        { kind: 'delete', path: 'apps/web/jsconfig.json', reason: 'created' },
        {
          kind: 'write',
          path: 'apps/web/tsconfig.json',
          content: '{"strict":true}',
          reason: 'edit',
        },
      ],
      conflicts: [],
      residues: [{ kind: 'modified', path: 'apps/web/tsconfig.json' }],
    });
  });

  it('reverses a managed section in a recorded file and deletes it only when Blueprint '
    + 'created it', () => {
    const section = '<!-- BLUEPRINT:START -->\npointer\n<!-- BLUEPRINT:END -->\n';

    write('docs/NOTES.md', section);
    write('AGENTS.md', `# House rules\n\n${section}`);
    write('CLAUDE.md', section);
    write('GEMINI.md', '<!-- BLUEPRINT:START -->\nbroken\n');
    write('COPILOT.md', '# Already cleaned by hand\n');

    expect(removal([
      { kind: 'section', path: 'docs/NOTES.md', created: true },
      { kind: 'section', path: 'AGENTS.md', created: false },
      { kind: 'section', path: 'CLAUDE.md', created: false },
      { kind: 'section', path: 'GEMINI.md', created: true },
      { kind: 'section', path: 'gone.md', created: true },
      { kind: 'section', path: 'COPILOT.md', created: true },
    ])).toEqual({
      actions: [
        { kind: 'delete', path: 'apps/web/docs/NOTES.md', reason: 'section' },
        {
          kind: 'write',
          path: 'apps/web/AGENTS.md',
          content: '# House rules\n',
          reason: 'section',
        },
        { kind: 'write', path: 'apps/web/CLAUDE.md', content: '', reason: 'section' },
      ],
      conflicts: [{ kind: 'malformed-section', path: 'apps/web/GEMINI.md' }],
      residues: [{ kind: 'emptied', path: 'apps/web/CLAUDE.md' }],
    });
  });

  it('deletes unchanged or signed files and reports changed or unsigned ones', () => {
    write('eslint.config.mjs', `${GENERATED_ESLINT_BANNER}\nexport default [];\n`);
    write('docs/handbook.md', '# Rewritten by the team\n');
    write('jsconfig.json', '{}\n');
    write('vite.config.ts', 'export default { changed: true };\n');

    expect(removal([
      { kind: 'generated', path: 'eslint.config.mjs' },
      { kind: 'generated', path: 'docs/handbook.md' },
      { kind: 'created', path: 'jsconfig.json', sha256: digest('{}\n') },
      { kind: 'created', path: 'vite.config.ts', sha256: digest('export default {};\n') },
    ])).toEqual({
      actions: [
        { kind: 'delete', path: 'apps/web/eslint.config.mjs', reason: 'generated' },
        { kind: 'delete', path: 'apps/web/jsconfig.json', reason: 'created' },
      ],
      conflicts: [],
      residues: [
        { kind: 'modified', path: 'apps/web/docs/handbook.md' },
        { kind: 'modified', path: 'apps/web/vite.config.ts' },
      ],
    });
  });
});

describe('recordedRemoval · shared-file reversal', () => {
  it('reverses later edits first so an edit of Blueprint\'s own insertion unwinds fully', () => {
    write('.gitignore', 'dist\n!docs/b.md\n');

    expect(removal([
      { kind: 'edit', path: '.gitignore', before: '', after: '!docs/a.md\n' },
      { kind: 'edit', path: '.gitignore', before: 'a', after: 'b' },
    ]).actions).toEqual([
      { kind: 'write', path: 'apps/web/.gitignore', content: 'dist\n', reason: 'edit' },
    ]);
  });

  it('restores every recorded script in a manifest and reports ones it cannot restore', () => {
    write('package.json', JSON.stringify({
      scripts: { lint: 'eslint src', test: 'vitest', build: 'tsc && vite' },
    }));

    expect(removal([
      { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
      { kind: 'script', path: 'package.json', name: 'test', before: 'jest', after: 'jest --ci' },
      { kind: 'script', path: 'package.json', name: 'build', before: 'vite', after: 'tsc && vite' },
    ])).toEqual({
      actions: [{
        kind: 'write',
        path: 'apps/web/package.json',
        content: '{\n  "scripts": {\n    "test": "vitest",\n    "build": "vite"\n  }\n}\n',
        reason: 'script',
      }],
      conflicts: [{
        kind: 'diverged-script',
        path: 'apps/web/package.json',
        name: 'test',
        expected: 'jest --ci',
        current: 'vitest',
      }],
      residues: [],
    });

    expect(removal([
      { kind: 'script', path: 'package.json', name: 'test', before: 'jest', after: 'jest --ci' },
    ]).actions).toEqual([]);

    write('package.json', '{ broken');

    expect(removal([
      { kind: 'script', path: 'package.json', name: 'lint', before: null, after: 'eslint src' },
    ]).conflicts).toEqual([{ kind: 'unreadable-manifest', path: 'apps/web/package.json' }]);
  });

  it('writes nothing when every recorded edit was already reversed by hand', () => {
    write('.gitignore', 'dist\n');

    expect(removal([{ kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' }]))
      .toEqual({ actions: [], conflicts: [], residues: [] });
  });

  it('keeps a Blueprint folder that now holds project files and removes an empty one', () => {
    write('src/pages/.gitkeep', '');
    write('src/hooks/useCart.ts', 'export {};\n');
    fs.mkdirSync(path.join(root, 'src/services'));

    expect(removal([
      { kind: 'directory', path: 'src/pages' },
      { kind: 'directory', path: 'src/hooks' },
      { kind: 'directory', path: 'src/services' },
    ])).toEqual({
      actions: [
        { kind: 'delete', path: 'apps/web/src/pages/.gitkeep', reason: 'directory' },
        { kind: 'rmdir', path: 'apps/web/src/pages', reason: 'directory' },
        { kind: 'rmdir', path: 'apps/web/src/services', reason: 'directory' },
      ],
      conflicts: [],
      residues: [{ kind: 'directory-in-use', path: 'apps/web/src/hooks' }],
    });
  });
});
