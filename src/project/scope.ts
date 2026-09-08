import fs from 'node:fs';
import path from 'node:path';

import { readText, VITE_FILES } from './detect';
import { parseJsonc } from './jsonc';
import type { ProjectState } from './types';

const TSCONFIG_FILES = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json'];
const WORKSPACE_DIRS = new Set(['apps', 'packages']);

export interface ProjectToolchain {
  root: string;
  tsconfigs: Record<string, string | null>;
  viteConfig?: { file: string; text: string };
}

export interface SurveyScope {
  sourceRoot: string;
  note?: string;
}

export function toolchainForSource(root: string, sourceRoot = 'src'): ProjectToolchain {
  const relativeRoot = sourceRoot === '.' ? '' : sourceRoot;
  const toolRoot = nearestToolRoot(root, path.resolve(root, relativeRoot));
  const relativeToolRoot = normalizeRelative(root, toolRoot);
  const qualify = (file: string) => relativeToolRoot ? `${relativeToolRoot}/${file}` : file;

  const tsconfigs = Object.fromEntries(
    TSCONFIG_FILES.map((file) => [qualify(file), readText(path.join(toolRoot, file))]),
  );

  const viteFile = VITE_FILES.find((file) => fs.existsSync(path.join(toolRoot, file)));
  const viteText = viteFile === undefined ? null : readText(path.join(toolRoot, viteFile));

  return {
    root: relativeToolRoot,
    tsconfigs,
    ...(viteFile && viteText !== null
      ? { viteConfig: { file: qualify(viteFile), text: viteText } }
      : {}),
  };
}

export function toolchainForProject(
  state: ProjectState,
  sourceRoot = 'src',
): ProjectToolchain {
  const detected = toolchainForSource(state.root, sourceRoot);
  const viteConfig = state.viteConfig ? { viteConfig: state.viteConfig } : {};

  return detected.root === ''
    ? { ...detected, tsconfigs: state.tsconfigs, ...viteConfig }
    : detected;
}

export function surveyScope(root: string, requested?: string): SurveyScope {
  if (requested !== undefined) {
    return { sourceRoot: requested };
  }

  return inferSourceRoot(root) ?? { sourceRoot: 'src' };
}

function nearestToolRoot(root: string, start: string): string {
  const boundary = path.resolve(root);
  let current = start;

  while (current.startsWith(boundary)) {
    const hasTool = [...TSCONFIG_FILES, ...VITE_FILES, 'package.json']
      .some((file) => fs.existsSync(path.join(current, file)));

    if (hasTool) {
      return current;
    }

    if (current === boundary) {
      break;
    }

    current = path.dirname(current);
  }

  return boundary;
}

function inferSourceRoot(root: string): SurveyScope | null {
  const evidence = sourceRootEvidence(root);

  if (evidence.roots.size === 1 && evidence.roots.has('src') && !evidence.rootFile) {
    return { sourceRoot: 'src' };
  }

  if (evidence.rootFile || isRootLayout(evidence.roots)) {
    return {
      sourceRoot: '.',
      note: 'TypeScript includes identify source folders at the repository root.',
    };
  }

  if ([...evidence.roots].some((entry) => WORKSPACE_DIRS.has(entry))) {
    return {
      sourceRoot: 'src',
      note: 'Workspace TypeScript projects span multiple application roots; '
        + 'choose one architecture.sourceRoot explicitly.',
    };
  }

  return null;
}

function isRootLayout(roots: Set<string>): boolean {
  return roots.size >= 2 && ![...roots].some((entry) => WORKSPACE_DIRS.has(entry));
}

function sourceRootEvidence(root: string): { roots: Set<string>; rootFile: boolean } {
  const roots = new Set<string>();
  let rootFile = false;

  for (const [file, config] of parsedProjects(root)) {
    const dir = path.dirname(file) === '.' ? '' : path.dirname(file);

    for (const entry of sourceEntries(config)) {
      const normalized = normalizeRelative('', path.join(dir, entry));
      const first = normalized.split('/')[0];

      if (normalized === '' || normalized.startsWith('*')) {
        rootFile = true;
      } else {
        roots.add(first);
      }
    }
  }

  return { roots, rootFile };
}

function parsedProjects(root: string): [string, Record<string, unknown>][] {
  return referencedTsconfigs(root).flatMap(([file, text]) => {
    const parsed = text === null ? null : parseJsonc(text);

    return parsed !== null && parsed.ok && isRecord(parsed.value)
      ? [[file, parsed.value]]
      : [];
  });
}

function referencedTsconfigs(root: string): [string, string | null][] {
  const rootFile = 'tsconfig.json';
  const rootText = readText(path.join(root, rootFile));
  const files: [string, string | null][] = [[rootFile, rootText]];
  const parsed = rootText === null ? null : parseJsonc(rootText);

  if (parsed === null || !parsed.ok || !isRecord(parsed.value)) {
    return files;
  }

  for (const ref of referencePaths(parsed.value.references)) {
    const file = ref.endsWith('.json') ? ref : path.join(ref, 'tsconfig.json');
    const normalized = normalizeRelative('', file);

    files.push([normalized, readText(path.join(root, normalized))]);
  }

  return files;
}

function referencePaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((ref) =>
    isRecord(ref) && typeof ref.path === 'string' ? [ref.path] : []);
}

function sourceEntries(config: Record<string, unknown>): string[] {
  return [config.include, config.files].flatMap((value) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : []);
}

function normalizeRelative(root: string, file: string): string {
  return path.relative(root || '.', file).split(path.sep).join('/').replace(/^\.\//, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
