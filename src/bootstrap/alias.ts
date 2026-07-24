import type { ArchitectureDef } from '../config';
import { parseJsonc, quotedIn } from '../project';
import type { ProjectState } from '../project';
import { wireTsconfigPaths, wireViteAlias } from './wire';
import type { Action } from './types';

/**
 * The alias concern of `init`: wire `architecture.alias` (and any
 * `additionalAliases`) into the project. One rule governs every branch —
 * a user file is only edited when it can be rewritten losslessly
 * (`JSON.parse` succeeds = no comments to destroy); anything else gets an
 * instruct action carrying a paste-ready snippet. Bundler configs are JS,
 * never lossless, so the bundler side is always an instruct.
 */

/** The primary alias's tsconfig target, e.g. `./src/*` (or `./*` at the project root). */
function aliasTarget(architecture: ArchitectureDef): string {
  const root = architecture.sourceRoot ?? 'src';

  return root === '.' ? './*' : `${normalizeDir(root)}/*`;
}

/** Alias → target map for tsconfig `paths`, e.g. `{ "~app/*": ["./src/*"] }`. */
export function aliasPaths(architecture: ArchitectureDef): Record<string, string[]> {
  const entries: [string, string[]][] = [
    [`${architecture.alias}/*`, [aliasTarget(architecture)]],
    ...Object.entries(architecture.additionalAliases ?? {}).map(
      ([alias, target]): [string, string[]] => [`${alias}/*`, [`${normalizeDir(target)}/*`]],
    ),
  ];

  return Object.fromEntries(entries);
}

export type PatchResult
  = | { kind: 'patched'; text: string }
    | { kind: 'noop' }
    | { kind: 'unparseable' };

/**
 * Add missing `paths` entries to a tsconfig/jsconfig body. `unparseable`
 * covers comments (JSONC) and shapes that cannot be rewritten without
 * destroying user intent; `noop` means every alias is already declared.
 */
export function patchTsconfigPaths(
  text: string,
  paths: Record<string, string[]>,
): PatchResult {
  let config: unknown;

  try {
    config = JSON.parse(text);
  } catch {
    // JSONC defeats the lossless rewrite — but the aliases may already be
    // wired (a prior init's greenfield surgery, or the user's own hand).
    // Re-instructing then reads as a regression, so check presence through
    // the tolerant parse before giving up.
    return jsoncAlreadyWired(text, paths) ? { kind: 'noop' } : { kind: 'unparseable' };
  }

  if (!isRecord(config) || ('compilerOptions' in config && !isRecord(config.compilerOptions))) {
    return { kind: 'unparseable' };
  }

  const options = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  const existing = isRecord(options.paths) ? options.paths : {};
  const missing = Object.entries(paths).filter(([alias]) => !(alias in existing));

  if (!missing.length) return { kind: 'noop' };

  const patched = {
    ...config,
    compilerOptions: {
      ...options,
      paths: { ...existing, ...Object.fromEntries(missing) },
    },
  };

  return { kind: 'patched', text: render(patched) };
}

/** Every alias already present in a JSONC config's `compilerOptions.paths`. */
function jsoncAlreadyWired(text: string, paths: Record<string, string[]>): boolean {
  const parsed = parseJsonc(text);

  if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) return false;

  const existing = parsed.compilerOptions.paths;

  return isRecord(existing) && Object.keys(paths).every((alias) => alias in existing);
}

/**
 * The `init` actions that wire the alias: tsconfig side + bundler side.
 * `greenfield` marks a fresh scaffold (init generated the blueprint config in
 * this very run) — there, the template's own vite/tsconfig files are part of
 * the setup moment and get precondition-guarded surgery instead of instructs.
 */
export function aliasActions(
  state: ProjectState,
  architecture: ArchitectureDef,
  greenfield = false,
): Action[] {
  const paths = aliasPaths(architecture);
  const actions: Action[] = [];
  const target = resolveTarget(state);

  if (target.kind === 'create') {
    actions.push({
      kind: 'write',
      path: 'jsconfig.json',
      content: render({ compilerOptions: { paths } }),
      note: 'jsconfig.json (import alias)',
    });
  } else if (target.kind === 'instruct') {
    actions.push(tsconfigInstruct(target.file, paths));
  } else {
    let result = patchTsconfigPaths(target.text, paths);

    // Commented (JSONC) template configs defeat the lossless rewrite; on a
    // fresh scaffold the comment-preserving insertion takes over.
    if (result.kind === 'unparseable' && greenfield) {
      result = wireTsconfigPaths(target.text, paths);
    }

    if (result.kind === 'patched') {
      actions.push({
        kind: 'write',
        path: target.file,
        content: result.text,
        // "write" alone reads as a rewrite — a field agent re-read the file
        // to confirm its content survived. Say the edit's shape in place.
        note: `${target.file} (import alias added — existing content preserved)`,
      });
    } else if (result.kind === 'unparseable') {
      actions.push(tsconfigInstruct(target.file, paths));
    }
    // noop — the alias is already wired; nothing to do.
  }

  actions.push(...bundlerActions(state, architecture, greenfield));

  return actions;
}

