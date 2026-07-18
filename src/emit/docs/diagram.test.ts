import { describe, expect, it } from 'vitest';

import { emitFlowDiagram } from './diagram';
import type { ArchitectureDef } from '../../config/types';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [{ name: 'components', does: '' }, { name: 'hooks', does: '' }, { name: 'services', does: '' }],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: [] },
    ...over,
  };
}

describe('emitFlowDiagram', () => {
  it('wraps the edges in a mermaid flowchart TD block', () => {
    const diagram = emitFlowDiagram(arch());

    expect(diagram.startsWith('```mermaid\nflowchart TD')).toBe(true);
    expect(diagram.trimEnd().endsWith('```')).toBe(true);
  });

  it('renders chain edges as solid arrows', () => {
    const diagram = emitFlowDiagram(arch());

    expect(diagram).toContain('  components --> hooks');
    expect(diagram).toContain('  hooks --> services');
  });

  it('renders a described selfOnly edge as dashed with a combined label', () => {
    const diagram = emitFlowDiagram(
      arch({ extraEdges: [{ edge: 'components⇢services', selfOnly: true, description: 'Context only' }] }),
    );

    expect(diagram).toContain('  components -. Context only · selfOnly .-> services');
  });

  it('labels a selfOnly-only edge', () => {
    const diagram = emitFlowDiagram(
      arch({ extraEdges: [{ edge: 'components⇢services', selfOnly: true }] }),
    );

    expect(diagram).toContain('  components -. selfOnly .-> services');
  });

  it('renders an unlabelled extra edge as a solid arrow', () => {
    const diagram = emitFlowDiagram(arch({ extraEdges: ['components⇢services'] }));

    expect(diagram).toContain('  components --> services');
  });
});
