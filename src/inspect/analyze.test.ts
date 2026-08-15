import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { analyze, detectCycle, detectCycles } from './analyze';
import { crossModuleTarget } from '../boundary';
import { defineBlueprint } from '../config';
import type { Blueprint, ModuleDef } from '../config';
import { emitLint } from '../emit/lint';
import { globToRegExp } from './filter';
import { plugin } from '../plugin';
import { reactPreset, vuePreset } from '../presets';
import { report } from './report';
import type { Finding, ImportRef, ScanResult, ScannedFile } from './types';

const bp = vuePreset();
const LAYERS = bp.architecture.layers.map((layer) => layer.name);

function file(segments: string[], imports: Partial<ImportRef>[] = []): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: imports.map((ref) => ({ specifier: '', names: [], isExport: false, ...ref })),
  };
}

function scanOf(files: ScannedFile[], topDirs: string[] = LAYERS): ScanResult {
  return { topDirs, files };
}

const rulesFor = (files: ScannedFile[], topDirs?: string[]) =>
  analyze(scanOf(files, topDirs), bp).map((finding) => finding.rule);

describe('analyze · folders', () => {
  it('reports nothing for a clean, empty layer set', () => {
    expect(analyze(scanOf([]), bp)).toEqual([]);
  });

  it('flags an undeclared folder that holds source', () => {
    const found = rulesFor([file(['utils', 'helper.ts'])], [...LAYERS, 'utils']);

    expect(found).toContain('undeclared-folder');
  });

  it('notes a declared layer with no folder', () => {
    expect(rulesFor([], LAYERS.slice(1))).toContain('missing-layer');
  });

  it('warns when a module has no entry file, but not when it does', () => {
    expect(rulesFor([file(['components', 'Button', 'Button.ts'])])).toContain('no-entry');
    expect(rulesFor([file(['components', 'Card', 'index.ts'])])).not.toContain('no-entry');
  });

  it('notes a declaratory selfOnly — code elsewhere, the protected layer empty (batch 12)', () => {
    // contexts declares a selfOnly importer (hooks); with real code in the
    // repo but none in contexts, the re-export ban is a blank round.
    const withCode = analyze(scanOf([file(['components', 'Card', 'index.ts'])]), bp);
    const note = withCode.find((entry) => entry.rule === 'declaratory-self-only');

    // `subject` stays empty on a flat project: `src/contexts` IS the layer, so the
    // rule and the path identify the note without it.
    expect(note).toMatchObject({ severity: 'info', path: 'src/contexts', subject: '' });
    expect(note?.message).toContain('cannot fire yet');
    expect(note?.message).toContain('hooks');
    // Flat: the layer's own folder IS its address, so nothing is spliced in. The
    // junction asserted as adjacency, since this note carries the address in the
    // middle — an appended text would leave both halves touching and pass.
    expect(note?.message).toContain('it arms once code lands. The no-restricted-syntax ENTRY');

    // Files inside the protected layer arm the ban — the note disappears.
    const armed = rulesFor([
      file(['components', 'Card', 'index.ts']),
      file(['contexts', 'Auth', 'index.ts']),
    ]);

    expect(armed).not.toContain('declaratory-self-only');

    // An empty scaffold stays quiet — the coverage line already owns that story.
    expect(analyze(scanOf([]), bp)).toEqual([]);
  });
});

describe('analyze · owns declared ahead of the install', () => {
  // The vue preset owns `vue` and `pinia` on hooks, `vue` on contexts, and
  // `axios` plus two globals on services.
  const ownsFrom = (deps?: string[]) =>
    analyze(scanOf([]), bp, deps).filter((finding) => finding.rule === 'owns-not-installed');

  it('notes each owns package absent from the dependency list', () => {
    const found = ownsFrom(['vue']);

    expect(found.map((finding) => finding.subject).sort()).toEqual(['axios', 'pinia']);

    const axios = found.find((finding) => finding.subject === 'axios');

    expect(axios).toMatchObject({ severity: 'info', path: 'src/services' });
    // The level and the name, not only that a sentence exists: the word is read
    // from which list the entry came out of, and on a flat config that is always
    // `layers`.
    expect(axios?.message).toContain('Layer "services" owns "axios"');
    expect(axios?.message).toContain('runway, not a todo');
    // Both resolutions named, neither prescribed — the same doctrine as
    // missing-layer, which this tier and wording follow.
    expect(axios?.message).toContain('owner\'s call');
    // Flat output is unchanged in both fields: `src/services` is the layer's own
    // folder, so the modular address note has nothing to say here. `endsWith`, not
    // two `not.toContain`s — those pass on any appended text that avoids two
    // phrases, and "nothing is appended" is the contract.
    expect(axios?.message.endsWith('which one applies is the owner\'s call.')).toBe(true);
  });

  it('says nothing when every owned package resolves', () => {
    expect(ownsFrom(['vue', 'pinia', 'axios'])).toEqual([]);
  });

  it('skips the check when the dependency list could not be read', () => {
    // Not the same as none installed: `undefined` is "unknown", and reporting
    // every declaration as absent would be a fabricated finding.
    expect(ownsFrom(undefined)).toEqual([]);

    // An empty list is knowledge, so every declaration answers to it. Four, not
    // three: `vue` is owned by hooks and by contexts, and the finding names the
    // declaring layer — deduping by package would drop the address to go to.
    const none = ownsFrom([]);

    expect(none).toHaveLength(4);

    expect(none.filter((finding) => finding.subject === 'vue').map((f) => f.path))
      .toEqual(['src/hooks', 'src/contexts']);
  });

  it('reads both owns forms and ignores owned globals', () => {
    const architecture = {
      alias: '~app',
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state', owns: [{ package: 'zustand', imports: ['create'] }] },
        // A global has no dependency list to answer to.
        { name: 'services', does: 'net', owns: [{ global: 'fetch' }] },
      ],
    };

    const found = analyze(
      scanOf([], ['components', 'hooks', 'services']),
      defineBlueprint({ framework: 'react', architecture }),
      [],
    ).filter((finding) => finding.rule === 'owns-not-installed');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ subject: 'zustand', path: 'src/hooks' });
  });

  it('addresses the finding through the configured source root', () => {
    const rooted = defineBlueprint({
      framework: 'vue',
      architecture: {
        alias: '~app',
        sourceRoot: '.',
        layers: [{ name: 'services', does: 'net', owns: ['axios'] }],
      },
    });

    expect(analyze(scanOf([], ['services']), rooted, [])[0]).toMatchObject({
      rule: 'owns-not-installed',
      path: 'services',
    });
  });
});

describe('analyze · imports', () => {
  // Use the entry file so no-entry never pollutes the empty-result assertions;
  // contexts holds no files in these one-file fixtures, so its declaratory
  // selfOnly note is expected background — filtered for the same reason.
  const from = (specifier: string, extra: Partial<ImportRef> = {}) =>
    rulesFor([file(['components', 'Btn', 'index.ts'], [{ specifier, ...extra }])])
      .filter((rule) => rule !== 'declaratory-self-only');

  it('flags a forbidden cross-layer import', () => {
    expect(from('~app/services/api')).toContain('flow-violation');
  });

  it('flags a same-layer alias import', () => {
    expect(from('~app/components/Other')).toContain('flow-violation');
  });

  it('flags a deep import into a module', () => {
    expect(from('~app/hooks/useX/impl')).toContain('deep-import');
  });

  it('ignores an alias import to an undeclared layer (the folder rule covers it)', () => {
    expect(from('~app/nope/x')).not.toContain('flow-violation');
  });

  it('tolerates a bare alias specifier', () => {
    expect(from('~app')).toEqual([]);
  });

  it('flags a whole owned package and a specific owned named import', () => {
    expect(from('axios')).toContain('package-ownership');
    expect(from('vue', { names: ['inject'] })).toContain('package-ownership');
    expect(from('vue', { names: ['ref'] })).not.toContain('package-ownership');
  });

  it('flags relative imports that leave the layer or escape src', () => {
    expect(from('../..')).toContain('layer-escape');
    expect(from('../../../outside')).toContain('src-escape');
    expect(from('./helper')).toEqual([]);
  });

  it('reports each kind of escape under its own id, since the fixes differ', () => {
    // Three verdicts, three different fixes — use the alias, import the entry,
    // extract to a lower layer. `MIGRATION` is keyed per id, so one id for the
    // three forced one sentence to answer all of them, and the sentence it
    // reached for was legal in only one (#203).
    const findingFor = (specifier: string) =>
      analyze(scanOf([file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }])]), bp)
        .find((finding) => finding.rule.endsWith('escape') || finding.rule === 'entry-bypass');

    expect(findingFor('../../../outside')?.rule).toBe('src-escape');
    expect(findingFor('../../../outside')?.message).toContain('escapes src/');
    expect(findingFor('../Card/internals')?.rule).toBe('entry-bypass');
    expect(findingFor('../Card/internals')?.message).toContain('reaches past a sibling');
    expect(findingFor('../../hooks/useX')?.rule).toBe('layer-escape');
    expect(findingFor('../../hooks/useX')?.message).toContain('leaves this layer');
  });

  // The lint rule and this finding read the same `relativeVerdict`, so a
  // sibling's entry is legal to both and reaching past it is illegal to both.
  // They disagreed once — same `../Sibling`, one gate green, one red — with no
  // test placed to see it, which is why these two assertions sit together.
  it('allows a sibling entry but not what is behind it', () => {
    expect(from('../Card')).toEqual([]);
    expect(from('../Card/internals')).toContain('entry-bypass');
  });

  it('flags a selfOnly re-export but allows a plain import', () => {
    const reexport = rulesFor([
      file(['hooks', 'useT', 'useT.ts'], [{ specifier: '~app/contexts/Theme', isExport: true }]),
    ]);

    const plain = rulesFor([
      file(['hooks', 'useT', 'useT.ts'], [{ specifier: '~app/contexts/Theme' }]),
    ]);

    expect(reexport).toContain('selfonly-reexport');
    expect(plain).not.toContain('selfonly-reexport');
    expect(plain).not.toContain('flow-violation');
  });

  it('sees through an additional alias whose target sits above the source root (field #29)', () => {
    // '~root': '.' routes to layers through src/ — the naive strip read
    // `src` as the layer name and the import went invisible to inspect
    // while emitLint (wrongly) banned `~root/<layer>` instead.
    const rooted = defineBlueprint({
      ...bp,
      architecture: { ...bp.architecture, additionalAliases: { '~root': '.' } },
    });

    const rootedRules = (files: ScannedFile[]) =>
      analyze(scanOf(files), rooted)
        .map((finding) => finding.rule)
        .filter((rule) => rule !== 'declaratory-self-only');

    expect(rootedRules([
      file(['components', 'Btn', 'index.ts'], [{ specifier: '~root/src/services/api' }]),
    ])).toContain('flow-violation');

    // Under the alias but outside the layer offset — not a layer import.
    expect(rootedRules([
      file(['components', 'Btn', 'index.ts'], [{ specifier: '~root/package.json' }]),
    ])).toEqual([]);
  });

  it('ignores files that live outside a declared layer', () => {
    expect(rulesFor([file(['utils', 'x.ts'], [{ specifier: '~app/services/api' }])], [...LAYERS, 'utils']))
      .not.toContain('flow-violation');
  });
});

describe('analyze · cycle', () => {
  it('detects a module import cycle', () => {
    const found = rulesFor([
      file(['components', 'A', 'A.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'B.ts'], [{ specifier: '../A' }]),
    ]);

    expect(found).toContain('cycle');
  });

  it('reports no cycle when a module is reached by two paths without a loop', () => {
    const found = rulesFor([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }, { specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../B' }]),
    ]);

    expect(found).not.toContain('cycle');
  });

  const cycleMessage = (files: ScannedFile[]): string | undefined =>
    analyze(scanOf(files), bp).find((finding) => finding.rule === 'cycle')?.message;

  it('walks the whole loop into the message, in order', () => {
    // "A cycle exists" is not actionable; which modules, and in what order, is.
    expect(cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../A' }]),
    ])).toContain('components/A → components/B → components/C → components/A');
  });

  it('reports the loop itself, not the path that led into it', () => {
    // A reaches B, and B↔C is the actual cycle. Naming A in the report sends
    // the reader to break an edge that is not part of any loop.
    const message = cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../B' }]),
    ]);

    expect(message).toContain('components/B → components/C → components/B');
    expect(message).not.toContain('components/A');
  });

  it('keeps looking after an acyclic component comes up clean', () => {
    // The first component walked has no loop; the search has to carry on to
    // the second rather than conclude from the first.
    expect(cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ])).toContain('hooks/useC → hooks/useD → hooks/useC');
  });

  it('reports no cycle between folders the same run says nothing governs', () => {
    // Flat never had the node-side hole — the layer test IS the top-level test
    // when the layer is the top folder — so this pins that rerouting node
    // admission through `fileZone` did not open one.
    //
    // Two undeclared folders, not two units inside one: on a flat project an
    // unknown top folder has no declared layout, so `moduleKey` stops at it and
    // both units key to the same node. Written that way the knot is a self-edge
    // the graph drops regardless, and the case reports no cycle even with the
    // layer test removed entirely.
    const found = analyze(
      scanOf([
        file(['scratch', 'x.ts'], [{ specifier: '../junk/y' }]),
        file(['junk', 'y.ts'], [{ specifier: '../scratch/x' }]),
      ], [...LAYERS, 'scratch', 'junk']),
      bp,
    );

    expect(found.map((finding) => finding.rule)).toContain('undeclared-folder');
    expect(found.map((finding) => finding.rule)).not.toContain('cycle');
  });
});

/**
 * A cycle is reported about a folder some emitted entry governs, or not at all.
 *
 * Worth stating why the surviving cross-module shape looks so narrow: a cycle
 * among declared modules can never be DECLARED. `defineBlueprint` rejects
 * `imports` naming a module declared before it — *"Module "Combat" imports
 * "Fighter", which is declared before it"* — so every cross-module cycle that
 * reaches this graph has a back edge the config already calls an undeclared
 * dependency, and the only cycles left are between units inside one module.
 */
describe('analyze · a cycle needs a governed folder at both ends', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const TOP = ['Fighter', 'Combat', 'scratch'];

  const cycleOf = (files: ScannedFile[], topDirs = TOP): Finding | undefined =>
    analyze({ topDirs, files }, modular).find((finding) => finding.rule === 'cycle');

  it('says nothing about two units knotted inside an undeclared folder', () => {
    // The ticket's tree. `hooks` is a declared layer name and nothing more here:
    // no layer glob is expanded for a top folder the declared list has not got,
    // so lint is green on both files while `inspect` called them an error.
    const found = analyze(
      {
        topDirs: TOP,
        files: [
          file(['scratch', 'hooks', 'useA', 'index.ts'], [{ specifier: '../useB' }]),
          file(['scratch', 'hooks', 'useB', 'index.ts'], [{ specifier: '../useA' }]),
        ],
      },
      modular,
    );

    // The folder is still reported — as the one thing that IS true about it.
    expect(found.map((finding) => finding.rule)).toContain('undeclared-module');
    expect(found.map((finding) => finding.rule)).not.toContain('cycle');
  });

  it('says nothing about a knot at root depth either', () => {
    // No declared layer name anywhere: two files one level below the source
    // root passed a depth test that never asked whose root it was.
    //
    // Two DIFFERENT undeclared folders, because root files of one folder all
    // key to that folder — written as `scratch/a.ts` ↔ `scratch/b.ts` this
    // reads as a root-depth cycle and is a self-edge the graph drops anyway,
    // so it passed before the fix as well as after and pinned nothing.
    expect(cycleOf([
      file(['scratch', 'index.ts'], [{ specifier: '../junk/index' }]),
      file(['junk', 'index.ts'], [{ specifier: '../scratch/index' }]),
    ], ['Fighter', 'Combat', 'scratch', 'junk'])).toBeUndefined();
  });

  it('still reports a knot between units of a declared module', () => {
    // The half that must not move. Asserted on the message, not just the rule:
    // a fix that dropped every node would satisfy the two cases above and this
    // one's `toBeDefined` alike.
    expect(cycleOf([
      file(['Fighter', 'hooks', 'useA', 'index.ts'], [{ specifier: '../useB' }]),
      file(['Fighter', 'hooks', 'useB', 'index.ts'], [{ specifier: '../useA' }]),
    ])?.message).toContain(
      'Fighter/hooks/useA → Fighter/hooks/useB → Fighter/hooks/useA',
    );
  });

  it('still reports a knot a declared module closes through another\'s entry', () => {
    // The cross-module shape, back edge and all: `Combat` reaching `Fighter` is
    // an undeclared dependency, which is the only way this cycle exists at all.
    expect(cycleOf([
      file(['Fighter', 'index.ts'], [{ specifier: '~app/Combat' }]),
      file(['Combat', 'index.ts'], [{ specifier: '~app/Fighter' }]),
    ])?.message).toContain('Combat → Fighter → Combat');
  });

  it('drops the edge a declared module makes INTO an undeclared folder', () => {
    // Dropped as a node, then minted again as an edge target — `collect` reads
    // its targets back out. Asserted through the cycle a surviving edge would
    // close, so the case fails on the graph rather than on a rendering.
    //
    // The knot has to close on the two nodes themselves. Routed back through
    // `~app/Fighter` instead, the return edge lands on a node no file in this
    // fixture builds, the loop never closes, and the case reports no cycle
    // before the fix as readily as after.
    expect(cycleOf([
      file(['Fighter', 'hooks', 'useAim', 'index.ts'], [{ specifier: '../../../scratch/hooks/useA' }]),
      file(['scratch', 'hooks', 'useA', 'index.ts'], [{ specifier: '~app/Fighter/hooks/useAim' }]),
    ])).toBeUndefined();
  });
});

