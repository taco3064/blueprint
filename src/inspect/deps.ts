import { emptyTestGlobs, unreachedTestGlobs } from '../emit/lint/patterns';
import { resolveArchitecture } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { testFileReach } from './coverage';
import { buildUnitGraph, normalizedUnitKey } from './resolve';
import { importAnalysis, importGraphDerivation, scan } from './scan';
import type { ScanResult } from './types';

export interface DepsOptions extends ResolveOptions {
  /** Unit to query, e.g. `hooks/useCart` or `src/auth/hooks/useCart.ts`. */
  target?: string;
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** One unit's fan-in / fan-out, the unit of every `deps` answer. */
export interface UnitDeps {
  unit: string;
  /** Who imports it — the blast radius of changing it. */
  importedBy: string[];
  /** What it imports. */
  imports: string[];
}

/**
 * Run `blueprint deps` in `root`. Read-only. With a target, answers "who
 * gets hit if I change this unit" (reverse deps + own imports); without
 * one, prints the blast-radius leaderboard — every unit sorted by fan-in.
 * @group Runtimes
 * @example
 * const { units } = await runDeps(process.cwd(), { target: 'hooks/useCart' });
 *
 * console.log(units[0].importedBy); // who gets hit if I change it
 */
export async function runDeps(
  root: string,
  options: DepsOptions = {},
): Promise<{ ok: boolean; units: UnitDeps[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const context = await depsContext(root, options);
  const { architecture, units, skipped, testExemption, scanned } = context;

  if (options.target !== undefined) {
    return reportTarget(options.target, {
      units, skipped, architecture, log, testExemption, scanned, json: options.json,
    });
  }

  log(
    options.json
      ? JSON.stringify(

          {
            units,
            skipped,
            ...exemptionKey(testExemption),
            importAnalysis: importAnalysis(scanned),
            derivation: importGraphDerivation('', scanned),
          },
          null,
          2,
        )
      : renderLeaderboard(units, skipped, { architecture, testExemption, scanned }),
  );

  return { ok: true, units };
}

async function depsContext(root: string, options: DepsOptions): Promise<{
  architecture: ArchitectureDef;
  units: UnitDeps[];
  skipped: string[];
  testExemption: string | null;
  scanned: ScanResult;
}> {
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const { architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const scanned = scan(root, resolved.sourceRoot);
  const graph = buildUnitGraph(scanned, architecture);
  const units = collect(graph.units, graph.edges);

  return {
    architecture,
    units,
    skipped: skippedFolders(scanned, architecture),
    testExemption: exemptionNote(units, scanned, architecture),
    scanned,
  };
}

function exemptionNote(
  units: UnitDeps[],
  scanned: ScanResult,
  architecture: Blueprint['architecture'],
): string | null {
  const { testFiles } = architecture;
  const sourceRoot = resolveArchitecture(architecture).sourceRoot;

  if (!units.length) {
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
    units: UnitDeps[];
    skipped: string[];
    architecture: ArchitectureDef;
    log: (message: string) => void;
    testExemption: string | null;
    scanned: ScanResult;
    json?: boolean;
  },
): { ok: boolean; units: UnitDeps[] } {
  const { units, skipped, architecture, log, testExemption, scanned } = ctx;
  const key = normalizedUnitKey(target, architecture);
  const found = units.find((entry) => entry.unit === key);

  if (!found) {
    log(unknownTarget(key, skipped));

    return { ok: false, units: [] };
  }

  log(
    ctx.json

      ? JSON.stringify(
          {
            ...found,
            ...exemptionKey(testExemption),
            importAnalysis: importAnalysis(scanned),
            derivation: importGraphDerivation('', scanned),
          },
          null,
          2,
        )
      : renderUnit(found, {
          fileLayer: isFileLayer(found.unit, architecture),
          testExemption,
          scanned,
        }),
  );

  return { ok: true, units: [found] };
}

function collect(unitSet: Set<string>, edges: Map<string, Set<string>>): UnitDeps[] {
  const importedBy = new Map<string, string[]>();

  for (const [from, targets] of edges) {
    for (const to of targets) {
      importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
    }
  }

  const all = new Set([...unitSet, ...importedBy.keys()]);

  return [...all]
    .map((unit) => ({
      unit,
      importedBy: (importedBy.get(unit) ?? []).sort(),
      imports: [...(edges.get(unit) ?? [])].sort(),
    }))
    .sort(
      (a, b) => b.importedBy.length - a.importedBy.length || a.unit.localeCompare(b.unit),
    );
}

function skippedFolders(scanned: ScanResult, architecture: ArchitectureDef): string[] {
  const resolved = resolveArchitecture(architecture);
  const modules = new Set(resolved.modules.map((module) => module.name));

  const folders = scanned.files.flatMap((file) => {
    const [outer] = file.segments;

    if (resolved.classify(file.segments) !== null) {
      return [];
    }

    const depth = modules.has(outer) ? 2 : 1;

    return [file.segments.slice(0, depth).join('/')];
  });

  return [...new Set(folders)];
}

function isFileLayer(
  unit: string,
  architecture: ArchitectureDef,
): boolean {
  const resolved = resolveArchitecture(architecture);
  const position = resolved.classify(unit.split('/'));

  // Stryker disable next-line ConditionalExpression: callers only pass governed graph units.
  return position !== null && position.kind === 'layer' && position.layer.unit.layout === 'file';
}

function unknownTarget(key: string, skipped: string[]): string {
  // Stryker disable next-line MethodExpression: skipped keys are normalized folder prefixes.
  const folder = skipped.find((candidate) => `${key}/`.startsWith(`${candidate}/`));

  return folder
    ? `✗ "${folder}/" is outside the declared architecture — deps only sees governed units.`
    : `✗ Unknown unit "${key}" — run \`blueprint deps\` to list every unit.`;
}

function renderUnit(
  entry: UnitDeps,
  shape: { fileLayer: boolean; testExemption: string | null; scanned: ScanResult },
): string {
  const { fileLayer, testExemption, scanned } = shape;

  return [
    entry.unit + (fileLayer ? ' (file-layout layer — answers at layer granularity)' : ''),
    `  imported by (${entry.importedBy.length}):`,
    ...entry.importedBy.map((unit) => `    ← ${unit}`),
    `  imports (${entry.imports.length}):`,
    ...entry.imports.map((unit) => `    → ${unit}`),
    ...exemptionLine(testExemption),
    '',
    importGraphDerivation('  ', scanned),
  ].join('\n');
}

function exemptionLine(testExemption: string | null): string[] {
  return testExemption === null ? [] : [`  · ${testExemption}`];
}

function renderLeaderboard(
  units: UnitDeps[],
  skipped: string[],
  shape: {
    architecture: ArchitectureDef;
    testExemption: string | null;
    scanned: ScanResult;
  },
): string {
  const { architecture, testExemption, scanned } = shape;

  if (!units.length) {
    return 'No units found inside the declared architecture.';
  }

  const width = String(units[0].importedBy.length).length;

  const note = skipped.length
    ? [`  (outside the declared architecture, invisible to deps: ${skipped.join('/, ')}/)`]
    : [];

  return [
    'Blast radius (imported-by count):',
    ...units.map(
      (entry) =>
        `  ${String(entry.importedBy.length).padStart(width)} ← ${entry.unit}`
        + (isFileLayer(entry.unit, architecture)
          ? ' (file-layout layer)'
          : ''),
    ),
    ...note,
    ...exemptionLine(testExemption),
    '',
    importGraphDerivation('  ', scanned),
  ].join('\n');
}
