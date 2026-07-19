import { describe, expect, it } from 'vitest';

import {
  renderBehavioral,
  renderChecklist,
  renderComponentShape,
  renderPlaybook,
  renderContext,
  renderHardRules,
  renderHeader,
  renderNaming,
  renderPlacement,
} from './sections';
import type { ArchitectureDef, AxisDef, Blueprint, PrincipleDef } from '../../config';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', mustNot: ['import services'], owns: ['clsx'] },
      { name: 'services', does: 'net' },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'types'] },
    ...over,
  };
}

function blueprint(over: Partial<Blueprint> = {}): Blueprint {
  return { framework: 'vue', architecture: arch(), ...over };
}

describe('renderHeader', () => {
  it('uses a level-2 heading and no marker so it can nest in CLAUDE.md', () => {
    const out = renderHeader();

    expect(out.startsWith('## ')).toBe(true);
    expect(out).not.toContain('<!--');
  });
});

describe('renderContext', () => {
  it('states framework, alias, and the layer flow', () => {
    const out = renderContext(blueprint());

    expect(out).toContain('`vue`');
    expect(out).toContain('`~app`');
    expect(out).toContain('`components` → `services`');
  });
});

describe('renderPlacement', () => {
  it('emits per-layer directives with MUST NOT and OWNS when present', () => {
    const out = renderPlacement(arch());

    expect(out).toContain('- `src/components/` — UI. MUST NOT: import services. OWNS: `clsx`.');
    expect(out).toContain('- `src/services/` — net.');
    expect(out).toContain('Only `index` is importable');
    expect(out).toContain('keep `hooks` / `types` private');
  });

  it('drops the private clause when a folder module has none', () => {
    const out = renderPlacement(arch({ module: { layout: 'folder', entry: 'index', private: [] } }));

    expect(out).toContain('Only `index` is importable from outside.');
    expect(out).not.toContain('keep');
  });

  it('describes a flat module', () => {
    const out = renderPlacement(arch({ module: { layout: 'flat', entry: 'index', private: [] } }));

    expect(out).toContain('one file per module (flat)');
  });

  it('states the allowed importers, marking selfOnly ones', () => {
    const architecture: ArchitectureDef = {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state' },
        {
          name: 'services',
          does: 'net',
          allowedImporters: ['components', { layer: 'hooks', selfOnly: true }],
        },
      ],
      flow: 'one-way',
      module: { layout: 'folder', entry: 'index', private: [] },
    };

    expect(renderPlacement(architecture)).toContain('IMPORTABLE BY: components, hooks (selfOnly).');
  });
});

describe('renderNaming', () => {
  it('returns empty when there are none', () => {
    expect(renderNaming(undefined)).toBe('');
  });

  it('lists conventions', () => {
    expect(renderNaming({ hook: 'useX' })).toContain('- `hook`: useX');
  });
});

describe('renderHardRules', () => {
  it('includes entry-only for folder layout and lists error-tier gates', () => {
    const out = renderHardRules(arch(), {
      maxLines: { tier: 'error', value: 400 },
      noUtils: 'error',
      soft: 'warn',
    });

    expect(out).toContain('Import a module via its `index`');
    expect(out).toContain('`maxLines` = 400 is a hard gate.');
    expect(out).toContain('`noUtils` is a hard gate.');
    expect(out).not.toContain('`soft`'); // warn-tier not a hard gate
    expect(out).toContain('Never silence it with `eslint-disable`');
  });

  it('omits entry-only for flat layout', () => {
    const out = renderHardRules(arch({ module: { layout: 'flat', entry: 'index', private: [] } }), undefined);

    expect(out).not.toContain('via its `index`');
  });
});

describe('renderBehavioral', () => {
  const principles: PrincipleDef[] = [
    { id: 'a', say: 'no utils', why: 'no cohesion', land: 'claude' },
    { id: 'b', say: 'lint one', why: 'x', land: 'lint' },
  ];

  it('always leads with the undeclared-folder rule and includes claude principles', () => {
    const out = renderBehavioral(arch(), principles, undefined);

    expect(out).toContain('Do not create undeclared folders under `~app/`');
    expect(out).toContain('**no utils** — no cohesion');
    expect(out).not.toContain('lint one'); // land: lint excluded
  });

  it('adds a warn note only when warn-tier rules exist', () => {
    expect(renderBehavioral(arch(), undefined, { s: 'warn' })).toContain('`warn`-tier');
    expect(renderBehavioral(arch(), undefined, { s: 'error' })).not.toContain('`warn`-tier');
  });
});

describe('renderChecklist', () => {
  it('grows items with naming and behavioral principles', () => {
    const withExtras = renderChecklist(
      blueprint({
        architecture: arch({ naming: { hook: 'useX' } }),
        principles: [{ id: 'a', say: 's', why: 'w', land: 'claude' }],
      }),
    );

    expect(withExtras).toContain('Names follow the conventions');
    expect(withExtras).toContain('behavioral principles above are upheld');
  });

  it('omits the conditional items when there is no naming or claude principle', () => {
    const bare = renderChecklist(blueprint());

    expect(bare).not.toContain('Names follow the conventions');
    expect(bare).not.toContain('behavioral principles above');
    expect(bare).toContain('No new undeclared folders under `~app/`');
  });
});

describe('renderComponentShape (contract)', () => {
  const axes: AxisDef[] = [
    { id: 'a', name: 'IO Shrinkage', say: 'Narrow IO.', why: 'Model the state.', triage: 'max-params' },
    { id: 'b', name: 'Orchestration Shell', say: 'Pages orchestrate.', why: 'No per-child derivation.' },
  ];

  it('is omitted when there are no axes', () => {
    expect(renderComponentShape(undefined)).toBe('');
    expect(renderComponentShape([])).toBe('');
  });

  it('renders one directive bullet per axis, with triage as entry point only', () => {
    const out = renderComponentShape(axes);

    expect(out).toContain('### Component shape (orthogonal axes — judge each independently)');
    expect(out).toContain('- **IO Shrinkage** — Narrow IO. Model the state. (triage: `max-params` is an entry point, never the verdict)');
    expect(out).toContain('- **Orchestration Shell** — Pages orchestrate. No per-child derivation.');
  });
});

describe('renderPlaybook (contract)', () => {
  it('is omitted when there is no playbook', () => {
    expect(renderPlaybook(undefined)).toBe('');
    expect(renderPlaybook([])).toBe('');
  });

  it('renders terse directives grouped under theme headings', () => {
    const out = renderPlaybook([
      { title: 'BE boundary', rules: [{ id: 'a', say: 'Never fake.', why: 'It hides bugs.' }] },
      { title: 'Refactor', rules: [{ id: 'b', say: 'Net first.' }] },
    ]);

    expect(out).toContain('### Working playbook (judgment rules — you are the gate)');
    expect(out).toContain('#### BE boundary');
    expect(out).toContain('- **Never fake.** It hides bugs.');
    expect(out).toContain('#### Refactor');
    expect(out).toContain('- **Net first.**');
  });
});
