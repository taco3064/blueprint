import { describe, expect, it } from 'vitest';

import { emitFlowDiagram } from './diagram';
import type { AllowedImporter, ArchitectureDef } from '../../config';

function arch(): ArchitectureDef {
  return {
    alias: '~app',
    layers: [{ name: 'components', does: '' }, { name: 'hooks', does: '' }, { name: 'services', does: '' }],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: [] },
  };
}

function servicesImportedBy(importers: (string | AllowedImporter)[]): ArchitectureDef {
  const architecture = arch();

  architecture.layers[2].allowedImporters = importers;

  return architecture;
}

describe('emitFlowDiagram', () => {
  it('wraps the edges in a mermaid flowchart TD block', () => {
    const diagram = emitFlowDiagram(arch());

    expect(diagram.startsWith('```mermaid\nflowchart TD')).toBe(true);
    expect(diagram.trimEnd().endsWith('```')).toBe(true);
  });

  it('renders the default adjacent spine as solid arrows', () => {
    const diagram = emitFlowDiagram(arch());

    expect(diagram).toContain('  components --> hooks');
    expect(diagram).toContain('  hooks --> services');
  });

  it('renders a described selfOnly importer as a dashed edge with a combined label', () => {
    const diagram = emitFlowDiagram(
      servicesImportedBy([{ layer: 'components', selfOnly: true, description: 'net only' }]),
    );

    expect(diagram).toContain('  components -. net only · selfOnly .-> services');
  });

  it('labels a selfOnly-only importer', () => {
    const diagram = emitFlowDiagram(servicesImportedBy([{ layer: 'components', selfOnly: true }]));

    expect(diagram).toContain('  components -. selfOnly .-> services');
  });

  it('renders an unlabelled restricted importer as a solid arrow', () => {
    const diagram = emitFlowDiagram(servicesImportedBy(['components']));

    expect(diagram).toContain('  components --> services');
  });
});
