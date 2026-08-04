import { describe, expect, it } from 'vitest';

import {
  renderCompactContract,
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

    // services declares neither, and `toContain` cannot see a clause appended
    // after what it matched. A guard that let services through would print an
    // empty ` OWNS: .` or reach into an absent importer list.
    expect(out.match(/OWNS:/g)).toHaveLength(1);
    expect(out).not.toContain('IMPORTABLE BY:');
    expect(out).toContain('Only `index` is importable');
    expect(out).toContain('keep `hooks` / `types` private');
  });

  it('drops the private clause when a folder module has none', () => {
    const out = renderPlacement(arch({ module: { layout: 'folder', entry: 'index', private: [] } }));

    expect(out).toContain('Only `index` is importable from outside.');
    expect(out).not.toContain('keep');

    // Omitted entirely reads the same as an explicit empty list.
    const omitted = renderPlacement(arch({ module: { layout: 'folder', entry: 'index' } }));

    expect(omitted).toContain('Only `index` is importable from outside.');
    expect(omitted).not.toContain('keep');
  });

  it('describes a flat module', () => {
    const out = renderPlacement(arch({ module: { layout: 'flat', entry: 'index', private: [] } }));

    expect(out).toContain('one file per module (flat)');
  });

  it('lists per-layer module exceptions after the shared shape', () => {
    const out = renderPlacement(
      arch({
        module: { layout: 'flat', entry: 'index', private: [] },
        layers: [
          { name: 'resources', does: 'features', module: { layout: 'folder', entry: 'main' } },
          { name: 'components', does: 'UI', module: { layout: 'flat' } },
          { name: 'services', does: 'net' },
        ],
      }),
    );

    expect(out).toContain('- Exception — `src/resources/`: one folder per module, entry `main`.');
    expect(out).toContain('- Exception — `src/components/`: one file per module (flat).');
    expect(out).not.toContain('Exception — `src/services/`');
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
      // Gated, error-tier, and carrying no number — a bare tier must not grow
      // one. "`cycles` = undefined is a hard gate" reads as a real threshold,
      // and the agent has no way to know which number it is supposed to be.
      cycles: 'error',
      noUtils: 'error',
      soft: 'warn',
    });

    // The flow rule leads the list unconditionally — it is the one rule that
    // holds whatever the blueprint declares, so nothing gates it.
    expect(out).toContain('- Import only from downstream layers — never upstream, never the same layer.');
    expect(out).toContain('Import a module via its `index`');
    expect(out).toContain('`maxLines` = 400 is a hard gate.');
    expect(out).toContain('`cycles` is a hard gate.');
    expect(out).not.toContain('undefined');
    // Unknown ids are documentation — the contract must not call them gates.
    expect(out).not.toContain('`noUtils` is a hard gate.');
    expect(out).not.toContain('`deadCode` is a hard gate.');

    expect(out).not.toContain('`soft`'); // warn-tier not a hard gate
    expect(out).toContain('Never silence it with `eslint-disable`');
  });

  it('omits entry-only for flat layout', () => {
    const out = renderHardRules(arch({ module: { layout: 'flat', entry: 'index', private: [] } }), undefined);

    // The entry names are interpolated, so an unguarded push renders the rule
    // with an empty slot — "Import a module via its , never its internals." The
    // sentence has to be absent, not merely missing the entry name.
    expect(out).not.toContain('Import a module via its');
    expect(out).not.toContain('never its internals');
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
    // No axes declared → nothing to hold the unit against. Asking for a check
    // the blueprint never defined leaves the agent judging against nothing.
    expect(bare).not.toContain('component-shape axis');
    expect(bare).toContain('No new undeclared folders under `~app/`');

    // The two unconditional items — a checklist that grows with the blueprint
    // still has to carry the parts that hold for every blueprint.
    expect(bare).toContain('- [ ] Imports follow the one-way flow (no upstream / same-layer).');
    expect(bare).toContain('modules expose only `index`');
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
      { title: 'Runtime', rules: [{ id: 'a', say: 'Price it.', why: 'Frequency is not in the code.' }] },
      { title: 'Refactor', rules: [{ id: 'b', say: 'Net first.' }] },
    ]);

    expect(out).toContain('### Working playbook (judgment rules — you are the gate)');
    expect(out).toContain('#### Runtime');
    expect(out).toContain('- **Price it.** Frequency is not in the code.');
    expect(out).toContain('#### Refactor');
    expect(out).toContain('- **Net first.**');
  });
});

