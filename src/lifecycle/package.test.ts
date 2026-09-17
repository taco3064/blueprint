import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installedPackage,
  manifestOwner,
  PACKAGE_NAME,
  runningInstallSpec,
  runningPackage,
} from './package';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-package-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeJson(rel: string, value: unknown): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), JSON.stringify(value));
}

function writePackage(dir: string, version: string): void {
  writeJson(`${dir}/package.json`, { name: PACKAGE_NAME, version });
}

describe('running package', () => {
  it('finds this package from its own module directory', () => {
    const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const manifest = JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf-8'));

    expect(PACKAGE_NAME).toBe('@kekkai/blueprint');
    expect(runningPackage()).toEqual({ root: repository, version: manifest.version });
  });

  it('skips unrelated or unversioned manifests and returns null when none matches', () => {
    writeJson('package.json', { name: 'other', version: '1.0.0' });
    writeJson('pkg/package.json', { name: PACKAGE_NAME, version: 'dev' });
    fs.mkdirSync(path.join(root, 'pkg/dist'));
    fs.writeFileSync(path.join(root, 'pkg/dist/package.json'), '[]');
    fs.mkdirSync(path.join(root, 'pkg/dist/deep'));
    fs.writeFileSync(path.join(root, 'pkg/dist/deep/package.json'), 'null');

    expect(runningPackage(path.join(root, 'pkg/dist/deep'))).toBeNull();
  });

  it('uses the enclosing npm lock resolution when the running copy came from a tarball', () => {
    writePackage('runner/node_modules/@kekkai/blueprint', '4.1.0');

    writeJson('runner/package-lock.json', {
      packages: {
        'node_modules/@kekkai/blueprint': { resolved: 'file:../kekkai-blueprint-4.1.0.tgz' },
      },
    });

    const running = runningPackage(path.join(root, 'runner/node_modules/@kekkai/blueprint'))!;

    expect(runningInstallSpec(running)).toBe(path.join(root, 'kekkai-blueprint-4.1.0.tgz'));
  });

  it('falls back to the registry version for every other install shape', () => {
    writePackage('cache/node_modules/@kekkai/blueprint', '4.1.0');

    writeJson('cache/package-lock.json', {
      packages: { 'node_modules/@kekkai/blueprint': { resolved: 'https://registry.npmjs.org/x.tgz' } },
    });

    const cached = runningPackage(path.join(root, 'cache/node_modules/@kekkai/blueprint'))!;

    expect(runningInstallSpec(cached)).toBe('@kekkai/blueprint@4.1.0');

    expect(runningInstallSpec({ root: path.join(root, 'checkout'), version: '4.1.0' }))
      .toBe('@kekkai/blueprint@4.1.0');

    writePackage('bare/node_modules/@kekkai/blueprint', '4.1.0');

    expect(runningInstallSpec(
      runningPackage(path.join(root, 'bare/node_modules/@kekkai/blueprint'))!,
    )).toBe('@kekkai/blueprint@4.1.0');

    writePackage('other/node_modules/@kekkai/blueprint', '4.1.0');
    writeJson('other/package-lock.json', { packages: { 'node_modules/react': {} } });

    expect(runningInstallSpec(
      runningPackage(path.join(root, 'other/node_modules/@kekkai/blueprint'))!,
    )).toBe('@kekkai/blueprint@4.1.0');

    const outside = { root: path.join(root, 'vendor/@kekkai/blueprint'), version: '4.1.0' };

    writeJson('package-lock.json', {
      packages: { 'node_modules/@kekkai/blueprint': { resolved: 'file:x.tgz' } },
    });

    expect(runningInstallSpec(outside)).toBe('@kekkai/blueprint@4.1.0');
  });
});

describe('installed project package', () => {
  it('resolves the nearest installed copy like Node does, '
    + 'including a hoisted workspace copy', () => {
    writePackage('node_modules/@kekkai/blueprint', '3.2.0');
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });

    expect(installedPackage(path.join(root, 'apps/web'))).toEqual({
      root: path.join(root, 'node_modules/@kekkai/blueprint'), version: '3.2.0',
    });

    writePackage('apps/web/node_modules/@kekkai/blueprint', '4.0.0');
    expect(installedPackage(path.join(root, 'apps/web'))?.version).toBe('4.0.0');
  });

  it('returns null when the project has not installed Blueprint', () => {
    expect(installedPackage(root)).toBeNull();
  });
});

describe('manifest owner', () => {
  it('finds the nearest manifest that declares Blueprint and its dependency section', () => {
    writeJson('package.json', { devDependencies: { [PACKAGE_NAME]: '^4.0.0' } });
    writeJson('apps/web/package.json', { dependencies: { react: '^18' } });
    writeJson('apps/api/package.json', { dependencies: { [PACKAGE_NAME]: '^4.0.0' } });

    expect(manifestOwner(path.join(root, 'apps/web'), root))
      .toEqual({ root, section: 'devDependencies' });

    expect(manifestOwner(path.join(root, 'apps/api'), root))
      .toEqual({ root: path.join(root, 'apps/api'), section: 'dependencies' });
  });

  it('stops at the boundary and ignores malformed dependency maps', () => {
    writeJson('package.json', { devDependencies: { [PACKAGE_NAME]: '^4.0.0' } });
    writeJson('repo/package.json', { devDependencies: null, dependencies: 'x' });
    fs.mkdirSync(path.join(root, 'repo/app'), { recursive: true });

    expect(manifestOwner(path.join(root, 'repo/app'), path.join(root, 'repo'))).toBeNull();

    expect(manifestOwner(path.join(root, 'repo/app'), path.join(root, 'elsewhere')))
      .toEqual({ root, section: 'devDependencies' });

    expect(manifestOwner(path.join(root, 'repo/app'), path.join(root, 'nowhere/deeper')))
      .not.toBeNull();
  });

  it('returns null at the filesystem root when nothing declares Blueprint', () => {
    expect(manifestOwner(root, path.join(root, 'unrelated'))).toBeNull();
  });
});
