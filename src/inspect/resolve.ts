import type { ArchitectureDef } from '../config';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * Module-resolution primitives shared by `analyze` (findings, cycles) and
 * `deps` (blast radius): specifier → module key, plus the module import
 * graph itself.
 */

export function aliasList(architecture: ArchitectureDef): string[] {
  return [architecture.alias, ...Object.keys(architecture.additionalAliases ?? {})];
}

export function stripAlias(specifier: string, aliases: string[]): string[] | null {
  for (const alias of aliases) {
    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      return specifier.slice(alias.length).split('/').filter(Boolean);
    }
  }

  return null;
}

export function moduleKey(segments: string[], layout: 'folder' | 'flat'): string {
  if (layout === 'flat' || segments.length < 2) return segments[0] ?? '';

  return `${segments[0]}/${segments[1]}`;
}

export function resolveSegments(dir: string[], specifier: string): string[] | null {
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

/** The module a reference targets, or null if it is not a resolvable module import. */
export function targetModuleKey(
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

export interface ModuleGraph {
  /** Every module observed under a declared layer. */
  modules: Set<string>;
  /** `from` module → the modules it imports (self-edges excluded). */
  edges: Map<string, Set<string>>;
}

/** Build the module-level import graph from a scan. */
export function buildModuleGraph(scan: ScanResult, architecture: ArchitectureDef): ModuleGraph {
  // Test files neither form modules nor create edges (idempotent re-filter
  // when the caller already dropped them).
  scan = dropTestFiles(scan, architecture.testFiles);

  const layerNames = architecture.layers.map((layer) => layer.name);
  const aliases = aliasList(architecture);
  const layout = architecture.module.layout;
  const modules = new Set<string>();
  const edges = new Map<string, Set<string>>();

  for (const file of scan.files) {
    if (!layerNames.includes(file.segments[0])) continue;

    const from = moduleKey(file.segments, layout);

    modules.add(from);

    for (const ref of file.imports) {
      const to = targetModuleKey(ref, file, aliases, layerNames, layout);

      if (to && to !== from) {
        edges.set(from, (edges.get(from) ?? new Set()).add(to));
      }
    }
  }

  return { modules, edges };
}
