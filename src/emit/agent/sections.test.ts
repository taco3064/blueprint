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
import { enforcedBy, LINT_GATED_RULE_IDS } from '../lint';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', mustNot: ['import services'], owns: ['clsx'], layout: 'folder' },
      { name: 'services', does: 'net', layout: 'folder' },
    ],
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
  });

  it('states one shared shape without naming the layers it covers', () => {
    const out = renderPlacement(arch());

    expect(out).toContain('- Unit shape: one folder per unit. Only `index` is importable from outside.');
    expect(out).not.toContain('in `src/');
  });

  it('describes a one-file-per-unit layer', () => {
    const out = renderPlacement(arch({ layers: [{ name: 'components', does: 'UI' }] }));

    expect(out).toContain('one file per unit (file layout)');
  });

  it('states each shape with its own layers when the layers disagree', () => {
    const out = renderPlacement(
      arch({
        layers: [
          { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
          { name: 'components', does: 'UI' },
          { name: 'services', does: 'net' },
        ],
      }),
    );

    expect(out).toContain('- Unit shape in `src/resources/`: one folder per unit. Only `main` is importable from outside.');
    expect(out).toContain('- Unit shape in `src/components/` / `src/services/`: one file per unit (file layout).');
    expect(out).not.toContain('Exception — `src/services/`');
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

    // Nothing appended, rather than one phrase absent: the assertion above
    // passes on any other line this arm might add, and the section is the last
    // thing in the contract an agent reads — so the empty arm's real output is
    // that the module-shape line is the end of it.
    expect(out.split('\n').at(-1)).toBe(
      '- Unit shape: one folder per unit. Only `index` is importable from outside.',
    );
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
    // holds whatever the blueprint declares, so nothing gates it. "never the
    // same layer" was false in both layouts: the relative form is how a
    // same-layer edge is spelled, and only the alias form is banned.
    expect(out).toContain('- Import only from downstream layers — never upstream.');
    expect(out).toContain('never through the alias, and never past a folder unit\'s entry');
    expect(out).toContain('Import a unit via its `index`');
    expect(out).toContain('`maxLines` = 400 is a hard gate.');
    expect(out).toContain('`cycles` is a hard gate.');
    expect(out).not.toContain('undefined');
    // Unknown ids are documentation — the contract must not call them gates.
    expect(out).not.toContain('`noUtils` is a hard gate.');
    expect(out).not.toContain('`deadCode` is a hard gate.');

    expect(out).not.toContain('`soft`'); // warn-tier not a hard gate
    expect(out).toContain('Never silence it with `eslint-disable`');
  });

  it('omits entry-only for file layout', () => {
    const out = renderHardRules(arch({ layers: [{ name: 'components', does: 'UI' }] }), undefined);

    // The entry names are interpolated, so an unguarded push renders the rule
    // with an empty slot — "Import a unit via its , never its internals." The
    // sentence has to be absent, not merely missing the entry name.
    expect(out).not.toContain('Import a unit via its');
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
    expect(bare).toContain('- [ ] Imports follow the one-way flow (no upstream; same-layer only as a relative path to the sibling).');
    expect(bare).toContain('units expose only `index`');
  });

  it('drops the entry clause when no layer is a folder', () => {
    // A flat project has no entry file to expose, so naming one asks the agent
    // to check a filename that governs nothing in this repo.
    const flat = renderChecklist(blueprint({
      architecture: arch({ layers: [{ name: 'components', does: 'UI' }] }),
    }));

    expect(flat).toContain('- [ ] New code sits in the right layer.');
    expect(flat).not.toContain('units expose only');
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

    // One inspect-held gate reads in the singular, and is NOT counted among what
    // lint holds — `cycles` sits on LINT_GATED_RULE_IDS (gated at all?) while its
    // runtime is inspect, and the contract used to say lint catches it.
    expect(out).toContain('`cycles` is held by `npx blueprint inspect --baseline`');
    expect(out).toContain('a green lint says nothing about it');
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
    // The sentence above says "is held by", with no plural arm — correct today and a
    // branch nothing could take, so it is not written. This is what makes that safe:
    // add a second inspect-held rule and this turns red, instead of shipping
    // "cycles, somethingElse is held by".
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

describe('the module dimension', () => {
  const modules = [
    { name: 'app', does: 'Routing.', imports: ['common'], owns: ['lodash'] },
    { name: 'common', does: 'Shared.', layers: false as const },
  ];

  const modular = (over: Partial<ArchitectureDef> = {}) => arch({ modules, ...over });

  it('addresses a layer inside a module, never at the source root', () => {
    // Under `modules` a layer has no folder of its own, so `src/<layer>/` names
    // an UNDECLARED MODULE — an error `inspect` reports. Three of the tool's
    // own outputs answer this address and the contract's was the wrong one.
    const out = renderPlacement(modular());

    expect(out).toContain('- `src/<module>/components/` — UI.');
    expect(out).toContain('- `src/<module>/services/` — net.');
    expect(out).not.toContain('- `src/components/`');
    expect(out).not.toContain('- `src/services/`');
  });

  it('follows sourceRoot into the layer address', () => {
    expect(renderPlacement(modular({ sourceRoot: 'app/src' })))
      .toContain('- `app/src/<module>/components/` — UI.');

    expect(renderPlacement(arch({ sourceRoot: 'app/src' })))
      .toContain('- `app/src/components/` — UI.');
  });

  it('lists each module with what it may reach, what it owns, and whether it is layered', () => {
    const out = renderPlacement(modular());

    expect(out).toContain('- `src/app/` — Routing. IMPORTS: `common` (through their entry alone). OWNS (barred in every other module): `lodash`.');
    // Omitted `imports` is none, not unknown — the opposite of the layer
    // default, and the fact a reader is most likely to assume backwards.
    expect(out).toContain('IMPORTS: nothing — this module declares no dependency, so it may reach no other module.');
    expect(out).toContain('NOT LAYERED (`layers: false`)');
    // The outer address first: a layer line reads `<module>`, and a reader who
    // has not met the modules cannot resolve it.
    expect(out.indexOf('- `src/app/`')).toBeLessThan(out.indexOf('- `src/<module>/components/`'));
  });

  it('says nothing about modules on a flat project', () => {
    const out = renderPlacement(arch());

    for (const phrase of ['IMPORTS:', 'NOT LAYERED', '<module>']) {
      expect(out, `flat placement carries a modular clause: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('states the three module bans at the width they hold, and leads the hard rules', () => {
    const out = renderHardRules(modular(), undefined);

    expect(out.split('\n')[2]).toContain('- Module boundaries:');
    expect(out).toContain('through that module\'s entry alone (`~app/<module>`) and never a relative path');
    expect(out).toContain('Nothing inside a module imports its own root.');
    // Module-WIDE, not entry-only: entry-only prose describes the two-hop
    // bypass (inner file re-exports, entry re-exports that file) as legal.
    expect(out).toContain('no file in a module — **every** file, not only its entry — re-exports another module\'s surface');
    expect(out).toContain('one added only to clear the rule is the non-fix');
  });

  it('names both ownership owners, and keeps relative paths inside the module', () => {
    const out = renderHardRules(modular(), undefined);

    expect(out).toContain('a layer\'s `owns` bars every other layer, a module\'s bars every other module');
    expect(out).toContain('- Relative imports stay inside their unit, and never leave their module;');

    const flat = renderHardRules(arch(), undefined);

    expect(flat).toContain('- Restricted packages / globals live only in their owning layer (see "Where code goes").');
    expect(flat).toContain('- Relative imports stay inside their unit; no redundant segments');
    expect(flat).not.toContain('Module boundaries:');
  });

  it('calls an undeclared top-level folder a module, and says a green lint hides it', () => {
    const out = renderBehavioral(modular(), undefined, undefined);

    expect(out).toContain('Every top-level folder is a declared module; every folder inside one is a declared layer or a unit inside that.');
    expect(out).toContain('A folder nobody declared is an undeclared MODULE');
    expect(out).toContain('a green lint after creating one proves nothing');
    expect(out).toContain('It is outside every module ban too, so a boundary can be broken inside it while lint stays green.');
    // The declaring-is-the-owner's-call sentence stays, in the module's word.
    expect(out).toContain('Inspect offers to declare the module instead; that one is not yours.');
  });

  it('keeps the flat wording flat, and still says what a green lint does not prove', () => {
    const out = renderBehavioral(arch(), undefined, undefined);

    expect(out).toContain('Every folder is a declared layer or a unit inside one.');
    expect(out).toContain('A folder nobody declared is matched by no layer glob, so lint can\'t see it — a green lint after creating one proves nothing');
    expect(out).toContain('Inspect offers to declare the folder instead; that one is not yours.');
    expect(out).not.toContain('MODULE');
  });

  it('adds a module box to the checklist, separate from the layer one', () => {
    // Its own box rather than a clause on the layer item: a checklist entry
    // carrying two questions gets ticked on the easier one.
    const out = renderChecklist(blueprint({ architecture: modular() }));

    expect(out).toContain('- [ ] New code sits in the right module; every cross-module import is declared in `imports` and goes through the other module\'s entry; nothing re-exports another module\'s surface, and nothing reaches up to its own module root.');
    expect(renderChecklist(blueprint())).not.toContain('New code sits in the right module');
  });

  it('states the outer flow in the full contract\'s context', () => {
    const out = renderContext(blueprint({ architecture: modular() }));

    expect(out).toContain('- Module flow: `app` → `common` — feature modules at the root of `~app/`, with the layers inside each one (`src/<module>/<layer>/`). A module may name only modules declared after it.');
    // The layer flow below it is the INNER one, and unqualified it reads as
    // the whole architecture.
    expect(out).toContain('- Layer flow: `components` → `services` (inside each module)');
    expect(renderContext(blueprint())).toContain('- Layer flow: `components` → `services`');
    expect(renderContext(blueprint())).not.toContain('Module flow');
  });

  it('gains exactly two lines in the compact block, and nothing on a flat config', () => {
    // The compact block is what CLAUDE.md / AGENTS.md receive — the one screen
    // nearly every adopter reads — so its budget is the constraint, not an
    // afterthought. Two lines, because neither is derivable from the page.
    const flat = renderCompactContract(blueprint());
    const out = renderCompactContract(blueprint({ architecture: modular() }));

    expect(out.split('\n').length).toBe(flat.split('\n').length + 2);
    expect(out).toContain('- Module flow: `app` → `common`');
    expect(out).toContain('- Module boundaries: a module reaches only what its `imports` names');
    expect(out).toContain('every** file, not only its entry');
  });

  it('names the module gates and the handbook section in the compact block', () => {
    const out = renderCompactContract(blueprint({ architecture: modular() }));

    expect(out).toContain('one-way imports, unit entries, ownership, relative escapes, module imports, module-root imports, module re-exports fail the project\'s lint run');
    expect(out).toContain('placement, module boundaries, unit shapes, ownership, naming');

    const flat = renderCompactContract(blueprint());

    expect(flat).toContain('one-way imports, unit entries, ownership, relative escapes fail the project\'s lint run');
    expect(flat).toContain('placement, unit shapes, ownership, naming');
  });

  it('sends the compact reader to the right remedy for the structure they have', () => {
    const out = renderCompactContract(blueprint({ architecture: modular() }));

    expect(out).toContain('A top-level folder nobody declared is an undeclared MODULE');
    expect(out).toContain('fold the code into a module that is already declared');
    expect(out).toContain('Declaring a new module is the owner\'s decision');

    const flat = renderCompactContract(blueprint());

    expect(flat).toContain('move the code into a unit of an existing layer');
    expect(flat).toContain('never declare the layer yourself');
    expect(flat).toContain('a green lint proves nothing about it');
  });
});
