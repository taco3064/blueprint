// Import from the patterns leaf, not the emit/lint index — the index also
// exports lint.ts, which loads the plugin, which shares resolve logic with
// inspect; routing through the index would close a module cycle.
import { unreachedTestGlobs } from '../emit/lint/patterns';
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
  const testExemption = exemptionNote(modules, scanned, architecture.testFiles);

  if (options.target !== undefined) {
    return reportTarget(options.target, {
      modules, skipped, layerNames, layoutOf, log, testExemption, json: options.json,
    });
  }

  log(
    options.json
      ? JSON.stringify(
          // Absent, not null, and the same string the text prints: a key always
          // present reads as "measured, nothing wrong" from a channel that cannot
          // see the other one.
          { modules, skipped, ...exemptionKey(testExemption), derivation: importGraphDerivation() },
          null,
          2,
        )
      : renderLeaderboard(modules, skipped, { layerNames, layoutOf, testExemption }),
  );

  return { ok: true, modules };
}

/**
 * Why the counts it prints under are the counts they are, when a declared
 * `architecture.testFiles` entry reaches no file here. `inspect`'s sentence, printed
 * verbatim rather than paraphrased for this surface — two positions on one question is
 * the contradiction an adopter meets before we do — with one clause added for what it
 * costs HERE.
 *
 * The clause is needed because the shared sentence names the surfaces it was written
 * for ("inspected and linted as ordinary source") and this is a third one: a reader
 * looking at a fan-in that moved would otherwise read those two truths as unrelated.
 * It claims nothing about the tree, so it stays true of the state where the entry is
 * runway rather than a typo and there is no such file to count.
 *
 * Not on the empty leaderboard and not on the unknown-target message, and on NEITHER
 * channel: a dead entry only ever ADDS files to this graph, so it can be the cause of a
 * count but never of a module that is missing. Decided here rather than in a renderer,
 * because the renderer only speaks for the text — a `--json` payload emitting a cause
 * the text suppressed is two answers about one run.
 */
function exemptionNote(
  modules: ModuleDeps[],
  scanned: ScanResult,
  testFiles: string | string[] | undefined,
): string | null {
  // The one decision, and both renderings read it: the sentence closes on "the blast
  // radius above", so a graph with no module in it has nothing for it to be about. The
  // text renderer keeps an early return of its own, and it decides nothing here.
  const cause = modules.length ? unreachedTestGlobs(testFileReach(scanned, testFiles)) : null;

  return cause === null
    ? null
    : `${cause} — and the blast radius above is counted under the net as written, so an `
      + 'import that entry was meant to exempt counts in it';
}

/** The `--json` half of {@link exemptionNote} — the key exists only when there is one. */
function exemptionKey(testExemption: string | null): { testExemption?: string } {
  return testExemption === null ? {} : { testExemption };
}

/** One module's own blast radius, or the not-found report naming what was skipped. */
function reportTarget(
  target: string,
  ctx: {
    modules: ModuleDeps[];
    skipped: string[];
    layerNames: Set<string>;
    layoutOf: LayoutOf;
    log: (message: string) => void;
    testExemption: string | null;
    json?: boolean;
  },
): { ok: boolean; modules: ModuleDeps[] } {
  const { modules, skipped, layerNames, layoutOf, log, testExemption } = ctx;
  const key = normalizeTarget(target, layoutOf);
  const found = modules.find((entry) => entry.module === key);

  if (!found) {
    log(unknownTarget(key, skipped));

    return { ok: false, modules: [] };
  }

  log(
    ctx.json
      // `derivation` rides along in the JSON for the same reason it closes the text:
      // the agent piping this into a decision has no other channel, and every key
      // beside it is a graph-derived fact.
      ? JSON.stringify(
          { ...found, ...exemptionKey(testExemption), derivation: importGraphDerivation() },
          null,
          2,
        )
      : renderModule(found, isFlatLayer(found.module, layerNames, layoutOf), testExemption),
  );

  return { ok: true, modules: [found] };
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
 * A single-segment module that IS a flat-layout layer answers at layer granularity.
 *
 * undecidable by reachability, not identity: the regrouped condition differs only
 * for a single-segment key that is not a layer name, and `buildModuleGraph` never
 * builds one. That is a claim about another function, so the `layerNames` half stays.
 */
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

/**
 * Both `deps` renderings close on how the graph was read, and the per-module answer
 * needs it most: a fan-in of 3 that a dynamic import made 4 is a wrong decision,
 * not an incomplete list.
 */
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

/**
 * `·`, the info marker `inspect` and `rules` already print this cause behind, and never
 * a ⚠: one of the two states it covers is a repo doing nothing wrong.
 */
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
