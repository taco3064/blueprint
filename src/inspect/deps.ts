import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { moduleDepth } from '../config';
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

/**
 * One node's fan-in / fan-out, the unit of every `deps` answer.
 *
 * `module` means what the project's own shape means by it: the inner thing on
 * a flat project, which is the only granularity there, and the feature module
 * under `architecture.modules`, where the inner thing is a {@link UnitDeps}.
 */
export interface ModuleDeps {
  module: string;
  /** Who imports it — the blast radius of changing it. */
  importedBy: string[];
  /** What it imports. */
  imports: string[];
}

/**
 * One unit's fan-in / fan-out inside its module — `Fighter/hooks/useInput`.
 *
 * Named apart from {@link ModuleDeps} rather than sharing its key, because
 * after `architecture.modules` the word means two things and one `module` key
 * holding both is debt handed to the next major. `4.0.0` is where the rename
 * is free.
 */
export interface UnitDeps {
  unit: string;
  /** Who imports it. Always inside `module` — see {@link runDeps}. */
  importedBy: string[];
  imports: string[];
  /** The feature module this unit lives in. */
  module: string;
  /** Which modules import THAT — the blast radius the unit's own list stops at. */
  moduleImportedBy: string[];
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
): Promise<{ ok: boolean; modules: ModuleDeps[]; units: UnitDeps[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const { architecture } = blueprint;
  const scanned = scan(root, architecture.sourceRoot);
  const graph = buildModuleGraph(scanned, architecture);
  const layoutOf = layoutResolver(architecture);
  const layerNames = new Set(architecture.layers.map((layer) => layer.name));
  const depth = moduleDepth(architecture);

  // The graph's own granularity: units on a modular project, and on a flat one
  // the only granularity it has.
  const nodes = collect(graph.modules, graph.edges);

  // Declared modules bound the top level under `modules`; declared layers do on
  // a flat project. Same question — "is this folder in the graph at all" — asked
  // of whatever occupies that level.
  const declared = architecture.modules === undefined
    ? layerNames
    : new Set(architecture.modules.map((module) => module.name));

  const skipped = skippedFolders(scanned, declared);
  const modules = depth > 0 ? collapse(nodes) : nodes;

  // undecidable, the depth test: on a flat project `withModuleFanIn` answers
  // nothing anyway. It pairs each node with the module row whose name is that
  // node's first segment, and a flat graph has no row keyed by a bare layer —
  // `hooks/useCart` is a node, `hooks` is not. The test stays because "a flat
  // project reports one granularity" is the decision, not a coincidence of
  // which keys the graph happens to hold.
  const units = depth > 0 ? withModuleFanIn(nodes, modules) : [];

  if (options.target !== undefined) {
    const key = normalizeTarget(options.target, layoutOf, depth);
    const unit = units.find((entry) => entry.unit === key);
    const found = unit ?? modules.find((entry) => entry.module === key);

    if (!found) {
      log(unknownTarget(key, skipped));

      return { ok: false, modules: [], units: [] };
    }

    log(
      options.json
        // `derivation` rides along in the JSON for the same reason it closes the text:
        // the agent piping this into a decision has no other channel, and every key
        // beside it is a graph-derived fact.
        ? JSON.stringify({ ...found, derivation: importGraphDerivation() }, null, 2)
        : unit
          ? renderUnit(unit)
          : renderModule(found as ModuleDeps, isFlatLayer(key, layerNames, layoutOf)),
    );

    return unit
      ? { ok: true, modules: [], units: [unit] }
      : { ok: true, modules: [found as ModuleDeps], units: [] };
  }

  log(
    options.json
      // Both rankings, labelled by their key: they answer different questions,
      // and one list would silently answer whichever the reader did not ask.
      ? JSON.stringify(
          depth > 0
            ? { modules, units, skipped, derivation: importGraphDerivation() }
            : { modules, skipped, derivation: importGraphDerivation() },
          null,
          2,
        )
      : renderLeaderboard(modules, units, skipped, layerNames, layoutOf),
  );

  return { ok: true, modules, units };
}

/** The feature a node key belongs to — its first segment. */
function featureOf(key: string): string {
  return key.split('/')[0];
}

/** The unit graph read one level out: every node collapsed onto its module. */
function collapse(nodes: ModuleDeps[]): ModuleDeps[] {
  const edges = new Map<string, Set<string>>();
  const names = new Set<string>();

  for (const node of nodes) {
    const from = featureOf(node.module);

    names.add(from);

    for (const to of node.imports.map(featureOf)) {
      if (to !== from) edges.set(from, (edges.get(from) ?? new Set()).add(to));
    }
  }

  return collect(names, edges);
}

/**
 * Each unit, keyed as one, closing with its module's own fan-in.
 *
 * A unit's blast radius stops at the module boundary — nothing outside can
 * reach it, because a cross-module import resolves to an entry and passing a
 * dependency through an entry is banned. Reporting it as if it crossed would be
 * wrong; reporting it without the module's would be useless.
 */
function withModuleFanIn(nodes: ModuleDeps[], modules: ModuleDeps[]): UnitDeps[] {
  // Walked from the modules rather than looked up per unit: every unit's
  // feature is in that list by construction — `collapse` builds it from these
  // same nodes — so there is no absent case to invent an answer for.
  return modules
    .flatMap((module) =>
      nodes
        .filter((node) => node.module.includes('/') && featureOf(node.module) === module.module)
        .map((node) => ({
          unit: node.module,
          importedBy: node.importedBy,
          imports: node.imports,
          module: module.module,
          moduleImportedBy: module.importedBy,
        })))
    .sort((a, b) => b.importedBy.length - a.importedBy.length || a.unit.localeCompare(b.unit));
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

  // No sort of its own: `scan` walks in name order, so first-encounter order IS
  // name order, and a sort here would repair an order already settled upstream.
  return [...new Set(folders)];
}

/**
 * A single-segment key that IS a flat-layout layer answers at layer granularity.
 *
 * The `layerNames` half used to be undecidable, on the premise that
 * `buildModuleGraph` never built a single-segment key that was not a layer
 * name. It builds them now — every feature module is one — and without that
 * half `layoutOf` answers `flat` for any name it does not know, so every
 * module row would be labelled a flat layer.
 */
function isFlatLayer(module: string, layerNames: Set<string>, layoutOf: LayoutOf): boolean {
  return !module.includes('/') && layerNames.has(module) && layoutOf(module) === 'flat';
}

/**
 * `src/hooks/useCart/useCart.ts` / `hooks/useCart` / `./src/hooks` → node key.
 *
 * The same offset the graph was built at, so the two addressing forms fall out
 * of one parse rather than a branch: under `modules` a single segment IS a
 * feature and anything longer is a unit inside one, which is exactly what
 * `moduleKey` already decides.
 */
function normalizeTarget(input: string, layoutOf: LayoutOf, depth: number): string {
  const segments = input.split('/').filter((part) => part !== '' && part !== '.');
  const rest = segments[0] === 'src' ? segments.slice(1) : segments;

  return moduleKey(rest, layoutOf, depth);
}

/** The not-found message — pointing at the skipped folder when that is the cause. */
function unknownTarget(key: string, skipped: string[]): string {
  const folder = key.split('/')[0];

  return skipped.includes(folder)
    ? `✗ "${folder}/" is not a declared layer — deps only sees modules under declared layers.`
    : `✗ Unknown module "${key}" — run \`blueprint deps\` to list every module.`;
}

/**
 * Both `deps` renderings close on how the graph was read, and the per-module answer
 * needs it most: a fan-in of 3 that a dynamic import made 4 is a wrong decision,
 * not an incomplete list.
 */
function renderModule(entry: ModuleDeps, flatLayer: boolean): string {
  return [
    entry.module + (flatLayer ? ' (flat layer — answers at layer granularity)' : ''),
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((module) => `    ← ${module}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((module) => `    → ${module}`),
    '',
    importGraphDerivation('  '),
  ].join('\n');
}

/** One unit's answer: its own radius, then the boundary that bounds it. */
function renderUnit(entry: UnitDeps): string {
  return [
    entry.unit,
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((unit) => `    ← ${unit}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((unit) => `    → ${unit}`),
    // Stated, not left to be noticed: a reader who takes this count for the
    // whole blast radius under-reads it, and one who takes it for a
    // cross-module radius over-reads it. Neither is what the number is.
    `  Every importer above is inside "${entry.module}" — a unit is unreachable from outside its`,
    '  module, since a cross-module import resolves to an entry and passing a dependency',
    '  through one is banned. So the radius beyond this module is the module\'s own:',
    entry.moduleImportedBy.length
      ? `  "${entry.module}" is imported by (${entry.moduleImportedBy.length}): ${entry.moduleImportedBy.join(', ')}`
      : `  "${entry.module}" is imported by nothing — this unit's radius ends here.`,
    '',
    importGraphDerivation('  '),
  ].join('\n');
}

function renderLeaderboard(
  modules: ModuleDeps[],
  units: UnitDeps[],
  skipped: string[],
  layerNames: Set<string>,
  layoutOf: LayoutOf,
): string {
  if (!modules.length) return 'No modules found under the declared layers.';

  // Only ever called with rows — both call sites are behind a length guard.
  const rank = (rows: { key: string; count: number; note?: string }[]) => {
    const width = String(rows[0].count).length;

    return rows.map((row) => `  ${String(row.count).padStart(width)} ← ${row.key}${row.note ?? ''}`);
  };

  const note = skipped.length
    ? [`  (not under a declared layer, invisible to deps: ${skipped.join('/, ')}/)`]
    : [];

  // Two rankings on a modular project, each labelled: they answer different
  // questions — which feature is load-bearing, and which unit is — and a single
  // list silently answers whichever one the reader did not ask.
  const unitBlock = units.length
    ? [
        '',
        'Blast radius per unit (inside its own module — imported-by count):',
        ...rank(units.map((entry) => ({ key: entry.unit, count: entry.importedBy.length }))),
      ]
    : [];

  return [
    units.length
      ? 'Blast radius per module (imported-by count):'
      : 'Blast radius (imported-by count):',
    ...rank(modules.map((entry) => ({
      key: entry.module,
      count: entry.importedBy.length,
      note: isFlatLayer(entry.module, layerNames, layoutOf) ? ' (flat layer)' : undefined,
    }))),
    ...unitBlock,
    ...note,
    '',
    importGraphDerivation('  '),
  ].join('\n');
}
