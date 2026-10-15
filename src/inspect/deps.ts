import { emptyTestGlobs, unreachedTestGlobs } from '../emit/lint/patterns';
import { resolveArchitecture } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { detect, resolveBlueprint } from '../project';
import type { ResolveOptions } from '../project';
import { testFileReach } from './coverage';
import { buildGovernedUnitGraph, normalizedUnitKey } from './resolve';
import { importAnalysis } from './scan';
import { collectArchitectureFacts } from './facts';
import type { ScanResult } from './types';
import type { ModuleDependencies } from './module-dependencies-types';
import {
  renderModuleDependencyOutput,
  renderModuleDependencyDerivation,
  renderDependencyLeaderboard,
  renderDependencyTestExemption,
  renderDependencyUnit,
  renderImportGraphDerivation,
  renderUnknownDependencyTarget,
} from '../operational-contract';

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

/** Dependency facts retain repository-wide module reconciliation for targeted queries. */
export interface DepsResult {
  ok: boolean;
  units: UnitDeps[];
  moduleDependencies: ModuleDependencies | null;
  targetModule: string | null;
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
): Promise<DepsResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const context = await depsContext(root, options);
  const { architecture, units, skipped, testExemption, scanned, moduleDependencies } = context;

  if (options.target !== undefined) {
    return reportTarget(options.target, {
      units, skipped, architecture, log, testExemption, scanned, moduleDependencies,
      json: options.json,
    });
  }

  log(
    options.json
      ? JSON.stringify(

          {
            units,
            moduleDependencies,
            moduleDependencyDerivation: moduleDependencies === null
              ? null
              : renderModuleDependencyDerivation(),
            targetModule: null,
            skipped,
            ...exemptionKey(testExemption),
            importAnalysis: importAnalysis(scanned),
            derivation: renderImportGraphDerivation(importAnalysis(scanned)),
          },
          null,
          2,
        )
      : renderModuleDependencyOutput(renderDependencyLeaderboard(
          units.map((unit) => ({
            ...unit,
            fileLayer: isFileLayer(unit.unit, architecture),
          })),
          {
            skipped,
            testExemption,
            importGraph: importAnalysis(scanned),
          },
        ), moduleDependencies),
  );

  return { ok: true, units, moduleDependencies, targetModule: null };
}

async function depsContext(root: string, options: DepsOptions): Promise<{
  architecture: ArchitectureDef;
  units: UnitDeps[];
  skipped: string[];
  testExemption: string | null;
  scanned: ScanResult;
  moduleDependencies: ModuleDependencies | null;
}> {
  const state = detect(root);
  const { blueprint } = await resolveBlueprint(root, state, options);
  const { architecture } = blueprint;

  const { scanResult: scanned, moduleDependencies, governedFiles, resolved }
    = collectArchitectureFacts(root, blueprint, { demand: 'governed-source' });

  const graph = buildGovernedUnitGraph(
    { ...scanned, files: governedFiles }, architecture, resolved,
  );

  const units = collect(graph.units, graph.edges);

  return {
    architecture,
    moduleDependencies,
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
    : renderDependencyTestExemption(cause);
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
    moduleDependencies: ModuleDependencies | null;
    json?: boolean;
  },
): DepsResult {
  const { units, skipped, architecture, log, testExemption, scanned, moduleDependencies } = ctx;
  const key = normalizedUnitKey(target, architecture);
  const position = resolveArchitecture(architecture).classify(key.split('/'));

  const targetModule = position !== null && position.kind !== 'source-root'
    ? position.module?.name ?? null
    : null;

  const found = units.find((entry) => entry.unit === key);

  if (!found) {
    const folder = skipped.find((candidate) => `${key}/`.startsWith(`${candidate}/`));

    const output = renderUnknownDependencyTarget({
      key, ...(folder ? { outsideFolder: folder } : {}),
    });

    log(ctx.json
      ? JSON.stringify({ ok: false, output, units: [], moduleDependencies, targetModule }, null, 2)
      : renderModuleDependencyOutput(output, moduleDependencies, targetModule));

    return { ok: false, units: [], moduleDependencies, targetModule };
  }

  log(
    ctx.json

      ? JSON.stringify(
          {
            ...found,
            moduleDependencies,
            moduleDependencyDerivation: moduleDependencies === null
              ? null
              : renderModuleDependencyDerivation(),
            targetModule,
            ...exemptionKey(testExemption),
            importAnalysis: importAnalysis(scanned),
            derivation: renderImportGraphDerivation(importAnalysis(scanned)),
          },
          null,
          2,
        )
      : renderModuleDependencyOutput(renderDependencyUnit({
          ...found,
          fileLayer: isFileLayer(found.unit, architecture),
        }, {
          testExemption,
          importGraph: importAnalysis(scanned),
        }), moduleDependencies, targetModule),
  );

  return { ok: true, units: [found], moduleDependencies, targetModule };
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
