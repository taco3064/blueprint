import { describe, expect, it } from 'vitest';
import { layoutResolver } from '../boundary';
import type { ArchitectureDef } from '../config';
import { buildFolderGraph, buildModuleGraph, declaredTop, targetModuleKey } from './resolve';
import type { ModuleGraph } from './resolve';
import type { ImportRef, ScannedFile } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  layers: [
    { name: 'resources', does: 'feature modules', layout: 'folder' },
    { name: 'services', does: 'io', layout: 'folder', entry: 'service' },
    { name: 'utils', does: 'leaf helpers' },
  ],
};

const layoutOf = layoutResolver(architecture);

describe('targetModuleKey · which specifiers name a module', () => {
  const file = (segments: string[]): ScannedFile => ({ path: segments.join('/'), segments, imports: [] });
  const ref = (specifier: string): ImportRef => ({ specifier, names: [], isExport: false });

  it('answers null for a bare package specifier', () => {
    // A package name is neither aliased nor relative. Resolving it like a
    // relative path appends it to the importer's own folder, and `axios` becomes
    // the module `resources/axios` — a graph edge to a module that is not there,
    // counted in every blast radius and flow check.
    expect(
      targetModuleKey(ref('axios'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBeNull();

    // The two shapes that DO name a module still do.
    expect(
      targetModuleKey(ref('./parts/Cell'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['resources'], layoutOf),
    ).toBe('resources/Row');

    expect(
      targetModuleKey(ref('~app/services/api'), file(['resources', 'Row', 'Row.ts']), ['~app'], ['services'], layoutOf),
    ).toBe('services/api');
  });
});

describe('targetModuleKey · both spellings of one target', () => {
  const ref = (specifier: string) => ({ specifier, names: [], isExport: false });

  const from = {
    path: 'src/Fighter/hooks/useInput/useInput.ts',
    segments: ['Fighter', 'hooks', 'useInput', 'useInput.ts'],
    imports: [],
  };

  it('lands the alias and the relative form on one node', () => {
    // Given the offset to one arm only, the same file becomes two nodes and
    // the graph disagrees with itself about what a segment is.
    const alias = targetModuleKey(ref('~app/Combat'), from, ['~app'], ['hooks'], () => 'folder', 1);
    const rel = targetModuleKey(ref('../../../Combat'), from, ['~app'], ['hooks'], () => 'folder', 1);

    expect(alias).toBe('Combat');
    expect(rel).toBe('Combat');
  });

  it('reads a unit inside another module at the same offset', () => {
    expect(targetModuleKey(
      ref('~app/Combat/hooks/useDamage'), from, ['~app'], ['hooks'], () => 'folder', 1,
    )).toBe('Combat/hooks/useDamage');
  });

  it('keeps a flat project\'s answers', () => {
    const flat = { path: 'src/views/Home.ts', segments: ['views', 'Home.ts'], imports: [] };

    expect(targetModuleKey(ref('~app/hooks/useCart'), flat, ['~app'], ['hooks'], () => 'folder'))
      .toBe('hooks/useCart');

    // Not a declared layer — invisible to the graph, as it always was.
    expect(targetModuleKey(ref('~app/nope/x'), flat, ['~app'], ['hooks'], () => 'folder'))
      .toBeNull();
  });
});

describe('targetModuleKey · the alias root itself', () => {
  it('is not a node on a flat project', () => {
    // `~app` alone reaches the source root, which is not a layer and not a
    // module. The module-entry arm is guarded on depth for exactly this: read
    // without it, a bare alias becomes an empty-keyed node in every flat graph.
    const flat = { path: 'src/views/Home.ts', segments: ['views', 'Home.ts'], imports: [] };

    expect(targetModuleKey(
      { specifier: '~app', names: [], isExport: false },
      flat, ['~app'], ['views'], () => 'folder',
    )).toBeNull();
  });
});

describe('targetModuleKey · an undeclared layer inside a module', () => {
  it('is not a node — the layer test still runs at module depth', () => {
    // The module-entry arm is bounded by `parts.length <= depth`. Unbounded, a
    // specifier reaching any folder inside a module becomes a node, so a typo
    // like `~app/Combat/hoosk/x` joins the graph instead of being invisible to
    // it — and `deps` starts reporting a unit nobody wrote.
    const from = {
      path: 'src/Fighter/hooks/useInput/useInput.ts',
      segments: ['Fighter', 'hooks', 'useInput', 'useInput.ts'],
      imports: [],
    };

    expect(targetModuleKey(
      { specifier: '~app/Combat/hoosk/x', names: [], isExport: false },
      from, ['~app'], ['hooks'], () => 'folder', 1,
    )).toBeNull();
  });
});

describe('declaredTop · what occupies the graph\'s top level', () => {
  it('reads modules under `modules`, and layers only when there are none', () => {
    // The flip is what a reversed ternary gives, and it is invisible on either
    // half alone: a modular architecture HAS layers, so answering with them
    // returns a populated set that looks like an answer.
    expect([...declaredTop({
      alias: '~app',
      modules: [{ name: 'Fighter', does: 'the ship' }, { name: 'Combat', does: 'bullets' }],
      layers: [{ name: 'hooks', does: 'state' }],
    })].sort()).toEqual(['Combat', 'Fighter']);

    expect([...declaredTop({
      alias: '~app',
      layers: [{ name: 'hooks', does: 'state' }, { name: 'services', does: 'io' }],
    })].sort()).toEqual(['hooks', 'services']);
  });

  it('answers nothing for an explicitly empty module list', () => {
    // `[]` is not `undefined`: a config that declares no modules governs no top
    // folder, and falling back to the layer names there would govern every one
    // of them. `moduleDepth` reads the same field the same way.
    expect([...declaredTop({
      alias: '~app',
      modules: [],
      layers: [{ name: 'hooks', does: 'state' }],
    })]).toEqual([]);
  });
});

describe('buildModuleGraph · a folder `modules` does not name is not in the graph', () => {
  const modular: ArchitectureDef = {
    alias: '~app',
    modules: [
      { name: 'Fighter', does: 'the ship', imports: ['Combat'] },
      { name: 'Combat', does: 'bullets' },
      { name: 'app', does: 'routing', layers: false },
    ],
    layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
  };

  const flat: ArchitectureDef = {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state', layout: 'folder' },
      { name: 'services', does: 'io', layout: 'folder' },
    ],
  };

  const mk = (segments: string[], specifiers: string[] = []): ScannedFile => ({
    path: `src/${segments.join('/')}`,
    segments,
    imports: specifiers.map((specifier) => ({ specifier, names: [], isExport: false })),
  });

  const graph = (architecture: ArchitectureDef, files: ScannedFile[]) => buildModuleGraph(
    { topDirs: [...new Set(files.map((entry) => entry.segments[0]))], files },
    architecture,
  );

  const nodes = (built: ModuleGraph) => [...built.modules].sort();

  const edgesOf = (built: ModuleGraph) =>
    [...built.edges].map(([from, to]) => [from, [...to].sort()] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));

  it('drops a unit whose top folder is undeclared, and keeps its declared twin', () => {
    // The same file at two addresses, which is the only way to see it: read
    // through a bare layer-name test both are nodes, because `hooks` is a
    // declared layer wherever it appears and the module list is never asked.
    expect(nodes(graph(modular, [
      mk(['Fighter', 'hooks', 'useA', 'index.ts']),
      mk(['scratch', 'hooks', 'useA', 'index.ts']),
    ]))).toEqual(['Fighter/hooks/useA']);
  });

  it('drops a file sitting at root depth in an undeclared folder', () => {
    // The second way in, and it needs no layer name at all: a file one level
    // below the source root passes a depth test that never asks whose root it
    // is. Paired with the declared root file, which IS a node and is the edge a
    // reader of this graph most wants.
    expect(nodes(graph(modular, [
      mk(['Fighter', 'index.ts']),
      mk(['scratch', 'index.ts']),
    ]))).toEqual(['Fighter']);
  });

  it('keeps a `layers: false` module whole, undeclared folders aside', () => {
    // The opt-out arm is built from the declared list, so it never admitted an
    // undeclared folder — asserted so that replacing three tests with one zone
    // lookup cannot quietly drop the module that imports everything.
    expect(nodes(graph(modular, [
      mk(['app', 'routes', 'Game.ts']),
      mk(['scratch', 'routes', 'Game.ts']),
    ]))).toEqual(['app']);
  });

  it('leaves a flat project\'s nodes where they were', () => {
    // Flat never had the node-side hole: the layer test IS the top-level test
    // when the layer is the top folder. Pinned because the zone lookup now
    // answers for both shapes and a modular-only reading would change this.
    expect(nodes(graph(flat, [
      mk(['hooks', 'useA', 'index.ts']),
      mk(['scratch', 'hooks', 'thing.ts']),
    ]))).toEqual(['hooks/useA']);
  });

  it('reports no cycle-forming edges inside an undeclared folder', () => {
    // The ticket's tree: two units under an ungoverned folder importing each
    // other. Admitted, they are a knot `inspect` reports as an error three
    // lines under `undeclared-module` saying nothing governs them.
    expect(edgesOf(graph(modular, [
      mk(['scratch', 'hooks', 'useA', 'index.ts'], ['../useB']),
      mk(['scratch', 'hooks', 'useB', 'index.ts'], ['../useA']),
    ]))).toEqual([]);
  });
});

describe('buildModuleGraph · an edge into an undeclared folder is not an edge', () => {
  const modular: ArchitectureDef = {
    alias: '~app',
    modules: [
      { name: 'Fighter', does: 'the ship', imports: ['Combat'] },
      { name: 'Combat', does: 'bullets' },
    ],
    layers: [{ name: 'hooks', does: 'state', layout: 'folder' }],
  };

  const flat: ArchitectureDef = {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state', layout: 'folder' },
      { name: 'services', does: 'io', layout: 'folder' },
    ],
  };

  const mk = (segments: string[], specifiers: string[] = []): ScannedFile => ({
    path: `src/${segments.join('/')}`,
    segments,
    imports: specifiers.map((specifier) => ({ specifier, names: [], isExport: false })),
  });

  const targetsOf = (architecture: ArchitectureDef, file: ScannedFile) =>
    [...buildModuleGraph({ topDirs: [file.segments[0]], files: [file] }, architecture).edges]
      .flatMap(([, to]) => [...to]).sort();

  it('drops all three spellings that reach one, under `modules`', () => {
    // Three arms, three readings, and the node test above sees none of them:
    // the relative arm asks no declared name at all, and the module-entry arm
    // answers from the offset alone. The declared control rides along, or a
    // graph that dropped every edge would pass this.
    expect(targetsOf(modular, mk(['Fighter', 'hooks', 'useAim', 'index.ts'], [
      '../../../scratch/hooks/useA',
      '~app/scratch/hooks/useA',
      '~app/scratch',
      '~app/Combat',
    ]))).toEqual(['Combat']);
  });

  it('drops the relative spelling on a flat project, where the alias one was already null', () => {
    // The half that made this look flat-safe: `~app/scratch/deep/thing` reaches
    // no declared layer at offset 0 and has answered null since it was written,
    // so measuring with the alias alone reproduces nothing. The relative arm
    // runs no such test, and it is the spelling an editor writes.
    expect(targetsOf(flat, mk(['hooks', 'useA', 'index.ts'], [
      '../../scratch/deep/thing',
      '~app/scratch/deep/thing',
      '~app/services/api',
    ]))).toEqual(['services/api']);
  });
});

describe('buildFolderGraph', () => {
  const arch184 = { alias: '~app', layers: [{ name: 'hooks', does: '' }] };

  const scanOf184 = (topDirs: string[], files: ScannedFile[]) => ({ topDirs, files });

  const mk = (segments: string[], specifiers: string[] = []): ScannedFile => ({
    path: `src/${segments.join('/')}`,
    segments,
    imports: specifiers.map((specifier) => ({ specifier, names: [], isExport: false })),
  });

  const edgesOf = (graph: { edges: Map<string, Set<string>> }) =>
    [...graph.edges].map(([from, to]) => [from, [...to].sort()] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));

  it('reads an undeclared folder\'s edges, which is the whole point', () => {
    const graph = buildFolderGraph(
      scanOf184(['Achievements', 'Session'], [
        mk(['Achievements', 'hooks', 'a', 'index.ts'], ['~app/Session']),
      ]),
      arch184 as never,
    );

    expect(edgesOf(graph)).toEqual([['Achievements', ['Session']]]);
  });

  it('keeps src-root files out — an edge from one names a folder that is not there', () => {
    const graph = buildFolderGraph(
      scanOf184(['Session'], [mk(['main.ts'], ['~app/Session'])]),
      arch184 as never,
    );

    expect(edgesOf(graph)).toEqual([]);
  });

  it('reads a file sitting directly in a folder', () => {
    // Depth two, not three: a module whose only file is its entry still has
    // edges, and they are usually the ones that matter most.
    const graph = buildFolderGraph(
      scanOf184(['Achievements', 'Session'], [
        mk(['Achievements', 'index.ts'], ['~app/Session']),
      ]),
      arch184 as never,
    );

    expect(edgesOf(graph)).toEqual([['Achievements', ['Session']]]);
  });

  it('records no self-edge, and nothing for a target outside every folder', () => {
    const graph = buildFolderGraph(
      scanOf184(['Achievements'], [
        mk(['Achievements', 'hooks', 'a', 'index.ts'], [
          '~app/Achievements/hooks/b',
          '~app/Nowhere',
          '~app',
          'react',
        ]),
      ]),
      arch184 as never,
    );

    // A folder importing itself is not an edge; a folder nobody has is not a
    // target; and the alias root is neither.
    expect(edgesOf(graph)).toEqual([]);
  });
});
