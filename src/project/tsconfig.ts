import fs from 'node:fs';
import path from 'node:path';

import { parseJsonc } from './jsonc';
import { readText, VITE_FILES } from './detect';

function eachPathAlias(
  tsconfigs: Record<string, string | null>,
  visit: (alias: string, dir: string | null) => void,
): void {
  for (const text of Object.values(tsconfigs)) {
    const paths = pathsOf(text);

    if (paths === null) {
      continue;
    }

    for (const [key, targets] of Object.entries(paths)) {
      const alias = key.replace(/\/\*$/, '');

      if (!alias) {
        continue;
      }

      const target = Array.isArray(targets) && typeof targets[0] === 'string' ? targets[0] : null;

      visit(alias, target?.replace(/^\.\//, '').replace(/\/\*$/, '') ?? null);
    }
  }
}

function pathsOf(text: string | null): Record<string, unknown> | null {
  if (text == null) {
    return null;
  }

  const result = parseJsonc(text);

  // Stryker disable next-line BlockStatement, ConditionalExpression: fallthrough has no paths too.
  if (!result.ok) {
    return null;
  }

  const options = (result.value as { compilerOptions?: { paths?: unknown } })?.compilerOptions;
  const paths = options?.paths;

  return typeof paths !== 'object' || paths === null
    ? null
    : paths as Record<string, unknown>;
}

export function detectAliases(tsconfigs: Record<string, string | null>): Record<string, string> {
  const found: Record<string, string> = {};

  eachPathAlias(tsconfigs, (alias, dir) => {
    if (dir === 'src' && !(alias in found)) {
      found[alias] = 'src';
    }
  });

  return found;
}

export function pathAliasKeys(tsconfigs: Record<string, string | null>): Set<string> {
  const keys = new Set<string>();

  eachPathAlias(tsconfigs, (alias) => keys.add(alias));

  return keys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ViteTsCoverage {

  verdict: 'covered' | 'outside';

  viteFile: string;

  tsconfig: string;
}

export function viteTsCoverage(root: string): ViteTsCoverage | null {
  const viteFile = VITE_FILES.find((file) => fs.existsSync(path.join(root, file)));

  if (viteFile === undefined) {
    return null;
  }

  const rootConfig = 'tsconfig.json';
  const rootText = readText(path.join(root, rootConfig));

  if (rootText === null) {
    return null;
  }

  const projects = tsProjectGraph(root, rootConfig, rootText);
  const covering = projects === null ? null : coveringProject(projects, viteFile);

  if (covering === null) {
    return null;
  }

  return covering
    ? { verdict: 'covered', viteFile, tsconfig: covering.file }
    : { verdict: 'outside', viteFile, tsconfig: rootConfig };
}

function coveringProject(
  projects: TsProject[],
  viteFile: string,
): TsProject | null | undefined {
  for (const project of projects) {
    const covers = projectCovers(project, viteFile);

    if (covers === null) {
      return null;
    }

    if (covers) {
      return project;
    }
  }

  return undefined;
}

export interface TscArtifactLocation {

  buildInfo: string;

  tsconfig: string;
}

export function tscArtifactsOutOfTree(root: string): TscArtifactLocation | null {
  const rootConfig = 'tsconfig.json';
  const rootText = readText(path.join(root, rootConfig));
  const projects = rootText === null ? null : tsProjectGraph(root, rootConfig, rootText);

  if (projects === null) {
    return null;
  }

  let found: TscArtifactLocation | null = null;

  for (const project of projects) {
    if (isSolutionStub(project)) {
      continue;
    }

    const rel = outOfTreeBuildInfo(project);

    if (rel === null) {
      return null;
    }

    found ??= { buildInfo: rel, tsconfig: project.file };
  }

  return found;
}

function outOfTreeBuildInfo(project: TsProject): string | null {
  const options = project.compilerOptions;

  if (!isRecord(options)) {
    return null;
  }

  const buildInfo = options.tsBuildInfoFile;

  if (options.noEmit !== true || typeof buildInfo !== 'string') {
    return null;
  }

  const rel = normalizeSlashes(buildInfo);

  return rel.startsWith('node_modules/') ? rel : null;
}

function isSolutionStub(project: TsProject): boolean {
  return isStringArray(project.files) && project.files.length === 0
    && project.include === undefined;
}

interface TsProject {

  file: string;

  dir: string;
  compilerOptions?: unknown;
  files?: unknown;
  include?: unknown;
  exclude?: unknown;
  extends?: unknown;
}

function tsProjectGraph(root: string, file: string, text: string): TsProject[] | null {
  const parsed = parseJsonc(text);

  if (!parsed.ok || !isRecord(parsed.value)) {
    return null;
  }

  const rootProject = toProject(file, parsed.value);
  const refs = rootProject.references;

  if (!Array.isArray(refs)) {
    return refs === undefined ? [rootProject] : null;
  }

  const projects: TsProject[] = [rootProject];

  for (const ref of refs) {
    const project = referencedProject(root, ref);

    if (project === null) {
      return null;
    }

    projects.push(project);
  }

  return projects;
}

function referencedProject(root: string, ref: unknown): TsProject | null {
  if (!isRecord(ref) || typeof ref.path !== 'string') {
    return null;
  }

  const resolved = resolveReference(root, ref.path);

  if (resolved === null) {
    return null;
  }

  const parsed = parseJsonc(resolved.text);

  if (!parsed.ok || !isRecord(parsed.value)) {
    return null;
  }

  const project = toProject(resolved.file, parsed.value);

  return project.references === undefined ? project : null;
}

function resolveReference(root: string, ref: string): { file: string; text: string } | null {
  const candidates = ref.endsWith('.json') ? [ref] : [path.join(ref, 'tsconfig.json')];

  for (const candidate of candidates) {
    const text = readText(path.join(root, candidate));

    if (text !== null) {
      return { file: normalizeSlashes(candidate), text };
    }
  }

  return null;
}

function toProject(
  file: string,
  value: Record<string, unknown>,
): TsProject & { references?: unknown } {
  return {
    file,
    dir: path.dirname(file) === '.' ? '' : path.dirname(file),
    compilerOptions: value.compilerOptions,
    files: value.files,
    include: value.include,
    exclude: value.exclude,
    extends: value.extends,
    references: value.references,
  };
}

function projectCovers(project: TsProject, viteFile: string): boolean | null {
  if (project.exclude !== undefined) {
    return null;
  }

  if (project.dir !== '') {
    return false;
  }

  if (project.files !== undefined) {
    if (!isStringArray(project.files)) {
      return null;
    }

    if (project.files.some((entry) => normalizeSlashes(entry) === viteFile)) {
      return true;
    }
  }

  if (project.include === undefined) {
    if (project.files !== undefined) {
      return false;
    }

    return project.extends === undefined ? true : null;
  }

  return includeCovers(project.include, viteFile);
}

function includeCovers(include: unknown, file: string): boolean | null {
  if (!isStringArray(include)) {
    return null;
  }

  for (const glob of include) {
    const verdict = globCovers(normalizeSlashes(glob), file);

    if (verdict === null) {
      return null;
    }

    if (verdict) {
      return true;
    }
  }

  return false;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globCovers(glob: string, file: string): boolean | null {
  if (/[{}[\]?]/.test(glob)) {
    return null;
  }

  const pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  return new RegExp(`^${pattern}$`).test(file);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
