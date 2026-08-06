import { describe, expect, it } from 'vitest';

import { analyze, detectCycle, detectCycles } from './analyze';
import { defineBlueprint } from '../config';
import { vuePreset } from '../presets';
import type { ImportRef, ScanResult, ScannedFile } from './types';

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

    expect(note).toMatchObject({ severity: 'info', path: 'src/contexts' });
    expect(note?.message).toContain('cannot fire yet');
    expect(note?.message).toContain('hooks');

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
    expect(from('../..')).toContain('relative-escape');
    expect(from('../../../outside')).toContain('relative-escape');
    expect(from('./helper')).toEqual([]);
  });

  it('says which kind of escape it found, since all three share one rule id', () => {
    // Three verdicts, three different fixes — use the alias, import the entry,
    // extract to a lower layer. They all report under `relative-escape`, so a
    // suite reading only the id cannot tell whether the right one was chosen.
    const messageFor = (specifier: string): string | undefined =>
      analyze(scanOf([file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }])]), bp)
        .find((finding) => finding.rule === 'relative-escape')?.message;

    expect(messageFor('../../../outside')).toContain('escapes src/');
    expect(messageFor('../Card/internals')).toContain('reaches past a sibling');
    expect(messageFor('../../hooks/useX')).toContain('leaves this layer');
  });

  // The lint rule and this finding read the same `relativeVerdict`, so a
  // sibling's entry is legal to both and reaching past it is illegal to both.
  // They disagreed once — same `../Sibling`, one gate green, one red — with no
  // test placed to see it, which is why these two assertions sit together.
  it('allows a sibling entry but not what is behind it', () => {
    expect(from('../Card')).toEqual([]);
    expect(from('../Card/internals')).toContain('relative-escape');
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
});

describe('analyze · flat layout', () => {
  const flat = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [{ name: 'a', does: '' }, { name: 'b', does: '' }],
      module: { layout: 'flat', entry: 'index', private: [] },
    },
  });

  it('skips deep-import and no-entry, but still flags cross-module relative imports', () => {
    const found = analyze(
      { topDirs: ['a', 'b'], files: [file(['a', 'x.ts'], [{ specifier: '../b/y' }])] },
      flat,
    ).map((finding) => finding.rule);

    expect(found).toContain('relative-escape');
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
        { name: 'resources', does: '', module: { layout: 'folder', entry: 'main' } },
        { name: 'services', does: '' },
      ],
      module: { layout: 'flat', entry: 'index', private: [] },
    },
  });

  const rules = (files: ScannedFile[]) =>
    analyze({ topDirs: ['pages', 'resources', 'services'], files }, mixed)
      .map((finding) => finding.rule);

  it('judges deep imports by the target layer layout', () => {
    // Into the folder layer: deep. Into a flat layer: not.
    expect(rules([file(['pages', 'Home.ts'], [{ specifier: '~app/resources/matches/impl' }])]))
      .toContain('deep-import');

    expect(rules([file(['pages', 'Home.ts'], [{ specifier: '~app/services/api/client' }])]))
      .not.toContain('deep-import');
  });

  it('applies no-entry only to folder-layout layers, honoring the entry override', () => {
    expect(rules([file(['resources', 'matches', 'main.ts'])])).not.toContain('no-entry');
    expect(rules([file(['resources', 'matches', 'list.ts'])])).toContain('no-entry');
    // Nested files in a flat layer never demand an entry.
    expect(rules([file(['services', 'api', 'client.ts'])])).not.toContain('no-entry');
  });

  it('judges relative escapes per layer: module-bound in folder, layer-bound in flat', () => {
    // Folder layer: leaving the module (even to a sibling module) escapes.
    expect(
      rules([file(['resources', 'matches', 'main.ts'], [{ specifier: '../markets/board' }])]),
    ).toContain('relative-escape');

    // Flat layer: relatives roam the whole layer freely.
    expect(
      rules([file(['services', 'api', 'client.ts'], [{ specifier: '../ws/socket' }])]),
    ).not.toContain('relative-escape');
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
        module: { layout: 'folder', entry: 'index.d', private: [] },
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
