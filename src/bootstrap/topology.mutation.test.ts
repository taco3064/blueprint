import { describe, expect, it } from 'vitest';

import type { SurveyResult } from '../survey';
import { decideTopology, observeTopology } from './topology';
import type { TopologyObservation } from './topology';

function survey(overrides: Partial<SurveyResult> = {}): SurveyResult {
  return {
    framework: 'react',
    typescript: true,
    packageManager: 'npm',
    sourceRoot: 'src',
    aliases: {},
    rootFiles: [],
    folders: [],
    repeatedFolderShapes: [],
    edges: [],
    selfAliasImports: {},
    testEvidence: [],
    packageUsage: [],
    ownableImports: [],
    unresolved: [],
    totalFiles: 4,
    ...overrides,
  };
}

function folder(name: string, children: string[] = [], files = 2) {
  return {
    folder: name,
    files,
    directFiles: children.length ? 0 : files,
    childFolders: children.length,
    children,
    indexedChildren: 0,
    maxDepth: children.length ? 2 : 1,
  };
}

const unknown = (
  uncertainty: TopologyObservation['uncertainty'],
): TopologyObservation => ({
  current: null,
  source: 'not-provable',
  selectedApplication: 'workspace/app',
  uncertainty,
});

describe('topology observation evidence boundaries', () => {
  it('preserves empty-tree source roots and uncertainty exactly', () => {
    expect(observeTopology(null, survey({
      totalFiles: 0,
      sourceRoot: 'workspace/app/src',
    }))).toEqual({
      current: null,
      source: 'not-provable',
      selectedApplication: 'workspace/app/src',
      uncertainty: 'empty',
    });

    expect(observeTopology(null, survey({ totalFiles: 0, sourceRoot: undefined }))).toEqual({
      current: null,
      source: 'not-provable',
      selectedApplication: 'src',
      uncertainty: 'empty',
    });
  });

  it('requires positive files for the strong direct layer axis', () => {
    expect(observeTopology(null, survey({
      folders: [folder('pages', [], 0), folder('components')],
    }))).toEqual({
      current: null,
      source: 'not-provable',
      selectedApplication: 'src',
      uncertainty: 'insufficient',
    });
  });

  it('defaults the source root for nonempty insufficient evidence', () => {
    expect(observeTopology(null, survey({ sourceRoot: undefined }))).toEqual({
      current: null,
      source: 'not-provable',
      selectedApplication: 'src',
      uncertainty: 'insufficient',
    });
  });

  it.each([
    ['zero files', [folder('auth', ['hooks'], 0), folder('shop', ['hooks'])]],
    ['reserved app', [folder('app', ['hooks']), folder('shop', ['hooks'])]],
    ['recognized root', [folder('pages', ['hooks']), folder('shop', ['hooks'])]],
    ['no recognized child', [folder('auth', ['internal']), folder('shop', ['internal'])]],
  ])('rejects a repeated module axis with %s', (_label, folders) => {
    const instances = folders.map(({ folder: name }) => name);

    const result = observeTopology(null, survey({
      folders,
      repeatedFolderShapes: [{
        parent: 'src',
        instances,
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    }));

    expect(result.current).toBeNull();
  });

  it.each([
    ['wrong parent', { parent: 'workspace', instances: ['auth', 'shop'], child: 'hooks' }],
    ['one candidate', { parent: 'src', instances: ['auth'], child: 'hooks' }],
    [
      'unknown repeated child',
      { parent: 'src', instances: ['auth', 'shop'], child: 'internal' },
    ],
  ])('rejects repeated shape evidence with %s', (_label, evidence) => {
    const result = observeTopology(null, survey({
      folders: [folder('auth', ['hooks']), folder('shop', ['hooks'])],
      repeatedFolderShapes: [{
        parent: evidence.parent,
        instances: evidence.instances,
        repeatedChildren: [{ folder: evidence.child, presentIn: 2, instanceCount: 2 }],
      }],
    }));

    expect(result.current).toBeNull();
  });
});

describe('topology positive module evidence', () => {
  it('uses the default source root for valid repeated module evidence', () => {
    expect(observeTopology(null, survey({
      sourceRoot: undefined,
      folders: [folder('auth', ['hooks']), folder('shop', ['hooks'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'shop'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    }))).toEqual({
      current: 'module-first',
      source: 'classified',
      selectedApplication: 'src',
    });
  });

  it('accepts any recognized repeated child among unrelated children', () => {
    expect(observeTopology(null, survey({
      folders: [folder('auth', ['hooks']), folder('shop', ['hooks'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['auth', 'shop'],
        repeatedChildren: [
          { folder: 'internal', presentIn: 2, instanceCount: 2 },
          { folder: 'hooks', presentIn: 2, instanceCount: 2 },
        ],
      }],
    }))).toMatchObject({ current: 'module-first', source: 'classified' });
  });

  it('keeps Next lib roots out of module candidates', () => {
    expect(observeTopology(null, survey({
      folders: [folder('lib', ['hooks']), folder('shop', ['hooks'])],
      repeatedFolderShapes: [{
        parent: 'src',
        instances: ['lib', 'shop'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }],
      }],
    })).current).toBeNull();
  });

  it('accepts a module candidate with mixed recognized and unknown children', () => {
    expect(observeTopology(null, survey({
      folders: [folder('auth', ['internal', 'hooks']), folder('shop', ['services'])],
      edges: [{ from: 'auth', to: 'shop', count: 1 }],
    }))).toMatchObject({ current: 'module-first', source: 'classified' });
  });
});

describe('topology import-axis boundaries', () => {
  const moduleFolders = [folder('auth', ['hooks']), folder('shop', ['services'])];

  it.each([
    ['one candidate', [folder('auth', ['hooks'])], { from: 'auth', to: 'auth', count: 1 }],
    ['self edge', moduleFolders, { from: 'auth', to: 'auth', count: 1 }],
    ['unknown source', moduleFolders, { from: 'other', to: 'shop', count: 1 }],
    ['unknown target', moduleFolders, { from: 'auth', to: 'other', count: 1 }],
  ])('rejects import evidence with %s', (_label, folders, edge) => {
    expect(observeTopology(null, survey({ folders, edges: [edge] })).current).toBeNull();
  });

  it('accepts a non-self edge between two candidates', () => {
    expect(observeTopology(null, survey({
      folders: moduleFolders,
      edges: [{ from: 'auth', to: 'shop', count: 1 }],
    }))).toMatchObject({ current: 'module-first', source: 'classified' });
  });
});

describe('topology decision evidence', () => {
  it('distinguishes delivered changes from undelivered ambiguous transformations', () => {
    const delivered = decideTopology({
      current: 'layer-first',
      source: 'classified',
      selectedApplication: 'src',
    }, { topology: 'module-first' });

    expect(delivered).toEqual({
      current: 'layer-first',
      source: 'classified',
      selectedApplication: 'src',
      target: 'module-first',
      operation: 'transformation-required',
      path: 'transformation',
    });

    const undelivered = decideTopology(unknown('mixed'), { topology: 'module-first' });

    expect(undelivered).toEqual({
      ...unknown('mixed'),
      target: 'module-first',
      operation: 'transformation-required',
      path: null,
      reason: expect.stringContaining('an unclassified existing tree'),
    });
  });

  it('keeps scope and generic abort guidance distinct', () => {
    expect(decideTopology(unknown('scope')).reason)
      .toContain('multiple application scopes');

    expect(decideTopology(unknown('scope')).reason)
      .toContain('--source-root <application>/src');

    expect(decideTopology(unknown('insufficient')).reason)
      .toContain('blueprint init --topology layer-first');

    expect(decideTopology(unknown('insufficient')).reason)
      .toContain('blueprint init --topology module-first');
  });
});
