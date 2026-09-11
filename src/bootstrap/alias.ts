import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { parseJsonc, pathAliasKeys, quotedIn, toolchainForProject } from '../project';
import type { ProjectToolchain, ProjectState } from '../project';
import { wireTsconfigPaths, wireViteAlias } from './wire';
import type { Action } from './types';

function aliasTarget(target: string, toolRoot: string): string {
  const relative = toolRoot && !path.isAbsolute(target)
    ? path.posix.relative(toolRoot, target)
    : target;

  return `${normalizeDir(relative || '.')}/*`;
}

export function aliasPaths(architecture: ArchitectureDef, toolRoot = ''): Record<string, string[]> {
  const entries: [string, string[]][] = resolveArchitecture(architecture).aliasMappings
    .map(([alias, target]) => [`${alias}/*`, [aliasTarget(target, toolRoot)]]);

  return Object.fromEntries(entries);
}

export type PatchResult
  = | { kind: 'patched'; text: string }
    | { kind: 'noop' }
    | { kind: 'unparseable' };

export function patchTsconfigPaths(
  text: string,
  paths: Record<string, string[]>,
): PatchResult {
  let config: unknown;

  try {
    config = JSON.parse(text);
  } catch {
    return jsoncAlreadyWired(text, paths) ? { kind: 'noop' } : { kind: 'unparseable' };
  }

  if (!isRecord(config) || ('compilerOptions' in config && !isRecord(config.compilerOptions))) {
    return { kind: 'unparseable' };
  }

  const options = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  const existing = isRecord(options.paths) ? options.paths : {};
  const missing = Object.entries(paths).filter(([alias]) => !(alias in existing));

  if (!missing.length) {
    return { kind: 'noop' };
  }

  const patched = {
    ...config,
    compilerOptions: {
      ...options,
      paths: { ...existing, ...Object.fromEntries(missing) },
    },
  };

  return { kind: 'patched', text: render(patched) };
}

function jsoncAlreadyWired(text: string, paths: Record<string, string[]>): boolean {
  const result = parseJsonc(text);

  // Stryker disable next-line BlockStatement, ConditionalExpression: fallthrough is false too.
  if (!result.ok) {
    return false;
  }

  const parsed = result.value;

  if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) {
    return false;
  }

  const existing = parsed.compilerOptions.paths;

  return isRecord(existing) && Object.keys(paths).every((alias) => alias in existing);
}

export function aliasActions(
  state: ProjectState,
  architecture: ArchitectureDef,
  greenfield = false,
): Action[] {
  const toolchain = toolchainForProject(state, resolveArchitecture(architecture).sourceRoot);
  const paths = aliasPaths(architecture, toolchain.root);
  const actions = tsconfigActions(state, { toolchain, paths, greenfield });

  actions.push(...bundlerActions(state, architecture, { greenfield, toolchain }));

  return actions;
}

function tsconfigActions(
  state: ProjectState,
  scope: {
    toolchain: ProjectToolchain;
    paths: Record<string, string[]>;
    greenfield: boolean;
  },
): Action[] {
  const { toolchain, paths, greenfield } = scope;
  const names = Object.keys(paths).map((name) => name.replace(/\/\*$/, ''));

  if (names.every((name) => pathAliasKeys(toolchain.tsconfigs).has(name))) {
    return [];
  }

  const target = resolveTarget(state, toolchain);

  if (target.kind === 'create') {
    return [{
      kind: 'write',
      path: toolchain.root ? `${toolchain.root}/jsconfig.json` : 'jsconfig.json',
      content: render({ compilerOptions: { paths } }),
      note: 'jsconfig.json (import alias)',
    }];
  }

  if (target.kind === 'instruct') {
    return [tsconfigInstruct(target.file, paths)];
  }

  let result = patchTsconfigPaths(target.text, paths);

  if (result.kind === 'unparseable' && greenfield) {
    result = wireTsconfigPaths(target.text, paths);
  }

  if (result.kind === 'patched') {
    return [{
      kind: 'write',
      path: target.file,
      content: result.text,
      note: `${target.file} (import alias added — existing content preserved)`,
    }];
  }

  return result.kind === 'unparseable' ? [tsconfigInstruct(target.file, paths)] : [];
}

