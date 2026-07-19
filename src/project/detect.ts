import fs from 'node:fs';
import path from 'node:path';

import type { Framework } from '../config';
import type { PackageManager, ProjectState } from './types';

export const CONFIG_FILE = 'blueprint.config.mjs';

const ESLINT_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
];

const REQUIRED_DEPS = ['eslint', '@kekkai/blueprint'];

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

/** Read a set of project-relative files; each value is the content, or null if absent. */
export function readTexts(root: string, paths: string[]): Record<string, string | null> {
  return Object.fromEntries(paths.map((file) => [file, readText(path.join(root, file))]));
}

function detectFramework(deps: Record<string, unknown>): Framework | null {
  const hasVue = 'vue' in deps;
  const hasReact = 'react' in deps;

  if (hasVue === hasReact) return null; // both or neither → ambiguous

  return hasVue ? 'vue' : 'react';
}

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';

  return 'npm';
}

function listSrcDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(path.join(root, 'src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Read the target project into a {@link ProjectState}. */
export function detect(root: string): ProjectState {
  const pkg = readJson(path.join(root, 'package.json')) ?? {};

  const deps = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
  };

  return {
    root,
    framework: detectFramework(deps),
    packageManager: detectPackageManager(root),
    projectName: typeof pkg.name === 'string' ? pkg.name : undefined,
    hasConfig: fs.existsSync(path.join(root, CONFIG_FILE)),
    hasEslintConfig: ESLINT_FILES.some((file) => fs.existsSync(path.join(root, file))),
    existingSrcDirs: listSrcDirs(root),
    missingDeps: REQUIRED_DEPS.filter((dep) => !(dep in deps)),
  };
}
