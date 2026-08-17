import { describe, expect, it } from 'vitest';

import { analyze } from './analyze';
import { defineBlueprint } from '../config';
import type { Blueprint } from '../config';
import type { ImportRef, ScanResult, ScannedFile } from './types';

/**
 * `analyze` under `architecture.modules` — the folder depth AC15 measures, and
 * the import depth that went silent with it.
 *
 * The fixture is the one stage 4 was measured on: `App` keeps the shared layers
 * nested inside it, `common` holds its files directly (`layers: false`) and
 * narrows its importers to App, selfOnly. Two modules is the whole point — one
 * cannot show a cross-module edge at all.
 */
const modular = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'ui' },
      { name: 'hooks', does: 'state' },
    ],
    modules: [
      { name: 'App', does: 'the game shell' },
      {
        name: 'common',
        does: 'shared helpers',
        layers: false,
        allowedImporters: [{ module: 'App', selfOnly: true }],
      },
    ],
    folder: { layout: 'folder', entry: 'index', private: [] },
  },
});

/** The same layers with no `modules` block — the flat reading of the same tree. */
const flat = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: modular.architecture.layers,
    folder: { layout: 'folder', entry: 'index', private: [] },
  },
});

function file(segments: string[], imports: Partial<ImportRef>[] = []): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: imports.map((ref) => ({ specifier: '', names: [], isExport: false, ...ref })),
  };
}

function scanOf(files: ScannedFile[], topDirs: string[] = ['App', 'common']): ScanResult {
  return { topDirs, files };
}

/** The AC15 fixture's own files: both modules complete, both entries present. */
const DECLARED: ScannedFile[] = [
  file(['App', 'index.tsx']),
  file(['App', 'components', 'Board', 'index.tsx']),
  file(['App', 'hooks', 'useGame', 'index.ts']),
  file(['common', 'index.ts']),
  file(['common', 'clamp.ts']),
];

const rulesFor = (files: ScannedFile[], blueprint: Blueprint = modular, topDirs?: string[]) =>
  analyze(scanOf(files, topDirs), blueprint).map((finding) => finding.rule);

/** The fixture with one module's files removed — the "declared, not built yet" tree. */
const without = (module: string): ScannedFile[] =>
  DECLARED.filter((entry) => entry.segments[0] !== module);

describe('AC15 · a declared module\'s own folder is never undeclared-folder', () => {
  it('reports zero on the 2-module fixture — not fewer, zero', () => {
    const found = analyze(scanOf(DECLARED), modular)
      .filter((finding) => finding.rule === 'undeclared-folder');

    expect(found).toEqual([]);
  });

  it('reads the identical tree as 2 undeclared folders once `modules` is dropped', () => {
    // The before half of AC15's own measurement, in the same instrument as the
    // after half: the defect was never in the tree, only in what read it.
    const found = analyze(scanOf(DECLARED), flat)
      .filter((finding) => finding.rule === 'undeclared-folder')
      .map((finding) => finding.path);

    expect(found).toEqual(['src/App', 'src/common']);
  });

  it('leaves the whole fixture clean — no finding of any severity', () => {
    expect(analyze(scanOf(DECLARED), modular)).toEqual([]);
  });
});