describe('analyze · file layout', () => {
  const fileShaped = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [{ name: 'a', does: '' }, { name: 'b', does: '' }],
    },
  });

  it('skips deep-import and no-entry, but still flags cross-module relative imports', () => {
    const found = analyze(
      { topDirs: ['a', 'b'], files: [file(['a', 'x.ts'], [{ specifier: '../b/y' }])] },
      fileShaped,
    ).map((finding) => finding.rule);

    expect(found).toContain('layer-escape');
    expect(found).not.toContain('deep-import');
    expect(found).not.toContain('no-entry');
  });
});

describe('analyze · per-layer module layout', () => {
  const mixed = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: '' },
        { name: 'resources', does: '', layout: 'folder', entry: 'main' },
        { name: 'services', does: '' },
      ],
    },
  });

  const rules = (files: ScannedFile[]) =>
    analyze({ topDirs: ['pages', 'resources', 'services'], files }, mixed)
      .map((finding) => finding.rule);

  it('judges deep imports by the target layer layout', () => {
    // Into the folder layer: deep. Into a file layer: not.
    expect(rules([file(['pages', 'Home.ts'], [{ specifier: '~app/resources/matches/impl' }])]))
      .toContain('deep-import');

    expect(rules([file(['pages', 'Home.ts'], [{ specifier: '~app/services/api/client' }])]))
      .not.toContain('deep-import');
  });

  it('applies no-entry only to folder-layout layers, honoring the entry override', () => {
    expect(rules([file(['resources', 'matches', 'main.ts'])])).not.toContain('no-entry');
    expect(rules([file(['resources', 'matches', 'list.ts'])])).toContain('no-entry');
    // Nested files in a file layer never demand an entry.
    expect(rules([file(['services', 'api', 'client.ts'])])).not.toContain('no-entry');
  });

  it('judges relative escapes per layer: module-bound in folder, layer-bound in file', () => {
    // Folder layer: leaving the module (even to a sibling module) escapes.
    expect(
      rules([file(['resources', 'matches', 'main.ts'], [{ specifier: '../markets/board' }])]),
    ).toContain('entry-bypass');

    // File layer: relatives roam the whole layer freely.
    expect(
      rules([file(['services', 'api', 'client.ts'], [{ specifier: '../ws/socket' }])]),
    ).not.toContain('entry-bypass');
  });
});

describe('analyze · severity ordering', () => {
  it('leads with the errors, whatever order the checks produced them in', () => {
    // Three severities from one scan: a module with no entry (warn), a banned
    // cross-layer import (error), and the declaratory selfOnly note (info). The
    // folder checks run before the import checks, so the raw order opens on the
    // warn — a reader scanning the top of this list would meet it first.
    const found = analyze(scanOf([
      file(['components', 'Button', 'Button.ts']),
      file(['components', 'Card', 'index.ts'], [{ specifier: '~app/services/api' }]),
    ]), bp);

    const severities = found.map((finding) => finding.severity);

    expect(severities).toContain('error');
    expect(severities).toContain('warn');
    expect(severities).toContain('info');

    // Sorted, not merely containing all three: errors first, info last. Two
    // findings could not show this — a comparator that always answers the same
    // way happens to agree with the sorted result on a pair.
    expect(severities).toEqual([...severities].sort(
      (a, b) => ['error', 'warn', 'info'].indexOf(a) - ['error', 'warn', 'info'].indexOf(b),
    ));

    expect(severities[0]).toBe('error');
    expect(severities.at(-1)).toBe('info');
  });
});

describe('analyze · the depth that makes a module', () => {
  const specifierRules = (specifier: string) =>
    analyze(
      scanOf([file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }])]),
      bp,
    )
      .map((finding) => finding.rule)
      .filter((rule) => rule !== 'declaratory-self-only');

  it('does not read a file sitting directly in a layer as a module', () => {
    // `components/Button.ts` is a file IN the layer, not a module folder. It has
    // no entry to be missing, and demanding one sends the reader to write an
    // index for a single file.
    expect(rulesFor([file(['components', 'Button.ts'])])).not.toContain('no-entry');
  });

  it('needs a third segment before an import reaches inside a module', () => {
    // `~app/hooks/useX` IS the entry. Reporting it as a deep import tells the
    // reader to import through an entry they already used.
    expect(specifierRules('~app/hooks/useX')).not.toContain('deep-import');
    expect(specifierRules('~app/hooks/useX/impl')).toContain('deep-import');
  });

  it('judges depth only for targets that are declared layers', () => {
    // `nope` is not a layer, so its module shape is unknown and the shared
    // fallback would read any deep path as reaching inside one. The
    // undeclared-folder rule owns that case instead.
    expect(specifierRules('~app/nope/x/y')).not.toContain('deep-import');
  });
});

describe('analyze · what an ownership entry covers', () => {
  it('owns the package when ANY of the imported names is restricted', () => {
    // `inject` is owned, `ref` is not. Importing both is still reaching for the
    // owned one — requiring every name to be restricted lets a single free name
    // launder the import.
    const both = rulesFor([
      file(['components', 'Btn', 'index.ts'], [{ specifier: 'vue', names: ['ref', 'inject'] }]),
    ]);

    expect(both).toContain('package-ownership');
  });

  it('owns a whole package when no named imports narrow it', () => {
    const owned = defineBlueprint({
      ...bp,
      architecture: {
        ...bp.architecture,
        layers: bp.architecture.layers.map((layer) =>
          layer.name === 'services' ? { ...layer, owns: [{ package: 'axios' }] } : layer,
        ),
      },
    });

    const rulesWith = (specifier: string) =>
      analyze(
        scanOf([file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }])]),
        owned,
      ).map((finding) => finding.rule);

    // An entry with no `imports` owns the package outright, whatever names the
    // importer used — reading `.length` off that absent list throws instead.
    expect(rulesWith('axios')).toContain('package-ownership');

    // A different package is not covered by it: the package name has to match
    // before the import list is consulted at all.
    expect(rulesWith('lodash')).not.toContain('package-ownership');
  });
});

describe('analyze · what counts as a module entry', () => {
  it('accepts an entry sitting beside other files in the module', () => {
    // A module is normally more than its entry. Requiring EVERY file to be the
    // entry reports a missing entry on a module that has one.
    expect(rulesFor([
      file(['components', 'Card', 'index.ts']),
      file(['components', 'Card', 'helper.ts']),
    ])).not.toContain('no-entry');
  });

  it('wants the entry directly in the module, not nested below it', () => {
    // `components/Card/index/x.ts` puts a folder called `index` inside the
    // module. That is not an entry file, and accepting it as one silences the
    // warning on a module nothing can import.
    expect(rulesFor([file(['components', 'Card', 'index', 'x.ts'])])).toContain('no-entry');
  });

  it('strips only the last extension when reading a filename', () => {
    // `index.d.ts` is a declaration file, not the module entry — stripping both
    // extensions turns it into one and the module reads as importable.
    expect(rulesFor([file(['components', 'Card', 'index.d.ts'])])).toContain('no-entry');
  });
});

/**
 * `no-entry` answers two levels under one id — the unit above, and the module
 * itself — for the reason the unit rule was written on: the entry is the
 * folder's only public surface, and the one legal address of the thing it names
 * resolves to that file. One id and two sentences rather than a second id, which
 * is the shape `deep-import` already carries.
 */
describe('analyze · no-entry answers the module level too, and says which it means', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const noEntry = (files: ScannedFile[]): Finding[] =>
    analyze({ topDirs: ['Fighter', 'Combat'], files }, modular)
      .filter((finding) => finding.rule === 'no-entry');

  const FIGHTER_UNIT = file(['Fighter', 'hooks', 'useRun', 'index.ts']);
  const FIGHTER_ENTRY = file(['Fighter', 'index.ts']);
  const COMBAT_ENTRY = file(['Combat', 'index.ts']);

  it('warns on a declared module whose folder holds code and carries no entry', () => {
    const [finding, ...rest] = noEntry([FIGHTER_UNIT, COMBAT_ENTRY]);

    expect(rest).toEqual([]);

    expect(finding).toMatchObject({
      severity: 'warn',
      rule: 'no-entry',
      path: 'src/Fighter',
      subject: '',
    });

    // The level, the address that breaks, and the file to add. Without the
    // middle clause the reader is told a file is missing and not what stops
    // working without it.
    expect(finding.message).toContain('Module "Fighter" has no "index" entry');
    expect(finding.message).toContain('"~app/Fighter" is the only address another module may write');
    expect(finding.message).toContain('Add `src/Fighter/index`');
  });

  it('says nothing once the module has one', () => {
    expect(noEntry([FIGHTER_ENTRY, FIGHTER_UNIT, COMBAT_ENTRY])).toEqual([]);
  });

  it('reads the entry at the module root and not one level down', () => {
    // `Fighter/hooks/index.ts` is a file inside a layer, not the module's own
    // surface. Accepted as one it silences the warning on a module nothing can
    // import — the same defect the unit-level rule guards against one level up.
    expect(noEntry([file(['Fighter', 'hooks', 'index.ts']), COMBAT_ENTRY]))
      .toHaveLength(1);
  });

  it('leaves a declared module with no folder to missing-module', () => {
    // Two findings over one state would answer it at two tiers with two
    // remedies, and `missing-module`'s — runway, not a todo — is the right one.
    const findings = analyze({ topDirs: ['Fighter'], files: [FIGHTER_ENTRY] }, modular);

    expect(findings.filter((finding) => finding.rule === 'no-entry')).toEqual([]);
    expect(findings.filter((finding) => finding.rule === 'missing-module')).toHaveLength(1);
  });

  it('reports a `layers: false` module the same way', () => {
    // Governance still reaches inside it, and `~app/app` is still the one
    // address another module may write for it.
    const routed = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        modules: [
          { name: 'app', does: 'routing only', layers: false },
          { name: 'Combat', does: 'bullets' },
        ],
        layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
      },
    });

    const findings = analyze(
      {
        topDirs: ['app', 'Combat'],
        files: [file(['app', 'routes', 'Game.tsx']), file(['Combat', 'index.ts'])],
      },
      routed,
    ).filter((finding) => finding.rule === 'no-entry');

    expect(findings.map((finding) => finding.path)).toEqual(['src/app']);
  });

  it('has no module level on a flat project', () => {
    // Flat has one implicit module — `src/` itself — and no entry to ask it for.
    // A module arm that ran there would report the source root as a module.
    expect(analyze(scanOf([file(['components', 'Card', 'index.ts'])]), bp)
      .filter((finding) => finding.rule === 'no-entry')).toEqual([]);
  });
});

/**
 * One word, and #190 settled which: `module` is the feature at the top of the
 * source tree, `unit` is the folder inside a layer. Three `inspect` messages
 * still said "module" for the unit after #187's sweep, which covered the three
 * emitted documents and not this file — so `emitLint` told an adopter to import
 * a unit through its entry while `inspect` called the same thing a module, in
 * one repo.
 *
 * Pinned as a class, because that is what it is: each of these is the only
 * message its rule emits at that level, and a fourth site is `emitLint`'s own
 * (`emit/lint/patterns.ts`), covered in `lint.test.ts` beside the group it
 * rides.
 */
describe('analyze · a unit is called a unit, at every level that carries both words', () => {
  const messageOf = (rule: string, files: ScannedFile[], blueprint = bp): string =>
    analyze(scanOf(files), blueprint).find((finding) => finding.rule === rule)?.message ?? '';

  it('no-entry names the unit, and never the feature word', () => {
    const message = messageOf('no-entry', [file(['components', 'Card', 'impl.ts'])]);

    expect(message).toContain('Unit "components/Card" has no "index" entry');
    expect(message).not.toContain('Module');
  });

  it('deep-import names the unit when a unit is what was reached into', () => {
    const message = messageOf('deep-import', [
      file(['pages', 'Home', 'index.ts'], [{ specifier: '~app/components/Card/impl' }]),
    ]);

    expect(message).toBe('"~app/components/Card/impl" reaches inside a unit — import it through its entry.');
  });

  it('entry-bypass names the unit, exactly as its plugin twin does', () => {
    // Both gates read one `relativeVerdict`, so the two sentences differing by a
    // word was one judgment described two ways — the drift `boundary` exists to
    // make inexpressible, surviving in the prose above it.
    const message = messageOf('entry-bypass', [
      file(['components', 'Card', 'index.ts'], [{ specifier: '../Panel/impl' }]),
    ]);

    expect(message).toContain('what lives behind it is that unit\'s own business');
  });

  it('keeps the feature word where the feature is what was reached', () => {
    // The other branch of the same rule id, and the control on the case above:
    // `deep-import` across a module boundary IS about a module.
    const modular = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        modules: [
          { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
          { name: 'Combat', does: 'bullets' },
        ],
        layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
      },
    });

    const message = analyze(
      {
        topDirs: ['Fighter', 'Combat'],
        files: [
          file(
            ['Fighter', 'hooks', 'useRun', 'index.ts'],
            [{ specifier: '~app/Combat/hooks/useHit' }],
          ),
        ],
      },
      modular,
    ).find((finding) => finding.rule === 'deep-import')?.message ?? '';

    expect(message).toContain('reaches inside module "Combat"');
  });
});

describe('analyze · an entry name that holds a dot', () => {
  it('strips only the last extension, so a dotted entry still matches', () => {
    // `entry: 'index.d'` is a legal declaration and `index.d.ts` is then its
    // entry file. Stripping both extensions turns that filename into `index`,
    // which no longer matches what was declared — the module reads as having no
    // entry at all, and the fix suggested is to add the file that is right there.
    const dotted = defineBlueprint({
      ...bp,
      architecture: {
        ...bp.architecture,
        layers: bp.architecture.layers.map((layer) => ({ ...layer, entry: 'index.d' })),
      },
    });

    const found = analyze(scanOf([file(['components', 'Card', 'index.d.ts'])]), dotted)
      .map((finding) => finding.rule);

    expect(found).not.toContain('no-entry');
  });
});

describe('analyze · the cycle search does not stop early', () => {
  const cycleOf = (files: ScannedFile[]): string | undefined =>
    analyze(scanOf(files), bp).find((finding) => finding.rule === 'cycle')?.message;

  it('keeps checking a node\'s other edges after one leads nowhere', () => {
    // A reaches B, a dead end, and also C, which loops back. Returning on B's
    // null result reports no cycle on a graph that plainly has one — and the
    // order of a module's imports is not something a reader would suspect.
    expect(cycleOf([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }, { specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../A' }]),
    ])).toContain('components/A → components/C → components/A');
  });

  it('reaches a knot that no walk from the first module can touch', () => {
    // A → B is a dead end, and nothing connects it to the hooks pair. The
    // guarantee moved when cycles became an inventory: the component decomposition
    // is what reaches the second knot now, where it used to be `detectCycle`'s own
    // outer loop starting a fresh walk. Kept at this level because the assertion is
    // about the report, and it holds across that change of mechanism — which is
    // exactly what a test at this altitude should do.
    expect(cycleOf([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ])).toContain('hooks/useC → hooks/useD → hooks/useC');
  });
});

describe('detectCycle · asked directly, as its callers ask it', () => {
  it('treats a target with no entry of its own as a leaf', () => {
    // A module that imports something and is imported by nobody never becomes a key
    // in the graph, so `edges.get(target)` is undefined for it. `analyze` used to
    // hand the whole graph over and covered this incidentally; it now passes one
    // component at a time, where every node is a key by construction. The absent-key
    // case is still part of this function's contract — and nothing was left asking
    // for it, which is how a walk that throws on a leaf ships green.
    expect(detectCycle(new Map([['a', new Set(['leaf'])]]))).toBeNull();
  });
});

