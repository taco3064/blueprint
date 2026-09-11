import fs from 'node:fs';
import path from 'node:path';

import { parseJsonc } from './jsonc';
import { resolveRepositoryContext } from './repository';
import type { PackageManager } from './types';

export interface PackageMetadata {
  root: string;
  name?: string;
  scripts: Record<string, string>;
  dependencies: string[];
}

export interface ProjectContext {
  applicationRoot: string;
  repositoryRoot?: string;
  toolchainRoot: string;
  localPackage: PackageMetadata;
  toolchainPackage: PackageMetadata;
  packageManager: PackageManager;
  hasTypescript: boolean;
}

export function resolveProjectContext(root: string): ProjectContext {
  const applicationRoot = path.resolve(root);
  const repository = resolveRepositoryContext(applicationRoot);
  const toolchainRoot = resolveToolchainRoot(applicationRoot, repository.root);
  const localPackage = readPackageMetadata(applicationRoot);

  const toolchainPackage = readPackageMetadata(toolchainRoot);

  return {
    applicationRoot,
    ...(repository.root ? { repositoryRoot: repository.root } : {}),
    toolchainRoot,
    localPackage,
    toolchainPackage,
    packageManager: detectPackageManager(
      applicationRoot,
      repository.root ?? path.parse(applicationRoot).root,
    ),
    hasTypescript: hasProjectTypescript({
      root: applicationRoot,
      localPackage,
      toolchainPackage,
    }),
  };
}

function resolveToolchainRoot(applicationRoot: string, repositoryRoot?: string): string {
  if (hasLocalPackageBoundary(applicationRoot)) {
    return applicationRoot;
  }

  const boundary = repositoryRoot ?? path.parse(applicationRoot).root;

  const workspace = directoriesToBoundary(applicationRoot, boundary).find(isWorkspaceRoot);

  return workspace ?? applicationRoot;
}

function hasLocalPackageBoundary(root: string): boolean {
  return ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']
    .some((file) => fs.existsSync(path.join(root, file)));
}

function isWorkspaceRoot(root: string): boolean {
  if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) {
    return true;
  }

  const pkg = readJson(path.join(root, 'package.json'));

  return Array.isArray(pkg?.workspaces)
    || (isRecord(pkg?.workspaces) && Array.isArray(pkg.workspaces.packages));
}

function detectPackageManager(applicationRoot: string, boundary: string): PackageManager {
  const detected = directoriesToBoundary(applicationRoot, boundary)
    .map(packageManagerAt)
    .find((manager): manager is PackageManager => manager !== null);

  return detected ?? 'npm';
}

function packageManagerAt(root: string): PackageManager | null {
  if (
    fs.existsSync(path.join(root, 'pnpm-lock.yaml'))
    || fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))
  ) {
    return 'pnpm';
  }

  if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    return 'yarn';
  }

  return fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm' : null;
}

export function directoriesToBoundary(start: string, boundary: string): string[] {
  const directories: string[] = [];
  let current = path.resolve(start);

  for (;;) {
    directories.push(current);

    if (sameFilesystemPath(current, boundary)) {
      return directories;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return directories;
    }

    current = parent;
  }
}

export function sameFilesystemPath(left: string, right: string): boolean {
  return canonicalPath(left) === canonicalPath(right);
}

function canonicalPath(value: string): string {
  try {
    const real = path.normalize(fs.realpathSync.native(value));

    return process.platform === 'win32' ? real.toLowerCase() : real;
  } catch {
    return path.resolve(value);
  }
}

function hasProjectTypescript(context: {
  root: string;
  localPackage: PackageMetadata;
  toolchainPackage: PackageMetadata;
}): boolean {
  const { root, localPackage, toolchainPackage } = context;

  if (localPackage.dependencies.includes('typescript')) {
    return true;
  }

  const inherited = toolchainPackage.dependencies.includes('typescript');

  if (!inherited) {
    return false;
  }

  const projectEvidence = ['tsconfig.json', 'tsconfig.app.json'].some((file) =>
    fs.existsSync(path.join(root, file))) || hasTypescriptSource(root);

  return projectEvidence;
}

function hasTypescriptSource(root: string): boolean {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => entry.isDirectory()
    ? !ignored.has(entry.name) && hasTypescriptSource(path.join(root, entry.name))
    : entry.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name));
}

function readPackageMetadata(root: string): PackageMetadata {
  const pkg = readJson(path.join(root, 'package.json')) ?? {};

  const dependencies = Object.fromEntries([
    ...recordEntries(pkg.dependencies),
    ...recordEntries(pkg.devDependencies),
  ]);

  const scripts = Object.fromEntries(recordEntries(pkg.scripts).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ));

  return {
    root,
    ...(typeof pkg.name === 'string' ? { name: pkg.name } : {}),
    scripts,
    dependencies: Object.keys(dependencies),
  };
}

function recordEntries(value: unknown): [string, unknown][] {
  return isRecord(value) ? Object.entries(value) : [];
}

function readJson(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) {
    return null;
  }

  const parsed = parseJsonc(fs.readFileSync(file, 'utf-8'));
  const value = (parsed as { value?: unknown }).value;

  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
