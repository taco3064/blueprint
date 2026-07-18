import type { ArchitectureDef, ExtraEdge } from './types';

/** A normalized dependency edge between two layers. */
export interface Edge {
  from: string;
  to: string;
  selfOnly?: boolean;
  description?: string;
}

const EDGE_SEP = /\s*(?:⇢|→|->)\s*/;

/** Parse a `'from⇢to'` string into its two endpoints. Throws if malformed. */
export function parseEdge(edge: string): [string, string] {
  const [from, to, ...rest] = edge.split(EDGE_SEP);

  if (!from || !to || rest.length) {
    throw new Error(`Invalid edge "${edge}" — expected "from⇢to".`);
  }

  return [from, to];
}

/** Normalize the mixed `extraEdges` list into {@link Edge} objects. */
export function normalizeExtraEdges(
  extraEdges: (string | ExtraEdge)[] | undefined,
): Edge[] {
  return (extraEdges ?? []).map((entry) => {
    const spec = typeof entry === 'string' ? { edge: entry } : entry;
    const [from, to] = parseEdge(spec.edge);

    return { from, to, selfOnly: spec.selfOnly, description: spec.description };
  });
}

/**
 * Derive the full edge set: the linear one-way chain (layer[i] → layer[i+1])
 * plus the normalized extra edges.
 */
export function deriveEdges(architecture: ArchitectureDef): Edge[] {
  const { layers, extraEdges } = architecture;

  const chain: Edge[] = layers
    .slice(0, -1)
    .map((layer, i) => ({ from: layer.name, to: layers[i + 1].name }));

  return [...chain, ...normalizeExtraEdges(extraEdges)];
}

/**
 * Transitively allowed downstream layers for `layer`. `selfOnly` edges are
 * followed only from the root layer, never re-exported further down.
 */
export function getAllowedLayers(edges: Edge[], layer: string): string[] {
  const walk = (node: string, root: boolean): string[] =>
    edges.reduce<string[]>((acc, edge) => {
      if (edge.from === node && (!edge.selfOnly || root)) {
        acc.push(edge.to, ...walk(edge.to, false));
      }

      return acc;
    }, []);

  return Array.from(new Set(walk(layer, true)));
}

/** Layers `layer` must not import: everything except itself and its allowed set. */
export function getForbiddenLayers(
  edges: Edge[],
  allLayers: string[],
  layer: string,
): string[] {
  const allowed = getAllowedLayers(edges, layer);

  return allLayers.filter((other) => other !== layer && !allowed.includes(other));
}

/** Return the first dependency cycle as a node path, or `null` if acyclic. */
export function detectCycle(edges: Edge[]): string[] | null {
  const graph = new Map<string, string[]>();

  for (const { from, to } of edges) {
    if (!graph.has(from)) graph.set(from, []);

    graph.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (node: string, path: string[]): string[] | null => {
    visited.add(node);
    stack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (stack.has(next)) {
        return [...path.slice(path.indexOf(next)), next];
      }

      if (!visited.has(next)) {
        const found = dfs(next, [...path, next]);

        if (found) return found;
      }
    }

    stack.delete(node);

    return null;
  };

  for (const node of new Set(edges.flatMap(({ from, to }) => [from, to]))) {
    if (!visited.has(node)) {
      const found = dfs(node, [node]);

      if (found) return found;
    }
  }

  return null;
}