describe('detectCycle · memoized, so a mesh stays linear', () => {
  /** `i → i+1` and `i → i+2`: paths from node 0 grow as Fibonacci(n). */
  const mesh = (n: number): Map<string, Set<string>> => {
    const edges = new Map<string, Set<string>>();

    for (let i = 0; i < n; i++) {
      const next = new Set<string>();

      if (i + 1 < n) next.add(`n${i + 1}`);
      if (i + 2 < n) next.add(`n${i + 2}`);

      edges.set(`n${i}`, next);
    }

    return edges;
  };

  it('answers no cycle on a 40-node mesh without walking its 102M paths', () => {
    // The only test that can see `visited`. It is memoization, so every assertion
    // about the RESULT holds with or without it — what does not hold is finishing:
    // re-entering a visited node turns 40 visits into 102 million paths, each
    // allocating its own trail. A tool that runs on a real dependency graph cannot
    // be exponential in it.
    expect(detectCycle(mesh(40))).toBeNull();
  });

  it('still finds a cycle in the same shape', () => {
    const edges = mesh(40);

    edges.get('n39')?.add('n0');

    expect(detectCycle(edges)?.[0]).toBe('n0');
  });
});

describe('analyze · a directory finding addresses the source root the config named', () => {
  // `scan` supports `sourceRoot`, and so did coverage, deps and doctor. The four
  // directory-level findings built their path from a literal `src/`, so a repo with
  // `sourceRoot: 'app'` was sent to `src/components` for a folder at
  // `app/components`. One case per rule per root: this is the whole set of findings
  // whose path is composed rather than taken from `scan`, so a rule left behind
  // keeps pointing at a directory the adopter does not have.
  const withRoot = (sourceRoot?: string) =>
    defineBlueprint({
      ...bp,
      architecture: sourceRoot === undefined
        ? { ...bp.architecture }
        : { ...bp.architecture, sourceRoot },
    });

  /** One scan that trips all four directory findings at once. */
  const scanIn = (prefix: string): ScanResult => ({
    topDirs: ['components', 'utils'],
    files: [
      { path: `${prefix}components/Button/Button.ts`, segments: ['components', 'Button', 'Button.ts'], imports: [] },
      { path: `${prefix}utils/helper.ts`, segments: ['utils', 'helper.ts'], imports: [] },
    ],
  });

  const pathOf = (
    sourceRoot: string | undefined,
    prefix: string,
    rule: string,
  ): string | undefined =>
    analyze(scanIn(prefix), withRoot(sourceRoot)).find((finding) => finding.rule === rule)?.path;

  const roots: [string, string | undefined, string][] = [
    ['the default src/', undefined, 'src/'],
    ['a named root', 'app', 'app/'],
    ['the project root', '.', ''],
  ];

  it.each(roots)('undeclared-folder under %s', (_name, sourceRoot, prefix) => {
    expect(pathOf(sourceRoot, prefix, 'undeclared-folder')).toBe(`${prefix}utils`);
  });

  it.each(roots)('missing-layer under %s', (_name, sourceRoot, prefix) => {
    expect(pathOf(sourceRoot, prefix, 'missing-layer')).toBe(`${prefix}pages`);
  });

  it.each(roots)('declaratory-self-only under %s', (_name, sourceRoot, prefix) => {
    expect(pathOf(sourceRoot, prefix, 'declaratory-self-only')).toBe(`${prefix}contexts`);
  });

  it.each(roots)('no-entry under %s', (_name, sourceRoot, prefix) => {
    expect(pathOf(sourceRoot, prefix, 'no-entry')).toBe(`${prefix}components/Button`);
  });

  it('spells a project-root layout the same way scan does — no "./" prefix', () => {
    // `scan` passes '' as the prefix for a '.' root, so its own file paths carry
    // none. A directory finding rendering './components' beside a file finding
    // rendering 'components/Button/Button.ts' is one path in two spellings, and the
    // reader has to rule out that they are different places.
    const paths = analyze(scanIn(''), withRoot('.')).map((finding) => finding.path);

    expect(paths.every((entry) => !entry.startsWith('./'))).toBe(true);
    expect(paths).toContain('utils');
  });
});

describe('detectCycles · every knot, not the first one', () => {
  const edgesOf = (pairs: [string, string[]][]): Map<string, Set<string>> =>
    new Map(pairs.map(([node, targets]) => [node, new Set(targets)]));

  it('answers with nothing on an acyclic graph', () => {
    expect(detectCycles(edgesOf([['a', ['b']], ['b', ['c']]]))).toEqual([]);
  });

  it('finds two unrelated cycles in one pass', () => {
    // The reason this exists: `detectCycle` returns on the first cycle it meets, so
    // a repo with two independent knots was told it had one, and the second only
    // appeared after the first was fixed and inspect re-run. For a debt inventory
    // that is the difference between sizing the work and discovering it.
    expect(detectCycles(edgesOf([
      ['a', ['b']],
      ['b', ['a']],
      ['x', ['y']],
      ['y', ['x']],
    ]))).toEqual([['a', 'b', 'a'], ['x', 'y', 'x']]);
  });

  it('reports one knot per component, not one per elementary cycle', () => {
    // a → b → c → a and c → b are two elementary cycles through one mutually
    // dependent trio. Listing both is not an inventory: cycles can outnumber nodes
    // exponentially, and the trio still has to be broken as a unit.
    const cycles = detectCycles(edgesOf([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a', 'b']],
    ]));

    expect(cycles).toHaveLength(1);
    expect(cycles[0][0]).toBe('a');
  });

  it('counts a module that imports itself', () => {
    // A one-node component. Nothing here classifies components as trivial or not —
    // the single walk answers null unless the self-edge is really there — and a
    // size-based rule would have dropped this case silently.
    expect(detectCycles(edgesOf([['a', ['a']], ['b', ['a']]]))).toEqual([['a', 'a']]);
  });

  it('orders the inventory by content, not by which node the walk started from', () => {
    // Two cycles can never share a node, so the head of each path is a total order.
    // Tarjan closes components in traversal order, which moves when an unrelated
    // module is added — and a report that reshuffles is a diff nobody reads.
    const forward = detectCycles(edgesOf([['a', ['b']], ['b', ['a']], ['x', ['y']], ['y', ['x']]]));
    const reversed = detectCycles(edgesOf([['y', ['x']], ['x', ['y']], ['b', ['a']], ['a', ['b']]]));

    expect(reversed).toEqual(forward);
  });

  it('leaves the walk that already carries the memoization proof to find the path', () => {
    // The 40-node mesh, asked through the component layer: ~102M distinct paths, no
    // cycle. Composing rather than reimplementing is what keeps that property —
    // a second hand-written walk would be a second place for it to be lost.
    const edges = new Map<string, Set<string>>();

    for (let i = 0; i < 40; i++) {
      const targets = new Set<string>();

      if (i + 1 < 40) targets.add(`n${i + 1}`);
      if (i + 2 < 40) targets.add(`n${i + 2}`);

      edges.set(`n${i}`, targets);
    }

    expect(detectCycles(edges)).toEqual([]);
  });
});

describe('analyze · a report inventories every cycle', () => {
  const cycleMessages = (files: ScannedFile[]): string[] =>
    analyze(scanOf(files), bp)
      .filter((finding) => finding.rule === 'cycle')
      .map((finding) => finding.message);

  it('reports both knots when a repo has two', () => {
    const messages = cycleMessages([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../A' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('components/A → components/B → components/A');
    expect(messages[1]).toContain('hooks/useC → hooks/useD → hooks/useC');
  });
});

describe('detectCycle · the three properties only a whole graph can ask about', () => {
  // These used to be asked through `analyze`, which handed `detectCycle` the entire
  // module graph. It now receives one strongly connected component at a time, and a
  // component by construction has no lead-in, no dead end and no second knot — so
  // every one of these went unasked the moment the caller changed, with the suite
  // green and the mutation sweep as the only witness. Asked of the unit directly,
  // which is where they belong: this function is exported for exactly this.
  it('trims the walk that led to the cycle, and reports only the cycle', () => {
    // x is how the walk got there and is not part of it. Reported whole, the path
    // names a module the reader then cannot find in the loop they are asked to break.
    expect(detectCycle(new Map([
      ['x', new Set(['a'])],
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]))).toEqual(['a', 'b', 'a']);
  });

  it('keeps checking a node\'s other edges after one leads nowhere', () => {
    // `dead` is a leaf, so the first branch answers null. Returning that null as the
    // verdict reports no cycle on a graph that plainly has one — and the order of a
    // module's imports is not something a reader would suspect.
    expect(detectCycle(new Map([
      ['a', new Set(['dead', 'c'])],
      ['c', new Set(['a'])],
    ]))).toEqual(['a', 'c', 'a']);
  });

  it('starts a fresh walk at an untouched node after the first finds nothing', () => {
    // The first walk covers a and b and answers null. Treating that as the answer
    // stops before the pair that does cycle.
    expect(detectCycle(new Map([
      ['a', new Set(['b'])],
      ['x', new Set(['y'])],
      ['y', new Set(['x'])],
    ]))).toEqual(['x', 'y', 'x']);
  });
});

describe('detectCycles · a knot behind another knot is still its own knot', () => {
  it('closes a component whose edges also point into an already-closed one', () => {
    // Tarjan's rule that decides this: a target that is indexed but no longer on the
    // stack belongs to a component that is already closed, and its index must NOT
    // propagate. Take it anyway and the second component never satisfies
    // `lowest === own`, so it never closes — and a repo whose hooks cycle imports an
    // already-reported components cycle loses the hooks one entirely. Two knots, one
    // reachable from the other, is the ordinary brownfield shape.
    const cycles = detectCycles(new Map([
      ['components/A', new Set(['components/B'])],
      ['components/B', new Set(['components/A'])],
      ['hooks/useC', new Set(['hooks/useD', 'components/A'])],
      ['hooks/useD', new Set(['hooks/useC'])],
    ]));

    expect(cycles).toEqual([
      ['components/A', 'components/B', 'components/A'],
      ['hooks/useC', 'hooks/useD', 'hooks/useC'],
    ]);
  });
});

describe('analyze · a finding\'s subject is content, not the order it was walked in', () => {
  it('sorts a cycle\'s members, so a rotated path is the same knot', () => {
    // The reported path enters the knot wherever the walk re-met it, and that entry
    // point moves when an unrelated edge inside the same knot changes. Here the walk
    // starts at `a` and the cycle it meets is `m → b → m` — so the members in walk
    // order are `m b`, and in name order `b m`. Unsorted, the same knot re-read from
    // a different entry is a different baseline entry, which is the failure the
    // subject exists to prevent.
    const cycle = analyze(scanOf([
      file(['components', 'a', 'index.ts'], [{ specifier: '../m' }]),
      file(['components', 'm', 'index.ts'], [{ specifier: '../b' }]),
      file(['components', 'b', 'index.ts'], [{ specifier: '../m' }, { specifier: '../a' }]),
    ]), bp).find((finding) => finding.rule === 'cycle');

    expect(cycle?.message).toContain('components/m → components/b → components/m');
    expect(cycle?.subject).toBe('components/b components/m');
    // The address is the first member for the same reason: content-determined, and
    // always one of the modules named in the message.
    expect(cycle?.path).toBe('components/b');
  });

  it('carries an ownership finding\'s named imports, sorted', () => {
    // Two restricted names from one package in one file is one finding, and the names
    // are part of what it is about: `{ a, b }` and `{ b, a }` are the same import
    // written twice, while dropping them entirely would let one baselined name
    // suppress a second, different one.
    const owned = defineBlueprint({
      ...bp,
      architecture: {
        ...bp.architecture,
        layers: bp.architecture.layers.map((layer) =>
          layer.name === 'contexts'
            ? { ...layer, owns: [{ package: 'vue', imports: ['provide', 'inject'] }] }
            : layer),
      },
    });

    const finding = analyze(scanOf([
      file(['components', 'Btn', 'index.ts'], [{ specifier: 'vue', names: ['provide', 'inject'] }]),
    ]), owned).find((entry) => entry.rule === 'package-ownership');

    expect(finding?.subject).toBe('vue inject,provide');
    expect(finding?.message).toContain('provide, inject');
  });
});

describe('analyze · a modular tree is read at module depth', () => {
  // The state this suite exists to catch is not a wrong verdict — it is
  // silence. Every guard below reads `segments[depth]`; left at 0 it reads a
  // module name, fails the `layerNames` test, and returns early. `inspect`
  // then reports nothing on a modular repo while coverage (modular since #185)
  // reads full, so blindness and cleanliness have identical output. Each case
  // here asserts a finding that must FIRE.
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'ui', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
        {
          name: 'services',
          does: 'io',
          layout: 'folder',
          owns: ['axios'],
          allowedImporters: [{ layer: 'hooks', selfOnly: true }],
        },
      ],
      modules: [
        { name: 'Fighter', does: 'The player ship.', imports: ['Combat'] },
        { name: 'Combat', does: 'Bullets and damage.' },
      ],
    },
  });

  const modularRules = (files: ScannedFile[]) =>
    analyze({ topDirs: ['Fighter', 'Combat'], files }, modular).map((finding) => finding.rule);

  it('flags an upstream import from inside a module', () => {
    // `hooks` is declared after `components`, so reaching back up to it is the
    // layer flow violated one level down. The specifier is the modular
    // spelling — the alias reaches the source root, so the module comes first.
    expect(modularRules([
      file(['Fighter', 'hooks', 'useInput', 'index.ts'], [
        { specifier: '~app/Fighter/components/Ship' },
      ]),
    ])).toContain('flow-violation');
  });

  it('flags a reach past another module\'s entry, and not as a same-layer import', () => {
    // `Fighter/components` and `Combat/components` are different folders whose
    // layer names coincide, so the module is decided before the layer is read.
    // Called same-layer, this answers with the one remedy `module-escape`
    // forbids — a relative path cannot cross a module boundary.
    const rules = modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [
        { specifier: '~app/Combat/components/Bullet' },
      ]),
    ]);

    expect(rules).toContain('deep-import');
    expect(rules).not.toContain('flow-violation');
  });

  it('flags a deep import into another unit', () => {
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [
        { specifier: '~app/Fighter/services/api/internals' },
      ]),
    ])).toContain('deep-import');
  });

  it('flags an owned package imported outside its layer', () => {
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [{ specifier: 'axios' }]),
    ])).toContain('package-ownership');
  });

  it('flags a selfOnly re-export', () => {
    expect(modularRules([
      file(['Fighter', 'hooks', 'useApi', 'index.ts'], [
        { specifier: '~app/Fighter/services/api', isExport: true },
      ]),
    ])).toContain('selfonly-reexport');
  });

  it('flags a relative import that leaves the layer, and one that reaches inside a sibling', () => {
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [{ specifier: '../../hooks/useInput' }]),
    ])).toContain('layer-escape');

    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [{ specifier: '../Hull/internals' }]),
    ])).toContain('entry-bypass');
  });

  it('accepts a sibling unit reached by its entry, at module depth', () => {
    // The legal same-layer edge. Reported here, every correctly-shaped modular
    // repo would be red on its own conventions.
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [{ specifier: '../Hull' }]),
    ])).not.toContain('entry-bypass');
  });

  it('does not read one module\'s layer as another module\'s', () => {
    // `Fighter/components` and `Combat/components` are different folders. A
    // depth-blind comparison sees the same layer name and calls this legal.
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [
        { specifier: '../../../Combat/components/Bullet' },
      ]),
    ])).toContain('module-escape');
  });

  it('governs the module root\'s own imports, at the spelling the emitted config bans', () => {
    // Judged by the layer test alone the root is skipped — its segment at the
    // layer position is a filename — and the module's own composition code
    // becomes the least examined code in the module. What governs it instead is
    // its module's own entry, `src/Fighter/*`, which carries the unit-entry
    // group over every folder-layout layer.
    expect(modularRules([
      file(['Fighter', 'Fighter.tsx'], [{ specifier: '~app/Fighter/components/Ship/internals' }]),
    ])).toContain('deep-import');

    // …and reaching a unit correctly raises no import finding, or every module
    // would be red on the one thing its root is for. (`undeclared-folder` still
    // fires on the module directories themselves — that is #184's, not this.)
    for (const specifier of ['./components/Ship', '~app/Fighter/components/Ship']) {
      const rules = modularRules([file(['Fighter', 'Fighter.tsx'], [{ specifier }])]);

      expect(rules).not.toContain('deep-import');
      expect(rules).not.toContain('entry-bypass');
      expect(rules).not.toContain('layer-escape');
      expect(rules).not.toContain('root-import');
      expect(rules).not.toContain('flow-violation');
    }
  });

  it('flags a layer reaching up to the module root, in both spellings', () => {
    for (const specifier of ['~app/Fighter', '~app/Fighter/index', '../../Fighter']) {
      expect(modularRules([
        file(['Fighter', 'components', 'Ship', 'index.tsx'], [{ specifier }]),
      ])).toContain('root-import');
    }
  });

  it('does not call another module\'s root an upward edge', () => {
    // `~app/Combat` from inside Fighter is a CROSS-module edge — #182's to judge
    // once module bans exist — not this module reaching up to its own root. The
    // guard that separates them is `parts[0] === file.segments[0]`, and nothing
    // asserted it until a mutation sweep dropped it and every test stayed green.
    expect(modularRules([
      file(['Fighter', 'hooks', 'useInput', 'index.ts'], [{ specifier: '~app/Combat' }]),
    ])).not.toContain('root-import');
  });

  it('does not read a bare layer address as the module root', () => {
    // `~app/Fighter/components` reaches a declared layer, not the root. Read as
    // the root it would report the upward edge on a downward one.
    expect(modularRules([
      file(['Fighter', 'hooks', 'useInput', 'index.ts'], [{ specifier: '~app/Fighter/components' }]),
    ])).not.toContain('root-import');
  });

  it('flags a folder unit with no entry file, at module depth', () => {
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'Ship.tsx']),
    ])).toContain('no-entry');
  });

  it('does not call a layer declaratory when a module holds its files', () => {
    // `services` has a selfOnly importer, so the note fires only when the layer
    // is empty. Read at layer depth, no file's first segment is ever a layer
    // name, and every selfOnly layer is reported empty in every modular repo.
    expect(modularRules([
      file(['Fighter', 'services', 'api', 'index.ts']),
    ])).not.toContain('declaratory-self-only');

    // …and it still fires when the layer really is empty.
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx']),
    ])).toContain('declaratory-self-only');
  });
});

