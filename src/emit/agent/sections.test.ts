import { describe, expect, it } from 'vitest';

import {
  renderCompactContract,
  renderBehavioral,
  renderChecklist,
  renderComponentShape,
  renderPlaybook,
  renderHardRules,
  renderNaming,
  renderPlacement,
} from './sections';
import type { ArchitectureDef, AxisDef, Blueprint, PrincipleDef } from '../../config';
import { renderTestFilesOperational } from '../../operational-contract';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      {
        name: 'components', does: 'UI', layout: 'folder', entry: 'index',
        mustNot: ['import services'], owns: ['clsx'],
      },
      { name: 'services', does: 'net', layout: 'folder', entry: 'index' },
    ],
    ...over,
  };
}

function blueprint(over: Partial<Blueprint> = {}): Blueprint {
  return { framework: 'vue', architecture: arch(), ...over };
}

describe('renderPlacement', () => {
  it('emits per-layer directives with MUST NOT and OWNS when present', () => {
    const out = renderPlacement(arch());

    expect(out).toContain(
      '- `src/components/` — layer: UI. MUST NOT: import services. OWNS: `clsx`.',
    );

    expect(out).toContain('- `src/services/` — layer: net.');

    expect(out.match(/OWNS:/g)).toHaveLength(1);

    expect(out).not.toContain('IMPORTABLE BY:');

    expect(out).toContain('only `index` is importable');

    expect(out).not.toContain('private');
  });

  it('does not invent a retired private clause for folder units', () => {
    const out = renderPlacement(
      arch(),
    );

    expect(out).toContain('only `index` is importable from outside.');

    expect(out).not.toContain('keep');

    const omitted = renderPlacement(arch());

    expect(omitted).toContain('only `index` is importable from outside.');

    expect(omitted).not.toContain('keep');
  });

  it('describes file units', () => {
    const out = renderPlacement(arch({
      layers: [
        { name: 'components', does: 'UI', layout: 'file' },
        { name: 'services', does: 'net', layout: 'file' },
      ],
    }));

    expect(out).toContain('one file per unit');
  });

  it('lists each layer unit shape', () => {
    const out = renderPlacement(
      arch({
        layers: [
          { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
          { name: 'components', does: 'UI', layout: 'file' },
          { name: 'services', does: 'net', layout: 'file' },
        ],
      }),
    );

    expect(out).toContain(
      '- `resources` units: one folder per unit; only `main` is importable from outside.',
    );

    expect(out).toContain('- `components` units: one file per unit.');

    expect(out).toContain('- `services` units: one file per unit.');
  });

  it('names the project\'s own test globs, never a hard-coded pair', () => {
    const out = renderPlacement(arch({ testFiles: ['**/*.spec.ts', '**/*.fixtures.ts'] }));

    expect(out).toContain(renderTestFilesOperational(
      'agent-placement',
      'en',
      ['**/*.spec.ts', '**/*.fixtures.ts'],
    ));

    expect(out).not.toContain('*.test.');

    // Omitted means the default pair, which the contract must state rather
    // than leave the agent to guess.
    expect(renderPlacement(arch())).toContain('`**/*.test.{js,jsx,ts,tsx,vue}`');
  });

  it('renders no exemption line when testFiles is empty', () => {
    const out = renderPlacement(arch({ testFiles: [] }));

    expect(out).not.toContain('Test support is exempt');
  });

  it('bounds the exemption by what the globs reach, in the line an agent places by', () => {
    const out = renderPlacement(arch());

    expect(out).toContain(renderTestFilesOperational('agent-placement', 'en'));
  });

  it('closes the rename-to-escape route the exemption opens', () => {
    const out = renderPlacement(arch());

    expect(out).toContain(renderTestFilesOperational('agent-placement', 'en'));
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
    const out = renderHardRules(blueprint({
      rules: {
        maxLines: { tier: 'error', value: 400 },
        unusedVars: 'error',
        cycles: 'error',
        noUtils: 'error',
        soft: 'warn',
      },
    }));

    expect(out).toContain(
      '- Cross-layer imports go only downstream; local same-layer imports never use the alias.',
    );

    expect(out).toContain('Import a folder unit via its `index`');

    expect(out)
      .toContain('`maxLines` = 400 is emitted but not yet verified alive in the project lint run.');

    expect(out)
      .toContain('- `unusedVars` is emitted but not yet verified alive in the project lint run.');

    expect(out).not.toContain('undefined');

    expect(out)
      .not.toContain('`noUtils` is emitted but not yet verified alive in the project lint run.');

    expect(out)
      .not.toContain('`deadCode` is emitted but not yet verified alive in the project lint run.');

    expect(out)
      .not.toContain('`soft`'); // warn-tier not a hard gate

    expect(out).toContain('Never silence it with `eslint-disable`');
  });

  it('omits entry-only for file layout', () => {
    const out = renderHardRules(blueprint({
      architecture: arch({
        layers: [
          { name: 'components', does: 'UI', layout: 'file' },
          { name: 'services', does: 'net', layout: 'file' },
        ],
      }),
    }));

    // The entry names are interpolated, so an unguarded push renders the rule
    // with an empty slot — "Import a module via its , never its internals." The
    // sentence has to be absent, not merely missing the entry name.
    expect(out).not.toContain('Import a module via its');

    expect(out).not.toContain('never its internals');
  });
});

describe('renderHardRules · only what the tooling actually holds', () => {
  // `error` is what the author declared; hard is what a machine can keep. Three gates
  // were called hard here that nothing enforces — on the one document an agent reads
  // with no CLI output beside it, which is why the compact contract already guards
  // both questions and this one had neither.
  const kept = { maxLines: { tier: 'error' as const, value: 400 } };

  it('drops a gate the stack cannot open, and keeps it on the stack that can', () => {
    const onReact = renderHardRules(blueprint({
      framework: 'react',
      architecture: arch({ testFiles: ['**/*.test.ts'] }),
      rules: { deepWatch: 'error', ...kept },
    }));

    expect(onReact).not.toContain('deepWatch');

    // A genuinely hard gate still appears, in the same words — assert both directions
    // or the fix passes by emptying the section.
    expect(onReact)
      .toContain('`maxLines` = 400 is emitted but not yet verified alive in the project lint run.');

    const onVue = renderHardRules(blueprint({
      architecture: arch({ testFiles: ['**/*.test.ts'] }),
      rules: { deepWatch: 'error', ...kept },
    }));

    expect(onVue)
      .toContain('`deepWatch` is emitted but not yet verified alive in the project lint run.');
  });

  it('drops `testFilename` where `testFiles: []` leaves it no scope', () => {
    const empty = renderHardRules(blueprint({
      architecture: arch({ testFiles: [] }),
      rules: { testFilename: 'error', ...kept },
    }));

    expect(empty).not.toContain('testFilename');

    expect(empty)
      .toContain('`maxLines` = 400 is emitted but not yet verified alive in the project lint run.');

    const declared = renderHardRules(blueprint({
      architecture: arch({ testFiles: ['**/*.test.ts'] }),
      rules: { testFilename: 'error', ...kept },
    }));

    expect(declared)
      .toContain('`testFilename` is emitted but not yet verified alive in the project lint run.');
  });

  it('names `cycles`\' real holder instead of calling it a lint gate', () => {
    const out = renderHardRules(blueprint({ rules: { cycles: 'error', ...kept } }));

    // Not dropped like the two above: `cycles` IS enforced, by a runtime this list
    // was attributing to lint. A repo holding a baseline reads "hard gate" and takes
    // a green lint as covering it; silently removing the row instead would leave an
    // error-tier declaration gone from the contract with no cause stated.
    expect(out)
      .not.toContain('`cycles` is emitted but not yet verified alive in the project lint run.');

    expect(out).toContain(
      '- `cycles` is diagnosed only when `npx blueprint inspect --baseline` runs; '
      + 'the baseline grandfathers recorded findings, so this is not continuous '
      + 'edit-time prevention and a green lint says nothing about it.',
    );

    expect(out)
      .toContain('`maxLines` = 400 is emitted but not yet verified alive in the project lint run.');
  });

  it('says it in the compact contract\'s own words, from the same helper', () => {
    // Two renderers phrasing one fact separately is how they come to disagree — the
    // shape `unavailableGate` itself was consolidated out of. If either sentence
    // drifts, this is the case that turns red.
    const bp = blueprint({ rules: { cycles: 'error', ...kept } });

    const held = '`cycles` is diagnosed only when `npx blueprint inspect --baseline` runs; '
      + 'the baseline grandfathers recorded findings, so this is not continuous '
      + 'edit-time prevention and a green lint says nothing about it';

    expect(renderHardRules(bp)).toContain(held);

    expect(renderCompactContract(bp)).toContain(held);
  });
});

describe('renderBehavioral', () => {
  const principles: PrincipleDef[] = [
    { id: 'a', say: 'no utils', why: 'no cohesion', land: 'claude' },
    { id: 'b', say: 'lint one', why: 'x', land: 'lint' },
  ];

  it('always leads with the undeclared-folder rule and includes claude principles', () => {
    const out = renderBehavioral(arch(), principles, undefined);

    expect(out).toContain('Do not create undeclared architectural folders under `~app/`');

    expect(out).toContain('**no utils** — no cohesion');

    expect(out)
      .not.toContain('lint one'); // land: lint excluded
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

    expect(bare).not.toContain('component-shape axis');

    expect(bare).toContain('No new undeclared folders under `~app/`');

    expect(bare).toContain(
      '- [ ] Imports follow the one-way flow and use `~app` across layer or module boundaries',
    );

    expect(bare).toContain('Statically resolvable dynamic imports pass the same boundary checks');

    expect(bare).toContain('folder units expose only their declared entry');
  });
});

describe('renderComponentShape (contract)', () => {
  const axes: AxisDef[] = [
    {
      id: 'a',
      name: 'IO Shrinkage',
      say: 'Narrow IO.',
      why: 'Model the state.',
      triage: 'max-params',
    },
    {
      id: 'b',
      name: 'Orchestration Shell',
      say: 'Pages orchestrate.',
      why: 'No per-child derivation.',
    },
  ];

  it('is omitted when there are no axes', () => {
    expect(renderComponentShape(undefined)).toBe('');
    expect(renderComponentShape([])).toBe('');
  });

  it('renders one directive bullet per axis, with triage as entry point only', () => {
    const out = renderComponentShape(axes);

    expect(out).toContain('### Component shape (orthogonal axes — judge each independently)');

    expect(out).toContain(
      '- **IO Shrinkage** — Narrow IO. Model the state. (triage: `max-params` is an entry point, '
      + 'never the verdict)',
    );

    expect(out).toContain(
      '- **Orchestration Shell** — Pages orchestrate. No per-child derivation.',
    );
  });
});

describe('renderPlaybook (contract)', () => {
  it('is omitted when there is no playbook', () => {
    expect(renderPlaybook(undefined)).toBe('');
    expect(renderPlaybook([])).toBe('');
  });

  it('renders terse directives grouped under theme headings', () => {
    const out = renderPlaybook([
      {
        title: 'Runtime',
        rules: [{ id: 'a', say: 'Price it.', why: 'Frequency is not in the code.' }],
      },
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
