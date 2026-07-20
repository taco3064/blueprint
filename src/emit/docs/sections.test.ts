import { describe, expect, it } from 'vitest';

import {
  renderArchitecture,
  renderComponentShape,
  renderPlaybook,
  renderHeader,
  renderImportDiscipline,
  renderModule,
  renderNaming,
  renderPrinciples,
  renderRules,
} from './sections';
import type { ArchitectureDef, AxisDef, ModuleDef, PrincipleDef } from '../../config';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', mustNot: ['import services'], owns: ['clsx'] },
      { name: 'services', does: 'net', owns: ['axios'] },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'types'] },
    ...over,
  };
}

describe('renderHeader', () => {
  it('includes the project name when given', () => {
    expect(renderHeader('Acme')).toContain('# Acme — Architecture Handbook');
  });

  it('falls back to a bare title', () => {
    expect(renderHeader(undefined)).toContain('# Architecture Handbook');
  });
});

describe('renderArchitecture', () => {
  it('renders the diagram, a layers table, and dashes for empty cells', () => {
    const out = renderArchitecture(arch());

    expect(out).toContain('```mermaid');
    expect(out).toContain('### Layers');
    expect(out).toContain('| `components` | UI | import services | `clsx` |');
    // services has no mustNot → em dash
    expect(out).toContain('| `services` | net | — | `axios` |');
  });
});

describe('renderModule', () => {
  it('renders a folder tree with entry, impl, and private parts', () => {
    const out = renderModule(arch(), 'components');

    expect(out).toContain('components/');
    expect(out).toContain('├─ index');
    expect(out).toContain('└─ types'); // last private part closes the tree
  });

  it('renders a one-line note for flat layout', () => {
    const out = renderModule(
      arch({ module: { layout: 'flat', entry: 'index', private: [] } }),
      'components',
    );

    expect(out).toContain('flat layout');
    expect(out).not.toContain('```');
  });

  it('lists per-layer exceptions to the shared shape', () => {
    const architecture = arch({
      module: { layout: 'flat', entry: 'index', private: [] },
      layers: [
        { name: 'resources', does: 'features', module: { layout: 'folder', entry: 'index' } },
        { name: 'components', does: 'UI', module: { layout: 'flat' } },
        { name: 'services', does: 'net' },
      ],
    });

    const out = renderModule(architecture, 'resources');

    expect(out).toContain('Per-layer exceptions');
    expect(out).toContain('`resources/` — one folder per module, entry `index`.');
    expect(out).toContain('`components/` — one file per module (flat).');
    expect(out).not.toContain('`services/` —');
  });

  it('renders exceptions under a folder default too', () => {
    const architecture = arch({
      layers: [
        { name: 'components', does: 'UI', module: { layout: 'flat' } },
        { name: 'services', does: 'net' },
      ],
    });

    const out = renderModule(architecture, 'components');

    expect(out).toContain('One module = one folder');
    expect(out).toContain('`components/` — one file per module (flat).');
  });
});

describe('renderImportDiscipline', () => {
  it('includes the entry-only rule for folder layout', () => {
    expect(renderImportDiscipline(arch())).toContain('Entry-only');
  });

  it('swaps in the relative-path rule and drops entry-only for flat layout', () => {
    const flat: ModuleDef = { layout: 'flat', entry: 'index', private: [] };
    const out = renderImportDiscipline(arch({ module: flat }));

    expect(out).toContain('use a relative path');
    expect(out).not.toContain('Entry-only');
  });

  it('keeps entry-only when any layer overrides to folder layout', () => {
    const out = renderImportDiscipline(
      arch({
        module: { layout: 'flat', entry: 'index', private: [] },
        layers: [
          { name: 'resources', does: 'features', module: { layout: 'folder', entry: 'main' } },
          { name: 'services', does: 'net' },
        ],
      }),
    );

    expect(out).toContain('Entry-only');
    expect(out).toContain('`main`');
  });

  it('adds a selfOnly note when a selfOnly importer exists', () => {
    const architecture = arch();

    architecture.layers[1].allowedImporters = [{ layer: 'components', selfOnly: true }];

    expect(renderImportDiscipline(architecture)).toContain('selfOnly');
  });
});