describe('analyze · governing between modules', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets', owns: ['rbush'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  });

  const modularScan = (files: ScannedFile[]): ScanResult =>
    ({ topDirs: ['GameStage', 'Combat'], files });

  const findingsFor = (files: ScannedFile[], deps?: string[]) =>
    analyze(modularScan(files), modular, deps);

  it('reports a re-export of another module through this one\'s surface', () => {
    const [finding] = findingsFor([
      file(['GameStage', 'index.ts'], [{ specifier: '~app/Combat', isExport: true }]),
    ]).filter((entry) => entry.rule === 'module-reexport');

    expect(finding.severity).toBe('error');
    // The module passed through, so two pass-throughs in one file are two
    // findings rather than one with a merged subject.
    expect(finding.subject).toBe('Combat');
    expect(finding.message).toContain('declares it in its own');
    // The plausible non-fix, named — an agent under gate pressure reaches for
    // it otherwise, and a wrapper that only forwards buys nothing.
    expect(finding.message).toContain('buys nothing');
  });

  it('leaves an ordinary import of a declared dependency alone', () => {
    expect(findingsFor([
      file(['GameStage', 'index.ts'], [{ specifier: '~app/Combat' }]),
    ]).map((entry) => entry.rule)).not.toContain('module-reexport');
  });

  it('says nothing about re-exporting this module\'s own surface', () => {
    expect(findingsFor([
      file(['GameStage', 'index.ts'], [{ specifier: '~app/GameStage/hooks/useRun', isExport: true }]),
    ]).map((entry) => entry.rule)).not.toContain('module-reexport');
  });

  it('agrees with the lint rule about which module a specifier hands over', () => {
    // Both gates call `crossModuleTarget`, so neither can reach a conclusion
    // the other would not — the property `relativeVerdict` already carries one
    // level in, and the reason it is one function rather than two readings.
    expect(crossModuleTarget('~app/Combat', ['~app'], ['GameStage', 'Combat'], 'GameStage'))
      .toBe('Combat');

    expect(crossModuleTarget('~app/GameStage/hooks/x', ['~app'], ['GameStage', 'Combat'], 'GameStage'))
      .toBeNull();

    expect(crossModuleTarget('~app/Nowhere', ['~app'], ['GameStage', 'Combat'], 'GameStage'))
      .toBeNull();

    expect(crossModuleTarget('./local', ['~app'], ['GameStage', 'Combat'], 'GameStage')).toBeNull();
  });

  it('bars a module-owned package outside its owning module', () => {
    // Banned by lint and invisible here would be the same two-gates-one-verdict
    // split this file's own doctrine exists to prevent.
    const [finding] = findingsFor([
      file(['GameStage', 'hooks', 'useRun', 'index.ts'], [{ specifier: 'rbush' }]),
    ]).filter((entry) => entry.rule === 'package-ownership');

    expect(finding.message).toContain('owned by module Combat');
    expect(finding.message).toContain('not importable from "GameStage"');
  });

  it('names the restricted imports in the subject, sorted, so two are two debts', () => {
    // The names are part of the identity, not just of the sentence: one file
    // importing two restricted names from one package is two debts with two
    // fixes, and the baseline keys on the subject.
    //
    // Two of them, written in the order nobody would sort them into: the layer
    // level has had that case since it was written and this level was asserted
    // with one name, where a sort decides nothing. `{ a, b }` and `{ b, a }` are
    // the same import written twice, and unsorted they are two baseline entries.
    const owning = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'GameStage', does: 'the run', imports: ['Combat'] },
          {
            name: 'Combat',
            does: 'bullets',
            owns: [{ package: 'rbush', imports: ['insert', 'remove'] }],
          },
        ],
      },
    });

    const [finding] = analyze(
      modularScan([file(['GameStage', 'hooks', 'useRun', 'index.ts'], [
        { specifier: 'rbush', names: ['remove', 'insert'] },
      ])]),
      owning,
    ).filter((entry) => entry.rule === 'package-ownership');

    expect(finding.subject).toBe('rbush insert,remove');
    // The sentence keeps the source order — it reads the import back to its
    // author, while the subject is an identity two spellings must share.
    expect(finding.message).toContain('(remove, insert)');
  });

  it('leaves a module-owned package alone inside its owner', () => {
    expect(findingsFor([
      file(['Combat', 'hooks', 'useDamage', 'index.ts'], [{ specifier: 'rbush' }]),
    ]).map((entry) => entry.rule)).not.toContain('package-ownership');
  });

  it('notes a module owns entry whose package is not installed, as a MODULE', () => {
    // Same tier and doctrine as the layer-level note: declaring ownership
    // before the install is the legitimate order.
    const note = findingsFor([], []).find((entry) => entry.rule === 'owns-not-installed');

    expect(note?.subject).toBe('rbush');
    expect(note?.severity).toBe('info');
    // The path and the message, not the severity alone. Asserting `subject` and
    // `severity` is what let both of them be wrong in one green object: the level
    // word said "Layer" and the address named a folder that must not exist.
    expect(note?.path).toBe('src/Combat');
    expect(note?.message).toContain('Module "Combat" owns "rbush"');
    // #190's vocabulary, in the one place it can be got wrong: the level is read
    // from which list the entry came out of, never from a loop variable's name.
    expect(note?.message).not.toContain('Layer "');
    // A module IS a top-level folder, so its own address needs no explaining and
    // there is no folder to forbid.
    expect(note?.message).not.toContain('Do not create');
  });
});

describe('analyze · a cross-module edge is judged before any layer', () => {
  // The fixture the four cases were measured on: `Fighter` declares `Combat`
  // and nothing else, so `common` is an undeclared edge and `Combat`'s
  // internals are a reach past a declared dependency's entry.
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
        { name: 'common', does: 'shared' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  });

  const LAYER_FILE = ['Fighter', 'hooks', 'usePilot', 'index.ts'];
  const ROOT_FILE = ['Fighter', 'Fighter.tsx'];

  /** The errors one file's one import produces — the background notes are info. */
  const errorsFor = (segments: string[], ref: Partial<ImportRef>): Finding[] =>
    analyze(
      { topDirs: ['Fighter', 'Combat', 'common'], files: [file(segments, [ref])] },
      modular,
    ).filter((finding) => finding.severity === 'error');

  const only = (segments: string[], specifier: string): Finding => {
    const errors = errorsFor(segments, { specifier });

    // One import, one verdict. Two findings for one edge is two remedies for
    // one fix, which is how case C shipped a `deep-import` beside a
    // `flow-violation` that contradicted it.
    expect(errors).toHaveLength(1);

    return errors[0];
  };

  it('A · reports an undeclared edge from a layer file, naming `imports`', () => {
    const finding = only(LAYER_FILE, '~app/common');

    expect(finding.rule).toBe('undeclared-dependency');
    expect(finding.path).toBe('src/Fighter/hooks/usePilot/index.ts');
    expect(finding.subject).toBe('~app/common');
    expect(finding.message).toContain('reaches module "common", which "Fighter" does not declare');
    expect(finding.message).toContain('Add "common" to "Fighter"\'s `imports`');
    // The remedy `module-escape` forbids. An agent that follows it lands on a
    // second error with a third remedy.
    expect(finding.message).not.toContain('relative path');
  });

  it('D · reports the same undeclared edge from the module root', () => {
    const finding = only(ROOT_FILE, '~app/common');

    expect(finding.rule).toBe('undeclared-dependency');
    expect(finding.path).toBe('src/Fighter/Fighter.tsx');
    expect(finding.message).toContain('Add "common" to "Fighter"\'s `imports`');
  });

  it('C · reports a reach past a declared dependency\'s entry, not a same-layer import', () => {
    const finding = only(LAYER_FILE, '~app/Combat/hooks/useDamage');

    // `Fighter/hooks` and `Combat/hooks` are different folders whose layer
    // names coincide, and the old comparison read the layer and not the module.
    expect(finding.rule).toBe('deep-import');
    expect(finding.rule).not.toBe('flow-violation');
    expect(finding.message).toContain('reaches inside module "Combat"');
    // The entry, spelled — the string the reader types.
    expect(finding.message).toContain('import it through its entry, "~app/Combat"');
    // Two truths with no bridge read as a contradiction: red on Combat, beside
    // Combat being a declared dependency.
    expect(finding.message).toContain('declared in "Fighter"\'s `imports`, so the entry itself is reachable');
    expect(finding.message).not.toContain('Same-layer import');
    expect(finding.message).not.toContain('relative path');
    expect(finding.message).not.toContain('extract to a lower layer');
  });

  it('B · reports the same reach from the module root, which reads no layer at all', () => {
    // `Fighter/Fighter.tsx` puts a FILENAME at `segments[depth]`, so every
    // layer-keyed test missed it. The cross-module arm never reads that slot.
    const finding = only(ROOT_FILE, '~app/Combat/hooks/useDamage');

    expect(finding.rule).toBe('deep-import');
    expect(finding.path).toBe('src/Fighter/Fighter.tsx');
    expect(finding.message).toContain('import it through its entry, "~app/Combat"');
  });

  it('leaves a declared edge through the entry green', () => {
    expect(errorsFor(LAYER_FILE, { specifier: '~app/Combat' })).toEqual([]);
    expect(errorsFor(ROOT_FILE, { specifier: '~app/Combat' })).toEqual([]);
  });

  it('still calls a same-layer import INSIDE one module a flow-violation, worded as before', () => {
    // The half that was right stays right, wording included: a relative path
    // really is the legal spelling for a same-layer edge within one module.
    const finding = only(LAYER_FILE, '~app/Fighter/hooks/useOther');

    expect(finding.rule).toBe('flow-violation');

    expect(finding.message).toBe(
      'Same-layer import "~app/Fighter/hooks/useOther" via the alias — use a relative path or extract to a lower layer.',
    );
  });

  it('says nothing about a target no `modules` entry declares, where lint is green too', () => {
    // The emitted same-layer ban is module-scoped (`~app/Fighter/hooks/**`), so
    // `~app/Nowhere/hooks/…` matches nothing in lint — while inspect called it a
    // same-layer import and told the reader to use a relative path. The folder
    // is ungoverned, which `undeclared-module` reports at the level that can act.
    expect(errorsFor(LAYER_FILE, { specifier: '~app/Nowhere/hooks/useX' })).toEqual([]);
    expect(errorsFor(ROOT_FILE, { specifier: '~app/Nowhere/hooks/useX' })).toEqual([]);
  });

  it('says nothing when the IMPORTING folder is undeclared, for the same reason', () => {
    // No glob reaches `src/Nowhere/`, so no ban group was emitted for it either.
    expect(errorsFor(['Nowhere', 'hooks', 'useX', 'index.ts'], { specifier: '~app/common' }))
      .toEqual([]);
  });

  it('answers a reach that is deep at BOTH levels once, at the module level', () => {
    // `~app/Combat/hooks/useDamage/impl` is past Combat's entry AND past the
    // unit's. The unit-level remedy (`~app/Combat/hooks/useDamage`) is itself
    // banned, so answering with it would send the reader to the next error.
    const finding = only(LAYER_FILE, '~app/Combat/hooks/useDamage/impl');

    expect(finding.rule).toBe('deep-import');
    expect(finding.message).toContain('import it through its entry, "~app/Combat"');
  });

  it('reports a cross-module re-export as both a pass-through and an edge', () => {
    // Two lint rules fire on this one line — `blueprint/no-module-reexport` and
    // `no-restricted-imports` — so two findings is the agreeing count.
    const errors = errorsFor(LAYER_FILE, { specifier: '~app/common', isExport: true });

    expect(errors.map((finding) => finding.rule).sort())
      .toEqual(['module-reexport', 'undeclared-dependency']);
  });

  it('tells an adopter to change the decomposition when the edge runs backwards', () => {
    // A module may only name modules declared after it, so "add it to `imports`"
    // is an instruction `defineBlueprint` would reject. Computed from the
    // declared order rather than carried as a caveat on every forward edge.
    const finding = only(['common', 'hooks', 'useShared', 'index.ts'], '~app/Fighter');

    expect(finding.rule).toBe('undeclared-dependency');
    expect(finding.message).toContain('"Fighter" is declared BEFORE "common"');
    expect(finding.message).toContain('The decomposition is what needs changing, not the config.');
    expect(finding.message).not.toContain('Add "Fighter"');
  });

  it('changes nothing on a flat project', () => {
    // The whole arm is behind `depth > 0`. A flat project has no module segment
    // to compare, and `~app/components/Other` keeps the sentence it always had.
    const flat = analyze(
      scanOf([file(['components', 'Btn', 'index.ts'], [{ specifier: '~app/components/Other' }])]),
      bp,
    );

    expect(flat.map((finding) => finding.rule)).not.toContain('undeclared-dependency');

    expect(flat.find((finding) => finding.rule === 'flow-violation')?.message).toBe(
      'Same-layer import "~app/components/Other" via the alias — use a relative path or extract to a lower layer.',
    );
  });
});

describe('analyze · the cross-module policy is pinned to the config emitLint emits', () => {
  // `emitLint` compiles `ModuleDef.imports` into ban groups and `analyze` reads
  // the same field — one reading against one generator, which can drift exactly
  // as silently as the two readings `boundary` exists to prevent. #212's shape:
  // equality BOTH ways against the emitter's own output, so neither a missing
  // entry nor an extra one passes, and neither side is a literal.
  const NAMES = ['Boss', 'Combat', 'Shared', 'app'];

  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Boss', does: 'the fight', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets', imports: ['Shared'] },
        { name: 'Shared', does: 'primitives' },
        // Last in the order, so it declares nothing and every edge out of it is
        // undeclared — and it carries the third zone below.
        { name: 'app', does: 'routing only', layers: false },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  });

  const others = (module: string) => NAMES.filter((name) => name !== module);
  const entrySpelling = (target: string) => `~app/${target}`;
  const insideSpelling = (target: string) => `~app/${target}/hooks/useThing`;

  /**
   * Every zone a module has, each importing every OTHER module at both
   * spellings. Three of them, not two, and each is a position a fix can miss on
   * its own: the layer file, the module root — the emitted groups are identical
   * on both, and a fix that reads a layer name misses the root — and a file
   * nested inside a `layers: false` module, where no layer glob reaches and the
   * emitted groups ride the module's own recursive entry instead.
   *
   * The third zone exists only under `app`; the others get their two, which is
   * what `zoneOf` below enumerates.
   */
  const zoneOf = (module: string): string[][] => [
    ...(module === 'app'
      ? [[module, 'routes', 'Game', 'screen.tsx']]
      : [[module, 'hooks', 'useThing', 'index.ts']]),
    [module, `${module}.tsx`],
  ];

  const files = NAMES.flatMap((module) => {
    const imports = others(module).flatMap((target) => [
      { specifier: entrySpelling(target) },
      { specifier: insideSpelling(target) },
    ]);

    return zoneOf(module).map((segments) => file(segments, imports));
  });

  const findings = analyze({ topDirs: NAMES, files }, modular)
    .filter((finding) => finding.severity === 'error');

  /** What `analyze` says about `module`, in the emitter's own vocabulary. */
  const analyzed = (module: string, zone: string) => {
    const errored = new Set(
      findings.filter((finding) => finding.path === zone).map((finding) => finding.subject),
    );

    return {
      banned: others(module).filter((target) => errored.has(entrySpelling(target))),
      entryOnly: others(module).filter(
        (target) => !errored.has(entrySpelling(target)) && errored.has(insideSpelling(target)),
      ),
    };
  };

  /** What the emitted config bans for `module`, read back out of the groups. */
  const emitted = (module: string) => {
    const banned = new Set<string>();
    const entryOnly = new Set<string>();

    for (const entry of emitLint(modular)) {
      if (!(entry.files ?? []).some((glob) => glob.startsWith(`src/${module}/`))) continue;

      const setting = entry.rules?.['no-restricted-imports'];

      if (!Array.isArray(setting)) continue;

      const { patterns = [] } = setting[1] as { patterns?: { group: string[] }[] };

      for (const { group } of patterns) {
        for (const glob of group) {
          // One segment under the alias, with or without the descendant
          // wildcard. A structural ban carries two (`~app/Boss/hooks/**`) and
          // the module's own root rides `paths`, so neither can land here.
          const match = /^~app\/([^/]+)(\/\*\*)?$/.exec(glob);

          if (match && NAMES.includes(match[1])) (match[2] ? entryOnly : banned).add(match[1]);
        }
      }
    }

    // An undeclared module's group carries BOTH spellings, so the wildcard
    // alone does not make it entry-only — the pair is what says "banned".
    for (const name of banned) entryOnly.delete(name);

    return { banned: [...banned].sort(), entryOnly: [...entryOnly].sort() };
  };

  it.each(NAMES)('%s bans exactly what the emitted config bans it from, both ways', (module) => {
    const expected = emitted(module);

    for (const segments of zoneOf(module)) {
      expect(analyzed(module, ['src', ...segments].join('/'))).toEqual(expected);
    }
  });

  it('compared something — the counts the fixture was built to produce', () => {
    // …and cannot pass on a comparison that found nothing. Each module bans
    // every one it did not name — `app` is last in the order and declares
    // nothing, so it bans all three and all three ban it.
    const total = NAMES.map(emitted);

    expect(total.map((entry) => entry.banned)).toEqual([
      ['Shared', 'app'],
      ['Boss', 'app'],
      ['Boss', 'Combat', 'app'],
      ['Boss', 'Combat', 'Shared'],
    ]);

    expect(total.map((entry) => entry.entryOnly)).toEqual([['Combat'], ['Shared'], [], []]);
  });
});

