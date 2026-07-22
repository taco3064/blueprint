import { getForbiddenLayers, getModuleShape, getSelfOnlyTargets, normalizeAllowedImporters } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import { dropTestFiles } from './filter';
import {
  aliasList,
  buildModuleGraph,
  layoutResolver,
  moduleKey,
  resolveSegments,
  stripAlias,
} from './resolve';
import type { LayoutOf } from './resolve';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** Analyze a scan against a blueprint. Pure — the core of `inspect`. */
export function analyze(scan: ScanResult, blueprint: Blueprint): Finding[] {
  const { architecture } = blueprint;
  const layerNames = architecture.layers.map((layer) => layer.name);

  // Symmetric with the lint side: test files are exempt from structure.
  scan = dropTestFiles(scan, architecture.testFiles);

  const findings = [
    ...folderFindings(scan, architecture, layerNames),
    ...scan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  const cycle = detectCycle(buildModuleGraph(scan, architecture).edges);

  if (cycle) {
    findings.push(
      finding('error', 'cycle', cycle[0], `Import cycle between modules: ${cycle.join(' → ')}.`),
    );
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** undeclared-folder, missing-layer, and no-entry findings. */
function folderFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const findings: Finding[] = [];

  for (const dir of scan.topDirs) {
    if (!layerNames.includes(dir) && scan.files.some((file) => file.segments[0] === dir)) {
      findings.push({
        severity: 'error',
        rule: 'undeclared-folder',
        path: `src/${dir}`,
        message: `"${dir}" is not a declared layer — declare it, or move its code into a module of an existing layer.`,
      });
    }
  }

  for (const name of layerNames) {
    if (!scan.topDirs.includes(name)) {
      findings.push({
        severity: 'info',
        rule: 'missing-layer',
        path: `src/${name}`,
        // Reads like a todo without the second clause — six of these sent
        // a field agent toward "delete the unused layers", the opposite of
        // the keep-is-default doctrine the playbook states (field run #13).
        message: `Declared layer "${name}" has no folder yet — runway, not a todo: `
          + 'the rules arm when code lands; keeping it is the default, slimming is the owner\'s call.',
      });
    }
  }

  // A selfOnly ban protecting a layer nobody's code inhabits is declaratory:
  // the emitted re-export selector can never fire. Whoever is defusing that
  // rule's merge collision deserves to know the bomb is currently a blank
  // (field batch 12) — info, because intent declared early is not a defect.
  // Guarded to repos that hold code at all: on an empty scaffold every layer
  // is a blank, and the coverage line already says so.
  for (const layer of scan.files.length ? architecture.layers : []) {
    const selfOnlyImporters = normalizeAllowedImporters(layer.allowedImporters)
      .filter((importer) => importer.selfOnly)
      .map((importer) => importer.layer);

    if (selfOnlyImporters.length && !scan.files.some((file) => file.segments[0] === layer.name)) {
      findings.push({
        severity: 'info',
        rule: 'declaratory-self-only',
        path: `src/${layer.name}`,
        message: `selfOnly on "${layer.name}" (importer(s): ${selfOnlyImporters.join(', ')}) is declaratory — the layer holds no files, so the re-export ban cannot fire yet; it arms once code lands.`,
      });
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
        path: `src/${key}`,
        message: `Module "${key}" has no "${entry}" entry — nothing is importable from outside.`,
      });
    }
  }

  return findings;
}

/** Per-file import findings: deep-import, flow-violation, relative-escape, ownership, selfOnly. */
function importFindings(
  file: ScannedFile,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const fileLayer = file.segments[0];

  if (!layerNames.includes(fileLayer)) return [];

  const aliases = aliasList(architecture);
  const forbidden = getForbiddenLayers(architecture, fileLayer);
  const selfOnly = getSelfOnlyTargets(architecture, fileLayer);
  const layoutOf = layoutResolver(architecture);
  const findings: Finding[] = [];

  for (const ref of file.imports) {
    const parts = stripAlias(ref.specifier, aliases);

    if (parts) {
      const target = parts[0];

      if (!layerNames.includes(target)) continue;

      // Depth is judged against the *target* layer's layout — reaching inside
      // a folder-module layer is a violation wherever the import comes from.
      if (layoutOf(target) === 'folder' && parts.length >= 3) {
        findings.push(finding('error', 'deep-import', file.path, `"${ref.specifier}" reaches inside a module — import it through its entry.`));
      }

      if (target === fileLayer) {
        findings.push(finding('error', 'flow-violation', file.path, `Same-layer import "${ref.specifier}" via the alias — use a relative path or extract to a lower layer.`));
      } else if (forbidden.includes(target)) {
        findings.push(finding('error', 'flow-violation', file.path, `"${fileLayer}" may not import "${target}" ("${ref.specifier}").`));
      }

      if (ref.isExport && selfOnly.includes(target)) {
        findings.push(finding('error', 'selfonly-reexport', file.path, `Re-exports "${target}" ("${ref.specifier}"), which is selfOnly — depend on it, do not re-export it.`));
      }
    } else if (ref.specifier.startsWith('.')) {
      const escape = relativeEscape(file, ref, layoutOf);

      if (escape) findings.push(escape);
    } else {
      const owners = ownersOf(architecture, ref.specifier, ref.names);

      if (owners && !owners.includes(fileLayer)) {
        const named = ref.names.length ? ` (${ref.names.join(', ')})` : '';

        findings.push(finding('error', 'package-ownership', file.path, `"${ref.specifier}"${named} is owned by ${owners.join(', ')} — not importable from "${fileLayer}".`));
      }
    }
  }

  return findings;
}

function relativeEscape(file: ScannedFile, ref: ImportRef, layoutOf: LayoutOf): Finding | null {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

  if (target === null) {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" escapes src/ — use the project alias.`);
  }

  if (moduleKey(target, layoutOf) !== moduleKey(file.segments, layoutOf)) {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" leaves this module — use the alias, or extract shared code to a lower layer.`);
  }

  return null;
}

/** Owner layers of a package import (given its named imports), or null if unrestricted. */
function ownersOf(
  architecture: ArchitectureDef,
  specifier: string,
  names: string[],
): string[] | null {
  const owners: string[] = [];

  for (const layer of architecture.layers) {
    for (const owned of layer.owns ?? []) {
      if (typeof owned === 'string') {
        if (owned === specifier) owners.push(layer.name);
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

function detectCycle(edges: Map<string, Set<string>>): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (node: string, path: string[]): string[] | null => {
    visited.add(node);
    stack.add(node);

    for (const next of edges.get(node) ?? []) {
      if (stack.has(next)) return [...path.slice(path.indexOf(next)), next];

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) return found;
      }
    }

    stack.delete(node);

    return null;
  };

  for (const node of edges.keys()) {
    if (!visited.has(node)) {
      const found = dfs(node, [node]);

      if (found) return found;
    }
  }

  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function finding(severity: Severity, rule: string, path: string, message: string): Finding {
  return { severity, rule, path, message };
}
