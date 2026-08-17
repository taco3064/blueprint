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

describe('analyze · owns declared ahead of the install', () => {
  // The vue preset owns `vue` and `pinia` on hooks, `vue` on contexts, and
  // `axios` plus two globals on services.
  const ownsFrom = (deps?: string[]) =>
    analyze(scanOf([]), bp, deps).filter((finding) => finding.rule === 'owns-not-installed');

  it('notes each owns package absent from the dependency list', () => {
    const found = ownsFrom(['vue']);

    expect(found.map((finding) => finding.subject).sort()).toEqual(['axios', 'pinia']);

    const axios = found.find((finding) => finding.subject === 'axios');

    // The bare layer name, not `src/services`: the remedy is package.json or the
    // declaration, never a folder, and under a modular blueprint the same layer
    // has one folder per module. See `primitiveOwners`.
    expect(axios).toMatchObject({ severity: 'info', path: 'services' });
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
      .toEqual(['hooks', 'contexts']);
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
    expect(found[0]).toMatchObject({ subject: 'zustand', path: 'hooks' });
  });

  it('answers a pattern owner with the dependencies that pattern reaches', () => {
    const grouped = (deps: string[]) => analyze(
      scanOf([], ['services']),
      defineBlueprint({
        framework: 'react',
        architecture: {
          alias: '~app',
          layers: [
            { name: 'services', does: 'net', owns: [{ package: '@scope/*', pattern: true }] },
          ],
        },
      }),
      deps,
    ).filter((finding) => finding.rule === 'owns-not-installed');

    // A group name is never a key in package.json, so `includes` reported this
    // forever — including on a repo that had installed exactly what it names.
    expect(grouped(['@scope/foo'])).toEqual([]);
    // The same reach the emitted ban has: under a match as well as at it.
    expect(grouped(['@scope/foo/bar'])).toEqual([]);
    expect(grouped(['@other/foo'])).toHaveLength(1);

    // And the note says what is absent — "not in package.json" is true of the
    // group's own spelling whether or not the group is satisfied, so it would
    // read as a fact about the wrong thing.
    const [note] = grouped([]);

    expect(note.message).toContain('owns "@scope/*", which no dependency in package.json matches');
    expect(note.message).toContain('Installing a package it reaches');
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

  it('flags a deep import into a folder', () => {
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
      analyze(
        scanOf([
          file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }]),
        ]),
        bp,
      )
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
    expect(
      rulesFor(
        [file(['utils', 'x.ts'], [{ specifier: '~app/services/api' }])],
        [...LAYERS, 'utils'],
      ),
    )
      .not.toContain('flow-violation');
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
        scanOf([
          file(['components', 'Btn', 'index.ts'], [{ specifier, names: [], isExport: false }]),
        ]),
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
