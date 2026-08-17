import { describe, expect, it } from 'vitest';

import { analyze } from './analyze';
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

  it('warns when a folder has no entry file, but not when it does', () => {
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

describe('analyze · flat layout', () => {
  const flat = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [{ name: 'a', does: '' }, { name: 'b', does: '' }],
      folder: { layout: 'flat', entry: 'index', private: [] },
    },
  });

  it('skips deep-import and no-entry, but still flags cross-folder relative imports', () => {
    const found = analyze(
      { topDirs: ['a', 'b'], files: [file(['a', 'x.ts'], [{ specifier: '../b/y' }])] },
      flat,
    ).map((finding) => finding.rule);

    expect(found).toContain('relative-escape');
    expect(found).not.toContain('deep-import');
    expect(found).not.toContain('no-entry');
  });
});

describe('analyze · per-layer folder layout', () => {
  const mixed = defineBlueprint({
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'pages', does: '' },
        { name: 'resources', does: '', folder: { layout: 'folder', entry: 'main' } },
        { name: 'services', does: '' },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
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

  it('judges relative escapes per layer: folder-bound in folder, layer-bound in flat', () => {
    // Folder layer: leaving the folder (even to a sibling folder) escapes.
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
    // Three severities from one scan: a folder with no entry (warn), a banned
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

describe('analyze · the depth that makes a folder', () => {
  const specifierRules = (specifier: string) =>
    analyze(
      scanOf([
        file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }]),
      ]),
      bp,
    )
      .map((finding) => finding.rule)
      .filter((rule) => rule !== 'declaratory-self-only');

  it('does not read a file sitting directly in a layer as a folder', () => {
    // `components/Button.ts` is a file IN the layer, not a feature folder. It has
    // no entry to be missing, and demanding one sends the reader to write an
    // index for a single file.
    expect(rulesFor([file(['components', 'Button.ts'])])).not.toContain('no-entry');
  });

  it('needs a third segment before an import reaches inside a folder', () => {
    // `~app/hooks/useX` IS the entry. Reporting it as a deep import tells the
    // reader to import through an entry they already used.
    expect(specifierRules('~app/hooks/useX')).not.toContain('deep-import');
    expect(specifierRules('~app/hooks/useX/impl')).toContain('deep-import');
  });

  it('judges depth only for targets that are declared layers', () => {
    // `nope` is not a layer, so its folder shape is unknown and the shared
    // fallback would read any deep path as reaching inside one. The
    // undeclared-folder rule owns that case instead.
    expect(specifierRules('~app/nope/x/y')).not.toContain('deep-import');
  });
});

describe('analyze · what counts as a folder entry', () => {
  it('accepts an entry sitting beside other files in the folder', () => {
    // A folder is normally more than its entry. Requiring EVERY file to be the
    // entry reports a missing entry on a folder that has one.
    expect(rulesFor([
      file(['components', 'Card', 'index.ts']),
      file(['components', 'Card', 'helper.ts']),
    ])).not.toContain('no-entry');
  });

  it('wants the entry directly in the folder, not nested below it', () => {
    // `components/Card/index/x.ts` puts a folder called `index` inside the
    // folder. That is not an entry file, and accepting it as one silences the
    // warning on a folder nothing can import.
    expect(rulesFor([file(['components', 'Card', 'index', 'x.ts'])])).toContain('no-entry');
  });

  it('strips only the last extension when reading a filename', () => {
    // `index.d.ts` is a declaration file, not the folder entry — stripping both
    // extensions turns it into one and the folder reads as importable.
    expect(rulesFor([file(['components', 'Card', 'index.d.ts'])])).toContain('no-entry');
  });
});

describe('analyze · an entry name that holds a dot', () => {
  it('strips only the last extension, so a dotted entry still matches', () => {
    // `entry: 'index.d'` is a legal declaration and `index.d.ts` is then its
    // entry file. Stripping both extensions turns that filename into `index`,
    // which no longer matches what was declared — the folder reads as having no
    // entry at all, and the fix suggested is to add the file that is right there.
    const dotted = defineBlueprint({
      ...bp,
      architecture: {
        ...bp.architecture,
        folder: { layout: 'folder', entry: 'index.d', private: [] },
      },
    });

    const found = analyze(scanOf([file(['components', 'Card', 'index.d.ts'])]), dotted)
      .map((finding) => finding.rule);

    expect(found).not.toContain('no-entry');
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