describe('analyze · declarations with no folder yet, at the module depth', () => {
  it('says missing-module at info tier, in missing-layer\'s own runway wording', () => {
    const note = analyze(scanOf(without('common'), ['App']), modular)
      .find((finding) => finding.rule === 'missing-module');

    expect(note).toMatchObject({ severity: 'info', path: 'src/common', subject: '' });

    expect(note?.message).toBe(
      'Declared module "common" has no folder yet — runway, not a todo: the rules arm when '
      + 'code lands; keeping it is the default, slimming is the owner\'s call.',
    );
  });

  it('never aims undeclared-folder at a declared module that is simply not built yet', () => {
    const found = rulesFor(without('common'), modular, ['App']);

    expect(found).not.toContain('undeclared-folder');
  });

  it('asks missing-layer inside the module, not at the source root', () => {
    const note = analyze(
      scanOf([file(['App', 'index.tsx']), file(['App', 'components', 'B', 'index.tsx']),
        ...DECLARED.filter((f) => f.segments[0] === 'common')]),
      modular,
    ).find((finding) => finding.rule === 'missing-layer');

    expect(note).toMatchObject({ severity: 'info', path: 'src/App/hooks' });
    expect(note?.message).toContain('Declared layer "App/hooks" has no folder yet');
  });

  it('stays quiet about the layers of a module with no folder at all', () => {
    // `missing-module` already said it; repeating it once per declared layer is
    // one absence counted `layers.length` times.
    const found = analyze(scanOf([], []), modular).map((finding) => finding.rule);

    expect(found).toEqual(['missing-module', 'missing-module']);
  });

  it('asks nothing about layers inside a module that declares none', () => {
    const paths = analyze(scanOf(DECLARED), modular)
      .filter((finding) => finding.rule === 'missing-layer')
      .map((finding) => finding.path);

    expect(paths).toEqual([]);
  });
});

describe('analyze · a top-level folder the modular structure does not declare', () => {
  it('names the module axis, and points at architecture.modules', () => {
    const found = analyze(
      scanOf([...DECLARED, file(['utils', 'helper.ts'])], ['App', 'common', 'utils']),
      modular,
    ).find((finding) => finding.rule === 'undeclared-folder');

    expect(found).toMatchObject({ severity: 'error', path: 'src/utils' });

    expect(found?.message).toBe(
      '"utils" is not a declared module — declare it in architecture.modules, or move its code '
      + 'into a folder of an existing module.',
    );
  });

  it('tells a declared LAYER sitting at the root that declaring it is not the fix', () => {
    // `validateModuleName` rejects a module named after a layer, so "declare it"
    // — the flat message's own next step — is advice the config cannot take.
    const found = analyze(
      scanOf([...DECLARED, file(['hooks', 'useX', 'index.ts'])], ['App', 'common', 'hooks']),
      modular,
    ).find((finding) => finding.rule === 'undeclared-folder');

    expect(found?.path).toBe('src/hooks');
    expect(found?.message).toContain('is a declared layer, not a module');
    expect(found?.message).toContain('e.g. "App/hooks"');
    expect(found?.message).toContain('may not share a layer\'s name');
  });

  it('names a module that keeps the layers, never one that opted out of them', () => {
    // `common` is declared first and holds its files directly — nesting a
    // `hooks/` folder inside it puts the code in that module's single net,
    // where the hooks layer's own rules never arm.
    const layerlessFirst = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'common', does: 'shared helpers', layers: false },
          { name: 'App', does: 'the game shell' },
        ],
      },
    });

    const found = analyze(
      scanOf([...DECLARED, file(['hooks', 'useX', 'index.ts'])], ['App', 'common', 'hooks']),
      layerlessFirst,
    ).find((finding) => finding.rule === 'undeclared-folder');

    expect(found?.message).toContain('e.g. "App/hooks"');
  });

  it('has no destination to name when every module holds its files directly', () => {
    const allLayerless = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [
          { name: 'App', does: 'the game shell', layers: false },
          { name: 'common', does: 'shared helpers', layers: false },
        ],
      },
    });

    const found = analyze(
      scanOf([file(['hooks', 'useX', 'index.ts'])], ['hooks']),
      allLayerless,
    ).find((finding) => finding.rule === 'undeclared-folder');

    expect(found?.message).toContain('every module here declares layers: false');
    expect(found?.message).toContain('drop layers: false from the one that should carry');
    expect(found?.message).not.toContain('e.g.');
  });

  it('asks the same question one level inside a layered module', () => {
    const found = analyze(scanOf([...DECLARED, file(['App', 'utils', 'x.ts'])]), modular)
      .find((finding) => finding.rule === 'undeclared-folder');

    expect(found).toMatchObject({ path: 'src/App/utils' });

    expect(found?.message).toBe(
      '"App/utils" is not a declared layer — declare it, or move its code into a folder of an '
      + 'existing layer.',
    );
  });

  it('leaves a `layers: false` module\'s own subfolders alone', () => {
    // Nothing inside it is a layer by construction, so every folder there is the
    // module's own business — and the emitted net covers the whole subtree.
    expect(rulesFor([...DECLARED, file(['common', 'math', 'clamp.ts'])]))
      .not.toContain('undeclared-folder');
  });
});

