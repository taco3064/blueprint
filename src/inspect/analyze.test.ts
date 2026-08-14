import { describe, expect, it } from 'vitest';

import { analyze, detectCycle, detectCycles } from './analyze';
import { crossModuleTarget } from './resolve';
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
    expect(axios?.message).toContain('runway, not a todo');
    // Both resolutions named, neither prescribed — the same doctrine as
    // missing-layer, which this tier and wording follow.
    expect(axios?.message).toContain('owner\'s call');
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

  it('flags a same-layer import through the alias, across modules too', () => {
    expect(modularRules([
      file(['Fighter', 'components', 'Ship', 'index.tsx'], [
        { specifier: '~app/Combat/components/Bullet' },
      ]),
    ])).toContain('flow-violation');
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

  it('governs the module root\'s own imports, in both spellings', () => {
    // Judged by the layer test alone the root is skipped — its segment at the
    // layer position is a filename — and the module's own composition code
    // becomes the least examined code in the module.
    expect(modularRules([
      file(['Fighter', 'Fighter.tsx'], [{ specifier: '~app/Fighter/components/Ship/internals' }]),
    ])).toContain('deep-import');

    expect(modularRules([
      file(['Fighter', 'Fighter.tsx'], [{ specifier: './components/Ship/internals' }]),
    ])).toContain('entry-bypass');

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

  it('names the restricted imports in the subject, so two are two debts', () => {
    // The names are part of the identity, not just of the sentence: one file
    // importing two restricted names from one package is two debts with two
    // fixes, and the baseline keys on the subject.
    const owning = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'GameStage', does: 'the run', imports: ['Combat'] },
          { name: 'Combat', does: 'bullets', owns: [{ package: 'rbush', imports: ['insert'] }] },
        ],
      },
    });

    const [finding] = analyze(
      modularScan([file(['GameStage', 'hooks', 'useRun', 'index.ts'], [
        { specifier: 'rbush', names: ['insert'] },
      ])]),
      owning,
    ).filter((entry) => entry.rule === 'package-ownership');

    expect(finding.subject).toBe('rbush insert');
    expect(finding.message).toContain('(insert)');
  });

  it('leaves a module-owned package alone inside its owner', () => {
    expect(findingsFor([
      file(['Combat', 'hooks', 'useDamage', 'index.ts'], [{ specifier: 'rbush' }]),
    ]).map((entry) => entry.rule)).not.toContain('package-ownership');
  });

  it('notes a module owns entry whose package is not installed', () => {
    // Same tier and doctrine as the layer-level note: declaring ownership
    // before the install is the legitimate order.
    const note = findingsFor([], []).find((entry) => entry.rule === 'owns-not-installed');

    expect(note?.subject).toBe('rbush');
    expect(note?.severity).toBe('info');
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

    // And never in the layer's words.
    expect(analyze(scanOfDirs(['GameStage'], []), modular).map((entry) => entry.rule))
      .not.toContain('missing-layer');
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