/**
 * The layer guard used to answer this whole zone with `return []`, so every
 * per-file judgment stopped at a `layers: false` module's root while the emitted
 * config reached every file below it. Four judgments were lint-red and
 * inspect-silent there, and the fix has to restore exactly those four — widening
 * the guard instead of splitting the pass by zone turns the negatives below red
 * against a lint run that never moves, which is the same disagreement in the
 * other direction.
 */
describe('analyze · a layers:false module is one zone, root and every file below it', () => {
  const routed = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'routing only', layers: false, imports: ['GameStage'] },
        { name: 'GameStage', does: 'the run', owns: ['zustand'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', owns: ['clsx'] },
        {
          name: 'hooks',
          does: 'state',
          layout: 'folder',
          allowedImporters: [{ layer: 'components', selfOnly: true }],
        },
      ],
    },
  });

  const TOP = ['app', 'GameStage', 'Combat'];

  // Three depths inside the opted-out module. `routes` is not a declared layer
  // and never will be — that is what the opt-out buys — so each of these is a
  // position the old guard answered with silence.
  const ROOT = ['app', 'index.tsx'];
  const NESTED = ['app', 'routes', 'Game.tsx'];
  const DEEPER = ['app', 'routes', 'Game', 'screen.tsx'];

  const errorsFor = (segments: string[], ref: Partial<ImportRef>): Finding[] =>
    analyze({ topDirs: TOP, files: [file(segments, [ref])] }, routed)
      .filter((finding) => finding.severity === 'error');

  const only = (segments: string[], ref: Partial<ImportRef>): Finding => {
    const errors = errorsFor(segments, ref);

    expect(errors).toHaveLength(1);

    return errors[0];
  };

  it('reports an undeclared edge from a nested file, naming `imports`', () => {
    const finding = only(NESTED, { specifier: '~app/Combat' });

    expect(finding.rule).toBe('undeclared-dependency');
    expect(finding.path).toBe('src/app/routes/Game.tsx');
    expect(finding.subject).toBe('~app/Combat');
    expect(finding.message).toContain('reaches module "Combat", which "app" does not declare');
    expect(finding.message).toContain('Add "Combat" to "app"\'s `imports`');
  });

  it('reports a pass-through from a nested file', () => {
    const finding = only(DEEPER, { specifier: '~app/GameStage', isExport: true });

    expect(finding.rule).toBe('module-reexport');
    expect(finding.path).toBe('src/app/routes/Game/screen.tsx');
    expect(finding.subject).toBe('GameStage');
    expect(finding.message).toContain('Re-exports "GameStage" through this module\'s own surface');
  });

  it('reports a reach past a DECLARED dependency\'s entry from a nested file', () => {
    const finding = only(NESTED, { specifier: '~app/GameStage/hooks/useRun' });

    expect(finding.rule).toBe('deep-import');
    expect(finding.message).toContain('reaches inside module "GameStage"');
    expect(finding.message).toContain('import it through its entry, "~app/GameStage"');
    // The bridge the self-explaining rule asks for: red on GameStage, beside
    // GameStage being this module's declared dependency.
    expect(finding.message).toContain('is declared in "app"\'s `imports`');
  });

  it('reports a package another MODULE owns, from a nested file', () => {
    // `owns` is one of the four things `ModuleDef.layers` promises still reach
    // inside a module that opted out of the layer vocabulary.
    const finding = only(DEEPER, { specifier: 'zustand' });

    expect(finding.rule).toBe('package-ownership');
    expect(finding.message).toContain('is owned by module GameStage — not importable from "app"');
  });

  it('answers the root and every depth below it identically', () => {
    // The root already worked before the fix, which is why the pair is the
    // claim: a repair that reaches only the root leaves the depth that broke,
    // and one that reaches only the depths regresses the root.
    const verdicts = [ROOT, NESTED, DEEPER].map((segments) => {
      const finding = only(segments, { specifier: '~app/Combat' });

      return `${finding.rule} ${finding.subject}`;
    });

    expect(verdicts).toEqual([
      'undeclared-dependency ~app/Combat',
      'undeclared-dependency ~app/Combat',
      'undeclared-dependency ~app/Combat',
    ]);
  });

  /**
   * Every shape a real lint run is green over inside this module, each with the
   * finding the layer branch would have produced for it. Restated here rather
   * than derived, so removing one from `analyze` turns exactly one case red.
   */
  const SILENT: [string, string[], Partial<ImportRef>][] = [
    // `routes` is not a layer, so there is no same-layer edge to have.
    ['a same-named folder addressed through the alias', NESTED, { specifier: '~app/app/routes/Menu' }],
    // flow-violation: `hooks` may not reach `components` — between LAYERS.
    ['a folder its config says is not a layer, reaching another', ['app', 'hooks', 'useNav.ts'], { specifier: '~app/app/components/Card' }],
    // deep-import, unit level: `~app/<layer>/<unit>/<inside>` at module depth.
    ['a reach past a folder that only looks like a unit', NESTED, { specifier: '~app/app/components/Card/impl' }],
    // selfonly-reexport: `hooks` is selfOnly to `components`.
    ['a re-export of a folder a layer would have made selfOnly', ['app', 'components', 'Card.tsx'], { specifier: '~app/app/hooks/useNav', isExport: true }],
    // root-import: the alias spelling of the upward edge.
    ['the module\'s own root through the alias', DEEPER, { specifier: '~app/app' }],
    // package-ownership, LAYER level: no folder here can be in an `allowedIn`.
    ['a package a LAYER owns', NESTED, { specifier: 'clsx' }],
    // entry-bypass: the root reaching past what looks like a unit entry.
    ['the root reaching down into its own folders', ROOT, { specifier: './routes/Game/screen' }],
    // module-escape: real, and its plugin twin registers no visitor here.
    ['a relative path that leaves the module', NESTED, { specifier: '../../GameStage/index' }],
    // The last two are controls rather than assertions that bite: both are legal
    // whichever way the guard is written, and they are here so the eight above
    // cannot pass on a fixture that simply reports nothing.
    ['a relative path that stays inside it', DEEPER, { specifier: '../Menu/screen' }],
    ['the declared edge through its entry', NESTED, { specifier: '~app/GameStage' }],
  ];

  it.each(SILENT)('stays silent on %s', (_label, segments, ref) => {
    expect(errorsFor(segments, ref)).toEqual([]);
  });
});

/**
 * The third zone, and it is not the second one wearing different clothes. A
 * folder inside a LAYERED module that is not a declared layer is matched by no
 * emitted glob at all — the layer globs expand to declared names, and
 * `resolveModuleFiles` stops at `src/<Module>/*` — so lint is green there by
 * construction and a finding would be red against it, with a remedy that is the
 * owner's call. `coverage` reports the folder instead, by path.
 */
describe('analyze · an undeclared position inside a declared module', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const errorsFor = (ref: Partial<ImportRef>): Finding[] =>
    analyze(
      {
        topDirs: ['Fighter', 'Combat'],
        files: [file(['Fighter', 'scratch', 'x.ts'], [ref])],
      },
      modular,
    ).filter((finding) => finding.severity === 'error');

  it.each([
    ['an undeclared edge', { specifier: '~app/Combat' }],
    ['a pass-through', { specifier: '~app/Combat', isExport: true }],
    ['a relative path leaving the module', { specifier: '../../Combat/index' }],
  ])('says nothing about %s there, matching the lint run', (_label, ref) => {
    expect(errorsFor(ref)).toEqual([]);
  });
});

/**
 * A layered module's ROOT file answers to its module's own emitted entry —
 * `src/<Module>/*` — and that entry carries four things: the cross-module ban
 * groups, the unit-entry group over its own folder-layout layers, the
 * MODULE-level `owns` bans, and `blueprint/no-module-reexport`. It carries no
 * layer-level ban of any kind, and `blueprint/relative-escape` registers no
 * visitor on it at all: the rule opens on `segments[depth] in layouts`, and at a
 * root that segment is the file's own name.
 *
 * So four judgments were red here against a lint run green on every one of them,
 * and one of the four printed that filename in the position its own sentence
 * promises a layer.
 */
describe('analyze · a layered module\'s root is judged by its module\'s entry', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets', owns: ['rot-js'] },
        { name: 'Shared', does: 'primitives' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        {
          name: 'hooks',
          does: 'state',
          layout: 'folder',
          owns: ['zustand'],
          allowedImporters: [{ layer: 'components', selfOnly: true }],
        },
      ],
    },
  });

  const TOP = ['Fighter', 'Combat', 'Shared'];
  const ROOT = ['Fighter', 'Fighter.jsx'];
  const LAYER = ['Fighter', 'hooks', 'useRun', 'index.js'];

  const errorsFor = (segments: string[], ref: Partial<ImportRef>): Finding[] =>
    analyze({ topDirs: TOP, files: [file(segments, [ref])] }, modular)
      .filter((finding) => finding.severity === 'error');

  /**
   * Every shape a real lint run is green over at a module root, each with the
   * finding the layer branch used to produce for it. Restated here rather than
   * derived, so removing one from `analyze` turns exactly one case red.
   */
  const SILENT: [string, Partial<ImportRef>][] = [
    // package-ownership, LAYER level: the layer `owns` bans ride the layer
    // entries, and this file is under none of them. The message this used to
    // emit read `not importable from "Fighter.jsx"` — the defect that named the
    // ticket.
    ['a package a LAYER owns', { specifier: 'zustand', names: ['create'] }],
    // The next three are one fact: `blueprint/relative-escape` never registers
    // here, so all three of the verdicts reachable at a root are lint-green.
    ['a relative path that leaves the module', { specifier: '../Combat/index' }],
    ['a relative path that escapes the source root', { specifier: '../../outside/thing' }],
    // The sharpest of them: the ALIAS spelling of this same reach IS banned, on
    // this module's own entry, and is asserted red below. One reach, two
    // spellings, and only one of them expressible as a pattern.
    ['the root reaching past its own unit\'s entry, relatively', { specifier: './hooks/useRun/internals' }],
    // The three layer-keyed judgments that were already off, kept here so a
    // repair that reopens the zone wholesale cannot pass: the root composes the
    // layers, so it may reach every one of them and is above all of them.
    ['the module\'s own alias root', { specifier: '~app/Fighter' }],
    ['a declared layer through a unit\'s entry', { specifier: '~app/Fighter/hooks/useRun' }],
    ['a re-export of a layer that is selfOnly to another', { specifier: '~app/Fighter/hooks/useRun', isExport: true }],
    // The declared edge through its entry — legal whichever way the guard is
    // written, and here so the cases above cannot pass on a fixture that simply
    // reports nothing.
    ['the declared edge through its entry', { specifier: '~app/Combat' }],
  ];

  it.each(SILENT)('stays silent on %s at the root', (_label, ref) => {
    expect(errorsFor(ROOT, ref)).toEqual([]);
  });

  /**
   * The other half, and it carries as much: everything the module's own entry
   * DOES ban still bites at the root. A repair that answers the zone with
   * silence passes the table above and fails every row here.
   */
  const SPEAKS: [string, Partial<ImportRef>, string, string][] = [
    ['a reach past its own unit\'s entry through the alias', { specifier: '~app/Fighter/components/Ship/internals' }, 'deep-import', 'reaches inside a unit'],
    ['a reach past a declared dependency\'s entry', { specifier: '~app/Combat/hooks/useDamage' }, 'deep-import', 'reaches inside module "Combat"'],
    ['an undeclared edge', { specifier: '~app/Shared' }, 'undeclared-dependency', 'reaches module "Shared", which "Fighter" does not declare'],
    ['a pass-through', { specifier: '~app/Combat', isExport: true }, 'module-reexport', 'Re-exports "Combat" through this module\'s own surface'],
    ['a package another MODULE owns', { specifier: 'rot-js' }, 'package-ownership', 'is owned by module Combat — not importable from "Fighter"'],
  ];

  it.each(SPEAKS)('still reports %s at the root', (_label, ref, rule, text) => {
    const errors = errorsFor(ROOT, ref);

    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe(rule);
    expect(errors[0].message).toContain(text);
  });

  it('names a module or a unit in every message it emits there, never the file', () => {
    // The repair stated as its own outcome: the filename does not disappear
    // from the sentence, the judgment that had nothing but a filename to put
    // there disappears. Asked of every message at once, so a judgment added to
    // this zone later has to answer it too.
    const messages = SPEAKS
      .flatMap(([, ref]) => errorsFor(ROOT, ref))
      .map((entry) => entry.message);

    expect(messages).toHaveLength(SPEAKS.length);

    for (const message of messages) expect(message).not.toContain('Fighter.jsx');
  });

  it('answers a LAYER file in the same module the other way, on the same imports', () => {
    // The control that makes the silences above a statement about the zone
    // rather than about the config: a layer entry governs this file, so the two
    // layer-keyed judgments the root loses are exactly the two it keeps.
    const owns = errorsFor(['Fighter', 'components', 'Ship', 'index.jsx'], {
      specifier: 'zustand',
      names: ['create'],
    });

    expect(owns).toHaveLength(1);
    expect(owns[0].rule).toBe('package-ownership');
    expect(owns[0].message).toContain('is owned by hooks — not importable from "components"');

    const escape = errorsFor(LAYER, { specifier: '../../../Combat/index' });

    expect(escape).toHaveLength(1);
    expect(escape[0].rule).toBe('module-escape');
  });
});

/**
 * The same misreading one folder over: `Fighter/Fighter.jsx` and
 * `scratch/notes.js` have the same shape, and the depth test that recognised the
 * first recognised the second too. Nothing governs a top folder no `modules`
 * entry declares — the layer globs and the module entries are both expanded from
 * the declared list — so a lint run there is green by construction.
 *
 * `undeclared-module` reports the folder, at the level that can act on it, and
 * its own message says "lint stays green throughout". Two errors under it in the
 * same report, on a file that same lint run says nothing about, made that
 * sentence read as the tool contradicting itself three lines later — and the
 * pass-through one told a folder that is not a module about "this module's own
 * surface".
 */
describe('analyze · a file at root depth under an undeclared top folder', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'Combat', does: 'bullets', owns: ['rot-js'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder', owns: ['zustand'] },
      ],
    },
  });

  const errorsFor = (ref: Partial<ImportRef>): Finding[] =>
    analyze(
      { topDirs: ['Fighter', 'Combat', 'scratch'], files: [file(['scratch', 'notes.js'], [ref])] },
      modular,
    ).filter((finding) => finding.severity === 'error' && finding.rule !== 'undeclared-module');

  it.each([
    ['a package a layer owns', { specifier: 'zustand', names: ['create'] }],
    ['a package another module owns', { specifier: 'rot-js' }],
    ['a pass-through', { specifier: '~app/Combat', isExport: true }],
    ['a reach past a unit\'s entry', { specifier: '~app/scratch/hooks/useX/impl' }],
    ['a relative path leaving the folder', { specifier: '../Combat/index' }],
  ])('says nothing about %s there, matching the lint run', (_label, ref) => {
    expect(errorsFor(ref)).toEqual([]);
  });

  it('still reports the folder itself, which is the level that can act on it', () => {
    const findings = analyze(
      { topDirs: ['Fighter', 'Combat', 'scratch'], files: [file(['scratch', 'notes.js'])] },
      modular,
    );

    const undeclared = findings.find((finding) => finding.rule === 'undeclared-module');

    expect(undeclared?.path).toBe('src/scratch');
    // The sentence the two findings above used to contradict, in the same report.
    expect(undeclared?.message).toContain('lint stays green throughout');
  });
});