describe('analyze · a module has an entry for the same reason a folder does', () => {
  const withoutAppEntry = DECLARED.filter((entry) => entry.path !== 'src/App/index.tsx');

  it('warns when nothing outside the module can reach it', () => {
    const found = analyze(scanOf(withoutAppEntry), modular)
      .find((finding) => finding.rule === 'no-entry');

    expect(found).toMatchObject({ severity: 'warn', path: 'src/App' });

    expect(found?.message).toBe(
      'Module "App" has no "index" entry — nothing is importable from outside it; another '
      + 'module can reach it only there.',
    );
  });

  it('honors a module\'s own entry override', () => {
    const renamed = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        modules: [{ name: 'App', does: 'shell', entry: 'App' }, modular.architecture.modules![1]],
      },
    });

    expect(rulesFor([...withoutAppEntry, file(['App', 'App.tsx'])], renamed))
      .not.toContain('no-entry');
  });

  it('still asks the question of a feature folder nested inside a module', () => {
    const found = analyze(
      scanOf([...DECLARED, file(['App', 'components', 'Card', 'card.tsx'])]),
      modular,
    ).find((finding) => finding.rule === 'no-entry');

    expect(found).toMatchObject({ path: 'src/App/components/Card' });
    expect(found?.message).toContain('Folder "App/components/Card" has no "index" entry');
  });

  it('leaves the question to missing-module while the folder holds nothing', () => {
    expect(rulesFor([], modular, [])).not.toContain('no-entry');
  });
});

describe('analyze · a selfOnly ban is declaratory per net, not per layer', () => {
  const selfOnly = { layer: 'components', selfOnly: true };

  /** `hooks` is reachable from `components` but must never be re-exported by it. */
  const guarded = defineBlueprint({
    ...modular,
    architecture: {
      ...modular.architecture,
      layers: [
        { name: 'components', does: 'ui' },
        { name: 'hooks', does: 'state', allowedImporters: [selfOnly] },
      ],
      modules: [
        { name: 'App', does: 'the game shell' },
        { name: 'Lobby', does: 'matchmaking' },
      ],
    },
  });

  const LOBBY = [
    file(['Lobby', 'index.tsx']),
    file(['Lobby', 'components', 'Seat', 'index.tsx']),
  ];

  const declaratoryIn = (files: ScannedFile[], topDirs: string[]) =>
    analyze(scanOf(files, topDirs), guarded)
      .filter((finding) => finding.rule === 'declaratory-self-only');

  it('says nothing while the layer holds files one depth in', () => {
    expect(declaratoryIn(DECLARED.filter((entry) => entry.segments[0] === 'App'), ['App']))
      .toEqual([]);
  });

  it('addresses the module the layer is blank in, not a source-root folder', () => {
    // `src/hooks` is the address `undeclared-folder` tells a modular repo to
    // move out of the source root — a note cannot send a reader there.
    const [note, ...rest] = declaratoryIn(LOBBY, ['Lobby']);

    expect(rest).toEqual([]);
    expect(note).toMatchObject({ severity: 'info', path: 'src/Lobby/hooks', subject: '' });
    expect(note.message).toContain('selfOnly on "Lobby/hooks" (importer(s): Lobby/components)');
  });

  it('is armed in one module and blank in its sibling, and says which', () => {
    const both = [...DECLARED.filter((entry) => entry.segments[0] === 'App'), ...LOBBY];

    expect(declaratoryIn(both, ['App', 'Lobby']).map((finding) => finding.path))
      .toEqual(['src/Lobby/hooks']);
  });

  it('leaves the question to missing-module for a module with no folder at all', () => {
    expect(declaratoryIn(LOBBY, ['Lobby']).map((finding) => finding.path))
      .not.toContain('src/App/hooks');
  });

  it('keeps the flat structure asking it once, at the bare layer name', () => {
    const guardedFlat = defineBlueprint({
      ...flat,
      architecture: {
        ...flat.architecture,
        layers: [
          { name: 'components', does: 'ui' },
          { name: 'hooks', does: 'state', allowedImporters: [selfOnly] },
        ],
      },
    });

    const found = analyze(
      scanOf([file(['components', 'Board', 'index.tsx'])], ['components']),
      guardedFlat,
    ).filter((finding) => finding.rule === 'declaratory-self-only');

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('src/hooks');
    expect(found[0].message).toContain('selfOnly on "hooks" (importer(s): components)');
  });
});

