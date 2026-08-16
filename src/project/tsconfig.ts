import fs from 'node:fs';
import path from 'node:path';

import { parseJsonc } from './jsonc';
import { readText, VITE_FILES } from './detect';

/** Visit every `compilerOptions.paths` entry across the given tsconfig texts. */
function eachPathAlias(
  tsconfigs: Record<string, string | null>,
  visit: (alias: string, dir: string | null) => void,
): void {
  for (const text of Object.values(tsconfigs)) {
    if (text == null) {
      continue;
    }

    const result = parseJsonc(text);

    // undecidable against the `?.` below, which yields no options on a failure
    // anyway; that `?.` is separately pinned by a tsconfig whose content is `null`.
    if (!result.ok) {
      continue;
    }

    const options = (result.value as { compilerOptions?: { paths?: unknown } })?.compilerOptions;
    const paths = options?.paths;

    if (typeof paths !== 'object' || paths === null) {
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

/** Aliases in tsconfig/jsconfig `paths` that map onto `src/`, e.g. `@/* → ./src/*`. */
export function detectAliases(tsconfigs: Record<string, string | null>): Record<string, string> {
  const found: Record<string, string> = {};

  eachPathAlias(tsconfigs, (alias, dir) => {
    if (dir === 'src' && !(alias in found)) {
      found[alias] = 'src';
    }
  });

  return found;
}

/** Every alias declared in `paths`, whatever its target — "can TS resolve this prefix?". */
export function pathAliasKeys(tsconfigs: Record<string, string | null>): Set<string> {
  const keys = new Set<string>();

  eachPathAlias(tsconfigs, (alias) => keys.add(alias));

  return keys;
}

// Local, not shared: the twin in `bootstrap/alias.ts` sits ABOVE this module, so
// importing it would run the one-way rule backwards for a one-line predicate.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ViteTsCoverage {
  /** `covered`: some project lists it. `outside`: projects exist, none does. */
  verdict: 'covered' | 'outside';
  /** The vite config, relative to root. */
  viteFile: string;
  /** The tsconfig that covers it, or the root one consulted when none does. */
  tsconfig: string;
}

/**
 * Whether `tsc -b` reads this repo's vite config. `null` = could not tell, never a
 * guess: the report must not claim a build verified an edit it never read.
 */
export function viteTsCoverage(root: string): ViteTsCoverage | null {
  const viteFile = VITE_FILES.find((file) => fs.existsSync(path.join(root, file)));

  // No vite config, or a JS project with no tsconfig at all: there is no
  // question to answer, and the build clause has nothing to specialise.
  if (viteFile === undefined) {
    return null;
  }

  const rootConfig = 'tsconfig.json';
  const rootText = readText(path.join(root, rootConfig));

  if (rootText === null) {
    return null;
  }

  const projects = tsProjectGraph(root, rootConfig, rootText);

  if (projects === null) {
    return null;
  }

  for (const project of projects) {
    const covers = projectCovers(project, viteFile);

    // A single undecidable project poisons the whole answer: "none of them
    // covers it" cannot be claimed while one of them is unread.
    if (covers === null) {
      return null;
    }

    if (covers) {
      return { verdict: 'covered', viteFile, tsconfig: project.file };
    }
  }

  return { verdict: 'outside', viteFile, tsconfig: rootConfig };
}

export interface TscArtifactLocation {
  /** The redirected build-info path, relative to root — the fact that decides it. */
  buildInfo: string;
  /** The tsconfig declaring it. */
  tsconfig: string;
}

/**
 * Where `tsc -b` keeps its build info, when every project in the graph provably
 * writes nothing into the working tree.
 *
 * The build-artifact paragraph opened on a premise about the adopter's repo — that
 * the build this playbook asked for left untracked files in their working tree, so
 * the four gitignore × version-control cells have something to decide. False on the
 * shape `npm create vite` generates for React + TS: both projects carry `noEmit:
 * true` AND `tsBuildInfoFile: ./node_modules/.tmp/…`, so the build leaves the tree
 * untouched and an agent copying the paragraph's instruction writes a statement
 * about untracked files that do not exist (field run #135). Third time this family
 * of sentences has been wrong about a tsconfig — `viteTsCoverage` is the second, and
 * the answer is the same one: measure it.
 *
 * Null unless certain, and only the certain negative changes the prose. "Something
 * landed" is the default the paragraph already assumes and is right about wherever a
 * bundle gets written, so this never has to establish it — a shape it cannot read is
 * a shape where the existing wording stands.
 *
 * `node_modules/` is the whole test for "out of the way", deliberately narrow: it is
 * ignored everywhere by convention, and deciding whether some other directory is
 * ignored needs the `.gitignore` reader that lives above this module.
 */
export function tscArtifactsOutOfTree(root: string): TscArtifactLocation | null {
  const rootConfig = 'tsconfig.json';
  const rootText = readText(path.join(root, rootConfig));

  if (rootText === null) {
    return null;
  }

  const projects = tsProjectGraph(root, rootConfig, rootText);

  if (projects === null) {
    return null;
  }

  let found: TscArtifactLocation | null = null;

  for (const project of projects) {
    // A solution config — pure `references`, no files of its own — builds nothing
    // and writes no build info, which is why the two-project vite shape leaves
    // exactly two files behind and both are the referenced projects'.
    if (isSolutionStub(project)) {
      continue;
    }

    const options = project.compilerOptions;

    if (!isRecord(options)) {
      return null;
    }

    const buildInfo = options.tsBuildInfoFile;

    if (options.noEmit !== true || typeof buildInfo !== 'string') {
      return null;
    }

    const rel = normalizeSlashes(buildInfo);

    if (!rel.startsWith('node_modules/')) {
      return null;
    }

    found ??= { buildInfo: rel, tsconfig: project.file };
  }

  return found;
}

/** A config that only points at others: nothing to build, nothing written. */
function isSolutionStub(project: TsProject): boolean {
  return isStringArray(project.files) && project.files.length === 0
    && project.include === undefined;
}

interface TsProject {
  /** Path relative to root, for the message. */
  file: string;
  /** Directory the config's globs resolve against, relative to root. */
  dir: string;
  compilerOptions?: unknown;
  files?: unknown;
  include?: unknown;
  exclude?: unknown;
  extends?: unknown;
}

/** The root config plus its referenced projects, one level deep; deeper = null. */
function tsProjectGraph(root: string, file: string, text: string): TsProject[] | null {
  const parsed = parseJsonc(text);

  if (!parsed.ok || !isRecord(parsed.value)) {
    return null;
  }

  const rootProject = toProject(file, parsed.value);
  const refs = rootProject.references;

  if (refs === undefined) {
    return [rootProject];
  }

  if (!Array.isArray(refs)) {
    return null;
  }

  const projects: TsProject[] = [rootProject];

  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.path !== 'string') {
      return null;
    }

    const resolved = resolveReference(root, ref.path);

    if (resolved === null) {
      return null;
    }

    const refParsed = parseJsonc(resolved.text);

    if (!refParsed.ok || !isRecord(refParsed.value)) {
      return null;
    }

    const project = toProject(resolved.file, refParsed.value);

    // Depth stops here — see the note above.
    if (project.references !== undefined) {
      return null;
    }

    projects.push(project);
  }

  return projects;
}

