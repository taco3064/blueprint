import { describe, expect, it } from 'vitest';

import { reactPreset } from '../../presets';
import { emitFlowDiagram } from './diagram';
import { emitHandbook } from './docs';

describe('emitHandbook · module-first runway', () => {
  const runway = reactPreset({ name: 'shop', modules: [] });

  it('explains the runway beside the canonical layer contract', () => {
    const handbook = emitHandbook(runway);

    expect(handbook).toContain('### Modules');
    expect(handbook).toContain('declares no domain module yet — a module-first runway');
    expect(handbook).toContain('its root files take the container position');
    expect(handbook).toContain('| `services` | Network primitives');

    expect(handbook.indexOf('## Module growth protocol'))
      .toBeGreaterThan(handbook.indexOf('## Architecture'));
  });

  it('keeps the module table and growth protocol for declared modules', () => {
    const handbook = emitHandbook(reactPreset({
      modules: [
        { name: 'app', does: 'Route composition.', dependsOn: ['checkout'] },
        { name: 'checkout', does: 'Checkout flow.' },
      ],
    }));

    expect(handbook).toContain('| `checkout` | Checkout flow. | — |');
    expect(handbook).toContain('The declared modules are the current domain authority');
    expect(handbook).not.toContain('declares no domain module yet');
  });

  it('names the runway for an app-only module list without a table claim of domains', () => {
    const handbook = emitHandbook(reactPreset({
      modules: [{ name: 'app', does: 'Route composition.' }],
    }));

    expect(handbook).toContain('| `app` | Route composition. | — |');
    expect(handbook).toContain('declares no domain module yet — a module-first runway');
  });

  it('adds nothing module-first to a layer-first handbook', () => {
    const handbook = emitHandbook(reactPreset({ name: 'shop' }));

    expect(handbook).not.toContain('### Modules');
    expect(handbook).not.toContain('Module growth protocol');
  });
});

describe('emitFlowDiagram · module-first runway', () => {
  it('draws the inner layer flow inside the future-module frame', () => {
    const diagram = emitFlowDiagram(reactPreset({ modules: [] }).architecture);

    expect(diagram).toContain('subgraph runway["every future module · none declared yet"]');
    expect(diagram).toContain('hooks -->|Context only · selfOnly| contexts');
    expect(diagram).not.toContain('containers');
  });

  it('keeps the flat layer-first diagram unframed', () => {
    const diagram = emitFlowDiagram(reactPreset().architecture);

    expect(diagram).not.toContain('subgraph');
    expect(diagram).toContain('pages -.-> containers');
  });
});
