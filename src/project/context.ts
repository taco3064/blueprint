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

function directoriesToBoundary(start: string, boundary: string): string[] {
  const relative = path.relative(boundary, start);
  const depth = relative === '' ? 0 : relative.split(path.sep).length;

  return Array.from({ length: depth + 1 }, (_, index) =>
    path.resolve(start, ...Array.from({ length: index }, () => '..')));
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

  const projectEvidence = ['tsconfig.json', 'tsconfig.app.json'].some((file) =>
    fs.existsSync(path.join(root, file)));

  return inherited && projectEvidence;
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