describe('analyze · owns declared on a module', () => {
  const owning = defineBlueprint({
    ...modular,
    architecture: {
      ...modular.architecture,
      modules: [
        { name: 'App', does: 'shell', owns: ['zustand'] },
        modular.architecture.modules![1],
      ],
    },
  });

  it('reports a module\'s uninstalled package against the module\'s own folder', () => {
    const note = analyze(scanOf(DECLARED), owning, [])
      .find((finding) => finding.rule === 'owns-not-installed');

    expect(note).toMatchObject({ severity: 'info', path: 'src/App', subject: 'zustand' });
    expect(note?.message).toContain('Module "App" owns "zustand"');
  });

  it('cascades the module\'s ownership to every layer inside it, and bars a sibling module', () => {
    const inside = file(['App', 'components', 'Board', 'index.tsx'], [{ specifier: 'zustand' }]);
    const outside = file(['common', 'clamp.ts'], [{ specifier: 'zustand' }]);

    expect(rulesFor([...DECLARED, inside], owning)).not.toContain('package-ownership');

    const barred = analyze(scanOf([...DECLARED, outside]), owning)
      .find((finding) => finding.rule === 'package-ownership');

    expect(barred?.message).toContain('not importable from "common"');
  });

  it('names the net a barred file sits in, module and layer together', () => {
    const layerOwned = defineBlueprint({
      ...modular,
      architecture: {
        ...modular.architecture,
        layers: [
          { name: 'components', does: 'ui' },
          { name: 'hooks', does: 'state', owns: ['axios'] },
        ],
      },
    });

    const reaching = file(
      ['App', 'components', 'Board', 'axios.tsx'],
      [{ specifier: 'axios' }],
    );

    const found = analyze(scanOf([...DECLARED, reaching]), layerOwned)
      .find((finding) => finding.rule === 'package-ownership');

    expect(found?.message).toContain('not importable from "App/components"');
  });
});

describe('analyze · a directory finding carries the configured source root', () => {
  it('puts the root on every depth it reports at', () => {
    const rooted = defineBlueprint({
      ...modular,
      architecture: { ...modular.architecture, sourceRoot: 'app' },
    });

    const rootedFile = (segments: string[]): ScannedFile =>
      ({ path: ['app', ...segments].join('/'), segments, imports: [] });

    const paths = analyze(
      {
        topDirs: ['App', 'utils'],
        files: [
          rootedFile(['App', 'components', 'Card', 'card.tsx']),
          rootedFile(['utils', 'helper.ts']),
        ],
      },
      rooted,
    ).map((finding) => finding.path);

    expect(paths).toContain('app/utils');
    expect(paths).toContain('app/common');
    expect(paths).toContain('app/App/hooks');
    expect(paths).toContain('app/App/components/Card');
    expect(paths).toContain('app/App');
  });
});
