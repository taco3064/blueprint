import {
  getForbiddenLayers,
  getModuleShape,
  getSelfOnlyTargets,
  normalizeAllowedImporters,
  sourceRootLabel,
} from '../config';
import type { AliasRoot, ArchitectureDef, Blueprint } from '../config';
import { dropLayerFilesIgnored, dropTestFiles } from './filter';
import { compareText } from './order';
import {
  aliasList,
  buildModuleGraph,
  entryResolver,
  layoutResolver,
  relativeVerdict,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { EntryOf, LayoutOf, ModuleShape } from './resolve';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

function sourcePrefix(architecture: ArchitectureDef): string {
  const root = architecture.sourceRoot ?? 'src';

  return root === '.' ? '' : `${root}/`;
}

export function analyze(
  scan: ScanResult,
  blueprint: Blueprint,
  dependencies?: string[],
): Finding[] {
  const { architecture } = blueprint;
  const layerNames = architecture.layers.map((layer) => layer.name);

  scan = dropTestFiles(scan, architecture.testFiles);
  const lintScan = dropLayerFilesIgnored(scan, architecture.layerFilesIgnore);

  const findings = [
    ...folderFindings(scan, architecture, layerNames),
    ...ownsFindings(architecture, dependencies),
    ...lintScan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  for (const cycle of detectCycles(buildModuleGraph(scan, architecture).edges)) {
    const members = [...new Set(cycle)].sort(compareText);

    findings.push(
      finding('error', 'cycle', {
        path: members[0],
        subject: members.join(' '),
        message: `Import cycle between modules: ${cycle.join(' → ')}.`,
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
  const prefix = sourcePrefix(architecture);

  for (const layer of architecture.layers) {
    for (const owned of layer.owns ?? []) {
      const pkg = typeof owned === 'string' ? owned : 'package' in owned ? owned.package : null;

      if (pkg === null || dependencies.includes(pkg)) {
        continue;
      }

      findings.push({
        severity: 'info',
        rule: 'owns-not-installed',
        path: `${prefix}${layer.name}`,
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

function folderFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const findings: Finding[] = [];
  const prefix = sourcePrefix(architecture);

  for (const dir of scan.topDirs) {
    if (!layerNames.includes(dir) && scan.files.some((file) => file.segments[0] === dir)) {
      findings.push({
        severity: 'error',
        rule: 'undeclared-folder',
        path: `${prefix}${dir}`,

        subject: '',
        message: `"${dir}" is not a declared layer — declare it, or move its code into a module of an existing layer.`,
      });
    }
  }

  for (const name of layerNames) {
    if (!scan.topDirs.includes(name)) {
      findings.push({
        severity: 'info',
        rule: 'missing-layer',
        path: `${prefix}${name}`,
        subject: '',

        message: `Declared layer "${name}" has no folder yet — runway, not a todo: `
          + 'the rules arm when code lands; keeping it is the default, '
          + 'slimming is the owner\'s call.',
      });
    }
  }

  if (scan.files.length > 0) {
    for (const layer of architecture.layers) {
      const selfOnlyImporters = normalizeAllowedImporters(layer.allowedImporters)
        .filter((importer) => importer.selfOnly)
        .map((importer) => importer.layer);

      if (selfOnlyImporters.length && !scan.files.some((file) => file.segments[0] === layer.name)) {
        findings.push({
          severity: 'info',
          rule: 'declaratory-self-only',
          path: `${prefix}${layer.name}`,
          subject: '',
          message: `selfOnly on "${layer.name}" (importer(s): ${selfOnlyImporters.join(', ')}) is declaratory — the layer holds no files, so the re-export ban cannot fire yet; it arms once code lands. The no-restricted-syntax ENTRY is emitted today, on the importer layer(s) named above, so it is already exposed to a merge: IF a second no-restricted-syntax scoped to one of those layers exists, flat config merges neither into the other — the later entry replaces the earlier, silently, with lint still green. That condition is the whole note. Adopting into a single generated config, there is no second entry, so there is nothing here to act on. "Cannot fire" is about the ban, not about the entry. Check \`blueprint rules --json\` for the emit points before merging.`,
        });
      }
    }
  }

  findings.push(...noEntryFindings(scan, architecture, layerNames));

  return findings;
}

function noEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const modules = new Map<string, ScannedFile[]>();

  for (const file of scan.files) {
    const layer = file.segments[0];

    if (
      file.segments.length >= 3
      && layerNames.includes(layer)
      && getModuleShape(architecture, layer).layout === 'folder'
    ) {
      const key = `${layer}/${file.segments[1]}`;

      modules.set(key, [...(modules.get(key) ?? []), file]);
    }
  }

  const findings: Finding[] = [];

  for (const [key, files] of modules) {
    const { entry } = getModuleShape(architecture, key.split('/')[0]);

    const hasEntry = files.some(
      (file) => file.segments.length === 3 && stripExt(file.segments[2]) === entry,
    );

    if (!hasEntry) {
      findings.push({
        severity: 'warn',
        rule: 'no-entry',
        path: `${sourcePrefix(architecture)}${key}`,
        subject: '',
        message: `Module "${key}" has no "${entry}" entry — nothing is importable from outside.`,
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
}

function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const fileLayer = file.segments[0];

  if (!layerNames.includes(fileLayer)) {
    return [];
  }

  const context: ImportContext = {
    architecture,
    layerNames,
    aliases: aliasList(architecture),
    forbidden: getForbiddenLayers(architecture, fileLayer),
    selfOnly: getSelfOnlyTargets(architecture, fileLayer),
    layoutOf: layoutResolver(architecture),
    entryOf: entryResolver(architecture),
  };

  return file.imports.flatMap((ref) => refFindings(file, ref, context));
}

function refFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const parts = stripAlias(ref.specifier, context.aliases);

  if (parts) {
    return aliasFindings(file, ref, { ...context, target: parts[0], depth: parts.length });
  }

  if (ref.specifier.startsWith('.')) {
    return relativeEscape(file, ref, context);
  }

  return packageFindings(file, ref, context);
}

function aliasFindings(
  file: ScannedFile,
  ref: ImportRef,
  context: ImportContext & { target: string; depth: number },
): Finding[] {
  const { target, depth, layerNames, layoutOf, forbidden, selfOnly } = context;
  const fileLayer = file.segments[0];

  if (!layerNames.includes(target)) {
    return [];
  }

  const findings: Finding[] = [];
  const at = { path: file.path, subject: ref.specifier };

  if (layoutOf(target) === 'folder' && depth >= 3) {
    findings.push(finding('error', 'deep-import', { ...at, message: `"${ref.specifier}" reaches inside a module — import it through its entry.` }));
  }

  if (target === fileLayer) {
    findings.push(finding('error', 'flow-violation', { ...at, message: `Same-layer import "${ref.specifier}" via the alias — use a relative path or extract to a lower layer.` }));
  } else if (forbidden.includes(target)) {
    findings.push(finding('error', 'flow-violation', { ...at, message: `"${fileLayer}" may not import "${target}" ("${ref.specifier}").` }));
  }

  if (ref.isExport && selfOnly.includes(target)) {
    findings.push(finding('error', 'selfonly-reexport', { ...at, message: `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.` }));
  }

  return findings;
}

function packageFindings(file: ScannedFile, ref: ImportRef, context: ImportContext): Finding[] {
  const fileLayer = file.segments[0];
  const owners = ownersOf(context.architecture, ref.specifier, ref.names);

  if (!owners || owners.includes(fileLayer)) {
    return [];
  }

  const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

  const subject = ref.names.length
    ? `${ref.specifier} ${[...ref.names].sort(compareText).join(',')}`
    : ref.specifier;

  return [finding('error', 'package-ownership', {
    path: file.path,
    subject,
    message: `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer}".`,
  })];
}

function relativeEscape(
  file: ScannedFile,
  ref: ImportRef,
  shape: ModuleShape & { architecture: ArchitectureDef },
): Finding[] {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);
  const verdict = relativeVerdict(file.segments, target, shape);

  if (verdict === 'ok') {
    return [];
  }

  const at = { path: file.path, subject: ref.specifier };

  if (verdict === 'escapes-src') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" escapes ${sourceRootLabel(shape.architecture)} — use the project alias.` })];
  }

  if (verdict === 'reaches-inside') {
    return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" reaches past a sibling's entry — import "${shape.entryOf(file.segments[0])}" instead; what lives behind it is that module's own business.` })];
  }

  return [finding('error', 'relative-escape', { ...at, message: `Relative import "${ref.specifier}" leaves this layer — use the alias, or extract shared code to a lower layer.` })];
}

function ownersOf(
  architecture: ArchitectureDef,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const layer of architecture.layers) {
    if (!layer.owns) {
      continue;
    }

    for (const owned of layer.owns) {
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

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function finding(
  severity: Severity,
  rule: string,
  about: { path: string; subject: string; message: string },
): Finding {
  return { severity, rule, ...about };
}