/** Bundler side: greenfield surgery on a template-shaped vite config, else an instruct. */
function bundlerActions(
  state: ProjectState,
  architecture: ArchitectureDef,
  greenfield: boolean,
): Action[] {
  if (greenfield && state.viteConfig && !architecture.additionalAliases) {
    const root = architecture.sourceRoot ?? 'src';
    const result = wireViteAlias(state.viteConfig.text, architecture.alias, root === '.' ? '.' : `./${root}`);

    if (result.kind === 'patched') {
      return [
        {
          kind: 'write',
          path: state.viteConfig.file,
          content: result.text,
          note: `${state.viteConfig.file} (import alias added — existing content preserved)`,
        },
      ];
    }
  }

  // A vite config already carrying every alias as a quoted token is wired by
  // doctor's own standard — a prior init's surgery, or the user's hand. Init
  // must not re-instruct what its check already accepts: the nag reads as a
  // regression on every re-run.
  const vite = state.viteConfig;
  const names = [architecture.alias, ...Object.keys(architecture.additionalAliases ?? {})];

  if (vite && names.every((name) => quotedIn(vite.text, name))) return [];

  // A tsconfig-paths bridge plugin (vite-tsconfig-paths & friends) makes the
  // tsconfig side — which init wires above — authoritative for the bundler
  // too. Instructing resolve.alias on top asks for a redundant second wiring
  // that doctor's check never required: on one field repo init said "add the
  // alias to vite.config" while doctor passed untouched (field issue #25).
  if (vite && vite.text.includes('tsconfig-paths')) return [];

  return [bundlerInstruct(state, architecture)];
}

type Target
  = | { kind: 'create' }
    | { kind: 'patch'; file: string; text: string }
    | { kind: 'instruct'; file: string };

/**
 * Which config file carries the alias. A root tsconfig that is a pure
 * `references` shell (create-vite style) defers to `tsconfig.app.json`;
 * a TS project with no tsconfig at all gets an instruct — `init` does not
 * invent a tsconfig for a TypeScript setup it cannot see.
 */
function resolveTarget(state: ProjectState): Target {
  const { tsconfigs, hasTypescript } = state;
  const root = tsconfigs['tsconfig.json'];

  if (root != null) {
    const app = tsconfigs['tsconfig.app.json'];

    if (app != null && isReferencesShell(root)) {
      return { kind: 'patch', file: 'tsconfig.app.json', text: app };
    }

    return { kind: 'patch', file: 'tsconfig.json', text: root };
  }

  const js = tsconfigs['jsconfig.json'];

  if (js != null) return { kind: 'patch', file: 'jsconfig.json', text: js };

  return hasTypescript ? { kind: 'instruct', file: 'tsconfig.json' } : { kind: 'create' };
}

function isReferencesShell(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);

    return isRecord(parsed) && Array.isArray(parsed.references) && !('compilerOptions' in parsed);
  } catch {
    return false; // The patch attempt will surface `unparseable` on the root itself.
  }
}

function tsconfigInstruct(file: string, paths: Record<string, string[]>): Action {
  return {
    kind: 'instruct',
    note: `Add the import alias to ${file} under compilerOptions:\n    "paths": ${JSON.stringify(paths)}\n  (no "baseUrl" needed — modern TypeScript resolves paths without it, and it is deprecated in 7.0)`,
  };
}

/** The bundler always needs the alias too; JS configs are never edited. */
function bundlerInstruct(state: ProjectState, architecture: ArchitectureDef): Action {
  if (!state.hasViteConfig) {
    return {
      kind: 'instruct',
      note: `Set the import alias "${architecture.alias}" in your bundler — the lint rules resolve against it.`,
    };
  }

  const lines = [
    [architecture.alias, architecture.sourceRoot ?? 'src'] as const,
    ...Object.entries(architecture.additionalAliases ?? {}),
  ].map(
    ([alias, dir]) => `'${alias}': fileURLToPath(new URL('${normalizeDir(dir)}', import.meta.url))`,
  );

  return {
    kind: 'instruct',
    note: `Add the alias to vite.config under resolve.alias:\n    resolve: { alias: { ${lines.join(', ')} } }\n  (already bridging tsconfig paths into vite — e.g. vite-tsconfig-paths? Then the tsconfig side covers the bundler and this step is done.)`,
  };
}

/** `src/shared/` → `./src/shared` — the form both `paths` and vite snippets use. */
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