describe('renderPrinciples', () => {
  const principles: PrincipleDef[] = [
    { id: 'a', say: 'lint one', why: 'because', land: 'lint' },
    { id: 'b', say: 'behavioral one', why: 'reason', land: 'claude' },
  ];

  it('returns empty when there are none', () => {
    expect(renderPrinciples(undefined)).toBe('');
  });

  it('splits into tooling and behavioral groups', () => {
    const out = renderPrinciples(principles);

    expect(out).toContain('### Enforced by tooling');
    expect(out).toContain('**lint one** — because');
    expect(out).toContain('### Behavioral');
    expect(out).toContain('**behavioral one** — reason');
  });

  it('omits an empty group', () => {
    const out = renderPrinciples([principles[0]]);

    expect(out).toContain('### Enforced by tooling');
    expect(out).not.toContain('### Behavioral');
  });
});

describe('renderRules', () => {
  it('returns empty when there are none', () => {
    expect(renderRules(undefined)).toBe('');
  });

  it('renders bare tiers, object tiers, and option values', () => {
    const out = renderRules({
      noUtils: 'error',
      maxLines: { tier: 'error', value: 400 },
      deepWatch: { tier: 'warn' },
    });

    expect(out).toContain('| `noUtils` | `error` | — |');
    expect(out).toContain('| `maxLines` | `error` | `400` |');
    expect(out).toContain('| `deepWatch` | `warn` | — |');
  });
});

describe('renderNaming', () => {
  it('returns empty when there are none', () => {
    expect(renderNaming(undefined)).toBe('');
  });

  it('renders a concept table', () => {
    expect(renderNaming({ hook: 'useX + reactivity' })).toContain('| `hook` | useX + reactivity |');
  });
});

describe('renderComponentShape', () => {
  const axes: AxisDef[] = [
    { id: 'a', name: 'Ownership Inversion', say: 'Own it.', why: 'Child derives.', triage: 'max-params' },
    { id: 'b', name: 'Scoped Writable State', say: 'Lowest owner.', why: 'Hoist late.' },
  ];

  it('is omitted when there are no axes', () => {
    expect(renderComponentShape(undefined)).toBe('');
    expect(renderComponentShape([])).toBe('');
  });

  it('numbers each axis and marks triage rules as entry points only', () => {
    const out = renderComponentShape(axes);

    expect(out).toContain('## Component shape — 2 orthogonal axes');
    expect(out).toContain('A set, not a pipeline');
    expect(out).toContain('### 1. Ownership Inversion — Own it.');
    expect(out).toContain('> Triage: `max-params` is the review entry point');
    expect(out).toContain('### 2. Scoped Writable State — Lowest owner.');

    // The axis without a triage rule carries no triage note.
    expect(out.split('Triage:')).toHaveLength(2);
  });
});

describe('renderPlaybook', () => {
  it('is omitted when there is no playbook', () => {
    expect(renderPlaybook(undefined)).toBe('');
    expect(renderPlaybook([])).toBe('');
  });

  it('renders one themed section per group, with optional why', () => {
    const out = renderPlaybook([
      {
        title: 'Runtime load discipline',
        rules: [
          { id: 'a', say: 'Price the handler.', why: 'Frequency is not in the code.' },
          { id: 'b', say: 'Write in place.' },
        ],
      },
    ]);

    expect(out).toContain('## Working playbook');
    expect(out).toContain('### Runtime load discipline');
    expect(out).toContain('- **Price the handler.** — Frequency is not in the code.');
    expect(out).toContain('- **Write in place.**');
    expect(out).not.toContain('Write in place.** —');
  });
});