function bundlerActions(
  state: ProjectState,
  architecture: ArchitectureDef,
  scope: { greenfield: boolean; toolchain: ProjectToolchain },
): Action[] {
  const { greenfield, toolchain } = scope;

  if (greenfield && toolchain.viteConfig && !architecture.additionalAliases) {
    const root = aliasTarget(
      resolveArchitecture(architecture).sourceRoot,
      toolchain.root,
    ).slice(0, -2);

    const result = wireViteAlias(toolchain.viteConfig.text, architecture.alias, root);

    if (result.kind === 'patched') {
      return [
        {
          kind: 'write',
          path: toolchain.viteConfig.file,
          content: result.text,
          note: `${toolchain.viteConfig.file} (import alias added — existing content preserved)`,
        },
      ];
    }
  }

  const vite = toolchain.viteConfig;
  const names = resolveArchitecture(architecture).aliasMappings.map(([alias]) => alias);

  if (vite && names.every((name) => quotedIn(vite.text, name))) {
    return [];
  }

  if (vite && vite.text.includes('tsconfig-paths')) {
    return [];
  }

  return [bundlerInstruct(architecture, toolchain, state.hasViteConfig)];
}

type Target
  = | { kind: 'create' }
    | { kind: 'patch'; file: string; text: string }
    | { kind: 'instruct'; file: string };

function resolveTarget(state: ProjectState, toolchain: ProjectToolchain): Target {
  const { hasTypescript } = state;
  const at = (file: string) => toolchain.root ? `${toolchain.root}/${file}` : file;
  const rootFile = at('tsconfig.json');
  const root = toolchain.tsconfigs[rootFile];

  if (root != null) {
    return rootTarget(root, rootFile, toolchain);
  }

  const jsFile = at('jsconfig.json');
  const js = toolchain.tsconfigs[jsFile];

  if (js != null) {
    return { kind: 'patch', file: jsFile, text: js };
  }

  return hasTypescript ? { kind: 'instruct', file: rootFile } : { kind: 'create' };
}

function rootTarget(
  root: string,
  rootFile: string,
  toolchain: ProjectToolchain,
): Target {
  const appFile = rootFile.replace(/tsconfig\.json$/, 'tsconfig.app.json');
  const app = toolchain.tsconfigs[appFile];

  if (app != null && isReferencesShell(root)) {
    return { kind: 'patch', file: appFile, text: app };
  }

  const referenced = isReferencesShell(root) ? referencedTarget(toolchain, rootFile) : null;

  return referenced ?? { kind: 'patch', file: rootFile, text: root };
}

function referencedTarget(toolchain: ProjectToolchain, rootFile: string): Target | null {
  for (const [file, text] of Object.entries(toolchain.tsconfigs)) {
    if (file === rootFile || text === null) {
      continue;
    }

    return { kind: 'patch', file, text };
  }

  return null;
}

function isReferencesShell(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);

    return isRecord(parsed) && Array.isArray(parsed.references) && !('compilerOptions' in parsed);
  } catch (
    // Stryker disable next-line BlockStatement: caller treats this fallback as falsy.
    error) {
    void error;

    return false;
  }
}

function tsconfigInstruct(file: string, paths: Record<string, string[]>): Action {
  return {
    kind: 'instruct',
    note: `Add the import alias to ${file} under compilerOptions:\n    "paths": ${JSON.stringify(paths)}\n  (no "baseUrl" needed — modern TypeScript resolves paths without it, and it is deprecated in 7.0)`,
  };
}

function bundlerInstruct(
  architecture: ArchitectureDef,
  toolchain: ProjectToolchain,
  hasViteConfig: boolean,
): Action {
  if (!toolchain.viteConfig && !hasViteConfig) {
    return {
      kind: 'instruct',
      note: `Set the import alias "${architecture.alias}" in your bundler — the lint rules resolve against it.`,
    };
  }

  const lines = resolveArchitecture(architecture).aliasMappings.map(
    ([alias, dir]) => `'${alias}': fileURLToPath(new URL('${aliasTarget(dir, toolchain.root).replace(/\/\*$/, '')}', import.meta.url))`,
  );

  return {
    kind: 'instruct',
    note: `Add the alias to ${toolchain.viteConfig?.file ?? 'vite.config'} under resolve.alias:\n    resolve: { alias: { ${lines.join(', ')} } }\n  (if this application config delegates to workspace Vite configuration, verify the alias there; already bridging tsconfig paths into Vite — e.g. vite-tsconfig-paths? Then the tsconfig side covers the bundler and this step is done.)`,
  };
}

function normalizeDir(dir: string): string {
  const trimmed = dir.replace(/\/+$/, '');

  return trimmed.startsWith('.') || trimmed.startsWith('/') ? trimmed : `./${trimmed}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
