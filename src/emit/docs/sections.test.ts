import { describe, expect, it } from 'vitest';

import {
  renderArchitecture,
  renderHeader,
  renderImportDiscipline,
  renderModule,
  renderNaming,
  renderPrinciples,
  renderRules,
} from './sections';
import type { ArchitectureDef, ModuleDef, PrincipleDef } from '../../config/types';

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
    const out = renderModule({ layout: 'folder', entry: 'index', private: ['hooks', 'types'] }, 'components');

    expect(out).toContain('components/');
    expect(out).toContain('├─ index');
    expect(out).toContain('└─ types'); // last private part closes the tree
  });

  it('renders a one-line note for flat layout', () => {
    const out = renderModule({ layout: 'flat', entry: 'index', private: [] }, 'components');

    expect(out).toContain('flat layout');
    expect(out).not.toContain('```');
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
