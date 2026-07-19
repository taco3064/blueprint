import { getForbiddenLayers, getSelfOnlyTargets } from '../config';
import type { ArchitectureDef, Blueprint } from '../config';
import type { Finding, ImportRef, ScanResult, ScannedFile, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** Analyze a scan against a blueprint. Pure — the core of `inspect`. */
export function analyze(scan: ScanResult, blueprint: Blueprint): Finding[] {
  const { architecture } = blueprint;
  const layerNames = architecture.layers.map((layer) => layer.name);

  const findings = [
    ...folderFindings(scan, architecture, layerNames),
    ...scan.files.flatMap((file) => importFindings(file, architecture, layerNames)),
  ];

  const cycle = findCycle(scan, architecture, layerNames);

  if (cycle) findings.push(cycle);

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
        message: `Declared layer "${name}" has no folder yet.`,
      });
    }
  }

  if (architecture.module.layout === 'folder') {
    findings.push(...noEntryFindings(scan, architecture, layerNames));
  }

  return findings;
}

function noEntryFindings(
  scan: ScanResult,
  architecture: ArchitectureDef,
  layerNames: string[],
): Finding[] {
  const { entry } = architecture.module;
  const modules = new Map<string, ScannedFile[]>();

  for (const file of scan.files) {
    if (file.segments.length >= 3 && layerNames.includes(file.segments[0])) {
      const key = `${file.segments[0]}/${file.segments[1]}`;

      modules.set(key, [...(modules.get(key) ?? []), file]);
    }
  }

  const findings: Finding[] = [];

  for (const [key, files] of modules) {
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
  const layout = architecture.module.layout;
  const findings: Finding[] = [];

  for (const ref of file.imports) {
    const parts = stripAlias(ref.specifier, aliases);

    if (parts) {
      const target = parts[0];

      if (!layerNames.includes(target)) continue;

      if (layout === 'folder' && parts.length >= 3) {
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
      const escape = relativeEscape(file, ref, layout);

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

function relativeEscape(file: ScannedFile, ref: ImportRef, layout: 'folder' | 'flat'): Finding | null {
  const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

  if (target === null) {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" escapes src/ — use the project alias.`);
  }

  if (moduleKey(target, layout) !== moduleKey(file.segments, layout)) {
    return finding('error', 'relative-escape', file.path, `Relative import "${ref.specifier}" leaves this module — use the alias, or extract shared code to a lower layer.`);
  }

  return null;
}

/** Owner layers of a package import (given its named imports), or null if unrestricted. */
function ownersOf(architecture: ArchitectureDef, specifier: string, names: string[]): string[] | null {
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

function findCycle(scan: ScanResult, architecture: ArchitectureDef, layerNames: string[]): Finding | null {
  const aliases = aliasList(architecture);
  const layout = architecture.module.layout;
  const edges = new Map<string, Set<string>>();

  for (const file of scan.files) {
    if (!layerNames.includes(file.segments[0])) continue;

    const from = moduleKey(file.segments, layout);

    for (const ref of file.imports) {
      const to = targetModuleKey(ref, file, aliases, layerNames, layout);

      if (to && to !== from) {
        edges.set(from, (edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  const path = detectCycle(edges);

  return path ? finding('error', 'cycle', path[0], `Import cycle between modules: ${path.join(' → ')}.`) : null;
}

/** The module a reference targets, or null if it is not a resolvable module import. */
function targetModuleKey(
  ref: ImportRef,
  file: ScannedFile,
  aliases: string[],
  layerNames: string[],
  layout: 'folder' | 'flat',
): string | null {
  const parts = stripAlias(ref.specifier, aliases);

  if (parts) {
    return layerNames.includes(parts[0]) ? moduleKey(parts, layout) : null;
  }

  if (ref.specifier.startsWith('.')) {
    const target = resolveSegments(file.segments.slice(0, -1), ref.specifier);

    return target ? moduleKey(target, layout) : null;
  }

  return null;
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

function aliasList(architecture: ArchitectureDef): string[] {
  return [architecture.alias, ...Object.keys(architecture.additionalAliases ?? {})];
}

function stripAlias(specifier: string, aliases: string[]): string[] | null {
  for (const alias of aliases) {
    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      return specifier.slice(alias.length).split('/').filter(Boolean);
    }
  }

  return null;
}

function moduleKey(segments: string[], layout: 'folder' | 'flat'): string {
  if (layout === 'flat' || segments.length < 2) return segments[0] ?? '';

  return `${segments[0]}/${segments[1]}`;
}

function resolveSegments(dir: string[], specifier: string): string[] | null {
  const stack = [...dir];

  for (const part of specifier.split('/')) {
    if (part === '' || part === '.') continue;
    else if (part === '..') {
      if (!stack.length) return null;

      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function finding(severity: Severity, rule: string, path: string, message: string): Finding {
  return { severity, rule, path, message };
}
