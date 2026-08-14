import { describe, expect, it } from 'vitest';

import {
  renderArchitecture,
  renderComponentShape,
  renderPlaybook,
  renderHeader,
  renderImportDiscipline,
  renderModules,
  renderNaming,
  renderPrinciples,
  renderRules,
  renderUnitShape,
} from './sections';
import type { ArchitectureDef, AxisDef, PrincipleDef } from '../../config';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI', mustNot: ['import services'], owns: ['clsx'], layout: 'folder' },
      { name: 'services', does: 'net', owns: ['axios'], layout: 'folder' },
    ],
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
    // Four cells per row mean nothing without the header naming them — `clsx`
    // in an unlabelled column could as easily be read as the must-not.
    expect(out).toContain('| Layer | Responsibility | Must not | Owns |');
    expect(out).toContain('| `components` | UI | import services | `clsx` |');
    // services has no mustNot → em dash
    expect(out).toContain('| `services` | net | — | `axios` |');
  });
});

describe('renderUnitShape', () => {
  it('states one shared shape once, with a tree rooted at a layer that has it', () => {
    const out = renderUnitShape(arch());

    expect(out).toContain('One unit = one folder. Only `index` is public');
    expect(out).toContain('components/');
    expect(out).toContain('├─ index');
    // Every layer agrees, so nothing is stated per layer — naming them would
    // read as a restriction that only some layers carry this shape.
    expect(out).not.toContain('differs by layer');
    // The indent is load-bearing: bare `└─ Example` is also satisfied by the
    // `└─ Example/` FOLDER line two rows up, so the connector on the last tree
    // row went unasserted — a mutation sweep found it by flipping the row's
    // connector to `├─` with every test still green.
    expect(out).toContain('   └─ Example # implementation (named after the unit)');
    // The section closes on the fence. Anything appended after it lands outside
    // the code block, where a reader takes it for prose about the shape.
    expect(out.endsWith('```')).toBe(true);
  });

  it('renders a one-line note when every layer is one file per unit', () => {
    const out = renderUnitShape(arch({ layers: [{ name: 'components', does: 'UI' }] }));

    expect(out).toContain('file layout');
    expect(out).not.toContain('```');
    // Same close, the other layout — one sentence and nothing after it. The
    // sentence describes the SHAPE and stops: where a sibling may be reached
    // from is the import-discipline section's, stated once.
    expect(out.endsWith('One unit = one file (file layout).')).toBe(true);
  });

  it('states each shape with its own layers when the layers disagree', () => {
    const out = renderUnitShape(arch({
      layers: [
        { name: 'resources', does: 'features', layout: 'folder' },
        { name: 'components', does: 'UI' },
        { name: 'services', does: 'net' },
      ],
    }));

    expect(out).toContain('The shape differs by layer:');
    expect(out).toContain('- `resources/` — one unit = one folder. Only `index` is public');
    expect(out).toContain('- `components/` / `services/` — one unit = one file (file layout).');
    // The tree illustrates the folder shape, rooted at a layer that has it.
    expect(out).toContain('resources/\n└─ Example/');
  });

  it('draws one tree for several folder shapes, since the picture is the same', () => {
    const out = renderUnitShape(arch({
      layers: [
        { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
        { name: 'components', does: 'UI', layout: 'folder' },
      ],
    }));

    expect(out).toContain('Only `main` is public');
    expect(out).toContain('Only `index` is public');
    expect(out.match(/```/g)).toHaveLength(2);
    expect(out).toContain('   ├─ main ');
  });

  it('draws no tree under modules — renderModules already drew it at full depth', () => {
    // The flat tree is rooted at a layer name, and under `modules` that folder
    // does not exist: a layer at the source root is an undeclared module. Two
    // trees for one project is also two things to keep in step.
    const out = renderUnitShape(arch({ modules: [{ name: 'app', does: 'x' }] }));

    expect(out).toContain('One unit = one folder');
    expect(out).not.toContain('```');
    expect(out).not.toContain('└─ Example/');
  });
});

describe('renderModules', () => {
  const modular = (over: Partial<ArchitectureDef> = {}) =>
    arch({
      modules: [
        { name: 'app', does: 'Routing.', imports: ['common'], owns: ['lodash'] },
        { name: 'common', does: 'Shared.' },
      ],
      ...over,
    });

  it('renders nothing on a flat project, which has one implicit module', () => {
    expect(renderModules(arch())).toBe('');
  });

  it('tables each module with what it may reach and what it owns', () => {
    const out = renderModules(modular());

    expect(out).toContain('## Modules');
    expect(out).toContain('| Module | Responsibility | May import | Layered | Owns |');
    // `owns` at module level is a second ownership dimension neither document
    // carried; a row that drops it hides a ban the reader is subject to.
    expect(out).toContain('| `app` | Routing. | `common` | yes | `lodash` |');
    // No `imports` is not "unknown" — it is none, which is the opposite of the
    // layer default and the fact a reader is most likely to assume backwards.
    expect(out).toContain('| `common` | Shared. | — | yes | — |');
  });

  it('states the address a layer actually has, and the declaration-order rule', () => {
    const out = renderModules(modular());

    expect(out).toContain('a layer has no folder of its own, so its address is `src/<module>/<layer>/`');
    expect(out).toContain('a module may name only modules declared after it');
  });

  it('follows sourceRoot into both the address and the tree', () => {
    const out = renderModules(modular({ sourceRoot: 'app/src' }));

    expect(out).toContain('`app/src/<module>/<layer>/`');
    expect(out).toContain('\n```\napp/src/\n');
  });

  it('draws the module, its root entry, a layer and a unit inside it', () => {
    const out = renderModules(modular());

    expect(out).toContain('├─ app/              # a module — its root composes the layers below');
    // The module entry is `index` whatever a layer's `entry` is — the ban on
    // reaching the root is written against this one spelling.
    expect(out).toContain('│  ├─ index          # the module\'s public surface — always `index`');
    expect(out).toContain('│  └─ components/    # a layer, inside the module');
    expect(out).toContain('│        ├─ index    # the unit\'s entry — the only importable file');
    expect(out).toContain('│        └─ Example  # implementation (named after the unit)');
  });

  it('draws the module entry beside a custom layer entry without confusing the two', () => {
    const out = renderModules(
      modular({ layers: [{ name: 'components', does: 'UI', layout: 'folder', entry: 'main' }] }),
    );

    expect(out).toContain('├─ index          # the module\'s public surface — always `index`');
    expect(out).toContain('├─ main     # the unit\'s entry — the only importable file');
  });

  it('draws a file-layout layer as one file per unit', () => {
    const out = renderModules(modular({ layers: [{ name: 'components', does: 'UI' }] }));

    expect(out).toContain('└─ Example   # one file per unit (file layout)');
    expect(out).not.toContain('└─ Example/');
  });

  it('draws the second module as a `layers: false` one when there is one', () => {
    const out = renderModules(
      modular({
        modules: [
          { name: 'app', does: 'Routing.' },
          { name: 'common', does: 'Shared.', layers: false },
        ],
      }),
    );

    expect(out).toContain('| `common` | Shared. | — | no (`layers: false`) | — |');
    expect(out).toContain('└─ common/           # `layers: false` — governed, but not layered');
  });

  it('still draws a second module when none opts out, so two never look like one', () => {
    expect(renderModules(modular()))
      .toContain('└─ common/           # another module — same shape, its own layers');
  });

  it('drops the layered arm when every module opts out of layers', () => {
    const out = renderModules(
      modular({ modules: [{ name: 'common', does: 'Shared.', layers: false }] }),
    );

    expect(out).toContain('└─ common/  # `layers: false` — governed, but not layered');
    expect(out).not.toContain('a layer, inside the module');
  });

  it('says what `layers: false` costs whether or not one is declared', () => {
    // The Layered column exists either way, so a reader meeting `yes` has to be
    // told what the other value would have meant.
    expect(renderModules(modular())).toContain(
      'A module declared `layers: false` opts out of the inner layer vocabulary and out of nothing else: its `imports`, the entry-only ban, `owns`, the metric gates and coverage all still reach inside it.',
    );
  });
});

describe('renderImportDiscipline', () => {
  it('includes the entry-only rule for folder layout', () => {
    const out = renderImportDiscipline(arch());

    expect(out).toContain('Entry-only');
    // Both layouts ban the same-layer import THROUGH THE ALIAS, and only that.
    // A folder layer's sibling is reachable through its entry, so a flat ban
    // leaves "extract to a lower layer" as the only remedy — which is how a
    // `utils/` junk drawer gets built one honest decision at a time.
    expect(out).toContain('**No same-layer imports via the alias** — reach a sibling through its entry');
    expect(out).toContain('never past that entry');
    expect(out).not.toContain('extract shared logic down to a lower layer');

    // No layer narrows its importers, so there is no selfOnly rule to state.
    // Stating one anyway describes a constraint this config does not carry.
    expect(out).not.toContain('selfOnly');
  });

  it('swaps in the relative-path rule and drops entry-only when every layer is one file per unit', () => {
    const out = renderImportDiscipline(arch({ layers: [{ name: 'components', does: 'UI' }] }));

    expect(out).toContain('use a relative path');
    expect(out).not.toContain('Entry-only');
  });

  it('states the same-layer rule once when only the entry names differ', () => {
    // The rule does not read the entry filename, so splitting on it would print
    // one sentence twice over a difference it ignores.
    const out = renderImportDiscipline(
      arch({
        layers: [
          { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
          { name: 'services', does: 'net', layout: 'folder' },
        ],
      }),
    );

    expect(out).toContain('- **No same-layer imports via the alias** — reach a sibling through its entry');
    expect(out.match(/No same-layer/g)).toHaveLength(1);
  });

  it('names the layers each same-layer rule covers when the layouts disagree', () => {
    const out = renderImportDiscipline(
      arch({
        layers: [
          { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
          { name: 'services', does: 'net' },
        ],
      }),
    );

    expect(out).toContain('Entry-only');
    expect(out).toContain('`main`');
    // One unqualified sentence would hand `services` the folder remedy and
    // `resources` the flat one — each is wrong where the other applies.
    expect(out).toContain('in `resources/` — reach a sibling through its entry');
    expect(out).toContain('in `services/` — use a relative path instead.');
  });

  it('adds a selfOnly note when a selfOnly importer exists', () => {
    const architecture = arch();

    architecture.layers[1].allowedImporters = [{ layer: 'components', selfOnly: true }];

    expect(renderImportDiscipline(architecture)).toContain('selfOnly');
  });

  it('states the rule when only one importer of a layer is selfOnly', () => {
    // One selfOnly importer among several is enough. Requiring every importer to
    // be selfOnly leaves the mixed case — the common one — with a constraint the
    // reader is never told about.
    const architecture = arch();

    architecture.layers[1].allowedImporters = [
      { layer: 'components', selfOnly: true },
      { layer: 'pages' },
    ];

    const out = renderImportDiscipline(architecture);

    expect(out).toContain('selfOnly');
    expect(out).toContain('must never re-export it onward');

    // And it does not describe how the diagram draws the edge. This bullet said
    // "a dashed edge may be depended on…" while the legend it sits under says a
    // SOLID edge carries selfOnly and a dotted one records declaration order —
    // the wrong half pointed the reader at the edges that are not dependencies.
    // The legend owns the notation; two descriptions of one drawing is what drifted.
    for (const word of ['dashed', 'dotted', 'solid', 'edge']) {
      expect(out, `the discipline bullets describe the drawing again: "${word}"`)
        .not.toContain(word);
    }
  });

  it('states the three module boundaries, none of them derivable from the layer rules', () => {
    const out = renderImportDiscipline(arch({ modules: [{ name: 'app', does: 'x' }] }));

    expect(out).toContain('- **A module reaches only what it declares**');
    expect(out).toContain('reachable through that module\'s entry alone (`~app/<module>`)');
    // The default is the opposite of the layer one, and a reader who assumes
    // the layer default writes an undeclared edge believing it is legal.
    expect(out).toContain('Omitting `imports` means none');
    expect(out).toContain('- **Nothing inside a module imports its own root**');
    expect(out).toContain('- **Never re-export another module\'s surface through your own**');
    // The width is the load-bearing half: entry-only prose describes the
    // two-hop bypass (inner file re-exports, entry re-exports that file) as
    // legal, and the shipped rule is emitted on every file of the module.
    expect(out).toContain('in **every file of the module**, not only its entry');
    // The non-fix, beside the two the contract already carries.
    expect(out).toContain('a wrapper added only to clear the rule is the non-fix');
  });

  it('states no module boundary on a flat project', () => {
    const out = renderImportDiscipline(arch());

    for (const phrase of [
      'A module reaches only what it declares',
      'imports its own root',
      're-export another module',
    ]) {
      expect(out, `flat handbook carries a modular rule: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('names both ownership dimensions under modules and one without', () => {
    // `ModuleDef.owns` bars a primitive in every OTHER module. Said only of
    // layers, the sentence is false on any config that sets the module-level
    // one — and it points at a column that does not carry it.
    expect(renderImportDiscipline(arch({ modules: [{ name: 'app', does: 'x' }] })))
      .toContain('a layer\'s `owns` bars every other layer (the *Owns* column above), a module\'s bars every other module (the *Owns* column under **Modules**)');

    expect(renderImportDiscipline(arch()))
      .toContain('- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).');
  });

  it('closes on where the list stops — the folder nobody declared', () => {
    const out = renderImportDiscipline(arch());

    expect(out).toContain('- **A folder nobody declared is outside every rule above.**');
    expect(out).toContain('`undeclared-folder` is the only thing that does, and it never appears in a lint run');
    expect(out).toContain('A green lint after creating a folder proves nothing about it: `blueprint inspect --baseline` is where that answer comes from.');
    // Last, because it is the one bullet saying where the list above ends.
    expect(out.trimEnd().split('\n').pop()).toContain('A folder nobody declared');
  });

  it('names the modular finding, and the extra thing a green lint hides there', () => {
    const out = renderImportDiscipline(arch({ modules: [{ name: 'app', does: 'x' }] }));

    expect(out).toContain('`undeclared-module` is the only thing that does');
    expect(out).toContain('It is also outside every module ban, so a module boundary can be broken inside it with lint fully green.');
    expect(out).not.toContain('`undeclared-folder`');
  });

  it('addresses the caveat at the declared source root', () => {
    expect(renderImportDiscipline(arch({ sourceRoot: 'app/src' })))
      .toContain('A new top-level folder under `app/src/`');
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
    // The tooling group carries a trailing blank line so the next group can
    // follow it. With nothing following, that blank has to go — the handbook
    // stitches these sections together, and a stray one opens a gap that a
    // re-emit then re-diffs.
    expect(out.endsWith('**lint one** — because')).toBe(true);
  });

  it('omits the tooling group when every principle is behavioral', () => {
    // The mirror of the case above, and the only one that can falsify the
    // tooling guard. An empty "### Enforced by tooling" heading claims the
    // tooling holds something, then names nothing it holds.
    const out = renderPrinciples([principles[1]]);

    expect(out).toContain('### Behavioral');
    expect(out).not.toContain('### Enforced by tooling');
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

  it('names no machine for a gate this blueprint cannot emit', () => {
    // The declaration stays — it is the author's — but nothing HOLDS a rule the
    // emitted config does not contain, and this table said `lint`. It is the
    // longest-lived version of that half-truth: the handbook outlives the adoption
    // and the agent contract links to it (field run #150). Both arms are decidable
    // from the blueprint alone, which is all this emitter is given.
    const react = renderRules(
      { deepWatch: 'error', testFilename: 'error', maxLines: { tier: 'error', value: 400 } },
      { framework: 'react', testFiles: [] },
    );

    expect(react).toContain('| `deepWatch` | `error` | — | nothing — Vue only');
    expect(react).toContain('| `testFilename` | `error` | — | nothing — `architecture.testFiles: []` exempts nothing');
    // The gate that CAN emit is untouched, or the column stops meaning anything.
    expect(react).toContain('| `maxLines` | `error` | `400` | lint |');

    // On the stack each was written for, both hold again — and `explicitAny` is never
    // in this verdict: whether the stack has TypeScript is not in a blueprint.
    const vue = renderRules(
      { deepWatch: 'error', testFilename: 'error', explicitAny: 'error' },
      { framework: 'vue' },
    );

    expect(vue).toContain('| `deepWatch` | `error` | — | lint |');
    expect(vue).toContain('| `testFilename` | `error` | — | lint |');
    expect(vue).toContain('| `explicitAny` | `error` | — | lint |');
  });

  it('says which machine holds each rule, not just its tier (field issue #52)', () => {
    // The handbook printed `error` beside every declared rule under a legend
    // reading "`error` fails lint" — false for cycles (inspect's finding) and
    // false for deadCode (documentation, knip's job). A reader of the
    // handbook alone would believe a doc-only id gates their build.
    const out = renderRules({
      maxLines: { tier: 'error', value: 400 },
      cycles: 'error',
      deadCode: 'error',
    });

    expect(out).toContain('| Rule | Tier | Option | Enforced by |');
    expect(out).toContain('| `maxLines` | `error` | `400` | lint |');
    expect(out).toContain('| `cycles` | `error` | — | `blueprint inspect` |');
    expect(out).toContain('| `deadCode` | `error` | — | documentation only |');

    // The legend no longer makes one claim for all three.
    expect(out).toContain('The tier is what the enforcing machine does with a violation');
    expect(out).toContain('never appear in a lint run');
    expect(out).toContain('no gate behind');
  });

  it('treats an unknown id as documentation, like the contract does', () => {
    expect(renderRules({ inventedGate: 'error' }))
      .toContain('| `inventedGate` | `error` | — | documentation only |');
  });
});

describe('renderNaming', () => {
  it('returns empty when there are none', () => {
    expect(renderNaming(undefined)).toBe('');
  });

  it('renders a concept table', () => {
    const out = renderNaming({ hook: 'useX + reactivity' });

    // Which column is the concept and which is the rule is only knowable from
    // the header — an unlabelled two-cell row reads either way round.
    expect(out).toContain('| Concept | Convention |');
    expect(out).toContain('| `hook` | useX + reactivity |');
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
