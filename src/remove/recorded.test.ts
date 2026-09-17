import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { digest } from '../lifecycle';
import type { ProvenanceRecord } from '../lifecycle';
import { recordedRemoval } from './recorded';

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
      conflicts: [],
      residues: [{ kind: 'irreversible', path: 'apps/web/.gitignore' }],
    });
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
