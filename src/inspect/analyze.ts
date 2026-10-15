import {
  resolveArchitecture,
  sourceRootLabel,
  activeSetting,
} from '../config';
import type {
  AliasRoot,
  ArchitectureDef,
  Blueprint,
  ResolvedArchitecture,
  ResolvedSourcePosition,
} from '../config';
import { dropLayerFilesIgnored, dropTestFiles } from './filter';
import { folderFindings } from './folders';
import { rootUnitFindings } from './root-units';
import { applicationScopeFindings } from './scope';
import { compareText } from './order';
import {
  buildGovernedUnitGraph,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { EntryOf, LayoutOf, UnitShape } from './resolve';
import { uniqueFindings } from './types';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';
import { aliasDependencyFindings } from './dependency';
import { renderFindingMessage } from '../operational-contract';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

interface AnalyzeOptions {
  dependencies?: string[];
  testsFiltered?: boolean;
  demand?: 'governed-source' | 'application-scope';
  resolved?: ResolvedArchitecture;
}

function analyzeOptions(options?: string[] | AnalyzeOptions): AnalyzeOptions {
  return Array.isArray(options) ? { dependencies: options } : options ?? {};
}

export function analyze(
  scan: ScanResult,
  blueprint: Blueprint,
  options?: string[] | AnalyzeOptions,
): Finding[] {
  const settings = analyzeOptions(options);
  const { dependencies, demand } = settings;
  const { architecture } = blueprint;

  const resolved = settings.resolved ?? resolveArchitecture(architecture);

  scan = settings.testsFiltered ? scan : dropTestFiles(scan, architecture.testFiles);
  const lintScan = dropLayerFilesIgnored(scan, architecture.layerFilesIgnore);

  const findings = [
    ...(demand === 'application-scope'
      ? applicationScopeFindings(scan, architecture, resolved)
      : []),
    ...folderFindings(scan, architecture, { framework: blueprint.framework, resolved }),
    ...rootUnitFindings(lintScan, blueprint, resolved),
    ...ownsFindings(resolved, dependencies),
    ...lintScan.files.flatMap((file) => importFindings(file, architecture, resolved)),
  ];

  const cycleTier = activeSetting(blueprint.rules?.cycles)?.tier;

  if (cycleTier === 'warn' || cycleTier === 'error') {
    for (const cycle of detectCycles(buildGovernedUnitGraph(scan, architecture, resolved).edges)) {
      const members = [...new Set(cycle)].sort(compareText);

      findings.push(
        finding(cycleTier, 'cycle', {
          path: members[0],
          subject: members.join(' '),
          message: renderFindingMessage({ kind: 'cycle', cycle }),
        }),
      );
    }
  }

  return uniqueFindings(findings)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function ownsFindings(
  resolved: ResolvedArchitecture,
  dependencies: string[] | undefined,
): Finding[] {
  if (!dependencies) {
    return [];
  }

  const findings: Finding[] = [];

  for (const position of resolved.layerPositions.filter(
    (entry) => entry.layer.definition.owns?.length,
  )) {
    const layer = position.layer.definition;

    for (const owned of layer.owns!) {
      const pkg = typeof owned === 'string' ? owned : 'package' in owned ? owned.package : null;

      if (pkg === null || dependencies.includes(pkg)) {
        continue;
      }

      findings.push({
        severity: 'info',
        rule: 'owns-not-installed',
        path: position.root,
        subject: pkg,
        message: renderFindingMessage({
          kind: 'owns-not-installed', layer: layer.name, package: pkg,
        }),
      });
    }
  }

  return findings;
}

interface ImportContext {
  architecture: ArchitectureDef;
  resolved: ResolvedArchitecture;
  position: ResolvedSourcePosition;
  layerNames: string[];
  aliases: (AliasRoot | string)[];

  selfOnly: string[];
  layoutOf: LayoutOf;
  entryOf: EntryOf;
  module: string | null;
  layer: string | null;
}

function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  resolved: ResolvedArchitecture,
): Finding[] {
  const position = resolved.classify(file.segments);

  if (!position
    || (position.kind !== 'source-root'
      && position.kind !== 'container'
      && !('layer' in position))) {
    return [];
  }

  const fileLayer = 'layer' in position ? position.layer.name : null;

  const context: ImportContext = {
    architecture,
    resolved,
    position,
    layerNames: resolved.layerNames,
    aliases: resolved.aliases,
    // Stryker disable next-line ConditionalExpression, ArrayDeclaration: containers have no
    // importer-layer identity, and schema-valid target layers cannot match a synthetic entry.
    selfOnly: fileLayer === null ? [] : resolved.selfOnlyTargets(fileLayer),
    layoutOf: layoutResolver(architecture, resolved),
    entryOf: entryResolver(architecture, resolved),
    module: 'module' in position ? position.module?.name ?? null : null,
    layer: fileLayer,
  };

  const rootRefs = file.moduleSpecifiers
    ?.filter((specifier) => resolved.resolveImport(file.segments, specifier).rootUnit !== null)
    .map((specifier) => ({
      specifier,
      // Stryker disable next-line ArrayDeclaration: root references bypass package ownership.
      names: [],
      // Stryker disable next-line BooleanLiteral: root targets cannot be selfOnly layer re-exports.
      isExport: false,
    })) ?? [];

  return [...file.imports, ...rootRefs].flatMap((ref) => refFindings(file, ref, context));
}

function refFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const parts = stripAlias(ref.specifier, context.aliases);

  if (parts) {
    const target = context.resolved.resolveImportTarget(file.segments, ref.specifier);

    const targetLayer = target && 'layer' in target ? target.layer.name : null;
    const targetModule = target && 'module' in target ? target.module?.name ?? null : null;

    return aliasDependencyFindings({
      file,
      ref,
      resolved: context.resolved,
      importer: context.position,
      importerModule: context.module,
      importerLayer: context.layer,
      target: targetLayer ?? '',
      targetModule,
      targetPosition: target,
      depth: parts.length,
      layerNames: context.layerNames,
      layoutOf: context.layoutOf,
      selfOnly: context.selfOnly,
    });
  }

  if (context.position.kind === 'source-root') {
    return [];
  }

  if (ref.specifier.startsWith('.')) {
    return relativeEscape(file, ref, context);
  }

  return packageFindings(file, ref, context);
}

function packageFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const fileLayer = context.layer;
  const owners = ownersOf(context.resolved, ref.specifier, ref.names);

  if (!owners || owners.includes(fileLayer ?? '')) {
    return [];
  }

  const subject = ref.names.length
    ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
    : ref.specifier;

  return [finding('error', 'package-ownership', {
    path: file.path,
    subject,
    message: renderFindingMessage({
      kind: 'package-ownership',
      specifier: ref.specifier,
      names: ref.names,
      owners,
      importer: fileLayer ?? 'container',
    }),
  })];
}

function relativeEscape(
  file: ScannedFile,
  ref: ImportRef,
  shape: UnitShape & {
    architecture: ArchitectureDef; position: ResolvedSourcePosition; resolved: ResolvedArchitecture;
  },
): Finding[] {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const { resolved } = shape;
  const moduleFirst = resolved.topology === 'module-first';

  const verdict = relativeVerdict(file.segments, target, {
    ...shape,
    isLayer: (name) => resolved.layerNames.includes(name),
    moduleFirst,
    container: shape.position.kind === 'container',
  });

  if (verdict === 'ok') {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };

  if (verdict === 'escapes-src') {
    return [finding('error', 'relative-escape', {
      ...at,
      message: renderFindingMessage({
        kind: 'relative-escape-source',
        specifier: ref.specifier,
        sourceRoot: sourceRootLabel(shape.architecture),
      }),
    })];
  }

  if (verdict === 'reaches-inside') {
    const layerIndex = moduleFirst ? 1 : 0;

    return [finding('error', 'relative-escape', {
      ...at,
      message: renderFindingMessage({
        kind: 'relative-escape-entry',
        specifier: ref.specifier,
        entry: shape.entryOf(file.segments[layerIndex]),
      }),
    })];
  }

  return [finding('error', 'relative-escape', {
    ...at,
    message: renderFindingMessage({ kind: 'relative-escape-layer', specifier: ref.specifier }),
  })];
}

function ownersOf(
  resolved: ResolvedArchitecture,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const { definition: layer } of resolved.ownership) {
    for (const owned of layer.owns!) {
      if (typeof owned === 'string') {
        if (owned === specifier) {
          owners.push(layer.name);
        }
      } else if ('package' in owned && owned.package === specifier) {
        const restricted = owned.imports;

        if (!restricted?.length || names.some((name) => restricted.includes(name))) {
          owners.push(layer.name);
        }
      }
    }
  }

  return owners.length ? owners : null;
}

export function detectCycles(edges: Map<string, Set<string>>): string[][] {
  return stronglyConnected(edges)
    .map((component) => detectCycle(subgraph(edges, component)))
    .filter((cycle): cycle is string[] => cycle !== null)

    .sort((a, b) => compareText(a[0], b[0]));
}

function subgraph(edges: Map<string, Set<string>>, component: string[]): Map<string, Set<string>> {
  const members = new Set(component);
  const restricted = new Map<string, Set<string>>();

  for (const node of [...component].sort(compareText)) {
    // Stryker disable next-line MethodExpression, ArrayDeclaration: outside targets form no cycle.
    const targets = [...(edges.get(node) ?? [])].filter((target) => members.has(target));

    restricted.set(node, new Set(targets));
  }

  return restricted;
}

function stronglyConnected(edges: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const onStack = new Set<string>();
  // Stryker disable next-line ArrayDeclaration: a seeded item stays below every found root.
  const stack: string[] = [];
  const components: string[][] = [];
  let next = 0;

  const close = (node: string): void => {
    const component = stack.splice(stack.indexOf(node));

    for (const member of component) {
      onStack.delete(member);
    }

    components.push(component);
  };

  const visit = (node: string): number => {
    const own = next++;
    let lowest = own;

    index.set(node, own);
    stack.push(node);
    onStack.add(node);

    // Stryker disable next-line ArrayDeclaration: a fabricated leaf cannot form a cycle.
    for (const target of edges.get(node) ?? []) {
      const seen = index.get(target);

      if (seen === undefined) {
        lowest = Math.min(lowest, visit(target));
      } else if (onStack.has(target)) {
        lowest = Math.min(lowest, seen);
      }
    }

    if (lowest === own) {
      close(node);
    }

    return lowest;
  };

  for (const node of edges.keys()) {
    // Stryker disable next-line BlockStatement, ConditionalExpression: revisit drops as singleton.
    if (index.has(node)) {
      continue;
    }

    visit(node);
  }

  return components;
}

export function detectCycle(edges: Map<string, Set<string>>): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (node: string, path: string[]): string[] | null => {
    visited.add(node);
    stack.add(node);

    for (const next of edges.get(node) ?? []) {
      if (stack.has(next)) {
        return [...path.slice(path.indexOf(next)), next];
      }

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) {
          return found;
        }
      }
    }

    stack.delete(node);

    return null;
  };

  for (const node of edges.keys()) {
    // Stryker disable next-line ConditionalExpression: dfs already stops at a visited node.
    if (!visited.has(node)) {
      const found = dfs(node, [node]);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function finding(
  severity: Severity,
  rule: string,
  about: { path: string; subject: string; message: string },
): Finding {
  return { severity, rule, ...about };
}
