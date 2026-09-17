import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isVersion } from './version';

export const PACKAGE_NAME = '@kekkai/blueprint';

export interface PackageLocation {
  root: string;
  version: string;
}

export interface ManifestOwner {
  root: string;
  section: 'dependencies' | 'devDependencies';
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) ?? {};
  } catch {
    return {};
  }
}

export function ancestors(start: string): string[] {
  const directories = [path.resolve(start)];

  directories[0].split(path.sep).forEach(() => {
    directories.push(path.dirname(directories[directories.length - 1]));
  });

  return [...new Set(directories)];
}

function packageAt(root: string): PackageLocation | null {
  const manifest = readJson(path.join(root, 'package.json'));

  return manifest.name === PACKAGE_NAME && isVersion(manifest.version)
    ? { root, version: manifest.version }
    : null;
}

export function runningPackage(
  start: string = path.dirname(fileURLToPath(import.meta.url)),
): PackageLocation | null {
  for (const directory of ancestors(start)) {
    const found = packageAt(directory);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

export function installedPackage(applicationRoot: string): PackageLocation | null {
  for (const directory of ancestors(applicationRoot)) {
    const found = packageAt(path.join(directory, 'node_modules', ...PACKAGE_NAME.split('/')));

    if (found !== null) {
      return found;
    }
  }

  return null;
}

export function manifestOwner(applicationRoot: string, boundary: string): ManifestOwner | null {
  const limit = path.resolve(boundary);

  for (const directory of ancestors(applicationRoot)) {
    const manifest = readJson(path.join(directory, 'package.json'));

    for (const section of ['devDependencies', 'dependencies'] as const) {
      const entries = manifest[section];

      if (typeof entries === 'object' && entries !== null && Object.hasOwn(entries, PACKAGE_NAME)) {
        return { root: directory, section };
      }
    }

    if (directory === limit) {
      return null;
    }
  }

  return null;
}

export function runningInstallSpec(running: PackageLocation): string {
  const modules = path.dirname(path.dirname(running.root));
  const lock = readJson(path.join(path.dirname(modules), 'package-lock.json'));
  const packages = lock.packages as Record<string, { resolved?: unknown }> | undefined;
  const resolved = packages?.[`node_modules/${PACKAGE_NAME}`]?.resolved;

  if (path.basename(modules) === 'node_modules'
    && typeof resolved === 'string' && resolved.startsWith('file:')) {
    return path.resolve(path.dirname(modules), resolved.slice('file:'.length));
  }

  return `${PACKAGE_NAME}@${running.version}`;
}
