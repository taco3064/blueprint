import { resolveArchitecture } from '../../config';
import type { ArchitectureDef } from '../../config';

export function emitFlowDiagram(architecture: ArchitectureDef): string {
  const resolved = resolveArchitecture(architecture);

  if (!resolved.modules.length) {
    return wrap(resolved.diagramEdges.map((edge) => renderEdge(edge.from, edge.to, edge)));
  }

  const layerIndex = new Map(resolved.layers.map((layer, index) => [layer.name, index]));

  const lines = resolved.modules.flatMap((module, moduleIndex) => {
    if (module.name === 'app') {
      return [`  m${moduleIndex}["app · router composition"]`];
    }

    const node = (layer: string) => `m${moduleIndex}_l${layerIndex.get(layer)}`;

    return [
      `  subgraph m${moduleIndex}["${module.name}"]`,
      ...resolved.layers.map((layer, index) => `    m${moduleIndex}_l${index}["${layer.name}"]`),
      ...resolved.diagramEdges.map((edge) => `  ${renderEdge(node(edge.from), node(edge.to), edge)}`),
      '  end',
    ];
  });

  return wrap(lines);
}

function renderEdge(
  from: string,
  to: string,
  edge: { ordered?: boolean; description?: string; selfOnly?: boolean },
): string {
  if (edge.ordered) {
    return `  ${from} -.-> ${to}`;
  }

  const label = [edge.description, edge.selfOnly ? 'selfOnly' : null]
    .filter(Boolean)
    .join(' · ')

    .replace(/\|/g, '/');

  return label
    ? `  ${from} -->|${label}| ${to}`
    : `  ${from} --> ${to}`;
}

function wrap(lines: string[]): string {
  return ['```mermaid', 'flowchart TD', ...lines, '```'].join('\n');
}
