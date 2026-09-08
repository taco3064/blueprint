import type { ArchitectureDef } from '../../config';
import { getDiagramEdges } from '../../config';

export function emitFlowDiagram(architecture: ArchitectureDef): string {
  const lines = getDiagramEdges(architecture).map((edge) => {
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