/**
 * One level below the case above, where the shape that fooled the pass is not a
 * root's depth but a layer's NAME. `scratch/hooks/useX/index.js` carries
 * `hooks` at layer depth, and the layer globs are expanded over the DECLARED
 * module list — `src/Fighter/hooks/…`, `src/Combat/hooks/…` — so no emitted
 * entry reaches this path at any depth. The per-file pass read the name anyway
 * and judged the file by that layer's rules.
 *
 * The lint side is green here for a different reason than it is at a root, and
 * the difference matters: `blueprint/relative-escape` DOES open on this file's
 * segment at layer depth — `hooks` is a declared layout key. What is missing is
 * any entry whose `files` reaches the path, so no rule runs at all. There is no
 * lint-side hole at this position; a folder `modules` does not declare is
 * ungoverned by design, which is what `undeclared-module` says three lines up.
 */
describe('analyze · a layer NAME under an undeclared top folder is not that layer', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets', owns: ['rot-js'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', owns: ['clsx'] },
        { name: 'hooks', does: 'state', layout: 'folder', owns: ['zustand'] },
        {
          name: 'services',
          does: 'data access',
          layout: 'folder',
          allowedImporters: [{ layer: 'hooks', selfOnly: true }],
        },
      ],
    },
  });

  const TOP = ['Fighter', 'Combat', 'scratch'];
  const UNIT = ['hooks', 'useX', 'index.js'];

  const errorsAt = (top: string, ref: Partial<ImportRef>): Finding[] =>
    analyze({ topDirs: TOP, files: [file([top, ...UNIT], [ref])] }, modular)
      .filter((finding) => finding.severity === 'error' && finding.rule !== 'undeclared-module');

  /** The importing module's own name, so one row addresses either tree. */
  const at = (top: string, ref: Partial<ImportRef>): Partial<ImportRef> => ({
    ...ref,
    specifier: (ref.specifier as string).replace('{top}', top),
  });

  /**
   * Every judgment the layer branch could reach from this position, one row per
   * rule id and per branch that produces it — each specifier chosen to yield
   * exactly one finding, so a row that stops firing inside a declared module is
   * a row that went silent rather than one that moved.
   *
   * `undeclared-dependency` is deliberately absent: `crossModuleEdge` looks the
   * IMPORTING module up and has answered null on an undeclared folder since it
   * was written. It was already right, so a row for it would assert nothing
   * about this repair.
   */
  const JUDGMENTS: [string, Partial<ImportRef>, string][] = [
    ['a package a LAYER owns', { specifier: 'clsx' }, 'package-ownership'],
    ['a package another MODULE owns', { specifier: 'rot-js' }, 'package-ownership'],
    ['a reach past a unit\'s entry through the alias', { specifier: '~app/{top}/services/Api/impl' }, 'deep-import'],
    ['a same-layer import through the alias', { specifier: '~app/{top}/hooks/useY' }, 'flow-violation'],
    ['an import of a layer this one may not reach', { specifier: '~app/{top}/components/Card' }, 'flow-violation'],
    ['a re-export of a layer that is selfOnly here', { specifier: '~app/{top}/services/Api', isExport: true }, 'selfonly-reexport'],
    ['a reach up to the folder root through the alias', { specifier: '~app/{top}' }, 'root-import'],
    ['a pass-through of another module', { specifier: '~app/Combat', isExport: true }, 'module-reexport'],
    ['a relative path leaving the module', { specifier: '../../../Combat/index' }, 'module-escape'],
    ['a relative path escaping the source root', { specifier: '../../../../outside/thing' }, 'src-escape'],
    ['a relative path past a sibling unit\'s entry', { specifier: '../useY/impl' }, 'entry-bypass'],
    ['a relative path leaving the layer', { specifier: '../../services/Api' }, 'layer-escape'],
  ];

  it.each(JUDGMENTS)(
    'says nothing about %s there, and still reports it inside a declared module',
    (_label, ref, rule) => {
      expect(errorsAt('scratch', at('scratch', ref))).toEqual([]);

      // The control in the same run: without it every row above passes on a
      // fixture that reports nothing anywhere, which is what a repair that
      // silences the layer zone wholesale would look like.
      const inside = errorsAt('Fighter', at('Fighter', ref));

      expect(inside).toHaveLength(1);
      expect(inside[0].rule).toBe(rule);
    },
  );

  it('still reports the folder itself, and the message that used to contradict', () => {
    const findings = analyze(
      { topDirs: TOP, files: [file(['scratch', ...UNIT])] },
      modular,
    );

    const undeclared = findings.find((finding) => finding.rule === 'undeclared-module');

    expect(undeclared?.path).toBe('src/scratch');
    // The sentence twelve findings inside that folder used to contradict.
    expect(undeclared?.message).toContain('lint stays green throughout');

    // And it is the only error left about anything under that folder.
    expect(findings.filter((finding) => finding.severity === 'error')).toHaveLength(1);
  });
});

/**
 * `no-entry`'s unit branch asked whether the segment at layer depth was a
 * declared layer NAME, while the module branch it shares a rule id with has
 * asked `modules` since it was written. One id, two levels, two readings — so
 * the unit branch reported inside a folder `modules` does not declare, and
 * inside a `layers: false` module whose own opt-out says a folder sharing a
 * layer's name is not that layer.
 *
 * Neither position is one an adopter can act on the way the message asks: no
 * glob reaches the first, and the second's module is netted entire by its own
 * entry.
 */
describe('analyze · a unit needs an entry only where a layer entry reaches it', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'app', does: 'routing only', layers: false },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  // The folder's own `index` is in every tree, so the MODULE-level branch of
  // this same rule id is satisfied and every finding below is the unit branch's.
  const noEntryAt = (segments: string[]): Finding[] =>
    analyze(
      {
        topDirs: ['Fighter', 'app', 'scratch'],
        files: [file([segments[0], 'index.js']), file(segments)],
      },
      modular,
    ).filter((finding) => finding.rule === 'no-entry');

  it.each([
    ['under a top folder `modules` does not declare', ['scratch', 'hooks', 'useX', 'thing.js']],
    ['inside a `layers: false` module, which nets the module entire', ['app', 'hooks', 'useX', 'thing.js']],
  ])('asks for no unit entry %s', (_label, segments) => {
    expect(noEntryAt(segments)).toEqual([]);
  });

  it('still asks for one inside a declared module\'s declared layer', () => {
    const found = noEntryAt(['Fighter', 'hooks', 'useX', 'thing.js']);

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('src/Fighter/hooks/useX');
    expect(found[0].message).toContain('Unit "Fighter/hooks/useX" has no "index" entry');
  });

  it('still asks for one on a flat project, where the layer is the top folder', () => {
    // The arm with no module list to consult: `depth` is 0 there, so the layer
    // sits at segment 0 and the same predicate answers `layer`.
    const found = analyze(scanOf([file(['components', 'Button', 'Button.ts'])]), bp)
      .filter((finding) => finding.rule === 'no-entry');

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('src/components/Button');
  });
});

/**
 * The both-ways pin for this zone, and it is a different mechanism from the two
 * the root zone needed. There, the lint side answers by a `paths` ban and by a
 * rule that declines to register. Here the rule WOULD register — `hooks` is a
 * declared layout key wherever it appears — and every ban is inert for one
 * reason only: no emitted entry's `files` reaches the path.
 *
 * So the pin is read off those globs, through the same `globToRegExp` the
 * coverage net runs on: `analyze` speaks at exactly the paths some emitted
 * entry reaches, and is silent at exactly the paths none of them do.
 */
describe('analyze · this zone is pinned to the globs emitLint emits', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'Combat', does: 'bullets', owns: ['rot-js'] },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const nets = emitLint(modular)
    .flatMap((entry) => entry.files ?? [])
    .map((glob) => globToRegExp(glob));

  const governed = (segments: string[]): boolean =>
    nets.some((net) => net.test(['src', ...segments].join('/')));

  const speaks = (segments: string[]): boolean =>
    analyze(
      {
        topDirs: ['Fighter', 'Combat', 'scratch'],
        files: [file(segments, [{ specifier: 'rot-js' }])],
      },
      modular,
    ).some((finding) => finding.rule === 'package-ownership');

  // One import, judged at four positions. `rot-js` is a MODULE's `owns`, which
  // rides every entry a module's files sit under — the root's and the layers' —
  // so it is a violation at every position an emitted entry reaches, and the
  // only thing that can vary is whether an entry reaches it.
  it.each([
    ['a declared module\'s layer unit', ['Fighter', 'hooks', 'useX', 'index.js']],
    ['a declared module\'s own root', ['Fighter', 'Fighter.jsx']],
    ['a layer NAME under an undeclared top folder', ['scratch', 'hooks', 'useX', 'index.js']],
    ['a file directly under an undeclared top folder', ['scratch', 'notes.js']],
  ])('answers %s exactly as the emitted globs reach it', (_label, segments) => {
    expect(speaks(segments)).toBe(governed(segments));
  });

  it('compared something — the globs reach two of those positions and not the other two', () => {
    // …and cannot pass on a net list that matched everything or nothing, which
    // is the way an equality between two derived booleans goes quiet.
    expect(governed(['Fighter', 'hooks', 'useX', 'index.js'])).toBe(true);
    expect(governed(['Fighter', 'Fighter.jsx'])).toBe(true);
    expect(governed(['scratch', 'hooks', 'useX', 'index.js'])).toBe(false);
    expect(governed(['scratch', 'notes.js'])).toBe(false);
  });
});

/**
 * The root zone's own both-ways pin, and it needs its own because #212's — the
 * `emitLint` equality above — reads the CROSS-MODULE axis alone, off the
 * `no-restricted-imports` group patterns. Neither judgment this zone lost is on
 * that axis: a layer's `owns` rides `paths`/`patterns` derived from the LAYER
 * list, and the relative family has no pattern at all.
 *
 * So the two halves are pinned to two different emitted things, because the lint
 * side answers them by two different mechanisms — and both are read out of
 * `emitLint`'s own output rather than restated, which is the only way pinning a
 * SILENCE means anything.
 */
describe('analyze · the root zone is pinned to what emitLint emits for it', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot' },
        { name: 'Combat', does: 'bullets', owns: ['rot-js'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder', owns: ['zustand'] },
      ],
    },
  });

  const emitted = emitLint(modular);

  /** The entry whose `files` is a module's OWN — `src/<M>/*`, never a layer's. */
  const entryFor = (module: string) =>
    emitted.find((entry) =>
      (entry.files ?? []).some((glob) => new RegExp(`^src/${module}/\\*\\.\\{`).test(glob)));

  const packagesBannedOn = (module: string): string[] => {
    const setting = entryFor(module)?.rules?.['no-restricted-imports'];

    if (!Array.isArray(setting)) return [];

    const { paths = [] } = setting[1] as { paths?: { name: string }[] };

    return paths.map((path) => path.name).sort();
  };

  const ownershipAt = (segments: string[], specifier: string): string[] =>
    analyze({ topDirs: ['Fighter', 'Combat'], files: [file(segments, [{ specifier }])] }, modular)
      .filter((finding) => finding.rule === 'package-ownership')
      .map((finding) => finding.subject);

  it.each(['zustand', 'rot-js'])('answers %s at the root exactly as that entry bans it', (pkg) => {
    // Both ways: the package is a finding if and only if the module's own entry
    // carries a `paths` ban for it. `zustand` is a LAYER's and is on no module
    // entry; `rot-js` is Combat's and is on Fighter's.
    const banned = packagesBannedOn('Fighter').includes(pkg);

    expect(ownershipAt(['Fighter', 'Fighter.jsx'], pkg)).toEqual(banned ? [pkg] : []);
  });

  it('compared something — the bans that entry actually carries', () => {
    // …and cannot pass on a lookup that found no entry at all. A module's own
    // entry carries the OTHER owners' packages at its own level and nothing
    // from the layer level.
    expect(packagesBannedOn('Fighter')).toEqual(['rot-js']);
    expect(packagesBannedOn('Combat')).toEqual([]);
  });

  /**
   * The relative half. There is no pattern to compare against — the lint side
   * answers this by a rule that declines to register — so the pin runs the real
   * rule, with the options `emitLint` emitted, and compares its report count to
   * `analyze`'s finding count on the same import at the same path.
   */
  const escapeOptions = () => {
    const entry = emitted.find((item) => item.rules?.['blueprint/relative-escape'] !== undefined);
    const setting = entry?.rules?.['blueprint/relative-escape'];

    return (setting as [string, Record<string, unknown>])[1];
  };

  const linter = new Linter({ configType: 'flat' });

  const lintReports = (filename: string, specifier: string): number =>
    linter.verify(
      `import x from ${JSON.stringify(specifier)};\nexport default x;\n`,
      {
        files: ['**'],
        plugins: { blueprint: plugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'blueprint/relative-escape': ['error', escapeOptions()] },
      },
      { filename },
    ).length;

  const inspectReports = (segments: string[], specifier: string): number =>
    analyze({ topDirs: ['Fighter', 'Combat'], files: [file(segments, [{ specifier }])] }, modular)
      .filter((finding) => finding.rule.endsWith('-escape') || finding.rule === 'entry-bypass')
      .length;

  it.each([
    ['leaves the module', ['Fighter', 'Fighter.jsx'], '../Combat/index'],
    ['escapes the source root', ['Fighter', 'Fighter.jsx'], '../../outside/thing'],
    ['reaches past a unit\'s entry', ['Fighter', 'Fighter.jsx'], './hooks/useRun/internals'],
    // The control, at the one position where both gates speak — without it every
    // row above passes on a rule that never reports anywhere.
    ['leaves the module from a layer file', ['Fighter', 'hooks', 'useRun', 'index.js'], '../../../Combat/index'],
  ])('agrees with the emitted rule about a relative path that %s', (_label, segments, specifier) => {
    expect(inspectReports(segments, specifier)).toBe(
      lintReports(['src', ...segments].join('/'), specifier),
    );
  });

  it('compared something — the rule speaks at one of those positions and not the other', () => {
    expect(lintReports('src/Fighter/hooks/useRun/index.js', '../../../Combat/index')).toBe(1);
    expect(lintReports('src/Fighter/Fighter.jsx', '../Combat/index')).toBe(0);
  });
});

