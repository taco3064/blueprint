import { emptyTestGlobs, unreachedTestGlobs } from '../emit/lint/patterns';
import { stripSourceRoot } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { testFileReach } from './coverage';
import { buildModuleGraph, layoutResolver, moduleKey } from './resolve';
import type { LayoutOf } from './resolve';
import { importGraphDerivation, scan } from './scan';
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
 * @group Runtimes
 * @example
 * const { modules } = await runDeps(process.cwd(), { target: 'hooks/useCart' });
 *
 * console.log(modules[0].importedBy); // who gets hit if I change it
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
  const testExemption = exemptionNote(modules, scanned, architecture);

  if (options.target !== undefined) {
    return reportTarget(options.target, {
      modules, skipped, layerNames, layoutOf, architecture, log, testExemption, json: options.json,
    });
  }

  log(
    options.json
      ? JSON.stringify(

          { modules, skipped, ...exemptionKey(testExemption), derivation: importGraphDerivation() },
          null,
          2,
        )
      : renderLeaderboard(modules, skipped, { layerNames, layoutOf, testExemption }),
  );

  return { ok: true, modules };
}

function exemptionNote(
  modules: ModuleDeps[],
  scanned: ScanResult,
  architecture: Blueprint['architecture'],
): string | null {
  const { testFiles, sourceRoot } = architecture;

  if (!modules.length) {
    return null;
  }

  const cause = unreachedTestGlobs(testFileReach(scanned, testFiles, sourceRoot))
    ?? emptyTestGlobs(testFiles);

  return cause === null
    ? null
    : `${cause} — and the blast radius above is counted under the net as written, so `
      + 'nothing in it was exempted through them';
}

function exemptionKey(testExemption: string | null): { testExemption?: string } {
  return testExemption === null ? {} : { testExemption };
}

function reportTarget(
  target: string,
  ctx: {
    modules: ModuleDeps[];
    skipped: string[];
    layerNames: Set<string>;
    layoutOf: LayoutOf;
    architecture: ArchitectureDef;
    log: (message: string) => void;
    testExemption: string | null;
    json?: boolean;
  },
): { ok: boolean; modules: ModuleDeps[] } {
  const { modules, skipped, layerNames, layoutOf, architecture, log, testExemption } = ctx;
  const key = normalizeTarget(target, architecture, layoutOf);
  const found = modules.find((entry) => entry.module === key);

  if (!found) {
    log(unknownTarget(key, skipped));

    return { ok: false, modules: [] };
  }

  log(
    ctx.json

      ? JSON.stringify(
          { ...found, ...exemptionKey(testExemption), derivation: importGraphDerivation() },
          null,
          2,
        )
      : renderModule(found, isFlatLayer(found.module, layerNames, layoutOf), testExemption),
  );

  return { ok: true, modules: [found] };
}

function collect(moduleSet: Set<string>, edges: Map<string, Set<string>>): ModuleDeps[] {
  const importedBy = new Map<string, string[]>();

  for (const [from, targets] of edges) {
    for (const to of targets) {
      importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
    }
  }

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

function skippedFolders(scanned: ScanResult, layerNames: Set<string>): string[] {
  const folders = scanned.files
    .filter((file) => file.segments.length > 1 && !layerNames.has(file.segments[0]))
    .map((file) => file.segments[0]);

  return [...new Set(folders)];
}

function isFlatLayer(module: string, layerNames: Set<string>, layoutOf: LayoutOf): boolean {
  // Stryker disable next-line LogicalOperator: graph keys never include a non-layer single segment.
  return !module.includes('/') && layerNames.has(module) && layoutOf(module) === 'flat';
}

function normalizeTarget(
  input: string,
  architecture: ArchitectureDef,
  layoutOf: LayoutOf,
): string {
  return moduleKey(stripSourceRoot(input, architecture), layoutOf);
}

function unknownTarget(key: string, skipped: string[]): string {
  const folder = key.split('/')[0];

  return skipped.includes(folder)
    ? `✗ "${folder}/" is not a declared layer — deps only sees modules under declared layers.`
    : `✗ Unknown module "${key}" — run \`blueprint deps\` to list every module.`;
}

function renderModule(
  entry: ModuleDeps,
  flatLayer: boolean,
  testExemption: string | null,
): string {
  return [
    entry.module + (flatLayer ? ' (flat layer — answers at layer granularity)' : ''),
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((module) => `    ← ${module}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((module) => `    → ${module}`),
    ...exemptionLine(testExemption),
    '',
    importGraphDerivation('  '),
  ].join('\n');
}

function exemptionLine(testExemption: string | null): string[] {
  return testExemption === null ? [] : [`  · ${testExemption}`];
}

function renderLeaderboard(
  modules: ModuleDeps[],
  skipped: string[],
  shape: { layerNames: Set<string>; layoutOf: LayoutOf; testExemption: string | null },
): string {
  const { layerNames, layoutOf, testExemption } = shape;

  if (!modules.length) {
    return 'No modules found under the declared layers.';
  }

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
    ...exemptionLine(testExemption),
    '',
    importGraphDerivation('  '),
  ].join('\n');
}
