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

  it('records the whole shape of a side-effect, dynamic, and require reference', () => {
    // The suite checked these three specifiers existed and nothing else. Both
    // of their defaults were therefore free to flip, and an `isExport: true`
    // here would make a selfOnly re-export ban fire on `import './setup'`.
    expect(extractImports('import \'./side-effect\';')).toEqual([
      { specifier: './side-effect', names: [], isExport: false },
    ]);

    expect(extractImports('const m = await import(\'dyn\');')).toEqual([
      { specifier: 'dyn', names: [], isExport: false },
    ]);

    expect(extractImports('const r = require(\'req\');')).toEqual([
      { specifier: 'req', names: [], isExport: false },
    ]);
  });

  it('drops the empty slot a trailing comma leaves behind', () => {
    // `{ a, }` splits into ['a', '']. An empty name matches no layer, so it
    // would pad every ownership comparison with a member that means nothing.
    expect(extractImports('import { a, } from \'pkg\';')[0].names).toEqual(['a']);
  });

  it('strips the type modifier only where it is the modifier', () => {
    // `type` is a modifier at the START of a member, not a substring anywhere in
    // it. `subtype` is a perfectly ordinary export name, and cutting `type ` out
    // of the middle leaves `subas x` — a name that matches no owned primitive,
    // so an ownership rule stops seeing the import it is meant to govern.
    expect(extractImports('import { subtype as x } from \'pkg\';')[0].names)
      .toEqual(['subtype']);

    expect(extractImports('import { type Only } from \'pkg\';')[0].names).toEqual(['Only']);
  });

  it('reads the spacings a human actually writes', () => {
    // Every existing fixture puts exactly one space in each optional slot, so
    // each `\s*` could be tightened to a mandatory `\s` unnoticed. All of these
    // are legal, and a missed reference is an import invisible to every
    // structural check while emitLint still bans it.
    expect(extractImports('import { api } from\'~app/services/api\';')[0].specifier)
      .toBe('~app/services/api');

    expect(extractImports('import\'./styles.css\';')[0].specifier).toBe('./styles.css');

    for (const source of [
      'const m = await import (\'lazy\');',
      'const m = await import( \'lazy\');',
      'const m = await import(\'lazy\' );',
    ]) {
      expect(extractImports(source)[0]?.specifier).toBe('lazy');
    }
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
    // A source extension has to END the filename. An editor backup is not a
    // source file, and scanning it declares a module that the alias cannot
    // resolve and that no import ever names.
    fs.writeFileSync(path.join(dir, 'Button.vue.bak'), 'export default {};');

    const result = scan(root);

    expect(result.topDirs).toEqual(['components']);

    const button = result.files.find((file) => file.path.endsWith('Button.ts'));

    expect(button?.segments).toEqual(['components', 'Button', 'Button.ts']);
    expect(button?.imports[0].specifier).toBe('~app/hooks/useX');
    expect(result.files).toHaveLength(1); // README.md skipped
  });

  it('scans the project root when sourceRoot is "." and skips non-source dirs', () => {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'react'), { recursive: true });
    fs.mkdirSync(path.join(root, '.next'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'export default () => null;');
    fs.writeFileSync(path.join(root, 'node_modules', 'react', 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(root, '.next', 'build.js'), 'export const x = 1;');

    const result = scan(root, '.');

    expect(result.topDirs).toContain('app');
    expect(result.topDirs).not.toContain('node_modules');
    expect(result.topDirs).not.toContain('.next');

    const page = result.files.find((file) => file.segments[0] === 'app');

    expect(page?.path).toBe('app/page.tsx'); // no src/ prefix at the root
    expect(result.files.every((file) => file.segments[0] === 'app')).toBe(true);
  });

  it('honors a custom sourceRoot directory', () => {
    fs.mkdirSync(path.join(root, 'source', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'source', 'lib', 'x.ts'), 'export const x = 1;');

    const result = scan(root, 'source');

    expect(result.topDirs).toEqual(['lib']);
    expect(result.files[0].path).toBe('source/lib/x.ts');
    expect(result.files[0].segments).toEqual(['lib', 'x.ts']);
  });
});
