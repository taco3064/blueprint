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

  it('flags relative imports that leave the module or escape src', () => {
    expect(from('../Card')).toContain('relative-escape');
    expect(from('../..')).toContain('relative-escape');
    expect(from('../../../outside')).toContain('relative-escape');
    expect(from('./helper')).toEqual([]);
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
