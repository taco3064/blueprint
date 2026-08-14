import { describe, expect, it } from 'vitest';
import { layoutResolver } from '../boundary';
import type { ArchitectureDef } from '../config';
import { buildFolderGraph, targetModuleKey } from './resolve';
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
