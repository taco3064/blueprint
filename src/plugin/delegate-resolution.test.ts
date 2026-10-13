import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDelegate } from './delegate-resolution';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-alias-'));
  const root = path.join(directory, 'src');

  roots.push(directory);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'data.ts'), 'export const data = 1;');
  fs.writeFileSync(path.join(directory, 'outside.ts'), 'export const data = 2;');
  fs.mkdirSync(path.join(directory, 'src-other'));
  fs.writeFileSync(path.join(directory, 'src-other', 'data.ts'), 'export const data = 3;');

  return { directory, root, importer: path.join(root, 'useView.ts'),
    resolution: { alias: '~app', root } };
}

describe('configured delegate source boundaries', () => {
  it.each(['~app/data', './data', '~app/data.ts'])('resolves %s inside the root', (specifier) => {
    const { root, importer, resolution } = fixture();

    expect(resolveDelegate(importer, specifier, resolution)).toBe(path.join(root, 'data.ts'));
  });

  it.each(['~application/data', '~app-other/data', 'unknown/data', '~app/missing',
    '~app/../outside', '../outside', '~app/../src-other/data', '../src-other/data'])(
    'does not resolve %s', (specifier) => {
      const { importer, resolution } = fixture();

      expect(resolveDelegate(importer, specifier, resolution)).toBeNull();
    },
  );

  it('resolves the exact alias through the root entry', () => {
    const { root, importer, resolution } = fixture();

    fs.writeFileSync(path.join(root, 'index.js'), 'export const data = 1;');
    expect(resolveDelegate(importer, '~app', resolution)).toBe(path.join(root, 'index.js'));
  });

  it('keeps unconfigured relative resolution and refuses an unconfigured alias', () => {
    const { directory, importer } = fixture();

    expect(resolveDelegate(importer, '../outside')).toBe(path.join(directory, 'outside.ts'));
    expect(resolveDelegate(importer, '~app/data')).toBeNull();
  });

  it('rejects symlink directory escapes even when their spelling is inside the root', () => {
    const { directory, root, importer, resolution } = fixture();

    fs.symlinkSync(directory, path.join(root, 'escape'), 'junction');
    expect(resolveDelegate(importer, '~app/escape/outside', resolution)).toBeNull();
    expect(resolveDelegate(importer, './escape/outside', resolution)).toBeNull();
  });

  it('accepts a symlinked source root and an internal directory symlink', () => {
    const { directory, root, importer, resolution } = fixture();
    const linkedRoot = path.join(directory, 'linked');

    fs.symlinkSync(root, linkedRoot, 'junction');
    fs.symlinkSync(root, path.join(root, 'inside'), 'junction');

    expect(resolveDelegate(importer, '~app/inside/data', resolution))
      .toBe(path.join(root, 'data.ts'));

    expect(resolveDelegate(importer, '~app/data', { ...resolution, root: linkedRoot }))
      .toBe(path.join(root, 'data.ts'));
  });
});

it('rejects cross-volume absolute relative paths', () => {
  const { importer, resolution } = fixture();

  vi.spyOn(path, 'relative').mockReturnValue(path.resolve('different-volume/data.ts'));
  expect(resolveDelegate(importer, '~app/data', resolution)).toBeNull();
});

it.each(['~application/data', '~app-other/data', 'unknown/data'])(
  'does not treat a prefix lookalike as the canonical alias: %s', (specifier) => {
    const { root, importer, resolution } = fixture();
    const misleadingTarget = path.resolve(root, `.${specifier.slice(resolution.alias.length)}.ts`);

    fs.mkdirSync(path.dirname(misleadingTarget), { recursive: true });
    fs.writeFileSync(misleadingTarget, 'export const value = 1;');
    expect(resolveDelegate(importer, specifier, resolution)).toBeNull();
  },
);

it('rejects a missing configured source root without reading an outside delegate', () => {
  const { directory, importer, resolution } = fixture();

  expect(resolveDelegate(importer, '../outside', {
    ...resolution, root: path.join(directory, 'absent'),
  })).toBeNull();
});
