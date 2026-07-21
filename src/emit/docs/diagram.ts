import type { ArchitectureDef } from '../../config';
import { getDiagramEdges } from '../../config';

/**
 * Render the dependency flow as a mermaid `flowchart TD`. Solid edges are
 * declared importer relations (labeled when they carry a description or
 * `selfOnly`); dotted edges only record declaration order — consecutive
 * leaf layers are often unrelated, and a solid chain misread as dependency
 * was a recurring field complaint. Derived from the same layer order +
 * allowedImporters the Enforce emitter lints from.
 */
export function emitFlowDiagram(architecture: ArchitectureDef): string {
  const lines = getDiagramEdges(architecture).map((edge) => {
    if (edge.ordered) return `  ${edge.from} -.-> ${edge.to}`;

    const label = [edge.description, edge.selfOnly ? 'selfOnly' : null]
      .filter(Boolean)
      .join(' · ');

    return label
      ? `  ${edge.from} -->|${label}| ${edge.to}`
      : `  ${edge.from} --> ${edge.to}`;
  });

  return ['```mermaid', 'flowchart TD', ...lines, '```'].join('\n');
}
