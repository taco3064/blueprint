import { describe, expect, it } from 'vitest';

import {
  renderArchitecture,
  renderComponentShape,
  renderPlaybook,
  renderHeader,
  renderImportDiscipline,
  renderUnit,
  renderNaming,
  renderPrinciples,
  renderRules,
} from './sections';
import type { ArchitectureDef, AxisDef, PrincipleDef } from '../../config';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      {
        name: 'components', does: 'UI', layout: 'folder', entry: 'index',
        mustNot: ['import services'], owns: ['clsx'],
      },
      { name: 'services', does: 'net', layout: 'folder', entry: 'index', owns: ['axios'] },
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

describe('renderUnit', () => {
  it('renders the layer-level folder and file unit contracts', () => {
    const out = renderUnit(arch({
      layers: [
        { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
        { name: 'services', does: 'net', layout: 'file' },
      ],
    }));

    expect(out).toContain('## Unit shape');
    expect(out).toContain('| `resources` | `folder` | `main` |');
    expect(out).toContain('| `services` | `file` | — |');
  });

  it('renders module-first topology without changing the shared layer shapes', () => {
    const out = renderArchitecture(arch({
      modules: [
        { name: 'auth', does: 'authentication' },
        { name: 'shop', does: 'commerce', dependsOn: ['auth'] },
      ],
    }));

    expect(out).toContain('### Modules');
    expect(out).toContain('| Module | Responsibility | Direct dependencies |');
    expect(out).toContain('| `auth` | authentication | — |');
    expect(out).toContain('| `shop` | commerce | `auth` |');
    expect(out).toContain('Every module reuses the shared layer contract');
    expect(out).toContain('declaration order grants no permission');
  });

  it('documents a declared app module as reserved router composition', () => {
    const out = renderArchitecture(arch({
      modules: [
        { name: 'app', does: 'routing' },
        { name: 'auth', does: 'authentication' },
      ],
    }));

    expect(out).toContain('optional reserved `app` module owns router composition recursively');
    expect(out).toContain('Every other module reuses the shared layer contract');
  });
});

describe('renderImportDiscipline', () => {
  it('includes the entry-only rule for folder layout', () => {
    const out = renderImportDiscipline(arch());

    expect(out).toContain('Entry-only');
    // Both layouts ban the same-layer import; only the remedy differs. A folder
    // layer's siblings are reachable relatively, so "use a relative path" would
    // describe a legal import as the fix for an illegal one.
    expect(out).toContain('folder units may reach a sibling only through its entry');

    // No layer narrows its importers, so there is no selfOnly rule to state.
    // Stating one anyway describes a constraint this config does not carry.
    expect(out).not.toContain('selfOnly');
  });

  it('drops entry-only when every layer uses file units', () => {
    const out = renderImportDiscipline(arch({
      layers: [
        { name: 'components', does: 'UI', layout: 'file' },
        { name: 'services', does: 'net', layout: 'file' },
      ],
    }));

    expect(out).toContain('use a relative path');
    expect(out).not.toContain('Entry-only');
  });

  it('keeps entry-only when any layer uses folder layout', () => {
    const out = renderImportDiscipline(
      arch({
        layers: [
          { name: 'resources', does: 'features', layout: 'folder', entry: 'main' },
          { name: 'services', does: 'net', layout: 'file' },
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
    // and the agent contract links to it (field run #150). These two arms are
    // decidable from the blueprint alone; the third is the case below.
    const react = renderRules(
      { deepWatch: 'error', testFilename: 'error', maxLines: { tier: 'error', value: 400 } },
      { framework: 'react', testFiles: [] },
    );

    expect(react).toContain('| `deepWatch` | `error` | — | nothing — Vue only');

    expect(react).toContain(
      '| `testFilename` | `error` | — | nothing — `architecture.testFiles: []` exempts nothing',
    );

    // The gate that CAN emit is untouched, or the column stops meaning anything.
    expect(react).toContain('| `maxLines` | `error` | `400` | lint |');

    // On the stack each was written for, both hold again — and `explicitAny` holds
    // too while nothing says otherwise: whether the stack has TypeScript is not in a
    // blueprint, so a caller that hands over no fact gets the assumption below.
    const vue = renderRules(
      { deepWatch: 'error', testFilename: 'error', explicitAny: 'error' },
      { framework: 'vue' },
    );

    expect(vue).toContain('| `deepWatch` | `error` | — | lint |');
    expect(vue).toContain('| `testFilename` | `error` | — | lint |');
    expect(vue).toContain('| `explicitAny` | `error` | — | lint |');
  });

  it('names no machine for `explicitAny` when the stack has no TypeScript', () => {
    // The third arm of the same guard, and the only one no blueprint can answer — the
    // dependency list is not in an author's declaration, so the fact arrives through
    // the options argument instead. Until it did, this table read `lint` for a rule
    // the emitted config cannot contain on a JS project, while `blueprint rules` on
    // the same repo called the gate unavailable.
    const rules = {
      explicitAny: 'error' as const,
      maxLines: { tier: 'error' as const, value: 400 },
    };

    const js = renderRules(rules, { framework: 'vue', hasTypescript: false });

    expect(js).toContain(
      '| `explicitAny` | `error` | — | nothing — `any` is a TypeScript construct',
    );

    // Both directions — and the caller that supplies nothing keeps the gate, or an
    // emitter told nothing would strip one a TypeScript project genuinely holds.
    for (const facts of [{ hasTypescript: true }, {}]) {
      expect(renderRules(rules, { framework: 'vue', ...facts }))
        .toContain('| `explicitAny` | `error` | — | lint |');
    }

    // The row beside it does not move.
    expect(js).toContain('| `maxLines` | `error` | `400` | lint |');
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
    {
      id: 'a',
      name: 'Ownership Inversion',
      say: 'Own it.',
      why: 'Child derives.',
      triage: 'max-params',
    },
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