describe('renderBehavioral · deadCode honesty', () => {
  it('routes error-tier deadCode to knip instead of claiming a lint gate', () => {
    const out = renderBehavioral(arch(), undefined, { deadCode: 'error' });

    expect(out).toContain('no lint rule can gate it');
    expect(out).toContain('npx knip');
    expect(out).toContain('wire it into whatever verification you run');

    expect(renderBehavioral(arch(), undefined, { deadCode: 'warn' })).not.toContain('npx knip');
  });
});

describe('renderCompactContract', () => {
  it('fits project facts on one screen with links carrying the bulk', () => {
    const out = renderCompactContract({
      ...blueprint(),
      rules: { maxLines: { tier: 'error' as const, value: 300 }, cycles: 'error' as const },
      playbook: [{ title: 'T', rules: [{ id: 'r', say: 'do' }] }],
    });

    // 13, not 12: the header spends one line saying hand-written notes live
    // outside the markers — the convention an agent had to infer when the
    // generated file became the repo's only CLAUDE.md (field #21).
    expect(out.split('\n').length).toBeLessThanOrEqual(13);
    expect(out).toContain('`components` → `services`');
    expect(out).toContain('[docs/architecture-handbook.md](docs/architecture-handbook.md)');
    expect(out).toContain('node_modules/@kekkai/blueprint/agent-contract.md');
    expect(out).toContain('`maxLines` = 300');
    expect(out).toContain('the working playbook');
    expect(out).not.toContain('### Where code goes');
  });

  it('announces only the kinds of content the blueprint carries', () => {
    // The pointer line names what the handbook covers. Naming "the working
    // playbook" in a contract that carries none sends the agent to a section
    // that was never generated.
    const bare = renderCompactContract(blueprint());

    expect(bare).not.toContain('component-shape axes');
    expect(bare).not.toContain('behavioral principles');
    expect(bare).not.toContain('the working playbook');

    // And with nothing extra to name, the clause closes straight after
    // "naming" — anything appended there is a promise of content that the
    // handbook does not hold.
    expect(bare).toContain('ownership, naming: read');

    const rich = renderCompactContract(blueprint({
      componentShape: [{ id: 'a', name: 'Axis', say: 's', why: 'w' } as AxisDef],
      principles: [{ id: 'p', say: 's', why: 'w', land: 'claude' } as PrincipleDef],
      playbook: [{ title: 'T', rules: [{ id: 'r', say: 'do' }] }],
    }));

    expect(rich).toContain('component-shape axes');
    expect(rich).toContain('behavioral principles');
    expect(rich).toContain('the working playbook');
  });

  it('prints a gate value only where the setting carries one', () => {
    const out = renderCompactContract(blueprint({
      rules: { maxLines: { tier: 'error' as const, value: 300 }, cycles: 'error' as const },
    }));

    // `cycles` is a bare tier with no number behind it, and "= undefined" in a
    // list of machine-enforced gates reads as a real threshold.
    expect(out).toContain('`cycles`');
    expect(out).not.toContain('`cycles` =');
  });

  it('lists only ids a machine actually gates', () => {
    // Error tier is what the author declared; being gated is what the tooling
    // can keep. `noUtils` has no rule behind it and `deadCode` is knip's job —
    // naming either on the one-screen contract promises enforcement that never
    // arrives, and the agent stops looking for the parts that are enforced.
    const out = renderCompactContract(blueprint({
      rules: { maxLines: { tier: 'error' as const, value: 300 }, noUtils: 'error', deadCode: 'error' },
    }));

    expect(out).toContain('`maxLines` = 300');
    expect(out).not.toContain('noUtils');
    expect(out).not.toContain('deadCode');
  });

  it('honors a handbook path override', () => {
    const out = renderCompactContract({
      ...blueprint(),
      emit: { handbook: 'HB.md' },
    });

    expect(out).toContain('[HB.md](HB.md)');
  });
});
