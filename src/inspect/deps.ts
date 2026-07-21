import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { buildModuleGraph, layoutResolver, moduleKey } from './resolve';
import type { LayoutOf } from './resolve';
import { scan } from './scan';
import type { ScanResult } from './types';

export interface DepsOptions extends ResolveOptions {
  /** Module to query, e.g. `hooks/useCart` or `src/hooks/useCart/useCart.ts`. */
  target?: string;
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** One module's fan-in / fan-out, the unit of every `deps` answer. */
export interface ModuleDeps {
  module: string;
  /** Who imports it — the blast radius of changing it. */
  importedBy: string[];
  /** What it imports. */
  imports: string[];
}

/**
 * Run `blueprint deps` in `root`. Read-only. With a target, answers "who
 * gets hit if I change this module" (reverse deps + own imports); without
 * one, prints the blast-radius leaderboard — every module sorted by fan-in.
 */
export async function runDeps(
  root: string,
  options: DepsOptions = {},
): Promise<{ ok: boolean; modules: ModuleDeps[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const { architecture } = blueprint;
  const scanned = scan(root, architecture.sourceRoot);
  const graph = buildModuleGraph(scanned, architecture);
  const modules = collect(graph.modules, graph.edges);
  const layoutOf = layoutResolver(architecture);
  const layerNames = new Set(architecture.layers.map((layer) => layer.name));
  const skipped = skippedFolders(scanned, layerNames);

  if (options.target !== undefined) {
    const key = normalizeTarget(options.target, layoutOf);
    const found = modules.find((entry) => entry.module === key);

    if (!found) {
      log(unknownTarget(key, skipped));

      return { ok: false, modules: [] };
    }

    log(
      options.json
        ? JSON.stringify(found, null, 2)
        : renderModule(found, isFlatLayer(found.module, layerNames, layoutOf)),
    );

    return { ok: true, modules: [found] };
  }

  log(
    options.json
      ? JSON.stringify({ modules, skipped }, null, 2)
      : renderLeaderboard(modules, skipped, layerNames, layoutOf),
  );

  return { ok: true, modules };
}

/** Fold the raw graph into per-module fan-in / fan-out, sorted by blast radius. */
function collect(moduleSet: Set<string>, edges: Map<string, Set<string>>): ModuleDeps[] {
  const importedBy = new Map<string, string[]>();

  for (const [from, targets] of edges) {
    for (const to of targets) {
      importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
    }
  }

  // Edge targets can name modules with no scanned file of their own (e.g. a
  // declared-layer entry that only re-exports) — keep them queryable too.
  const all = new Set([...moduleSet, ...importedBy.keys()]);

  return [...all]
    .map((module) => ({
      module,
      importedBy: (importedBy.get(module) ?? []).sort(),
      imports: [...(edges.get(module) ?? [])].sort(),
    }))
    .sort(
      (a, b) => b.importedBy.length - a.importedBy.length || a.module.localeCompare(b.module),
    );
}

/** Top-level sourceRoot folders outside the declared layers — invisible to deps. */
function skippedFolders(scanned: ScanResult, layerNames: Set<string>): string[] {
  const folders = scanned.files
    .filter((file) => file.segments.length > 1 && !layerNames.has(file.segments[0]))
    .map((file) => file.segments[0]);

  return [...new Set(folders)].sort();
}

/** A single-segment module that IS a flat-layout layer answers at layer granularity. */
function isFlatLayer(module: string, layerNames: Set<string>, layoutOf: LayoutOf): boolean {
  return !module.includes('/') && layerNames.has(module) && layoutOf(module) === 'flat';
}

/** `src/hooks/useCart/useCart.ts` / `hooks/useCart` / `./src/hooks` → module key. */
function normalizeTarget(input: string, layoutOf: LayoutOf): string {
  const segments = input.split('/').filter((part) => part !== '' && part !== '.');
  const rest = segments[0] === 'src' ? segments.slice(1) : segments;

  return moduleKey(rest, layoutOf);
}

/** The not-found message — pointing at the skipped folder when that is the cause. */
function unknownTarget(key: string, skipped: string[]): string {
  const folder = key.split('/')[0];

  return skipped.includes(folder)
    ? `✗ "${folder}/" is not a declared layer — deps only sees modules under declared layers.`
    : `✗ Unknown module "${key}" — run \`blueprint deps\` to list every module.`;
}

function renderModule(entry: ModuleDeps, flatLayer: boolean): string {
  return [
    entry.module + (flatLayer ? ' (flat layer — answers at layer granularity)' : ''),
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((module) => `    ← ${module}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((module) => `    → ${module}`),
  ].join('\n');
}

function renderLeaderboard(
  modules: ModuleDeps[],
  skipped: string[],
  layerNames: Set<string>,
  layoutOf: LayoutOf,
): string {
  if (!modules.length) return 'No modules found under the declared layers.';

  const width = String(modules[0].importedBy.length).length;

  const note = skipped.length
    ? [`  (not under a declared layer, invisible to deps: ${skipped.join('/, ')}/)`]
    : [];

  return [
    'Blast radius (imported-by count):',
    ...modules.map(
      (entry) =>
        `  ${String(entry.importedBy.length).padStart(width)} ← ${entry.module}`
        + (isFlatLayer(entry.module, layerNames, layoutOf) ? ' (flat layer)' : ''),
    ),
    ...note,
  ].join('\n');
}
