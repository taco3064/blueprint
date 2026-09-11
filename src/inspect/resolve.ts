import type { AliasRoot, ArchitectureDef, ResolvedSourcePosition } from '../config';
import { resolveArchitecture, stripSourceRoot } from '../config';
import { unitKey } from '../plugin';
import type { EntryOf, LayoutOf } from '../plugin';
import { dropTestFiles } from './filter';
import type { ImportRef, ScanResult, ScannedFile } from './types';

export type { EntryOf, LayoutOf, RelativeVerdict, UnitShape } from '../plugin';
export { relativeVerdict, resolveSegments, unitKey } from '../plugin';

export function layoutResolver(architecture: ArchitectureDef): LayoutOf {
  const resolved = resolveArchitecture(architecture);
  const perLayer = new Map(resolved.layers.map((layer) => [layer.name, layer.unit.layout]));

  return (layer) => perLayer.get(layer) ?? 'file';
}

export function aliasList(architecture: ArchitectureDef): AliasRoot[] {
  return resolveArchitecture(architecture).aliases;
}

export function stripAlias(
  specifier: string,
  roots: (AliasRoot | string)[],
): string[] | null {
  for (const root of roots) {
    const { alias, prefix } = typeof root === 'string' ? { alias: root, prefix: [] } : root;

    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      const parts = specifier.slice(alias.length).split('/').filter(Boolean);

      if (!prefix.every((segment, index) => parts[index] === segment)) {
        return null;
      }

      const prepend = typeof root === 'string' ? [] : root.prepend ?? [];

      return [...prepend, ...parts.slice(prefix.length)];
    }
  }

  return null;
}

export function entryResolver(architecture: ArchitectureDef): EntryOf {
  const resolved = resolveArchitecture(architecture);
  const perLayer = new Map(resolved.layers.map((layer) => [layer.name, layer.unit.entry]));

  return (layer) => perLayer.get(layer) ?? 'index';
}

export function positionKey(position: ResolvedSourcePosition): string | null {
  if (position.kind === 'source-root') {
    return null;
  }

  if (position.kind === 'module' || position.kind === 'container') {
    return position.module.name;
  }

  // Stryker disable next-line ConditionalExpression: this branch narrows the position union;
  // the unit fallback filters its absent unit to the same key at runtime.
  if (position.kind === 'layer') {
    return [position.module?.name, position.layer.name].filter(Boolean).join('/');
  }

  if (position.layer.unit.layout === 'file') {
    return [position.module?.name, position.layer.name].filter(Boolean).join('/');
  }

  return [position.module?.name, position.layer.name, position.unit].filter(Boolean).join('/');
}

export function targetUnitKey(
  ref: ImportRef,
  file: ScannedFile,
  architecture: ArchitectureDef,
): string | null {
  const resolved = resolveArchitecture(architecture);
  const position = resolved.resolveImportTarget(file.segments, ref.specifier);

  return position ? positionKey(position) : null;
}

export interface UnitGraph {
  units: Set<string>;
  edges: Map<string, Set<string>>;
  /** Static import-reference counts for the same canonical unit identities as `edges`. */
  counts: Map<string, number>;
}

export function buildUnitGraph(scan: ScanResult, architecture: ArchitectureDef): UnitGraph {
  scan = dropTestFiles(scan, architecture.testFiles);

  const resolved = resolveArchitecture(architecture);
  const graph: UnitGraph = { units: new Set(), edges: new Map(), counts: new Map() };

  for (const file of scan.files) {
    const position = resolved.classify(file.segments);
    const from = position ? positionKey(position) : null;

    if (!from) {
      continue;
    }

    graph.units.add(from);

    for (const ref of file.imports) {
      const to = targetUnitKey(ref, file, architecture);

      if (to && to !== from) {
        graph.edges.set(from, (graph.edges.get(from) ?? new Set()).add(to));
        incrementCount(graph.counts, from, to);
      }
    }
  }

  return graph;
}

function incrementCount(counts: Map<string, number>, from: string, to: string): void {
  const key = `${from}\0${to}`;

  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function normalizedUnitKey(input: string, architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);
  const relative = stripSourceRoot(input, architecture);
  const position = resolved.classify(relative);

  if (position) {
    return positionKey(position) ?? '';
  }

  const layoutOf = layoutResolver(architecture);

  return unitKey(relative, layoutOf, resolved.topology === 'module-first');
}
