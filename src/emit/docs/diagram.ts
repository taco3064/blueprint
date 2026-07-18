import type { ArchitectureDef } from '../../config/types';
import { deriveEdges } from '../../config/graph';

/**
 * Render the dependency flow as a mermaid `flowchart TD`. Edges carrying a
 * label (a description and/or `selfOnly`) are drawn dashed; the rest solid.
 * Reads the same edge set the Enforce emitter lints from.
 */
export function emitFlowDiagram(architecture: ArchitectureDef): string {
  const lines = deriveEdges(architecture).map((edge) => {
    const label = [edge.description, edge.selfOnly ? 'selfOnly' : null]
      .filter(Boolean)
      .join(' · ');

    return label
      ? `  ${edge.from} -. ${label} .-> ${edge.to}`
      : `  ${edge.from} --> ${edge.to}`;
  });

  return ['```mermaid', 'flowchart TD', ...lines, '```'].join('\n');
}