describe('analyze · a layer-level note under modules is addressed where an adopter can act', () => {
  // Both notes below address a LAYER, and a layer under `modules` lives at
  // `src/<Module>/<layer>` in every module — it has no single folder. `src/hooks`
  // is not merely absent: a top-level folder holding source is an undeclared
  // module, so the only action that address suggests trades this `info` for an
  // `error` and governs nothing.
  const modular = (sourceRoot?: string) => defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot,
      modules: [
        { name: 'GameStage', does: 'the run' },
        { name: 'Combat', does: 'bullets', owns: ['rbush'] },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', owns: ['zustand'] },
        { name: 'contexts', does: 'wiring', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
      ],
    },
  });

  // One file, inside a declared module, in neither `hooks` nor `contexts`: enough
  // for the selfOnly note to fire (the scan is not a scaffold, the layer is empty)
  // without making either layer inhabited.
  const notesFor = (sourceRoot?: string) =>
    analyze(
      {
        topDirs: ['GameStage', 'Combat'],
        files: [file(['GameStage', 'components', 'Ship', 'index.tsx'])],
      },
      modular(sourceRoot),
      [],
    );

  const noteOf = (rule: string, sourceRoot?: string) =>
    notesFor(sourceRoot).find((entry) => entry.rule === rule);

  it('addresses a layer\'s owns note at the source root, and forbids the folder that would satisfy it', () => {
    const note = notesFor().find(
      (entry) => entry.rule === 'owns-not-installed' && entry.subject === 'zustand',
    );

    expect(note?.path).toBe('src');
    // The constraint stated as itself rather than as one example of it:
    // `undeclared-module` judges the directories INSIDE the source root, so any
    // address below the root is one it could reach, and the root is not.
    expect(note?.path.startsWith('src/')).toBe(false);
    expect(note?.message).toContain('Layer "hooks" owns "zustand"');
    expect(note?.message).toContain('a layer inside each one rather than a folder of its own');
    // The plausible non-fix, named and refused. An agent reading a note at `src`
    // about `hooks` creates `src/hooks`, which is the one move that makes this
    // worse — so the reason travels in the same line as the address.
    expect(note?.message).toContain('Do not create `src/hooks`');
    expect(note?.message).toContain('undeclared module');
    expect(note?.severity).toBe('info');
  });

  it('addresses the declaratory selfOnly note by the same rule, in the same words', () => {
    // The same defect, one formula over: this note is measured at layer depth, so
    // it fires on a modular repo, and "it arms once code lands" is an instruction
    // to put code at the address it prints.
    const note = noteOf('declaratory-self-only');

    expect(note?.path).toBe('src');
    expect(note?.message).toContain('selfOnly on "contexts"');
    expect(note?.message).toContain('Do not create `src/contexts`');
    expect(note?.severity).toBe('info');
  });

  it('addresses the layer-absence note the same way, and names the layer in `subject`', () => {
    // This note sits beside the two above, in the same output, at the same path — so
    // `rule` and `path` are shared by all three and `subject` is the only field left
    // to tell them apart. One per layer nobody uses, in declaration order.
    const notes = notesFor().filter((entry) => entry.rule === 'missing-layer');

    expect(notes.map((entry) => `${entry.path} ${entry.subject}`))
      .toEqual(['src hooks', 'src contexts']);

    expect(notes[0].severity).toBe('info');
    expect(notes[0].message).toContain('holds no code in any module yet — runway, not a todo');
    expect(notes[0].message).toContain('Do not create `src/hooks`');
  });

  it('gives two selfOnly layers two identities, not one record written twice', () => {
    // #231 moved this note's path to the source root and left `subject` empty, which
    // gave both notes the same `rule` + `path` + `subject` — one baseline key for two
    // findings, and one line for two layers in every consumer that keys on identity.
    const twoSelfOnly = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        modules: [{ name: 'GameStage', does: 'the run' }],
        layers: [
          { name: 'components', does: 'UI' },
          { name: 'hooks', does: 'state', allowedImporters: [{ layer: 'components', selfOnly: true }] },
          { name: 'contexts', does: 'wiring', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
        ],
      },
    });

    const notes = analyze(
      { topDirs: ['GameStage'], files: [file(['GameStage', 'components', 'Ship.tsx'])] },
      twoSelfOnly,
    ).filter((entry) => entry.rule === 'declaratory-self-only');

    expect(notes.map((entry) => `${entry.rule}|${entry.path}|${entry.subject}`))
      .toEqual(['declaratory-self-only|src|hooks', 'declaratory-self-only|src|contexts']);
  });

  it('spells the source root the way the config does', () => {
    // `sourceRoot: '.'` puts the layers at the project root, so the note is
    // addressed there and the folder it forbids carries no prefix either.
    expect(noteOf('owns-not-installed', '.')?.path).toBe('.');
    expect(noteOf('declaratory-self-only', '.')?.message).toContain('Do not create `contexts`');
    expect(noteOf('missing-layer', '.')?.path).toBe('.');
    expect(noteOf('missing-layer', '.')?.message).toContain('Do not create `hooks`');
  });
});

describe('analyze · the module graph is live on a modular repo', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the ship', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  it('finds a cycle between two units inside one module', () => {
    // The acceptance that matters is that something FIRES: with the guard shut
    // the graph is empty, and an empty graph and a clean repo produce identical
    // output — a blind analyzer reads exactly like a healthy one.
    const findings = analyze(
      { topDirs: ['Fighter'], files: [
        file(['Fighter', 'hooks', 'useRun', 'index.ts'], [{ specifier: '../useTick' }]),
        file(['Fighter', 'hooks', 'useTick', 'index.ts'], [{ specifier: '../useRun' }]),
      ] },
      modular,
    );

    expect(findings.map((entry) => entry.rule)).toContain('cycle');
  });

  it('does NOT invent one from two modules\' same-named units', () => {
    // The collapse this ticket's key change removes: keyed without the module
    // segment both files became `hooks/useInput`, and a self-edge between them
    // is a cycle an adopter cannot reproduce — worse than a missing one.
    const findings = analyze(
      { topDirs: ['Fighter', 'Combat'], files: [
        file(['Fighter', 'hooks', 'useInput', 'index.ts'], [{ specifier: '~app/Combat' }]),
        file(['Combat', 'hooks', 'useInput', 'index.ts'], []),
      ] },
      modular,
    );

    expect(findings.map((entry) => entry.rule)).not.toContain('cycle');
  });
});

describe('analyze · undeclared-module and missing-module', () => {
  const modular = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run', imports: ['Combat', 'Session'] },
        { name: 'Combat', does: 'bullets', imports: ['Session'] },
        { name: 'Session', does: 'the run state' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const scanOfDirs = (dirs: string[], files: ScannedFile[]): ScanResult =>
    ({ topDirs: dirs, files });

  const find = (rule: string, scanResult: ScanResult) =>
    analyze(scanResult, modular).find((entry) => entry.rule === rule);

  it('reports an undeclared root as ungoverned, not merely unflagged', () => {
    const finding = find('undeclared-module', scanOfDirs(
      ['GameStage', 'Combat', 'Session', 'Achievements'],
      [file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [])],
    ));

    expect(finding?.severity).toBe('error');
    expect(finding?.path).toBe('src/Achievements');
    // The distinction the message exists to make: an agent whose loop ends at a
    // green lint never learns, because the globs are built FROM the declared list.
    expect(finding?.message).toContain('no glob matches inside this folder');
    expect(finding?.message).toContain('ungoverned rather than unflagged');
  });

  it('never says "undeclared layer" about a module', () => {
    // Read against `layerNames`, every module on a modular repo reports as an
    // undeclared layer — loud, and wrong about what the folder even is.
    const findings = analyze(
      scanOfDirs(['GameStage'], [file(['GameStage', 'hooks', 'useRun', 'index.ts'], [])]),
      modular,
    );

    expect(findings.map((entry) => entry.rule)).not.toContain('undeclared-folder');
  });

  it('names the legal interval when the edges bound it from both sides', () => {
    const finding = find('undeclared-module', scanOfDirs(
      ['GameStage', 'Combat', 'Session', 'Achievements'],
      [
        // Achievements reaches Session, so it must be declared before Session.
        file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [{ specifier: '~app/Session' }]),
        // GameStage reaches Achievements, so Achievements comes after GameStage.
        file(['GameStage', 'hooks', 'useRun', 'index.ts'], [{ specifier: '~app/Achievements' }]),
      ],
    ));

    expect(finding?.message).toContain('it reaches "Session"');
    expect(finding?.message).toContain('"GameStage" reaches it');
    expect(finding?.message).toContain('Any position after "GameStage" and before "Session" is legal');
    expect(finding?.message).toContain('the owner\'s call');
  });

  it('bounds from one side when only one side has edges', () => {
    const reachesOnly = find('undeclared-module', scanOfDirs(
      ['Combat', 'Achievements'],
      [file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [{ specifier: '~app/Combat' }])],
    ));

    // The separator belongs between two halves, and there is only one here —
    // a stray one reads as a second clause the message never wrote.
    expect(reachesOnly?.message).toContain('it reaches "Combat". Any position before "Combat"');

    const reachedOnly = find('undeclared-module', scanOfDirs(
      ['Combat', 'Achievements'],
      [
        file(['Achievements', 'hooks', 'useBadge', 'index.ts'], []),
        file(['Combat', 'hooks', 'useHit', 'index.ts'], [{ specifier: '~app/Achievements' }]),
      ],
    ));

    expect(reachedOnly?.message).toContain('"Combat" reaches it. Any position after "Combat"');
  });

  it('says exactly that, and stops, when there is no evidence', () => {
    const finding = find('undeclared-module', scanOfDirs(
      ['GameStage', 'Achievements'],
      [file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [])],
    ));

    expect(finding?.message).toContain('every position in the order is legal');
    // No interval invented from nothing — the outcome is silence about position.
    expect(finding?.message).not.toContain('Any position after');
    expect(finding?.message).not.toContain('Measured from its imports');
  });

  it('reports a contradiction as the finding, not as a position', () => {
    // Achievements reaches GameStage (so it must precede it) and Session
    // reaches Achievements (so it must follow Session, which is declared
    // last) — no ordering satisfies both.
    const finding = find('undeclared-module', scanOfDirs(
      ['GameStage', 'Session', 'Achievements'],
      [
        file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [{ specifier: '~app/GameStage' }]),
        file(['Session', 'hooks', 'useRun', 'index.ts'], [{ specifier: '~app/Achievements' }]),
      ],
    ));

    expect(finding?.message).toContain('Those edges contradict');
    expect(finding?.message).toContain('the decomposition needs changing, not the config');
    expect(finding?.message).not.toContain('is legal');
  });

  it('reads a relative cross-folder import as an edge too', () => {
    // The graph is folder-to-folder over both spellings — an inference that
    // only saw the alias form would answer "no evidence" for half the repos
    // that have the evidence.
    const finding = find('undeclared-module', scanOfDirs(
      ['Combat', 'Achievements'],
      [file(['Achievements', 'hooks', 'useBadge', 'index.ts'], [{ specifier: '../../../Combat' }])],
    ));

    expect(finding?.message).toContain('it reaches "Combat"');
  });

  it('reports a declared module with no folder as runway', () => {
    const finding = find('missing-module', scanOfDirs(['GameStage'], []));

    expect(finding?.severity).toBe('info');
    expect(finding?.message).toContain('runway, not a todo');
    expect(finding?.message).toContain('the owner\'s call');

    // And never in the layer's words. Asserted as the whole identity of every note in
    // that run rather than as the absence of a rule id: `missing-layer` IS in this
    // output now, once per layer no module uses, and what makes it right is that it
    // names a LAYER. An `not.toContain` here cannot tell the two apart.
    expect(analyze(scanOfDirs(['GameStage'], []), modular)
      .map((entry) => `${entry.rule}|${entry.path}|${entry.subject}`))
      .toEqual([
        'missing-module|src/Combat|',
        'missing-module|src/Session|',
        'missing-layer|src|hooks',
      ]);
  });
});

describe('analyze · a declared layer that no module uses', () => {
  const withModules = (list: ModuleDef[]) => defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: list,
      layers: [
        { name: 'components', does: 'UI' },
        { name: 'hooks', does: 'state' },
      ],
    },
  });

  const two: ModuleDef[] = [{ name: 'M1', does: 'one' }, { name: 'M2', does: 'two' }];

  // A routing module and an ordinary one: `app` opts out of the layer vocabulary, so
  // whatever its folders are called, no layer glob reaches inside them.
  const optOut: ModuleDef[] = [
    { name: 'app', does: 'routing', layers: false },
    { name: 'M1', does: 'one' },
  ];

  /** Every layer this run reported as used by no module, in the order reported. */
  const absent = (list: ModuleDef[], topDirs: string[], files: ScannedFile[]) =>
    analyze({ topDirs, files }, withModules(list))
      .filter((entry) => entry.rule === 'missing-layer')
      .map((entry) => entry.subject);

  it('reports it once for the layer, never once per module', () => {
    // The whole list, so a per-module implementation fails on the duplicate rather
    // than passing a `toContain` for the name it repeated.
    expect(absent(two, ['M1', 'M2'], [
      file(['M1', 'components', 'Card.ts']),
      file(['M2', 'components', 'Panel.ts']),
    ])).toEqual(['hooks']);
  });

  it('says nothing about a layer one module uses and another does not', () => {
    // Ordinary, and reporting it would be the per-module noise #231 rejected.
    expect(absent(two, ['M1', 'M2'], [
      file(['M1', 'components', 'Card.ts']),
      file(['M1', 'hooks', 'useX.ts']),
      file(['M2', 'components', 'Panel.ts']),
    ])).toEqual([]);
  });

  it('never counts a `layers: false` module as use, and still counts every other', () => {
    // Both directions in one run: `app/components` does not make `components` used —
    // nothing there answers to a layer glob — and `M1/hooks` does make `hooks` used,
    // so the opt-out narrows the judgment without disabling it.
    expect(absent(optOut, ['app', 'M1'], [
      file(['app', 'components', 'Home.tsx']),
      file(['M1', 'hooks', 'useX.ts']),
    ])).toEqual(['components']);
  });

  it('names the opted-out folder a reader can see, and stops there', () => {
    const note = analyze(
      {
        topDirs: ['app', 'M1'],
        files: [file(['app', 'hooks', 'useNav.ts']), file(['M1', 'components', 'Card.ts'])],
      },
      withModules(optOut),
    ).find((entry) => entry.rule === 'missing-layer');

    expect(note?.subject).toBe('hooks');
    // The bridge. "Holds no code in any module" beside a visible `src/app/hooks/` is
    // two truths with nothing joining them, which reads as the tool being wrong.
    expect(note?.message).toContain('Code under `src/app/hooks` is not counted');
    expect(note?.message).toContain('`layers: false` opts a module out of the layer vocabulary');

    // Explanatory, never corrective — and asserted as "the message ends here", since a
    // remedy sentence telling an adopter to drop `layers: false` would be appended and
    // would clear any `not.toContain` naming other words.
    expect(note?.message.endsWith('a folder sharing this layer\'s name is not this layer.'))
      .toBe(true);
  });

  it('leaves the clause out when no opted-out module holds the layer', () => {
    const note = analyze(
      { topDirs: ['M1', 'M2'], files: [file(['M1', 'components', 'Card.ts'])] },
      withModules(two),
    ).find((entry) => entry.rule === 'missing-layer');

    // The address explanation is the last thing in the message, so the clause above is
    // absent — again by where the text stops, not by naming phrases it avoids.
    expect(note?.message.endsWith(
      'a top-level folder holding source is an undeclared module, which `inspect` reports as '
      + 'an error and which governs nothing.',
    )).toBe(true);
  });

  it('fires on an empty tree too — there is deliberately no scan-size guard', () => {
    // `missing-layer` has never had one: on a flat project it fires on an empty tree
    // and always has, so a guard here would make one rule id behave two ways. And the
    // "this reads like a todo on a scaffold" problem was answered for THIS finding by
    // its second clause after field run #13, not by suppression — which is why
    // `declaratory-self-only`'s guard next door is not the precedent to copy.
    // Removing this is a decision, not a cleanup.
    expect(absent(two, [], [])).toEqual(['components', 'hooks']);
  });

  it('does not count an undeclared folder as use, and the same run says why', () => {
    const findings = analyze(
      {
        topDirs: ['M1', 'Achievements'],
        files: [
          file(['M1', 'components', 'Card.ts']),
          file(['Achievements', 'hooks', 'useBadge.ts']),
        ],
      },
      withModules([{ name: 'M1', does: 'one' }]),
    );

    expect(findings.filter((entry) => entry.rule === 'missing-layer').map((entry) => entry.subject))
      .toEqual(['hooks']);

    // The bridge asserted rather than assumed: the layer glob list is expanded from
    // the declared modules, so nothing in `Achievements` is reached by one — and the
    // reason an adopter needs is an error in the same output.
    expect(findings.filter((entry) => entry.rule === 'undeclared-module').map((entry) => entry.path))
      .toEqual(['src/Achievements']);
  });

  it('leaves a flat project\'s note exactly as it was', () => {
    const flat = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'UI' }, { name: 'hooks', does: 'state' }],
      },
    });

    // The whole run, and the whole message: "nothing was appended, `subject` did not
    // move, and no second note appeared" is a claim about the entire output, and a
    // pair of `not.toContain`s passes on any text that dodges two phrases.
    expect(analyze(
      { topDirs: ['components'], files: [file(['components', 'Card.ts'])] },
      flat,
    )).toEqual([{
      severity: 'info',
      rule: 'missing-layer',
      path: 'src/hooks',
      subject: '',
      message: 'Declared layer "hooks" has no folder yet — runway, not a todo: the rules arm when '
        + 'code lands; keeping it is the default, slimming is the owner\'s call.',
    }]);
  });
});

