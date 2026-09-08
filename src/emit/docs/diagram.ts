import { resolveArchitecture } from '../../config';
import type { ArchitectureDef } from '../../config';

export function emitFlowDiagram(architecture: ArchitectureDef): string {
  const lines = resolveArchitecture(architecture).diagramEdges.map((edge) => {
    if (edge.ordered) {
      return `  ${edge.from} -.-> ${edge.to}`;
    }

    const label = [edge.description, edge.selfOnly ? 'selfOnly' : null]
      .filter(Boolean)
      .join(' · ')

      .replace(/\|/g, '/');

    return label
      ? `  ${edge.from} -->|${label}| ${edge.to}`
      : `  ${edge.from} --> ${edge.to}`;
  });

  return ['```mermaid', 'flowchart TD', ...lines, '```'].join('\n');
}
