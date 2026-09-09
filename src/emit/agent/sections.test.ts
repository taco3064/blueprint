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
import { enforcedBy, LINT_GATED_RULE_IDS } from '../lint';

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

    expect(out).toContain('files matching `**/*.spec.ts` / `**/*.fixtures.ts` sit outside them');
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

    // The contract is read with no CLI output beside it, so this line is the whole
    // of what the agent knows. Unqualified it says test support is outside placement
    // full stop — and a declared glob that matches no file exempts nothing, which
    // sends the agent to put a file where the rules above forbid it.
    const bound = 'a file none of them matches is placed by the rules above like any other';

    expect(out).toContain('exempt from every placement rule above as far as those globs reach');
    expect(out).toContain(bound);
  });

  it('closes the rename-to-escape route the exemption opens', () => {
    const out = renderPlacement(arch());

    expect(out).toContain('never rename a file to match those globs');
    expect(out).toContain('never widen `architecture.testFiles` yourself');

    // The third door is a question to raise, not a remedy to take: an agent
    // told it may widen the globs edits the architecture to clear its own gate.
    expect(out).toContain('that is a question for the owner');
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
      '- Cross-layer imports go only downstream; same-layer imports never use the alias.',
    );

    expect(out).toContain('Import a folder unit via its `index`');
    expect(out).toContain('`maxLines` = 400 is a hard gate.');
    expect(out).toContain('- `unusedVars` is a hard gate.');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('`noUtils` is a hard gate.');
    expect(out).not.toContain('`deadCode` is a hard gate.');

    expect(out).not.toContain('`soft`'); // warn-tier not a hard gate
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
    expect(onReact).toContain('`maxLines` = 400 is a hard gate.');

    const onVue = renderHardRules(blueprint({
      architecture: arch({ testFiles: ['**/*.test.ts'] }),
      rules: { deepWatch: 'error', ...kept },
    }));

    expect(onVue).toContain('`deepWatch` is a hard gate.');
  });

  it('drops `testFilename` where `testFiles: []` leaves it no scope', () => {
    const empty = renderHardRules(blueprint({
      architecture: arch({ testFiles: [] }),
      rules: { testFilename: 'error', ...kept },
    }));

    expect(empty).not.toContain('testFilename');
    expect(empty).toContain('`maxLines` = 400 is a hard gate.');

    const declared = renderHardRules(blueprint({
      architecture: arch({ testFiles: ['**/*.test.ts'] }),
      rules: { testFilename: 'error', ...kept },
    }));

    expect(declared).toContain('`testFilename` is a hard gate.');
  });

  it('names `cycles`\' real holder instead of calling it a lint gate', () => {
    const out = renderHardRules(blueprint({ rules: { cycles: 'error', ...kept } }));

    // Not dropped like the two above: `cycles` IS enforced, by a runtime this list
    // was attributing to lint. A repo holding a baseline reads "hard gate" and takes
    // a green lint as covering it; silently removing the row instead would leave an
    // error-tier declaration gone from the contract with no cause stated.
    expect(out).not.toContain('`cycles` is a hard gate.');

    expect(out).toContain(
      '- `cycles` is diagnosed only when `npx blueprint inspect --baseline` runs; '
      + 'the baseline grandfathers recorded findings, so this is not continuous '
      + 'edit-time prevention and a green lint says nothing about it.',
    );

    expect(out).toContain('`maxLines` = 400 is a hard gate.');
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
    expect(bare).not.toContain('component-shape axis');
    expect(bare).toContain('No new undeclared folders under `~app/`');

    expect(bare).toContain(
      '- [ ] Imports follow the one-way flow (no upstream layers or same-layer aliases).',
    );

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

    // One inspect-held gate reads in the singular, and is NOT counted among what
    // lint holds — `cycles` sits on LINT_GATED_RULE_IDS (gated at all?) while its
    // runtime is inspect, and the contract used to say lint catches it.
    expect(out).not.toMatch(/`cycles`[^.;]*fail the project's lint run/);
  });

  it('never lists a gate the lint run cannot fail on', () => {
    // "these fail the project's lint run" is a sentence about the reader's own repo, and
    // it was false for a gate this blueprint cannot emit: `deepWatch` declared `error`
    // on React, `testFilename` declared beside `testFiles: []`. The contract is the file
    // an agent reads with nothing beside it (field run #150).
    const out = renderCompactContract({
      ...blueprint({ framework: 'react' }),
      architecture: { ...arch(), testFiles: [] },
      rules: {
        deepWatch: 'error',
        testFilename: 'error',
        maxLines: { tier: 'error' as const, value: 300 },
      },
    });

    expect(out).not.toContain('deepWatch');
    expect(out).not.toContain('testFilename');
    // The one that does emit still holds the sentence up — an empty list would drop the
    // clause instead, and then nothing would be asserting the split at all.
    expect(out).toContain('`maxLines`');
    expect(out).toContain('fail the project\'s lint run');

    // Same gates, the stack each was written for: both back on the list.
    const vue = renderCompactContract({
      ...blueprint(),
      rules: { deepWatch: 'error', testFilename: 'error' },
    });

    expect(vue).toContain('deepWatch');
    expect(vue).toContain('testFilename');
  });

  it('drops the inspect clause entirely when no such gate is declared', () => {
    // A clause about an empty set reads as a gap where there is none.
    const lintOnly = renderCompactContract({
      ...blueprint(),
      rules: { maxLines: { tier: 'error' as const, value: 300 } },
    });

    expect(lintOnly).toContain('`maxLines` = 300 fail the project\'s lint run');
    expect(lintOnly).not.toContain('blueprint inspect --baseline` instead');
    // No runner named: this file is generated from the blueprint alone, and init
    // detecting pnpm while its contract said `npm run lint` is what that guess cost
    // (field run #141). The reader finds the script in package.json either way.
    expect(lintOnly).not.toContain('npm run');
  });

  it('is singular because exactly one gate is inspect-held', () => {
    // The sentence above uses a singular verb, with no plural arm — correct today and a
    // branch nothing could take, so it is not written. This is what makes that safe:
    // add a second inspect-held rule and this turns red, instead of shipping
    // "cycles, somethingElse is diagnosed".
    expect(LINT_GATED_RULE_IDS.filter((id) => enforcedBy(id) === 'inspect')).toEqual(['cycles']);
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
      rules: {
        maxLines: { tier: 'error' as const, value: 300 },
        noUtils: 'error',
        deadCode: 'error',
      },
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