describe('analyze · a selfOnly ban is armed only by files a layer glob reaches', () => {
  // Two selfOnly layers, one of them armed in every fixture below, so each run answers
  // both halves: the list of layers reported declaratory separates "the empty one" from
  // "every selfOnly one", which is what an implementation that never measures returns.
  const withModules = (list: ModuleDef[]) => defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: list,
      layers: [
        { name: 'hooks', does: 'state' },
        { name: 'stores', does: 'state', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
        { name: 'contexts', does: 'wiring', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
      ],
    },
  });

  const two: ModuleDef[] = [{ name: 'M1', does: 'one' }, { name: 'M2', does: 'two' }];

  // `app` opts out of the layer vocabulary, so `resolveModuleLayerFiles` emits no glob
  // inside it and `app/contexts` is not the `contexts` layer however it is spelled.
  const optOut: ModuleDef[] = [
    { name: 'app', does: 'routing', layers: false },
    { name: 'M1', does: 'one' },
  ];

  /** Every layer this run called declaratory, in the order reported. */
  const declaratory = (list: ModuleDef[], topDirs: string[], files: ScannedFile[]) =>
    analyze({ topDirs, files }, withModules(list))
      .filter((entry) => entry.rule === 'declaratory-self-only')
      .map((entry) => entry.subject);

  it('fires when the only folder of that name sits in a `layers: false` module', () => {
    // `app/contexts` arms nothing — no glob reaches it — while `M1/stores` really does arm
    // its layer. The whole list, so counting the opt-out as a holder fails here instead of
    // passing a `toContain` for the name it kept.
    expect(declaratory(optOut, ['app', 'M1'], [
      file(['app', 'contexts', 'x.ts']),
      file(['M1', 'stores', 'session.ts']),
    ])).toEqual(['contexts']);
  });

  it('fires when the only folder of that name sits in an undeclared module', () => {
    const findings = analyze(
      {
        topDirs: ['Rogue', 'M1'],
        files: [file(['Rogue', 'contexts', 'x.ts']), file(['M1', 'stores', 'session.ts'])],
      },
      withModules([{ name: 'M1', does: 'one' }]),
    );

    expect(findings.filter((entry) => entry.rule === 'declaratory-self-only')
      .map((entry) => entry.subject)).toEqual(['contexts']);

    // The reason asserted rather than assumed: the layer globs are expanded from the
    // declared module list, so nothing under `Rogue` is reached by one — and the error
    // saying so is in the same output.
    expect(findings.filter((entry) => entry.rule === 'undeclared-module')
      .map((entry) => entry.path)).toEqual(['src/Rogue']);
  });

  it('says nothing once a declared, layer-bearing module holds the layer', () => {
    // The case that stops the whole suite passing on "always fires": nothing here is
    // reported, and an empty list is a claim about the entire run.
    expect(declaratory(two, ['M1', 'M2'], [
      file(['M1', 'contexts', 'x.ts']),
      file(['M1', 'stores', 'session.ts']),
    ])).toEqual([]);
  });

  it('needs one real holder, not every module', () => {
    // `M1` arms the ban; `app` opting out alongside it changes nothing. Counting the
    // opt-out apart is what keeps this direction and the first case from colliding.
    expect(declaratory(optOut, ['app', 'M1'], [
      file(['M1', 'contexts', 'x.ts']),
      file(['app', 'contexts', 'y.ts']),
      file(['M1', 'stores', 'session.ts']),
    ])).toEqual([]);
  });

  it('leans on `missing-layer` to explain the folder a reader can see', () => {
    const findings = analyze(
      {
        topDirs: ['app', 'M1'],
        files: [file(['app', 'contexts', 'x.ts']), file(['M1', 'stores', 'session.ts'])],
      },
      withModules(optOut),
    );

    // This note says "the layer holds no files" while `src/app/contexts/` is on disk, and
    // it carries no join for that — #240's clause on `missing-layer` does. The reliance is
    // a checked property, not an assumption: both notes in ONE run, at one address, naming
    // one layer. If either half moves, this note stops explaining the visible folder.
    expect(findings.filter((entry) => entry.rule === 'declaratory-self-only')
      .map((entry) => `${entry.path} ${entry.subject}`)).toEqual(['src contexts']);

    const bridge = findings.find(
      (entry) => entry.rule === 'missing-layer' && entry.subject === 'contexts',
    );

    expect(bridge?.path).toBe('src');
    expect(bridge?.message).toContain('Code under `src/app/contexts` is not counted');
  });

  it('stays quiet on an empty modular tree — the scan-size guard is the difference', () => {
    // The guard carries more weight than it did: this measurement reports an empty tree
    // and a tree whose only files are outside the layer vocabulary identically, so the
    // guard is now the only thing telling a scaffold from the first case above. Asserted
    // beside the layer notes that DO fire, so a fixture that produced nothing at all
    // could not pass this.
    const findings = analyze({ topDirs: [], files: [] }, withModules(two));

    expect(findings.filter((entry) => entry.rule === 'declaratory-self-only')).toEqual([]);

    expect(findings.filter((entry) => entry.rule === 'missing-layer').map((entry) => entry.subject))
      .toEqual(['hooks', 'stores', 'contexts']);
  });

  it('leaves a flat project\'s output byte-identical', () => {
    const flat = defineBlueprint({
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'hooks', does: 'state' },
          { name: 'contexts', does: 'wiring', allowedImporters: [{ layer: 'hooks', selfOnly: true }] },
        ],
      },
    });

    // The whole run and the whole message: "unchanged" is a claim about every field and
    // every character, and a `toContain` on a phrase or two passes on a message that
    // moved elsewhere — a spliced opt-out clause among them.
    expect(analyze({ topDirs: ['hooks'], files: [file(['hooks', 'useX.ts'])] }, flat)).toEqual([
      {
        severity: 'info',
        rule: 'missing-layer',
        path: 'src/contexts',
        subject: '',
        message: 'Declared layer "contexts" has no folder yet — runway, not a todo: the rules arm '
          + 'when code lands; keeping it is the default, slimming is the owner\'s call.',
      },
      {
        severity: 'info',
        rule: 'declaratory-self-only',
        path: 'src/contexts',
        subject: '',
        message: 'selfOnly on "contexts" (importer(s): hooks) is declaratory — the layer holds no '
          + 'files, so the re-export ban cannot fire yet; it arms once code lands. The '
          + 'no-restricted-syntax ENTRY is emitted today, on the importer layer(s) named above, so '
          + 'it is already exposed to a merge: IF a second no-restricted-syntax scoped to one of '
          + 'those layers exists, flat config merges neither into the other — the later entry '
          + 'replaces the earlier, silently, with lint still green. That condition is the whole '
          + 'note. Adopting into a single generated config, there is no second entry, so there is '
          + 'nothing here to act on. "Cannot fire" is about the ban, not about the entry. Check '
          + '`blueprint rules --json` for the emit points before merging.',
      },
    ]);
  });
});

describe('analyze · the position hint is measured, not approximated', () => {
  const four = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'App', does: 'first', imports: ['Boss', 'Combat', 'Session'] },
        { name: 'Boss', does: 'second', imports: ['Combat', 'Session'] },
        { name: 'Combat', does: 'third', imports: ['Session'] },
        { name: 'Session', does: 'last' },
      ],
      layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
    },
  });

  const hint = (files: ScannedFile[], dirs: string[]) =>
    analyze({ topDirs: dirs, files }, four)
      .find((entry) => entry.rule === 'undeclared-module')?.message ?? '';

  it('counts only declared modules as evidence', () => {
    // Two undeclared folders reaching each other says nothing about where
    // either sits among the declared ones — reported, it reads as a bound.
    const message = hint([
      file(['Achievements', 'hooks', 'a', 'index.ts'], [{ specifier: '~app/Trophies' }]),
      file(['Trophies', 'hooks', 't', 'index.ts'], []),
    ], ['App', 'Boss', 'Combat', 'Session', 'Achievements', 'Trophies']);

    expect(message).not.toContain('Trophies');
    expect(message).toContain('every position in the order is legal');
  });

  it('names the reached modules in a stable order', () => {
    // Insertion order follows the file's import order, so an unsorted list
    // reshuffles the message on an unrelated edit.
    const message = hint([
      file(['Achievements', 'hooks', 'a', 'index.ts'], [
        { specifier: '~app/Session' },
        { specifier: '~app/Combat' },
      ]),
    ], ['App', 'Boss', 'Combat', 'Session', 'Achievements']);

    expect(message).toContain('it reaches "Combat", "Session"');
  });

  it('joins both halves of the evidence with a separator', () => {
    const message = hint([
      file(['Achievements', 'hooks', 'a', 'index.ts'], [{ specifier: '~app/Session' }]),
      file(['Boss', 'hooks', 'b', 'index.ts'], [{ specifier: '~app/Achievements' }]),
    ], ['App', 'Boss', 'Combat', 'Session', 'Achievements']);

    expect(message).toContain('it reaches "Session"; "Boss" reaches it.');
  });

  it('keeps an interval of exactly one slot legal', () => {
    // `Boss` reaches it and it reaches `Combat`, which are adjacent — one slot
    // between them, and it is a position, not a contradiction. The off-by-one
    // here reports a legal decomposition as a broken one.
    const message = hint([
      file(['Achievements', 'hooks', 'a', 'index.ts'], [{ specifier: '~app/Combat' }]),
      file(['Boss', 'hooks', 'b', 'index.ts'], [{ specifier: '~app/Achievements' }]),
    ], ['App', 'Boss', 'Combat', 'Session', 'Achievements']);

    expect(message).toContain('Any position after "Boss" and before "Combat" is legal');
    expect(message).not.toContain('contradict');
  });

  it('calls a mutual import a contradiction', () => {
    // The tightest one: the same module on both sides. It must be declared
    // before Achievements and after it, which nothing satisfies.
    const message = hint([
      file(['Achievements', 'hooks', 'a', 'index.ts'], [{ specifier: '~app/Combat' }]),
      file(['Combat', 'hooks', 'c', 'index.ts'], [{ specifier: '~app/Achievements' }]),
    ], ['App', 'Boss', 'Combat', 'Session', 'Achievements']);

    expect(message).toContain('Those edges contradict');
    expect(message).not.toContain('is legal');
  });
});

describe('analyze · a wrong structure choice is one finding, not N', () => {
  const modular = reactPreset({ structure: 'modular' });
  const flat = reactPreset();
  const MODULES = modular.architecture.modules?.map((module) => module.name) ?? [];
  const FLAT_LAYERS = flat.architecture.layers.map((layer) => layer.name);

  const scanOfDirs = (dirs: string[], files: ScannedFile[]): ScanResult =>
    ({ topDirs: dirs, files });

  const bridges = (scanResult: ScanResult, blueprint: Blueprint) =>
    analyze(scanResult, blueprint).filter((entry) => entry.rule === 'structure-mismatch');

  const ruleCount = (scanResult: ScanResult, blueprint: Blueprint, rule: string) =>
    analyze(scanResult, blueprint).filter((entry) => entry.rule === rule).length;

  // Direction 1, the tree the ticket measured: three flat layer folders under
  // `reactPreset({ structure: 'modular' })`.
  const flatTree = scanOfDirs(
    ['components', 'hooks', 'services'],
    [file(['components', 'A.tsx']), file(['hooks', 'useB.ts']), file(['services', 'api.ts'])],
  );

  // Direction 2, its mirror: two domain folders under a flat preset.
  const modularTree = scanOfDirs(
    ['Fighter', 'Combat'],
    [file(['Fighter', 'index.ts']), file(['Combat', 'index.ts'])],
  );

  it('states what is declared, measures both halves, and names an edit that exists', () => {
    const found = bridges(flatTree, modular);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'error', path: 'src', subject: '' });
    // The declared structure is a fact and is stated as one; what the tree "looks
    // like" is `survey`'s classifier, which sits above inspect and is not reachable.
    expect(found[0].message).toContain('declares a modular structure (`architecture.modules`)');
    expect(found[0].message).toContain('3 of 3 top-level source folder(s) under `src` undeclared');

    expect(found[0].message)
      .toContain(`${MODULES.length} of ${MODULES.length} declared module(s) with no folder`);

    expect(found[0].message).toContain(`That is one finding, not ${3 + MODULES.length}`);
    // The line the reader can find. `init` writes no `structure` field for flat, so
    // an instruction to SET `structure: 'flat'` addresses a line nobody wrote —
    // which is why this direction says drop, and says why there is nothing to add.
    expect(found[0].message).toContain('drop `structure: \'modular\'` from the preset call');

    expect(found[0].message)
      .toContain('flat is the default, so there is no `structure: \'flat\'` to write in its place');

    // The question only the owner can answer, with a path for each answer.
    expect(found[0].message).toContain('If these folders are layers rather than modules');
    expect(found[0].message).toContain('If they are modules, the config is right');
    expect(found[0].message).toContain('never an adopting agent\'s');
  });

  it('lands on line one, above the evidence it is built from', () => {
    const findings = analyze(flatTree, modular);
    const rendered = report(findings);

    // A reader acts on the first message they meet, which is the defect this
    // bridge repairs — printed under the lines it explains it explains nothing.
    // `report` prints in array order, and `analyze`'s severity sort is stable.
    expect(findings[0].rule).toBe('structure-mismatch');

    expect(rendered.indexOf('[structure-mismatch]'))
      .toBeLessThan(rendered.indexOf('[undeclared-module]'));

    expect(rendered.indexOf('[structure-mismatch]'))
      .toBeLessThan(rendered.indexOf('[missing-module]'));
  });

  it('keeps every per-folder finding — they are the evidence, not a duplicate', () => {
    expect(ruleCount(flatTree, modular, 'undeclared-module')).toBe(3);
    expect(ruleCount(flatTree, modular, 'missing-module')).toBe(MODULES.length);
  });

  it('mirrors, and the mirror speaks from its own side of the token set', () => {
    const found = bridges(modularTree, flat);

    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('declares a flat structure (no `architecture.modules`)');
    expect(found[0].message).toContain('2 of 2 top-level source folder(s) under `src` undeclared');

    expect(found[0].message)
      .toContain(`${FLAT_LAYERS.length} of ${FLAT_LAYERS.length} declared layer(s) with no folder`);

    expect(found[0].message).toContain('add `structure: \'modular\'` to the preset call');
    expect(found[0].message).toContain('If these folders are modules rather than layers');

    // One text, two token sets. Read from the wrong branch, every assertion above
    // still passes on whatever the two directions share — so the vocabulary this
    // direction must NOT be speaking is the half worth pinning.
    expect(found[0].message).not.toContain('module(s) with no folder');
    expect(found[0].message).not.toContain('drop `structure: \'modular\'`');

    expect(ruleCount(modularTree, flat, 'undeclared-folder')).toBe(2);
    expect(ruleCount(modularTree, flat, 'missing-layer')).toBe(FLAT_LAYERS.length);
  });

  it('says nothing about ordinary drift — two of three folders undeclared', () => {
    const drift = scanOfDirs(
      ['app', 'components', 'hooks'],
      [
        file(['app', 'pages', 'Home.tsx']),
        file(['components', 'A.tsx']),
        file(['hooks', 'useB.ts']),
      ],
    );

    expect(bridges(drift, modular)).toHaveLength(0);
    // "No bridge" only means something while the findings that would have fed it
    // are still reported — a rule that silenced them would pass the line above.
    expect(ruleCount(drift, modular, 'undeclared-module')).toBe(2);
    expect(ruleCount(drift, modular, 'missing-module')).toBe(1);
  });

  it('says nothing about a correct structure carrying one stray folder', () => {
    const stray = scanOfDirs(
      ['app', 'common', 'junk'],
      [
        file(['app', 'pages', 'Home.tsx']),
        file(['common', 'hooks', 'useX.ts']),
        file(['junk', 'j.ts']),
      ],
    );

    expect(bridges(stray, modular)).toHaveLength(0);
    expect(ruleCount(stray, modular, 'undeclared-module')).toBe(1);
  });

  it('refuses the Vite shape, where "every folder undeclared" is 0 of 0', () => {
    const vite = scanOfDirs([], [file(['main.tsx']), file(['App.tsx'])]);

    expect(bridges(vite, modular)).toHaveLength(0);
    // Both halves of all-and-all really are satisfied here, which is why the floor
    // is what this case asserts: every declared module is absent, and the
    // undeclared side is vacuous. Unguarded, the rule tells an adopter their
    // one-minute-old correct modular config does not match its own tree.
    expect(ruleCount(vite, modular, 'missing-module')).toBe(MODULES.length);
  });

  it('refuses an empty tree, whichever structure the config declares', () => {
    expect(bridges(scanOfDirs([], []), modular)).toHaveLength(0);
    expect(bridges(scanOfDirs([], []), flat)).toHaveLength(0);
  });

  it('counts folders that hold SOURCE, not directory entries', () => {
    // `dropTestFiles` runs before this pass, so `components` holds nothing the rule
    // can read. Floored on `topDirs` instead, a folder every layer glob already
    // exempts would satisfy the denominator on its own.
    const testsOnly = scanOfDirs(['components'], [file(['components', 'A.test.ts'])]);

    expect(bridges(testsOnly, modular)).toHaveLength(0);
  });

  it('withdraws the moment one declared folder exists, source or not', () => {
    // The price of having no threshold, accepted rather than fixed: `app` is on
    // disk holding nothing, so the absent side is no longer every declared module
    // and the bridge goes quiet — while the per-folder findings report it all.
    const halfBuilt = scanOfDirs(['app', 'components'], [file(['components', 'A.tsx'])]);

    expect(bridges(halfBuilt, modular)).toHaveLength(0);
    expect(ruleCount(halfBuilt, modular, 'undeclared-module')).toBe(1);
    expect(ruleCount(halfBuilt, modular, 'missing-module')).toBe(1);
  });

  it('fires at one folder against one, and prints the ratio that says so', () => {
    // Any floor above one is the guess about someone else's repo this rule refuses
    // to make, so the mitigation is the ratio rather than a threshold: a reader
    // sees the whole of the evidence in the sentence and can weigh it.
    const single = scanOfDirs(['components'], [file(['components', 'A.tsx'])]);
    const found = bridges(single, modular);

    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('1 of 1 top-level source folder(s)');
    expect(found[0].message).not.toMatch(/\ball\b/i);
  });
});
