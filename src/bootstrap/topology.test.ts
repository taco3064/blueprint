import { describe, expect, it } from 'vitest';

import { reactPreset } from '../presets';
import type { SurveyResult } from '../survey';
import { decideTopology, observeTopology } from './topology';
import type { ArchitectureTopology, TopologyObservation } from './topology';

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

function unconfigured(
  repository: ArchitectureTopology | null = null,
  uncertainty: TopologyObservation['uncertainty'] = 'unmanaged',
): TopologyObservation {
  return {
    current: null,
    repository,
    source: repository ? 'repository' : 'none',
    selectedApplication: uncertainty === 'scope' ? null : 'src',
    uncertainty,
  };
}

describe('observeTopology', () => {
  it('treats a missing config and missing survey as unmanaged', () => {
    expect(observeTopology(null, null)).toEqual({
      current: null,
      repository: null,
      source: 'none',
      selectedApplication: null,
      uncertainty: 'unmanaged',
    });
  });

  it('uses a local configured topology when no repository authority is supplied', () => {
    const layerFirst = reactPreset().architecture;

    expect(observeTopology(layerFirst, survey())).toMatchObject({
      current: 'layer-first',
      repository: 'layer-first',
      source: 'configured',
    });
  });

  it('defaults an unmanaged survey without a source root to src', () => {
    expect(observeTopology(null, survey({ sourceRoot: undefined }))).toMatchObject({
      selectedApplication: 'src',
      uncertainty: 'unmanaged',
    });
  });

  it('uses a local config as authority over repository and source evidence', () => {
    const layerFirst = reactPreset().architecture;

    expect(observeTopology(layerFirst, survey(), 'layer-first')).toEqual({
      current: 'layer-first',
      repository: 'layer-first',
      source: 'configured',
      selectedApplication: 'src',
    });
  });

  it('never promotes unmanaged source-tree shapes into current topology', () => {
    const shapes: Partial<SurveyResult>[] = [
      { folders: [{ folder: 'pages', files: 2, directFiles: 2, childFolders: 0,
        children: [], indexedChildren: 0, maxDepth: 1 }] },
      { folders: [{ folder: 'auth', files: 2, directFiles: 0, childFolders: 1,
        children: ['hooks'], indexedChildren: 0, maxDepth: 2 }] },
      { edges: [{ from: 'auth', to: 'checkout', count: 1 }] },
      { repeatedFolderShapes: [{ parent: 'src', instances: ['auth', 'checkout'],
        repeatedChildren: [{ folder: 'hooks', presentIn: 2, instanceCount: 2 }] }] },
    ];

    for (const shape of shapes) {
      expect(observeTopology(null, survey(shape))).toMatchObject({
        current: null,
        repository: null,
        source: 'none',
        uncertainty: 'unmanaged',
      });
    }
  });

  it('preserves application scope and empty-tree evidence without assigning topology', () => {
    expect(observeTopology(null, survey({ scopeRequired: true }), 'layer-first')).toEqual({
      current: null,
      repository: 'layer-first',
      source: 'repository',
      selectedApplication: null,
      uncertainty: 'scope',
    });

    expect(observeTopology(null, survey({ totalFiles: 0, sourceRoot: undefined }))).toEqual({
      current: null,
      repository: null,
      source: 'none',
      selectedApplication: 'src',
      uncertainty: 'empty',
    });
  });
});

describe('decideTopology', () => {
  it('requires an explicit target when no repository authority exists', () => {
    expect(decideTopology(unconfigured())).toMatchObject({ operation: 'abort', path: null });

    expect(decideTopology(unconfigured(), { preset: true }))
      .toMatchObject({ operation: 'abort', path: null });

    expect(decideTopology(unconfigured(), { topology: 'layer-first' }))
      .toMatchObject({ operation: 'adopt', target: 'layer-first', path: 'scaffold' });

    expect(decideTopology(unconfigured(), { topology: 'module-first' }))
      .toMatchObject({ operation: 'adopt', target: 'module-first', path: 'authoring' });

    expect(decideTopology(unconfigured(null, 'empty'), { topology: 'layer-first' }))
      .toMatchObject({ operation: 'initialize' });
  });

  it('inherits the repository target for an unconfigured sibling', () => {
    expect(decideTopology(unconfigured('layer-first'))).toMatchObject({
      operation: 'adopt', target: 'layer-first', path: 'scaffold',
    });

    expect(decideTopology(unconfigured('module-first'))).toMatchObject({
      operation: 'adopt', target: 'module-first', path: 'authoring',
    });

    expect(decideTopology(unconfigured('layer-first'), { preset: true })).toMatchObject({
      operation: 'adopt', target: 'layer-first', path: 'scaffold',
    });
  });

  it('rejects an opposite sibling target and repository module-first preset', () => {
    expect(decideTopology(unconfigured('layer-first'), { topology: 'module-first' }))
      .toMatchObject({ operation: 'abort', path: null, target: 'module-first' });

    expect(decideTopology(unconfigured('module-first'), { preset: true }))
      .toMatchObject({ operation: 'abort', path: null, target: 'module-first' });
  });

  it('repairs configured topology and transforms only an authoritative opposite topology', () => {
    const configured: TopologyObservation = {
      current: 'layer-first',
      repository: 'layer-first',
      source: 'configured',
      selectedApplication: 'src',
    };

    expect(decideTopology(configured)).toMatchObject({
      operation: 'repair', target: 'layer-first', path: 'scaffold',
    });

    expect(decideTopology(configured, { topology: 'module-first' })).toMatchObject({
      operation: 'transformation-required', target: 'module-first', path: 'transformation',
    });
  });

  it('rejects preset for every configured application and module-first selection', () => {
    for (const current of ['layer-first', 'module-first'] as const) {
      expect(decideTopology({
        current,
        repository: current,
        source: 'configured',
        selectedApplication: 'src',
      }, { preset: true })).toMatchObject({ operation: 'abort', path: null });
    }

    expect(decideTopology(unconfigured(), {
      topology: 'module-first', preset: true,
    })).toMatchObject({ operation: 'abort', path: null });
  });

  it('keeps unresolved application selection ahead of topology choice', () => {
    expect(decideTopology(unconfigured('layer-first', 'scope'), {
      topology: 'layer-first',
    })).toMatchObject({ operation: 'abort', path: null });
  });
});
