import {
  resolveArchitecture,
  sourceRootLabel,
} from '../config';
import type { AliasRoot, ArchitectureDef, Blueprint } from '../config';
import { dropLayerFilesIgnored, dropTestFiles } from './filter';
import { folderFindings } from './folders';
import { compareText } from './order';
import {
  aliasList,
  buildUnitGraph,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { EntryOf, LayoutOf, UnitShape } from './resolve';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function analyze(
  scan: ScanResult,
  blueprint: Blueprint,
  dependencies?: string[],
): Finding[] {
  const { architecture } = blueprint;
  const resolved = resolveArchitecture(architecture);
  const layerNames = resolved.layerNames;

  scan = dropTestFiles(scan, architecture.testFiles);
  const lintScan = dropLayerFilesIgnored(scan, architecture.layerFilesIgnore);

  const findings = [
    ...folderFindings(scan, architecture),
    ...ownsFindings(architecture, dependencies),
    ...lintScan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  for (const cycle of detectCycles(buildUnitGraph(scan, architecture).edges)) {
    const members = [...new Set(cycle)].sort(compareText);

    findings.push(
      finding('error', 'cycle', {
        path: members[0],
        subject: members.join(' '),
        message: `Import cycle between units: ${cycle.join(' → ')}.`,
      }),
    );
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function ownsFindings(
  architecture: ArchitectureDef,
  dependencies: string[] | undefined,
): Finding[] {
  if (!dependencies) {
    return [];
  }

  const findings: Finding[] = [];
  const resolved = resolveArchitecture(architecture);

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
        message: `Layer "${layer.name}" owns "${pkg}", which is not in package.json — `
          + 'runway, not a todo: the ban is emitted and correct, it just has nothing to '
          + 'reach yet. Installing the package and dropping the declaration are both '
          + 'resolutions, and which one applies is the owner\'s call.',
      });
    }
  }

  return findings;
}

interface ImportContext {
  architecture: ArchitectureDef;
  layerNames: string[];
  aliases: (AliasRoot | string)[];

  forbidden: string[];

  selfOnly: string[];
  layoutOf: LayoutOf;
  entryOf: EntryOf;
  module: string | null;
  layer: string | null;
}

function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const resolved = resolveArchitecture(architecture);
  const position = resolved.classify(file.segments);

  if (!position || (position.kind !== 'container' && !('layer' in position))) {
    return [];
  }

  const fileLayer = 'layer' in position ? position.layer.name : null;

  const context: ImportContext = {
    architecture,
    layerNames,
    aliases: aliasList(architecture),
    forbidden: fileLayer === null ? [] : resolved.forbiddenLayers(fileLayer),
    selfOnly: fileLayer === null ? [] : resolved.selfOnlyTargets(fileLayer),
    layoutOf: layoutResolver(architecture),
    entryOf: entryResolver(architecture),
    module: position.module?.name ?? null,
    layer: fileLayer,
  };

  return file.imports.flatMap((ref) => refFindings(file, ref, context));
}

function refFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const parts = stripAlias(ref.specifier, context.aliases);

  if (parts) {
    const target = resolveArchitecture(context.architecture)
      .resolveImportTarget(file.segments, ref.specifier);

    const targetLayer = target && 'layer' in target ? target.layer.name : null;
    const targetModule = target && 'module' in target ? target.module?.name ?? null : null;

    return aliasFindings(file, ref, {
      ...context,
      target: targetLayer ?? parts[context.module === null ? 0 : 1],
      targetModule,
      depth: parts.length,
    });
  }

  if (ref.specifier.startsWith('.')) {
    return relativeEscape(file, ref, context);
  }

  return packageFindings(file, ref, context);
}

function aliasFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { target: string; targetModule: string | null; depth: number },
): Finding[] {
  const { target, targetModule, depth, layerNames, layoutOf, forbidden, selfOnly } = context;
  const fileLayer = context.layer;

  if (!layerNames.includes(target)) {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };
  const sameModule = context.module === targetModule;
  const deepAt = context.module === null ? 3 : 4;

  const deep = sameModule && layoutOf(target) === 'folder' && depth >= deepAt
    ? [finding('error', 'deep-import', {
        ...at,
        message: `"${ref.specifier}" reaches inside a unit — import it through its entry.`,
      })]
    : [];

  if (!sameModule) {
    return deep;
  }

  if (fileLayer === null) {
    return deep;
  }

  return [
    ...deep,
    ...aliasFlowFindings({ target, fileLayer, forbidden, at }),
    ...selfOnlyFindings({ ref, target, selfOnly, at }),
  ];
}

interface AliasFindingScope {
  target: string;
  fileLayer: string;
  forbidden: string[];
  at: { path: string; subject: string };
}

function aliasFlowFindings(scope: AliasFindingScope): Finding[] {
  const { target, fileLayer, forbidden, at } = scope;

  if (target === fileLayer) {
    return [finding('error', 'flow-violation', {
      ...at,
      message: `Same-layer import "${at.subject}" via the alias — use a relative path or `
        + 'extract to a lower layer.',
    })];
  }

  if (forbidden.includes(target)) {
    return [finding('error', 'flow-violation', {
      ...at,
      message: `"${fileLayer}" may not import "${target}" ("${at.subject}").`,
    })];
  }

  return [];
}

function selfOnlyFindings(scope: {
  ref: ImportRef;
  target: string;
  selfOnly: string[];
  at: { path: string; subject: string };
}): Finding[] {
  const { ref, target, selfOnly, at } = scope;

  return ref.isExport && selfOnly.includes(target)
    ? [finding('error', 'selfonly-reexport', {
        ...at,
        message: `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — `
          + 'depend on it, do not re-export it.',
      })]
    : [];
}

function packageFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const fileLayer = context.layer;
  const owners = ownersOf(context.architecture, ref.specifier, ref.names);

  if (!owners || (fileLayer !== null && owners.includes(fileLayer))) {
    return [];
  }

  const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

  const subject = ref.names.length
    ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
    : ref.specifier;

  return [finding('error', 'package-ownership', {
    path: file.path,
    subject,
    message: `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer ?? 'container'}".`,
  })];
}

function relativeEscape(
  file: ScannedFile,
  ref: ImportRef,
  shape: UnitShape & { architecture: ArchitectureDef },
): Finding[] {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const resolved = resolveArchitecture(shape.architecture);
  const moduleFirst = resolved.topology === 'module-first';

  const verdict = relativeVerdict(file.segments, target, {
    ...shape,
    isLayer: (name) => resolved.layerNames.includes(name),
    moduleFirst,
  });

  if (verdict === 'ok') {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };

  if (verdict === 'escapes-src') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" escapes ${sourceRootLabel(shape.architecture)} — use the project alias.` })];
  }

  if (verdict === 'reaches-inside') {
    const layerIndex = moduleFirst ? 1 : 0;

    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${shape.entryOf(file.segments[layerIndex])}" instead; what lives behind it is that unit's own business.` })];
  }

  return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.` })];
}

function ownersOf(
  architecture: ArchitectureDef,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const { definition: layer } of resolveArchitecture(architecture).ownership) {
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