/** A `references[].path` may name the file or its directory. */
function resolveReference(root: string, ref: string): { file: string; text: string } | null {
  const candidates = ref.endsWith('.json') ? [ref] : [path.join(ref, 'tsconfig.json')];

  for (const candidate of candidates) {
    const text = readText(path.join(root, candidate));

    // Normalised because this string is printed: a `references` path is written
    // `./tsconfig.node.json` as often as not, and the playbook names the file.
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

/**
 * Does `project` pull `viteFile` in? `null` for the shapes this does not
 * reimplement — `exclude`, an `extends` base, character classes, brace expansion.
 */
function projectCovers(project: TsProject, viteFile: string): boolean | null {
  if (project.exclude !== undefined) {
    return null;
  }

  // The vite config is always a ROOT file (`VITE_FILES` carries no path segments)
  // and a tsconfig's globs never reach upward.
  if (project.dir !== '') {
    return false;
  }

  const rel = viteFile;

  if (project.files !== undefined) {
    if (!isStringArray(project.files)) {
      return null;
    }

    if (project.files.some((entry) => normalizeSlashes(entry) === rel)) {
      return true;
    }
  }

  if (project.include === undefined) {
    // No `files` and no `include`: TypeScript includes everything under the
    // config's directory — unless `extends` supplies globs this cannot see.
    if (project.files !== undefined) {
      return false;
    }

    return project.extends === undefined ? true : null;
  }

  if (!isStringArray(project.include)) {
    return null;
  }

  for (const glob of project.include) {
    const verdict = globCovers(normalizeSlashes(glob), rel);

    if (verdict === null) {
      return null;
    }

    if (verdict) {
      return true;
    }
  }

  return false;
}

// undecidable on the `^` anchor: unanchored it strips a mid-path `./`, and every
// path a tsconfig can hold resolves the same either way. It stays because it spells
// the intent — strip a LEADING `./` — not because any reachable input needs it.
function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Does a tsconfig `include` glob cover `file`? Braces and character classes
 * return null — an unusual glob yields no verdict, never a wrong one.
 */
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
