import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeModuleImports } from '../plugin';
import { unresolvedProjectReferences } from './outside-references';
import { extractImports } from './scan';

let root: string;

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'outside-references-')), 'app');
  fs.mkdirSync(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

function limitations(source: string) {
  return unresolvedProjectReferences(root, [{
    path: 'entry.ts', segments: ['entry.ts'], imports: extractImports(source),
    moduleSpecifiers: analyzeModuleImports(source, 'entry.ts').specifiers,
  }], [['~app', 'src']]);
}

describe('outside unresolved project reference evidence', () => {
  it.each(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue'])(
    'recognizes supported extension %s without reading it', (extension) => {
      fs.writeFileSync(path.join(root, `target.${extension}`), 'not parsed');
      expect(limitations('import \'./target\';')).toEqual([]);
    },
  );

  it('preserves unknown relative and alias targets, deduplicates, and ignores packages', () => {
    const source = ['import \'./missing\';', 'import \'./missing\';',
      'import \'~app/run\';', 'import \'react\';'].join('\n');

    expect(limitations(source))
      .toEqual([
        'entry.ts: unresolved project reference missing',
        'entry.ts: unresolved project reference src/run',
      ]);
  });

  it('recognizes physical files and loader suffixes without inventing package resolution', () => {
    fs.writeFileSync(path.join(root, 'image.svg'), 'not parsed');
    fs.mkdirSync(path.join(root, 'directory'));

    expect(limitations('import \'./image.svg?raw\'; import \'./image.svg#url\';')).toEqual([]);

    expect(limitations('import \'./directory\';'))
      .toEqual(['entry.ts: unresolved project reference directory']);
  });

  it('keeps references outside the application unresolved', () => {
    expect(limitations('import \'..\'; import \'../other\';'))
      .toEqual([
        'entry.ts: unresolved project reference ..',
        'entry.ts: unresolved project reference ../other',
      ]);
  });

  it.each(['js', 'jsx'])(
    'recognizes TypeScript source for a runtime .%s specifier', (extension) => {
      fs.writeFileSync(path.join(root, 'target.tsx'), 'not parsed');
      expect(limitations(`import './target.${extension}';`)).toEqual([]);
    },
  );

  it.each(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue'])(
    'recognizes directory index.%s without parsing it', (extension) => {
      fs.mkdirSync(path.join(root, 'directory'));
      fs.writeFileSync(path.join(root, 'directory', `index.${extension}`), 'not parsed');
      expect(limitations('import \'./directory\';')).toEqual([]);
    },
  );

  it('does not interpret template text as a module import', () => {
    const source = 'export const sample = `import \'./not-a-real-module\';`;';

    expect(extractImports(source)).toEqual([
      { specifier: './not-a-real-module', names: [], isExport: false },
    ]);

    expect(analyzeModuleImports(source, 'entry.ts').specifiers).toEqual([]);
    expect(limitations(source)).toEqual([]);

    expect(limitations('import \'./not-a-real-module\';'))
      .toEqual(['entry.ts: unresolved project reference not-a-real-module']);
  });

  it('does not manufacture parsed module references for an unparsed fabricated file', () => {
    expect(unresolvedProjectReferences(root, [{
      path: 'entry.ts', segments: ['entry.ts'], imports: extractImports('import \'./missing\';'),
    }], [])).toEqual([]);
  });

  it('does not resolve existing files or directory indexes beyond the application root', () => {
    fs.writeFileSync(path.join(root, '../existing.ts'), 'not parsed');
    fs.writeFileSync(path.join(root, '../index.ts'), 'not parsed');

    expect(limitations('import \'..\'; import \'../existing\';')).toEqual([
      'entry.ts: unresolved project reference ..',
      'entry.ts: unresolved project reference ../existing',
    ]);
  });

  it('does not strip a runtime extension inside the basename', () => {
    fs.writeFileSync(path.join(root, 'target.extra.ts'), 'not parsed');

    expect(limitations('import \'./target.js.extra\';'))
      .toEqual(['entry.ts: unresolved project reference target.js.extra']);
  });

  it.each([false, true])('checks physical symlink file targets, escaping=%s', (escaping) => {
    const target = path.join(escaping ? path.dirname(root) : root, 'target.ts');

    fs.writeFileSync(target, '');
    fs.symlinkSync(target, path.join(root, 'linked.ts'), 'file');

    expect(limitations('import \'./linked\';')).toEqual(escaping
      ? ['entry.ts: unresolved project reference linked']
      : []);
  });

  it('refuses a resolved file on another volume', () => {
    fs.writeFileSync(path.join(root, 'target.ts'), '');
    const relative = path.relative;
    const canonical = fs.realpathSync.native(path.join(root, 'target.ts'));

    vi.spyOn(path, 'relative').mockImplementation((from, to) =>
      to === canonical ? path.resolve(path.sep, 'other-volume') : relative(from, to));

    expect(limitations('import \'./target\';'))
      .toEqual(['entry.ts: unresolved project reference target']);
  });
});
