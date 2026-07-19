import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractImports, scan } from './scan';

describe('extractImports', () => {
  it('extracts static, re-export, side-effect, and dynamic references', () => {
    const refs = extractImports(
      [
        'import Default, { a, b as c } from \'pkg\';',
        'import Solo from \'solo\';',
        'export { x } from \'./rel\';',
        'import \'./side-effect\';',
        'const m = await import(\'dyn\');',
        'const r = require(\'req\');',
      ].join('\n'),
    );

    expect(refs.find((ref) => ref.specifier === 'pkg')).toMatchObject({
      names: ['a', 'b'],
      isExport: false,
    });

    expect(refs.find((ref) => ref.specifier === 'solo')?.names).toEqual([]);

    expect(refs.find((ref) => ref.specifier === './rel')).toMatchObject({
      names: ['x'],
      isExport: true,
    });

    expect(refs.map((ref) => ref.specifier)).toEqual(
      expect.arrayContaining(['pkg', './rel', './side-effect', 'dyn', 'req']),
    );
  });

  it('ignores imports inside comments and strips a leading type modifier', () => {
    const refs = extractImports(
      '// import x from \'commented\';\n/* import y from \'block\'; */\nimport { type T, U } from \'real\';',
    );

    expect(refs.map((ref) => ref.specifier)).toEqual(['real']);
    expect(refs[0].names).toEqual(['T', 'U']);
  });
});

describe('scan', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-scan-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns empty when there is no src/', () => {
    expect(scan(root)).toEqual({ topDirs: [], files: [] });
  });

  it('walks src/ and records files with segments and imports', () => {
    const dir = path.join(root, 'src', 'components', 'Button');

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Button.ts'), 'import { useX } from \'~app/hooks/useX\';');
    fs.writeFileSync(path.join(root, 'src', 'README.md'), 'not source');

    const result = scan(root);

    expect(result.topDirs).toEqual(['components']);

    const button = result.files.find((file) => file.path.endsWith('Button.ts'));

    expect(button?.segments).toEqual(['components', 'Button', 'Button.ts']);
    expect(button?.imports[0].specifier).toBe('~app/hooks/useX');
    expect(result.files).toHaveLength(1); // README.md skipped
  });
});
